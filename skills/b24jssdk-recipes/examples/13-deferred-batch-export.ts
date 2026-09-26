/**
 * Recipe 13 — Bulk export with a deferred (background) batch
 *
 * Exports thousands of tasks in ONE background job instead of one request per
 * 50 commands, and writes them to a JSON Lines file:
 *   1. Builds one `tasks.task.list` command per page of 50. List pages, not a
 *      `tasks.task.get` per id: one failing command — a get of a missing id —
 *      fails the whole job with no result file (measured, #570), while a page
 *      past the end is simply empty.
 *   2. `actions.v3.deferredBatch.make` — adds the job, reports its status as it
 *      goes (pending → processing → done), downloads and decodes the result
 *      file, deletes the job
 *   3. Writes one line per task
 *
 * The second mode shows the single steps, for a job started in one run and
 * collected in another (a cron that starts it, a later cron that collects it).
 *
 * Needs a portal plan with deferred batches; on other plans every call answers
 * FEATURE_NOT_AVAILABLE_ON_CURRENT_PLAN, and `actions.v3.batchByChunk` is the
 * fallback.
 *
 * Run:
 *   B24_HOOK=https://your.bitrix24.com/rest/1/secret \
 *   npx tsx 13-deferred-batch-export.ts run 100            # 100 pages of 50 tasks, all in one go
 *
 *   ... 13-deferred-batch-export.ts start 100 <runId>      # prints the job id
 *                                                          # runId: your scheduler's run id,
 *                                                          # the same on a retry of that run
 *   ... 13-deferred-batch-export.ts collect <jobId>         # waits, writes, deletes
 */

import { writeFile } from 'node:fs/promises'
import {
  B24Hook,
  ConsoleV2Handler,
  LogLevel,
  Logger,
  type BatchCommandsArrayUniversal,
  type DeferredBatchJob,
  type TypeB24
} from '@bitrix24/b24jssdk'

const logger = Logger.create('DeferredExport')
logger.pushHandler(new ConsoleV2Handler(LogLevel.INFO, { useStyles: false }))

interface TaskPage {
  items: Array<{ id: number, title: string, status: string }>
}

const PAGE_SIZE = 50

function bootB24(): TypeB24 {
  const url = process.env.B24_HOOK
  if (!url) throw new Error('B24_HOOK env var is required')
  const $b24 = B24Hook.fromWebhookUrl(url)
  return $b24
}

function commandsFor(pages: number): BatchCommandsArrayUniversal {
  const calls: BatchCommandsArrayUniversal = []
  for (let page = 1; page <= pages; page++) {
    calls.push(['tasks.task.list', {
      select: ['id', 'title', 'status'],
      order: { id: 'ASC' },
      pagination: { page, limit: PAGE_SIZE }
    }])
  }
  return calls
}

function reportStatus(job: DeferredBatchJob): void {
  logger.info(`job #${job.id}: ${job.status}`).catch(() => {})
}

async function writeRows(pages: TaskPage[], file: string): Promise<number> {
  const lines = pages.flatMap(page => page.items.map(task => JSON.stringify(task)))
  await writeFile(file, lines.join('\n') + '\n')
  return lines.length
}

/** Everything in one call. */
async function run($b24: TypeB24, pages: number): Promise<void> {
  const response = await $b24.actions.v3.deferredBatch.make<TaskPage>({
    calls: commandsFor(pages),
    pollInterval: 2_000,
    timeout: 20 * 60_000,
    onStatus: reportStatus
  })
  if (!response.isSuccess) {
    throw new Error(response.getErrorMessages().join('; '))
  }
  const written = await writeRows(response.getData()!, 'tasks.jsonl')
  logger.info(`${written} tasks from ${pages} pages written to tasks.jsonl`).catch(() => {})
}

/** Step 1 of 2: start the job and print its id. */
async function start($b24: TypeB24, pages: number, runId: string): Promise<void> {
  const added = await $b24.actions.v3.deferredBatch.add({
    calls: commandsFor(pages),
    // One key per run, from the scheduler's run id: a retry of the same run
    // sends the same key, any other run a new one. (The portal's idempotency
    // contract; not measured for deferred batches.)
    idempotencyKey: `tasks-export-${pages}-${runId}`
  })
  if (!added.isSuccess) {
    throw new Error(added.getErrorMessages().join('; '))
  }
  logger.info(`started job #${added.getData()!.id}`).catch(() => {})
}

/** Step 2 of 2: wait for the job, write its rows, delete it. */
async function collect($b24: TypeB24, jobId: number): Promise<void> {
  const batch = $b24.actions.v3.deferredBatch

  const finished = await batch.waitFor(jobId, { pollInterval: 5_000, onStatus: reportStatus })
  if (!finished.isSuccess) {
    const reason = finished.getData()?.errorMessage ?? finished.getErrorMessages().join('; ')
    throw new Error(`job #${jobId} did not finish: ${reason}`)
  }

  const rows = await batch.download<TaskPage>(jobId)
  if (!rows.isSuccess) {
    throw new Error(rows.getErrorMessages().join('; '))
  }
  const written = await writeRows(rows.getData()!, `tasks-${jobId}.jsonl`)
  logger.info(`${written} tasks written to tasks-${jobId}.jsonl`).catch(() => {})

  await batch.delete(jobId)
}

async function main(): Promise<void> {
  const [mode, a, runId] = process.argv.slice(2)
  const $b24 = bootB24()
  try {
    if (mode === 'run') await run($b24, Number(a ?? 10))
    else if (mode === 'start') await start($b24, Number(a ?? 10), runId ?? new Date().toISOString())
    else if (mode === 'collect') await collect($b24, Number(a))
    else throw new Error('usage: run <pages> | start <pages> [runId] | collect <jobId>')
  } finally {
    $b24.destroy()
  }
}

main().catch((e: unknown) => {
  // Raw console.error so structured-logger formatting can't hide the trace.
  console.error('\n[recipe failed]', e instanceof Error ? `${e.name}: ${e.message}` : String(e))
  if (e instanceof Error && e.stack) console.error(e.stack)
  process.exit(1)
})

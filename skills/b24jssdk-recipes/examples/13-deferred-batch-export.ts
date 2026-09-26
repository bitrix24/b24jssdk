/**
 * Recipe 13 — Bulk export with a deferred (background) batch
 *
 * Reads thousands of tasks by id in ONE background job instead of one request
 * per 50 commands, and writes them to a JSON Lines file:
 *   1. Builds one `tasks.task.get` command per id
 *   2. `actions.v3.deferredBatch.make` — adds the job, reports its status as it
 *      goes (e.g. pending → done), downloads and decodes the result
 *      file, deletes the job
 *   3. Writes one line per task that was found
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
 *   npx tsx 13-deferred-batch-export.ts run 1 5000        # ids 1..5000, all in one go
 *
 *   ... 13-deferred-batch-export.ts start 1 5000 <runId>   # prints the job id
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

interface TaskRow {
  item?: { id: number, title: string, status: string }
}

function bootB24(): TypeB24 {
  const url = process.env.B24_HOOK
  if (!url) throw new Error('B24_HOOK env var is required')
  const $b24 = B24Hook.fromWebhookUrl(url)
  return $b24
}

function commandsFor(from: number, to: number): BatchCommandsArrayUniversal {
  const calls: BatchCommandsArrayUniversal = []
  for (let id = from; id <= to; id++) {
    calls.push(['tasks.task.get', { id, select: ['id', 'title', 'status'] }])
  }
  return calls
}

function reportStatus(job: DeferredBatchJob): void {
  logger.info(`job #${job.id}: ${job.status}`).catch(() => {})
}

async function writeRows(rows: TaskRow[], file: string): Promise<number> {
  // Keep only rows that carry a task. How the portal reports a command that
  // failed (a task that does not exist) is not measured yet, so do not assume.
  const found = rows.flatMap(row => row.item ? [JSON.stringify(row.item)] : [])
  await writeFile(file, found.join('\n') + '\n')
  return found.length
}

/** Everything in one call. */
async function run($b24: TypeB24, from: number, to: number): Promise<void> {
  const response = await $b24.actions.v3.deferredBatch.make<TaskRow>({
    calls: commandsFor(from, to),
    pollInterval: 2_000,
    timeout: 20 * 60_000,
    onStatus: reportStatus
  })
  if (!response.isSuccess) {
    throw new Error(response.getErrorMessages().join('; '))
  }
  const written = await writeRows(response.getData()!, 'tasks.jsonl')
  logger.info(`${written} of ${to - from + 1} tasks written to tasks.jsonl`).catch(() => {})
}

/** Step 1 of 2: start the job and print its id. */
async function start($b24: TypeB24, from: number, to: number, runId: string): Promise<void> {
  const added = await $b24.actions.v3.deferredBatch.add({
    calls: commandsFor(from, to),
    // One key per run, from the scheduler's run id: a retry of the same run
    // sends the same key, any other run a new one. (The portal's idempotency
    // contract; not measured for deferred batches.)
    idempotencyKey: `tasks-export-${from}-${to}-${runId}`
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

  const rows = await batch.download<TaskRow>(jobId)
  if (!rows.isSuccess) {
    throw new Error(rows.getErrorMessages().join('; '))
  }
  const written = await writeRows(rows.getData()!, `tasks-${jobId}.jsonl`)
  logger.info(`${written} tasks written to tasks-${jobId}.jsonl`).catch(() => {})

  await batch.delete(jobId)
}

async function main(): Promise<void> {
  const [mode, a, b, runId] = process.argv.slice(2)
  const $b24 = bootB24()
  try {
    if (mode === 'run') await run($b24, Number(a ?? 1), Number(b ?? 100))
    else if (mode === 'start') await start($b24, Number(a ?? 1), Number(b ?? 100), runId ?? new Date().toISOString())
    else if (mode === 'collect') await collect($b24, Number(a))
    else throw new Error('usage: run <from> <to> | start <from> <to> [runId] | collect <jobId>')
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

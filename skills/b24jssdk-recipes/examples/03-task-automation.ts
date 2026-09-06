/**
 * Recipe 3 — Auto-create tasks on deal stage transitions
 *
 * Polls open deals every 60s. When a watched transition fires, creates a task
 * (tasks.task.add, v3) with description, deadline and priority. Stage state is
 * held in memory — restart loses it by design; persist for production.
 *
 * Run:
 *   B24_HOOK=https://your.bitrix24.com/rest/1/secret npx tsx 03-task-automation.ts
 */

import {
  B24Hook,
  EnumCrmEntityTypeId,
  ConsoleV2Handler,
  LogLevel,
  Logger,
  type TypeB24
} from '@bitrix24/b24jssdk'
import { baseStage } from '../lib/funnel'
import { toPortalDateTime } from '../lib/portal-datetime'

const logger = Logger.create('TaskAuto')
logger.pushHandler(new ConsoleV2Handler(LogLevel.INFO, { useStyles: false }))

function bootB24(): TypeB24 {
  const url = process.env.B24_HOOK
  if (!url) throw new Error('B24_HOOK env var is required')
  const $b24 = B24Hook.fromWebhookUrl(url)
  return $b24
}

/**
 * `priority` is a v3 enum, not the numeric v2 scale. Measured against a portal:
 * only `high` and `average` exist — `low`, `normal` and any number are accepted
 * without an error and stored as `average`, so a wrong value is silent.
 */
type TaskPriority = 'high' | 'average'

interface TaskTemplate {
  title: string
  description: string
  deadlineDays: number
  priority: TaskPriority
}

const STAGE_TASKS: Record<string, TaskTemplate> = {
  EXECUTING: {
    title: 'Prepare documents and start execution',
    description: 'Deal moved into execution. Prepare all paperwork and kick off delivery.',
    deadlineDays: 5,
    priority: 'high'
  },
  PREPAYMENT_INVOICE: {
    title: 'Send the invoice and chase payment',
    description: 'Issue the prepayment invoice and follow up until paid.',
    deadlineDays: 3,
    priority: 'high'
  },
  FINAL_INVOICE: {
    title: 'Final reconciliation and closing',
    description: 'Final stage of the deal. Prepare closing documents.',
    deadlineDays: 7,
    priority: 'average'
  }
}

interface DealRow {
  id: number
  title: string
  stageId: string
  assignedById: number
}

async function fetchOpenDeals($b24: TypeB24): Promise<DealRow[]> {
  const out: DealRow[] = []

  const generator = $b24.actions.v2.fetchList.make<DealRow>({
    method: 'crm.item.list',
    params: {
      entityTypeId: EnumCrmEntityTypeId.deal,
      filter: { '!stageId': ['WON', 'LOSE'] },
      select: ['id', 'title', 'stageId', 'assignedById']
    },
    idKey: 'id',
    customKeyForResult: 'items',
    requestId: 'open-deals'
  })

  for await (const chunk of generator) {
    for (const it of chunk) {
      const base = baseStage(it.stageId)
      // Multi-funnel safety net: filter above only excludes plain WON/LOSE.
      if (base === 'WON' || base === 'LOSE') continue
      out.push({
        id: Number(it.id),
        title: it.title,
        stageId: it.stageId,
        assignedById: Number(it.assignedById ?? 0)
      })
    }
  }
  return out
}

interface TasksTaskAddResponse {
  item: { id: number }
}

async function createTask($b24: TypeB24, deal: DealRow, t: TaskTemplate): Promise<number> {
  const deadline = new Date()
  deadline.setDate(deadline.getDate() + t.deadlineDays)

  // tasks.task.add is on v3: camelCase fields, and the created entity comes
  // back under `result.item`. Ask the portal itself with `tasks.task.field.list`
  // rather than translating the v2 names by eye.
  const responsibleId = deal.assignedById || 1
  const res = await $b24.actions.v3.call.make<TasksTaskAddResponse>({
    method: 'tasks.task.add',
    params: {
      fields: {
        title: `${t.title} — ${deal.title}`,
        description: `${t.description}\n\nDeal: ${deal.title} (ID: ${deal.id})`,
        // Both are required — a fields object without them fails validation.
        creatorId: responsibleId,
        responsibleId,
        priority: t.priority,
        deadline: toPortalDateTime(deadline),
        // The v2 `UF_CRM_TASK` field is `crmItemIds` on v3. The `D_<id>` value
        // shape carries over; a bare number or an object is accepted and then
        // silently dropped.
        crmItemIds: [`D_${deal.id}`]
      }
    },
    // Names this attempt in the logs. It does NOT deduplicate — for that,
    // `idempotencyKey` makes the retry of one operation write only once.
    requestId: `task-add-${deal.id}`,
    idempotencyKey: `stage-task-${deal.id}-${t.title}`
  })

  if (!res.isSuccess) throw new Error(res.getErrorMessages().join('; '))

  const id = Number(res.getData()!.result.item.id)
  logger.info(`  task #${id} created — ${t.title}`)
  return id
}

const dealStages = new Map<number, string>()

async function tick($b24: TypeB24) {
  logger.info(`[${new Date().toISOString()}] checking stage transitions…`)

  const deals = await fetchOpenDeals($b24)

  for (const d of deals) {
    const prev = dealStages.get(d.id)
    dealStages.set(d.id, d.stageId)

    if (prev && prev !== d.stageId) {
      logger.info(`  deal #${d.id} ${prev} → ${d.stageId}`)
      const tpl = STAGE_TASKS[baseStage(d.stageId)]
      if (tpl) await createTask($b24, d, tpl)
    }
  }

  const live = new Set(deals.map(d => d.id))
  for (const id of [...dealStages.keys()]) {
    if (!live.has(id)) dealStages.delete(id)
  }
}

async function main() {
  const $b24 = bootB24()
  logger.info(`Watched stages: ${Object.keys(STAGE_TASKS).join(', ')}`)

  // Seed: do not fire tasks for the initial state
  const seed = await fetchOpenDeals($b24)
  for (const d of seed) dealStages.set(d.id, d.stageId)
  logger.info(`Tracking ${seed.length} open deals`)

  // Overlap guard: if a tick takes longer than the interval (large portal,
  // slow API), a naked setInterval would launch a second tick in parallel —
  // two concurrent loops would race on the same `dealStages` Map. The flag
  // skips overlapping ticks and logs them.
  let tickRunning = false
  setInterval(() => {
    if (tickRunning) {
      logger.warning('previous tick still running, skipping this interval')
      return
    }
    tickRunning = true
    tick($b24)
      .catch((e: unknown) => logger.error(e instanceof Error ? e.message : String(e), {}))
      .finally(() => { tickRunning = false })
  }, 60_000)
}

main().catch((e: unknown) => {
  // Raw console.error so structured-logger formatting can't hide the trace.
  console.error('\n[recipe failed]', e instanceof Error ? `${e.name}: ${e.message}` : String(e))
  if (e instanceof Error && e.stack) console.error(e.stack)
  process.exit(1)
})

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
  LoggerBrowser,
  type TypeB24
} from '@bitrix24/b24jssdk'

const logger = LoggerBrowser.build('TaskAuto', true)

function bootB24(): TypeB24 {
  const url = process.env.B24_HOOK
  if (!url) throw new Error('B24_HOOK env var is required')
  const $b24 = B24Hook.fromWebhookUrl(url)
  $b24.offClientSideWarning?.()
  return $b24
}

interface TaskTemplate {
  title: string
  description: string
  deadlineDays: number
  priority: 0 | 1 | 2
}

const STAGE_TASKS: Record<string, TaskTemplate> = {
  EXECUTING: {
    title: 'Prepare documents and start execution',
    description: 'Deal moved into execution. Prepare all paperwork and kick off delivery.',
    deadlineDays: 5,
    priority: 2
  },
  PREPAYMENT_INVOICE: {
    title: 'Send the invoice and chase payment',
    description: 'Issue the prepayment invoice and follow up until paid.',
    deadlineDays: 3,
    priority: 2
  },
  FINAL_INVOICE: {
    title: 'Final reconciliation and closing',
    description: 'Final stage of the deal. Prepare closing documents.',
    deadlineDays: 7,
    priority: 1
  }
}

const baseStage = (s: string) => (s.includes(':') ? s.split(':')[1] : s)

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
  task: { id: number }
}

async function createTask($b24: TypeB24, deal: DealRow, t: TaskTemplate): Promise<number> {
  const deadline = new Date()
  deadline.setDate(deadline.getDate() + t.deadlineDays)

  // tasks.task.add is on the v3 whitelist.
  const res = await $b24.actions.v3.call.make<TasksTaskAddResponse>({
    method: 'tasks.task.add',
    params: {
      fields: {
        TITLE: `${t.title} — ${deal.title}`,
        DESCRIPTION: `${t.description}\n\nDeal: ${deal.title} (ID: ${deal.id})`,
        RESPONSIBLE_ID: deal.assignedById || 1,
        PRIORITY: t.priority,
        DEADLINE: deadline.toISOString(),
        UF_CRM_TASK: [`D_${deal.id}`]
      }
    },
    requestId: `task-add-${deal.id}`
  })

  if (!res.isSuccess) throw new Error(res.getErrorMessages().join('; '))

  const id = Number(res.getData()!.result.task.id)
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

  const live = new Set(deals.map((d) => d.id))
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

  setInterval(() => { tick($b24).catch((e) => logger.error(e)) }, 60_000)
}

main().catch((e) => { logger.error(e); process.exit(1) })

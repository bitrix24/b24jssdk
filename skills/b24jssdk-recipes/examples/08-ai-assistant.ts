/**
 * Recipe 8 — AI assistant: GPT-driven follow-up tasks for CRM deals
 *
 * Given a deal id, the script:
 *   1. Loads the deal (crm.item.get, v2)
 *   2. Loads the deal's activities (crm.activity.list, v2)
 *   3. Sends a structured prompt to GPT-4o
 *   4. Creates a follow-up task (tasks.task.add, v3) bound to the deal
 *
 * Install: pnpm add openai
 * Env:
 *   B24_HOOK=...
 *   OPENAI_API_KEY=...
 * Run:
 *   npx tsx 08-ai-assistant.ts <DEAL_ID>
 */

import {
  B24Hook,
  EnumCrmEntityTypeId,
  ConsoleV2Handler,
  LogLevel,
  Logger,
  type TypeB24
} from '@bitrix24/b24jssdk'
import OpenAI from 'openai'

const logger = Logger.create('AiAssistant')
logger.pushHandler(new ConsoleV2Handler(LogLevel.INFO, { useStyles: false }))

function bootB24(): TypeB24 {
  const url = process.env.B24_HOOK
  if (!url) throw new Error('B24_HOOK env var is required')
  const $b24 = B24Hook.fromWebhookUrl(url)
  $b24.offClientSideWarning()
  return $b24
}

interface DealItem {
  id: number
  title: string
  stageId: string
  opportunity: number
  currencyId: string
  createdTime: string
  assignedById: number
}

interface ActivityItem {
  ID: number
  SUBJECT: string
  DESCRIPTION: string
  TYPE_ID: string
  CREATED: string
  COMPLETED: 'Y' | 'N'
}

interface Recommendation {
  analysis: string
  nextAction: string
  taskTitle: string
  taskDescription: string
  priority: 'high' | 'medium' | 'low'
  deadlineDays: number
}

async function getDeal($b24: TypeB24, id: number): Promise<DealItem> {
  const res = await $b24.actions.v2.call.make<{ item: DealItem }>({
    method: 'crm.item.get',
    params: {
      entityTypeId: EnumCrmEntityTypeId.deal,
      id
    },
    requestId: `deal-${id}`
  })
  if (!res.isSuccess) throw new Error(res.getErrorMessages().join('; '))
  return res.getData()!.result.item
}

async function getDealActivities($b24: TypeB24, dealId: number): Promise<ActivityItem[]> {
  // crm.activity.list — classic API, uppercase fields. OWNER_TYPE_ID=2 = deal.
  const res = await $b24.actions.v2.callList.make<ActivityItem>({
    method: 'crm.activity.list',
    params: {
      filter: { OWNER_TYPE_ID: 2, OWNER_ID: dealId },
      select: ['ID', 'SUBJECT', 'DESCRIPTION', 'TYPE_ID', 'CREATED', 'COMPLETED']
    },
    idKey: 'ID', // classic uppercase id
    requestId: `activities-${dealId}`
  })

  if (!res.isSuccess) throw new Error(res.getErrorMessages().join('; '))
  return res.getData() ?? []
}

async function analyse(openai: OpenAI, deal: DealItem, activities: ActivityItem[]): Promise<Recommendation> {
  const activitiesText = activities
    .map(a => `- [${a.CREATED}] ${a.SUBJECT} (${a.COMPLETED === 'Y' ? 'done' : 'open'})`)
    .join('\n') || 'No activities yet'

  const prompt = `You are an experienced sales manager. Analyse the deal and suggest the next action.

Deal:
- Title: ${deal.title}
- Stage: ${deal.stageId}
- Amount: ${deal.opportunity} ${deal.currencyId}
- Created: ${deal.createdTime}

Activities:
${activitiesText}

Reply as JSON:
{
  "analysis": "2-3 sentences summarising current state",
  "nextAction": "concrete next action",
  "taskTitle": "task title for the manager",
  "taskDescription": "detailed task description",
  "priority": "high|medium|low",
  "deadlineDays": 1-14
}`

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.3
  })

  // Defensive parse: `response_format: 'json_object'` is a request, not a
  // contract — content may be null (rate-limit trims, content filter), or
  // a string that doesn't parse as JSON. Failing with a useful snippet is
  // better than a bare SyntaxError.
  const raw = completion.choices[0]?.message?.content ?? ''
  if (!raw) throw new Error('GPT returned empty content (likely rate-limit or content filter)')
  try {
    return JSON.parse(raw) as Recommendation
  } catch (e) {
    throw new Error(`GPT returned invalid JSON (${(e as Error).message}): ${raw.slice(0, 200)}`)
  }
}

async function createTask($b24: TypeB24, r: Recommendation, deal: DealItem): Promise<number> {
  const deadline = new Date()
  deadline.setDate(deadline.getDate() + Math.max(1, r.deadlineDays))
  const priorityMap = { high: 2, medium: 1, low: 0 } as const

  // tasks.task.add is called on v3 (camelCase fields, result.item).
  const res = await $b24.actions.v3.call.make<{ task: { id: number } }>({
    method: 'tasks.task.add',
    params: {
      fields: {
        TITLE: `[AI] ${r.taskTitle}`,
        DESCRIPTION: [
          r.taskDescription,
          '',
          '---',
          `AI analysis: ${r.analysis}`,
          `Deal: ${deal.title} (ID: ${deal.id})`
        ].join('\n'),
        RESPONSIBLE_ID: Number(deal.assignedById ?? 1),
        PRIORITY: priorityMap[r.priority],
        DEADLINE: deadline.toISOString(),
        UF_CRM_TASK: [`D_${deal.id}`]
      }
    },
    requestId: `task-add-${deal.id}`
  })
  if (!res.isSuccess) throw new Error(res.getErrorMessages().join('; '))
  return Number(res.getData()!.result.task.id)
}

async function main() {
  const dealId = Number(process.argv[2])
  if (!dealId) {
    console.log('Usage: tsx 08-ai-assistant.ts <DEAL_ID>')
    process.exit(1)
  }

  const $b24 = bootB24()
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  logger.info(`Loading deal #${dealId}…`)
  const deal = await getDeal($b24, dealId)
  logger.info(`  ${deal.title} | stage=${deal.stageId} | amount=${deal.opportunity}`)

  logger.info('Loading activities…')
  const activities = await getDealActivities($b24, dealId)
  logger.info(`  ${activities.length} activities`)

  logger.info('Asking GPT…')
  const rec = await analyse(openai, deal, activities)
  logger.info(`  ${rec.priority.toUpperCase()}: ${rec.nextAction}`)

  logger.info('Creating task…')
  const taskId = await createTask($b24, rec, deal)
  logger.info(`Task #${taskId} created.`)
}

main().catch((e: unknown) => {
  // Raw console.error so structured-logger formatting can't hide the trace.
  console.error('\n[recipe failed]', e instanceof Error ? `${e.name}: ${e.message}` : String(e))
  if (e instanceof Error && e.stack) console.error(e.stack)
  process.exit(1)
})

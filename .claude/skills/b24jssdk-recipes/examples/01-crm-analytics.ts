/**
 * Recipe 1 — CRM analytics: sales funnel
 *
 * Streams all deals through actions.v2.fetchList.make, groups by stage,
 * prints a funnel report (counts, conversion %, avg ticket, win rate).
 * No external libs — memory bounded even on 100k+ deal portals.
 *
 * Run:
 *   B24_HOOK=https://your.bitrix24.com/rest/1/secret npx tsx 01-crm-analytics.ts
 */

import {
  B24Hook,
  ConsoleV2Handler,
  EnumCrmEntityTypeId,
  LogLevel,
  Logger,
  type TypeB24
} from '@bitrix24/b24jssdk'

// New SDK Logger (not the @deprecated LoggerBrowser). pushHandler attaches a
// console sink at INFO level. See /docs/working-with-the-rest-api/logger/.
const logger = Logger.create('CrmAnalytics')
logger.pushHandler(new ConsoleV2Handler(LogLevel.INFO, { useStyles: false }))

function bootB24(): TypeB24 {
  const url = process.env.B24_HOOK
  if (!url) throw new Error('B24_HOOK env var is required')
  const $b24 = B24Hook.fromWebhookUrl(url)
  $b24.offClientSideWarning()
  return $b24
}

// Standard Bitrix24 stages. Multi-funnel portals prefix with `C<categoryId>:`,
// e.g. C2:WON. baseStage() strips that.
const STAGE_NAMES: Record<string, string> = {
  NEW: 'New',
  PREPARATION: 'Preparation',
  PREPAYMENT_INVOICE: 'Prepayment invoice',
  EXECUTING: 'Executing',
  FINAL_INVOICE: 'Final invoice',
  WON: 'Won',
  LOSE: 'Lost'
}

const baseStage = (s: string) => (s.includes(':') ? s.split(':')[1] : s)

interface DealRow {
  id: number
  stageId: string
  opportunity: number
  currencyId: string
}

async function loadAllDeals($b24: TypeB24): Promise<DealRow[]> {
  const out: DealRow[] = []
  // Log a heartbeat every N items so a long load on a large portal doesn't
  // look like a hang. Pure cosmetics: drop the `progressEvery` block on a
  // small portal where the runtime is sub-second.
  const progressEvery = 500
  let nextProgressAt = progressEvery
  const startedAt = Date.now()

  const generator = $b24.actions.v2.fetchList.make<DealRow>({
    method: 'crm.item.list',
    params: {
      entityTypeId: EnumCrmEntityTypeId.deal,
      select: ['id', 'stageId', 'opportunity', 'currencyId']
    },
    idKey: 'id',
    customKeyForResult: 'items',
    requestId: 'load-deals'
  })

  for await (const chunk of generator) {
    for (const it of chunk) {
      out.push({
        id: Number(it.id),
        stageId: it.stageId,
        opportunity: Number(it.opportunity ?? 0),
        currencyId: it.currencyId ?? 'RUB'
      })
    }
    if (out.length >= nextProgressAt) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
      logger.info(`  …${out.length} deals so far (${elapsed}s)`)
      nextProgressAt += progressEvery
    }
  }
  return out
}

interface StageStat { count: number; total: number }

function analyseFunnel(deals: DealRow[]): Map<string, StageStat> {
  const stages = new Map<string, StageStat>()
  for (const d of deals) {
    const s = stages.get(d.stageId) ?? { count: 0, total: 0 }
    s.count += 1
    s.total += d.opportunity
    stages.set(d.stageId, s)
  }
  return stages
}

function printFunnel(stages: Map<string, StageStat>, totalDeals: number) {
  const order = ['NEW', 'PREPARATION', 'PREPAYMENT_INVOICE', 'EXECUTING', 'FINAL_INVOICE', 'WON', 'LOSE']

  console.log('\n' + '='.repeat(65))
  console.log('  SALES FUNNEL')
  console.log('='.repeat(65))
  console.log(`  Total deals: ${totalDeals}\n`)
  console.log(`  ${'Stage'.padEnd(25)} ${'Count'.padStart(8)} ${'Conv %'.padStart(10)} ${'Avg ticket'.padStart(14)}`)
  console.log('  ' + '-'.repeat(58))

  for (const baseId of order) {
    let count = 0
    let total = 0
    for (const [sid, s] of stages) {
      if (baseStage(sid) === baseId) { count += s.count; total += s.total }
    }
    if (count === 0) continue

    const conversion = totalDeals > 0 ? (count / totalDeals) * 100 : 0
    const avg = count > 0 ? total / count : 0
    console.log(
      `  ${STAGE_NAMES[baseId].padEnd(25)} ${String(count).padStart(8)} ${conversion.toFixed(1).padStart(9)}% ${avg.toLocaleString('en-US', { maximumFractionDigits: 0 }).padStart(13)}`
    )
  }

  let won: StageStat = { count: 0, total: 0 }
  let lost: StageStat = { count: 0, total: 0 }
  for (const [sid, s] of stages) {
    const base = baseStage(sid)
    if (base === 'WON') { won.count += s.count; won.total += s.total }
    else if (base === 'LOSE') { lost.count += s.count; lost.total += s.total }
  }
  const closed = won.count + lost.count
  console.log('\n' + '-'.repeat(65))
  console.log(`  Total revenue (WON): ${won.total.toLocaleString('en-US', { maximumFractionDigits: 0 })}`)
  if (closed > 0) console.log(`  Win rate:            ${(won.count / closed * 100).toFixed(1)}%`)
  if (won.count > 0) console.log(`  Avg ticket (WON):    ${(won.total / won.count).toLocaleString('en-US', { maximumFractionDigits: 0 })}`)
  console.log('='.repeat(65))
}

async function main() {
  const $b24 = bootB24()
  logger.info('Loading deals…')
  const deals = await loadAllDeals($b24)
  logger.info(`Loaded ${deals.length} deals`)

  const stages = analyseFunnel(deals)
  printFunnel(stages, deals.length)
}

main().catch((e: unknown) => {
  // Raw console.error so structured-logger formatting can't hide the trace.
  console.error('\n[recipe failed]', e instanceof Error ? `${e.name}: ${e.message}` : String(e))
  if (e instanceof Error && e.stack) console.error(e.stack)
  process.exit(1)
})

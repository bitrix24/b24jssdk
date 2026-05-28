/**
 * Recipe 7 — Express server that processes Bitrix24 outbound events
 *
 * Bitrix24 outbound webhooks (registered via crm.event.bind, etc.) POST
 * application/x-www-form-urlencoded payloads to your URL. This server:
 *   - dispatches by event name
 *   - fetches full entity details via REST when needed
 *   - always returns 200 (Bitrix24 retries on non-2xx for up to 24h)
 *
 * Install: pnpm add express
 * Env:
 *   B24_HOOK=https://your.bitrix24.com/rest/1/secret
 *   B24_APPLICATION_TOKEN=...   (REQUIRED — from Bitrix24 dev console)
 *   PORT=3001 (default)
 * Run:
 *   npx tsx 07-webhook-handler.ts
 *
 * UNVERIFIED_ON_LIVE_PORTAL: the `data[FIELDS][ID]` parsing path through
 * `express.urlencoded({ extended: true })` was inferred from Bitrix24 docs
 * but not yet smoke-tested against a real outbound webhook. If `payload.data
 * .FIELDS.ID` arrives empty/undefined when you wire it up, check the raw
 * request body and adjust the parser. Tracked in REPORT.md.
 */

import {
  AjaxError,
  B24Hook,
  EnumCrmEntityTypeId,
  ConsoleV2Handler,
  LogLevel,
  Logger,
  type TypeB24
} from '@bitrix24/b24jssdk'
import express, { type Request, type Response } from 'express'
import { timingSafeEqual } from 'node:crypto'

const logger = Logger.create('Webhook')
logger.pushHandler(new ConsoleV2Handler(LogLevel.INFO, { useStyles: false }))

/**
 * Constant-time string compare. Use for any secret / token comparison so
 * an attacker can't recover the value by measuring response latency.
 * Returns false when lengths differ (does not leak length either).
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

function bootB24(): TypeB24 {
  const url = process.env.B24_HOOK
  if (!url) throw new Error('B24_HOOK env var is required')
  const $b24 = B24Hook.fromWebhookUrl(url)
  $b24.offClientSideWarning()
  return $b24
}

interface BitrixEventPayload {
  event: string
  data?: { FIELDS?: Record<string, string> }
  ts?: string
  auth?: Record<string, string>
}

interface DealItem {
  id: number
  title: string
  stageId: string
  opportunity: number
  currencyId: string
  assignedById: number
}

async function loadDeal($b24: TypeB24, dealId: number): Promise<DealItem> {
  const res = await $b24.actions.v2.call.make<{ item: DealItem }>({
    method: 'crm.item.get',
    params: {
      entityTypeId: EnumCrmEntityTypeId.deal,
      id: dealId
    },
    requestId: `deal-${dealId}`
  })
  if (!res.isSuccess) throw new Error(res.getErrorMessages().join('; '))
  return res.getData()!.result.item
}

async function handleDealAdd($b24: TypeB24, payload: BitrixEventPayload) {
  const id = Number(payload.data?.FIELDS?.ID)
  if (!id) { logger.warning('  no deal id in payload'); return }

  try {
    const deal = await loadDeal($b24, id)
    logger.info(`  deal #${id} created: title="${deal.title}", stage=${deal.stageId}, amount=${deal.opportunity} ${deal.currencyId}`)
    // …add your downstream actions here (Slack/Telegram, internal queues, etc.)
  } catch (e) {
    if (e instanceof AjaxError) logger.warning(`  failed to load deal #${id}: ${e.code}`)
    else throw e
  }
}

async function handleDealUpdate($b24: TypeB24, payload: BitrixEventPayload) {
  const id = Number(payload.data?.FIELDS?.ID)
  if (!id) return
  const deal = await loadDeal($b24, id)
  logger.info(`  deal #${id} updated: stage=${deal.stageId}, amount=${deal.opportunity}`)
}

function handleDealDelete(payload: BitrixEventPayload) {
  const id = payload.data?.FIELDS?.ID
  logger.info(`  deal #${id} deleted`)
}

const HANDLERS: Record<string, (b: TypeB24, p: BitrixEventPayload) => unknown | Promise<unknown>> = {
  ONCRMDEALADD: handleDealAdd,
  ONCRMDEALUPDATE: handleDealUpdate,
  ONCRMDEALDELETE: (_b, p) => handleDealDelete(p)
}

async function main() {
  const $b24 = bootB24()
  const port = Number(process.env.PORT ?? 3001)
  const app = express()
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  // The application_token Bitrix24 sends in every event. REQUIRED — without
  // it the server would accept any POST from anyone who knows the URL.
  // Set this from the Bitrix24 dev console (Local Application →
  // application_token) and store it in B24_APPLICATION_TOKEN.
  const expectedApplicationToken = process.env.B24_APPLICATION_TOKEN
  if (!expectedApplicationToken) {
    throw new Error('B24_APPLICATION_TOKEN env var is required (anti-spoof for outbound webhooks). Get it from your Bitrix24 dev console → Local Application → application_token.')
  }

  app.post('/webhook', async (req: Request, res: Response) => {
    const payload = req.body as BitrixEventPayload

    // Always 200 — Bitrix24 retries non-2xx for up to 24h. We reply first
    // and verify after, so even a bad payload doesn't keep the queue alive.
    res.status(200).json({ status: 'ok' })

    // Anti-spoof: constant-time compare against the registered application_token.
    const incomingToken = payload.auth?.application_token ?? ''
    if (!safeEqual(incomingToken, expectedApplicationToken)) {
      logger.warning('Rejected webhook: application_token mismatch (possible spoof)')
      return
    }

    const eventName = payload.event ?? 'UNKNOWN'
    // Log only the keys of FIELDS, not the values — Bitrix24 may add sensitive
    // fields in future releases and we don't want them leaking into log aggregators.
    const fieldKeys = Object.keys(payload.data?.FIELDS ?? {})
    logger.info(`[${new Date().toISOString()}] event=${eventName} fieldKeys=${JSON.stringify(fieldKeys)}`)

    const handler = HANDLERS[eventName]
    if (handler) {
      try { await handler($b24, payload) }
      catch (e) { logger.error(`  handler failed: ${(e as Error).message}`, {}) }
    } else {
      logger.info(`  no handler for ${eventName}`)
    }
  })

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'running', uptime: process.uptime(), events: Object.keys(HANDLERS) })
  })

  app.listen(port, () => {
    logger.info(`webhook server listening on :${port} (POST /webhook, GET /health)`)
    logger.info('Register events with crm.event.bind, then point them at this URL.')
  })
}

main().catch((e: unknown) => {
  // Raw console.error so structured-logger formatting can't hide the trace.
  console.error('\n[recipe failed]', e instanceof Error ? `${e.name}: ${e.message}` : String(e))
  if (e instanceof Error && e.stack) console.error(e.stack)
  process.exit(1)
})

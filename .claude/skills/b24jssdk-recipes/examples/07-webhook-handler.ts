/**
 * Recipe 7 — Express server that processes Bitrix24 outbound events
 *
 * Bitrix24 outbound webhooks (registered via crm.event.bind, etc.) POST
 * application/x-www-form-urlencoded payloads to your URL. This server:
 *   - dispatches by event name
 *   - fetches full entity details via REST when needed
 *   - always returns 200 (Bitrix24 retries on non-2xx)
 *
 * Install: pnpm add express
 * Env:
 *   B24_HOOK=https://your.bitrix24.com/rest/1/secret
 *   PORT=3001 (default)
 * Run:
 *   npx tsx 07-webhook-handler.ts
 *
 * In production, expose via your reverse proxy (or `npx ngrok http 3001` for dev).
 */

import {
  AjaxError,
  B24Hook,
  EnumCrmEntityTypeId,
  LoggerBrowser,
  type TypeB24
} from '@bitrix24/b24jssdk'
import express, { type Request, type Response } from 'express'

const logger = LoggerBrowser.build('Webhook', true)

function bootB24(): TypeB24 {
  const url = process.env.B24_HOOK
  if (!url) throw new Error('B24_HOOK env var is required')
  const $b24 = B24Hook.fromWebhookUrl(url)
  $b24.offClientSideWarning?.()
  return $b24
}

interface BitrixEventPayload {
  event: string
  data?: { FIELDS?: Record<string, string> }
  ts?: string
  auth?: Record<string, string>
}

async function loadDeal($b24: TypeB24, dealId: number) {
  const res = await $b24.callMethod('crm.item.get', {
    entityTypeId: EnumCrmEntityTypeId.deal,
    id: dealId
  })
  return res.getData().result.item
}

async function handleDealAdd($b24: TypeB24, payload: BitrixEventPayload) {
  const id = Number(payload.data?.FIELDS?.ID)
  if (!id) { logger.warn('  no deal id in payload'); return }

  try {
    const deal = await loadDeal($b24, id)
    logger.info(`  deal #${id} created: title="${deal.title}", stage=${deal.stageId}, amount=${deal.opportunity} ${deal.currencyId}`)
    // …add your downstream actions here (Slack/Telegram, internal queues, etc.)
  } catch (e) {
    if (e instanceof AjaxError) logger.warn(`  failed to load deal #${id}: ${e.code}`)
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

  app.post('/webhook', async (req: Request, res: Response) => {
    // Bitrix24 sends form-encoded fields; cast to our shape.
    const payload = req.body as BitrixEventPayload
    const eventName = payload.event ?? 'UNKNOWN'
    logger.info(`[${new Date().toISOString()}] event=${eventName} fields=${JSON.stringify(payload.data?.FIELDS ?? {})}`)

    const handler = HANDLERS[eventName]
    if (handler) {
      try { await handler($b24, payload) }
      catch (e) { logger.error(`  handler failed: ${(e as Error).message}`) }
    } else {
      logger.info(`  no handler for ${eventName}`)
    }

    // Always 200 — Bitrix24 retries non-2xx for up to 24h.
    res.status(200).json({ status: 'ok' })
  })

  app.get('/health', (_req, res) => {
    res.json({ status: 'running', uptime: process.uptime(), events: Object.keys(HANDLERS) })
  })

  app.listen(port, () => {
    logger.info(`webhook server listening on :${port} (POST /webhook, GET /health)`)
    logger.info('Register events with crm.event.bind, then point them at this URL.')
  })
}

main().catch((e) => { logger.error(e); process.exit(1) })

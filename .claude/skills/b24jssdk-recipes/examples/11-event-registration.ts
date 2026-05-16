/**
 * Recipe 11 — Outbound event registration
 *
 * Bitrix24 outbound webhooks (HTTP POST to your URL on entity changes) need
 * one-time registration. This script:
 *   1. Lists currently bound events (event.get)
 *   2. Binds three CRM-deal events to a target handler URL (event.bind)
 *   3. Optionally unbinds a previously bound event (event.unbind)
 *
 * Pairs with Recipe 7 (07-webhook-handler.ts) which receives the events.
 *
 * Run:
 *   B24_HOOK=https://your.bitrix24.com/rest/1/secret \
 *   HANDLER_URL=https://your-server.example.com/webhook \
 *   npx tsx 11-event-registration.ts list
 *
 *   ... 11-event-registration.ts bind     # bind the standard CRM deal events
 *   ... 11-event-registration.ts unbind   # remove them
 */

import {
  AjaxError,
  B24Hook,
  LoggerBrowser,
  type TypeB24
} from '@bitrix24/b24jssdk'

const logger = LoggerBrowser.build('EventReg', true)

function bootB24(): TypeB24 {
  const url = process.env.B24_HOOK
  if (!url) throw new Error('B24_HOOK env var is required')
  const $b24 = B24Hook.fromWebhookUrl(url)
  $b24.offClientSideWarning?.()
  return $b24
}

// Events we want bound. Pair these with the handler in 07-webhook-handler.ts.
const EVENTS = ['ONCRMDEALADD', 'ONCRMDEALUPDATE', 'ONCRMDEALDELETE'] as const

interface BoundEvent {
  event: string
  handler: string
  offline: string         // '1' if Bitrix24 should queue delivery during downtime
  auth_type: string       // numeric user id, as string
  event_handler_id?: string
}

async function listEvents($b24: TypeB24, filter?: string): Promise<BoundEvent[]> {
  const res = await $b24.actions.v2.call.make<BoundEvent[]>({
    method: 'event.get',
    params: filter ? { event: filter } : {},
    requestId: 'event-list'
  })
  if (!res.isSuccess) throw new Error(res.getErrorMessages().join('; '))
  return res.getData()!.result ?? []
}

async function bindEvent($b24: TypeB24, event: string, handler: string): Promise<void> {
  try {
    const res = await $b24.actions.v2.call.make<boolean>({
      method: 'event.bind',
      params: { event, handler },
      requestId: `event-bind-${event}`
    })
    if (!res.isSuccess) throw new Error(res.getErrorMessages().join('; '))
    logger.info(`  bound ${event} → ${handler}`)
  } catch (e) {
    if (e instanceof AjaxError && e.code === 'ERROR_EVENT_BINDING_EXISTS') {
      // Bitrix24 returns this when the (event, handler) pair is already bound.
      // It is not an error condition for an idempotent registration script.
      logger.info(`  ${event} already bound to this handler`)
      return
    }
    throw e
  }
}

async function unbindEvent($b24: TypeB24, event: string, handler: string): Promise<void> {
  const res = await $b24.actions.v2.call.make<boolean>({
    method: 'event.unbind',
    params: { event, handler },
    requestId: `event-unbind-${event}`
  })
  if (!res.isSuccess) {
    // event.unbind raises if the binding doesn't exist — treat as no-op.
    logger.info(`  ${event}: nothing to unbind (${res.getErrorMessages().join('; ')})`)
    return
  }
  logger.info(`  unbound ${event}`)
}

async function listAction($b24: TypeB24) {
  logger.info('Currently bound events:')
  const bindings = await listEvents($b24)
  if (bindings.length === 0) {
    logger.info('  (none)')
    return
  }
  for (const b of bindings) {
    logger.info(`  ${b.event} → ${b.handler} (offline=${b.offline}, user=${b.auth_type})`)
  }
}

async function bindAction($b24: TypeB24, handler: string) {
  logger.info(`Binding ${EVENTS.length} events to ${handler}…`)
  for (const event of EVENTS) {
    await bindEvent($b24, event, handler)
  }
  logger.info('Done. The handler will start receiving events on the next entity change.')
}

async function unbindAction($b24: TypeB24, handler: string) {
  logger.info(`Unbinding ${EVENTS.length} events from ${handler}…`)
  for (const event of EVENTS) {
    await unbindEvent($b24, event, handler)
  }
  logger.info('Done.')
}

async function main() {
  const action = (process.argv[2] ?? '').toLowerCase()
  if (!['list', 'bind', 'unbind'].includes(action)) {
    console.log('Usage: tsx 11-event-registration.ts <list|bind|unbind>')
    process.exit(1)
  }

  const $b24 = bootB24()

  if (action === 'list') {
    await listAction($b24)
    return
  }

  const handler = process.env.HANDLER_URL
  if (!handler) throw new Error('HANDLER_URL env var is required for bind/unbind')

  if (action === 'bind') await bindAction($b24, handler)
  else await unbindAction($b24, handler)
}

main().catch((e) => { logger.error(e); process.exit(1) })

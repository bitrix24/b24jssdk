/**
 * Recipe 10 — Error-handling cookbook
 *
 * Demonstrates the four error layers in b24jssdk:
 *   1. SdkError       — wrong SDK usage (config / deprecated paging helpers)
 *   2. AjaxError      — Bitrix24 REST returned an error
 *   3. Network-level  — timeout, ECONNRESET
 *   4. Soft errors    — returned inside AjaxResult (configurable per code)
 *
 * Also shows the new RestrictionManager knobs:
 *   - hardErrorCodes: throw on a custom REST code without retrying
 *   - softErrorCodes: surface a REST code as a soft error instead of throwing
 *   - retryOnNetworkError: turn off for non-idempotent calls (e.g. *.add)
 *
 * Run:
 *   B24_HOOK=https://your.bitrix24.com/rest/1/secret npx tsx 10-error-handling.ts
 */

import {
  AjaxError,
  B24Hook,
  EnumCrmEntityTypeId,
  ConsoleV2Handler,
  LogLevel,
  Logger,
  ParamsFactory,
  SdkError,
  type TypeB24
} from '@bitrix24/b24jssdk'

const logger = Logger.create('Errors')
logger.pushHandler(new ConsoleV2Handler(LogLevel.INFO, { useStyles: false }))

function bootB24(): TypeB24 {
  const url = process.env.B24_HOOK
  if (!url) throw new Error('B24_HOOK env var is required')
  const $b24 = B24Hook.fromWebhookUrl(url)
  $b24.offClientSideWarning()
  return $b24
}

// ─── 1. Tune restriction manager BEFORE making any call ─────────────────

async function configureLimits($b24: TypeB24) {
  await $b24.setRestrictionManagerParams({
    ...ParamsFactory.getDefault(),

    // App-specific codes that should THROW immediately, no retry. Use for
    // business-specific REST methods (the SDK only knows the built-in codes).
    hardErrorCodes: [
      'DOCUMENT_GENERATOR_ALREADY_IN_QUEUE',
      'MY_APP_BAD_PAYLOAD'
    ],

    // Codes you want to inspect as control flow instead of catching as errors.
    // The call returns `isSuccess: false` and `getErrorMessages()` lists the code,
    // but no exception is thrown.
    softErrorCodes: [
      'CRM_VALIDATION_FAIL'
    ],

    maxRetries: 3,
    retryDelay: 1_000
  })
}

// ─── 2. AjaxError — typical "REST error from Bitrix24" path ─────────────

interface DealItem { id: number, title: string }

async function loadDealSafely($b24: TypeB24, id: number): Promise<DealItem | null> {
  try {
    const res = await $b24.actions.v2.call.make<{ item: DealItem }>({
      method: 'crm.item.get',
      params: { entityTypeId: EnumCrmEntityTypeId.deal, id },
      requestId: `deal-${id}`
    })

    if (!res.isSuccess) {
      // Soft error — listed in softErrorCodes, surfaced without throwing.
      logger.warning(`Soft error for deal #${id}: ${res.getErrorMessages().join('; ')}`)
      return null
    }

    return res.getData()!.result.item
  } catch (e) {
    if (e instanceof AjaxError) {
      // REST-level error — Bitrix24 said no.
      switch (e.code) {
        case 'NOT_FOUND':
        case 'ERROR_NOT_FOUND': // crm.deal.get uses this; crm.item.get uses NOT_FOUND
          logger.info(`Deal #${id} does not exist (404)`)
          return null
        case 'INVALID_CREDENTIALS':
        case 'EXPIRED_TOKEN':
          // For B24OAuth the SDK auto-refreshes; for B24Hook this means the
          // webhook URL itself is wrong / revoked.
          logger.error('Auth failed — check the webhook URL', { code: e.code, status: e.status })
          throw e
        case 'QUERY_LIMIT_EXCEEDED':
          // RestrictionManager has already backed off and retried up to maxRetries.
          // Reaching this catch means we've exhausted retries.
          logger.error('Rate limited even after backoff — slow down upstream', {})
          throw e
        default:
          logger.error('Unhandled AjaxError', {
            code: e.code,
            status: e.status,
            message: e.message,
            method: e.requestInfo?.method
          })
          throw e
      }
    } else if (e instanceof SdkError) {
      // SDK-level — we did something wrong, not the server.
      logger.error('SDK error (programming bug)', { code: e.code, message: e.message })
      throw e
    }
    throw e // anything else propagates
  }
}

// ─── 3. Non-idempotent calls — disable network retry ────────────────────

async function safeCreateDeal($b24: TypeB24, fields: Record<string, unknown>): Promise<number | null> {
  // For *.add / *.update / file uploads, network retry can create duplicates:
  // a client-side timeout doesn't mean the server didn't process the request.
  //
  // GOTCHA: setRestrictionManagerParams updates the policy on this $b24
  // INSTANCE — it affects ALL concurrent calls on the same client, not just
  // this one. Safe to use in serial code paths (as in this recipe's main()).
  // In code with overlapping async work on the same $b24, prefer:
  //   - a dedicated $b24 instance for non-idempotent flows, or
  //   - a per-method idempotency token + manual conflict-detection on conflict.
  await $b24.setRestrictionManagerParams({
    ...ParamsFactory.getDefault(),
    retryOnNetworkError: false,
    maxRetries: 0
  })

  try {
    const res = await $b24.actions.v2.call.make<{ item: { id: number } }>({
      method: 'crm.item.add',
      params: { entityTypeId: EnumCrmEntityTypeId.deal, fields },
      requestId: `deal-add-${Date.now()}`
    })

    if (!res.isSuccess) {
      logger.warning(`Soft error creating deal: ${res.getErrorMessages().join('; ')}`)
      return null
    }

    return Number(res.getData()!.result.item.id)
  } catch (e) {
    if (e instanceof AjaxError && (e.code === 'NETWORK_ERROR' || e.code === 'REQUEST_TIMEOUT')) {
      // CRITICAL: do NOT retry blindly. The server may have created the deal.
      // Reconcile by querying for the new id (e.g. via a client-side idempotency tag).
      logger.error('Network failure during create — may need reconciliation', { code: e.code })
      return null
    }
    throw e
  } finally {
    // Restore the default policy (instance-global; see GOTCHA above).
    await $b24.setRestrictionManagerParams(ParamsFactory.getDefault())
  }
}

// ─── 4. Calling a non-v3 method on the v3 surface (soft error) ──────────

async function intentionallyWrongCall($b24: TypeB24) {
  // The SDK no longer keeps a client-side v3 allowlist: a non-v3 method (crm.*
  // lives on v2 only) is still sent to the v3 endpoint, and the server rejects
  // it as a SOFT error — the call does NOT throw, it returns a failed
  // AjaxResult. Check `isSuccess` rather than catching.
  const response = await $b24.actions.v3.call.make({
    method: 'crm.item.get',
    params: { entityTypeId: EnumCrmEntityTypeId.deal, id: 1 }
  })
  if (!response.isSuccess) {
    logger.info(`Got the expected server-side rejection: ${response.getErrorMessages().join('; ')}`)
  }
}

// ─── 5. Verifying soft-error config really makes a call succeed ─────────

async function checkSoftError($b24: TypeB24) {
  // Make a deliberately invalid create that triggers CRM_VALIDATION_FAIL.
  // Because we listed it in softErrorCodes, the call returns isSuccess=false
  // instead of throwing.
  const res = await $b24.actions.v2.call.make({
    method: 'crm.item.add',
    params: {
      entityTypeId: EnumCrmEntityTypeId.deal,
      fields: { /* intentionally missing required fields */ }
    },
    requestId: 'validation-test'
  })

  if (!res.isSuccess) {
    logger.info('Soft-error path worked:', res.getErrorMessages())
  } else {
    logger.warning('Expected a validation failure but the call succeeded')
  }
}

async function main() {
  const $b24 = bootB24()
  await configureLimits($b24)

  // 1. Standard read with full error taxonomy
  await loadDealSafely($b24, 1)

  // 2. Read a deal that almost certainly does not exist — observe ERROR_NOT_FOUND
  await loadDealSafely($b24, 999_999_999)

  // 3. Non-idempotent create — uncomment to demonstrate the retry-off policy
  // (actually creates a deal):
  //   await safeCreateDeal($b24, { title: 'Test', opportunity: 100 })
  void safeCreateDeal // keep referenced so the helper isn't tree-shaken from this demo

  // 4. SdkError demonstration
  await intentionallyWrongCall($b24)

  // 5. Soft-error demonstration — uncomment to exercise softErrorCodes
  // (actually attempts a deal create with empty fields):
  //   await checkSoftError($b24)
  void checkSoftError

  logger.info('Done.')
}

main().catch((e: unknown) => {
  // Raw console.error so structured-logger formatting can't hide the trace.
  console.error('\n[recipe failed]', e instanceof Error ? `${e.name}: ${e.message}` : String(e))
  if (e instanceof Error && e.stack) console.error(e.stack)
  process.exit(1)
})

/**
 * Verifies fix for https://github.com/bitrix24/b24jssdk/issues/24
 *
 * The bug: a non-idempotent call like `crm.documentgenerator.document.add` that
 * times out client-side gets retried by the SDK — the server may have already
 * accepted each attempt, producing duplicate documents.
 *
 * The fix: `retryOnNetworkError: false` makes the SDK throw `REQUEST_TIMEOUT`
 * immediately instead of retrying.
 *
 * Run:
 *   cd playgrounds/cli
 *   cp .env.example .env  # set B24_HOOK
 *   pnpm exec tsx src/verify/verify-issue-24.ts \
 *     --templateId=<ID> --entityTypeId=2 --entityId=<DEAL_ID>
 *
 * REQUIRES a real test portal with documentgenerator configured.
 * The webhook must have the `crm` scope (for `crm.documentgenerator.document.add`).
 * The script will attempt to create duplicate documents — use a sandbox portal!
 */
import 'dotenv/config'
import { ApiVersion, B24Hook, ParamsFactory } from '@bitrix24/b24jssdk'

function arg(name: string, def?: string): string {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`))
  const value = hit?.split('=', 2)[1] ?? def
  if (value === undefined) {
    throw new Error(`Missing required arg --${name}`)
  }
  return value
}

async function run() {
  const hook = process.env.B24_HOOK
  if (!hook) {
    throw new Error('B24_HOOK env var is not set. Copy .env.example to .env and fill it in.')
  }

  const templateId = Number(arg('templateId'))
  const entityTypeId = Number(arg('entityTypeId', '2')) // 2 = DEAL
  const entityId = Number(arg('entityId'))

  const params = { templateId, entityTypeId, entityId, values: {} }

  // ---- Phase A: old behaviour (default retryOnNetworkError = true) ----
  console.log('\n=== Phase A: default behaviour (retryOnNetworkError: true) ===')
  console.log('Forcing a 100ms axios timeout so the request reliably times out client-side.')
  console.log('Expectation: SDK retries, server may create duplicates, final throw = JSSDK_CALL_ALL_ATTEMPTS_EXHAUSTED.')

  {
    const $b24 = B24Hook.fromWebhookUrl(hook)
    const client = $b24.getHttpClient(ApiVersion.v2).ajaxClient
    client.defaults.timeout = 100

    try {
      await $b24.actions.v2.call.make({
        method: 'crm.documentgenerator.document.add',
        params
      })
      console.log('  unexpected success')
    } catch (e: any) {
      const stats = $b24.getHttpClient(ApiVersion.v2).getStats()
      console.log(`  error code   : ${e?.code}`)
      console.log(`  error message: ${e?.message}`)
      console.log(`  retries      : ${stats.retries}`)
      console.log(`  failedReqs   : ${stats.failedRequests}`)
    }
  }

  // ---- Phase B: new behaviour ----
  console.log('\n=== Phase B: with retryOnNetworkError: false ===')
  console.log('Expectation: SDK throws REQUEST_TIMEOUT immediately, retries=0, no duplicates server-side.')

  {
    const $b24 = B24Hook.fromWebhookUrl(hook)
    const client = $b24.getHttpClient(ApiVersion.v2).ajaxClient
    client.defaults.timeout = 100
    await $b24.setRestrictionManagerParams({
      ...ParamsFactory.getDefault(),
      retryOnNetworkError: false
    })

    try {
      await $b24.actions.v2.call.make({
        method: 'crm.documentgenerator.document.add',
        params
      })
      console.log('  unexpected success')
    } catch (e: any) {
      const stats = $b24.getHttpClient(ApiVersion.v2).getStats()
      console.log(`  error code   : ${e?.code}`)
      console.log(`  error message: ${e?.message}`)
      console.log(`  retries      : ${stats.retries}`)
      console.log(`  failedReqs   : ${stats.failedRequests}`)
    }
  }

  console.log('\nNext step: open the deal in Bitrix24 and count generated documents.')
  console.log('Phase A is expected to leave 2-3 duplicates, Phase B at most 1.')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})

/**
 * Verifies `hardErrorCodes` / `softErrorCodes` config from
 * https://github.com/bitrix24/b24jssdk/issues/24
 *
 * Uses an axios interceptor to inject a custom error code instead of talking to
 * a real portal. No B24 calls happen — `B24_HOOK` can be a dummy URL.
 *
 * Run:
 *   cd playgrounds/cli
 *   pnpm exec tsx src/verify/verify-custom-codes.ts
 */
import {
  ApiVersion,
  B24Hook,
  ParamsFactory,
  RestrictionManager
} from '@bitrix24/b24jssdk'
import { AxiosError } from 'axios'

const CUSTOM_CODE = 'MY_BUSINESS_FAIL'

function makeClient(restrictionParams?: Parameters<B24Hook['setRestrictionManagerParams']>[0]) {
  const $b24 = B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/abc/')
  const axiosClient = $b24.getHttpClient(ApiVersion.v2).ajaxClient

  // Intercept every request and reject with a synthetic AxiosError carrying
  // our custom error code in response.data — same shape the real REST endpoint
  // uses when it returns a 400.
  axiosClient.interceptors.request.use(() => {
    const err = new AxiosError(
      'Request failed with status code 400',
      'ERR_BAD_REQUEST',
      undefined,
      undefined,
      {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config: {} as never,
        data: { error: CUSTOM_CODE, error_description: 'simulated business failure' }
      }
    )
    return Promise.reject(err)
  })

  // Short retry delay so the test finishes quickly when retries do happen.
  return $b24.setRestrictionManagerParams({
    ...ParamsFactory.getDefault(),
    retryDelay: 50,
    ...restrictionParams
  }).then(() => $b24)
}

async function probe(label: string, $b24: B24Hook) {
  const start = Date.now()
  let outcome: { kind: 'throw' | 'result' | 'unexpected', code: string, retries: number }

  try {
    const r = await $b24.callMethod('crm.deal.get', { id: 1 })
    const stats = $b24.getHttpClient(ApiVersion.v2).getStats()
    const firstError = r.getErrors().next().value
    outcome = {
      kind: r.isSuccess ? 'unexpected' : 'result',
      code: (firstError as { code?: string } | undefined)?.code ?? '<none>',
      retries: stats.retries
    }
  } catch (e: any) {
    const stats = $b24.getHttpClient(ApiVersion.v2).getStats()
    outcome = { kind: 'throw', code: e?.code ?? '<unknown>', retries: stats.retries }
  }

  const ms = Date.now() - start
  console.log(`[${label}] ${outcome.kind.padEnd(10)} code=${outcome.code} retries=${outcome.retries} time=${ms}ms`)
  return outcome
}

async function run() {
  console.log('Built-in lists:')
  console.log(`  hard codes: ${RestrictionManager.BUILT_IN_HARD_ERROR_CODES.length}`)
  console.log(`  soft codes: ${RestrictionManager.BUILT_IN_SOFT_ERROR_CODES.length}`)
  console.log(`  '${CUSTOM_CODE}' is custom (not in either built-in list).`)
  console.log()

  // Baseline — custom code is unknown to the SDK → SDK retries.
  const a = await probe('baseline       ', await makeClient())

  // With hardErrorCodes — SDK throws immediately, retries === 0.
  const b = await probe('hardErrorCodes ', await makeClient({
    hardErrorCodes: [CUSTOM_CODE]
  }))

  // With softErrorCodes — SDK returns an AjaxResult with the error, no throw.
  const c = await probe('softErrorCodes ', await makeClient({
    softErrorCodes: [CUSTOM_CODE]
  }))

  console.log()
  const ok
    = a.retries > 0 && a.kind === 'throw'
      && b.retries === 0 && b.kind === 'throw'
      && c.retries === 0 && c.kind === 'result'

  if (ok) {
    console.log('OK — all three behaviours match expectations.')
  } else {
    console.log('FAIL — unexpected outcome, see lines above.')
    process.exit(1)
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})

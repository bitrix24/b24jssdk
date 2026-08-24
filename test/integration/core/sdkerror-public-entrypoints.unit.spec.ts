/**
 * #155 — public entry points throw `SdkError` with a stable `code`, not a bare
 * `Error`. Consumers are told to discriminate on `SdkError.code`; these paths
 * used to break that contract with `throw new Error(...)`.
 *
 * `SdkError.formatErrorMessage` returns the `description` verbatim, so converting
 * a bare throw to an SdkError with the same description keeps `error.message`
 * identical — the conversion is additive (`instanceof Error` still holds, a new
 * `.code` appears), not a breaking message change. These assertions pin the code
 * on each path so a future edit cannot silently drop back to a bare Error.
 *
 * Portal-free (jsSdk:unit).
 */
import { describe, it, expect } from 'vitest'
import { B24Hook } from '../../../packages/jssdk/src/'
import { SdkError } from '../../../packages/jssdk/src/core/sdk-error'

/** Run `fn`, return the thrown value (fails the test if nothing throws). */
function caught(fn: () => unknown): unknown {
  try {
    fn()
  } catch (e) {
    return e
  }
  throw new Error('expected the call to throw, but it did not')
}

describe('#155 B24Hook.fromWebhookUrl throws SdkError with a stable code', () => {
  const cases: Array<[string, string, string]> = [
    ['empty URL', '   ', 'JSSDK_HOOK_URL_EMPTY'],
    ['unparseable URL', 'rest/1/secret', 'JSSDK_HOOK_URL_INVALID'],
    ['non-https URL', 'http://x.bitrix24.com/rest/1/secret/', 'JSSDK_HOOK_URL_NOT_HTTPS'],
    ['malformed path', 'https://x.bitrix24.com/nope/', 'JSSDK_HOOK_URL_MALFORMED'],
    ['non-numeric userId', 'https://x.bitrix24.com/rest/notanumber/secret/', 'JSSDK_HOOK_URL_USER_ID_NOT_NUMERIC']
  ]

  it.each(cases)('%s → SdkError %s', (_label, url, code) => {
    const error = caught(() => B24Hook.fromWebhookUrl(url))
    expect(error).toBeInstanceOf(SdkError)
    // still an Error — instanceof and try/catch are unchanged.
    expect(error).toBeInstanceOf(Error)
    expect((error as SdkError).code).toBe(code)
  })

  it('keeps the message text identical to the pre-conversion bare Error', () => {
    // SdkError.formatErrorMessage returns the description verbatim (no code
    // prefix), so a consumer matching on message text is not broken.
    const error = caught(() => B24Hook.fromWebhookUrl('   ')) as SdkError
    expect(error.message).toBe('Webhook URL cannot be empty')
  })
})

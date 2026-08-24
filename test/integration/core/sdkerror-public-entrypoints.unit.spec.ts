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

describe('#155 the other converted entry points carry stable codes too', () => {
  it('useB24Helper.getB24Helper() before init → JSSDK_HELPER_NOT_INIT', async () => {
    const { useB24Helper } = await import('../../../packages/jssdk/src/helper/use-b24-helper')
    const { getB24Helper } = useB24Helper()
    const error = caught(() => getB24Helper())
    expect(error).toBeInstanceOf(SdkError)
    expect((error as SdkError).code).toBe('JSSDK_HELPER_NOT_INIT')
    // message parity with the pre-conversion bare Error
    expect((error as SdkError).message).toBe('B24HelperManager is not initialized. You need to call initB24Helper first.')
  })

  it('useB24Helper.useSubscribePullClient() before usePullClient → JSSDK_HELPER_PULL_CLIENT_NOT_INIT', async () => {
    const { useB24Helper } = await import('../../../packages/jssdk/src/helper/use-b24-helper')
    const { useSubscribePullClient } = useB24Helper()
    const error = caught(() => useSubscribePullClient(() => {}))
    expect(error).toBeInstanceOf(SdkError)
    expect((error as SdkError).code).toBe('JSSDK_HELPER_PULL_CLIENT_NOT_INIT')
  })

  it('AuthOAuthManager.isAdmin before initIsAdmin → JSSDK_OAUTH_IS_ADMIN_NOT_INIT', async () => {
    const { AuthOAuthManager } = await import('../../../packages/jssdk/src/oauth/auth')
    const mgr = new AuthOAuthManager({
      domain: 'https://portal.bitrix24.com',
      clientEndpoint: 'https://portal.bitrix24.com/rest/',
      serverEndpoint: 'https://oauth.bitrix24.tech/rest/',
      expires: 0, expiresIn: 3600,
      accessToken: 'A', refreshToken: 'R',
      memberId: 'm', scope: 's', status: 'L'
    } as never, { clientId: 'id', clientSecret: 'secret' } as never)
    const error = caught(() => mgr.isAdmin)
    expect(error).toBeInstanceOf(SdkError)
    expect((error as SdkError).code).toBe('JSSDK_OAUTH_IS_ADMIN_NOT_INIT')
  })
})

describe('#155 frame and remaining helper/oauth codes', () => {
  it('AppFrame.getAppSid() before the handshake → JSSDK_FRAME_APP_SID_NOT_INIT', async () => {
    const { AppFrame } = await import('../../../packages/jssdk/src/frame/frame')
    // No APP_SID in the query params — the parent never delivered one.
    const frame = new AppFrame({ DOMAIN: 'portal.bitrix24.com', PROTOCOL: true, LANG: 'en', APP_SID: null } as never)
    const error = caught(() => frame.getAppSid())
    expect(error).toBeInstanceOf(SdkError)
    expect((error as SdkError).code).toBe('JSSDK_FRAME_APP_SID_NOT_INIT')
    expect((error as SdkError).message).toBe('Not init appSid')
  })

  it('usePullClient() before initB24Helper → JSSDK_HELPER_NOT_INIT', async () => {
    const { useB24Helper } = await import('../../../packages/jssdk/src/helper/use-b24-helper')
    const { usePullClient } = useB24Helper()
    const error = caught(() => usePullClient())
    expect(error).toBeInstanceOf(SdkError)
    expect((error as SdkError).code).toBe('JSSDK_HELPER_NOT_INIT')
  })

  it('startPullClient() before usePullClient → JSSDK_HELPER_PULL_CLIENT_NOT_INIT', async () => {
    const { useB24Helper } = await import('../../../packages/jssdk/src/helper/use-b24-helper')
    const { startPullClient } = useB24Helper()
    const error = caught(() => startPullClient())
    expect(error).toBeInstanceOf(SdkError)
    expect((error as SdkError).code).toBe('JSSDK_HELPER_PULL_CLIENT_NOT_INIT')
  })

  it('initIsAdmin() with a failing profile call rejects with JSSDK_OAUTH_PROFILE_FAILED', async () => {
    const { AuthOAuthManager } = await import('../../../packages/jssdk/src/oauth/auth')
    const { ApiVersion } = await import('../../../packages/jssdk/src/types/b24')
    const mgr = new AuthOAuthManager({
      domain: 'https://portal.bitrix24.com',
      clientEndpoint: 'https://portal.bitrix24.com/rest/',
      serverEndpoint: 'https://oauth.bitrix24.tech/rest/',
      expires: 0, expiresIn: 3600,
      accessToken: 'A', refreshToken: 'R',
      memberId: 'm', scope: 's', status: 'L'
    } as never, { clientId: 'id', clientSecret: 'secret' } as never)

    // A TypeHttp stub whose profile call soft-fails with the portal's own text.
    const http = {
      apiVersion: ApiVersion.v2,
      call: async () => ({
        isSuccess: false,
        getErrorMessages: () => ['insufficient_scope', 'profile denied']
      })
    } as never

    const error = await mgr.initIsAdmin(http).then(() => null, (e: unknown) => e)
    expect(error).toBeInstanceOf(SdkError)
    expect((error as SdkError).code).toBe('JSSDK_OAUTH_PROFILE_FAILED')
    // description carries the portal's own error text, joined — the caller can
    // still read why.
    expect((error as SdkError).message).toBe('insufficient_scope;profile denied')
  })
})

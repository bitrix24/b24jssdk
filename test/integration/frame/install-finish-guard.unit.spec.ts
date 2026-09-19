/**
 * #379 — pin the `installFinish()` refusal, which documentation quotes verbatim.
 *
 * `installFinish()` tells the portal the installer has finished. Called when the
 * application is not in install mode it refuses, and both halves of that refusal
 * are quoted word for word in the docs: the code in `96.error-codes.md` and in
 * `20.app-installation-wizard.md`, the code *and* the message in `30.frame.md`.
 *
 * Nothing referenced `installFinish` in the whole test tree, so editing either
 * string left CI green and the documentation wrong — a reader searching the
 * source for the message would not find it, and a developer catching the error
 * would not find its code in the table.
 *
 * Note for whoever edits this next: #379 was written when the method rejected
 * with a bare `Error` and asked for the message alone. It carries an `SdkError`
 * with a `code` now, so both are pinned. If the code is ever renamed, the three
 * documentation files above have to move with it — this test pins the source,
 * not the docs, so it will not tell you that.
 *
 * `MessageManager` is mocked, as in `keep-auth-fresh-wiring.unit.spec.ts`: the
 * postMessage handshake is not reachable in CI, and `INSTALL` in the init data
 * is the whole input this test varies.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let installFlag = false
const sentCommands: string[] = []

vi.mock('../../../packages/jssdk/src/frame/message', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../packages/jssdk/src/frame/message')>()

  return {
    ...actual,
    MessageManager: class {
      subscribe(): void {}
      unsubscribe(): void {}
      setLogger(): void {}

      async send(command: string, _params: unknown): Promise<unknown> {
        sentCommands.push(String(command))

        // getInitData — `INSTALL` is what decides install mode.
        return {
          AUTH_ID: 'ACCESS',
          REFRESH_ID: 'REFRESH',
          AUTH_EXPIRES: '3600',
          MEMBER_ID: 'MEMBER',
          IS_ADMIN: true,
          LANG: 'en',
          PLACEMENT: 'DEFAULT',
          PLACEMENT_OPTIONS: '{}',
          INSTALL: installFlag,
          FIRST_RUN: false,
          APP_OPTIONS: {},
          USER_OPTIONS: {}
        }
      }
    }
  }
})

const { B24Frame } = await import('../../../packages/jssdk/src/frame/b24')
const { SdkError } = await import('../../../packages/jssdk/src/core/sdk-error')
const { MessageCommands } = await import('../../../packages/jssdk/src/frame/message')

const QUERY_PARAMS = {
  DOMAIN: 'acme.bitrix24.com',
  PROTOCOL: true,
  APP_SID: 'APPSID123',
  LANG: null
}

/** The strings the documentation quotes. Changing either here is the point. */
const EXPECTED_CODE = 'JSSDK_FRAME_INSTALL_ALREADY_FINISHED'
const EXPECTED_MESSAGE = 'Application was previously installed. You cannot call installFinish'

async function buildFrame(isInstallMode: boolean) {
  installFlag = isInstallMode
  const b24 = new B24Frame(QUERY_PARAMS)
  await b24.init()

  return b24
}

describe('#379 installFinish() refuses outside install mode, with the documented code and message', () => {
  beforeEach(() => {
    sentCommands.length = 0
    vi.stubGlobal('window', {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects with an SdkError carrying the exact code and message', async () => {
    const b24 = await buildFrame(false)

    await expect(b24.installFinish()).rejects.toThrow(SdkError)
    await expect(b24.installFinish()).rejects.toMatchObject({
      code: EXPECTED_CODE,
      message: EXPECTED_MESSAGE
    })

    b24.destroy()
  })

  it('does not reach the parent window when it refuses', async () => {
    // The refusal is local. Sending `setInstallFinish` anyway would mark an
    // already-installed application as freshly installed on the portal side,
    // which is the outcome the guard exists to prevent — a rejection alone does
    // not prove it did not happen.
    const b24 = await buildFrame(false)

    await expect(b24.installFinish()).rejects.toThrow(SdkError)
    expect(sentCommands).not.toContain(String(MessageCommands.setInstallFinish))

    b24.destroy()
  })

  it('sends setInstallFinish when the application IS in install mode', async () => {
    // The other half of the guard: a test that only pins the refusal is
    // satisfied by a method that refuses unconditionally.
    const b24 = await buildFrame(true)

    await expect(b24.installFinish()).resolves.not.toThrow()
    expect(sentCommands).toContain(String(MessageCommands.setInstallFinish))

    b24.destroy()
  })
})

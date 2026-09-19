/**
 * #379 — pin the `installFinish()` refusal, which documentation quotes verbatim.
 *
 * `installFinish()` tells the portal the installer has finished. Called when the
 * application is not in install mode it refuses, and both halves of that refusal
 * are quoted word for word in the docs: the code in `96.error-codes.md` and in
 * `20.app-installation-wizard.md`, the code *and* the message in `30.frame.md`.
 * Nothing referenced `installFinish` in the whole test tree, so editing either
 * string left CI green and the documentation wrong.
 *
 * Note for whoever edits this next: #379 was written when the method rejected
 * with a bare `Error` and asked for the message alone. #382 gave it an
 * `SdkError` with a `code`, so both are pinned, and so is `status: 0` — which
 * no page quotes, but which says "this never reached the network" and is the
 * difference between a local refusal and a transport failure.
 *
 * `MessageManager` is mocked, as in `keep-auth-fresh-wiring.unit.spec.ts`. Two
 * consequences of that are worth stating rather than discovering:
 *
 *  - the stub resolves immediately, while the real `send` settles only on the
 *    parent window's reply. So the install-mode case pins "it called `send`
 *    with this command and these params", not "the portal acknowledged".
 *  - the stub records what it was called with, so the call site is checked
 *    against the ENUM. A typo in the call site is caught; renaming the enum's
 *    wire value moves both sides together, which is why the wire string is
 *    pinned separately below — the parent window parses that literal.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

let installFlag = false
const sent: { command: string, params: unknown }[] = []

vi.mock('../../../packages/jssdk/src/frame/message', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../packages/jssdk/src/frame/message')>()

  return {
    ...actual,
    MessageManager: class {
      subscribe(): void {}
      unsubscribe(): void {}
      setLogger(): void {}

      async send(command: string, params: unknown): Promise<unknown> {
        sent.push({ command, params })

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

/**
 * `sent` is cleared AFTER init, not in `beforeEach`: `init()` sends commands of
 * its own, and with those left in the log an unrelated `setInstallFinish` added
 * to `init()` would fail a case named after `installFinish` and send the reader
 * to the wrong file.
 */
async function buildFrame(isInstallMode: boolean) {
  installFlag = isInstallMode
  const b24 = new B24Frame(QUERY_PARAMS)
  await b24.init()
  sent.length = 0

  return b24
}

describe('#379 installFinish() refuses outside install mode, with the documented code and message', () => {
  beforeEach(() => {
    sent.length = 0
    installFlag = false
  })

  it('rejects with an SdkError carrying the exact code, message and status', async () => {
    const b24 = await buildFrame(false)

    await expect(b24.installFinish()).rejects.toThrow(SdkError)
    await expect(b24.installFinish()).rejects.toMatchObject({
      code: EXPECTED_CODE,
      message: EXPECTED_MESSAGE,
      // Not quoted by any page, pinned anyway: `0` means the refusal is local.
      // A transport failure would carry an HTTP status, and a caller
      // distinguishing the two reads this field.
      status: 0
    })
  })

  it('sends nothing at all when it refuses', async () => {
    // A rejection does not prove the guard returned early. Sending
    // `setInstallFinish` anyway would mark an already-installed application as
    // freshly installed on the portal side, which is what the guard prevents.
    //
    // Asserted as an empty log rather than `not.toContain`: at this point the
    // log holds nothing, so a negative assertion would pass against any string
    // — including `'undefined'`, which is what `MessageCommands.setInstallFinish`
    // becomes if the enum member is ever renamed.
    const b24 = await buildFrame(false)

    await expect(b24.installFinish()).rejects.toMatchObject({ code: EXPECTED_CODE })
    expect(sent).toStrictEqual([])
  })

  it('in install mode sends setInstallFinish with no parameters', async () => {
    // The other half of the guard: a test that pins only the refusal is
    // satisfied by a method that refuses unconditionally.
    //
    // The params matter as much as the command. `isSafely` is stripped from the
    // wire payload by `MessageManager` but arms a 900 ms timer that resolves the
    // caller with `{ isSafely: true }` — so a stray `isSafely: true` here would
    // turn a portal acknowledgement into a timeout that looks like success.
    const b24 = await buildFrame(true)

    await expect(b24.installFinish()).resolves.not.toThrow()
    expect(sent).toStrictEqual([{ command: MessageCommands.setInstallFinish, params: {} }])
  })

  it('pins the wire value the parent window parses', () => {
    // The assertions above compare against the enum, so they move with it. The
    // parent window does not: it matches this literal.
    expect(MessageCommands.setInstallFinish).toBe('setInstallFinish')
  })

  it('before init() it rejects with a DIFFERENT code, which no page documents', async () => {
    // `isInstallMode` calls `_ensureInitialized()`, so an un-initialised frame
    // rejects with `JSSDK_CORE_B24_NOT_INIT` rather than the documented code.
    // A caller discriminating on `JSSDK_FRAME_INSTALL_ALREADY_FINISHED` falls
    // through it. Pinned so the second failure mode is at least visible here.
    const b24 = new B24Frame(QUERY_PARAMS)

    await expect(b24.installFinish()).rejects.toMatchObject({ code: 'JSSDK_CORE_B24_NOT_INIT' })
  })
})

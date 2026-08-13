/**
 * `frame.parent.im*` — the in-frame messenger bridge.
 *
 * `imPhoneTo` / `imCallTo` / `imOpenMessenger` are the SDK methods an app calls
 * from INSIDE its placement iframe. They do not run the messenger action
 * directly — they `postMessage` a command to the parent portal window, where
 * the real `Messenger.*` handler lives (the app iframe has no top-level `BX` /
 * `Messenger` global). This spec pins that contract: each method must dispatch
 * the correct `MessageCommands.*` with the expected params.
 *
 * Context: the linked docs pages for `BX24.im.phoneTo` / `BX24.im.callTo` are
 * now marked DEPRECATED in favour of the top-window `Messenger.startPhoneCall`
 * / `Messenger.startVideoCall`, which are NOT reachable from an app iframe.
 * These SDK wrappers remain the correct in-frame path, so their behaviour is
 * worth locking. See the tracking issue for the docs/JSDoc mismatch.
 *
 * MOCKED unit spec (portal-free, `.unit.spec.ts` -> jsSdk:unit project): the
 * real parent-window `postMessage` round-trip is not reachable in CI, so we
 * stub `MessageManager.send` and capture the dispatched (command, params).
 */
import { describe, it, expect } from 'vitest'
import { ParentManager } from '../../../packages/jssdk/src/frame/parent'
import { MessageManager } from '../../../packages/jssdk/src/frame/message/controller'
import { MessageCommands } from '../../../packages/jssdk/src/frame/message'

type SentCall = { command: unknown, params: unknown }

function buildParent(): { parent: ParentManager, calls: SentCall[] } {
  const mgr = new MessageManager({ getTargetOrigin: () => 'https://portal.bitrix24.com' } as never)
  const calls: SentCall[] = []
  ;(mgr as unknown as { send: (command: unknown, params: unknown) => Promise<unknown> }).send
    = async (command, params) => {
      calls.push({ command, params })
      return undefined
    }
  return { parent: new ParentManager(mgr), calls }
}

describe('frame.parent im* commands (in-frame messenger bridge)', () => {
  it('imPhoneTo dispatches imPhoneTo with the phone number', async () => {
    const { parent, calls } = buildParent()
    await parent.imPhoneTo('+74951234567')

    expect(calls).toHaveLength(1)
    expect(calls[0]!.command).toBe(MessageCommands.imPhoneTo)
    expect(calls[0]!.params).toMatchObject({ phone: '+74951234567', isSafely: true })
  })

  it('imCallTo dispatches imCallTo with userId and the video flag (default true)', async () => {
    const { parent, calls } = buildParent()
    await parent.imCallTo(5)
    await parent.imCallTo(7, false)

    expect(calls[0]!.command).toBe(MessageCommands.imCallTo)
    expect(calls[0]!.params).toMatchObject({ userId: 5, video: true, isSafely: true })
    expect(calls[1]!.params).toMatchObject({ userId: 7, video: false, isSafely: true })
  })

  it('imOpenMessenger dispatches imOpenMessenger with the dialogId', async () => {
    const { parent, calls } = buildParent()
    await parent.imOpenMessenger('chat12')

    expect(calls[0]!.command).toBe(MessageCommands.imOpenMessenger)
    expect(calls[0]!.params).toMatchObject({ dialogId: 'chat12', isSafely: true })
  })
})

/**
 * #331 — the `im*` bridge methods forward their second parameter.
 *
 * The portal's bridge handler enumerates fields by hand (`imPhoneTo:
 * function(params) { top.BXIM.phoneTo(params.phone) }`), so `params` for
 * `startPhoneCall` and `messageId` for `openChat` are dropped on the way today.
 * Both are documented arguments of the methods the portal itself recommends, and
 * an unknown field costs nothing — the handler ignores it. Sending them now means
 * applications need no change on the day the portal forwards them.
 *
 * These tests pin the wire payload, not portal behaviour: what we control is
 * what we send. Pure logic, no portal — jsSdk:unit.
 */
import { describe, it, expect, vi } from 'vitest'
import { ParentManager } from '../../../packages/jssdk/src/frame/parent'
import { MessageCommands } from '../../../packages/jssdk/src/frame/message'
import type { MessageManager } from '../../../packages/jssdk/src/frame/message'

function makeParent() {
  const send = vi.fn().mockResolvedValue(undefined)
  const parent = new ParentManager({ send } as unknown as MessageManager)
  return { parent, send }
}

describe('#331 im* methods forward the second parameter', () => {
  it('imPhoneTo omits `params` entirely when not given', async () => {
    const { parent, send } = makeParent()
    await parent.imPhoneTo('+70000000000')

    expect(send).toHaveBeenCalledWith(MessageCommands.imPhoneTo, {
      phone: '+70000000000',
      isSafely: true
    })
    // Not `params: undefined` — the payload is JSON-serialised for the portal,
    // and an explicit undefined key is noise on the wire.
    expect(Object.keys(send.mock.calls[0]?.[1] ?? {})).not.toContain('params')
  })

  it('imPhoneTo forwards `params` for the phone manager when given', async () => {
    const { parent, send } = makeParent()
    await parent.imPhoneTo('+70000000000', { entityType: 'LEAD', entityId: 42 })

    expect(send).toHaveBeenCalledWith(MessageCommands.imPhoneTo, {
      phone: '+70000000000',
      params: { entityType: 'LEAD', entityId: 42 },
      isSafely: true
    })
  })

  it('imOpenMessenger omits `messageId` when not given', async () => {
    const { parent, send } = makeParent()
    await parent.imOpenMessenger(1)

    expect(send).toHaveBeenCalledWith(MessageCommands.imOpenMessenger, {
      dialogId: 1,
      isSafely: true
    })
  })

  it('imOpenMessenger forwards `messageId` to focus a message', async () => {
    const { parent, send } = makeParent()
    await parent.imOpenMessenger('chat123', 12345)

    expect(send).toHaveBeenCalledWith(MessageCommands.imOpenMessenger, {
      dialogId: 'chat123',
      messageId: 12345,
      isSafely: true
    })
  })

  it('every im* call is sent with isSafely, because the portal never replies', async () => {
    const { parent, send } = makeParent()
    await parent.imPhoneTo('+70000000000')
    await parent.imCallTo(1, false)
    await parent.imOpenMessenger(1)
    await parent.imOpenHistory(1)

    // The portal's four handlers are declared `function(params)` — they do not
    // accept the callback the message layer offers, so nothing ever answers.
    // Without isSafely these promises would hang forever.
    for (const call of send.mock.calls) {
      expect(call[1]).toMatchObject({ isSafely: true })
    }
  })
})

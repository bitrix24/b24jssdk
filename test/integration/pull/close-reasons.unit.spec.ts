/**
 * The frame/connection split in `CloseReasons`, pinned.
 *
 * `*.unit.spec.ts` (testing.md's exception): pure functions over an enum,
 * nothing to reach a portal for.
 *
 * The whole value of `isFrameRefusalCloseCode()` is where its boundary falls,
 * and the boundary is not obvious: `WRONG_CHANNEL_ID` (4010),
 * `NO_PUBLIC_CHANNEL_ID` (4012) and `TOO_MANY_CONNECTIONS` (4029) sit in the
 * same 401x/402x space as the nine frame-level codes and are NOT verdicts on a
 * published frame. A caller testing "is it 401x" — which is what the first
 * draft of the docblock invited — misclassifies all three.
 *
 * So this exists to fail when someone adds a code and updates only one of the
 * two places that decide membership.
 */
import { describe, it, expect } from 'vitest'
import { CloseReasons, isFrameRefusalCloseCode } from '../../../packages/jssdk/src/'

const FRAME_LEVEL = [
  CloseReasons.WRONG_REQUEST_DATA,
  CloseReasons.REQUEST_COMMAND_NOT_ALLOWED,
  CloseReasons.WRONG_REQUEST_COMMAND,
  CloseReasons.TOO_MANY_MESSAGES,
  CloseReasons.NO_CHANNELS_FOUND,
  CloseReasons.TOO_MANY_CHANNELS,
  CloseReasons.INVALID_CHANNEL_ID,
  CloseReasons.PRIVATE_CHANNEL_NOT_ALLOWED,
  CloseReasons.INVALID_CHANNEL_SIGNATURE
]

const CONNECTION_LEVEL = [
  CloseReasons.WRONG_CHANNEL_ID,
  CloseReasons.NO_PUBLIC_CHANNEL_ID,
  CloseReasons.TOO_MANY_CONNECTIONS
]

const CLIENT_SENT = [
  CloseReasons.NORMAL_CLOSURE,
  CloseReasons.SERVER_DIE,
  CloseReasons.CONFIG_REPLACED,
  CloseReasons.CHANNEL_EXPIRED,
  CloseReasons.SERVER_RESTARTED,
  CloseReasons.CONFIG_EXPIRED,
  CloseReasons.MANUAL,
  CloseReasons.STUCK
]

describe('pull: which close codes mean "your publish was refused"', () => {
  it.each(FRAME_LEVEL)('%i is a frame refusal', (code) => {
    expect(isFrameRefusalCloseCode(code)).toBe(true)
  })

  it.each(CONNECTION_LEVEL)('%i is connection-level, not a frame refusal', (code) => {
    // The three that share the numeric range and are the reason this is not a
    // range test in the first place.
    expect(isFrameRefusalCloseCode(code)).toBe(false)
  })

  it.each(CLIENT_SENT)('%i is a code the client sends', (code) => {
    expect(isFrameRefusalCloseCode(code)).toBe(false)
  })

  it('answers false for codes the server has not allocated', () => {
    // 4011 and 4022-4028 are gaps. `false` is the conservative answer: an
    // unknown code must not be promoted to "your publish was refused", because
    // the page that consumes this presents a `true` as an explanation.
    for (const code of [4011, 4022, 4025, 4028, 4030, 1006, 0, -1, Number.NaN]) {
      expect(isFrameRefusalCloseCode(code), String(code)).toBe(false)
    }
  })

  it('keeps every frame-level code reverse-mappable to its name', () => {
    // The lab turns a numeric `CloseEvent.code` into a name this way, and a
    // duplicate value would silently collapse two names into one.
    const names = new Set<string>()
    for (const code of [...FRAME_LEVEL, ...CONNECTION_LEVEL, ...CLIENT_SENT]) {
      const name = CloseReasons[code]
      expect(name, String(code)).toBeTypeOf('string')
      names.add(name as string)
    }
    expect(names.size).toBe(FRAME_LEVEL.length + CONNECTION_LEVEL.length + CLIENT_SENT.length)
  })
})

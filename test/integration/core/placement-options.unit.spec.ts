/**
 * Regression for https://github.com/bitrix24/b24jssdk/issues/485
 *
 * `PlacementManager.options` was typed `any` on a value that crosses a
 * `postMessage` boundary from the portal, so `options.payload.id` compiled and
 * was `undefined` at run time. The field behind it was declared `object` and
 * assigned `Object.freeze(data.PLACEMENT_OPTIONS)` — and `Object.freeze` returns
 * a primitive unchanged, so on two perfectly ordinary portal responses that
 * field held a string or `undefined` instead.
 *
 * Traced through the `rest` module of an on-premise build (`SM_VERSION
 * 26.150.0`), the wire value has four producers and three shapes:
 *
 *   default placement   → the frame URL's query string, values are strings
 *   registered placement → arbitrary JSON stored at bind time
 *   slider from JS      → the caller's object, minus `bx24_*`, possibly replaced
 *                         by its own `params` key
 *   nothing supplied    → `''`, because `app.layout/class.php` defaults to it
 *                         and `CUtil::PhpToJsObject('')` renders an empty string
 *
 * The JSON-string shape comes from the hidden form field
 * (`Json::encode($arParams['~PLACEMENT_OPTIONS'])`) that feeds the POST
 * re-submit rather than `getInitData`; it is normalised here because parsing it
 * costs one `typeof` and retires a caveat the docs otherwise carry for ever.
 *
 * `*.unit.spec.ts` — no portal required.
 */
import { describe, it, expect } from 'vitest'
import { normalisePlacementOptions } from '../../../packages/jssdk/src/frame/_placement-options'
import { PlacementManager } from '../../../packages/jssdk/src/frame/placement'
import type { MessageManager } from '../../../packages/jssdk/src/frame/message'
import type { MessageInitData } from '../../../packages/jssdk/src/types/auth'

/**
 * `initData` never touches the message manager, so the handshake can be driven
 * without one.
 */
function buildPlacement(): PlacementManager {
  return new PlacementManager(null as unknown as MessageManager)
}

function initWith(raw: unknown, placement = 'CRM_DEAL_DETAIL_TAB'): PlacementManager {
  return buildPlacement().initData({ PLACEMENT: placement, PLACEMENT_OPTIONS: raw } as MessageInitData)
}

describe('placement options normalisation (#485)', () => {
  it('keeps a plain object', () => {
    expect(normalisePlacementOptions({ place: 'deal', ID: '42' }))
      .toEqual({ place: 'deal', ID: '42' })
  })

  // The producer for the default placement is the frame URL's query string, so
  // the values really are strings — including `IFRAME`, which is why
  // `isSliderMode` compares against `'Y'` and not `true`.
  it('keeps query-string values as the strings they are', () => {
    const options = normalisePlacementOptions({ IFRAME: 'Y', bx24_width: '600' })

    expect(options['IFRAME']).toBe('Y')
    expect(options['bx24_width']).toBe('600')
  })

  it('parses a JSON string', () => {
    expect(normalisePlacementOptions('{"place":"deal"}')).toEqual({ place: 'deal' })
  })

  // The shape #485 reports as "arrived empty altogether", and the one that made
  // the old `object` declaration false: `Object.freeze('')` is `''`.
  it('turns the portal\'s empty string into an empty object', () => {
    expect(normalisePlacementOptions('')).toEqual({})
  })

  it('turns an absent value into an empty object', () => {
    expect(normalisePlacementOptions(undefined)).toEqual({})
    expect(normalisePlacementOptions(null)).toEqual({})
  })

  // Never throws: an exception here would fail the whole frame handshake over a
  // parameter the application may not even read.
  it.each([
    ['malformed JSON', '{not json'],
    ['a JSON scalar', '42'],
    ['a JSON array', '[1,2,3]'],
    ['an array', [1, 2, 3]],
    ['a number', 7],
    ['a boolean', true]
  ])('gives an empty object for %s, without throwing', (_label, raw) => {
    expect(() => normalisePlacementOptions(raw)).not.toThrow()
    expect(normalisePlacementOptions(raw)).toEqual({})
  })

  it('freezes the result, so a caller cannot mutate shared state', () => {
    const options = normalisePlacementOptions({ place: 'deal' })

    expect(Object.isFrozen(options)).toBe(true)
    expect(() => {
      (options as Record<string, unknown>)['place'] = 'lead'
    }).toThrow(TypeError)
  })

  // A copy, not the caller's object: freezing the portal's own reference would
  // reach back into `MessageInitData` and freeze a value the transport still
  // holds.
  it('copies rather than freezing the value it was given', () => {
    const raw = { place: 'deal' }
    const options = normalisePlacementOptions(raw)

    expect(options).not.toBe(raw)
    expect(Object.isFrozen(raw)).toBe(false)
  })
})

/**
 * The wiring, not the helper.
 *
 * Everything above tests `normalisePlacementOptions` in isolation, and a
 * mutation sweep showed that is not enough: pointing `initData` at the **wrong
 * field** — `normalisePlacementOptions(data.PLACEMENT)` — survived the whole
 * unit suite *and* the type checker, because nothing connected the helper to the
 * class that is supposed to call it. These cases close that.
 */
describe('PlacementManager reads PLACEMENT_OPTIONS through the normaliser (#485)', () => {
  it('normalises an object off the handshake', () => {
    expect(initWith({ place: 'deal', IFRAME: 'Y' }).options).toEqual({ place: 'deal', IFRAME: 'Y' })
  })

  it('normalises the JSON-string shape', () => {
    expect(initWith('{"place":"deal"}').options).toEqual({ place: 'deal' })
  })

  // The shape that used to leave a field declared `object` holding a string.
  it('turns the portal\'s empty string into an empty object', () => {
    const placement = initWith('')

    expect(placement.options).toEqual({})
    expect(typeof placement.options).toBe('object')
  })

  it('survives PLACEMENT_OPTIONS being absent', () => {
    expect(initWith(undefined).options).toEqual({})
  })

  // Reads `PLACEMENT_OPTIONS`, not some neighbouring field: with the wrong one
  // wired in, `IFRAME` is unreachable and this is the assertion that fails.
  it('reads the options field, not another one from the same payload', () => {
    expect(initWith({ IFRAME: 'Y' }, 'DEFAULT').isSliderMode).toBe(true)
    expect(initWith({ IFRAME: 'N' }, 'DEFAULT').isSliderMode).toBe(false)
    expect(initWith('', 'DEFAULT').isSliderMode).toBe(false)
  })

  it('freezes what the getter hands back', () => {
    const options = initWith({ place: 'deal' }).options

    expect(Object.isFrozen(options)).toBe(true)
  })

  it('leaves the portal\'s own object alone', () => {
    const raw = { place: 'deal' }
    initWith(raw)

    expect(Object.isFrozen(raw)).toBe(false)
  })

  // The mutation sweep found nothing pinning this: normalising in the getter
  // instead of once in `initData` still returns a frozen object with the right
  // keys, so every assertion passed while `options` handed back a fresh object
  // per read — enough to break any consumer keyed on the reference.
  it('returns the same object on every read', () => {
    const placement = initWith({ payload: { id: 1 } })

    expect(placement.options).toBe(placement.options)
  })

  // The copy and the freeze are one level deep, which the JSDoc now says
  // outright. Pinned so the claim and the code cannot drift apart again: the
  // previous wording promised the copy severed the tie to `MessageInitData`,
  // and it severs it only at the top.
  it('does not freeze or copy nested values — they stay the portal\'s', () => {
    const initData = { payload: { id: 1 } }
    const result = normalisePlacementOptions(initData) as { payload: { id: number } }

    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.payload)).toBe(false)
    expect(result.payload).toBe(initData.payload)
  })

  // Reachable only through `initData`, which is public — nothing that crossed
  // `postMessage` can carry an accessor. "Never throws" is stated without a
  // qualifier, so it has to hold here too.
  it('does not throw on a source whose getter throws', () => {
    const hostile = {
      get boom(): never {
        throw new Error('boom')
      }
    }

    expect(() => normalisePlacementOptions(hostile)).not.toThrow()
    expect(normalisePlacementOptions(hostile)).toEqual({})
  })

  // `isSliderMode` compares against the string 'Y' because the value comes from
  // a query string. A registered placement can send a real boolean, and that
  // deliberately does not count — pinned so a future "helpful" loosening has to
  // argue with a test.
  it('leaves a boolean IFRAME as a boolean, which is not slider mode', () => {
    expect(normalisePlacementOptions({ IFRAME: true })['IFRAME']).toBe(true)
    expect(initWith({ IFRAME: true }, 'DEFAULT').isSliderMode).toBe(false)
  })
})

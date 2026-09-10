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

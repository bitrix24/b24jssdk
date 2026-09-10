/**
 * What the portal actually puts in `PLACEMENT_OPTIONS`, and why the SDK has to
 * normalise it before a caller sees it.
 *
 * Traced through the `rest` module of an on-premise build (`SM_VERSION
 * 26.150.0`). The value reaches a frame through
 * `BX.rest.AppLayout.MessageInterface.getInitData()`
 * (`bitrix/js/rest/applayout.js`), which hands back `this.params.placementOptions`
 * **verbatim** — whatever the page template rendered with
 * `CUtil::PhpToJsObject()`. So the shape is decided in PHP, by four different
 * producers:
 *
 * 1. **Default placement — the frame URL's query string.**
 *    `PlacementDataExtractor::run()` builds the value from
 *    `request->getQueryList()->toArrayRaw()` minus `HttpRequest::getSystemParameters()`
 *    and `_r`. So the keys are whatever was in the URL, in whatever case the
 *    caller wrote, and the values are **strings** — or nested objects, for
 *    `a[b]=c`. This is also where `IFRAME` comes from: `marketplace.js` opens the
 *    frame with `IFRAME=Y` in the URL, which is why {@link isSliderMode}
 *    compares against the string `'Y'` rather than a boolean.
 * 2. **Registered placement.** `app.placement/class.php` starts from an empty
 *    array, merges the options the placement was bound with, and forces an empty
 *    array when the parameter is not one. Values are arbitrary JSON the
 *    application stored at bind time.
 * 3. **A slider opened from JS.** `BX.rest.AppLayout.openApplication()` takes the
 *    caller's object, moves every `bx24_*` key out into side-panel settings and
 *    `delete`s them, and — if the object has an `options` key — replaces the whole
 *    thing with `placementOptions.params`. The object that arrives is not the
 *    object that was passed.
 * 4. **Nothing supplied at all.** `app.layout/class.php` defaults the parameter to
 *    `''`, and `CUtil::PhpToJsObject('')` renders an **empty string**.
 *
 * Case 4 is the one that broke the type. `Object.freeze` returns a primitive
 * unchanged, so `Object.freeze('')` is `''` and `Object.freeze(undefined)` is
 * `undefined` — a field declared `object` was holding neither, on a perfectly
 * ordinary portal, and the `any` on the getter meant nothing downstream noticed
 * (#485).
 *
 * A JSON **string** is normalised here too. That path does exist —
 * `app.layout/templates/.default/template.php` writes
 * `Json::encode($arParams['~PLACEMENT_OPTIONS'])` into a hidden form field — but
 * it feeds the POST re-submit, not `getInitData`, so it was not observed on the
 * handshake. Parsing it costs one `typeof` and removes a caveat the
 * documentation otherwise has to carry for ever.
 */

/**
 * Placement options as a caller sees them: always an object, never `undefined`.
 *
 * Values are `unknown` rather than `string`. The default-placement path really
 * does yield strings, being a query string — but a registered placement carries
 * whatever JSON the application stored, so promising `string` would replace one
 * lie with a narrower one.
 */
export type PlacementOptions = Readonly<Record<string, unknown>>

const EMPTY: PlacementOptions = Object.freeze({})

/**
 * A plain object — not `null`, not an array, which the portal never sends here.
 *
 * The `null` arm is a **type-soundness** guard, not a behavioural one, and no
 * test can distinguish it: removing it leaves the predicate claiming `null` is a
 * `Record<string, unknown>`, while the only place the result is used spreads it
 * — and `{ ...null }` is `{}`, exactly what the guard produces anyway. A
 * mutation sweep confirmed it survives. It stays because a type predicate that
 * lies about `null` is a trap for the next use, not because anything observable
 * depends on it today.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return 'object' === typeof value && null !== value && !Array.isArray(value)
}

/**
 * Bring whatever arrived in `PLACEMENT_OPTIONS` to a frozen object.
 *
 * Never throws and never returns `undefined`: a malformed value is indistinguishable
 * from an absent one as far as a caller can act on it, and an exception here would
 * fail the whole frame handshake over a parameter the application may not even read.
 */
export function normalisePlacementOptions(raw: unknown): PlacementOptions {
  if (isPlainObject(raw)) {
    return Object.freeze({ ...raw })
  }

  if ('string' === typeof raw && raw.length > 0) {
    try {
      const parsed: unknown = JSON.parse(raw)
      return isPlainObject(parsed) ? Object.freeze({ ...parsed }) : EMPTY
    } catch {
      // A backstop, not a handled case: none of the four producers above can
      // make a non-empty string that is not JSON. Silent rather than logged for
      // the same reason — warning about a shape nothing produces would be
      // guarding a guess, and this module has no logger to warn with. If one is
      // ever seen, that is the finding, and it belongs in an issue.
      return EMPTY
    }
  }

  return EMPTY
}

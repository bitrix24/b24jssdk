/**
 * Ambient declarations for the `@example` bodies in `packages/jssdk/src/**`.
 *
 * Same rule as the docs equivalent: a name goes here only when the pattern
 * appears across many examples. A one-off missing import is a defect in the
 * example — a reader copying that block gets code that does not run — and is
 * fixed there, not hidden here.
 */

// `Text` is the SDK's exported TextManager singleton. It needs an ambient
// because `lib: ["DOM"]` also declares a global `Text` — the DOM node
// constructor — so an example that calls `Text.numberFormat(...)` without
// repeating the import silently resolves to the wrong one. 26 of the 28
// property errors in the first run were this collision.
declare const Text: import('@bitrix24/b24jssdk').TextManager

// The live client. `B24Frame` rather than `B24Hook` so that frame-only members
// (.placement, .slider, .dialog, .parent, .options) resolve in short snippets;
// examples that construct their own client shadow this with a local const.
declare const b24: import('@bitrix24/b24jssdk').B24Frame
declare const $b24: import('@bitrix24/b24jssdk').B24Frame

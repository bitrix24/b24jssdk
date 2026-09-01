/**
 * Ambient declarations for the `ts` fences in `.github/contributing/**.md` (#435).
 *
 * Same rule as the skills gate, and for the same reason: **a real export of
 * `@bitrix24/b24jssdk` is never declared here.** If a fence needs `B24Hook`, the
 * fence imports it — a reader copying that block gets code that runs. An ambient
 * for a real export would make the gate green while the snippet stayed broken,
 * which is the failure the gate exists to prevent.
 *
 * What may go here is the surrounding context a guide's excerpt assumes and
 * deliberately does not show: a client the prose established paragraphs earlier,
 * a handler the reader is expected to have written.
 */

// The live client. `B24Frame` rather than `B24Hook` so frame-only members
// resolve; a fence that constructs its own client shadows this with a local
// `const`, which is why this is `let` — `declare const` would make that a
// TS2588 error.
declare let b24: import('@bitrix24/b24jssdk').B24Frame
declare let $b24: import('@bitrix24/b24jssdk').B24Frame

// Context these guides' excerpts assume and deliberately do not repeat. None of
// these is an export of `@bitrix24/b24jssdk` — they belong to the docs app, the
// test harness and the reproduction harness that each guide is describing, and
// a reader of that guide already has them in scope.

// `documentation.md`: a Nuxt auto-import in the docs app, not an SDK export.
declare function useB24(): { get: () => unknown }

// `testing.md`: the integration-test harness, re-exported from
// `test/0_setup/hooks-integration-jssdk.ts`. Declared loosely on purpose — the
// real signature is compiled where it lives, by `test:typecheck`.
declare function setupB24Tests(): {
  getB24Client: () => import('@bitrix24/b24jssdk').B24Hook
  getMapId: () => Record<string, any>
}

// `reproducing-user-reports.md`: the helpers the reproduction harness puts in
// scope inside its `SCENARIO` block. The shape is what a reader copies, which
// is the part worth compiling.
declare function call(method: string, params?: Record<string, any>, options?: { ver?: 'v2' | 'v3' }): Promise<any>
declare function step(title: string): void
declare function note(text: string, level?: 'info' | 'ok' | 'err'): void
declare function verdict(passed: boolean, why: string): void

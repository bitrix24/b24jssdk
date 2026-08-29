/**
 * Content Security Policy for the documentation site (#399).
 *
 * **The reasoning lives in
 * [`.github/contributing/docs-csp.md`](../../../.github/contributing/docs-csp.md)
 * — read it before changing anything here.** It covers why this is a `<meta>`
 * tag rather than a header, why it is emitted from a Nitro plugin rather than
 * `app.head.meta`, what each relaxation below is required by, and how to verify
 * a change. Deliberately not repeated here: two copies of an argument drift.
 *
 * What matters while editing *this* file:
 *
 *   - the tag must be **first** in `<head>` — a `<meta>` policy governs only what
 *     the parser reaches after it, so `unshift` is load-bearing;
 *   - it must appear exactly **once** — two policies are both enforced and a
 *     resource must satisfy the intersection;
 *   - `scripts/check-docs-csp-present.mjs` fails CI if either stops being true.
 */
const CONTENT_SECURITY_POLICY = [
  `default-src 'self'`,
  // 'unsafe-inline' — Nuxt's per-page inline hydration payload; hashes would
  // differ per page and one static tag cannot carry 151 sets of them.
  // 'wasm-unsafe-eval' — @nuxt/content's search is SQLite compiled to Wasm.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'`,
  // 'unsafe-inline' — Nuxt inlines critical CSS.
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self'`,
  `font-src 'self'`,
  `connect-src 'self'`,
  // Stated rather than left to fall back to `script-src`, which would drag
  // 'unsafe-inline' along with it. Both workers the site starts — @nuxt/content's
  // SQLite worker and the prettier formatting worker — are same-origin.
  `worker-src 'self'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'none'`,
  `frame-src 'none'`,
  `manifest-src 'self'`
].join('; ')

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', (html) => {
    html.head.unshift(`<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">`)
  })
})

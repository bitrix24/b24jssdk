/**
 * Content Security Policy for the documentation site (#399).
 *
 * **Read [`.github/contributing/docs-csp.md`](../../../.github/contributing/docs-csp.md)
 * before changing any of this.** Every source below was established by loading
 * the built site in a browser and removing directives until something broke.
 * `'wasm-unsafe-eval'` in particular cannot be checked any other way: nothing
 * touches the WebAssembly SQLite search until a visitor opens the search dialog,
 * so a policy missing it is clean on every page load and fails only in use.
 *
 * ## Why a `<meta>` tag
 *
 * The site is `nuxt generate` output on GitHub Pages, which cannot set response
 * headers — there is no mechanism. The `routeRules` headers in `nuxt.config.ts`
 * are inert there for the same reason; do not read their presence as evidence
 * that a header works.
 *
 * That costs `frame-ancestors`, `report-uri` / `report-to` and `sandbox`, which
 * are header-only and cannot be expressed at all.
 *
 * ## Why a Nitro plugin, and not `app.head.meta`
 *
 * A `<meta>` policy governs only what the parser reaches **after** it, so its
 * position decides how much of the page it covers. `app.head.meta` could not get
 * it high enough: even with `tagPriority: 'critical'` it landed 158 tags deep,
 * below the import map, the inline critical CSS, the entry stylesheet and 143
 * `modulepreload` hints. Unhead does not order those — Nitro and Vite emit them
 * directly — so no head configuration moves it above them.
 *
 * Prepending here puts it first in `<head>`, ahead of everything.
 *
 * It must appear exactly **once**. Two `<meta>` policies are both enforced and a
 * resource has to satisfy the intersection, which is a confusing way to make the
 * site stricter than anyone intended.
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

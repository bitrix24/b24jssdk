# The documentation site's Content Security Policy

Last reviewed: 2026-08-29.

The policy lives in `app.head.meta` in [`docs/nuxt.config.ts`](../../docs/nuxt.config.ts).
This page is why it says what it says, and how to change it without breaking the
site quietly.

## Why a `<meta>` tag and not a header

The site is `nuxt generate` output served by GitHub Pages, which cannot set
response headers. That is not a preference; there is no mechanism.

It is worth knowing because the same file sets `routeRules` headers — `Link`,
`Vary`, and `X-Frame-Options` / `Referrer-Policy` on `/api/**`. **Those are inert
on Pages.** They apply when the site runs under a Nitro server; on the deployed
static build nothing serves them. Do not read their presence as evidence that a
header-based approach works here.

Three directives are header-only and therefore **cannot be expressed at all**:

| Directive | What is lost |
| --- | --- |
| `frame-ancestors` | Nothing prevents another site framing ours. `X-Frame-Options` in `routeRules` does not fill the gap — it is inert for the same reason. |
| `report-uri` / `report-to` | No violation reporting. A policy that is too strict shows up only in a visitor's console. |
| `sandbox` | Not applicable here anyway. |

The first is a genuine residual risk, accepted: the site is public documentation
with no authenticated actions to clickjack.

## The policy

```text
default-src 'self';
script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self';
font-src 'self';
connect-src 'self';
worker-src 'self';
object-src 'none';
base-uri 'self';
form-action 'none';
frame-src 'none';
manifest-src 'self'
```

Everything is `'self'` because **the built site loads nothing from any external
origin** — no script, stylesheet, font, image, or fetch. That became true with
PR #407, which replaced the prettier CDN with a bundled copy. Before it, this policy
would have needed a jsDelivr exception in `script-src`, and the whole exercise
would have been worth much less.

Three relaxations, each required by something real:

| Relaxation | Why | If you remove it |
| --- | --- | --- |
| `script-src 'unsafe-inline'` | Nuxt emits an inline hydration payload on every page | Every page fails to hydrate |
| `script-src 'wasm-unsafe-eval'` | `@nuxt/content`'s search runs SQLite compiled to WebAssembly in the browser | Search silently returns nothing |
| `style-src 'unsafe-inline'` | Nuxt inlines critical CSS | The site renders unstyled |

`'unsafe-inline'` in `script-src` removes most of CSP's XSS protection, and it
cannot be avoided here: hashes would differ per page, and one static `<meta>` tag
cannot carry 151 sets of them. Nonces need a per-response server. What the policy
still buys is that **no external origin can be loaded at all** — which is the
threat #399 was actually about.

`worker-src 'self'` is stated rather than left to fall back to `script-src`,
because that fallback would carry `'unsafe-inline'` with it. Both workers the
site starts — `@nuxt/content`'s SQLite worker and the prettier formatting worker,
a module worker since #407 — are same-origin, so `'self'` is enough. Verified:
constructing the prettier worker with `{ type: 'module' }` under this policy
succeeds.

`img-src 'self'` carries no `data:`. Measured: the built site uses no `data:`
image URIs, in HTML or CSS. If you add one, the browser console will say so
immediately.

## Changing it

**Do not reason about a CSP. Measure it.** Every relaxation above was established
by removing it and watching what broke, and one of them — `'wasm-unsafe-eval'` —
is invisible on a statically loaded page: nothing touches the SQLite worker until
someone opens search, so a policy missing it looks perfectly clean.

```bash
npm i playwright        # not a dependency of this repo; remove it afterwards

NUXT_PUBLIC_SITE_URL=https://bitrix24.github.io \
NUXT_PUBLIC_BASE_URL=/b24jssdk \
NUXT_PUBLIC_CANONICAL_URL=https://bitrix24.github.io \
NUXT_PUBLIC_GIT_URL=https://github.com/bitrix24/b24jssdk \
NUXT_PUBLIC_USE_AI=false NUXT_PUBLIC_USE_TAB_B24FRAME=false \
pnpm run docs:generate

node scripts/check-docs-csp.mjs
```

The environment variables are not optional: without them the footer's
`${gitUrl}/releases` link becomes the relative path `/releases`, the prerenderer
crawls it, and the build fails with a 404 that says nothing about the cause.

[`scripts/check-docs-csp.mjs`](../../scripts/check-docs-csp.mjs) serves the built
site, loads a sample of pages in Chromium, **opens the search dialog on each**,
and reports every violation the browser raises. Pass paths to check others. Pass
a candidate policy in `CSP=` to try one without rebuilding — that is how to check
whether a relaxation is still load-bearing:

```bash
CSP="default-src 'self'; script-src 'self' 'unsafe-inline'" node scripts/check-docs-csp.mjs
```

## Why this is not in CI

It needs a full `docs:generate` and a browser, and `playwright` is not a
dependency of this repository. Adding both to catch a policy that changes perhaps
once a year is not a trade worth making.

The consequence is worth stating plainly: **nothing automatically catches a CSP
that is too strict.** It does not break the build, or any test. It breaks the
page, in the browser, for visitors. If you touch the policy, run the script.

## Related

- #399 — the issue; its first half (#407) removed the CDN this policy would
  otherwise have to allow
- [`docs-fork.md`](docs-fork.md) — this policy is also a divergence from upstream
  `nuxt/ui`, recorded there

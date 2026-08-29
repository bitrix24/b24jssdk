# `docs/` is a fork of `nuxt/ui`'s documentation site

Last reviewed: 2026-08-28
Upstream compared against: [`nuxt/ui`](https://github.com/nuxt/ui) branch `v4`, commit `b751eae` (2026-08-25)

This file exists so that pulling a fix down from upstream does not silently
revert something this fork does on purpose. Everything below is a **deliberate**
difference. Anything not listed here should be assumed to track upstream, and a
sync is the right instinct.

Two things to know before you start:

- **Statements about what upstream does are pinned to the commit above.** They
  were true then. Check them again before acting on them, and move the pin when
  you do — a claim nobody has re-checked in six months is folklore with a commit
  hash attached.
- **A downstream mirror keeps `docs/` byte-identical.** Deleting or renaming a
  file there lands on someone else's plate. #139 was filed by that mirror's
  maintainer; that is how it reaches us. It is also why this document lives
  here and not in `docs/`: it is a record about the fork, not content of the
  site, and adding a file upstream does not have would put it in the way of
  both the mirror and the next tree comparison.

## The divergences

### 1. Prettier is bundled, not fetched from a CDN

**Files:** [`app/workers/prettier.js`](../../docs/app/workers/prettier.js), [`app/plugins/prettier.ts`](../../docs/app/plugins/prettier.ts), [`nuxt.config.ts`](../../docs/nuxt.config.ts)
**Introduced:** #407 (#399 is the issue)

Upstream loads prettier and five parser plugins from jsDelivr with dynamic
`import()`. This fork bundles them.

A dynamic `import()` cannot carry an `integrity` attribute, so SRI was not
available even in principle, and the site sets no CSP — so nothing verified that
jsDelivr served the pinned bytes on any given request. `prettier` is already a
dependency of `docs/` (the server prerenders the same snippets), so the browser
was fetching a copy of something already on disk, and the version could drift
from the prerenderer's. It cannot now, because it *is* the prerenderer's.

Two mechanical consequences of bundling, both of which have to survive a sync:

- **`nuxt.config.ts` sets `vite.worker.format: 'es'`.** Vite builds a worker as
  an IIFE by default, and an IIFE cannot be code split, so every dynamic
  `import()` inside the worker is inlined into it — that put all 1.9 MB of
  prettier in the worker script. As a module worker the parsers stay a separate
  chunk. The cost is browser support: `new Worker(url, { type: 'module' })`
  needs Chrome/Edge 80+, Safari 15+, Firefox 114+. Contained failure — the
  worker is built lazily, so on an older browser in-page formatting does not
  happen and nothing else is affected.
- **`app/plugins/prettier.ts` imports `?worker`, not `?worker&inline`.**
  Inlining would base64-embed the parsers into the entry bundle, which is the
  page-weight problem bundling was supposed to avoid. It also constructs the
  worker on the **first format** rather than at plugin setup, restoring the
  timing the CDN version had.

**An earlier, smaller version of this divergence is gone.** Before #407 the fork
injected the prettier version at build time via a `__PRETTIER_VERSION__` define,
to keep the CDN URL in step with the manifest (upstream hard-codes the literal
and drifts). With no CDN URL left there is nothing to keep in step, and the
define was removed. If you find `__PRETTIER_VERSION__` anywhere, it is a leftover.

**To go back upstream** you would have to decide that third-party code execution
on the docs site is acceptable again. #399 is where that argument lives.

### 2. No wildcard CORS header on the code-examples endpoint

**File:** [`server/api/code-examples.get.ts`](../../docs/server/api/code-examples.get.ts)

Upstream sets `Access-Control-Allow-Origin: *`. This fork does not.

The only browser caller is same-origin: the `fetchCodeExample` composable. The
MCP `b24-jssdk-get-example` tool reaches it server-to-server, where CORS does not
apply at all. So the wildcard granted cross-origin read access to nobody who
needed it, on a read-only endpoint, and widened the surface for no reason.

**To change it:** if a cross-origin consumer ever appears, name it and scope the
header to that origin. Do not restore `*`.

### 3. `processLinks` / `prepareHref` in the MDC transform

**File:** [`server/utils/transformMDC.ts`](../../docs/server/utils/transformMDC.ts)

Local additions with no upstream counterpart. They rewrite documentation links
so that a link to a docs page also resolves under `/raw/*.md` (the plain-text
mirror that feeds `llms-full.txt`), and they map cross-project links through the
`B24_DOCS` table to the b24ui and b24jssdk sites.

Upstream has no `/raw` route and no sibling-project link table, so there is
nothing to sync here — but the surrounding file *is* upstream's, so a sync can
easily drop these two functions on the floor. They are called from
`transformMDC` near the end of the pipeline.

### 4. `codeTransform.ts` and `prettierWorkerApi.ts` are extracted modules

**Files:** [`app/utils/codeTransform.ts`](../../docs/app/utils/codeTransform.ts), [`app/utils/prettierWorkerApi.ts`](../../docs/app/utils/prettierWorkerApi.ts)
**Introduced:** #139

Upstream keeps both bodies inline. This fork extracted them so they can be unit
tested without a Nuxt app, a DOM, or a `Worker`.

`codeTransform.ts` carries a hard constraint the extraction exists to protect:
**it must stay free of Vue, Nuxt and SDK imports.** `server/utils/transformMDC.ts`
calls it during SSR and prerender, so anything constructing a client or reading
runtime config breaks `/raw/*.md` and `llms-full.txt`. It previously reached
`prepareCode` through the `useB24` composable, which builds `B24Hook` / `B24Frame`
— that is what #139 reported.

`prettierWorkerApi.ts` holds the postMessage/reply bookkeeping. Its contract is
why `workers/prettier.js` must reply to **every** message: a pending call sits in
`handlers` until a reply carrying its `uid` arrives, so a message that never gets
one is a promise that never settles, and `CodeExample.vue` awaits it forever.

**To go back upstream** you would be giving up the tests. There is no other
reason these files are separate.

## Keeping this file honest

- Add a divergence here **in the PR that introduces it**, not afterwards. The
  file-level comment is still worth writing — it is what someone editing that
  file sees — but a comment alone does not survive the second sync, because the
  next person has to already know to look for it.

  **Nothing enforces this.** No gate fails when a PR introduces a divergence and
  skips this file; it is the one rule here that is pure honour system, and it is
  therefore the one most likely to be skipped under time pressure. Said out loud
  so nobody mistakes an unchanged file for a verified one.
- Move the pin at the top whenever you actually compare against upstream, and
  say what you compared. Bumping it without looking is worse than leaving it
  stale, because it launders a guess into a fact. Also unenforced — but a stale
  pin fails safe, since every claim below is explicitly scoped to it.
- If a divergence stops being deliberate — upstream adopts it, or the reason
  expires — delete the entry and sync the file. An entry here is a claim that
  the difference is still earning its keep.

The **links** are enforced: `lint:md-links` checks every path this file cites, so
an entry recorded against a file that has since moved fails CI rather than
sending the next reader hunting. That covers where the divergences are, not
whether the list is complete — see the honour-system note above.

This document records decisions already taken. It does not answer whether
maintaining a fork of someone else's docs site is the right long-term position;
that question is #411.

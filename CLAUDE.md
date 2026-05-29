# CLAUDE.md — Contributor Reference

Quick orientation for AI assistants and new contributors working in this repository.

## Repository layout

```
packages/
  jssdk/           @bitrix24/b24jssdk — the main SDK package
  jssdk-nuxt/      @bitrix24/b24jssdk-nuxt — Nuxt integration
playgrounds/
  cli/             Node CLI playground
  nuxt/            Nuxt playground
docs/
  content/docs/    Markdown documentation pages (see below)
scripts/           Standalone Node.js CI/lint/typecheck scripts
.docs-typecheck/   Config for the docs code-block type-checker (see below)
```

## Development workflow

```bash
pnpm install
pnpm run dev:prepare      # builds jssdk (creates dist/), generates Nuxt types
pnpm run lint             # ESLint across the workspace
pnpm run typecheck        # full type-check: SDK + Nuxt + docs + playgrounds + docs blocks
pnpm run docs:dev         # start docs dev server
```

## Scripts reference

| Script | Purpose |
|---|---|
| `docs:lint-pages` | Validate frontmatter, required headings, audit-freshness |
| `docs:lint-links` | Check all internal `/docs/` links and fragment anchors |
| `docs:typecheck-blocks` | Type-check ` ```ts ` code fences in docs/content/docs/**/*.md |
| `docs:typecheck` | Nuxt's own type-check for the docs Nuxt app |
| `typecheck` | Runs all of the above plus SDK / playground type-checks |

## Documentation upkeep

All docs pages live under `docs/content/docs/`. The following CI gates keep them correct:

### 1. Frontmatter & structure (`docs:lint-pages`)

Pages in `category: actions` or `category: tools` must have the four required sections in order (`## Overview`, `## Method Signature`, `## Examples`, `## Alternatives and Recommendations`) and a `audited: YYYY-MM-DD` date.

### 2. Internal links (`docs:lint-links`)

Every `/docs/…` link in body text and frontmatter `links:` arrays must resolve to a real page, and every `#fragment` must match an actual heading on that page.

### 3. TS code-block type-checking (`docs:typecheck-blocks`)

Every ` ```ts ` or ` ```typescript ` fenced block in the docs is type-checked against the real `@bitrix24/b24jssdk` types by `scripts/docs-typecheck.mjs`. This gate was introduced in v1.1.3 to prevent broken examples from accumulating silently (see issue #50).

**How it works:**
- Each block is extracted to a temp file in `.docs-typecheck/tmp/`.
- `.docs-typecheck/globals.d.ts` supplies ambient `$b24` (`B24Frame`), `$logger` (`any`), `initializeB24Frame`, `hookUrl`, and `ImportMeta.dev`/`.env` extensions so short snippets compile without their own imports.
- `.docs-typecheck/tsconfig.json` drives tsc with relaxed settings (no `strict`, no `noImplicitAny`).
- Errors are reported as `docs/content/docs/…:line:col TS####: message`.

**Prerequisites for local runs:**
```bash
pnpm install
pnpm run dev:prepare   # must run first to build jssdk types
pnpm run docs:typecheck-blocks
```

**Opt-out marker:** Add `// @check-ignore` (or `// @check-ignore: <short reason>`) on the line immediately before a ` ```ts ` fence to skip a block. Use sparingly — prefer fixing the example. Always include a reason when the cause is non-obvious (e.g. `// @check-ignore: top-level return`, `// @check-ignore: partial snippet`).

**Adding new ambient globals:** If a new pattern appears on many pages (e.g. a new top-level helper), add a `declare const …` to `.docs-typecheck/globals.d.ts`. Keep it in sync with SDK public API — if a type is renamed or removed, update globals.d.ts accordingly.

### 4. Registering new pages in the prerender list

Every new docs page **must** also be added to the `pages` array in `docs/nuxt.config.ts`. Nitro uses this list to prerender the `/raw/docs/…<slug>.md` routes used for `Accept: text/markdown` content negotiation and `llms-full.txt` generation. Pages that exist as `.md` files but are absent from `pages` will be missing their raw routes, and `pnpm run docs:generate` will exit with code 1.

```
// docs/nuxt.config.ts
const pages = [
  ...
  '/docs/examples/my-new-page/',   // ← add one line per new page
  ...
]
```

The URL slug is the filename with the numeric sort-prefix stripped: `99.examples/3.my-new-page.md` → `/docs/examples/my-new-page/`.

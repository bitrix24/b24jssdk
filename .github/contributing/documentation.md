# Documentation

<sub>Last reviewed: 2026-09-05.</sub>

> **Agent-facing mirror:** the same surface, condensed for agents generating usage code, lives in [`skills/`](../../skills/README.md). The skill set has its own maintenance playbook ([`maintenance.md`](../../.github/contributing/maintenance.md)). When the public docs change here, the matching skill files usually need a refresh in the same PR.

The docs site is the public source of truth. Out-of-date documentation is treated as a bug equal to a broken test. Documentation updates ship in the **same PR** as the code change — use a `docs:` commit only when the change is documentation-only.

## File Location

Pages live under `docs/content/docs/` and use **kebab-case** filenames with a numeric prefix that controls navigation order:

```text
docs/content/docs/
├── 1.getting-started/
│   ├── 2.installation/
│   ├── 3.migration/
│   └── 7.ai/
├── 2.working-with-the-rest-api/
│   ├── 0.index.md
│   ├── 1.call-rest-api-ver2.md
│   ├── 1.call-rest-api-ver3.md
│   ├── 2.call-list-rest-api-ver2.md
│   ├── 2.call-list-rest-api-ver3.md
│   ├── 2.fetch-list-rest-api-ver2.md
│   ├── 2.fetch-list-rest-api-ver3.md
│   ├── 3.batch-rest-api-ver2.md
│   └── 3.batch-rest-api-ver3.md
└── 99.examples/
    ├── 0.index.md           # catalogue / landing
    ├── 10.entity-list.md    # B24UI paged list
    ├── 20.app-installation-wizard.md
    └── 30.node-hook-company-export.md
```

The leading number is sort order, not part of the URL slug. Pages that pair a v2 / v3 variant share a number (e.g. both `1.call-rest-api-ver2.md` and `1.call-rest-api-ver3.md` use `1.`).

## Required Frontmatter

Every page starts with YAML frontmatter:

```yaml
---
title: CallV3.make
description: 'Method for making Bitrix24 REST API version 3 calls.'
category: 'actions'
restApiVersion: 'rest-api-ver3'
navigation.title: Call
links:
  - label: CallV3
    iconName: GitHubIcon
    to: https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/core/actions/v3/call.ts
  - label: AjaxResult
    iconName: GitHubIcon
    to: https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/core/http/ajax-result.ts
  - label: AjaxError
    iconName: GitHubIcon
    to: https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/core/http/ajax-error.ts
  - label: SdkError
    iconName: GitHubIcon
    to: https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/core/sdk-error.ts
---
```

| Field | Required | Notes |
| --- | --- | --- |
| `title` | yes | Used as the page heading |
| `description` | yes | One sentence; appears under the title and in OG meta |
| `navigation.title` | optional | Short label for the sidebar; falls back to `title` |
| `category` | for action pages | One of: `actions`, `frame`, `helper`, `tools`, … (use existing values; don't invent new categories without coordination) |
| `restApiVersion` | for action pages | `rest-api-ver2` or `rest-api-ver3` — drives the `::rest-api-version-only` filter |
| `links` | yes for API pages | Each entry points to the source file backing this page. Always include the primary class plus `Result`/`AjaxResult`/`AjaxError`/`SdkError` when relevant |

The `links` block is how readers (and agents) jump from a doc page to the implementation. **Keep these links accurate** — every page in `2.working-with-the-rest-api/` already follows this pattern, copy from the closest existing page. CI enforces this: a `blob/main/` target in `links:` whose file no longer exists fails the `docs-lint` job (#117).

**In-page links must be site-absolute.** Link to another doc page with an absolute route (`[Call v3](/docs/working-with-the-rest-api/call-rest-api-ver3/)`), never a relative `./` or `../` path — relative links silently fail to resolve in Nuxt Content and are rejected by CI (#102).

## Page Structure

A standard API page has these sections, in order:

1. **Notices** — `::warning` / `::caution` blocks at the very top for deprecation, migration, or "page in progress" notes.
2. **Overview** — one or two paragraphs of prose.
3. **Method Signature** — TypeScript signature in a fenced code block.
4. **Parameters** — table of name / type / description.
5. **Returns** — what the method returns (`Result`, `AjaxResult`, …).
6. **Examples** — runnable snippets.
7. **Limitations / Key Concepts** — what callers must know that isn't obvious from the signature.
8. **Error Handling** — `SdkError` invariants and `AjaxError` codes the method can produce.

When the change touches the method signature, parameters, return shape, runtime behaviour, error codes, or warnings emitted, sync **all** of these sections in the same PR.

## Language

- All documentation prose, parameter tables, code samples, and notes are **English**.
- Use sentence case for headings (`## Working with batches`, not `## Working With Batches`).
- Be concise; show, don't tell. Prefer a runnable example over a paragraph of prose.

## MDC Blocks Used in This Project

The docs site is Nuxt Content with MDC. Use the components that are already in use — don't introduce new ones without coordinating with the docs maintainer.

### Notices

```md
::warning
We are still updating this page. Some data may be missing here — we will complete it shortly.
::

::caution{title="⚠️ REST API DEPRECATION"}
**Bitrix24 is gradually transitioning to REST API version 3**.

- When calling methods [available in REST API v3](https://apidocs.bitrix24.com/api-reference/rest-v3/index.html), the method automatically logs a warning.
::

::note
Cursor-based paging is preferred over manual `start` increments.
::
```

### REST-version filtering

`::rest-api-version-only` shows different prose depending on which API version the reader has selected:

```md
::rest-api-version-only
#rest-api-ver2
The library supports both REST API version 2 and the new version 3.
::
```

### Callouts with link

```md
::callout{color="air-secondary" iconName="GitHubIcon" title="AuthActions interface" to="https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/types/auth.ts"}
Source for the AuthActions surface used by `B24Frame`.
::
```

### Code examples

````md
::code-example
```ts
import { B24Hook } from '@bitrix24/b24jssdk'

// Read the URL from env / config; never hard-code the webhook secret.
const b24 = B24Hook.fromWebhookUrl(
  'https://your-portal.bitrix24.com/rest/YOUR_USER_ID/YOUR_WEBHOOK_SECRET/'
)
const result = await b24.actions.v3.call.make({
  method: 'user.current',
  requestId: 'docs/user.current'
})
console.log(result.getData().result)
```
::
````

> Compile-checked example: [`documentation-b24hook-example.ts`](../../test/some-code-from-docs/contributing/documentation-b24hook-example.ts)
>
> **CI guard:** the `docs-lint` job runs [`scripts/check-v3-method-refs.mjs`](../../scripts/check-v3-method-refs.mjs) over docs, skills, `README-AI.md` **and `packages/jssdk/src/`**. Two layers: it blocks examples that call a non-existent `actions.v3.*` action (real actions: `call` / `callList` / `fetchList` / `callTail` / `fetchTail` / `batch` / `batchByChunk`), and it holds every v3 **method name** against a committed snapshot of a portal's own OpenAPI document — see below.

### Checking a v3 method name against a portal snapshot

The docs call `rest.documentation.openapi` the source of truth for what exists on v3, and now something compares against it. `scripts/data/openapi-<kind>-<date>.json` is a reduction of that document — method name, module, operations — carrying a portal **kind** and never a domain, a scope or a credential.

A name is only judged in a **method position**: a `method: '…'` literal, a v3 batch tuple, a parameter-table row whose first cell is `method`, or a JSDoc bullet documenting the `method` option. A backticked name in ordinary prose is not one, because this project writes `result.items` the same way it writes `crm.item.list`.

Two verdicts, and only one of them fails:

- a name in a v3 position that **no** snapshot publishes → **failure**, with `file:line`;
- a portal method the docs never mention → informational. Never a failure — the great majority of what a portal publishes is undocumented here, and a check that is red by design gets switched off. `pnpm lint:v3-coverage` prints the current figure rather than this sentence carrying one.

A name published by **one** snapshot is accepted. Portals genuinely differ: the audit in #472 reported two cloud portals measured a day apart disagreeing on 28 methods, and every on-premise method existing in the cloud while 98 cloud ones did not exist on the box. Those figures are that issue's, not something this repository can reproduce — only cloud snapshots are committed. A snapshot is a baseline for prose, not a catalogue, and this must never gate runtime.

**Deliberate anti-examples and placeholders** are marked with the same `// @check-ignore: <reason>` this repository already uses, on the line, the line above, or the nearest non-empty line before the fence. **The reason must name the method**, e.g. ``// @check-ignore: `some.method` is a placeholder, not a portal method``. That is deliberate: two fences already carried a marker written for the typecheck gate, and without the name an exemption granted for one reason would silently grant the other.

**Refreshing a snapshot** is a local step — CI never calls a portal:

```bash
B24_HOOK='https://<portal>/rest/<userId>/<secret>/' V3_SNAPSHOT_KIND=cloud \
  node scripts/check-v3-method-refs.mjs --refresh
```

`V3_SNAPSHOT_KIND` is the portal kind (`cloud`, `on-premise`), never a domain. Re-run it when a Bitrix24 release adds v3 methods, or when a name you know is real is rejected. `--coverage` prints the per-module table and always exits 0 — that is the number to quote in a PR.

**Commit the new file and keep the old one.** An earlier version of this guide said to delete the snapshot it replaces; that is wrong, and #472 measured why. Methods *disappear* as well as appear, and since the gate accepts a name published by **any** snapshot, deleting the older file is what would turn a still-correct page red. Keeping both is also the only way drift can be measured at all.

The trade that comes with it, stated because it is a real one: the union is monotonic. A name the portal published once and withdrew stays accepted for as long as the snapshot that carried it is kept, so the question the gate answers slides from *"does this exist?"* towards *"has this ever existed?"*. That is the cheaper mistake — a stale acceptance costs a page documenting a withdrawn method, a stale rejection blocks a contributor documenting a real one — but it is not free.

**Pruning** is therefore a deliberate act, and `pnpm lint:v3-coverage` gives you the number to justify it: each snapshot's line reports how many names **only it** publishes that this repository documents. When that is zero, dropping the file narrows the union without red-lighting anything, and the PR should say so.

**How fast a snapshot goes stale** is measured rather than guessed, and the figure lives in `--coverage` rather than in this paragraph — a number written here would go stale exactly the way the snapshot does. Run `pnpm lint:v3-coverage`: it prints, per portal kind, the age of the newest snapshot and what changed between the two most recent ones. The first measurement of that kind was not small, so treat a months-old snapshot as a real problem rather than a tidy-up.

Two things it prints alongside, and they are the reason it is a report and not a gate. Two points are a line rather than a trend. And a rate measured across a window in which the *portal's* tariff, installed applications or webhook scopes changed measures that change, not Bitrix24 publishing — `rest.documentation.openapi` returns what this portal exposes to this hook, so a whole module appearing may mean an entitlement was switched on.

> **Refresh from a portal you own.** For the same reason, a snapshot's module list reflects the refreshing portal's tariff, installed applications and the scopes its webhook was given — it is weakly identifying, and a series of them records when those changed. Do not run `--refresh` against a customer's or an employer's portal and commit the result: that publishes their module inventory. Prefer the environment (`export B24_HOOK=…`) or a `.env` file over putting the hook on the command line, where it lands in shell history and in `ps` output.

(Separate from `// @check-ignore` used alone, which skips the `docs:typecheck-blocks` TypeScript pass.)

#### Runnable examples (`<CodeExample>`)

The inline form above is a plain fenced block. Most pages instead pull a real,
type-checked file so the snippet can be run against a live portal from the page:

```md
::code-example{name="call-rest-api-ver2" lang="ts"}
::
```

The file lives at `docs/app/examples/<name>.ts` and looks like this:

```ts
import { B24Hook } from '@bitrix24/b24jssdk'

export async function Action_callRestApiVer2() {
  // region: start ////
  const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('…')
  // …the code the page shows…
  // endregion: start ////
}
```

Only the imports and the span between the two markers are published. The
wrapper function, the markers themselves and anything after `endregion: start`
are stripped by [`docs/app/utils/codeTransform.ts`](../../docs/app/utils/codeTransform.ts),
which also rewrites the `useB24()` live-portal override out of the published
snippet. Body lines are dedented by the smallest indentation shared by the
region's non-blank lines, so the wrapper's level is removed whatever it is —
two spaces, four, or a tab. Relative nesting inside the snippet is preserved.

**Names must be unique by basename across the whole tree.** Examples are
addressed by basename — that is what `name=` takes and what
`/api/code-examples/:name?` serves, and that route is a single segment — so two
files called `foo.ts` in different subdirectories would overwrite each other and
a page would show the wrong code. The build fails on a duplicate rather than
letting that happen:

```text
[code-example] duplicate example name "tools-ping":
  …/examples/subdir/tools-ping.ts
  …/examples/tools-ping.ts
```

### Steps

```md
::steps{level="3"}

### Install the SDK

…

### Initialise the client

…

::
```

## Linking Docs Pages to Source

The `links:` block in frontmatter is the canonical pointer from documentation to source. Whenever you add a new public method or class:

1. Find the matching docs page (or create one) under `docs/content/docs/`.
2. Add an entry to `links:` for the new symbol pointing to `https://github.com/bitrix24/b24jssdk/blob/main/<path>`.
3. If the page documents an action (`b24.actions.vX.call.make`, `callList.make`, `fetchList.make`, `batch.make`, `batchByChunk.make`), include `Result`, `AjaxResult`, `AjaxError`, and `SdkError` links so readers can navigate to the result/error types from any action page.

## Pairing Code, Tests, and Docs

These three move together:

```text
packages/jssdk/src/core/actions/v3/call.ts        # implementation
test/integration/core/actions-v3-call.spec.ts     # integration test (no mocks)
docs/content/docs/2.working-with-the-rest-api/    # docs page
  1.call-rest-api-ver3.md
test/some-code-from-docs/<corresponding>.ts       # docs snippet, kept compilable
```

When the implementation changes:

- Update the docs page in the same PR.
- If a runnable snippet appears in the page, mirror the change to `test/some-code-from-docs/`.
- New errors / warnings must be mentioned under "Error Handling" or "Limitations".

## Categories

| Category | Used for |
| --- | --- |
| `actions` | Transport-level actions (`call`, `call-list`, `fetch-list`, `batch`) |
| `frame` | `B24Frame` and iframe-only managers (slider, dialog, placement, …) |
| `helper` | `B24HelperManager` and its sub-managers |
| `tools` | Public utilities under `src/tools/` |
| `limiters` | Limiter stack and `RestrictionParams` reference (page `77.limiters.md`) |

Use existing categories. New categories belong in a separate doc-only PR so the navigation can be reviewed independently.

## Writing Guidelines

1. **Sentence case** for headings.
2. **English only** — prose, tables, code comments inside snippets.
3. **Show, don't tell** — runnable examples beat long explanations.
4. **One idea per section** — split rather than nest.
5. **Mention every new warning, error, or `SdkError` code** in "Limitations" or "Error Handling".
6. **Update parameter tables** when method signatures change — type and description, both.
7. **Use `::warning` for "page in progress"** notes; remove them when the page is complete.
8. **Use `::caution{title="⚠️ REST API DEPRECATION"}`** for any v2 method that has a v3 equivalent; the SDK will emit a runtime warning that mirrors the doc note.

## Doc-Only Changes

If the change is documentation-only (typo, clarification, link fix), use a `docs:` commit. Otherwise, the documentation update is part of the `feat:` / `fix:` commit that introduced the code change — do not split.

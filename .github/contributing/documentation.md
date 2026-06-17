# Documentation

<sub>Last reviewed: 2026-06-17.</sub>

> **Agent-facing mirror:** the same surface, condensed for agents generating usage code, lives in [`skills/`](../../skills/README.md). The skill set has its own maintenance playbook ([`maintenance.md`](../../.github/contributing/maintenance.md)). When the public docs change here, the matching skill files usually need a refresh in the same PR.

The docs site is the public source of truth. Out-of-date documentation is treated as a bug equal to a broken test. Documentation updates ship in the **same PR** as the code change — use a `docs:` commit only when the change is documentation-only.

## File Location

Pages live under `docs/content/docs/` and use **kebab-case** filenames with a numeric prefix that controls navigation order:

```
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
|-------|----------|-------|
| `title` | yes | Used as the page heading |
| `description` | yes | One sentence; appears under the title and in OG meta |
| `navigation.title` | optional | Short label for the sidebar; falls back to `title` |
| `category` | for action pages | One of: `actions`, `frame`, `helper`, `tools`, … (use existing values; don't invent new categories without coordination) |
| `restApiVersion` | for action pages | `rest-api-ver2` or `rest-api-ver3` — drives the `::rest-api-version-only` filter |
| `links` | yes for API pages | Each entry points to the source file backing this page. Always include the primary class plus `Result`/`AjaxResult`/`AjaxError`/`SdkError` when relevant |

The `links` block is how readers (and agents) jump from a doc page to the implementation. **Keep these links accurate** — every page in `2.working-with-the-rest-api/` already follows this pattern, copy from the closest existing page.

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

```md
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
```

> Compile-checked example: [`documentation-b24hook-example.ts`](../../test/some-code-from-docs/contributing/documentation-b24hook-example.ts)

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

```
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
|----------|----------|
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

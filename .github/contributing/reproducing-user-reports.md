# Reproducing user reports

<sub>Last reviewed: 2026-06-27.</sub>

How to handle a "I did X, nothing worked — here's my snippet" report. These land
as issues or chat messages and are usually **not** SDK bugs: the SDK forwards
the REST call unchanged and surfaces the server's answer (including soft errors
on the `AjaxResult`). Most failures come down to the **caller's context** — auth
type (webhook vs application OAuth), missing scopes, or the wrong method — or a
platform-side change. So the rule is: **reproduce before concluding.**

## The loop

1. **You get a report** (a complaint plus a small code snippet).
2. **Assemble the call chain** as a scenario on a branch (see below).
3. **The maintainer runs it locally** in the nuxt playground, inside Bitrix24.
4. **Read the log** — each call's request and response.
5. **Hand the transcript back**; confirm the result or fix the chain.
6. **Form the answer** for the reporter: "call it like this and it works", or a
   concrete cause (scope/context/method), or — if it's a platform regression — a
   minimal repro to file with Bitrix24 technical support.
7. **Attach the transcript to the issue** (and to any Bitrix24 support report) as
   the evidence of what ran — the request/response chain, not just a verdict.
   Redact the tunnel host and any private data first (see Gotchas → Privacy).

## The tool

`playgrounds/nuxt/app/components/IssueReproHarness.vue` (wired into
`app/pages/index.vue`). It runs inside `B24Frame` — the **application OAuth
context**, which is what most reports actually need (a webhook can't do
everything an app can).

Edit **only** the `SCENARIO` block. Use the helpers the harness provides:

```ts
// v2 by default; pass { ver: 'v3' } for the v3 endpoint
await call('crm.deal.userfield.add', { fields: { /* … */ } })
await call('some.method', { /* params */ }, { ver: 'v3' })
step('1 · what this group does')   // section header in the log
note('an observation', 'ok')        // 'info' | 'ok' | 'err'
verdict(true, 'why it passed')      // plain pass/fail line
```

Every `call()` records the **request (method + params)** and the **response**
(or error), with the API version and duration. Always **clean up** anything the
scenario creates so the portal is left as it was.

## Running it locally

```bash
pnpm --filter ./packages/jssdk build   # the playground depends on dist
cd playgrounds/nuxt
cp .env.example .env
pnpm dev                               # http://localhost:3001
```

The app must run **inside** Bitrix24, so expose the dev server with a tunnel and
allow the tunnel host:

```bash
# playgrounds/nuxt/.env
NUXT_ALLOWED_HOSTS=your-tunnel.example.dev
```

Register a local application (with UI) in **Applications → Developer resources →
Local application**, point the handler at the tunnel URL, and grant the scopes
the scenario needs. Open the app and press **Run scenario**.

## Reading the result

The live log shows compact one-liners (`#n method [ver] · Nms · OK/ERROR`).
Below it, the full chain is rendered as raw markdown in a `<pre>` — select all
and copy it back. The transcript pairs every request with its response, e.g.:

```text
### #4 crm.deal.userfield.add [v2] — OK (195ms)
request:
{ "fields": { "USER_TYPE_ID": "cs_test_obj_…", … } }
response:
247
```

## Deciding the outcome

| Finding | Action |
|----|----|
| The chain works in the app context | Answer the reporter with the working chain; the difference is their context/scope/method. Not an SDK bug. |
| The chain fails the same way | Compare against the report — narrow to context, scope, or method, then advise. |
| The SDK transforms/sends something wrong | That's a real SDK bug — fix it with a test in the same PR. |
| It misbehaves across portals with unchanged code | Likely a platform regression — attach the transcript and file it with Bitrix24 technical support. |

## Gotchas worth remembering

- **Webhook vs application context.** Some methods are application-only and a
  webhook is rejected outright (`WRONG_AUTH_TYPE` / *Application context
  required*) — e.g. `userfieldtype.*`. Reproduce in the context the user
  actually uses.
- **Scopes.** Custom user types / user fields need the matching scopes
  (`crm`, `user.userfield`, `userfieldconfig`). A "worked before, now fails"
  with unchanged code often points at context or scope, not the SDK.
- **The SDK is a pass-through.** `actions.v{2,3}.*.make()` sends the call and
  returns the server's answer; a server `error` becomes a soft error
  (`response.isSuccess === false`). Don't fix "by symptom" — get the cause.
- **Privacy.** Don't commit a reporter's private data (portal URLs, tokens,
  member ids) into the repo. The scenario uses throwaway, generated names and
  `window.location.origin` for any handler URL.

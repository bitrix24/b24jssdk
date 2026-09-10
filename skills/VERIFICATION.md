# Verifying the skills against a real portal (#113)

CI already compiles every snippet in every skill (`pnpm run skills:typecheck`).
That proves they type-check against the built SDK types. It does not prove the
portal answers the way the skill says it does — which is what #113 asks for.

This splits in two, because half of it cannot be scripted.

| | How | Who |
| --- | --- | --- |
| **Part A** — everything a webhook can reach | `pnpm run skills:verify` | anyone with `.env.test` |
| **Part B** — everything that needs a live placement iframe | by hand, in a browser | someone with an installed app |

---

## Part A — scripted

### Setup for the scripted pass

```bash
cp .env.test-example .env.test
# set B24_HOOK to a real webhook URL
pnpm run skills:verify
```

The webhook needs the scopes the skills document — at minimum `crm`, `task`,
`user`. A narrower webhook still works; cases it cannot reach report as skips,
not failures (see *Reading the output*).

### What it covers

Everything is discovered at run time — the suite finds a task, a deal and a
contact on your portal rather than assuming fixed ids, so it runs anywhere.
It is read-only.

| Skill | Verified |
| --- | --- |
| `b24jssdk-core` | boot snippet reaches the portal; an unknown method is a **soft** error on the `Result`, not a throw; the operating-budget fields the skill documents are present |
| `b24jssdk-rest` | `actions.v2.batch` (one result per command), `v2.callList`, `v2.fetchList` (chunked), `v3.call`, `v3.callList` on `tasks.task.list` **without** a `cursorIdKey` override — the claim in the skill's table; a non-v3 method fails softly rather than throwing; **`v3.aggregate` availability asked of the portal in one call** and reported, not asserted — see below |
| `b24jssdk-filtering` | a v2 prefix-keyed filter actually narrows rows; a v3 array-of-triples filter is accepted; `callList` **strips a caller-supplied `order`** — asks for `DESC`, asserts the rows come back ascending |
| `b24jssdk-helpers` | `initB24Helper` over a webhook loads Profile + Currency; `currency.format` uses the portal's own rules (the formatted value is printed) |
| `b24jssdk-vibecode` | the SDK-side calls the skill documents succeed |

### The one question this run is expected to answer: does any shipped module expose `*.aggregate` yet?

**The contract itself is no longer in question.** It was measured against a
module written for the purpose (PR #498), reaching the same
`AggregateOrmActionTrait` / `OrmRepository::getAllWithAggregate()` every future
module will: values come back as **strings**, an aggregate over an empty match is
`null` except `count` (which is `'0'`), and the `{ result: { result } }` double
envelope the reference §7 describes is real. `AggregateResultV3` says so, and the
docs no longer hedge on the shape.

What is still unmeasured is the **use case**: no *shipped* module publishes an
`*.aggregate` action on any of the four portals checked, so no per-module
behaviour has been observed and the action keeps its `@experimental` tag for that
reason alone. That is what this check is looking for.

So the suite asks the portal for its own document in **one call**:
`rest.documentation.openapi`, then lists every path ending in `.aggregate`. It
prints a block headed `[skills-live] v3 aggregate availability`.

That replaced a six-module survey — `tasks.task`, four `crm.*` and
`main.eventlog`, each probed with `select: { count: ['id'] }`. Every line came
back `SOFT` on every portal, four of the six being `crm.*`, which on v3 exists
only as timeline email. One request now answers for the **whole portal** instead
of six guesses, and it cannot print anyone's row counts — which is why the
warning this section used to carry about posting real deal counts is gone.

**An empty list cannot fail the run**, by design: a portal where no module
supports `aggregate` is a fact about Bitrix24's v3 rollout, not a defect in a
skill file. Everything around that answer is asserted, though — the document has
to arrive and has to list methods — so unlike the six-probe loop this replaced,
a green line here does mean the portal was asked and answered. What it does not
tell you is *what* the answer was: **read the output**.

A portal that scope-gates `rest.documentation.openapi` reports SKIP rather than
FAIL. That needs handling inside the case: the refusal arrives soft, and the
suite's limitation classifiers only see thrown errors.

| Output | Means | What to do |
| --- | --- | --- |
| `*.aggregate: (none)` | no shipped module on this portal opts into `AggregateOrmActionTrait` | Expected today. Record the method count alongside it — the denominator is what makes the zero informative. |
| `*.aggregate: <names>` | the exit condition is met | Record the names. `AggregateV3`'s tag can be revisited against a real method, and its per-module behaviour observed for the first time. |
| the case fails on `isSuccess` | the document did not arrive | **A defect worth reporting** — that is a transport problem, not an answer about aggregate. |

Paste the block into #113 — and if you are pasting a *failure* rather than the
block, redact the portal domain first (see the note at the end of this file):
portal prose reaches an error message verbatim, and redaction does not cover it.
If the list is empty, nothing changes: `AggregateV3`
keeps its `@experimental` tag — not because the contract is unknown, but because
no shipped module exercises it — the docs keep telling readers to reduce a
`callList` client-side, and `AjaxResult.getTotal()` remains the only count
available under `restApi:v2`, which is why it was kept out of the `3.0.0`
removal set. A non-empty list is the interesting outcome: it names the first
module that can lift the tag.

### Reading the output

Three outcomes, and the distinction is the point:

- **pass** — the skill is right about this portal.
- **`SKIP — … portal limitation [CODE]`** — your webhook or plan cannot do this.
  Says nothing about the skill. Common on trial portals and narrow webhooks.
- **`FAIL — … error [CODE]`** — the skill documents something that does not
  work. **This is the finding #113 is after.** Copy the line into the issue.

A failure whose code looks like a limitation the suite does not yet recognise is
still a failure by design — the pattern list in the spec is deliberately narrow,
because erring towards "skip" would hide exactly what this is for. If you hit
one, paste the code and it gets added rather than guessed at.

> Portals answer in the portal's language. The classifier matches both English
> and Russian; a portal in a third language will surface unfamiliar text as a
> failure with the code attached.

### Recording the result

If you paste this into a public issue, replace the domain with a placeholder —
the plan and the scopes are what matter, and the domain identifies the portal.

```text
Portal:            (domain or placeholder, plan)
Webhook scopes:
Date:
skills:verify →    N passed, N skipped, N failed
Failures:          (paste the FAIL lines)
```

---

## Part B — manual, needs a live placement

None of this can run from a webhook: it needs the app open **inside** a Bitrix24
placement iframe, because the SDK talks to the parent window over `postMessage`.

### Setup for the placement pass

[`reproducing-user-reports.md`](../.github/contributing/reproducing-user-reports.md#running-it-locally)
already describes this setup end to end — building the SDK, running the Nuxt
playground, exposing it with a tunnel via `NUXT_ALLOWED_HOSTS`, and registering
a local application **with UI** under *Applications → Developer resources →
Local application*. Follow it; there is no second way to do this.

Two things that pass differs in:

- **Bind a placement**, not just install the app. Rows 8–9 need the app opened
  *from* a placement, so the handler has to be registered against one — an app
  that only opens from the left menu has no placement context and
  `$b24.placement.title` comes back empty.
- **Scopes.** Grant `crm` (row 5), `user` (row 4), `task` if you want the
  helper rows to have data, and `placement` (rows 8–9). Missing a scope shows
  up as the manager rejecting, not as a blank screen.

Each row names the skill file and the section, so a mismatch has a place to be
fixed. Record **observed**, not "looks fine".

### `b24jssdk-frame-ui/SKILL.md`

| # | What to do | Expected | OK? | Observed |
| --- | --- | --- | --- | --- |
| 1 | `$b24.slider.openPath(path)` | the slider opens on that path | ☐ | |
| 2 | `$b24.slider.openSliderAppPage(params)` | the app page opens in a slider | ☐ | |
| 3 | close the slider from inside | the promise the skill documents settles, with the documented shape | ☐ | |
| 4 | `$b24.dialog.selectUser()` | user picker opens; the resolved value matches the skill's shape | ☐ | |
| 5 | `$b24.dialog.selectCRM()` | CRM picker opens; resolved shape matches | ☐ | |
| 6 | `$b24.parent.fitWindow()` | the iframe resizes to content | ☐ | |
| 7 | `$b24.parent.setTitle(...)` | the portal's title area changes | ☐ | |
| 8 | `$b24.placement.title` / `.options` / `.isSliderMode` | identify the placement the app was opened from, and the params it was given | ☐ | |
| 9 | `$b24.placement.setValue(...)` | value persists; re-open the placement to confirm | ☐ | |
| 10 | `$b24.options` round-trip (app and user) | written value reads back after a reload | ☐ | |

### `b24jssdk-helpers/SKILL.md` — the frame half

| # | What to do | Expected | OK? | Observed |
| --- | --- | --- | --- | --- |
| 11 | `initB24Helper` with `LoadDataType.App` | `helper.appInfo.data` populated; `statusCode` is an `EnumAppStatus` value | ☐ | |
| 12 | `LoadDataType.AppOptions` / `UserOptions` | both load; `helper.appOptions.encode` round-trips | ☐ | |
| 13 | `usePullClient()` + `useSubscribePullClient(...)` then `startPullClient()` | subscription receives a message (trigger one via `helper.appOptions.save` with the `command` option, per the skill) | ☐ | |
| 14 | `helper.appOptions.save({...}, { moduleId, command })` | saves **and** broadcasts the Pull event the skill describes | ☐ | |
| 15 | read `helper.profileInfo` **before** `initB24Helper` resolves | throws `B24HelperManager.profileInfo not initialized` — the skill's stated guard | ☐ | |

### `b24jssdk-core/SKILL.md` — the frame boot

| # | What to do | Expected | OK? | Observed |
| --- | --- | --- | --- | --- |
| 16 | `initializeB24Frame()` | resolves inside the placement | ☐ | |
| 17 | the same page opened **outside** a placement | fails the way the skill says it does, not by hanging | ☐ | |

---

## Closing #113

The issue's acceptance criteria, and where each is answered:

- [x] every snippet compiles — `skills:typecheck`, already in CI
- [ ] every REST-calling snippet verified live — Part A, plus rows 1–17 for the
      frame-only ones
- [x] the v3 whitelist table matches `version-manager.ts` — **already true**:
      the SDK dropped the allowlist (`automaticallyObtainApiVersion` ignores the
      method and returns v2, `isSupport` returns `true` unconditionally), and
      `b24jssdk-rest/SKILL.md` says so and lists known families as
      non-exhaustive. Nothing to reconcile.
- [ ] patterns that changed since the 2026-05 migration updated — whatever Parts
      A and B turn up
- [ ] open questions resolved or deferred with a reason — the issue says
      `skills/REPORT.md`, which does not exist; the file is
      [`.github/contributing/report.md`](../.github/contributing/report.md)
      (same for `skills/SUGGESTED-EXAMPLES.md` →
      [`suggested-examples.md`](../.github/contributing/suggested-examples.md))
- [ ] `skills/README.md` migration note updated once the pass is done
- [ ] the `v3 aggregate availability` block pasted into the issue, and
      `AggregateV3`'s `@experimental` tag revisited if the portal named any
      `*.aggregate` method

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
| `b24jssdk-rest` | `actions.v2.batch` (one result per command), `v2.callList`, `v2.fetchList` (chunked), `v3.call`, `v3.callList` on `tasks.task.list` **without** a `cursorIdKey` override — the claim in the skill's table; a non-v3 method fails softly rather than throwing; **`v3.aggregate` surveyed across six modules** and reported, not asserted — see below |
| `b24jssdk-filtering` | a v2 prefix-keyed filter actually narrows rows; a v3 array-of-triples filter is accepted; `callList` **strips a caller-supplied `order`** — asks for `DESC`, asserts the rows come back ascending |
| `b24jssdk-helpers` | `initB24Helper` over a webhook loads Profile + Currency; `currency.format` uses the portal's own rules (the formatted value is printed) |
| `b24jssdk-vibecode` | the SDK-side calls the skill documents succeed |

### The one question this run is expected to answer: does `v3.aggregate` work at all?

`actions.v3.aggregate.make` is marked `@experimental` in the SDK, and the working
assumption is **that it does not work on any module yet**. Nobody has run it
against a portal. That matters beyond the action itself, because two documents
currently hedge on it — `AjaxResult.getTotal()`'s JSDoc and the `restApi:v3`
count advice in `b24jssdk-rest/SKILL.md` and `README-AI.md` — and the hedge can
only be replaced by a real answer.

So the suite **surveys** it rather than probing one method: `tasks.task`,
`crm.deal`, `crm.contact`, `crm.company`, `crm.lead` and `main.eventlog`, each
with `select: { count: ['id'] }`. It prints a block headed
`[skills-live] v3 aggregate survey`, one line per module.

This case **cannot fail the run**, by design: a portal where no module supports
`aggregate` is a fact about Bitrix24's v3 rollout, not a defect in a skill file.
That makes it the one green line in this suite that proves nothing on its own —
**read the output**.

| Line | Means | What to do |
| --- | --- | --- |
| `OK` | the endpoint exists and returned buckets | Record the module and the exact bucket shape. If the shape is single-level rather than the reference's `{ result: { result } }`, that is the `AggregateV3` fallback warning firing — say so, the reference §7 is then wrong. |
| `SOFT` | the server rejected it (`METHODNOTFOUNDEXCEPTION` = no `*.aggregate` on that module) | Expected for most modules today. Record it. |
| `THROW` | the SDK or transport failed | **This is a defect worth reporting** — the SDK should surface a server rejection softly, not throw. |

::warning
**An `OK` line prints real numbers off your portal** — `count` buckets are actual
row counts for that module (deals, leads, contacts). The rest of this document
already tells you to replace the domain with a placeholder before posting; the
same applies here, and more so. Run the survey against a **demo or development
portal**. If you only have a production one, post the *shape* of the buckets and
the module names, and replace the counts with `<n>` — what #113 needs to know is
which modules answered, not how many deals you have.
::

Paste the block into #113, redacted as above. If every line is `SOFT` or `THROW`, the
conclusion is that `AggregateV3` stays `@experimental`, the docs keep telling
readers to reduce a `callList` client-side, and `AjaxResult.getTotal()` remains
the only count available under `restApi:v2` — which is why it was kept out of the
`3.0.0` removal set.

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
- [ ] the `v3 aggregate survey` block pasted into the issue, and
      `AggregateV3`'s `@experimental` tag either removed or re-justified with
      the module list the survey produced

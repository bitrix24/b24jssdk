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
| `b24jssdk-rest` | `actions.v2.batch` (one result per command), `v2.callList`, `v2.fetchList` (chunked), `v3.call`, `v3.callList` on `tasks.task.list` **without** a `cursorIdKey` override — the claim in the skill's table; a non-v3 method fails softly rather than throwing; `v3.aggregate` reported (it is `@experimental` and does not gate the run) |
| `b24jssdk-filtering` | a v2 prefix-keyed filter actually narrows rows; a v3 array-of-triples filter is accepted; `callList` **strips a caller-supplied `order`** — asks for `DESC`, asserts the rows come back ascending |
| `b24jssdk-helpers` | `initB24Helper` over a webhook loads Profile + Currency; `currency.format` uses the portal's own rules (the formatted value is printed) |
| `b24jssdk-vibecode` | the SDK-side calls the skill documents succeed |

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

```text
Portal:            (domain, plan)
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

1. A local application on the portal, with a placement handler pointing at a
   page you control (a tunnel to localhost is fine).
2. That page boots with `initializeB24Frame()`.
3. Open the placement in the portal and work through the list below.

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
| 8 | `$b24.placement.getInfo()` | returns the placement code the app was opened from | ☐ | |
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
- [ ] `skills/REPORT.md` open questions resolved or deferred with a reason
- [ ] `skills/README.md` migration note updated once the pass is done

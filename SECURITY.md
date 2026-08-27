# Security policy

<sub>Last reviewed: 2026-08-27.</sub>

## Reporting a vulnerability

**Use GitHub's private vulnerability reporting:**
[Report a vulnerability](https://github.com/bitrix24/b24jssdk/security/advisories/new).

It is private between you and the maintainers, it does not require you to know
an email address, and it keeps the report out of public view while a fix is
prepared. You need a GitHub account, but the report is not visible to other
users.

**Please do not open a public issue for a security problem.** A public issue is
indexed within minutes, and for a client SDK the window between disclosure and a
released fix is time in which every consumer is exposed with no way to act.

If private reporting is unavailable to you for any reason, open a normal issue
saying only *"security report, please advise a private channel"* — with no
detail, no reproduction, and no affected version — and a maintainer will follow
up.

### What helps

- The SDK version, the Node or browser version, and which entry point
  (`B24Hook`, `B24Frame`, `B24OAuth`).
- What an attacker gains, concretely. "A webhook secret reaches a log sink the
  application did not intend" is actionable; "the logger is unsafe" is not.
- A reproduction, however rough. A failing snippet is worth more than a careful
  description of one.

**Never include a real credential.** Not a webhook URL, not an
`access_token`, not an `application_token` — advisories can become public later,
and the report itself becomes an artefact worth protecting. Redact the secret
and describe its shape instead.

### What to expect

We aim to acknowledge a report within a few working days. That is an intention,
not a contract — this is a small team, and pretending to a fixed SLA would be
worse than saying so.

After acknowledgement you can expect: confirmation of whether we reproduce it, a
view on severity, and an outline of the fix. If we decide it is not a
vulnerability we will say why rather than closing quietly, and you are free to
disagree.

Credit in the advisory and the changelog by default; tell us if you would rather
not be named.

## Scope

This repository is a **client library**. That boundary decides where a report
should go, and getting it wrong costs everyone time.

**In scope** — anything in this repository:

- Credential handling in the SDK: leaking a webhook secret or token into logs,
  error messages, serialised errors, or telemetry.
- Flaws in what the SDK does with a REST response — parsing, batch fan-out,
  retry and rate-limit handling.
- Anything the SDK does that lets a caller be attacked by a malicious portal
  response.
- The published npm package: its integrity, its dependency tree, its build.
- The documentation site in `docs/` and the guidance in `skills/`, when a
  documented pattern is itself insecure. Guidance that leads a reader into a
  vulnerability is a vulnerability with extra steps.

**Not in scope here** — report these to Bitrix24 directly, through
[the Bitrix24 developer channels](https://apidocs.bitrix24.com/):

- Vulnerabilities in the Bitrix24 REST API, in a portal, or in the platform.
- Issues in an application built with this SDK, where the SDK behaves as
  documented.
- The behaviour of a Bitrix24 method itself — what it returns, who it lets you
  reach, what it permits.

If you are unsure which side a problem falls on, report it here and say you are
unsure. Misrouting it in good faith is not a mistake worth worrying about.

## Supported versions

| Version | Supported |
| --- | --- |
| `2.x` | Yes — security fixes land here |
| `1.x` | No |

`1.x` reached end of life with the `2.0.0` release. It receives no security
fixes.

> **This boundary is a policy, not an enforcement.** The `1.x` releases are still
> published on npm and are not marked deprecated, so `npm i @bitrix24/b24jssdk@1`
> installs one today without a warning. Marking them is a registry action rather
> than a repository change; it is tracked separately. Until it happens, do not
> read "unsupported" as "unavailable" — check the version you actually resolved.

A `3.0.0` is in preparation. When it ships, this table changes and the change
will be announced in the release notes rather than only here.

## What the SDK already does

Listed so a report can say "this defence has a hole" rather than rediscovering
the defence. None of this is a guarantee — each exists because something went
wrong once.

- **Credentials are redacted before logging.** `redactSensitiveParams()`
  ([`core/http/redact.ts`](packages/jssdk/src/core/http/redact.ts)) strips
  `auth`, `token`, `secret`, `access_token`, `refresh_token`, `client_secret`,
  `application_token`, `password`, `sessid`, `key` and `signature` from request
  params — including inside a query string, and two object levels deep, which is
  what a batch payload needs — before they can reach a log sink. `AjaxError.requestInfo` carries no request
  URL at all (#39, #40, #287).
- **`SdkError.originalError` is non-enumerable.** It stays readable for local
  debugging, but a spread, `Object.keys()`, `JSON.stringify()` or a
  Sentry-style capture skips it, so a raw transport error carrying a secret in
  its `config` cannot leak through generic serialisation (#189).
- **Three lint rules guard the logging callsites.**
  [`no-credential-in-logger`](eslint-rules/no-credential-in-logger.js) rejects a
  URL- or credential-shaped value in a logger context;
  [`require-catch-on-logger-call`](eslint-rules/require-catch-on-logger-call.js)
  keeps a rejecting log sink from taking the process down;
  [`logger-context-must-be-object`](eslint-rules/logger-context-must-be-object.js)
  keeps the context argument a record, so an error does not serialise to `{}`.
- **Dependencies are audited in CI.** `pnpm audit --audit-level=moderate` runs
  on every push, for the workspace and separately for the recipe package, which
  has its own lockfile. Dependabot covers both.
- **Constant-time token comparison is documented, with the reason.** See
  [Security patterns](https://bitrix24.github.io/b24jssdk/docs/working-with-the-rest-api/security/)
  for verifying an `application_token` without leaking it through response
  timing, and for the reply-`2xx`-first ordering an event receiver needs.

### Known limits

- **Redaction stops two object levels down.** That depth is chosen to cover a
  batch payload (`{ cmd: [{ method, params: { … } }] }`); a credential nested
  deeper is **not** masked. Redact at the callsite for those.
- **The query-string pass only matches a bare `key=value`.** A bracketed or
  encoded key — `auth[application_token]=` — is not caught by the string pass,
  and a credential appearing after a newline inside a multi-line string value is
  not caught either.
- The lint rules are syntax-only: they cannot see a credential through string
  interpolation, so `` logger.debug(`GET ${url}`) `` passes them. Log the bare
  method name. `no-credential-in-logger` also leaves `auth` and `sessid` out of
  its vocabulary on purpose, to avoid false positives, and relies on the runtime
  redactor for those two.
- Redaction applies to `AjaxError`. An `SdkError` you construct yourself is not
  redacted — do not interpolate params, a filter, or a URL into its description.
- A `filter` legitimately carries user data. It is not treated as a credential,
  and it is not redacted.

The first two are recorded as accepted residual risk in
[`redact.ts`](packages/jssdk/src/core/http/redact.ts) itself, with the reasoning.
They are listed here so a report about them arrives knowing that, rather than
being told afterwards — and so a leak that falls *outside* them is not dismissed
as already-known.

## Public disclosure

We prefer coordinated disclosure: a fix released, then an advisory. If you plan
to publish on your own schedule, tell us the date — we would rather work to your
timeline than be surprised by it.

If a report goes unanswered for two weeks, treat that as a failure on our side
and escalate through
[the Bitrix24 developer channels](https://apidocs.bitrix24.com/) rather than
waiting indefinitely.

---

<sub>This document cites specific internals — the redaction key list, three lint
rules, an end-of-life date. `docs-lint --strict` does not reach root files, so
nothing fails when those drift. Re-read it against the source whenever
`redact.ts`, `eslint-rules/` or the supported-version table changes, and move the
stamp above.</sub>

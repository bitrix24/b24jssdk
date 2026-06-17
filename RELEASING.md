# Releasing `@bitrix24/b24jssdk`

<sub>Last reviewed: 2026-06-17.</sub>

How to cut a release of the two published packages — `@bitrix24/b24jssdk` (core
SDK) and `@bitrix24/b24jssdk-nuxt` (Nuxt module). They ship **in lockstep at one
shared version**; there is no independent release of either package.

Publishing is automated by two sibling workflows —
[`npm-publish-js-sdk.yml`](.github/workflows/npm-publish-js-sdk.yml) (core) and
[`npm-publish-js-sdk-nuxt.yml`](.github/workflows/npm-publish-js-sdk-nuxt.yml)
(Nuxt) — both triggered by a published GitHub Release. The human steps are: bump
the version, finalise the changelog, tag, and publish a GitHub Release. The
workflows do the rest.

> **Why two workflows, not one `release.yml`?** npm OIDC trusted publishing keys
> each package's Trusted Publisher entry to **one exact workflow filename**. The two
> packages were registered under these two filenames, so a single `release.yml`
> publishing both fails the OIDC token exchange with a 404 (`ERR_PNPM_AUTH_TOKEN_EXCHANGE`).
> Folding them back into one file requires a repo/org admin to update the Trusted
> Publisher filename on npm for both packages first — see [Handover](#handover-171).

## TL;DR

```bash
git switch main && git pull origin main

pnpm run release:bump <version>          # e.g. 1.3.0 — rewrites all 3 package.json + lockfile

# Edit CHANGELOG.md: rename "## [Unreleased]" to
#   ## [<version>](https://github.com/bitrix24/b24jssdk/compare/v<previous>...v<version>) (YYYY-MM-DD)
# and start a fresh empty [Unreleased] above it.

git add package.json packages/jssdk/package.json packages/jssdk-nuxt/package.json pnpm-lock.yaml CHANGELOG.md
git commit -m "chore(release): v<version>"
git push origin main
```

Then, on GitHub: **Releases → Draft a new release →** create tag `v<version>`
targeting `main`, paste the changelog section as the notes, and **Publish**. That
fires both publish workflows — each runs CI, then publishes its package.

## Prerequisites (per releaser)

- **Push access to `main`** and rights to **create GitHub Releases**.
- **npm** — publishing is via **OIDC trusted publishing**, not a personal token:
  - **One-time admin setup:** each package on npm (Settings → Publishing → Trusted
    Publishers) must list `bitrix24/b24jssdk` + the **matching workflow filename** —
    `npm-publish-js-sdk.yml` for `@bitrix24/b24jssdk`, `npm-publish-js-sdk-nuxt.yml`
    for `@bitrix24/b24jssdk-nuxt`, with **Environment left empty** (the publish jobs
    set no `environment:`). If the filename/environment doesn't match, the OIDC token
    exchange fails with a 404 (`ERR_PNPM_AUTH_TOKEN_EXCHANGE`) and the publish step
    falls back to an unauthenticated `PUT` that npm rejects — not something a releaser
    can fix mid-run.
  - **Per releaser:** you need **no npm token or credential** on your machine — the
    CI runner authenticates with a short-lived OIDC token (the publish jobs grant
    `id-token: write` and set no `NPM_TOKEN`/`NODE_AUTH_TOKEN`, so there is no
    long-lived secret to rotate or leak).
- A working **CI** — each publish workflow reuses `ci.yml` and will not publish if CI is red.

> ⚠️ **Bus factor (#171).** At least two people should hold the rights above, so a
> security patch or release never blocks on one person being away. See
> [Handover](#handover-171).

## Versioning

- **SemVer.** `patch` for bug fixes, `minor` for backward-compatible features,
  `major` for breaking changes. Decide from what sits under `## [Unreleased]` in
  [`CHANGELOG.md`](CHANGELOG.md) (a `Features` block ⇒ at least a minor; any
  `BREAKING CHANGE` ⇒ major).
- **Lockstep.** The root `package.json`, `packages/jssdk/package.json`, and
  `packages/jssdk-nuxt/package.json` always carry the **same** version.
  `pnpm run release:bump` rewrites all three and refuses to run if they are already
  out of sync — resolve the drift by hand first, then retry.
- **Pre-releases** (`1.3.0-rc.1`) bump cleanly — the script accepts a `-prerelease`
  suffix — and publish safely: each publish workflow detects the `-` in the version
  and ships the package under the **`next`** dist-tag instead of `latest`, so a plain
  `npm install` (which follows `latest`) stays on the last stable release. Promote a
  pre-release to stable later with `npm dist-tag add <pkg>@<version> latest`.

## Step by step

1. **Start clean.**
   ```bash
   git switch main && git pull origin main
   ```
   Make sure `## [Unreleased]` in `CHANGELOG.md` reflects everything merged since
   the last tag (each PR should have added its own entry).

2. **Bump the version.**
   ```bash
   pnpm run release:bump <version>
   ```
   This rewrites the `version` field in all three `package.json` files and runs
   `pnpm install --lockfile-only` to refresh `pnpm-lock.yaml`. Review the diff.

3. **Finalise the changelog.** In `CHANGELOG.md`, rename the `## [Unreleased]`
   heading to the released version with a compare link and the date, e.g.:
   ```md
   ## [1.3.0](https://github.com/bitrix24/b24jssdk/compare/v1.2.0...v1.3.0) (2026-06-15)
   ```
   Then add a new empty `## [Unreleased]` section above it for the next cycle.
   Keep the `Features` / `Bug Fixes` / `Security` / `Chore` grouping.

4. **Commit and push to `main`.**
   ```bash
   git add package.json packages/jssdk/package.json packages/jssdk-nuxt/package.json pnpm-lock.yaml CHANGELOG.md
   git commit -m "chore(release): v<version>"
   git push origin main
   ```
   The version-bump commit **must** land on `main` before the release — the
   workflow verifies that `package.json` matches the tag.

5. **Publish a GitHub Release.** Releases → *Draft a new release* → create the tag
   `v<version>` on `main`, title `v<version>`, body = the changelog block you just
   wrote (the whole `## [<version>]` section, including its `Features` / `Bug Fixes`
   / … subsections). Click **Publish release**. (Equivalently: `git tag v<version> && git push origin
   v<version>`, then publish a release from that existing tag.)

6. **Watch the runs.** Open Actions. The release fires **both** workflows —
   **NPM publish JS SDK 🚀** (`@bitrix24/b24jssdk`) and **NPM publish JS SDK Nuxt 🚀**
   (`@bitrix24/b24jssdk-nuxt`). Each runs CI, then its `publish` job. Both must go
   green; if one fails, the two packages can drift out of lockstep on npm (see
   [If something goes wrong](#if-something-goes-wrong)).

7. **Verify on npm.**
   ```bash
   npm view @bitrix24/b24jssdk version
   npm view @bitrix24/b24jssdk-nuxt version
   ```
   Both should report `<version>`. (For a pre-release, `version` shows only the
   `latest` tag — use `npm dist-tag ls <pkg>` instead.)

8. **The docs site redeploys itself.** The `chore(release)` commit pushed to `main`
   in step 4 also triggers `ci.yml`, which redeploys the docs site to GitHub Pages
   as part of normal CI — no manual action. (The CI *reused inside* each publish
   workflow deliberately skips the deploy; the direct push to `main` is what ships
   the site.)

## What the publish workflows do

Each is triggered by a **published GitHub Release**, or by a manual
**workflow_dispatch on `main`** (for a re-run). In order, per workflow:

| Job | What it does |
|-----|--------------|
| `ci` | Reuses [`ci.yml`](.github/workflows/ci.yml) — one full CI pass. A red CI stops the publish. |
| `publish` | Publishes the package (`@bitrix24/b24jssdk` or `@bitrix24/b24jssdk-nuxt`) via OIDC, after the guards below. |

Both workflows fire on the same release event and run in parallel. The published
Nuxt module depends on `@bitrix24/b24jssdk` at the released version, so in the brief
window before the core publish lands an external `npm install` of the Nuxt module
could miss the matching core version — the package contents are still correct (the
build resolves core via the workspace). npm has no cross-package transaction, so
this ordering gap is unavoidable while the two packages publish from separate
trusted-publisher filenames.

Each publish job guards itself before shipping:

- **version lockstep** across the three `package.json` files;
- **tag matches version** (`v1.3.0` ⇒ `1.3.0`) on a real release;
- **not already published** (`npm view <pkg>@<ver>` must exit non-zero);
- **`__SDK_VERSION__` token replaced** in the built Nuxt `module.mjs` (#119).

## If something goes wrong

- **Partial release** (one package published, the other failed): fix the cause, then
  **re-run only the failed workflow** (Actions → the red workflow → *Re-run failed
  jobs*, or *Run workflow* on `main`). The already-published package's own
  "already published" guard would fail it, so never re-run the workflow that already
  succeeded — re-run only the one that failed.
- **CI failed before any publish:** nothing reached npm. Fix `main`, then re-cut
  (a fresh release, or `workflow_dispatch` on `main` once `main` is green).
- **Wrong/broken version published:** npm does **not** allow re-publishing the same
  version (and unpublish is restricted to a 72-hour window with a 24-hour
  re-publish block). Don't fight it — bump a new `patch`, fix forward, and release
  again.
- **Tag/version mismatch or version already published:** the guards fail the job
  early with a clear `::error::` message — bump correctly and re-tag.

## Handover (#171)

This runbook is one half of de-risking the release process. The account-level half
is **not** code and must be done by a repo/org admin:

- [ ] Add a **second npm publisher** to the `@bitrix24` packages' trusted-publisher
      config (and as a fallback maintainer), so releases survive one person being
      away.
- [ ] *(Optional cleanup)* To re-consolidate publishing into a single `release.yml`,
      first update the **Trusted Publisher workflow filename** on npm to `release.yml`
      (Environment empty) for **both** `@bitrix24/b24jssdk` and
      `@bitrix24/b24jssdk-nuxt`, then merge the two `npm-publish-*.yml` files back
      into one. Without the npm-side change first, the consolidated workflow's OIDC
      token exchange 404s.
- [ ] Add a **second GitHub releaser** (push to `main` + create releases).
- [ ] Add a **`CODEOWNERS`** file so reviews are routed and ownership is explicit.
- [ ] Provision a shared/secondary integration-test environment (`.env.test`,
      webhook scopes per [AGENTS.md](AGENTS.md)) so release validation isn't tied
      to one machine.

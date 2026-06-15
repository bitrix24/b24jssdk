# Releasing `@bitrix24/b24jssdk`

<sub>Last reviewed: 2026-06-15.</sub>

How to cut a release of the two published packages — `@bitrix24/b24jssdk` (core
SDK) and `@bitrix24/b24jssdk-nuxt` (Nuxt module). They ship **in lockstep at one
shared version**; there is no independent release of either package.

Publishing is automated by [`.github/workflows/release.yml`](.github/workflows/release.yml).
The human steps are: bump the version, finalise the changelog, tag, and publish a
GitHub Release. The workflow does the rest.

## TL;DR

```bash
git switch main && git pull origin main

pnpm run release:bump <version>          # e.g. 1.3.0 — rewrites all 3 package.json + lockfile

# Edit CHANGELOG.md: rename "## [Unreleased]" to
#   ## [<version>](https://github.com/bitrix24/b24jssdk/compare/v<previous>...v<version>) (YYYY-MM-DD)
# and start a fresh empty [Unreleased] above it.

git add -A
git commit -m "chore(release): v<version>"
git push origin main
```

Then, on GitHub: **Releases → Draft a new release →** create tag `v<version>`
targeting `main`, paste the changelog section as the notes, and **Publish**. That
fires `release.yml`, which runs CI once and publishes both packages.

## Prerequisites (per releaser)

- **Push access to `main`** and rights to **create GitHub Releases**.
- **npm publish rights** on the [`@bitrix24`](https://www.npmjs.com/org/bitrix24)
  scope. Publishing uses **npm OIDC trusted publishing**, not a token: `release.yml`
  grants `id-token: write` and sets no `NPM_TOKEN`/`NODE_AUTH_TOKEN`, so the runner
  mints a short-lived token and publishes with provenance. Practically this means:
  - the npm package settings for both packages must list `bitrix24/b24jssdk` +
    the `release.yml` workflow as a **trusted publisher**;
  - there is **no long-lived npm secret** in the repo to rotate or leak.
- A working **CI** — `release.yml` reuses `ci.yml` and will not publish if CI is red.

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
- **Pre-releases** are allowed (`1.3.0-rc.1`); the bump script accepts a
  `-prerelease` suffix.

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
   git add -A
   git commit -m "chore(release): v<version>"
   git push origin main
   ```
   The version-bump commit **must** land on `main` before the release — the
   workflow verifies that `package.json` matches the tag.

5. **Publish a GitHub Release.** Releases → *Draft a new release* → create the tag
   `v<version>` on `main`, title `v<version>`, body = the changelog section. Click
   **Publish release**. (Equivalently: `git tag v<version> && git push origin
   v<version>`, then publish a release from that existing tag.)

6. **Watch the run.** Open Actions → **release 🚀**. It runs CI, then
   `publish-jssdk`, then `publish-nuxt`, then the `release-status` gate. The gate is
   green only if **both** packages published.

7. **Verify on npm.**
   ```bash
   npm view @bitrix24/b24jssdk version
   npm view @bitrix24/b24jssdk-nuxt version
   ```
   Both should report `<version>`.

## What `release.yml` does

Triggered by a **published GitHub Release**, or by a manual **workflow_dispatch on
`main`** (for a re-run). In order:

| Job | What it does |
|-----|--------------|
| `ci` | Reuses [`ci.yml`](.github/workflows/ci.yml) — one full CI pass. A red CI stops the release. |
| `publish-jssdk` | Publishes `@bitrix24/b24jssdk` (core first — the Nuxt module depends on it). |
| `publish-nuxt` | `needs: publish-jssdk`. Publishes `@bitrix24/b24jssdk-nuxt`. |
| `release-status` | `if: always()` gate — fails unless **both** publishes succeeded. |

Each publish job guards itself before shipping:

- **version lockstep** across the three `package.json` files;
- **tag matches version** (`v1.3.0` ⇒ `1.3.0`) on a real release;
- **not already published** (`npm view <pkg>@<ver>` must 404);
- **`__SDK_VERSION__` token replaced** in the built Nuxt `module.mjs` (#119).

npm has no cross-package transaction, so the design is the best achievable:
**ordered + visible**, not atomic — a partial release turns the run red instead of
passing unnoticed.

## If something goes wrong

- **Partial release** (one package published, the other failed): fix the cause, then
  **re-run ONLY the failed job** from the Actions UI. Do **not** use *Re-run all
  jobs* — re-running `publish-jssdk` after it already published trips the
  "already published" guard and fails. The `release-status` error message says the
  same.
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
- [ ] Add a **second GitHub releaser** (push to `main` + create releases).
- [ ] Add a **`CODEOWNERS`** file so reviews are routed and ownership is explicit.
- [ ] Provision a shared/secondary integration-test environment (`.env.test`,
      webhook scopes per [AGENTS.md](AGENTS.md)) so release validation isn't tied
      to one machine.

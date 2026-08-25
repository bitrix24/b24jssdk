# Why this directory has its own package.json and lockfile

`skills/b24jssdk-recipes` is **deliberately not a pnpm workspace member** (#65). It
carries its own `package.json`, `pnpm-workspace.yaml` and `pnpm-lock.yaml`, and its
own `node_modules`.

## What this buys

The recipes import packages the SDK itself has no use for — `express`, `grammy`,
`node-cron`, `openai`. Declaring those at the workspace root meant:

- **Every contributor installed them.** A breaking release of `grammy` or `openai`
  would fail `pnpm install` for people working on the HTTP layer, who have no reason
  to care that a Telegram example exists.
- **They showed up in `pnpm audit` for the repository**, as findings against code
  that is never in the SDK bundle.
- **They read as intent.** `openai` in the root manifest suggests the SDK integrates
  with OpenAI. It does not; one teaching recipe does.
- **517 lines of transitive resolution in the root lockfile.**

A workspace member would have fixed only the last point in appearance, not in fact:
a pnpm workspace has one lockfile, so a member's dependencies land in the root lock
and a root `pnpm install` still installs them. Standing outside the workspace is what
actually separates the trees. That is why the nested `pnpm-workspace.yaml` exists —
it declares this directory its own root, so plain `pnpm install` here does the right
thing instead of walking up and installing into the repository root.

## How it is wired

`skills:install` at the repository root runs the nested install, and both
`skills:typecheck` and `skills:test` depend on it. Nothing extra is needed in CI, and
a fresh clone running `pnpm run typecheck` gets the install on the way through rather
than a confusing `Cannot find module 'grammy'`.

## The one thing that stayed behind

`@types/express` remains a root devDependency. `docs/content/docs/2.working-with-the-rest-api/79.security.md`
documents Express handler patterns, and `pnpm run docs:typecheck-blocks` compiles
those fenced blocks at the repository root — so those types are a root-level need, not
a recipe one. Only the types stayed; `express` itself did not.

## If you add a dependency to a recipe

Add it here, not to the root manifest. `test/integration/skills-recipes/recipe-hygiene.unit.spec.ts`
fails if one of the recipe-only packages reappears in the root `devDependencies`.

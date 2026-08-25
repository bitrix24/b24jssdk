/**
 * #64a — recipe hygiene: every shared helper has exactly one copy.
 *
 * The bug that motivated this: `baseStage` existed three times. Recipes 03 and
 * 06 each carried `s.includes(':') ? s.split(':')[1] : s`, which returns `''`
 * for `'C2:'`, while the tested copy in `lib/funnel.ts` returns `'C2:'`. So the
 * suite was pinning behaviour no shipped recipe had.
 *
 * No recipe's control flow actually differed — neither `''` nor `'C2:'` matches
 * a stage key, so both fell through the same way. The point is not that this
 * drift bit, but that it went unnoticed: a duplicate is invisible to a test
 * that imports the original, so nothing could have caught it. The next
 * divergence might not be harmless, and for `safeEqual` — a constant-time
 * compare — it would be a vulnerability that looks like a refactor.
 *
 * These are source-text guards, so be honest about the ceiling: they catch a
 * verbatim copy and a rename of one, because they check the helper's body shape
 * as well as its name. They cannot catch an independent re-implementation that
 * reaches the same result by different syntax (`s.slice(s.indexOf(':') + 1)`
 * would slip past). That is inherent to matching text rather than behaviour —
 * treat these as a ratchet against the copy-paste that actually happened, not
 * as proof that no fourth copy can ever exist.
 *
 * Pure text inspection, no portal — jsSdk:unit.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { load } from 'js-yaml'

const examplesDir = resolve(__dirname, '../../../skills/b24jssdk-recipes/examples')
const exampleFiles = readdirSync(examplesDir).filter(name => name.endsWith('.ts'))

/** Blank out comments so a prose mention is never read as code. */
const stripComments = (source: string) => source
  .replaceAll(/\/\*[\s\S]*?\*\//g, ' ')
  .replaceAll(/\/\/[^\n]*/g, ' ')

const readCode = (name: string) => stripComments(readFileSync(join(examplesDir, name), 'utf8'))

/**
 * Escape a literal for embedding in a RegExp. The module paths below contain
 * `.` and `/`; escaping only the leading `../` would rely on the rest never
 * gaining a metacharacter, which is an invariant nothing enforces.
 */
const escapeRegExp = (literal: string) => literal.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)

/**
 * One row per helper that recipes must import rather than re-declare.
 * `bodyShape` is what every copy seen in the wild has looked like — matching it
 * is what stops a rename from walking straight past the name check.
 *
 * `safeEqual`'s shape probe is deliberately the broad `timingSafeEqual(`, which
 * also fires on a recipe calling that primitive directly for some other reason.
 * That is intended, not a false positive: a recipe needing a constant-time
 * compare should get it from `lib/crypto`, so being stopped here is the right
 * outcome — and the failure points at the module to use.
 */
const SHARED_HELPERS = [
  {
    name: 'baseStage',
    module: '../lib/funnel',
    bodyShape: /\.split\(\s*['"`]:['"`]\s*\)\s*\[\s*1\s*\]/
  },
  {
    name: 'safeEqual',
    module: '../lib/crypto',
    bodyShape: /\btimingSafeEqual\s*\(/
  }
] as const

describe('#64a — recipes use the tested helpers, not private copies', () => {
  it('finds the recipe files (an empty sweep would pass everything vacuously)', () => {
    expect(exampleFiles.length).toBeGreaterThan(0)
  })

  describe.each(SHARED_HELPERS)('$name', ({ name, module, bodyShape }) => {
    const declaration = new RegExp(String.raw`(?:const|let|var|function)\s+${name}\b`)
    // Tolerant of quote style and an explicit `.js` extension — both are
    // correct, and a guard that rejected them would be a false alarm.
    const importOf = new RegExp(
      String.raw`import\s*\{[^}]*\b${name}\b[^}]*\}\s*from\s*['"]${escapeRegExp(module)}(?:\.js)?['"]`
    )

    it.each(exampleFiles)(`%s declares no ${name} of its own`, (file) => {
      expect(readCode(file)).not.toMatch(declaration)
    })

    it.each(exampleFiles)(`%s does not re-implement ${name} under another name`, (file) => {
      expect(readCode(file)).not.toMatch(bodyShape)
    })

    it.each(exampleFiles)(`%s imports ${name} from ${module} if it uses it`, (file) => {
      const code = readCode(file)
      // Keyed on the literal call-site name, so an aliased import
      // (`import { safeEqual as safeEq }`) makes this a no-op rather than a
      // failure. That is fine — an alias still resolves to the shared copy, so
      // there is nothing to catch — but do not read a pass here as proof the
      // file was checked. The two guards above are the ones that bite.
      if (!new RegExp(String.raw`\b${name}\s*\(`).test(code)) {
        return
      }
      expect(code).toMatch(importOf)
    })
  })
})

/**
 * #65 — the recipes' opt-in dependencies stay out of the workspace root.
 *
 * `express`, `grammy`, `node-cron` and `openai` are imported by recipes and by
 * nothing in the SDK. Declared at the root they made every contributor install
 * them, put findings against them into the repository's `pnpm audit`, and read
 * as intent — `openai` in the root manifest suggests the SDK integrates with
 * OpenAI, which it does not.
 *
 * The fix only holds while `skills/b24jssdk-recipes` stays OUTSIDE the pnpm
 * workspace: a workspace has one lockfile, so a member's dependencies land in
 * the root lock and a root install still installs them. Both halves are checked
 * here, because adding one line to `pnpm-workspace.yaml` would silently undo the
 * whole thing. See `skills/b24jssdk-recipes/README-DEPS.md`.
 */
describe('#65 — recipe dependencies are isolated from the workspace root', () => {
  const repoRoot = resolve(__dirname, '../../..')
  const readJson = (rel: string) => JSON.parse(readFileSync(join(repoRoot, rel), 'utf8'))

  const RECIPE_ONLY = ['express', 'grammy', 'node-cron', 'openai']

  it.each(RECIPE_ONLY)('%s is not a root dependency', (name) => {
    const root = readJson('package.json')
    expect(Object.keys(root.dependencies ?? {})).not.toContain(name)
    expect(Object.keys(root.devDependencies ?? {})).not.toContain(name)
  })

  it.each(RECIPE_ONLY)('%s is declared by the recipes package', (name) => {
    const recipes = readJson('skills/b24jssdk-recipes/package.json')
    expect(Object.keys(recipes.dependencies ?? {})).toContain(name)
  })

  it('keeps @types/express at the root, where the docs blocks need it', () => {
    // 79.security.md documents Express handler patterns, and
    // `docs:typecheck-blocks` compiles those fences at the repository root — so
    // the types are a root-level need. Only the types stayed; express did not.
    const root = readJson('package.json')
    expect(Object.keys(root.devDependencies ?? {})).toContain('@types/express')
  })

  it('is not a member of the pnpm workspace', () => {
    // The isolation depends on this. A workspace member's dependencies go into
    // the root lockfile and a root install pulls them in, which would restore
    // every problem #65 removed while looking tidy.
    //
    // Parsed, not pattern-matched. A regex over the `packages:` block missed two
    // realistic edits: flow style (`packages: [docs, skills/b24jssdk-recipes]`)
    // matched nothing and passed vacuously, and a comment line anywhere inside
    // the block truncated the match, hiding every entry after it. Both are
    // ordinary YAML, and this file already carries long prose comments.
    const workspace = load(readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8')) as {
      packages?: string[]
    }
    expect(Array.isArray(workspace.packages)).toBe(true)
    for (const entry of workspace.packages ?? []) {
      expect(entry).not.toMatch(/skills/)
    }
  })

  it('is covered by Dependabot, since the root entry cannot see this lockfile', () => {
    // The real hazard in standing outside the workspace: `directory: "/"` does
    // not reach this tree, so without a second entry these four packages would
    // get no update coverage at all. Isolating them was meant to stop them being
    // every contributor's install problem, not to stop anyone watching them.
    const dependabot = readFileSync(join(repoRoot, '.github/dependabot.yml'), 'utf8')
    expect(dependabot).toMatch(/directory:\s*["']\/skills\/b24jssdk-recipes["']/)
  })

  it('has its own audit step in CI, for the same reason', () => {
    const workflow = readFileSync(join(repoRoot, '.github/workflows/ci.yml'), 'utf8')
    expect(workflow).toMatch(/pnpm --dir skills\/b24jssdk-recipes audit/)
  })

  it('is its own pnpm root, so a plain install there does not reach the repo root', () => {
    // Without this file, `pnpm install` inside the directory walks up, finds the
    // repository workspace and installs into it instead.
    expect(existsSync(join(repoRoot, 'skills/b24jssdk-recipes/pnpm-workspace.yaml'))).toBe(true)
    expect(existsSync(join(repoRoot, 'skills/b24jssdk-recipes/pnpm-lock.yaml'))).toBe(true)
  })
})

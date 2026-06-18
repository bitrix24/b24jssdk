/**
 * Locks the HTTP-layer logger secret-leak ESLint guard (#212).
 *
 * `eslint.config.mjs` appends a `no-restricted-syntax` rule scoped to
 * `packages/jssdk/src/core/http/**` that blocks the #39/#40 webhook-secret-leak
 * class — passing a URL/credential-shaped value (or spreading an axios
 * config/request/response object) into a logger context object. The rule is
 * three subtle esquery selectors plus a `[Tt]oken(?!s\b)` carve-out; a typo
 * while editing one (a dropped `MemberExpression` constraint, a regex that
 * silently matches nothing) would turn the guard into a no-op and `eslint`
 * would stay green — we'd only find out when the next leak slipped through.
 *
 * This test pulls the REAL rule out of `eslint.config.mjs` (not a hand-copy of
 * the selectors) and runs known-bad / known-good snippets through ESLint's
 * `Linter`, so breaking the live selectors turns this test red. Pure logic, no
 * portal — runs in the jsSdk:unit project (the CI `test` job, which has
 * node_modules; the docs-lint job that runs scripts/__tests__ does not).
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { Linter } from 'eslint'
// eslint.config.mjs default-exports a FlatConfigComposer (a thenable that
// resolves to the flat-config array). No types ship for it — that's fine, this
// file lives under test/ and is never tsc-checked.
import composer from '../../../eslint.config.mjs'

// The exact `files` glob the guard is scoped to. If the entry is renamed or the
// glob changes, locating it fails loudly below rather than silently testing
// nothing.
const HTTP_GLOB = 'packages/jssdk/src/core/http/**/*.ts'

const linter = new Linter()
let rule: unknown

beforeAll(async () => {
  const configs = (await composer) as Array<{ files?: string[], rules?: Record<string, unknown> }>
  const httpEntry = configs.find(c => Array.isArray(c.files) && c.files.includes(HTTP_GLOB))
  rule = httpEntry?.rules?.['no-restricted-syntax']
  if (!rule) {
    throw new Error(
      `Could not find the no-restricted-syntax guard scoped to files: ['${HTTP_GLOB}'] `
      + 'in eslint.config.mjs — the #212 guard may have moved or been removed.'
    )
  }
})

/** Run a snippet through the real guard rule and count how many times it fires. */
function guardHits(code: string): number {
  const messages = linter.verify(code, {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: { 'no-restricted-syntax': rule as never }
  })
  return messages.filter(m => m.ruleId === 'no-restricted-syntax').length
}

describe('HTTP logger secret-leak ESLint guard (#212, guards #39/#40)', () => {
  // Each case is labelled with the selector it exercises, so a future failure
  // points straight at the broken selector.
  const shouldFire: Array<[string, string]> = [
    // selector 1 (bare identifier value) — the original #40 regression.
    ['bare identifier value: methodFormatted (#40 regression)', 'this.getLogger().info(\'post/send\', { method: methodFormatted })'],
    // selector 1 (bare identifier value), shorthand property.
    ['bare identifier value: { url }', 'logger.debug(\'m\', { url })'],
    // selector 2 (member-access value ending in a credential-shaped property).
    ['member-access value: { foo: err.config.url }', 'logger.error(\'m\', { foo: err.config.url })'],
    // selector 3 (spread of an axios config/request/response object).
    ['axios object spread: { ...error.config }', 'logger.warning(\'m\', { ...error.config })']
  ]

  const shouldStaySilent: Array<[string, string]> = [
    ['the post-#40 correct form: { method }', 'logger.info(\'post/send\', { method })'],
    ['the `tokens` carve-out: [Tt]oken(?!s\\b)', 'logger.debug(\'m\', { retriesLeft: tokens })'],
    ['real current usage: { requestId, code }', 'logger.info(\'m\', { requestId, code: \'JSSDK_CLIENT_SIDE_WARNING\' })']
  ]

  it.each(shouldFire)('fires on %s', (_label, code) => {
    expect(guardHits(code)).toBeGreaterThanOrEqual(1)
  })

  it.each(shouldStaySilent)('stays silent on %s', (_label, code) => {
    expect(guardHits(code)).toBe(0)
  })

  it('reuses the real three-selector rule from eslint.config.mjs (not a hand-copy)', () => {
    expect(Array.isArray(rule)).toBe(true)
    const [severity, ...selectors] = rule as [unknown, ...Array<{ selector: string }>]
    expect(severity).toBe('error')
    // bare-identifier, member-access, axios-spread — drop one and coverage above weakens.
    expect(selectors).toHaveLength(3)
    for (const entry of selectors) {
      expect(typeof entry.selector).toBe('string')
    }
  })
})

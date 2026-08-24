/**
 * Locks the `no-credential-in-logger` ESLint rule (#226 — promotes #42 / #212).
 *
 * `eslint-rules/no-credential-in-logger.js` blocks the #39/#40 webhook-secret-leak
 * class at lint time: passing a URL/credential-shaped value (bare identifier,
 * member access, or a credential-shaped key with a dynamic value) — or spreading
 * an axios `config`/`request`/`response` — into a logger context object. The
 * matcher is a single credential vocabulary plus a `[Tt]oken(?!s\b)` carve-out;
 * a typo that silently stops one arm matching would turn the guard into a no-op.
 *
 * This test runs the REAL rule module through ESLint's `Linter` on known-bad /
 * known-good snippets, AND separately asserts `eslint.config.mjs` actually wires
 * the rule over a scope wider than `core/http` — the whole SDK source AND the
 * Nuxt module (#262) — so either a broken matcher or an unwired/narrowed rule
 * turns CI red. Pure logic, no portal — jsSdk:unit.
 */
import { describe, it, expect } from 'vitest'
import { Linter } from 'eslint'
import rule from '../../../eslint-rules/no-credential-in-logger.js'
// eslint.config.mjs default-exports a FlatConfigComposer (a thenable resolving to
// the flat-config array). No types ship for it — fine, this file is never tsc-checked.
import composer from '../../../eslint.config.mjs'

const RULE_ID = 'local/no-credential-in-logger'
const linter = new Linter()

/** Run a snippet through the real rule and return its messages. */
function verify(code: string) {
  return linter.verify(code, {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    plugins: { local: { rules: { 'no-credential-in-logger': rule as never } } },
    rules: { [RULE_ID]: 'error' }
  }).filter(m => m.ruleId === RULE_ID)
}
function guardHits(code: string): number {
  return verify(code).length
}

describe('no-credential-in-logger rule (#226, guards #39/#40)', () => {
  // One case per arm of each selector, so dropping/narrowing an arm reddens this.
  const shouldFire: Array<[string, string]> = [
    // value is a credential-shaped bare identifier (shorthand or `key: ident`).
    ['bare identifier { url }', 'logger.debug(\'m\', { url })'],
    ['bare identifier methodFormatted (the #40 regression)', 'this.getLogger().info(\'post/send\', { method: methodFormatted })'],
    ['bare identifier { password }', 'logger.debug(\'m\', { password })'],
    ['bare identifier { secret }', 'logger.error(\'m\', { secret })'],
    ['bare identifier { token } (singular — the plural is carved out)', 'logger.debug(\'m\', { token })'],
    // value is a member access ending in a credential-shaped property.
    ['member-access { foo: err.config.url }', 'logger.error(\'m\', { foo: err.config.url })'],
    ['member-access { pw: cfg.password }', 'logger.warning(\'m\', { pw: cfg.password })'],
    // spread of an axios config/request/response object.
    ['spread { ...error.config }', 'logger.warning(\'m\', { ...error.config })'],
    ['spread { ...err.request }', 'logger.warning(\'m\', { ...err.request })'],
    ['spread { ...err.response }', 'logger.warning(\'m\', { ...err.response })'],
    // credential-shaped KEY with a dynamic value (value may carry the secret).
    ['key+identifier { apiUrl: someVar }', 'logger.debug(\'m\', { apiUrl: someVar })'],
    ['key+identifier { password: pw }', 'logger.warning(\'m\', { password: pw })'],
    ['key+member { token: cfg.value }', 'logger.error(\'m\', { token: cfg.value })'],
    // capital-`Token` KEY — locks the `[Tt]` arm of CREDENTIAL_KEY; a future
    // edit that narrowed it to `t` (lowercase only) would silently let this slip.
    ['key+identifier { Token: someVar } (capital T)', 'logger.debug(\'m\', { Token: someVar })']
  ]

  const shouldStaySilent: Array<[string, string]> = [
    // value `method` is not credential-shaped — only methodFormatted is.
    ['the post-#40 correct form { method }', 'logger.info(\'post/send\', { method })'],
    // `[Tt]oken(?!s\b)` lets the plural `tokens` (a retry counter) through.
    ['the `tokens` plural carve-out', 'logger.debug(\'m\', { retriesLeft: tokens })'],
    // a string-literal value is neither Identifier nor MemberExpression.
    ['real current usage { requestId, code }', 'logger.info(\'m\', { requestId, code: \'JSSDK_CLIENT_SIDE_WARNING\' })'],
    // a hard-coded literal under a credential key is safe.
    ['a literal value under a credential key', 'logger.debug(\'m\', { url: \'/static/doc\' })'],
    // not a logger call → the rule must not fire.
    ['a non-logger call with a credential key', 'foo.bar(\'m\', { url: someVar })']
  ]

  it.each(shouldFire)('fires on %s', (_label, code) => {
    expect(guardHits(code)).toBeGreaterThanOrEqual(1)
  })

  it.each(shouldStaySilent)('stays silent on %s', (_label, code) => {
    expect(guardHits(code)).toBe(0)
  })

  it('names the offending key/value in the message (contextual)', () => {
    // each snippet fires exactly once, so `[0]` is the sole message we assert on.
    expect(verify('logger.debug(\'m\', { apiUrl: someVar })')).toHaveLength(1)
    expect(verify('logger.debug(\'m\', { apiUrl: someVar })')[0]?.message).toContain('apiUrl')
    expect(verify('logger.warning(\'m\', { ...error.config })')[0]?.message).toContain('config')
    expect(verify('logger.error(\'m\', { foo: err.config.url })')[0]?.message).toContain('url')
    expect(verify('logger.debug(\'m\', { url })')[0]?.message).toContain('url')
  })

  it('reports a key+value dual-match ONCE, as memberValue (early-return, not the old 2)', () => {
    // `{ url: err.config.url }`: the KEY `url` and the member-access VALUE are
    // BOTH credential-shaped. The old four independent selectors fired twice
    // (memberValue + credentialKey); the promoted rule returns after the first
    // arm, so exactly one report — the most specific, memberValue — is emitted.
    const messages = verify('logger.error(\'m\', { url: err.config.url })')
    expect(messages).toHaveLength(1)
    expect(messages[0]?.messageId).toBe('memberValue')
  })

  // #308 — every report offers exactly one opt-in `removeEntry` suggestion, and
  // that suggestion's fix produces code the rule no longer flags. The fix is a
  // pure removal (never a guessed replacement), so applying it can never
  // introduce a new leak — the property below asserts the result is clean.
  describe('#308 removeEntry suggestion', () => {
    // One case per shape, covering the entry being the only, first, middle and
    // last property — the four positions removeEntryFix's comma handling must get
    // right.
    const suggestionCases: Array<[string, string, string]> = [
      ['sole property (shorthand)', 'logger.debug(\'m\', { url })', 'logger.debug(\'m\', {  })'],
      ['first of many', 'logger.debug(\'m\', { url, requestId })', 'logger.debug(\'m\', { requestId })'],
      ['last of many', 'logger.debug(\'m\', { requestId, url })', 'logger.debug(\'m\', { requestId })'],
      ['middle of many', 'logger.debug(\'m\', { a, url, b })', 'logger.debug(\'m\', { a, b })'],
      ['member-access value', 'logger.error(\'m\', { foo: err.config.url })', 'logger.error(\'m\', {  })'],
      ['credential key', 'logger.debug(\'m\', { apiUrl: someVar })', 'logger.debug(\'m\', {  })'],
      ['axios spread', 'logger.warning(\'m\', { ...error.config })', 'logger.warning(\'m\', {  })']
    ]

    it.each(suggestionCases)('offers one removal suggestion on %s', (_label, code) => {
      const [message] = verify(code)
      expect(message?.suggestions).toHaveLength(1)
      expect(message?.suggestions?.[0]?.messageId).toBe('removeEntry')
    })

    it.each(suggestionCases)('the removal fix on %s yields code the rule no longer flags', (_label, code, expected) => {
      const [message] = verify(code)
      const fix = message?.suggestions?.[0]?.fix
      expect(fix).toBeTruthy()
      // Apply the fix's single text edit to the source.
      const { range, text } = fix as { range: [number, number], text: string }
      const fixed = code.slice(0, range[0]) + text + code.slice(range[1])
      expect(fixed).toBe(expected)
      // The whole point: the fixed code is clean.
      expect(guardHits(fixed)).toBe(0)
    })

    it('is declared fixable-by-suggestion, not by --fix', () => {
      // hasSuggestions lets an IDE offer the fix; the rule sets no `fixable`, so
      // `eslint --fix` never applies it automatically (a security rule must not
      // silently rewrite code).
      expect(rule.meta?.hasSuggestions).toBe(true)
      expect(rule.meta?.fixable).toBeUndefined()
    })
  })

  it('is wired into eslint.config.mjs over a scope wider than core/http', async () => {
    const configs = (await composer) as Array<{
      files?: string[]
      plugins?: Record<string, { rules?: Record<string, unknown> }>
      rules?: Record<string, unknown>
    }>
    const entry = configs.find(
      c => c.rules && Object.prototype.hasOwnProperty.call(c.rules, RULE_ID)
    )
    expect(entry, `no eslint.config.mjs entry enables ${RULE_ID}`).toBeTruthy()
    expect(entry!.rules![RULE_ID]).toBe('error')
    // the severity points at `local/no-credential-in-logger`; the `local` plugin
    // must actually register that rule in the SAME entry, else ESLint throws
    // "definition for rule … was not found" at load. Lock the plugin block too.
    expect(entry!.plugins?.local?.rules?.['no-credential-in-logger']).toBeTruthy()
    // widened from core/http to the whole SDK source (#226) and to the Nuxt
    // module source (#262) so a #39-class leak is caught in both packages.
    expect(entry!.files).toContain('packages/jssdk/src/**/*.ts')
    expect(entry!.files).toContain('packages/jssdk-nuxt/src/**/*.ts')
  })
})

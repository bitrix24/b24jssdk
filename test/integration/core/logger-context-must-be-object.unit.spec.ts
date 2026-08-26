/**
 * Locks the `logger/context-must-be-object` ESLint rule (#277).
 *
 * `eslint-rules/logger-context-must-be-object.js` exists because the removed
 * `LoggerBrowser` took variadic arguments while `LoggerInterface` takes
 * `(message: string, context?: Record<string, any>)`. Code carried over from the
 * old shape still COMPILES — an Error, an array, almost anything satisfies
 * `Record<string, any>` structurally — and then loses the data: an Error has no
 * own enumerable `message`/`stack`, so it serialises to `{}`.
 *
 * Two shipped recipes had exactly that, one of them swallowing the reason an
 * OAuth install failed. `skills:typecheck` did not catch either, which is the
 * whole argument for a lint rule.
 *
 * Same shape as the specs for this rule's two siblings: run the REAL rule module
 * through ESLint's `Linter` on known-bad and known-good snippets, and separately
 * assert `eslint.config.mjs` actually wires it over the recipes. A broken
 * matcher or an unwired rule turns CI red rather than going quiet.
 *
 * Pure logic, no portal — jsSdk:unit.
 */
import { describe, it, expect } from 'vitest'
import { Linter } from 'eslint'
import rule from '../../../eslint-rules/logger-context-must-be-object.js'
// eslint.config.mjs default-exports a FlatConfigComposer (a thenable resolving to
// the flat-config array). No types ship for it — fine, this file is never tsc-checked.
import composer from '../../../eslint.config.mjs'

const RULE_ID = 'logger/context-must-be-object'
const linter = new Linter()

const CONFIG = {
  languageOptions: { ecmaVersion: 'latest' as const, sourceType: 'module' as const },
  plugins: { logger: { rules: { 'context-must-be-object': rule as never } } },
  rules: { [RULE_ID]: 'error' as const }
}

const hits = (code: string) => linter.verify(code, CONFIG).filter(m => m.ruleId === RULE_ID)

describe('logger/context-must-be-object rule (#277)', () => {
  // The shapes that actually shipped, plus the neighbouring ones a copy-paste
  // from the variadic era produces.
  const shouldFire: Array<[string, string]> = [
    ['a bare Error binding — the OAuth-install bug', 'logger.error(\'install failed\', e)'],
    ['an array — the getErrorMessages bug', 'logger.info(\'m\', res.getErrorMessages())'],
    ['an array literal', 'logger.warning(\'m\', [\'a\', \'b\'])'],
    ['a constructed Error', 'logger.error(\'m\', new Error(\'boom\'))'],
    ['a second message string', 'logger.info(\'Hello,\', name)'],
    ['a template literal', 'logger.info(\'m\', `${a}`)'],
    ['a number', 'logger.debug(\'m\', 42)'],
    ['an explicit undefined — indistinguishable from a forgotten context', 'logger.info(\'m\', undefined)'],
    ['the $logger convention', '$logger.notice(\'m\', ctx)'],
    ['a private #logger field', 'class A { #logger; m() { this.#logger.critical(\'m\', e) } }'],
    ['a call spanning several lines', 'logger.error(\n  \'m\',\n  e\n)']
  ]

  const shouldStaySilent: Array<[string, string]> = [
    ['an object literal', 'logger.error(\'m\', { code: 1 })'],
    ['a spread into an object literal', 'logger.info(\'m\', { ...ctx })'],
    ['an empty object literal', 'logger.info(\'m\', {})'],
    ['no context at all', 'logger.info(\'m\')'],
    // `log()` is `(level, message, context?)` — its context is argument three,
    // so treating argument two as the context would fire on every correct call.
    ['logger.log(), whose second argument is the message', 'logger.log(level, \'m\')'],
    ['a non-logger receiver with a same-named method', 'result.error(\'m\', e)'],
    ['a non-logger call entirely', 'console.warn(\'m\', e)'],
    ['a non-logging method on the logger', 'logger.pushHandler(h, x)']
  ]

  it.each(shouldFire)('fires on %s', (_label, code) => {
    expect(hits(code)).toHaveLength(1)
  })

  it.each(shouldStaySilent)('stays silent on %s', (_label, code) => {
    expect(hits(code)).toHaveLength(0)
  })

  it('names what was passed, so the message says how to fix it', () => {
    expect(hits('logger.error(\'m\', e)')[0]?.message).toContain('`e`')
    expect(hits('logger.warning(\'m\', [1])')[0]?.message).toContain('an array')
  })

  it('offers no autofix — the right wrapper cannot be guessed', () => {
    // For the Error case the correct fix is `{ message, stack }`, not `{ e }`.
    // A fix that guessed would look right and still lose the information.
    expect(linter.verifyAndFix('logger.error(\'m\', e)', CONFIG).output).toBe('logger.error(\'m\', e)')
  })

  it('is wired into eslint.config.mjs over the recipes', async () => {
    const configs = (await composer) as Array<{
      files?: string[]
      plugins?: Record<string, { rules?: Record<string, unknown> }>
      rules?: Record<string, unknown>
    }>
    const entry = configs.find(c => c.rules && RULE_ID in c.rules)

    expect(entry, 'the rule must be wired in eslint.config.mjs').toBeDefined()
    expect(entry?.rules?.[RULE_ID]).toBe('error')
    expect(entry?.files).toContain('skills/b24jssdk-recipes/examples/**/*.ts')
    expect(entry?.files).toContain('skills/b24jssdk-recipes/lib/**/*.ts')
    // Scoped deliberately: enabling it on the SDK source reports twelve false
    // positives in `logger/browser.ts` alone, where the context is hoisted into
    // a variable — correct code that this teaching convention rejects.
    expect(entry?.files).not.toContain('packages/jssdk/src/**/*.ts')
  })
})

/**
 * Locks the `require-catch-on-logger-call` ESLint rule (#346).
 *
 * `eslint-rules/require-catch-on-logger-call.js` keeps every fire-and-forget
 * logger callsite ending in `.catch(…)`. Logger methods return `Promise<void>`
 * and the SDK calls them as bare statements; an unawaited rejection is an
 * unhandled rejection, which terminates the Node process by default. Handlers do
 * real I/O, so a failing log sink would otherwise take the operation with it.
 *
 * The sweep that added `.catch(() => {})` to ~92 callsites is only as durable as
 * this rule — without it, callsite N+1 silently reintroduces the hazard. So this
 * test runs the REAL rule module through ESLint's `Linter` on known-bad /
 * known-good snippets, checks the autofix produces the exact expected text, and
 * separately asserts `eslint.config.mjs` actually wires it over the SDK and the
 * Nuxt module. A broken matcher or an unwired rule turns CI red. Pure logic, no
 * portal — jsSdk:unit.
 */
import { describe, it, expect } from 'vitest'
import { Linter } from 'eslint'
import rule from '../../../eslint-rules/require-catch-on-logger-call.js'
// eslint.config.mjs default-exports a FlatConfigComposer (a thenable resolving to
// the flat-config array). No types ship for it — fine, this file is never tsc-checked.
import composer from '../../../eslint.config.mjs'

const RULE_ID = 'local/require-catch-on-logger-call'
const linter = new Linter()

const CONFIG = {
  languageOptions: { ecmaVersion: 'latest' as const, sourceType: 'module' as const },
  plugins: { local: { rules: { 'require-catch-on-logger-call': rule as never } } },
  rules: { [RULE_ID]: 'error' as const }
}

function verify(code: string) {
  return linter.verify(code, CONFIG).filter(m => m.ruleId === RULE_ID)
}
function guardHits(code: string): number {
  return verify(code).length
}

describe('require-catch-on-logger-call rule (#346)', () => {
  // One case per receiver shape the SDK actually uses, so narrowing the receiver
  // matcher reddens this rather than silently dropping a whole family of files.
  const shouldFire: Array<[string, string]> = [
    ['this.getLogger().info(…)', 'this.getLogger().info(\'post/send\', { requestId })'],
    ['this.getLogger().error(…)', 'this.getLogger().error(\'boom\')'],
    ['this._logger.warning(…)', 'this._logger.warning(\'careful\')'],
    ['a bare `logger` binding', 'logger.debug(\'m\', { requestId })'],
    ['the `$logger` convention', '$logger.notice(\'m\')'],
    ['a private #logger field', 'class A { #logger; m() { this.#logger.emergency(\'m\') } }'],
    ['LoggerFactory.forcedLog(…)', 'this._logger.forcedLog(\'a\', \'m\')'],
    ['a call spanning several lines', 'this.getLogger().info(\n  \'post/send\',\n  { requestId }\n)']
  ]

  // A promise with an owner must be left alone — flagging these would be wrong,
  // not merely noisy: `return`ed passthroughs hand the promise to the caller.
  const shouldStaySilent: Array<[string, string]> = [
    ['an already-caught call', 'this.getLogger().info(\'m\').catch(() => {})'],
    ['a returned call (LoggerBrowser passthrough)', 'function f() { return this.logger.debug(\'m\') }'],
    ['an awaited call', 'async function f() { await logger.error(\'m\') }'],
    ['an assigned call', 'const p = logger.info(\'m\')'],
    ['a non-logger receiver with a same-named method', 'result.error(\'m\')'],
    ['a non-logger call entirely', 'console.warn(\'m\')'],
    ['a non-logging method on the logger', 'logger.pushHandler(h)']
  ]

  it.each(shouldFire)('fires on %s', (_label, code) => {
    expect(guardHits(code)).toBe(1)
  })

  it.each(shouldStaySilent)('stays silent on %s', (_label, code) => {
    expect(guardHits(code)).toBe(0)
  })

  it('names the offending level in the message', () => {
    expect(verify('logger.warning(\'m\')')[0]?.message).toContain('`warning`')
  })

  it('autofixes by appending .catch(() => {}) after the call', () => {
    const output = linter.verifyAndFix('this.getLogger().info(\'m\', { requestId })', CONFIG).output
    expect(output).toBe('this.getLogger().info(\'m\', { requestId }).catch(() => {})')
  })

  it('autofix is idempotent — a fixed callsite is not re-reported', () => {
    const once = linter.verifyAndFix('logger.error(\'m\')', CONFIG).output
    expect(guardHits(once)).toBe(0)
  })

  it('is wired into eslint.config.mjs over the SDK and the Nuxt module', async () => {
    const configs = (await composer) as Array<{
      files?: string[]
      plugins?: Record<string, { rules?: Record<string, unknown> }>
      rules?: Record<string, unknown>
    }>
    const entry = configs.find(c => c.rules && RULE_ID in c.rules)

    expect(entry, 'the rule must be wired in eslint.config.mjs').toBeDefined()
    expect(entry?.rules?.[RULE_ID]).toBe('error')
    expect(entry?.files).toContain('packages/jssdk/src/**/*.ts')
    expect(entry?.files).toContain('packages/jssdk-nuxt/src/**/*.ts')
  })
})

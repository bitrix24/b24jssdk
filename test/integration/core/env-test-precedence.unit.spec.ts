/**
 * Regression for https://github.com/bitrix24/b24jssdk/issues/506
 *
 * `dotenv` does not overwrite a variable that is already set, so a `B24_HOOK`
 * exported in the shell, baked into a container image or inherited from a CI
 * job silently beats `.env.test`. The file is read and its value thrown away
 * with no message at all — `quiet: true` suppresses the little dotenv would
 * otherwise say — and the suite then runs against a portal nobody chose, whose
 * answers read as findings rather than as a misconfiguration.
 *
 * The fix keeps the precedence (an explicitly exported variable is sometimes
 * the intended configuration, and `B24_HOOK=… pnpm vitest` has to keep working)
 * and makes the disagreement visible. This spec pins both halves: the message
 * appears exactly when the two sources disagree, it never carries the secret,
 * and dotenv's precedence is still what the comment claims it is.
 *
 * Two cases drive the real loader over a temp file. Neither reads the
 * repository's own `.env.test` — that file holds a live webhook.
 *
 * The `*.unit.spec.ts` suffix routes this file to the portal-free `jsSdk:unit`
 * Vitest project.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  describeShadowedHook,
  loadEnvTest,
  portalHostOf,
  warnOnceToConsole
} from '../../0_setup/env-test-precedence'

const ENVIRONMENT_SECRET = 'ENV_SECRET_SENTINEL_aaa111'
const FILE_SECRET = 'FILE_SECRET_SENTINEL_bbb222'
const FROM_ENVIRONMENT = `https://env-portal.bitrix24.com/rest/9/${ENVIRONMENT_SECRET}/`
const FROM_FILE = `https://file-portal.bitrix24.com/rest/1/${FILE_SECRET}/`

describe('.env.test precedence for B24_HOOK (#506)', () => {
  describe('portalHostOf', () => {
    it.each([
      ['a webhook URL', FROM_FILE, 'file-portal.bitrix24.com'],
      ['a URL with a port', 'https://portal.local:8443/rest/1/x/', 'portal.local:8443'],
      ['an empty value', '', '(empty)'],
      ['something that is not a URL', 'oops', '(unparseable URL)']
    ])('reports %s as %s', (_label, value, expected) => {
      expect(portalHostOf(value)).toBe(expected)
    })

    it('never returns the secret', () => {
      expect(portalHostOf(FROM_FILE)).not.toContain(FILE_SECRET)
    })
  })

  describe('describeShadowedHook', () => {
    it('says nothing when the variable is not in the environment', () => {
      expect(describeShadowedHook(undefined, FROM_FILE)).toBeNull()
    })

    it('says nothing when the file does not set the variable', () => {
      expect(describeShadowedHook(FROM_ENVIRONMENT, undefined)).toBeNull()
    })

    it('says nothing when the two agree', () => {
      expect(describeShadowedHook(FROM_FILE, FROM_FILE)).toBeNull()
    })

    it('names both hosts when they differ', () => {
      const message = describeShadowedHook(FROM_ENVIRONMENT, FROM_FILE)

      expect(message).not.toBeNull()
      expect(message).toContain('env-portal.bitrix24.com')
      expect(message).toContain('file-portal.bitrix24.com')
      expect(message).toContain('B24_HOOK')
    })

    it('says the values differ when both point at the same host', () => {
      const message = describeShadowedHook(
        `https://same.bitrix24.com/rest/1/${ENVIRONMENT_SECRET}/`,
        `https://same.bitrix24.com/rest/1/${FILE_SECRET}/`
      )

      expect(message).toContain('both point at same.bitrix24.com')
      expect(message).toContain('a different user id or secret')
    })

    // The whole message exists to be printed, so this is the one assertion the
    // file cannot do without: a warning that leaks the credential it is warning
    // about would be worse than the silence it replaces.
    it('never carries either secret', () => {
      const message = describeShadowedHook(FROM_ENVIRONMENT, FROM_FILE) ?? ''

      expect(message).not.toContain(ENVIRONMENT_SECRET)
      expect(message).not.toContain(FILE_SECRET)
    })

    // `export B24_HOOK=` sets the variable to an empty string. dotenv treats it
    // as present and refuses to overwrite it, so the run ends in
    // `setupB24Client()` throwing "not set" while pointing at the file whose
    // value was ignored. Presence, not truthiness.
    it('treats an empty environment value as shadowing, not as absent', () => {
      const message = describeShadowedHook('', FROM_FILE)

      expect(message).not.toBeNull()
      expect(message).toContain('(empty)')
    })

    it('does not throw on a value that is not a URL', () => {
      expect(() => describeShadowedHook('not-a-url', FROM_FILE)).not.toThrow()
      expect(describeShadowedHook('not-a-url', FROM_FILE)).toContain('(unparseable URL)')
    })
  })

  // Vitest evaluates `vitest.config.ts` several times per run — measured at
  // five for one `--project jsSdk:unit` invocation — so the naive version of
  // this warning printed five identical paragraphs. Module-level state does not
  // survive that; the flag lives on `globalThis` under a registry symbol.
  describe('warnOnceToConsole', () => {
    const flag = Symbol.for('b24jssdk.envTestPrecedence.warned')

    afterEach(() => {
      // Assigned rather than `delete`d: the guard tests for `true`, so clearing
      // the value is a full reset, and `no-dynamic-delete` forbids the other form.
      ;(globalThis as unknown as Record<symbol, unknown>)[flag] = undefined
      vi.restoreAllMocks()
    })

    it('prints the first message and swallows the rest', () => {
      ;(globalThis as unknown as Record<symbol, unknown>)[flag] = undefined
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      warnOnceToConsole('first')
      warnOnceToConsole('second')
      warnOnceToConsole('third')

      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith('first')
    })

    // Runs after the `afterEach` reset above, and that is the whole point: the
    // reset reaches the module's flag only because the module keys it with
    // `Symbol.for`, which returns the same symbol to every copy of the module in
    // the process. A plain `Symbol()` would give each evaluation its own flag —
    // the module would still warn once per evaluation, which is the bug — and
    // this test would then find the flag still set and see nothing printed.
    it('prints again once the flag is cleared from outside the module', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      warnOnceToConsole('after reset')

      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith('after reset')
    })
  })

  describe('loadEnvTest', () => {
    let directory: string
    let envTestPath: string
    let hadHook: boolean
    let previousHook: string | undefined

    beforeEach(() => {
      directory = fs.mkdtempSync(path.join(os.tmpdir(), 'b24-env-test-'))
      envTestPath = path.join(directory, '.env.test')
      hadHook = 'B24_HOOK' in process.env
      previousHook = process.env.B24_HOOK
    })

    afterEach(() => {
      if (hadHook) {
        process.env.B24_HOOK = previousHook
      } else {
        delete process.env.B24_HOOK
      }

      // `maxRetries` because this runs on Windows too, where a directory can
      // still be held briefly after the last handle to it closes.
      fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
    })

    it('warns, and leaves the environment value in place', () => {
      fs.writeFileSync(envTestPath, `B24_HOOK=${FROM_FILE}\n`)
      process.env.B24_HOOK = FROM_ENVIRONMENT

      const warnings: string[] = []
      const message = loadEnvTest(envTestPath, m => warnings.push(m))

      expect(message).not.toBeNull()
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toBe(message)
      // The precedence the module's comment claims — pinned, because the whole
      // design rests on it and it belongs to dotenv, not to this repository.
      expect(process.env.B24_HOOK).toBe(FROM_ENVIRONMENT)
    })

    it('applies the file and stays quiet when nothing is shadowed', () => {
      fs.writeFileSync(envTestPath, `B24_HOOK=${FROM_FILE}\n`)
      delete process.env.B24_HOOK

      const warnings: string[] = []

      expect(loadEnvTest(envTestPath, m => warnings.push(m))).toBeNull()
      expect(warnings).toEqual([])
      expect(process.env.B24_HOOK).toBe(FROM_FILE)
    })

    it('stays quiet, and does not throw, when the file is absent', () => {
      process.env.B24_HOOK = FROM_ENVIRONMENT

      const warnings: string[] = []

      expect(loadEnvTest(path.join(directory, 'nothing-here.env'), m => warnings.push(m))).toBeNull()
      expect(warnings).toEqual([])
      expect(process.env.B24_HOOK).toBe(FROM_ENVIRONMENT)
    })
  })
})

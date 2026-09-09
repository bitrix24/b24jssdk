/// <reference types="node" />
import dotenv from 'dotenv'

/**
 * `.env.test` versus the ambient environment, for `B24_HOOK`.
 *
 * `dotenv` never overwrites a variable that is already set, and that precedence
 * is kept here on purpose. `B24_HOOK=… pnpm vitest` is the most explicit thing a
 * developer can do, and a gitignored file silently outranking it would be the
 * same surprise pointed the other way; `smoke-retry.yml` also sets `B24_HOOK`
 * from a repository secret deliberately.
 *
 * What was missing is any way to notice. With a stale `B24_HOOK` exported in the
 * shell, baked into a container image or inherited from a CI job, the file is
 * read and its value discarded in silence — and the suite then runs against a
 * different portal whose answers read as findings rather than as a
 * misconfiguration. Measured once as every call coming back
 * `FEATURE_NOT_AVAILABLE_ON_CURRENT_PLAN`, which looks exactly like a property
 * of the portal under test; the same webhook answered normally through `curl`,
 * and it took printing the URL the SDK actually sends to find the cause (#506).
 *
 * So the precedence stays and the disagreement is said out loud — and **only**
 * the disagreement. No file, no variable, or the two agreeing: nothing is
 * printed. A banner on every `jsSdk:unit` run is noise, and noise is not a
 * warning.
 *
 * Hosts only, never the value. The webhook secret is a path segment of that URL,
 * and this text goes to a terminal and into CI logs — see the credential rules
 * in `.github/contributing/testing.md`.
 */

const HOOK_VARIABLE = 'B24_HOOK'

/**
 * The host of a webhook URL, for a message that must not carry the secret.
 *
 * Never throws. The input is whatever someone typed into a file or a shell, so
 * "not a URL" is an ordinary case here and is itself worth showing — a value
 * that cannot be parsed is usually the mistake being hunted.
 */
export function portalHostOf(value: string): string {
  if (0 === value.length) {
    return '(empty)'
  }

  try {
    const host = new URL(value).host
    return host.length > 0 ? host : '(no host)'
  } catch {
    return '(unparseable URL)'
  }
}

/**
 * The warning text for a `B24_HOOK` that the environment is shadowing, or
 * `null` when there is nothing to say.
 *
 * Presence, not truthiness: `export B24_HOOK=` leaves an **empty** value that
 * `dotenv` still refuses to overwrite, and that case ends in
 * `setupB24Client()` throwing "B24_HOOK environment variable is not set" while
 * pointing the reader at the very file whose value was ignored. It gets the
 * same warning as any other mismatch.
 */
export function describeShadowedHook(
  fromEnvironment: string | undefined,
  fromFile: string | undefined
): string | null {
  if (undefined === fromEnvironment || undefined === fromFile) {
    return null
  }

  if (fromEnvironment === fromFile) {
    return null
  }

  const environmentHost = portalHostOf(fromEnvironment)
  const fileHost = portalHostOf(fromFile)

  const sources = environmentHost === fileHost
    ? `  both point at ${environmentHost}, but the values differ — a different user id or secret`
    : `  environment → ${environmentHost}\n  .env.test   → ${fileHost}`

  return `[.env.test] ${HOOK_VARIABLE} comes from the environment, not from the file.\n`
    + `dotenv does not overwrite a variable that is already set, so the file's value is unused.\n`
    + `${sources}\n`
    + `Unset ${HOOK_VARIABLE} to use the file. Hosts only are shown here; the secret is not printed.`
}

/**
 * Vitest evaluates `vitest.config.ts` more than once per run — a single
 * `--project jsSdk:unit` run evaluated it **five** times — and a module-level
 * boolean does not survive that, because each evaluation gets its own module
 * graph. A registry symbol on `globalThis` does: `Symbol.for` returns the same
 * symbol to every copy of this module in the process.
 *
 * Five identical paragraphs are not five times the warning; they are the thing
 * a reader learns to scroll past.
 */
const ALREADY_WARNED = Symbol.for('b24jssdk.envTestPrecedence.warned')

/**
 * Print the warning at most once per process. Exported so the once-ness is
 * testable — a test clears the flag off `globalThis` and calls this twice.
 */
export function warnOnceToConsole(message: string): void {
  const registry = globalThis as unknown as Record<symbol, unknown>

  if (true === registry[ALREADY_WARNED]) {
    return
  }

  registry[ALREADY_WARNED] = true
  console.warn(message)
}

/**
 * Load `.env.test` and report a `B24_HOOK` the environment is shadowing.
 *
 * Returns the warning text (also passed to `warn`) or `null`. Returning it is
 * what lets a test assert the decision without capturing console output — and
 * the return value is unconditional, so a caller that suppressed the printing
 * still learns what happened.
 *
 * `dotenv.config()` hands back the **file's** contents in `parsed` whether or
 * not they were applied, and `{}` when the file is absent — so the comparison
 * needs no second read of the file and no `existsSync` race.
 */
export function loadEnvTest(
  envTestPath: string,
  warn: (message: string) => void = warnOnceToConsole
): string | null {
  const fromEnvironment = process.env[HOOK_VARIABLE]
  const parsed = dotenv.config({ quiet: true, path: envTestPath }).parsed
  const message = describeShadowedHook(fromEnvironment, parsed?.[HOOK_VARIABLE])

  if (null !== message) {
    warn(message)
  }

  return message
}

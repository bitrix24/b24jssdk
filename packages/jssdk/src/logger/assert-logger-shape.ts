import type { LoggerInterface } from '../types/logger'

/**
 * Every logging method declared by {@link LoggerInterface}. Kept explicit rather
 * than derived, so adding a level to the interface surfaces here as a compile
 * error instead of silently going unchecked.
 */
const LOG_METHODS = [
  'log',
  'debug',
  'info',
  'notice',
  'warning',
  'error',
  'critical',
  'alert',
  'emergency'
] as const satisfies readonly (keyof LoggerInterface)[]

/**
 * Warn if a logger handed to `setLogger(...)` does not look like it returns
 * promises.
 *
 * {@link LoggerInterface} declares every method as `Promise<void>`, and the SDK
 * relies on that: it calls the logger as fire-and-forget and appends
 * `.catch(() => {})` to say it does not care about the outcome. Against a logger
 * whose methods return `undefined` — easy to write in plain JavaScript, or in
 * TypeScript behind an `as any` — that `.catch` is a `TypeError`, at every
 * logging callsite in the SDK. A logging mistake would then break the operation
 * being logged, which is the failure this whole area exists to prevent (#346).
 *
 * TypeScript already rejects a non-conforming implementation at compile time, so
 * this only catches what the compiler cannot see. It warns rather than throws:
 * refusing to install the logger would itself be a logging concern breaking the
 * caller, and the shape is only *probably* wrong — a method could legitimately
 * be absent from a partial stub the caller never triggers.
 *
 * The check is shallow on purpose: it verifies each method exists and is
 * callable, and does not invoke anything. Calling the methods to inspect their
 * return value would emit spurious log records as a side effect of installation.
 *
 * A warning is as far as the SDK goes here, by decision rather than by omission
 * (#346). It does **not** wrap the installed logger to isolate it the way
 * `Logger.log()` isolates its handlers, so an implementation that throws
 * synchronously — before the promise the callsite's `.catch(() => {})` expects —
 * still reaches the caller. Wrapping would put the SDK in charge of code it
 * does not own, at all ~94 callsites, to guard a case the compiler already
 * rejects; the contract is that your methods return promises, and this check is
 * the reminder, not the enforcement.
 *
 * @param logger The logger about to be installed.
 * @param source Where it is being installed, used in the warning text.
 */
export function warnOnNonPromiseLogger(logger: LoggerInterface, source: string): void {
  if (logger === null || typeof logger !== 'object') {
    console.warn(
      `[b24jssdk] ${source}: the value passed to setLogger() is not an object. `
      + `Expected an implementation of LoggerInterface.`
    )
    return
  }

  const missing = LOG_METHODS.filter(name => typeof logger[name] !== 'function')
  if (missing.length > 0) {
    console.warn(
      `[b24jssdk] ${source}: the logger passed to setLogger() is missing `
      + `${missing.join(', ')}. LoggerInterface declares every level as `
      + `Promise<void>; the SDK calls them fire-and-forget, so a missing or `
      + `non-promise method raises a TypeError at the callsite.`
    )
  }
}

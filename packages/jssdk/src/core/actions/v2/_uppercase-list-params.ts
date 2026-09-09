import type { LoggerInterface } from '../../../types/logger'
import { LoggerFactory } from '../../../logger/logger-factory'

/**
 * The `restApi:v2` list walkers page by writing their own **lowercase** `filter`,
 * `order` and `start`. Many older list methods — `user.get` among them — document
 * their parameters in **uppercase**: `FILTER`, `SORT`, `ORDER`. A caller who
 * follows that method's own documentation therefore writes to a different
 * top-level key than the walker does, and both keys travel in the same body.
 *
 * The portal folds the case of top-level keys and lets the **last** one win,
 * which was measured directly on `user.get` (four users, on-premise stand):
 *
 * ```text
 * {"FILTER":{"ID":5},"filter":{"ID":4}}   → [4]   the later key wins
 * {"filter":{"ID":4},"FILTER":{"ID":5}}   → [5]   …in either direction
 * ```
 *
 * Which of the pair is later is **not** fixed, and the first version of this
 * check got that wrong. Object spread preserves a key's *original* insertion
 * position, so writing `filter` again in `{ ...restParams, order, filter, start }`
 * overwrites the value without moving the key:
 *
 * ```text
 * params { FILTER }          → keys [ FILTER, order, filter, start ]  injected later
 * params { filter, FILTER }  → keys [ filter, FILTER, order, start ]  caller's later
 * ```
 *
 * The two cases fail in opposite directions, so this reports them differently:
 *
 * - the injected key is later — the caller's conditions are dropped and the
 *   request returns rows they should have excluded. This is #483: a report asked
 *   for employees, silently included bots and extranet users, and the numbers on
 *   screen looked plausible;
 * - the caller's key is later — it is the walker's **cursor** that is dropped,
 *   the server answers with the same page again and the walk throws
 *   `JSSDK_ACTION_CURSOR_STALLED`. This is the state a caller lands in by
 *   half-applying the advice: adding lowercase `filter` without removing
 *   `FILTER`. Hence the advice is to *move* the conditions, not to add a key.
 *
 * `SORT` collides at one remove and needs no case fold: it makes a method
 * validate `ORDER` as a string, and the walker has already replaced `ORDER` with
 * an object — so the call throws `ERROR_ARGUMENT` ("Order must be a string")
 * rather than answering wrongly. Measured on `user.get`; other methods may or
 * may not tie the two parameters together this way.
 *
 * Nothing is rewritten. Folding `FILTER` into `filter` would guess at a method
 * contract the SDK does not model — the walkers accept any list method — and
 * would replace a visible mistake with an invisible one.
 *
 * The advice assumes the method accepts the lowercase key, which `user.get`
 * does — `filter[ID]=4` narrows it exactly as `FILTER[ID]=4` does. A method that
 * refused the lowercase form could not be paged by these walkers at all, since
 * the cursor has nowhere else to go; none has been found, and this warning would
 * be the first thing to see one.
 */

/** Lowercase keys these walkers write into every request. */
const INJECTED_KEYS = ['filter', 'order', 'start'] as const

type InjectedKey = (typeof INJECTED_KEYS)[number]

/** What the walker uses each injected key for, in the caller's terms. */
const INJECTED_PURPOSE: Record<InjectedKey, string> = {
  filter: 'the `>id` cursor condition that advances the walk',
  order: 'the ordering by the cursor field, which cursor paging depends on',
  start: 'the `start: -1` that turns off the portal\'s own row counting'
}

/** What the caller loses when the walker's key wins. */
const CALLER_LOSES: Record<InjectedKey, string> = {
  filter:
    'its conditions are dropped and the request returns rows they should have excluded',
  order: 'it is ignored — cursor paging must order by the cursor field',
  start: 'it is ignored — the walker pages by cursor, not by offset'
}

/**
 * A key travels to the portal only if the request object owns it with a defined
 * value: `{ ...params }` copies own enumerable properties only, and JSON body
 * serialization drops `undefined` values. Matching that exactly keeps the check
 * from warning about keys the portal never sees.
 */
function isSentKey(requestParams: Record<string, unknown>, key: string): boolean {
  return (
    Object.prototype.hasOwnProperty.call(requestParams, key)
    && undefined !== requestParams[key]
  )
}

function warn(logger: LoggerInterface, action: string, message: string): void {
  // `forcedLog` falls back to `console.warn` when the logger is a `NullLogger`,
  // which is what every client gets until it calls `setLogger()`. A plain
  // `logger.warning()` here would be discarded in exactly the default
  // configuration the #483 report came from.
  LoggerFactory.forcedLog(logger, 'warning', `${action}: ${message}`, {
    code: 'JSSDK_ACTION_V2_SHADOWED_PARAM'
  }).catch(() => {})
}

/** One reported collision: the offending key and what the caller is told. */
export type ShadowedParamWarning = {
  key: string
  message: string
}

/**
 * Warn when the built request carries a key that collides with one the walker
 * writes, once the case fold the portal applies is taken into account.
 *
 * Takes the **built** request rather than the caller's params, because which of
 * a colliding pair the portal keeps depends on their order in that object, and
 * that order is only knowable after it is assembled.
 *
 * Returns what it reported, message included, so a test can assert the decision
 * and its wording directly: `forcedLog` is a deliberate no-op under vitest, so
 * capturing the logger would pin nothing.
 */
export function warnOnShadowedUppercaseParams(
  action: string,
  requestParams: Record<string, unknown>,
  logger: LoggerInterface
): ShadowedParamWarning[] {
  const warned: ShadowedParamWarning[] = []
  const order = Object.keys(requestParams)

  for (const key of order) {
    if (!isSentKey(requestParams, key)) {
      continue
    }

    const folded = key.toLowerCase() as InjectedKey

    if (key === folded || !INJECTED_KEYS.includes(folded)) {
      continue
    }

    if (!isSentKey(requestParams, folded)) {
      continue
    }

    const callerWins = order.indexOf(key) > order.indexOf(folded)

    const message = callerWins
      ? `\`${key}\` is sent after the \`${folded}\` this walker pages with, and the portal keeps `
      + `only the later of two keys that differ by case — so \`${key}\` overwrites `
      + `${INJECTED_PURPOSE[folded]}. The walk will not advance and will fail as stalled. `
      + `Move these conditions into \`${folded}\` and remove \`${key}\`; adding \`${folded}\` `
      + `while leaving \`${key}\` in place is what produces this.`
      : `\`${key}\` is not the key this walker pages with. It writes the lowercase \`${folded}\`, `
        + `the portal keeps only the later of two keys that differ by case, and here the injected `
        + `one is later — so \`${key}\` never takes effect and ${CALLER_LOSES[folded]}. `
        + `Move it to \`${folded}\`, which is merged with the page condition rather than `
        + `replaced by it.`

    warned.push({ key, message })
    warn(logger, action, message)
  }

  if (isSentKey(requestParams, 'SORT')) {
    const message
      = '`SORT` makes this request fail. The walker replaces `order` with an object to page by the '
        + 'cursor, the portal folds that onto `ORDER`, and a method that takes `SORT` validates '
        + '`ORDER` as a string — so the call throws ERROR_ARGUMENT ("Order must be a string"). '
        + 'Measured on `user.get`. Cursor paging fixes the ordering; drop `SORT` and narrow with '
        + 'lowercase `filter` instead.'

    warned.push({ key: 'SORT', message })
    warn(logger, action, message)
  }

  return warned
}

import type { TypeCallParams } from '../../../types/http'
import type { LoggerInterface } from '../../../types/logger'

/**
 * The `restApi:v2` list walkers page by injecting a cursor into **lowercase**
 * `filter` and `order`. Many older list methods — `user.get` among them —
 * document their parameters in **uppercase**: `FILTER`, `SORT`, `ORDER`. A
 * caller who follows that method's own documentation therefore puts their
 * conditions in a different top-level key than the one the walker writes to.
 *
 * The portal folds the case of these keys and lets the **last** one win, which
 * was measured directly (`user.get`, four users, on-premise stand):
 *
 * ```text
 * {"FILTER":{"ID":5},"filter":{"ID":4}}   → [4]   the later key wins
 * {"filter":{"ID":4},"FILTER":{"ID":5}}   → [5]   …in either direction
 * ```
 *
 * The walkers build their request as `{ ...restParams, order, filter, start }`,
 * so the injected `filter` is always written after the caller's `FILTER`. The
 * caller therefore always loses, deterministically — this is not a race or a
 * sometimes:
 *
 * ```text
 * callList user.get FILTER[ID]=4  → n=4 [1,4,5,6]   condition dropped
 * callList user.get filter[ID]=4  → n=1 [4]         condition applied
 * ```
 *
 * Which is how it reached production: a report asked for employees and silently
 * included bots and extranet users, and the numbers on screen looked plausible
 * (#483).
 *
 * `SORT` is worse and better at once. The walker's injected `order` is an
 * object, the portal folds it onto `ORDER`, and `user.get` validates `ORDER` as
 * a string **only when `SORT` is present** — so `SORT` turns the walker's own
 * cursor ordering into a hard failure rather than a wrong answer:
 *
 * ```text
 * callList user.get SORT: 'ID'    → throws ERROR_ARGUMENT, "Order must be a string"
 * callList user.get ORDER: 'DESC' → n=4, silently ignored
 * ```
 *
 * Nothing is rewritten here. Folding `FILTER` into `filter` would be guessing at
 * a method contract the SDK does not model — the walkers accept any list method
 * — and would replace a visible mistake with an invisible one. The caller brings
 * their parameters to the lowercase shape; this says so at the moment it
 * matters, next to the existing warning for a user-supplied `order`.
 *
 * The advice assumes the method accepts the lowercase key, which `user.get`
 * does — `filter[ID]=4` narrows it exactly as `FILTER[ID]=4` does. A method that
 * refused the lowercase form could not be paged by these walkers at all, since
 * the cursor has nowhere else to go; none has been found, and this warning would
 * be the first thing to see one.
 */

/**
 * Uppercase keys the cursor injection interferes with, and how.
 *
 * Written out per key rather than derived from `toLowerCase()`, because the
 * three mechanisms are genuinely different and a composed message got `SORT`
 * wrong: the walker writes no `sort` at all. `SORT` collides at one remove —
 * it makes the method validate `ORDER`, which the walker has already replaced
 * with an object.
 */
const SHADOWED_UPPERCASE_KEYS = ['FILTER', 'SORT', 'ORDER'] as const

const EXPLANATION: Record<(typeof SHADOWED_UPPERCASE_KEYS)[number], string> = {
  FILTER:
    '`FILTER` is not the key this walker pages with. It writes the lowercase `filter`, the portal '
    + 'keeps only the later of two keys that differ by case, and the injected one is always later — '
    + 'so the conditions in `FILTER` are dropped and the request returns rows they should have '
    + 'excluded. Move them to lowercase `filter`, which is merged with the page condition rather '
    + 'than replaced by it.',
  SORT:
    '`SORT` makes this request fail. The walker replaces `order` with an object to page by the '
    + 'cursor, the portal folds that onto `ORDER`, and a method that takes `SORT` validates `ORDER` '
    + 'as a string — so the call throws ERROR_ARGUMENT ("Order must be a string"). Cursor paging '
    + 'fixes the ordering; drop `SORT` and narrow with lowercase `filter` instead.',
  ORDER:
    '`ORDER` is ignored, exactly as a lowercase `order` would be: cursor paging must order by the '
    + 'cursor field, so the walker overwrites it. Narrow with lowercase `filter`, or sort the rows '
    + 'after collecting them.'
}

/**
 * Warn when `params` carries an uppercase key the cursor injection interferes
 * with.
 *
 * Returns the keys it warned about so a test can assert the decision without
 * capturing the logger.
 */
export function warnOnShadowedUppercaseParams(
  action: string,
  params: TypeCallParams,
  logger: LoggerInterface
): string[] {
  const present = SHADOWED_UPPERCASE_KEYS.filter(key => key in params)

  if (0 === present.length) {
    return []
  }

  for (const key of present) {
    logger.warning(`${action}: ${EXPLANATION[key]}`).catch(() => {})
  }

  return present
}

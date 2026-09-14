/** Which way a walk paginates: `ASC` ids grow, `DESC` ids shrink. */
export type CursorDirection = 'ASC' | 'DESC'

/**
 * An ISO-8601 datetime, capturing the two things that have to match before two
 * of them can be ordered as text: the date/time separator, and the zone.
 *
 * The **zone is mandatory**, which is the point. A rendering that states no
 * offset at all — `2024-10-27 02:15:00`, what a MySQL `DATETIME` column prints —
 * repeats the wall-clock hour when the clocks go back, so 02:15 standard time
 * is a later instant than 02:30 summer time and yet sorts before it. Making the
 * zone optional would have let that pair through under "same zone: neither has
 * one", which is the very shape this check exists to decline.
 *
 * The separator is captured for the same reason: `'T'` is `0x54` and `' '` is
 * `0x20`, so a `T`-form value sorts after *every* space-form value with the same
 * date, whatever the time says.
 */
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}([T ])\d{2}:\d{2}:\d{2}(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})$/

const DIGITS_ONLY = /^\d+$/

/**
 * Which way does a walk ordered by `order` paginate?
 *
 * Shared so that the string sent to the server and the direction the cursor is
 * audited against can never disagree. If they did, the SDK would ask the portal
 * to page one way and then reject every correct answer for going the other —
 * failing the walks that work, which is the one outcome this guard must not
 * produce.
 */
export function resolveCursorDirection(order: string): CursorDirection {
  return DESC_ORDER.test(order) ? 'DESC' : 'ASC'
}

/** Matches the `DESC` half of an `order` value, however the caller spelled it. */
export const DESC_ORDER = /desc/i

/**
 * Can these two cursor values be ordered against each other with confidence?
 *
 * Numbers: both finite. Strings: only the two shapes where JS code-unit order
 * provably matches the order the server sorted by.
 *
 * - **Digits only, same length** — a zero-padded id. Same length is what makes
 *   lexicographic and numeric order agree; `'9'` vs `'10'` is false one way and
 *   true the other, so unpadded ids are declined.
 * - **ISO-8601 datetimes stated in the same zone.** The zone matters: across a
 *   DST transition `2024-10-27T02:59:00+02:00` (00:59Z) is *earlier* than
 *   `2024-10-27T02:00:00+01:00` (01:00Z), yet sorts after it as text. Both are
 *   the same length, so length alone would not have caught it.
 *
 * Everything else is declined — deliberately, and letters are the reason. A
 * mixed-case `cursorField` under MySQL's default case-insensitive collation
 * orders `a1` before `B1`; JS orders `'B1'` before `'a1'`. There is no way to
 * tell from the values which collation sorted them, so a walk over such a field
 * must not be called backwards.
 */
function isComparableCursorPair(next: number | string, previous: number | string): boolean {
  if ('number' === typeof next && 'number' === typeof previous) {
    return Number.isFinite(next) && Number.isFinite(previous)
  }

  if ('string' === typeof next && 'string' === typeof previous) {
    if (next.length !== previous.length) {
      return false
    }

    if (DIGITS_ONLY.test(next) && DIGITS_ONLY.test(previous)) {
      return true
    }

    const nextIso = ISO_DATETIME.exec(next)
    const previousIso = ISO_DATETIME.exec(previous)

    return null !== nextIso
      && null !== previousIso
      && nextIso[1] === previousIso[1]
      && nextIso[2] === previousIso[2]
  }

  return false
}

/**
 * Did the cursor move in the direction the walk paginates in?
 *
 * Every keyset walk here asks the server for rows **past** a value: the emulated
 * list walkers append `[cursorIdKey, '>', cursor]`, the native tail walkers send
 * `cursor: { field, value, order }`, which the server reads as `field > value`
 * for `ASC` and `field < value` for `DESC`. So in an answer that honoured the
 * condition the next cursor is strictly past the last one — always, on every
 * page. A value that is equal, or on the wrong side, means the condition was not
 * applied.
 *
 * That is what makes a direction check worth more than the equality check it
 * replaces, and worth more than the alternatives #495 weighed:
 *
 * - it catches a **cycle of any length**. A server alternating `A, B, A, B` never
 *   repeats the immediately preceding value, so the equality check never fires —
 *   but a cycle has to step backwards somewhere, and the first backwards step is
 *   this one. A ring of the last *N* cursors catches cycles up to *N* and costs
 *   memory; this catches all of them and costs nothing;
 * - it costs **no allocation**. The objection that deferred #495 — needing a set
 *   of every cursor seen, an unbounded allocation added to guard against an
 *   unbounded allocation — does not apply to a comparison of two values;
 * - it catches a cursor that simply **moves backwards**, which loses rows
 *   silently rather than looping, and which nothing looked for before.
 *
 * **Only when the two values are comparable**, and that is a deliberately narrow
 * set — see {@link isComparableCursorPair} for what qualifies and why. A cursor
 * is read off the response, and a `cursorField` naming something the SDK cannot
 * order — or a server changing `100` to `'100'` — must not be reported as a
 * failure to advance. Everything the check declines falls back to the equality
 * test this generalises, which is exactly the behaviour it had before.
 *
 * Strings in particular are judged only where JS order is certain to agree with
 * the server's. Every other pair is answered by returning `true` rather than by
 * guessing: a guard that stops a healthy walk is worse than one that misses a
 * sick one, and the equality check underneath still catches a true repeat.
 *
 * Returns `true` when the walk may continue, `false` when it cannot make
 * progress. Equality always answers `false`, whatever the types — that is the
 * check this generalises, and it holds for pairs the direction test declines
 * to judge.
 *
 * @param next - The cursor read from the page just received.
 * @param previous - The cursor that page was requested with.
 * @param direction - Which way this walk paginates.
 */
export function cursorProgressed(
  next: number | string,
  previous: number | string,
  direction: CursorDirection
): boolean {
  if (next === previous) {
    return false
  }

  if (!isComparableCursorPair(next, previous)) {
    // A pair whose order the SDK cannot vouch for: not equal, and not
    // something to call backwards. The walk continues, as it did before this
    // check existed.
    return true
  }

  return 'DESC' === direction ? next < previous : next > previous
}

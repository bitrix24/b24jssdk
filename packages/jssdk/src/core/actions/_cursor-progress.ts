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
 * **Only when the two values are comparable**, which here means the same
 * `typeof` and both primitive. A cursor is read off the response, and a
 * `cursorField` naming something the SDK cannot order — or a server changing
 * `100` to `'100'` — must not be reported as a failure to advance. Mixed types
 * fall back to the equality check this generalises, which is exactly the
 * behaviour they had before.
 *
 * String cursors compare lexicographically, which is right for the shapes that
 * reach here: an ISO-8601 timestamp and a zero-padded id both order correctly
 * that way. A string id without padding (`'9'` vs `'10'`) does not, and would
 * read as backwards — so that case is answered by returning `true` for any pair
 * the check cannot be confident about, rather than by guessing. See
 * {@link isComparableCursorPair}.
 */
export type CursorDirection = 'ASC' | 'DESC'

/**
 * Can these two cursor values be ordered against each other with confidence?
 *
 * Both primitive, both the same type, and — for strings — the same length, so
 * lexicographic order and numeric order agree. `'9' < '10'` is false
 * lexicographically and true numerically; refusing to compare there is what
 * keeps a legitimate walk over unpadded string ids from being called backwards.
 */
function isComparableCursorPair(next: number | string, previous: number | string): boolean {
  if ('number' === typeof next && 'number' === typeof previous) {
    return Number.isFinite(next) && Number.isFinite(previous)
  }

  if ('string' === typeof next && 'string' === typeof previous) {
    return next.length === previous.length
  }

  return false
}

/**
 * `true` when the walk may continue, `false` when it cannot make progress.
 *
 * Equality always answers `false`, whatever the types — that is the check this
 * replaces, and it holds for pairs the direction test declines to judge.
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
    // Different types, or strings of different lengths: not equal, and not
    // something to call backwards. The walk continues, as it did before this
    // check existed.
    return true
  }

  return 'DESC' === direction ? next < previous : next > previous
}

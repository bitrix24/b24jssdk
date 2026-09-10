import { SdkError } from '../sdk-error'

/**
 * The bounds every keyset walk runs under: a page ceiling and a cancellation
 * signal.
 *
 * All six walkers — `callList` / `fetchList` on both API versions, and the v3
 * `callTail` / `fetchTail` — page with `while (true)`. Four exits existed: a
 * short page, an empty page, a soft error, and an unreadable cursor. #493 added
 * a fifth for a cursor that stops moving.
 *
 * None of them bounds a walk whose cursor *does* move. A method with more rows
 * than anyone expected, a filter that matched far more than intended, or the
 * cycling cursor #495 describes — `A, B, A, B` never repeats the immediately
 * preceding value, so the stall guard never fires — all keep issuing requests
 * against the customer's portal, which is the thing the restriction manager
 * exists to prevent. And once started, a walk could not be stopped: there was
 * nowhere to hand a signal (#484).
 *
 * ## Why the ceiling errors rather than truncating
 *
 * Returning what was collected would hand back a list that is short and looks
 * complete — the failure mode this class of bug keeps producing, and the one
 * `JSSDK_ACTION_CURSOR_STALLED` already refuses to produce. A caller who wants
 * the pages that did arrive walks with `fetchList` / `fetchTail`, which yield
 * each page before this throws.
 *
 * ## Why the default is 10 000
 *
 * It is a backstop, not a policy: it should bound a runaway without capping a
 * read anyone actually performs.
 *
 * - On `restApi:v2` a page is 50 rows, so 10 000 pages is **500 000 rows** —
 *   past the point where `callList`, which holds every row in memory, is the
 *   right tool at all. On `restApi:v3` the page size is capped **per method**
 *   rather than at a global 1000, and the default is 50 there too, so the
 *   ceiling lands in the same place for a walk that does not raise `limit`.
 * - At the default `drainRate` of 2 requests/second
 *   (`ParamsFactory.getDefault()`), 10 000 requests is about **83 minutes**. So
 *   the worst case a runaway can inflict on a portal changes from unbounded to
 *   an hour and a half — and a caller who hits the ceiling learns which method
 *   did it.
 *
 * Raise it with `maxPages` when a read genuinely needs more; there is no cap on
 * what you may pass.
 */

/**
 * Page ceiling applied when a caller names none.
 *
 * @see the rationale in this module's docblock — the number is chosen to be
 *   unreachable by a legitimate read, not to express a policy.
 */
export const DEFAULT_MAX_PAGES = 10_000

/**
 * Called after each page an **eager** walker collects (`callList`, `callTail`).
 *
 * Counts, not a percentage. The deprecated `callListMethod` reported percent
 * complete because it paged by offset and the v2 envelope carried `total`;
 * cursor paging reads neither. `restApi:v3` sends no `total` at all, and on v2
 * the walk never asks for one — `getTotal()` needs a request this walk does not
 * make. A denominator would therefore have to be invented, and a made-up
 * percentage is worse than an honest count.
 *
 * The streaming walkers take no `progress`: `fetchList` / `fetchTail` hand the
 * consumer each page as it arrives, so counting them is the consumer's own
 * `for await` body.
 *
 * Called synchronously, and its return value is ignored — a throwing callback
 * would abort the walk, so keep it to reporting. To stop a walk, use `signal`.
 */
export type WalkProgress = (progress: {
  /** Pages read so far, including this one. */
  pages: number
  /** Rows collected so far, including this page. */
  rows: number
}) => void

/** Options every keyset walker accepts, on both API versions. */
export type WalkBoundsOptions = {
  /**
   * Stop after this many pages and throw `JSSDK_ACTION_MAX_PAGES_EXCEEDED`.
   * Defaults to {@link DEFAULT_MAX_PAGES}. Must be a positive integer.
   */
  maxPages?: number
  /**
   * Abort the walk. Throws `JSSDK_ACTION_ABORTED`.
   *
   * Checked at the top of each iteration — so an already-aborted signal costs
   * no request at all — and again in the streaming walkers right after the page
   * is yielded.
   *
   * The second check saves no request: nothing between a response and the next
   * request spends a round trip. It buys the right *diagnosis*. An earlier
   * revision dropped it on the reasoning that the gap after `yield` is empty
   * and no test could tell the two apart. The gap is not empty — the stall
   * guard and the page ceiling both sit in it — so a consumer that aborted
   * while holding a page was told to raise `maxPages`, or that the cursor had
   * stalled, when in fact it had cancelled. Reproduced with `maxPages: 2` and
   * an abort during the hold of page 2.
   *
   * Polled rather than subscribed: `addEventListener` would need tearing down
   * on every exit path, and there are eight.
   */
  signal?: AbortSignal
}

/**
 * Validate `maxPages` and fall back to the default.
 *
 * Refuses a non-integer, zero or negative value rather than coercing it: `0`
 * would mean "walk nothing", which no caller means, and a fractional ceiling
 * would fire at a page number nobody wrote.
 */
export function resolveMaxPages(action: string, maxPages: number | undefined): number {
  if (undefined === maxPages) {
    return DEFAULT_MAX_PAGES
  }

  if (!Number.isInteger(maxPages) || maxPages < 1) {
    throw new SdkError({
      code: 'JSSDK_ACTION_INVALID_MAX_PAGES',
      description: `${action}: \`maxPages\` must be a positive integer — it is the number of pages the walk may read before it gives up. Omit it to use the default of ${DEFAULT_MAX_PAGES}.`,
      status: 400
    })
  }

  return maxPages
}

/**
 * The error a walk raises when it reaches its page ceiling.
 *
 * The method name is interpolated and nothing else. `SdkError` descriptions are
 * **not** run through `redactSensitiveParams` (see `SECURITY.md`), so a cursor
 * value, a filter or a row read off the response must never reach this text —
 * a REST method name is none of those.
 */
export function maxPagesExceededError(action: string, method: string, maxPages: number): SdkError {
  return new SdkError({
    code: 'JSSDK_ACTION_MAX_PAGES_EXCEEDED',
    description: `${action}: stopped after ${maxPages} pages of \`${method}\` without reaching the end of the data. `
      + `Either the read is genuinely larger than the ceiling — raise \`maxPages\` — or the walk is not making progress, `
      + `which happens when the page condition is not applied and the cursor cycles rather than advancing. `
      + `The eager helpers (callList / callTail) return the pages they did read, with this error `
      + `attached — so check \`isSuccess\` rather than assuming a returned list is whole. `
      + `A streaming helper (fetchList / fetchTail) has already yielded every page it read, and `
      + `throws this instead.`,
    status: 500
  })
}

/**
 * The error a walk raises when its `signal` fires.
 *
 * `status: 400`: the caller asked for this, so it is not a portal fault and not
 * an SDK fault. It is still an error rather than a quiet stop, for the same
 * reason the ceiling is — a partial list must not be mistaken for a whole one.
 * That is what the flag is for; the rows themselves are real and are handed
 * back by the eager helpers rather than discarded.
 */
export function walkAbortedError(action: string, method: string): SdkError {
  return new SdkError({
    code: 'JSSDK_ACTION_ABORTED',
    description: `${action}: the walk over \`${method}\` was aborted through its \`signal\`. `
      + `The eager helpers (callList / callTail) return the pages they did read, with this error `
      + `attached; a streaming helper (fetchList / fetchTail) has already yielded every page it read, `
      + `and throws this instead.`,
    status: 400
  })
}

/** Throw {@link walkAbortedError} if `signal` has already fired. */
export function assertNotAborted(
  signal: AbortSignal | undefined,
  action: string,
  method: string
): void {
  if (true === signal?.aborted) {
    throw walkAbortedError(action, method)
  }
}

/**
 * The two codes a walk raises when it stops on a bound the caller set, rather
 * than on anything wrong with the data.
 *
 * They are handled apart from every other failure because the rows collected up
 * to that point are **correct** — merely incomplete. A stalled cursor is not in
 * this set: there the extra rows are duplicates of ones already held, so there
 * is nothing worth handing back.
 */
const WALK_BOUNDS_ERROR_CODES: ReadonlySet<string> = new Set([
  'JSSDK_ACTION_MAX_PAGES_EXCEEDED',
  'JSSDK_ACTION_ABORTED'
])

/**
 * Whether `error` is a walk stopping on one of its own bounds.
 *
 * The eager walkers use this to attach the error to their `Result` and return
 * what they read, the way they already do for a soft error from the portal. The
 * streaming walkers let it through: their consumer has each page as it arrives,
 * so there is nothing left to hand back.
 */
export function isWalkBoundsError(error: unknown): error is SdkError {
  return error instanceof SdkError && WALK_BOUNDS_ERROR_CODES.has(error.code)
}

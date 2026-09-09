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
 *   right tool at all. On `restApi:v3` a page can be 1000, so the same ceiling
 *   is ten million rows and will not be met by a legitimate read.
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
   * Checked once per iteration, at the top of the loop — so an
   * already-aborted signal costs no request at all, and a signal that fires
   * while a page is in flight (or while a streaming consumer is holding one)
   * stops the walk before the next request rather than after it. Nothing
   * between the response and the next request spends a round trip, so a second
   * check further down would change only one thing: a walk whose data ended on
   * the page the caller aborted during would report `JSSDK_ACTION_ABORTED`
   * instead of completing. Finishing normally is the better answer there, and
   * no test could tell the two apart — so there is one check, not two.
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
      + `Nothing is returned, because a list that is short and looks complete is worse than an error. `
      + `A streaming helper (fetchList / fetchTail) has already yielded every page it read.`,
    status: 500
  })
}

/**
 * The error a walk raises when its `signal` fires.
 *
 * `status: 400`: the caller asked for this, so it is not a portal fault and not
 * an SDK fault. It is still an error rather than a quiet stop, for the same
 * reason the ceiling is — a partial list must not be mistaken for a whole one.
 */
export function walkAbortedError(action: string, method: string): SdkError {
  return new SdkError({
    code: 'JSSDK_ACTION_ABORTED',
    description: `${action}: the walk over \`${method}\` was aborted through its \`signal\`. `
      + `Nothing is returned; a streaming helper (fetchList / fetchTail) has already yielded every page it read.`,
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

import { SdkError } from '../sdk-error'

/**
 * The error every keyset walk raises when its cursor stops advancing.
 *
 * A keyset walk reads a cursor out of the page it just received and sends it
 * back on the next request. If the value that comes back is the one already
 * sent, the walk cannot make progress — the server is answering with the same
 * page — and **nothing else in any of these loops notices**: the page is full,
 * so the end-of-data checks stay silent, and the walk runs until the eager
 * helpers exhaust memory or the streaming ones yield the same rows for ever.
 *
 * Shared by both API versions on purpose. The v3 helpers drive a common
 * generator (`actions/v3/_keyset-paginate.ts`); the v2 ones each carry their own
 * inline loop. Three insertion points, one failure, one code — so a caller
 * matching on the string does not have to know which loop they were in, and the
 * error page documents it once.
 *
 * **`status: 500`, not 400.** The neighbouring client-side guards use 400
 * because they decide from the arguments alone, before a request is sent. This
 * one cannot: an identical cursor means the page condition was not applied, and
 * from here there is no way to tell a caller who named the wrong field from a
 * portal that ignores the condition on this method. Reporting a caller error
 * would be a guess.
 *
 * **It throws rather than folding into the `Result`.** The eager helpers catch
 * their soft-error wrapper and return what they collected; an `SdkError` goes
 * past that, so `callList` / `callTail` reject instead of resolving. What makes
 * that right is what the collected rows are worth: for the list walkers the page
 * condition is either honoured from the first request or dropped from the first
 * request, so every row held at that point is page one repeated, and returning
 * it would hand back duplicates that read as data. For the tail walkers a stall
 * can begin after real pages, and those are lost — the honest cost of refusing a
 * result that is both incomplete and duplicated with no way to tell which rows
 * are which. A caller who wants the pages that did arrive should walk with
 * `fetchList` / `fetchTail`, which yield each page before this throws.
 *
 * @param action - Caller-facing label, e.g. `callList.make` — the same wording
 *   the filter guards use, so both errors from one action read alike.
 * @param hint - What to check, in the vocabulary of *that* action. The list
 *   walkers expose `idKey` / `cursorIdKey`; the tail walkers expose
 *   `cursorField`, and telling a `callTail` caller to set `cursorIdKey` would
 *   send them after an option their action does not have.
 */
export function cursorStalledError(action: string, hint: string): SdkError {
  // Static text plus the two labels, both literals chosen by the action. No
  // cursor value, filter, field value or method name is interpolated: unlike
  // AjaxError, SdkError does NOT run its description through
  // `redactSensitiveParams`, and a cursor is a field value read off the
  // response.
  return new SdkError({
    code: 'JSSDK_ACTION_CURSOR_STALLED',
    description: `${action}: the cursor did not move — the server answered with the same page again, so this walk can never finish. ${hint} `
      + `Stopping instead of looping for ever. Note that a streaming helper (fetchList / fetchTail) has already yielded every page it read, including the repeated one, so a consumer that persisted them has to undo that.`,
    status: 500
  })
}

/** What to check when an emulated-keyset **list** walk stalls. */
export const CURSOR_STALLED_HINT_LIST
  = 'Check `idKey` — the id field as the response spells it — against `cursorIdKey`, the field name the request sorts and filters by. When the two differ, the page condition is written with a name the server does not match, and it is dropped: on `restApi:v2` `tasks.task.list` the response carries a lowercase `id` while the filter accepts an uppercase `ID`, so that walk needs `idKey: \'id\', cursorIdKey: \'ID\'`. The v3 method spells it lowercase both ways and needs no override.'

/** What to check when a native **tail** walk stalls. */
export const CURSOR_STALLED_HINT_TAIL
  = 'Check `cursorField`: it must name the field the server actually pages by, it must be readable in the response (include it in `select`), and its values must advance from page to page — a block of rows sharing one value is enough to stall the walk, so prefer a unique field. With `order: \'DESC\'`, check `initialValue` too.'

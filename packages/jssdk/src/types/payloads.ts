import type { ISODate } from './common'
import type { TypeDescriptionError, TypeDescriptionErrorV3 } from './auth'

export type PayloadTime = {
  readonly start: number
  readonly finish: number
  readonly duration: number
  readonly processing: number
  readonly date_start: ISODate
  readonly date_finish: ISODate
  /**
   * Timestamp — when part of the limit for this method will be released.
   *
   * Optional, and absent in two different situations. It is missing whenever
   * `operating` is (see below), and *also* when the portal's limiter is active
   * but has nowhere to store its buckets — measured on a self-hosted build,
   * where `operating` arrived on every response and this one never did.
   *
   * When it is present it means one of two things, and the response gives no
   * way to tell them apart: the expiry of the stored buckets, or — with nothing
   * stored — simply the start of that request plus the window. Treat it as a
   * hint, not as a deadline.
   */
  readonly operating_reset_at?: number
  /**
   * Operating time charged against this method's budget, in seconds.
   *
   * Optional, and missing is the *normal* self-hosted state rather than an edge
   * case: the portal adds the counters only while its own `LoadLimiter` is
   * active, which on-premise reads the `rest` module option
   * `load_limiter_active` — default `N`, and nothing in the product ever sets
   * it. The same switch gates enforcement, so a portal that sends no counters
   * is not limiting either. `OperatingLimiter` skips its bookkeeping instead of
   * assuming a number, and does not synthesise a `0`: that value is
   * indistinguishable from a real "nothing consumed yet".
   *
   * **Present does not mean meaningful.** On a portal where the limiter is
   * switched on but has no storage configured, this arrives on every response
   * and never accumulates — measured at `0.16`, `0`, `0.157` across three
   * identical batch runs. It is the sum within that one request, which is why a
   * call finishing under the portal's 0.1 s floor reads `0`. Throttling on it
   * would never throttle.
   *
   * The budget behind it is per method — a batch is charged to `batch`, at half
   * weight, not to the methods inside it.
   *
   * @see https://bitrix24.github.io/b24jssdk/docs/working-with-the-rest-api/limiters/#enabling-the-operating-limiter-on-a-self-hosted-portal
   *   for how a self-hosted portal is configured to report these, and the
   *   misconfiguration that silently looks like success.
   */
  readonly operating?: number
}

/**
 * The wire envelope of an ordinary single-method response.
 *
 * `time` is optional here for the same reason it is on {@link SuccessPayload},
 * and the two are coupled: `AjaxResult.getData()` returns a `SuccessPayload`
 * where the `IResult` contract expects a `Payload`, so this union member has to
 * stay assignable from it. A required `time` here would make that assignment
 * fail the moment the output type admitted an absent one.
 */
export type GetPayload<P> = {
  readonly result: P
  readonly time?: PayloadTime
}

// @todo ! add api3
export type ListPayload<P> = {
  readonly result: P[]
  // @todo remove this
  // readonly error?: string
  readonly total: number
  readonly next?: number
  readonly time: PayloadTime
}

// @todo ! add api3
export type BatchPayloadResult<C> = {
  readonly result:
    | { readonly [P in keyof C]?: C[P] }
    | ReadonlyArray<C[keyof C]>
  readonly result_error:
    | { readonly [P in keyof C]?: string }
    | readonly string[]
  readonly result_total:
    | { readonly [P in keyof C]?: number }
    | readonly number[]
  readonly result_next:
    | { readonly [P in keyof C]?: number }
    | readonly number[]
  readonly result_time:
    | { readonly [P in keyof C]?: PayloadTime }
    | readonly PayloadTime[]
}

export type BatchPayload<C> = {
  readonly result: BatchPayloadResult<C>
  readonly time: PayloadTime
}

// @todo ! add api3 tail / add / update and etc
export type Payload<P>
  = TypeDescriptionErrorV3
    | TypeDescriptionError
    | GetPayload<P>
    | ListPayload<P>
    | BatchPayload<P>

/**
 * Public shape of a successful REST response, as exposed by `AjaxResult.getData()`.
 *
 * The Bitrix24 REST API wraps a success response in `{ result, time }` for both
 * `restApi:v2` and `restApi:v3` — but not universally:
 * `rest.documentation.openapi` answers with the OpenAPI document at the top
 * level, with no `result` and no `time`, measured on an on-premise build, a
 * cloud portal and a cloud sandbox.
 *
 * `result` is always here regardless, because `getData()` wraps such a body —
 * the body itself becomes `result`, which is what makes that method usable at
 * all. `time` cannot be manufactured the same way, so it is optional.
 *
 * Any v2-only envelope fields (`next`, `total`) are intentionally NOT part of
 * this type — nor are they returned by `getData()` — because they have
 * no `restApi:v3` counterpart, and the SDK's `actions.v{2,3}.{callList,fetchList}`
 * helpers handle pagination internally so consumers never need to read them.
 *
 * @see GetPayload
 */
export type SuccessPayload<P> = {
  readonly result: P
  /**
   * Optional, because a success does not always carry one and the SDK does not
   * invent it. `rest.documentation.openapi` answers with the OpenAPI document at
   * the top level: `getData()` hands that whole body back as `result`, and there
   * is no `time` to report alongside it. Guard before reading a field off it —
   * the type says `undefined` is possible precisely so the compiler makes you.
   */
  readonly time?: PayloadTime
}

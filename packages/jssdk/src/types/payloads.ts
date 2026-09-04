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
   * timestamp - when part of the limit for this method will be released.
   *
   * Optional: absent whenever `operating` is — see below.
   */
  readonly operating_reset_at?: number
  /**
   * indicates the execution time of a request to a specific method.
   *
   * Optional, and missing is the *normal* on-premise state rather than an edge
   * case: `CRestServer::appendDebugInfo()` adds the counters only when the
   * operating limiter is active, which on-premise reads the `rest` module option
   * `load_limiter_active` — default `N`, and nothing in the product ever sets
   * it. `OperatingLimiter` therefore skips its bookkeeping instead of assuming a
   * number, and does not synthesise a `0`: that value is indistinguishable from
   * a real "nothing consumed yet".
   */
  readonly operating?: number
}

export type GetPayload<P> = {
  readonly result: P
  readonly time: PayloadTime
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
 * `restApi:v2` and `restApi:v3` — but not universally, so neither field may be
 * assumed present at runtime: `rest.documentation.openapi` answers with the
 * OpenAPI document at the top level, with no `result` and no `time`, measured on
 * an on-premise build, a cloud portal and a cloud sandbox. The fields stay
 * required here because they are what a caller wants for every ordinary method;
 * code in the transport layer that must survive any response is written against
 * that reality instead (see `OperatingLimiter.updateStats`). Any v2-only envelope
 * fields (`next`, `total`) are intentionally NOT part of this type: they have
 * no `restApi:v3` counterpart, and the SDK's `actions.v{2,3}.{callList,fetchList}`
 * helpers handle pagination internally so consumers never need to read them.
 *
 * @see GetPayload
 */
export type SuccessPayload<P> = {
  readonly result: P
  readonly time: PayloadTime
}

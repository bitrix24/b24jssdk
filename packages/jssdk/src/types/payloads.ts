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
   */
  readonly operating_reset_at: number
  /**
   * indicates the execution time of a request to a specific method.
   */
  readonly operating: number
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
 * The Bitrix24 REST API always wraps a success response in `{ result, time }` —
 * this is true for both `restApi:v2` and `restApi:v3`. Any v2-only envelope
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

import type { ISODate } from './common'

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

export type ListPayload<P> = {
  readonly result: any | P[]
  readonly error?: string
  readonly total: number
  readonly next?: number
  readonly time: PayloadTime
}

export type BatchPayload<C> = {
  readonly result: {
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
  readonly time: PayloadTime
}

export type Payload<P> = GetPayload<P> | ListPayload<P> | BatchPayload<P>

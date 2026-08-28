import type { IResult } from '../result'
import type { Payload, SuccessPayload } from '../../types/payloads'
import type { TypeCallParams, TypeHttp } from '../../types/http'
import type { TypeDescriptionError, TypeDescriptionErrorV3 } from '../../types/auth'
import { Type } from '../../tools/type'
import { Text } from '../../tools/text'
import { Result } from '../result'
import { AjaxError } from './ajax-error'
import { ApiVersion } from '../../types/b24'
import { SdkError } from '../sdk-error'

export type AjaxQuery = Readonly<{
  method: string
  params: TypeCallParams
  requestId: string
}>

type AjaxResultOptions<T> = Readonly<{
  answer: Payload<T>
  query: AjaxQuery
  status: number
}>

type ErrorData = {
  code: string
  description: string
  status: number
}

/**
 * Typed result wrapper for a single Bitrix24 REST API response.
 *
 * Extends {@link Result} with the raw HTTP status, the originating query
 * (method, params, requestId), and the deserialized payload. On construction
 * it inspects the payload for API-level error fields and populates the
 * inherited error collection, so callers can branch on {@link isSuccess}
 * without inspecting raw HTTP status codes.
 */
export class AjaxResult<T = unknown> extends Result<Payload<T>> implements IResult<Payload<T>> {
  private readonly _status: number
  private readonly _query: AjaxQuery
  protected override _data: Payload<T> | null | undefined

  constructor(options: AjaxResultOptions<T>) {
    super()

    this._data = options.answer ? Object.freeze(options.answer) : undefined
    this._query = Object.freeze(structuredClone(options.query))
    this._status = options.status

    this.#processErrors()
  }

  override get isSuccess(): boolean {
    return this.#getIsSuccess()
  }

  /**
   * @todo test this predicate
   */
  #getIsSuccess(): this is { getData: () => SuccessPayload<T> } {
    return this._errors.size === 0
  }

  override getData(): undefined | SuccessPayload<T> {
    if (!this.isSuccess) {
      return undefined
    }

    const payload = this._data as SuccessPayload<T>

    return Object.freeze({
      result: payload.result,
      time: payload.time
    }) as SuccessPayload<T>
  }

  /**
   * If the response contains error data, we'll restore it to an error.
   *
   * @todo make single function
   * @see AbstractHttp._convertAxiosErrorToAjaxError()
   */
  #processErrors(): void {
    if (this._data && typeof this._data === 'object' && 'error' in this._data) {
      const responseData = this._data as TypeDescriptionError | TypeDescriptionErrorV3

      if (
        responseData.error
        && typeof responseData.error === 'object'
        && 'code' in responseData.error
      ) {
        const errorCode = responseData.error.code
        let errorDescription = responseData.error.message.trimEnd()
        if (responseData.error.validation) {
          if (errorDescription.length > 0) {
            if (!errorDescription.endsWith('.')) {
              errorDescription += `.`
            }
            errorDescription += ` `
          }
          responseData.error.validation.forEach((row) => {
            errorDescription += `${row?.message || JSON.stringify(row)}`
          })
        }

        this.addError(this.#createAjaxError({
          code: errorCode,
          description: errorDescription,
          status: this._status
        }), 'base-error')
      } else if (responseData.error && typeof responseData.error === 'string') {
        const errorCode = responseData.error !== '0' ? responseData.error : 'JSSDK_RESPONSE_ERROR'
        const errorDescription = (responseData as TypeDescriptionError)?.error_description ?? 'Some error in response'

        this.addError(this.#createAjaxError({
          code: errorCode,
          description: errorDescription,
          status: this._status
        }), 'base-error')
      }
    }
  }

  #createAjaxError(errorData: ErrorData): AjaxError {
    return new AjaxError({
      code: errorData.code,
      description: errorData.description,
      status: errorData.status,
      requestInfo: {
        method: this._query.method,
        params: this._query.params,
        requestId: this._query.requestId
      }
    })
  }

  /**
   * Alias for {@link AjaxResult.isMore}.
   *
   * `restApi:v2` only — see {@link AjaxResult.isMore} for what this returns on
   * a `restApi:v3` response.
   */
  hasMore(): boolean {
    return this.isMore()
  }

  /**
   * Whether the `restApi:v2` envelope carries a `next` offset — i.e. the portal
   * has more rows for this query.
   *
   * **`restApi:v2` only.** `restApi:v3` returns no `next` field, so this returns
   * `false` on a v3 response — which is not the same statement as "there are no
   * more rows". Do not branch on it for v3; there is nothing to read.
   *
   * This is a reader for a protocol field, not a deprecated API: it stays for as
   * long as `restApi:v2` does — but be clear about what it is good for. Its
   * actionable counterpart, {@link AjaxResult.getNext}, **is** removed in
   * `3.0.0`, so from that release `isMore()` is a **diagnostic** — it tells you
   * the portal has more rows, and gives you nothing to do about it. To actually
   * page, use the list helpers, which hide pagination for both protocol
   * versions:
   *   - `restApi:v2`: `b24.actions.v2.callList.make` or `b24.actions.v2.fetchList.make`
   *   - `restApi:v3`: `b24.actions.v3.callList.make` or `b24.actions.v3.fetchList.make`
   */
  isMore(): boolean {
    if (!this.isSuccess) {
      return false
    }
    const payload = this._data as { next?: number }
    const nextValue = 'next' in payload ? payload.next : undefined

    return Type.isNumber(nextValue)
  }

  /**
   * The row count the `restApi:v2` envelope reports in its `total` field.
   *
   * **`restApi:v2` only.** `restApi:v3` returns no `total`, so this returns `0`
   * on a v3 response — which is not the same statement as "no rows matched".
   * Do not read it for v3; use
   * `b24.actions.v3.aggregate.make` with `count` / `countDistinct` instead,
   * bearing in mind that action is `@experimental` and unverified against a live
   * portal.
   *
   * This is a reader for a protocol field, not a deprecated API. It is the only
   * way to obtain a count under `restApi:v2` — the list helpers iterate without
   * exposing `total`, {@link SuccessPayload} deliberately omits it, and the
   * `aggregate` action exists for `restApi:v3` only. It therefore stays for as
   * long as `restApi:v2` does, and is not part of the `3.0.0` removal set.
   *
   * That is a decision with a trigger, not an open-ended promise. Revisit it
   * when either holds: `b24.actions.v3.aggregate` is verified against a live
   * portal and loses its `@experimental` tag across the common modules (a v3
   * count then exists, and `getTotal()` has a replacement for the first time),
   * or Bitrix24 announces a `restApi:v2` sunset date (the field it reads goes
   * away regardless). Until one of those happens there is nothing to migrate
   * callers to, which is the whole reason it is still here.
   */
  getTotal(): number {
    if (!this.isSuccess) {
      return 0
    }
    const payload = this._data as { total?: number }
    const totalValue = 'total' in payload ? payload.total : undefined

    return Text.toInteger(totalValue)
  }

  getStatus(): number {
    return this._status
  }

  getQuery(): Readonly<AjaxQuery> {
    return this._query
  }

  /**
   * Alias for getNext
   * @param http
   *
   * @deprecated Will be removed in `3.0.0`. `restApi:v3` does not support
   *   `getNext()` (the v2 envelope field `next` does not exist). Use the SDK's
   *   list helpers instead — they hide pagination entirely:
   *   - `restApi:v2`: `b24.actions.v2.callList.make` or `b24.actions.v2.fetchList.make`
   *   - `restApi:v3`: `b24.actions.v3.callList.make` or `b24.actions.v3.fetchList.make`
   *
   * @removed 3.0.0
   */
  async fetchNext(http: TypeHttp): Promise<AjaxResult<T> | null> {
    const data = await this.getNext(http)
    if (data === false) {
      return null
    }

    return data
  }

  /**
   * @deprecated Will be removed in `3.0.0`. Throws on `restApi:v3` because the
   *   v2 envelope field `next` is not part of the v3 protocol. Use the SDK's
   *   list helpers instead — they hide pagination entirely:
   *   - `restApi:v2`: `b24.actions.v2.callList.make` or `b24.actions.v2.fetchList.make`
   *   - `restApi:v3`: `b24.actions.v3.callList.make` or `b24.actions.v3.fetchList.make`
   *
   * @throws {SdkError} `JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3` when called against a `restApi:v3` HTTP client. This throw is preserved until `3.0.0`.
   * @removed 3.0.0
   */
  async getNext(http: TypeHttp): Promise<AjaxResult<T> | false> {
    // @todo ! Correction -> we can use pagination to navigate to the next page
    if (http.apiVersion === ApiVersion.v3) {
      throw new SdkError({
        code: 'JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3',
        description: `restApi:v3 not support method getNext`,
        status: 500
      })
    }
    if (
      !this.isSuccess
      || !this.isMore()
    ) {
      return false
    }

    const nextPageQuery = this.#buildNextPageQuery()
    return http.call(
      nextPageQuery.method,
      nextPageQuery.params
    ) as Promise<AjaxResult<T>>
  }

  #buildNextPageQuery(): AjaxQuery {
    const payload = this._data as { next?: number }
    const nextValue = 'next' in payload ? payload.next : undefined

    // Fresh params object — the previous shallow `{ ...this._query }` shared the
    // params reference and wrote `start` back into the frozen _query, so the
    // previous result's getQuery().params silently changed after getNext() (#144).
    return {
      ...this._query,
      params: { ...this._query.params, start: Text.toInteger(nextValue) }
    }
  }

  // Immutable API
  override setData(): never {
    throw new ReferenceError('AjaxResult does not allow data modification')
  }
}

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
   * Alias for isMore
   *
   * @deprecated Will be removed in `3.0.0`. Tied to the `restApi:v2` envelope
   *   field `next`, which `restApi:v3` does not return. Use the SDK's list
   *   helpers — they hide pagination entirely:
   *   - `restApi:v2`: {@link CallListV2.make `b24.actions.v2.callList.make`} or {@link FetchListV2.make `b24.actions.v2.fetchList.make`}
   *   - `restApi:v3`: {@link CallListV3.make `b24.actions.v3.callList.make`} or {@link FetchListV3.make `b24.actions.v3.fetchList.make`}
   *
   * @removed 3.0.0
   */
  hasMore(): boolean {
    return this.isMore()
  }

  /**
   * @deprecated Will be removed in `3.0.0`. Tied to the `restApi:v2` envelope
   *   field `next`, which `restApi:v3` does not return. Use the SDK's list
   *   helpers — they hide pagination entirely:
   *   - `restApi:v2`: {@link CallListV2.make `b24.actions.v2.callList.make`} or {@link FetchListV2.make `b24.actions.v2.fetchList.make`}
   *   - `restApi:v3`: {@link CallListV3.make `b24.actions.v3.callList.make`} or {@link FetchListV3.make `b24.actions.v3.fetchList.make`}
   *
   * @removed 3.0.0
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
   * @deprecated Will be removed in `3.0.0`. Tied to the `restApi:v2` envelope
   *   field `total`, which `restApi:v3` does not return. `restApi:v3` has no
   *   element-count replacement yet — an `aggregate` action (`count` /
   *   `countDistinct`) is planned but not exposed in the SDK; for `restApi:v2`
   *   use the list helpers, which iterate without exposing `total`.
   *
   * @removed 3.0.0
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
   *   - `restApi:v2`: {@link CallListV2.make `b24.actions.v2.callList.make`} or {@link FetchListV2.make `b24.actions.v2.fetchList.make`}
   *   - `restApi:v3`: {@link CallListV3.make `b24.actions.v3.callList.make`} or {@link FetchListV3.make `b24.actions.v3.fetchList.make`}
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
   *   - `restApi:v2`: {@link CallListV2.make `b24.actions.v2.callList.make`} or {@link FetchListV2.make `b24.actions.v2.fetchList.make`}
   *   - `restApi:v3`: {@link CallListV3.make `b24.actions.v3.callList.make`} or {@link FetchListV3.make `b24.actions.v3.fetchList.make`}
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

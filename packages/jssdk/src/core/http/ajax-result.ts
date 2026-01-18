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
 * Result of request to Rest Api
 *
 * @todo docs
 */
export class AjaxResult<T = unknown> extends Result<Payload<T>> implements IResult<Payload<T>> {
  private readonly _status: number
  private readonly _query: AjaxQuery
  protected override _data: Payload<T>

  constructor(options: AjaxResultOptions<T>) {
    super()

    this._data = Object.freeze(options.answer)
    this._query = Object.freeze(structuredClone(options.query))
    this._status = options.status

    this.#processErrors()
  }

  /**
   * If the response contains error data, we'll restore it to an error.
   *
   * @todo make single function
   * @see AbstractHttp._convertAxiosErrorToAjaxError()
   */
  #processErrors(): void {
    if (this._data && typeof this._data === 'object') {
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

  override getData(): undefined | SuccessPayload<T> {
    if (!this.isSuccess) {
      return undefined
    }

    const payload = this._data as SuccessPayload<T>

    return Object.freeze({
      result: payload.result,
      next: 'next' in payload ? payload.next : undefined,
      total: 'total' in payload ? payload.total : undefined,
      time: payload.time
    }) as SuccessPayload<T>
  }

  /**
   * Alias for isMore
   */
  hasMore(): boolean {
    return this.isMore()
  }

  isMore(): boolean {
    if (!this.isSuccess) {
      return false
    }
    const payload = this._data as SuccessPayload<T>
    const nextValue = 'next' in payload ? payload.next : undefined

    return Type.isNumber(nextValue)
  }

  getTotal(): number {
    if (!this.isSuccess) {
      return 0
    }
    const payload = this._data as SuccessPayload<T>
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
   * @todo !fix api version
   */
  async fetchNext(http: TypeHttp): Promise<AjaxResult<T> | null> {
    const data = await this.getNext(http)
    if (data === false) {
      return null
    }

    return data
  }

  async getNext(http: TypeHttp): Promise<AjaxResult<T> | false> {
    // @todo ! Correction -> we can use pagination to navigate to the next page
    if (http.apiVersion === ApiVersion.v3) {
      throw new SdkError({
        code: 'JSSDK_CORE_B24_API_V3_NOT_SUPPORT_METHOD',
        description: `Api:v3 not support method getNext`,
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
    const result = { ...this._query }

    const payload = this._data as SuccessPayload<T>
    const nextValue = 'next' in payload ? payload.next : undefined

    result.params.start = Text.toInteger(Text.toInteger(nextValue))

    return result
  }

  // Immutable API
  override setData(): never {
    throw new ReferenceError('AjaxResult does not allow data modification')
  }
}

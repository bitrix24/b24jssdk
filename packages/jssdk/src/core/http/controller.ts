import { LoggerBrowser, LoggerType } from '../../logger/browser'
import type { TypeHttp, TypeRestrictionManagerParams } from '../../types/http'
import RestrictionManager from './restriction-manager'
import RequestIdGenerator from './request-id-generator'
import { Result } from '../result'
import { AjaxError } from './ajax-error'
import { AjaxResult } from './ajax-result'
import Type from '../../tools/type'
import type { AjaxQuery, AjaxResultParams } from './ajax-result'
import type {
  AuthActions,
  AuthData,
  TypeDescriptionError,
} from '../../types/auth'
import type { BatchPayload } from '../../types/payloads'

import axios, { type AxiosInstance, AxiosError } from 'axios'
import * as qs from 'qs-esm'

type AjaxResponse = {
  status: number
  payload: AjaxResultParams
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const BITRIX24_OAUTH_SERVER_URL = 'https://oauth.bitrix.info'

/**
 * Class for working with RestApi requests via http
 *
 * @link https://dev.1c-bitrix.ru/rest_help/
 */
export default class Http implements TypeHttp {
  #clientAxios: AxiosInstance
  #authActions: AuthActions
  #restrictionManager: RestrictionManager
  #requestIdGenerator: RequestIdGenerator
  private _logger: null | LoggerBrowser = null
  private _loggerSystem: null | LoggerBrowser = null

  #logTag: string = ''
  #isClientSideWarning: boolean = false
  #clientSideWarningMessage: string = ''

  constructor(
    baseURL: string,
    authActions: AuthActions,
    options?: null | object
  ) {

    const defaultHeaders = {
      // 'X-Sdk': '__SDK_USER_AGENT__-v-__SDK_VERSION__'
    }

    this.#clientAxios = axios.create({
      baseURL: baseURL,
      headers: {
        ...defaultHeaders,
        ...(options ? (options as any).headers : {}),
      },
      ...(options && { ...options, headers: undefined }),
    })

    this.#authActions = authActions
    this.#restrictionManager = new RestrictionManager()
    this.#requestIdGenerator = new RequestIdGenerator()
  }

  // region Logger ////
  setLogger(logger: LoggerBrowser): void {
    this._logger = logger
    this.#restrictionManager.setLogger(this.getLogger())
  }

  getLogger(): LoggerBrowser {
    if (null === this._logger) {
      this._logger = LoggerBrowser.build(`NullLogger`)

      this._logger.setConfig({
        [LoggerType.desktop]: false,
        [LoggerType.log]: false,
        [LoggerType.info]: false,
        [LoggerType.warn]: false,
        [LoggerType.error]: true,
        [LoggerType.trace]: false,
      })
    }

    return this._logger
  }

  getSystemLogger(): LoggerBrowser {
    if (null === this._loggerSystem) {
      this._loggerSystem = LoggerBrowser.build(`SystemLogger`)

      this._loggerSystem.setConfig({
        [LoggerType.desktop]: false,
        [LoggerType.log]: false,
        [LoggerType.info]: true,
        [LoggerType.warn]: true,
        [LoggerType.error]: true,
        [LoggerType.trace]: false,
      })
    }

    return this._loggerSystem
  }

  // endregion ////

  // region RestrictionManager ////
  setRestrictionManagerParams(params: TypeRestrictionManagerParams): void {
    this.#restrictionManager.params = params
  }

  getRestrictionManagerParams(): TypeRestrictionManagerParams {
    return this.#restrictionManager.params
  }

  // endregion ////

  // region LogTag ////
  setLogTag(logTag: string): void {
    this.#logTag = logTag
  }

  clearLogTag(): void {
    this.#logTag = ''
  }

  // endregion ////

  // region Actions Call ////
  async batch(
    calls: any[] | object,
    isHaltOnError: boolean = true,
    returnAjaxResult: boolean = false
  ): Promise<Result> {
    if (Array.isArray(calls)) {
      return this.#batchAsArray(
        calls,
        isHaltOnError,
        returnAjaxResult
      )
    }

    return this.#batchAsObject(
      calls,
      isHaltOnError,
      returnAjaxResult
    )
  }

  async #batchAsObject(
    calls: object,
    isHaltOnError: boolean = true,
    returnAjaxResult: boolean = false
  ): Promise<Result> {
    const cmd: any = {}
    let cnt = 0

    const processRow = (row: any, index: string | number) => {
      let method = null
      let params = null

      if (row.method) {
        method = row.method ?? null
        params = row?.params ?? null
      }
      else if (Array.isArray(row) && row.length > 0)
      {
        method = row[0] ?? null
        params = row[1] ?? null
      }

      if (method) {
        cnt++

        cmd[index] = method + '?' + qs.stringify(params)
      }
    }

    for (const [index, row] of Object.entries(calls)) {
      processRow(row, index)
    }

    if (cnt < 1) {
      return Promise.resolve(new Result())
    }

    return this.call('batch', {
      halt: isHaltOnError ? 1 : 0,
      cmd: cmd,
    }).then((response: AjaxResult) => {
      const responseResult = (response.getData() as BatchPayload<unknown>)
        .result
      const results: Record<string | number, AjaxResult> = {}

      const processResponse = (row: string, index: string | number) => {
        if (
          // @ts-ignore
          typeof responseResult.result[index] !== 'undefined' ||
          // @ts-ignore
          typeof responseResult.result_error[index] !== 'undefined'
        ) {
          const q = row.split('?')

          results[index] = new AjaxResult({
            answer: {
              // @ts-ignore
              result: Type.isUndefined(responseResult.result[index])
                ? // @ts-ignore
                {}
                : // @ts-ignore
                responseResult.result[index],
              // @ts-ignore
              error: responseResult?.result_error[index] || undefined,
              // @ts-ignore
              total: responseResult.result_total[index],
              // @ts-ignore
              next: responseResult.result_next[index],
              // @todo test this ////
              // @ts-ignore
              time: responseResult.result_time[index]
            },
            query: {
              method: q[0] || '',
              params: qs.parse(q[1] || ''),
              start: 0
            } as AjaxQuery,
            status: response.getStatus()
          })
        }
      }

      for (const [index, row] of Object.entries(cmd)) {
        processResponse(row as string, index)
      }

      const dataResult: Record<any, any> = {}

      const initError = (result: AjaxResult): AjaxError => {
        if (result.hasError('base-error')) {
          return result.errors.get('base-error') as AjaxError
        }

        return new AjaxError({
          code: '0',
          description: result.getErrorMessages().join('; '),
          status: 0,
          requestInfo: {
            method: result.getQuery().method,
            params: result.getQuery().params
          },
          originalError: result.getErrors().next().value
        })
      }

      const result = new Result()

      for (const key of Object.keys(results)) {
        const data: AjaxResult = results[key]

        if (data.getStatus() !== 200 || !data.isSuccess) {
          const error = initError(data)

          if (!isHaltOnError && !data.isSuccess) {
            result.addError(error, key)
            continue
          }

          return Promise.reject(error)
        }

        dataResult[key] = returnAjaxResult ? data : data.getData().result
      }

      result.setData(dataResult)

      return Promise.resolve(result)
    })
  }

  async #batchAsArray(
    calls: any[],
    isHaltOnError: boolean = true,
    returnAjaxResult: boolean = false
  ): Promise<Result> {
    const cmd: string[] = []
    let cnt = 0

    const processRow = (row: any) => {
      let method = null
      let params = null

      if (row.method) {
        method = row.method ?? null
        params = row?.params ?? null
      }
      else if (Array.isArray(row) && row.length > 0)
      {
        method = row[0] ?? null
        params = row[1] ?? null
      }

      if (method) {
        cnt++

        const data = method + '?' + qs.stringify(params)
        cmd.push(data)
      }
    }

    for (const [_, row] of calls.entries()) {
      processRow(row)
    }

    if (cnt < 1) {
      return Promise.resolve(new Result())
    }

    return this.call('batch', {
      halt: isHaltOnError ? 1 : 0,
      cmd: cmd,
    }).then((response: AjaxResult) => {
      const responseResult = (response.getData() as BatchPayload<unknown>)
        .result
      const results: AjaxResult[] = []

      const processResponse = (row: string, index: string | number) => {
        if (
          // @ts-ignore
          typeof responseResult.result[index] !== 'undefined' ||
          // @ts-ignore
          typeof responseResult.result_error[index] !== 'undefined'
        ) {
          const q = row.split('?')

          const data = new AjaxResult({
            answer: {
              // @ts-ignore
              result: Type.isUndefined(responseResult.result[index])
                ? // @ts-ignore
                {}
                : // @ts-ignore
                responseResult.result[index],
              // @ts-ignore
              error: responseResult?.result_error[index] || undefined,
              // @ts-ignore
              total: responseResult.result_total[index],
              // @ts-ignore
              next: responseResult.result_next[index],
              // @todo test this ////
              // @ts-ignore
              time: responseResult.result_time[index]
            },
            query: {
              method: q[0] || '',
                params: qs.parse(q[1] || ''),
              start: 0,
            } as AjaxQuery,
            status: response.getStatus()
          })

          results.push(data)
        }
      }

      for (const [index, row] of cmd.entries()) {
        processResponse(row, index)
      }

      const dataResult: any[] = []

      const initError = (result: AjaxResult): AjaxError => {
        if (result.hasError('base-error')) {
          return result.errors.get('base-error') as AjaxError
        }

        return new AjaxError({
          code: '0',
          description: result.getErrorMessages().join('; '),
          status: 0,
          requestInfo: {
            method: result.getQuery().method,
            params: result.getQuery().params
          },
          originalError: result.getErrors().next().value
        })
      }

      const result = new Result()

      for (const data of results as AjaxResult[]) {
        if (data.getStatus() !== 200 || !data.isSuccess) {
          const error = initError(data)

          if (!isHaltOnError && !data.isSuccess) {
            result.addError(error)
            continue
          }

          return Promise.reject(error)
        }

        dataResult.push(returnAjaxResult ? data : data.getData().result)
      }

      result.setData(dataResult)
      return Promise.resolve(result)
    })
  }

  /**
   * Calling the RestApi function
   *
   * If we get a problem with authorization, we make one attempt to update the access token
   *
   * @param method
   * @param params
   * @param start
   */
  async call(
    method: string,
    params: object,
    start: number = 0
  ): Promise<AjaxResult> {
    let authData = this.#authActions.getAuthData()
    if (authData === false) {
      authData = await this.#authActions.refreshAuth()
    }

    await this.#restrictionManager.check()

    if (
      this.#isClientSideWarning
      && !this.isServerSide()
      && Type.isStringFilled(this.#clientSideWarningMessage)
    ) {
      this.getSystemLogger().warn(this.#clientSideWarningMessage)
    }

    return this.#clientAxios
      .post(
        this.#prepareMethod(method),
        this.#prepareParams(authData, params, start)
      )
      .then(
        (response: {
          data: AjaxResultParams
          status: any
        }): Promise<AjaxResponse> => {
          const payload = response.data as AjaxResultParams
          return Promise.resolve({
            status: response.status,
            payload: payload,
          } as AjaxResponse)
        },
        async (error_: AxiosError) => {
          let answerError = {
            error: error_?.code || 0,
            errorDescription: error_?.message || '',
          }

          if (
            error_ instanceof AxiosError &&
            error_.response &&
            error_.response.data &&
            !Type.isUndefined((error_.response.data as TypeDescriptionError).error)
          ) {
            const response = error_.response.data as {
              error: string
              error_description: string
            } as TypeDescriptionError

            answerError = {
              error: response.error,
              errorDescription: response.error_description,
            }
          }

          const problemError: AjaxError = new AjaxError({
            code: String(answerError.error),
            description: answerError.errorDescription,
            status: error_.response?.status || 0,
            requestInfo: {
              method: method,
              params: params,
            },
            originalError: error_,
          })

          /**
           * Is response status === 401 -> refresh Auth?
           */
          if (
            problemError.status === 401 &&
            ['expired_token', 'invalid_token'].includes(
              problemError.answerError.error
            )
          ) {
            this.getLogger().info(
              `refreshAuth >> ${ problemError.answerError.error } >>>`
            )

            authData = await this.#authActions.refreshAuth()
            await this.#restrictionManager.check()

            return this.#clientAxios
              .post(
                this.#prepareMethod(method),
                this.#prepareParams(authData, params, start)
              )
              .then(
                async (response: {
                  data: AjaxResultParams
                  status: any
                }): Promise<AjaxResponse> => {
                  const payload = response.data as AjaxResultParams
                  return Promise.resolve({
                    status: response.status,
                    payload: payload,
                  } as AjaxResponse)
                },
                async (error__: AxiosError) => {
                  let answerError = {
                    error: error__?.code || 0,
                    errorDescription: error__?.message || '',
                  }

                  if (
                    error__ instanceof AxiosError &&
                    error__.response &&
                    error__.response.data
                  ) {
                    const response = error__.response.data as {
                      error: string
                      error_description: string
                    } as TypeDescriptionError

                    answerError = {
                      error: response.error,
                      errorDescription: response.error_description,
                    }
                  }

                  const problemError: AjaxError = new AjaxError({
                    code: String(answerError.error),
                    description: answerError.errorDescription,
                    status: error_.response?.status || 0,
                    requestInfo: {
                      method: method,
                      params: params,
                    },
                    originalError: error__,
                  })

                  return Promise.reject(problemError)
                }
              )
          }

          return Promise.reject(problemError)
        }
      )
      .then((response: AjaxResponse): Promise<AjaxResult> => {
        const result = new AjaxResult({
          answer: response.payload,
          query: {
            method,
            params,
            start,
          } as AjaxQuery,
          status: response.status
        })

        return Promise.resolve(result)
      })
  }

  // endregion ////

  // region Prepare ////
  /**
   * Processes function parameters and adds authorization
   *
   * @param authData
   * @param params
   * @param start
   *
   * @private
   */
  #prepareParams(authData: AuthData, params: any, start: number = 0): object {
    const result = Object.assign({}, params)

    if (this.#logTag.length > 0) {
      result.logTag = this.#logTag
    }

    // result[this.#requestIdGenerator.getQueryStringParameterName()] =
    //   this.#requestIdGenerator.getRequestId()
    // result[this.#requestIdGenerator.getQueryStringSdkParameterName()] =
    //   '__SDK_VERSION__'

    if (!!result.data && !!result.data.start) {
      delete result.data.start
    }

    /**
     * @memo we skip auth for hook
     */
    if (authData.refresh_token !== 'hook') {
      result.auth = authData.access_token
    }

    result.start = start

    return result
  }

  /**
   * Makes the function name safe and adds JSON format
   *
   * @param method
   * @private
   */
  #prepareMethod(method: string): string {
    const baseUrl = `${ encodeURIComponent(method) }.json`
    const queryParams = new URLSearchParams({
      [this.#requestIdGenerator.getQueryStringParameterName()]: this.#requestIdGenerator.getRequestId(),
      [this.#requestIdGenerator.getQueryStringSdkParameterName()]: '__SDK_VERSION__',
      [this.#requestIdGenerator.getQueryStringSdkTypeParameterName()]: '__SDK_USER_AGENT__'
    })
    return `${baseUrl}?${queryParams.toString()}`;
  }

  /**
   * @inheritDoc
   */
  public setClientSideWarning(
    value: boolean,
    message: string
  ): void {
    this.#isClientSideWarning = value
    this.#clientSideWarningMessage = message
  }

  // endregion ////

  // region Tools ////
  /**
   * Tests whether the code is executed on the client side
   * @return {boolean}
   * @protected
   */
  protected isServerSide(): boolean {
    return typeof window === 'undefined'
  }

  // endregion ////
}

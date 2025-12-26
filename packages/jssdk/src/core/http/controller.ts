import { LoggerBrowser, LoggerType } from '../../logger/browser'
import type {
  TypeHttp,
  AdaptiveConfig,
  RateLimitConfig,
  OperatingLimitConfig,
  RestrictionManagerStats,
  RestrictionParams
} from '../../types/http'
import RequestIdGenerator from './request-id-generator'
import { Result } from '../result'
import { AjaxError } from './ajax-error'
import { AjaxResult } from './ajax-result'
import Type from '../../tools/type'
import type { AjaxQuery, AjaxResultParams } from './ajax-result'
import type {
  AuthActions,
  AuthData,
  TypeDescriptionError
} from '../../types/auth'
import type { BatchPayload } from '../../types/payloads'

import axios, { type AxiosInstance, AxiosError } from 'axios'
import * as qs from 'qs-esm'

type AjaxResponse<T = unknown> = {
  status: number
  payload: AjaxResultParams<T>
}

// interface OperatingStats {
//   total: number // Суммарное operating время за 10 минут (в мс)
//   resetAt: number // Время сброса (timestamp в мс)
//   history: Array<{ // История запросов для скользящего окна 10 минут
//     timestamp: number
//     operating: number // Время выполнения в мс
//   }>
// }

interface OperatingStats {
  operating: number // operating время за 10 минут (в мс)
  operating_reset_at: number // Время сброса (timestamp в мс)
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
  #requestIdGenerator: RequestIdGenerator
  private _logger: null | LoggerBrowser = null
  private _loggerSystem: null | LoggerBrowser = null

  #logTag: string = ''
  #isClientSideWarning: boolean = false
  #clientSideWarningMessage: string = ''

  /**
   * // fix
   * // Основные параметры ограничений
   * @see RestrictionParamsFactory.getDefault
   */
  #restrictionParams: RestrictionParams = {
    rateLimit: {
      burstLimit: 50,
      drainRate: 2
    },
    operatingLimit: {
      windowMs: 6000_000, // 10 минут
      limitMs: 480_000 // 480 секунд
    },
    adaptiveConfig: {
      thresholdPercent: 80,
      coefficient: 0.01,
      maxDelay: 7_000,
      enabled: true
    },
    maxRetries: 3,
    retryDelay: 1_000
  }

  // fix
  // Внутреннее состояние rate limiting (Leaky Bucket)
  #tokens: number
  #lastRefill: number
  #refillIntervalMs: number

  // fix
  // Внутреннее состояние operating limiting
  // #methodOperatingStats = new Map<string, OperatingStats>()

  // fix
  // Адаптивная задержка состояние
  #lastOperatingTimes = new Map<string, OperatingStats>() // Последнее operating и resetAt время по методам

  // fix
  // Статистика
  #stats: RestrictionManagerStats = {
    totalRequests: 0,
    limitHits: 0,
    adaptiveDelays: 0,
    totalAdaptiveDelay: 0,
    retries: 0,
    heavyRequestCount: 0,
    consecutiveErrors: 0,
    tokens: 0,
    operatingStats: {}
  }

  constructor(
    baseURL: string,
    authActions: AuthActions,
    options?: null | object,
    restrictionParams?: Partial<RestrictionParams>
  ) {
    const defaultHeaders = {
      // 'X-Sdk': '__SDK_USER_AGENT__-v-__SDK_VERSION__'
    }

    this.#clientAxios = axios.create({
      baseURL: baseURL,
      headers: {
        ...defaultHeaders,
        ...(options ? (options as any).headers : {})
      },
      ...(options && { ...options, headers: undefined })
    })

    this.#authActions = authActions
    this.#requestIdGenerator = new RequestIdGenerator()

    // fix
    // Применяем переданные параметры ограничений
    if (restrictionParams) {
      this.setRestrictionManagerParams(restrictionParams)
    }

    // fix
    // Инициализируем rate limiter
    this.#tokens = this.#restrictionParams.rateLimit!.burstLimit!
    this.#lastRefill = Date.now()
    this.#refillIntervalMs = 1000 / this.#restrictionParams.rateLimit!.drainRate!
  }

  // region Logger ////
  setLogger(logger: LoggerBrowser): void {
    this._logger = logger
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
        [LoggerType.trace]: false
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
        [LoggerType.trace]: false
      })
    }

    return this._loggerSystem
  }
  // endregion ////

  // region RestrictionManager методы ////
  // fix
  setRestrictionManagerParams(params: RestrictionParams): void {
    // Мерджим переданные параметры с текущими
    this.#restrictionParams = {
      ...this.#restrictionParams,
      ...params,
      rateLimit: {
        ...this.#restrictionParams.rateLimit,
        ...params.rateLimit
      } as RateLimitConfig,
      operatingLimit: {
        ...this.#restrictionParams.operatingLimit,
        ...params.operatingLimit
      } as OperatingLimitConfig,
      adaptiveConfig: {
        ...this.#restrictionParams.adaptiveConfig,
        ...params.adaptiveConfig
      } as AdaptiveConfig
    }

    this.getLogger().log(`new restriction manager params`, this.#restrictionParams)

    // Обновляем внутреннее состояние rate limiter
    this.#tokens = this.#restrictionParams.rateLimit!.burstLimit!
    this.#refillIntervalMs = 1000 / this.#restrictionParams.rateLimit!.drainRate!
    this.#lastRefill = Date.now()
  }

  // fix
  getRestrictionManagerParams(): RestrictionParams {
    return { ...this.#restrictionParams }
  }

  /**
   * // fix
   * Получает время до освобождения метода от operating лимита.
   * Анализ происходит по прошлому вызову функции. Нужно понимать что речь идет об блокировках до 10 минут
   * Это довольно жесткая блокировка по лимиту:
   * - не достигнут - нет блокировки
   * - достигли - блокируем до времени разблокировки + 1 секунда
   */
  getTimeToFree(method: string): number {
    const stats = this.#lastOperatingTimes.get(method)

    if (!stats) {
      return 0
    }

    // При рассчетах operating лимита будем на 5 секунд меньше брать
    const limitMs = Math.max(1_000, this.#restrictionParams.operatingLimit!.limitMs! - 5_000)

    // Если превышен лимит
    if (stats.operating >= limitMs) {
      const now = Date.now()
      // Возвращаем время до reset_at + 1 секунда
      if (stats.operating_reset_at > now) {
        return (stats.operating_reset_at - now) + 1_000
      } else {
        return 5_000 // 5 секунд по умолчанию
      }
    }

    return 0
  }

  /**
   * // fix
   * Обновляет статистику operating времени для метода
   */
  updateOperatingStats(method: string, data: any): void {
    const operating = data?.time?.operating
    const operating_reset_at = data?.time?.operating_reset_at

    if (operating === undefined) return

    // Инициализируем статистику для метода, если ее нет
    if (!this.#lastOperatingTimes.has(method)) {
      this.#lastOperatingTimes.set(method, {
        operating: 0,
        operating_reset_at: 0
      })
    }

    const stats = this.#lastOperatingTimes.get(method)!

    // Добавляем новую запись
    stats.operating = operating * 1000 // Конвертируем в миллисекунды

    // Обновляем reset_at если есть
    if (operating_reset_at) {
      stats.operating_reset_at = operating_reset_at * 1000 // Конвертируем в миллисекунды
    }

    // Логируем если близко к лимиту
    const usagePercent = (stats.operating / this.#restrictionParams.operatingLimit!.limitMs!) * 100
    if (usagePercent > this.#restrictionParams.adaptiveConfig!.thresholdPercent!) {
      this.#stats.heavyRequestCount++
      this.getSystemLogger().warn(
        `⚠️ Method ${method}: use ${usagePercent.toFixed(1)}% operating limit`,
        `(${(stats.operating / 1000).toFixed(1)} sec from ${(this.#restrictionParams.operatingLimit!.limitMs! / 1000).toFixed(1)} sec)`
      )
    }
  }

  /**
   * // fix
   * Возвращает статистику работы
   */
  getStats(): RestrictionManagerStats & { adaptiveDelayAvg: number } {
    const operatingStats: { [method: string]: number } = {}
    for (const [method, time] of this.#lastOperatingTimes.entries()) {
      operatingStats[method] = Number.parseFloat((time.operating / 1000).toFixed(2))
    }

    return {
      ...this.#stats,
      tokens: this.#tokens,
      operatingStats,
      adaptiveDelayAvg: this.#stats.adaptiveDelays > 0
        ? this.#stats.totalAdaptiveDelay / this.#stats.adaptiveDelays
        : 0
    }
  }

  /**
   * // fix
   * Сбрасывает статистику
   */
  resetStats(): void {
    // this.#methodOperatingStats.clear()
    this.#lastOperatingTimes.clear()
    this.#tokens = this.#restrictionParams.rateLimit!.burstLimit!
    this.#lastRefill = Date.now()

    this.#stats = {
      totalRequests: 0,
      limitHits: 0,
      adaptiveDelays: 0,
      totalAdaptiveDelay: 0,
      retries: 0,
      heavyRequestCount: 0,
      consecutiveErrors: 0,
      tokens: this.#tokens,
      operatingStats: {}
    }
  }

  /**
   * Проверяет и ждет rate limit (Leaky Bucket)
   */
  async #checkRateLimit(method: string): Promise<void> {
    const now = Date.now()
    const timePassed = now - this.#lastRefill

    // Пополняем токены в зависимости от прошедшего времени
    const refillAmount = timePassed * this.#restrictionParams.rateLimit!.drainRate! / 1000
    this.#tokens = Math.min(
      this.#restrictionParams.rateLimit!.burstLimit!,
      this.#tokens + refillAmount
    )
    this.#lastRefill = now

    // Если токенов недостаточно, ждем
    if (this.#tokens < 1) {
      const deficit = 1 - this.#tokens
      const waitTime = Math.ceil(deficit * this.#refillIntervalMs)
      this.#tokens = 0

      this.getLogger().warn(
        `⏳ Метод ${method}: заблокирован по rate limit`,
        `Ждем ${(waitTime / 1000).toFixed(2)} sec.`
      )
      await this.#delay(waitTime)

      // После ожидания снова пополняем
      const newTimePassed = Date.now() - this.#lastRefill
      const newRefill = newTimePassed * this.#restrictionParams.rateLimit!.drainRate! / 1000
      this.#tokens = Math.min(
        this.#restrictionParams.rateLimit!.burstLimit!,
        newRefill
      )
      this.#lastRefill = Date.now()
    }

    // Забираем токен
    this.#tokens -= 1
    this.#stats.tokens = this.#tokens
  }

  /**
   * Обрабатывает превышение rate limit
   */
  #handleRateLimitExceeded(): number {
    this.#tokens = 0
    this.#stats.tokens = 0
    // Ждем время для восстановления хотя бы одного токена + 1sec
    return this.#refillIntervalMs + 1_000
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
      } else if (Array.isArray(row) && row.length > 0) {
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

    // fix
    // Для batch запросов предсказываем сложность
    // @todo
    const predictedComplexity = this.#predictBatchComplexity(calls)
    if (predictedComplexity > 5) {
      const additionalDelay = Math.min(
        predictedComplexity * 100,
        this.#restrictionParams.adaptiveConfig!.maxDelay!
      )
      await this.#delay(additionalDelay)
    }

    return this.call('batch', {
      halt: isHaltOnError ? 1 : 0,
      cmd: cmd
    }).then((response: AjaxResult) => {
      const responseResult = (response.getData() as BatchPayload<unknown>).result
      const results: Record<string | number, AjaxResult> = {}

      const processResponse = (row: string, index: string | number) => {
        if (
          // @ts-expect-error this code work success
          typeof responseResult.result[index] !== 'undefined'
          // @ts-expect-error this code work success
          || typeof responseResult.result_error[index] !== 'undefined'
        ) {
          const q = row.split('?')

          results[index] = new AjaxResult({
            answer: {
              // @ts-expect-error this code work success
              result: Type.isUndefined(responseResult.result[index])
                ? {}
                // @ts-expect-error this code work success
                : responseResult.result[index],
              // @ts-expect-error this code work success
              error: responseResult?.result_error[index] || undefined,
              // @ts-expect-error this code work success
              total: responseResult.result_total[index],
              // @ts-expect-error this code work success
              next: responseResult.result_next[index],
              // @todo test this ////
              // @ts-expect-error this code work success
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
      } else if (Array.isArray(row) && row.length > 0) {
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

    // fix
    // Для batch запросов предсказываем сложность
    // @todo
    const predictedComplexity = this.#predictBatchComplexity(calls)
    if (predictedComplexity > 5) {
      const additionalDelay = Math.min(
        predictedComplexity * 100,
        this.#restrictionParams.adaptiveConfig!.maxDelay!
      )
      await this.#delay(additionalDelay)
    }

    return this.call('batch', {
      halt: isHaltOnError ? 1 : 0,
      cmd: cmd
    }).then((response: AjaxResult) => {
      const responseResult = (response.getData() as BatchPayload<unknown>).result
      const results: AjaxResult[] = []

      const processResponse = (row: string, index: string | number) => {
        if (
          // @ts-expect-error this code work success
          typeof responseResult.result[index] !== 'undefined'
          // @ts-expect-error this code work success
          || typeof responseResult.result_error[index] !== 'undefined'
        ) {
          const q = row.split('?')

          const data = new AjaxResult({
            answer: {
              // @ts-expect-error this code work success
              result: Type.isUndefined(responseResult.result[index])
                ? {}
                // @ts-expect-error this code work success
                : responseResult.result[index],
              // @ts-expect-error this code work success
              error: responseResult?.result_error[index] || undefined,
              // @ts-expect-error this code work success
              total: responseResult.result_total[index],
              // @ts-expect-error this code work success
              next: responseResult.result_next[index],
              // @todo test this ////
              // @ts-expect-error this code work success
              time: responseResult.result_time[index]
            },
            query: {
              method: q[0] || '',
              params: qs.parse(q[1] || ''),
              start: 0
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
   * // fix
   * Calling the RestApi function with adaptive delays and rate limiting
   */
  async call<T = unknown>(
    method: string,
    params: object,
    start: number = 0,
    options: {
      maxRetries?: number
      skipAdaptiveDelay?: boolean
      retryDelay?: number
    } = {}
  ): Promise<AjaxResult<T>> {
    const maxRetries = options.maxRetries || this.#restrictionParams.maxRetries!
    const baseRetryDelay = options.retryDelay || this.#restrictionParams.retryDelay!
    const skipAdaptiveDelay = options.skipAdaptiveDelay || false

    let lastError = null
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // 1. Проверяем operating лимит для метода
        const operatingWait = this.getTimeToFree(method)
        if (operatingWait > 0) {
          this.#stats.limitHits++
          this.getLogger().warn(
            `⏳ Метод ${method}: заблокирован по operating limit.`,
            `Ждем ${(operatingWait / 1000).toFixed(2)} sec.`
          )

          await this.#delay(operatingWait)
        } else if (!skipAdaptiveDelay) {
          // 2. Адаптивная задержка перед запросом
          await this.#applyAdaptiveDelay(method)
        }

        // 3. Проверяем rate limit
        await this.#checkRateLimit(method)

        // 4. Выполняем запрос с учетом авторизации
        const result = await this.#executeSingleCall<T>(method, params, start)

        // 5. Обновляем статистику
        this.#stats.totalRequests++
        this.#stats.consecutiveErrors = 0 // Сбрасываем счетчик ошибок при успехе

        // 6. Обновляем operating статистику
        this.updateOperatingStats(method, result.getData())

        return result
      } catch (error: any) {
        lastError = error
        this.#stats.consecutiveErrors++
        this.#stats.totalRequests++

        // Обработка специфических ошибок Битрикс24
        if (this.#isRateLimitError(error)) {
          // Rate limit exceeded
          if (attempt < maxRetries) {
            this.#stats.retries++
            this.#stats.limitHits++
            // Увеличиваем время при ошибке
            const waitTime = this.#handleRateLimitExceeded() * Math.pow(2, attempt)
            this.getLogger().warn(
              `🚫[QUERY_LIMIT_EXCEEDED] Ошибка: rate limit превышен.`,
              `Ждем ${(waitTime / 1000).toFixed(2)} sec.`,
              `(попытка ${attempt + 1}/${maxRetries})`
            )
            await this.#delay(waitTime)
            continue
          }
        }

        // Operating limit ошибка
        if (this.#isOperatingLimitError(error)) {
          if (attempt < maxRetries) {
            this.#stats.retries++
            this.#stats.limitHits++

            const waitTime = this.#handleOperatingLimitError(method, error)
            this.getLogger().warn(
              `🚫[OPERATION_TIME_LIMIT] Ошибка: operating limit превышен.`,
              `Ждем ${(waitTime / 1000).toFixed(2)} sec.`,
              `(попытка ${attempt + 1}/${maxRetries})`
            )
            await this.#delay(waitTime)
            continue
          }
        }

        // 401 ошибка (обработка вложена в #executeSingleCall)
        // Другие ошибки
        if (attempt < maxRetries) {
          this.#stats.retries++
          // Увеличиваем время при ошибке
          const exponentialDelay = baseRetryDelay * Math.pow(2, attempt)
          this.getLogger().warn(
            `🚫${error?.code ? `[${error.code}] ` : ''}Ошибка: ${error.message}.`,
            `Ждем ${(exponentialDelay / 1000).toFixed(2)} sec`,
            `(попытка ${attempt + 1}/${maxRetries})`
          )
          await this.#delay(exponentialDelay)
          continue
        }

        // Все попытки исчерпаны
        throw error
      }
    }

    throw new AjaxError({
      code: '[JSSDK_CALL_ALL_ATTEMPTS_EXHAUSTED]',
      description: 'Все поппытки исчерпаны',
      status: 500,
      requestInfo: {
        method,
        params
      },
      originalError: lastError
    })
  }

  /**
   * // fix
   * Выполняет одиночный вызов с обработкой 401 ошибки
   */
  async #executeSingleCall<T = unknown>(
    method: string,
    params: object,
    start: number = 0
  ): Promise<AjaxResult<T>> {
    let authData = this.#authActions.getAuthData()
    if (authData === false) {
      authData = await this.#authActions.refreshAuth()
    }

    // fix
    // await this.#restrictionManager.check(method, '')

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
        }): Promise<AjaxResponse<T>> => {
          const payload = response.data as AjaxResultParams<T>
          return Promise.resolve({
            status: response.status,
            payload
          } as AjaxResponse<T>)
        },
        async (error_: AxiosError) => {
          let answerError = {
            error: error_?.code || 0,
            errorDescription: error_?.message || ''
          }

          if (
            error_ instanceof AxiosError
            && error_.response
            && error_.response.data
            && !Type.isUndefined((error_.response.data as TypeDescriptionError).error)
          ) {
            const response = error_.response.data as {
              error: string
              error_description: string
            } as TypeDescriptionError

            answerError = {
              error: response.error,
              errorDescription: response.error_description
            }
          }

          const problemError: AjaxError = new AjaxError({
            code: String(answerError.error),
            description: answerError.errorDescription,
            status: error_.response?.status || 0,
            requestInfo: {
              method: method,
              params: params
            },
            originalError: error_
          })

          /**
           * Is response status === 401 -> refresh Auth?
           */
          if (
            problemError.status === 401
            && ['expired_token', 'invalid_token'].includes(
              problemError.answerError.error
            )
          ) {
            this.getLogger().info(
              `refreshAuth >> ${problemError.answerError.error} >>>`
            )

            authData = await this.#authActions.refreshAuth()
            // fix
            // await this.#restrictionManager.check(method, '')

            return this.#clientAxios
              .post(
                this.#prepareMethod(method),
                this.#prepareParams(authData, params, start)
              )
              .then(
                async (response: {
                  data: AjaxResultParams
                  status: any
                }): Promise<AjaxResponse<T>> => {
                  const payload = response.data as AjaxResultParams<T>
                  return Promise.resolve({
                    status: response.status,
                    payload
                  } as AjaxResponse<T>)
                },
                async (error__: AxiosError) => {
                  let answerError = {
                    error: error__?.code || 0,
                    errorDescription: error__?.message || ''
                  }

                  if (
                    error__ instanceof AxiosError
                    && error__.response
                    && error__.response.data
                  ) {
                    const response = error__.response.data as {
                      error: string
                      error_description: string
                    } as TypeDescriptionError

                    answerError = {
                      error: response.error,
                      errorDescription: response.error_description
                    }
                  }

                  const problemError: AjaxError = new AjaxError({
                    code: String(answerError.error),
                    description: answerError.errorDescription,
                    status: error_.response?.status || 0,
                    requestInfo: {
                      method: method,
                      params: params
                    },
                    originalError: error__
                  })

                  return Promise.reject(problemError)
                }
              )
          }

          return Promise.reject(problemError)
        }
      )
      .then((response: AjaxResponse<T>): Promise<AjaxResult<T>> => {
        const result = new AjaxResult<T>({
          answer: response.payload,
          query: {
            method,
            params,
            start
          } as AjaxQuery,
          status: response.status
        })

        // fix
        // Обновляем статистику ресурсоемкости
        // this.updateStateFromResponse(method, result.getData())

        return Promise.resolve(result)
      })
  }
  // endregion ////

  // region Adaptive Delay ////
  /**
   * // fix
   * Применяет адаптивную задержку на основе предыдущего опыта
   */
  async #applyAdaptiveDelay(method: string): Promise<void> {
    if (!this.#restrictionParams.adaptiveConfig!.enabled!) {
      return
    }

    const stats = this.#lastOperatingTimes.get(method)
    if (!stats) {
      return
    }

    let adaptiveDelay = 0

    // Задержка на основе предыдущего запроса
    const usagePercent = (stats.operating / this.#restrictionParams.operatingLimit!.limitMs!) * 100
    if (usagePercent > this.#restrictionParams.adaptiveConfig!.thresholdPercent!) {
      const now = Date.now()
      if (stats.operating_reset_at > now) {
        adaptiveDelay += (stats.operating_reset_at - now) * this.#restrictionParams.adaptiveConfig!.coefficient!
      } else {
        adaptiveDelay += 7_000 // 7 секунд по умолчанию
      }

      this.getLogger().info(
        `⚠️ Method ${method}: предыдущий запрос использовал ${(usagePercent).toFixed(1)}% operating limit`,
        `Задержка:`,
        `- расчетная ${(adaptiveDelay / 1000).toFixed(2)} sec.`,
        `- фактическая ${(Math.min(adaptiveDelay, this.#restrictionParams.adaptiveConfig!.maxDelay!) / 1000).toFixed(2)} sec.`
      )
    }

    if (adaptiveDelay > 0) {
      adaptiveDelay = Math.min(
        adaptiveDelay,
        this.#restrictionParams.adaptiveConfig!.maxDelay!
      )

      this.#stats.adaptiveDelays++
      this.#stats.totalAdaptiveDelay += adaptiveDelay

      this.getLogger().warn(
        `⏳ Метод ${method}: заблокирован по adaptive delay.`,
        `Ждем ${(adaptiveDelay / 1000).toFixed(2)} sec.`
      )
      await this.#delay(adaptiveDelay)
    }
  }

  /**
   * @deprecated
   * // fix
   * Прогнозирует сложность запроса
   * @memo пока не понятно нужно ли это делать - тк предположить сложность - это ответственность - а нам лишняя не нужна
   */
  #predictComplexity(method: string, params: any): number {
    let complexity = 1

    // Списочные методы
    if (method.includes('.list') || method.includes('.items')) {
      complexity += 2

      // Выборка всех полей
      if (params?.select) {
        const selects = Array.isArray(params.select) ? params.select : [params.select]
        if (selects.includes('*') || selects.includes('UF_*')) {
          complexity += 3
        }
        if (selects.length > 10) complexity += 1
      }

      // Сложные фильтры
      if (params?.filter && typeof params.filter === 'object') {
        const filterKeys = Object.keys(params.filter)
        if (filterKeys.length > 5) complexity += 1
        if (filterKeys.some(k => k.includes('UF_'))) complexity += 2
      }

      // Большой offset
      if (params?.start && params.start > 10000) complexity += 1
    }

    // Методы CRM item (тяжелые в SPA)
    if (method.includes('crm.item')) {
      complexity += 3
    }

    // Методы с суффиксом .get (обычно легкие)
    if (method.endsWith('.get')) {
      complexity = Math.max(1, complexity - 1)
    }

    return complexity
  }

  /**
   * Прогнозирует сложность batch запроса
   */
  #predictBatchComplexity(calls: any[] | object): number {
    let cmdCount = 0
    let complexity = 0

    if (Array.isArray(calls)) {
      cmdCount = calls.length
      calls.forEach((call) => {
        const method = Array.isArray(call) ? call[0] : call.method
        const params = Array.isArray(call) ? call[1] : call.params
        if (method) {
          complexity += this.#predictComplexity(method, params || {}) / 10
        }
      })
    } else {
      cmdCount = Object.keys(calls).length
      Object.values(calls).forEach((call: any) => {
        const method = call.method
        const params = call.params
        if (method) {
          complexity += this.#predictComplexity(method, params || {}) / 10
        }
      })
    }

    complexity += cmdCount / 10 // +0.1 за каждую команду
    return Math.min(complexity, 10) // Максимум 10
  }

  /**
   * Проверяет, является ли ошибка rate limit
   */
  #isRateLimitError(error: any): boolean {
    return error.status === 503
      || error.code === 'QUERY_LIMIT_EXCEEDED'
  }

  /**
   * Проверяет, является ли ошибка operating limit
   * @memo `OPERATION_TIME_LIMIT` && `429` - получены практическим путем
   */
  #isOperatingLimitError(error: any): boolean {
    return error.status === 429
      || error.code === 'OPERATION_TIME_LIMIT'
  }

  /**
   * Обрабатывает operating limit ошибку
   * @memo Сейчас в ошибках не приходят тайминги по операциям - по этой причине будем брать данные из прошлого запроса
   */
  #handleOperatingLimitError(method: string, _error: any): number {
    const operatingWait = this.getTimeToFree(method)

    // 10 секунд по умолчанию
    return Math.max(10_000, operatingWait)
  }

  /**
   * Вспомогательная функция задержки
   */
  #delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
  // endregion ////

  // region Prepare ////
  /**
   * Processes function parameters and adds authorization
   */
  #prepareParams(authData: AuthData, params: any, start: number = 0): object {
    const result = Object.assign({}, params)

    if (this.#logTag.length > 0) {
      result.logTag = this.#logTag
    }

    // result[this.#requestIdGenerator.getQueryStringParameterName()] = this.#requestIdGenerator.getRequestId()
    // result[this.#requestIdGenerator.getQueryStringSdkParameterName()] = '__SDK_VERSION__'

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
   */
  #prepareMethod(method: string): string {
    const baseUrl = `${encodeURIComponent(method)}.json`

    /**
     * @memo For task methods, skip telemetry
     * @see https://apidocs.bitrix24.com/settings/how-to-call-rest-api/data-encoding.html#order-of-parameters
     */
    if (method.includes('task.')) {
      return `${baseUrl}`
    }

    const queryParams = new URLSearchParams({
      [this.#requestIdGenerator.getQueryStringParameterName()]: this.#requestIdGenerator.getRequestId(),
      [this.#requestIdGenerator.getQueryStringSdkParameterName()]: '__SDK_VERSION__',
      [this.#requestIdGenerator.getQueryStringSdkTypeParameterName()]: '__SDK_USER_AGENT__'
    })
    return `${baseUrl}?${queryParams.toString()}`
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

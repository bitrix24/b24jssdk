import type { LoggerBrowser } from '../logger/browser'
import type { Result } from '../core/result'
import type { AjaxResult } from '../core/http/ajax-result'
import type { PayloadTime } from './payloads'

/**
 * @todo перевод
 * @todo fix docs
 */

// region Batch interface ////
/**
 * Опции для batch вызова
 */
export interface ICallBatchOptions {
  /**
   * Останавливать ли выполнение при первой ошибке
   * @default true
   */
  isHaltOnError?: boolean
}

/**
 * Результат batch вызова
 */
export interface ICallBatchResult<T = unknown> {
  result?: AjaxResult<T>[] | Record<string | number, AjaxResult<T>>
  time?: PayloadTime
}

export type CommandUniversal<M extends string = string, P = unknown>
  = | CommandTuple<M, P>
    | CommandObject<M, P>

export type BatchCommandsUniversal<M extends string = string, P = unknown> = CommandUniversal<M, P>[]

// 1. Array of arrays
export type CommandTuple<M extends string = string, P = unknown> = [M, P]
export type BatchCommandsArrayUniversal<M extends string = string, P = unknown> = CommandTuple<M, P>[]

// 2. Array of objects
export interface CommandObject<M extends string = string, P = unknown> {
  method: M
  params?: P
}
export type BatchCommandsObjectUniversal<M extends string = string, P = unknown> = CommandObject<M, P>[]

// 3. Object with named commands
export type BatchNamedCommandsUniversal<
  K extends string | number | symbol = string,
  M extends string = string,
  P = unknown
> = Record<K, CommandObject<M, P> | CommandTuple<M, P>>
// endregion ////

/**
 * Интерфейс для HTTP клиента
 */
export type TypeHttp = {
  setLogger(logger: LoggerBrowser): void
  getLogger(): LoggerBrowser

  /**
   * Выполнение batch запросов с поддержкой двух вариантов вызова
   */
  batch<T = unknown>(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal,
    options?: ICallBatchOptions
  ): Promise<Result<ICallBatchResult<T>>>

  call<T = unknown>(
    method: string,
    params: object,
    start: number
  ): Promise<AjaxResult<T>>

  /**
   * Устанавливает параметры ограничений
   */
  setRestrictionManagerParams(params: RestrictionParams): void

  /**
   * Возвращает текущие параметры ограничений
   */
  getRestrictionManagerParams(): RestrictionParams

  /**
   * Возвращает статистику работы
   */
  getStats(): RestrictionManagerStats & { adaptiveDelayAvg: number }

  /**
   * Сбросить статистику
   */
  resetStats(): void

  setLogTag(logTag?: string): void
  clearLogTag(): void

  /**
   * On|Off warning about client-side query execution
   * @param {boolean} value
   * @param {string} message
   */
  setClientSideWarning(value: boolean, message: string): void
}

export interface IRequestIdGenerator {
  getRequestId(): string
  getHeaderFieldName(): string
  getQueryStringParameterName(): string
  getQueryStringSdkParameterName(): string
}

// region RestrictionManager /////
/**
 * // fix
 * Настройки для operating limiting
 */
export interface OperatingLimitConfig {
  /**
   * Период времени для operating лимита в миллисекундах
   * По умолчанию: 10 минут (600_000 мс)
   */
  windowMs: number
  /**
   * Максимальное суммарное время выполнения (operating) в миллисекундах
   * По умолчанию: 480 секунд (480_000 мс)
   * При рассчетах operating лимита будем на 5 секунд меньше брать
   * @see Http.getTimeToFree
   */
  limitMs: number
}

/**
 * // fix
 * Настройки для адаптивной паузы
 */
export interface AdaptiveConfig {
  /**
   * Порог для тяжелых запросов (%)
   * По умолчанию: 80% - это значит что `operating >= 384`
   * Указывает при достижении в `operating` какого % от `operatingLimit.limitMs` нужно начинать ставить паузы
   */
  thresholdPercent: number
  /**
   * Коэффициент умножения для паузы
   * По умолчанию: 0.01 - при 0.002 будет пауза 1.2 sec при увеличивающейся нагрузке
   * Если: operating_reset_at > Date.now()
   *   То: Пауза = (operating_reset_at - Date.now()) * coefficient
   *   Иначе: Пауза = 7_000
   * Нет смысла указывать значение близкое к 1, тк это создаст бессмысленные задержки
   * Другими словами: если coefficient === 1, то пауза будет до момента разблокировки, а наш код еще лимиты не выработал.
   * Нужно понимать что цель адаптивной блокировки плавно нивелировать `operating` тяжолых запросов.
   */
  coefficient: number
  /**
   * Максимальная пауза (мс)
   * По умолчанию: 7_000 мс
   * Ограничивает максимальное расчетное время паузы
   */
  maxDelay: number
  /**
   * Включена ли адаптивная пауза
   * По умолчанию: true
   */
  enabled: boolean
}

/**
 * Настройки для rate limiting (Leaky Bucket)
 */
export interface RateLimitConfig {
  /**
   * X - лимит до блокировки (ёмкость "ведра")
   * Для обычных тарифов: 50
   * Для Enterprise: 250
   */
  burstLimit: number
  /**
   * Y - скорость утечки (запросов в секунду)
   * Для обычных тарифов: 2
   * Для Enterprise: 5
   */
  drainRate: number
}

/**
 * // fix
 * Параметры для управления всеми типами ограничений
 */
export interface RestrictionParams {
  /** Настройки rate limiting */
  rateLimit?: RateLimitConfig

  /** Настройки operating limiting */
  operatingLimit?: OperatingLimitConfig

  /** Настройки адаптивной задержки */
  adaptiveConfig?: AdaptiveConfig

  /**
   * Максимальное количество повторных попыток
   * По умолчанию: 3
   */
  maxRetries?: number

  /**
   * Базовая задержка между повторными попытками (мс)
   * По умолчанию: 1_000
   */
  retryDelay?: number
}

/**
 * // fix
 * Статистика работы ограничителя
 */
export interface RestrictionManagerStats {
  /** Общее количество запросов */
  totalRequests: number
  /** Срабатывания limit */
  limitHits: number
  /** Адаптивные задержки */
  adaptiveDelays: number
  /** Суммарное время адаптивных задержек */
  totalAdaptiveDelay: number
  /** Повторные попытки */
  retries: number
  /** Тяжелые запросы */
  heavyRequestCount: number
  /** Последовательные ошибки */
  consecutiveErrors: number
  /** Текущее количество токенов */
  tokens: number
  /** Статистика по методам в секундах */
  operatingStats: { [method: string]: number }
}

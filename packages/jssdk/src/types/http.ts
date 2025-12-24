import type { LoggerBrowser } from '../logger/browser'
import type { Result } from '../core/result'
import type { AjaxResult } from '../core/http/ajax-result'

/**
 * // fix
 * Интерфейс для HTTP клиента
 */
export type TypeHttp = {
  setLogger(logger: LoggerBrowser): void
  getLogger(): LoggerBrowser

  batch(calls: any[] | object, isHaltOnError: boolean, returnAjaxResult: boolean): Promise<Result>

  call<T = unknown>(method: string, params: object, start: number): Promise<AjaxResult<T>>

  /**
   * Устанавливает параметры ограничений
   */
  setRestrictionManagerParams(params: RestrictionParams): void

  /**
   * Возвращает текущие параметры ограничений
   */
  getRestrictionManagerParams(): RestrictionParams

  /**
   * Возвращает время до освобождения метода от operating лимита (в мс)
   */
  getTimeToFree(method: string): number

  /**
   * Возвращает статистику работы
   */
  getStats(): RestrictionManagerStats & { adaptiveDelayAvg: number }

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

// fix
// export type TypeRestrictionManagerParams = {
//   sleep: number
//   speed: number
//   amount: number
// }

export interface TypeRestrictionManagerParams {
  sleep?: number
  speed?: number
  amount?: number
  /**
   * X - Лимит до блокировки (ёмкость "ведра")
   * Для обычных тарифов: 50
   * Для Enterprise: 250
   */
  burstLimit?: number

  /**
   * Y - Скорость утечки (запросов в секунду)
   * Для обычных тарифов: 2
   * Для Enterprise: 5
   */
  drainRate?: number

  /**
   * Период времени для operating лимита в миллисекундах
   * По умолчанию: 10 минут (600000 мс)
   */
  operatingWindowMs?: number

  /**
   * Максимальное суммарное время выполнения (operating) в миллисекундах
   * По умолчанию: 480 секунд (480000 мс)
   */
  operatingLimitMs?: number

  /**
   * Порог для тяжелых запросов в секундах
   * Запросы с operating > threshold считаются тяжелыми
   * По умолчанию: 0.5 секунды
   */
  adaptiveThreshold?: number

  /**
   * Коэффициент умножения для адаптивной задержки
   * Задержка = lastOperatingTime * coefficient
   * По умолчанию: 1.0
   */
  adaptiveCoefficient?: number

  /**
   * Максимальная адаптивная задержка в миллисекундах
   * По умолчанию: 5000 мс
   */
  adaptiveMaxDelay?: number

  /**
   * Включена ли адаптивная задержка
   * По умолчанию: true
   */
  adaptiveEnabled?: boolean
}

export const RestrictionManagerParamsBase = {
  sleep: 1000,
  speed: 0.001,
  amount: 30
} as TypeRestrictionManagerParams

/**
 * @todo Need test
 */
export const RestrictionManagerParamsForEnterprise = {
  sleep: 600,
  speed: 0.01,
  amount: 30 * 5
} as TypeRestrictionManagerParams
// endregion /////

/**
 * // fix
 * Настройки для адаптивной задержки
 */
export interface AdaptiveConfig {
  /** Порог для тяжелых запросов (сек) */
  threshold: number
  /** Коэффициент умножения для паузы */
  coefficient: number
  /** Максимальная задержка (мс) */
  maxDelay: number
  /** Включена ли адаптивная задержка */
  enabled: boolean
  /** Время "забывания" статистики (мс) */
  decayTime?: number
}

/**
 * // fix
 * Настройки для rate limiting (Leaky Bucket)
 */
export interface RateLimitConfig {
  /** X - лимит до блокировки */
  burstLimit: number
  /** Y - скорость утечки (запросов в секунду) */
  drainRate: number
  /** Начальное количество токенов */
  initialTokens?: number
}

/**
 * // fix
 * Настройки для operating limiting
 */
export interface OperatingLimitConfig {
  /** Период времени в миллисекундах (10 минут в миллисекундах) */
  windowMs: number
  /** Максимальное суммарное время в миллисекундах (480 секунд = 480000 мс) */
  limitMs: number
  /** Автоматически сбрасывать статистику при превышении? */
  autoReset?: boolean
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

  /** Тарифный план Битрикс24 */
  tariffPlan?: 'start' | 'standard' | 'enterprise' | 'custom'

  /** Пул IP-адресов для распределения нагрузки */
  ipPool?: string[]

  /** Максимальное количество повторных попыток */
  maxRetries?: number

  /** Базовая задержка между повторными попытками (мс) */
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
  /** Статистика по методам */
  operatingStats: { [method: string]: number }
}

/**
 * // fix
 * Интерфейс для работы с ограничениями
 */
export interface RestrictionManagerInterface {
  /** Установить параметры */
  setParams(params: TypeRestrictionManagerParams): void

  /** Получить параметры */
  getParams(): TypeRestrictionManagerParams

  /** Получить статистику */
  getStats(): RestrictionManagerStats

  /** Сбросить статистику */
  resetStats(): void

  /** Проверить, можно ли выполнить запрос к методу */
  canExecute(method: string): {
    canExecute: boolean
    waitTime: number
  }

  /** Зарегистрировать выполнение запроса */
  registerExecution(method: string, operatingTime: number, resetAt?: number): void

  /** Обработать ошибку rate limit */
  handleRateLimitError(): number

  /** Обработать ошибку operating limit */
  handleOperatingLimitError(resetAt?: number): number
}

/**
 * // fix
 * Результат проверки ограничений
 */
export interface RestrictionCheckResult {
  /** Можно ли выполнить запрос */
  allowed: boolean
  /** Время ожидания в мс (если 0 - можно выполнять сразу) */
  waitTime: number
  /** Причина ожидания */
  reason?: 'rate_limit' | 'operating_limit' | 'adaptive_delay'
  /** Ожидаемое время выполнения */
  estimatedExecutionTime?: number
  /** Уровень риска (0-10) */
  riskLevel: number
}

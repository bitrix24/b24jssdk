import type { LoggerBrowser } from '../logger/browser'
/**
 * @todo перевод
 * @todo docs
 */

/**
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
  /**
   * Порог для уведомлений о тяжелых запросах (%)
   */
  heavyPercent: number
}

/**
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
  /**
   * Включено ли адаптивное регулирование
   * По умолчанию: true
   */
  adaptiveEnabled: boolean
}

/**
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
 * Статистика работы ограничителя
 */
export interface RestrictionManagerStats {
  /** Общее количество запросов */
  totalRequests: number
  /** Повторные попытки */
  retries: number
  /** Последовательные ошибки */
  consecutiveErrors: number
  /** Срабатывания limit */
  limitHits: number
  /** Текущее количество токенов */
  tokens: number
  /** Адаптивные задержки */
  adaptiveDelays: number
  /** Суммарное время адаптивных задержек */
  totalAdaptiveDelay: number
  /** Тяжелые запросы */
  heavyRequestCount: number
  /** Статистика по методам в секундах */
  operatingStats: { [method: string]: number }
}

export interface ILimiter {
  setConfig(config: any): Promise<void>
  setLogger(logger: LoggerBrowser): void
  getLogger(): LoggerBrowser
  canProceed(requestId: string, method: string, params?: any): Promise<boolean>
  waitIfNeeded(requestId: string, method: string, params?: any): Promise<number>
  updateStats(requestId: string, method: string, data: any): Promise<void>
  reset(): Promise<void>
  getStats(): Record<string, any>
}

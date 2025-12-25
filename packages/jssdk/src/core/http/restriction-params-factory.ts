import type { RestrictionParams } from '../../types/http'

/**
 * // fix
 * Фабрика для создания параметров ограничений
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class RestrictionParamsFactory {
  /**
   * Параметры по умолчанию для обычных тарифов
   * @see Http.#restrictionParams
   */
  static getDefault(): RestrictionParams {
    return {
      rateLimit: {
        burstLimit: 50,
        drainRate: 2
      },
      operatingLimit: {
        windowMs: 10 * 60 * 1000, // 10 минут
        limitMs: 480 * 1000 // 480 секунд
      },
      adaptiveConfig: {
        enabled: false, // Выключено
        threshold: 400,
        coefficient: 1,
        maxDelay: 480 * 1000
      },
      maxRetries: 3,
      retryDelay: 1000
    }
  }

  /**
   * Параметры для тарифа Enterprise
   */
  static getEnterprise(): RestrictionParams {
    return {
      ...this.getDefault(),
      rateLimit: {
        burstLimit: 250,
        drainRate: 5
      },
      adaptiveConfig: {
        enabled: false, // Выключено
        threshold: 400,
        coefficient: 1,
        maxDelay: 480 * 1000
      },
    }
  }

  /**
   * Параметры для массовой обработки данных
   */
  static getBatchProcessing(): RestrictionParams {
    return {
      ...this.getDefault(),
      adaptiveConfig: {
        threshold: 300, // Более чувствительный порог
        coefficient: 1.2, // Большие задержки
        maxDelay: 5000, // Макс 5 секунд
        enabled: true
      },
      maxRetries: 5,
      retryDelay: 2000
    }
  }

  /**
   * Параметры для реального времени
   */
  static getRealtime(): RestrictionParams {
    return {
      ...this.getDefault(),
      adaptiveConfig: {
        enabled: false, // Выключено
        threshold: 400,
        coefficient: 1,
        maxDelay: 480 * 1000
      },
      maxRetries: 1,
      retryDelay: 1000
    }
  }

  /**
   * Параметры на основе тарифного плана
   */
  static fromTariffPlan(plan: string): RestrictionParams {
    switch (plan.toLowerCase()) {
      case 'enterprise':
        return this.getEnterprise()
      case 'company':
      case 'start':
      case 'standard':
      case 'basic':
      default:
        return this.getDefault()
    }
  }
}

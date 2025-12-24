import type { RestrictionParams } from '../../types/http'

/**
 * // fix
 * Фабрика для создания параметров ограничений
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class RestrictionParamsFactory {
  /**
   * Параметры по умолчанию для обычных тарифов
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
        threshold: 0.5,
        coefficient: 1.2,
        maxDelay: 10000,
        enabled: true
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
        threshold: 0.9,
        coefficient: 1.0,
        maxDelay: 5000,
        enabled: true
      }
    }
  }

  /**
   * Параметры для массовой обработки данных
   */
  static getBatchProcessing(): RestrictionParams {
    return {
      ...this.getDefault(),
      adaptiveConfig: {
        threshold: 0.5, // Более чувствительный порог
        coefficient: 2.0, // Большие задержки 2.0
        maxDelay: 15000, // Макс 15 секунд
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
        threshold: 4.0, // Менее чувствительный
        coefficient: 0.5, // Меньшие задержки
        maxDelay: 1000, // Макс 1 секунда
        enabled: true
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

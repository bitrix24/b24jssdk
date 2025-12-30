import type { RestrictionParams } from '../../../types/limiters'

/**
 * Фабрика для создания параметров ограничений
 * @todo перевод
 * @todo docs
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class ParamsFactory {
  /**
   * Параметры по умолчанию для обычных тарифов
   * @see Http.#restrictionParams
   */
  static getDefault(): RestrictionParams {
    return {
      rateLimit: {
        burstLimit: 50,
        drainRate: 2,
        adaptiveEnabled: true
      },
      operatingLimit: {
        windowMs: 600_000, // 10 минут
        limitMs: 480_000, // 480 секунд
        heavyPercent: 80
      },
      adaptiveConfig: {
        enabled: true,
        thresholdPercent: 80,
        coefficient: 0.01,
        maxDelay: 7_000
      },
      maxRetries: 3,
      retryDelay: 1_000
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
        drainRate: 5,
        adaptiveEnabled: true
      }
    }
  }

  /**
   * Параметры для массовой обработки данных
   */
  static getBatchProcessing(): RestrictionParams {
    return {
      ...this.getDefault(),
      rateLimit: {
        burstLimit: 30,
        drainRate: 1,
        adaptiveEnabled: true
      },
      operatingLimit: {
        windowMs: 600_000,
        limitMs: 480_000,
        heavyPercent: 50 // Больше порог для уведомлений
      },
      adaptiveConfig: {
        enabled: true,
        thresholdPercent: 50, // Больше порог
        coefficient: 0.015, // Больше пауза
        maxDelay: 10_000 // Макс 10 секунд
      },
      maxRetries: 5 // Больше попыток
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
        thresholdPercent: 100,
        coefficient: 0.001,
        maxDelay: 480_000
      },
      maxRetries: 1
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

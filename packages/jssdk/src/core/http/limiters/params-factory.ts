import type { RestrictionParams } from '../../../types/limiters'

/**
 * Factory for creating constraint parameters
 *
 * @todo docs
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class ParamsFactory {
  /**
   * Default parameters for regular tariffs
   *
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
        windowMs: 600_000, // 10 min
        limitMs: 480_000, // 480 sec
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
   * Parameters for the Enterprise plan
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
   * Parameters for bulk data processing
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
        heavyPercent: 50 // Higher threshold for notifications
      },
      adaptiveConfig: {
        enabled: true,
        thresholdPercent: 50, // More threshold
        coefficient: 0.015, // More pause
        maxDelay: 10_000 // Max 10 seconds
      },
      maxRetries: 5 // More attempts
    }
  }

  /**
   * Real-time parameters
   */
  static getRealtime(): RestrictionParams {
    return {
      ...this.getDefault(),
      adaptiveConfig: {
        enabled: false, // Off
        thresholdPercent: 100,
        coefficient: 0.001,
        maxDelay: 480_000
      },
      maxRetries: 1
    }
  }

  /**
   * Tariff plan based parameters
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

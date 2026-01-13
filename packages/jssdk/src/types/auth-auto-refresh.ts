import type { SdkError } from '../core/sdk-error'
import type { AuthData } from './auth'

/**
 * Automatic renewal status
 */
export enum AutoRefreshStatus {
  STOPPED = 'stopped',
  RUNNING = 'running',
  ERROR = 'error'
}

/**
 * Automatic renewal events
 */
export enum AutoRefreshEvent {
  STARTED = 'started',
  STOPPED = 'stopped',
  REFRESH_STARTED = 'refresh_started',
  REFRESH_SUCCESS = 'refresh_success',
  REFRESH_ERROR = 'refresh_error',
  EXPIRING_SOON = 'expiring_soon'
}

/**
 * Automatic renewal configuration
 */
export interface AutoRefreshConfig {
  /**
   * Check interval in milliseconds
   * @default 1_800_000 (30 min)
   */
  checkInterval?: number

  /**
   * Token expiration time for extension to be triggered (ms)
   * @default 600000 (10 minutes)
   */
  refreshBeforeExpiry?: number

  /**
   * Automatically start on creation
   * @default true
   */
  autoStart?: boolean

  /**
   * Maximum number of attempts on error
   * @default 3
   */
  maxRetries?: number

  /**
   * Interval between retries (ms)
   * @default 5000 (5 sec)
   */
  retryInterval?: number

  /**
   * Callback on events
   */
  onEvent?: (event: AutoRefreshEvent, data?: any) => void

  /**
   * Callback on successful update
   */
  onRefresh?: (authData: AuthData) => void

  /**
   * Callback on error
   */
  onError?: (error: SdkError) => void
}

/**
 * Work statistics
 */
export interface AutoRefreshStats {
  status: AutoRefreshStatus
  startTime: number | null
  lastRefreshTime: number | null
  nextRefreshTime: number | null
  totalRefreshes: number
  successfulRefreshes: number
  failedRefreshes: number
  consecutiveErrors: number
  lastError: SdkError | null
  estimatedExpiry: number | null
}

import type { AuthActions, AuthData } from '../types/auth'
import type {
  AutoRefreshConfig,
  AutoRefreshStats
} from '../types/auth-auto-refresh'
import { AutoRefreshStatus, AutoRefreshEvent } from '../types/auth-auto-refresh'
import type { LoggerInterface } from '../logger'
import { LoggerFactory } from '../logger'
import { SdkError } from './sdk-error'

/**
 * Class for automatic renewal of authorization
 *
 * @todo add docs
 */
export class AutoAuthRefresher {
  private authActions: AuthActions
  private config: Required<AutoRefreshConfig>
  private _status: AutoRefreshStatus = AutoRefreshStatus.STOPPED
  private checkTimer: NodeJS.Timeout | null = null
  private retryCount: number = 0
  private isRefreshing: boolean = false
  private _logger: LoggerInterface
  private readonly _stats: Omit<AutoRefreshStats, 'status'>

  // region Constructor ////
  constructor(
    authActions: AuthActions,
    config: AutoRefreshConfig = {},
    logger?: LoggerInterface
  ) {
    this.authActions = authActions
    this._logger = logger || LoggerFactory.createNullLogger()

    // Setting default values
    this.config = {
      checkInterval: 1_800_000, // 30 min
      refreshBeforeExpiry: 600_000, // 10 minutes
      autoStart: true,
      maxRetries: 3,
      retryInterval: 5_000,
      onEvent: () => {},
      onRefresh: () => {},
      onError: () => {},
      ...config
    }

    // Initializing statistics
    this._stats = {
      startTime: null,
      lastRefreshTime: null,
      nextRefreshTime: null,
      totalRefreshes: 0,
      successfulRefreshes: 0,
      failedRefreshes: 0,
      consecutiveErrors: 0,
      lastError: null,
      estimatedExpiry: null
    }

    // Autostart if enabled
    if (this.config.autoStart) {
      setTimeout(() => this.start(), 0)
    }
  }

  /**
   * Resource cleaning
   */
  destroy(): void {
    this.stop()
    this._logger.info('[AutoRefresh] AutoAuthRefresher has been destroyed.')
  }
  // endregion ////

  // region Getters ////
  /**
   * Returns current statistics
   */
  get stats(): AutoRefreshStats {
    return {
      status: this.status,
      ...this._stats
    }
  }

  /**
   * Returns the current status
   */
  get status(): AutoRefreshStatus {
    return this._status
  }

  /**
   * Checks if auto-refresh is running
   */
  get isRunning(): boolean {
    return this._status === AutoRefreshStatus.RUNNING
  }
  // endregion ////

  // region Setters ////
  /**
   * Sets a new check interval
   */
  public setCheckInterval(intervalMs: number): void {
    this.config.checkInterval = intervalMs

    if (this.isRunning) {
      this.clearCheckTimer()
      this.startCheckTimer()
    }

    this.log(`The check interval has been changed to ${intervalMs} ms`)
  }

  /**
   * Sets a new pre-refresh time
   */
  public setRefreshBeforeExpiry(timeMs: number): void {
    this.config.refreshBeforeExpiry = timeMs
    this.log(`Pre-refresh time changed to ${timeMs} ms`)
  }
  // endregion ////

  // region Actions ////
  /**
   * Starts automatic renewal
   */
  public start(): void {
    if (this.isRunning) {
      this.log('Already launched')
      return
    }

    this._status = AutoRefreshStatus.RUNNING
    this._stats.startTime = Date.now()
    this.retryCount = 0

    this.log('Starting automatic renewal of authorization')
    this.emitEvent(AutoRefreshEvent.STARTED)

    // We are running a periodic check
    this.startCheckTimer()

    // We check the condition immediately
    this.checkAndRefresh()
  }

  /**
   * Stops automatic renewal
   */
  public stop(): void {
    if (this._status === AutoRefreshStatus.STOPPED) {
      return
    }

    this.clearCheckTimer()
    this._status = AutoRefreshStatus.STOPPED

    this.log('Stopping automatic renewal')
    this.emitEvent(AutoRefreshEvent.STOPPED)
  }

  /**
   * Forces a token refresh
   */
  public async forceRefresh(): Promise<AuthData> {
    return this.refreshAuth()
  }
  // endregion ////

  // region Timer ////
  /**
   * Starts the verification timer
   */
  private startCheckTimer(): void {
    this.clearCheckTimer()

    this.checkTimer = setInterval(() => {
      this.checkAndRefresh()
    }, this.config.checkInterval)
  }

  /**
   * Clears the check timer
   */
  private clearCheckTimer(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer)
      this.checkTimer = null
    }
  }
  // endregion ////

  // region Check and Refresh ////
  /**
   * Checks and updates the token if necessary
   */
  private async checkAndRefresh(): Promise<void> {
    // If you are already in the process of updating, skip it.
    if (this.isRefreshing) {
      return
    }

    try {
      let isNeedRefresh = false
      const authData = await this.getCurrentAuthData()

      if (authData === false) {
        isNeedRefresh = true
        this.log('Token missing, refresh...')
      } else {
        const expiryTime = this.getExpiryTime(authData as AuthData)
        if (!expiryTime) {
          this.log('Unable to determine token expiration time', { expiryTime })
          return
        }

        // Update the expiration time estimate
        this._stats.estimatedExpiry = expiryTime

        const timeUntilExpiry = expiryTime - Date.now()

        if (timeUntilExpiry <= this.config.refreshBeforeExpiry) {
          this.log(`Token expires in ${(timeUntilExpiry / 1000).toFixed(0)} sec, updating...`)
          isNeedRefresh = true
        } else if (timeUntilExpiry <= (this.config.refreshBeforeExpiry * 1.05)) { // + 5%
          // If the token is about to expire, we send a warning
          this.emitEvent(AutoRefreshEvent.EXPIRING_SOON, { timeUntilExpiry, expiryTime })
        }
      }

      if (isNeedRefresh) {
        await this.refreshAuth()
      }
    } catch (error) {
      this.logError('Error verifying token', SdkError.fromException(
        error,
        {
          code: 'JSSDK_AUTO_REFRESH_CHECK_AND_REFRESH',
          status: 500
        }
      ))
    }
  }

  /**
   * Gets current authorization data
   */
  private async getCurrentAuthData(): Promise<AuthData | boolean> {
    try {
      const authData = await this.authActions.getAuthData()

      if (authData === false) {
        return false
      }

      if (authData.refresh_token === 'hook') {
        this._logger.warning(`[AutoRefresh] You don't need to automatically renew your Hook authorization.`, {
          authType: authData.refresh_token
        })
      }

      return authData
    } catch (error) {
      this.logError('Error retrieving authorization data', SdkError.fromException(
        error,
        {
          code: 'JSSDK_AUTO_REFRESH_GET_CURRENT_AUTH_DATA',
          status: 500
        }
      ))
      return false
    }
  }

  /**
   * Specifies the expiration time (ms) of the token.
   */
  private getExpiryTime(authData: AuthData): number | null {
    // If there is an expires in timestamp
    if (authData.expires) {
      return authData.expires * 1_000
    }

    return null
  }

  /**
   * Refreshes the authorization token
   */
  private async refreshAuth(): Promise<AuthData> {
    if (this.isRefreshing) {
      throw new Error('The update is already in progress')
    }

    this.isRefreshing = true
    this._stats.totalRefreshes++

    try {
      this.log('Token update starts...')
      this.emitEvent(AutoRefreshEvent.REFRESH_STARTED)

      const authData = await this.authActions.refreshAuth()

      // Updating statistics
      this._stats.lastRefreshTime = Date.now()
      this._stats.successfulRefreshes++
      this._stats.consecutiveErrors = 0
      this._stats.lastError = null
      this.retryCount = 0

      // Recalculating the next update time
      const expiryTime = this.getExpiryTime(authData)
      if (expiryTime) {
        this._stats.nextRefreshTime = expiryTime - this.config.refreshBeforeExpiry
      }

      this.log('The token has been updated successfully', { stats: this._stats })
      this.emitEvent(AutoRefreshEvent.REFRESH_SUCCESS, { authData })

      // Calling callbacks
      this.config.onRefresh(authData)

      return authData
    } catch (error) {
      const problem = SdkError.fromException(
        error,
        {
          code: 'JSSDK_AUTO_REFRESH_AUTH_ERROR',
          status: 500
        }
      )
      this.handleRefreshError(problem)

      throw problem
    } finally {
      this.isRefreshing = false
    }
  }

  /**
   * Handles update error
   */
  private handleRefreshError(error: SdkError): void {
    this._stats.failedRefreshes++
    this._stats.consecutiveErrors++
    this._stats.lastError = error

    this.logError('Token refresh error', error)
    this.emitEvent(AutoRefreshEvent.REFRESH_ERROR, { error })

    // Calling the error callback
    this.config.onError(error)

    // If the number of attempts is exceeded, we stop
    if (this.retryCount >= this.config.maxRetries) {
      this.log(`Retries limit reached (${this.config.maxRetries}), stopping`)
      this.stop()
      return
    }

    // Increment the attempt counter and schedule a retry
    this.retryCount++

    const retryDelay = this.config.retryInterval * Math.pow(2, this.retryCount - 1)
    this.log(`Retry in ${(retryDelay / 1000).toFixed(0)} seconds (retry ${this.retryCount} / ${this.config.maxRetries})`)

    setTimeout(() => {
      if (this.isRunning) {
        this.checkAndRefresh()
      }
    }, retryDelay)
  }
  // endregion ////

  // region tools::Events ////
  /**
   * Sending an event
   */
  private emitEvent(event: AutoRefreshEvent, data?: any): void {
    try {
      this.config.onEvent(event, data)
    } catch (error) {
      this._logger.error('[AutoRefresh] Error in event handler', {
        error: SdkError.fromException(error, { code: 'JSSDK_AUTO_REFRESH_ERROR_IN_EVENT_HANDLER', status: 500 }),
        event,
        data
      })
    }
  }
  // endregion ////

  // region tools::Log ////
  /**
   * Logging
   */
  private log(message: string, context?: Record<string, any>): void {
    this._logger.debug(`[AutoRefresh] ${message}`, context)
  }

  /**
   * Error logging
   */
  private logError(message: string, error: unknown): void {
    this._logger.error(`[AutoRefresh] ${message}`, { error })
  }
  // endregion ////
}

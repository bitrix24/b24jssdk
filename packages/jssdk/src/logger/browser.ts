import type { LoggerInterface } from '../types/logger'
import { LoggerFactory } from './logger-factory'

const deprecateMessage = '@deprecate: use Logger. https://bitrix24.github.io/b24jssdk/docs/logger/'

/**
 * @deprecate This enum is deprecated and will be removed in version `2.0.0`
 */
export enum LoggerType {
  desktop = 'desktop',
  log = 'log',
  info = 'info',
  warn = 'warn',
  error = 'error',
  trace = 'trace'
}

/**
 * LoggerBrowser
 *
 * @deprecate This class is deprecated and will be removed in version `2.0.0`
 *   - use {@link Logger `Logger`}
 *
 * @removed 2.0.0
 */
export class LoggerBrowser implements LoggerInterface {
  #logger: LoggerInterface

  /**
   * Create a LoggerBrowser instance
   *
   * @deprecated This method is deprecated and will be removed in version `2.0.0`
   *
   * @removed 2.0.0
   */
  static build(title: string, isDevelopment: boolean = false): LoggerBrowser {
    return new LoggerBrowser(title, isDevelopment)
  }

  private constructor(title: string, isDevelopment: boolean = false) {
    console.warn(deprecateMessage)
    if (isDevelopment) {
      this.#logger = LoggerFactory.createForBrowserDevelopment(title)
    } else {
      this.#logger = LoggerFactory.createForBrowserProduction(title)
    }
  }

  // region Config ////
  /**
   * Set config
   *
   * @deprecated This method is deprecated and will be removed in version `2.0.0`
   *
   * @removed 2.0.0
   */
  setConfig(_types: Record<string | LoggerType, boolean>): void {
    console.warn(deprecateMessage)
  }

  /**
   * Set enable
   *
   * @deprecated This method is deprecated and will be removed in version `2.0.0`
   *
   * @removed 2.0.0
   */
  enable(_type: LoggerType): boolean {
    console.warn(deprecateMessage)
    return true
  }

  /**
   * Set disable
   *
   * @deprecated This method is deprecated and will be removed in version `2.0.0`
   *
   * @removed 2.0.0
   */
  disable(_type: LoggerType): boolean {
    console.warn(deprecateMessage)
    return true
  }

  /**
   * Test is enable
   *
   * @deprecated This method is deprecated and will be removed in version `2.0.0`
   *
   * @removed 2.0.0
   */
  isEnabled(_type: LoggerType): boolean {
    console.warn(deprecateMessage)
    return false
  }
  // endregion ////

  // region Functions ////
  public async desktop(...params: any[]): Promise<void> {
    console.warn(deprecateMessage)
    const context = {
      needDesktop: true,
      params: { ...params }
    }
    return this.#logger.debug('desktop', context)
  }

  public async log(...params: any[]): Promise<void> {
    console.warn(deprecateMessage)
    const context = { params: { ...params } }
    return this.#logger.debug('log', context)
  }

  public async info(...params: any[]): Promise<void> {
    console.warn(deprecateMessage)
    const context = { params: { ...params } }
    return this.#logger.info('info', context)
  }

  public async warn(...params: any[]): Promise<void> {
    console.warn(deprecateMessage)
    const context = { params: { ...params } }
    return this.#logger.warning('warn', context)
  }

  public async error(...params: any[]): Promise<void> {
    console.warn(deprecateMessage)
    const context = { params: { ...params } }
    return this.#logger.error('error', context)
  }

  public async trace(...params: any[]): Promise<void> {
    console.warn(deprecateMessage)
    const context = {
      needTrace: true,
      params: { ...params }
    }
    return this.#logger.debug('trace', context)
  }

  public async debug(...params: any[]): Promise<void> {
    console.warn(deprecateMessage)
    const context = { params: { ...params } }
    return this.#logger.debug('debug', context)
  }

  public async notice(...params: any[]): Promise<void> {
    console.warn(deprecateMessage)
    const context = { params: { ...params } }
    return this.#logger.info('notice', context)
  }

  public async warning(...params: any[]): Promise<void> {
    console.warn(deprecateMessage)
    const context = { params: { ...params } }
    return this.#logger.warning('warning', context)
  }

  public async critical(...params: any[]): Promise<void> {
    console.warn(deprecateMessage)
    const context = { params: { ...params } }
    return this.#logger.critical('critical', context)
  }

  public async alert(...params: any[]): Promise<void> {
    console.warn(deprecateMessage)
    const context = { params: { ...params } }
    return this.#logger.alert('alert', context)
  }

  public async emergency(...params: any[]): Promise<void> {
    console.warn(deprecateMessage)
    const context = { params: { ...params } }
    return this.#logger.emergency('alert', context)
  }
  // endregion ////
}

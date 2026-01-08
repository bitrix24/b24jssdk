import type { LoggerInterface } from '../types/logger'
import { LoggerFactory } from './logger-factory'

/**
 * @deprecate use `Logger`
 * @link https://bitrix24.github.io/b24jssdk/docs/logger/
 */
export enum LoggerType {
  desktop = 'desktop',
  log = 'log',
  info = 'info',
  warn = 'warn',
  error = 'error',
  trace = 'trace'
}

const deprecateMessage = '@deprecate: use Logger. https://bitrix24.github.io/b24jssdk/docs/logger/'

export class LoggerBrowser implements LoggerInterface {
  #logger: LoggerInterface

  /**
   * @deprecated
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
   * @deprecated
   */
  setConfig(_types: Record<string | LoggerType, boolean>): void {
    console.warn(deprecateMessage)
  }

  /**
   * @deprecated
   */
  enable(_type: LoggerType): boolean {
    console.warn(deprecateMessage)
    return true
  }

  /**
   * @deprecated
   */
  disable(_type: LoggerType): boolean {
    console.warn(deprecateMessage)
    return true
  }

  /**
   * @deprecated
   */
  isEnabled(_type: LoggerType): boolean {
    console.warn(deprecateMessage)
    return false
  }
  // endregion ////

  // region Functions ////
  desktop(...params: any[]): void {
    console.warn(deprecateMessage)
    const context = {
      needDesktop: true,
      params: { ...params }
    }
    this.#logger.debug('desktop', context)
  }

  public async log(...params: any[]): Promise<void> {
    console.warn(deprecateMessage)
    const context = { params: { ...params } }
    this.#logger.debug('log', context)
  }

  info(...params: any[]): void {
    console.warn(deprecateMessage)
    const context = { params: { ...params } }
    this.#logger.info('info', context)
  }

  warn(...params: any[]): void {
    console.warn(deprecateMessage)
    const context = { params: { ...params } }
    this.#logger.warning('warn', context)
  }

  error(...params: any[]): void {
    console.warn(deprecateMessage)
    const context = { params: { ...params } }
    this.#logger.error('error', context)
  }

  trace(...params: any[]): void {
    console.warn(deprecateMessage)
    const context = {
      needTrace: true,
      params: { ...params }
    }
    this.#logger.debug('trace', context)
  }

  debug(...params: any[]): void {
    console.warn(deprecateMessage)
    const context = { params: { ...params } }
    this.#logger.debug('debug', context)
  }

  notice(...params: any[]): void {
    console.warn(deprecateMessage)
    const context = { params: { ...params } }
    this.#logger.info('notice', context)
  }

  warning(...params: any[]): void {
    console.warn(deprecateMessage)
    const context = { params: { ...params } }
    this.#logger.warning('warning', context)
  }

  critical(...params: any[]): void {
    console.warn(deprecateMessage)
    const context = { params: { ...params } }
    this.#logger.critical('critical', context)
  }

  alert(...params: any[]): void {
    console.warn(deprecateMessage)
    const context = { params: { ...params } }
    this.#logger.alert('alert', context)
  }

  emergency(...params: any[]): void {
    console.warn(deprecateMessage)
    const context = { params: { ...params } }
    this.#logger.emergency('alert', context)
  }
  // endregion ////
}

import type { LoggerInterface } from '../types/logger'
import { LogLevel } from '../types/logger'
import { Logger } from './logger'
import { NullLogger } from './null-logger'
import { ConsoleHandler } from './handler'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class LoggerFactory {
  static createNullLogger(): LoggerInterface {
    return NullLogger.create()
  }

  static createForBrowser(channel: string, isDevMode: boolean = false): LoggerInterface {
    if (isDevMode) {
      return LoggerFactory.createForBrowserDevelopment(channel)
    }

    return LoggerFactory.createForBrowserProduction(channel)
  }

  static createForBrowserDevelopment(channel: string): LoggerInterface {
    const logger = new Logger(channel)
    logger.pushHandler(new ConsoleHandler(LogLevel.DEBUG))
    return logger
  }

  static createForBrowserProduction(channel: string): LoggerInterface {
    const logger = new Logger(channel)
    logger.pushHandler(new ConsoleHandler(LogLevel.ERROR))
    return logger
  }
}

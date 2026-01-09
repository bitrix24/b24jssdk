import type { LoggerInterface } from '../types/logger'
import { LogLevel } from '../types/logger'
import { Logger } from './logger'
import { NullLogger } from './null-logger'
import { ConsoleHandler } from './handler'
import { LineFormatter } from './formatter'

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
    const handler = new ConsoleHandler(LogLevel.DEBUG)
    handler.setFormatter(new LineFormatter('[{channel}] {levelName}: {message}'))
    logger.pushHandler(handler)
    return logger
  }

  static createForBrowserProduction(channel: string): LoggerInterface {
    const logger = new Logger(channel)
    const handler = new ConsoleHandler(LogLevel.ERROR)
    handler.setFormatter(new LineFormatter('[{channel}] {levelName}: {message}'))
    logger.pushHandler(handler)
    return logger
  }
}

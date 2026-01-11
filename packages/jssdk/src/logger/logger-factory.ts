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
    handler.setFormatter(new LineFormatter('[{channel}]: {message}'))
    logger.pushHandler(handler)
    return logger
  }

  static createForBrowserProduction(channel: string): LoggerInterface {
    const logger = new Logger(channel)
    const handler = new ConsoleHandler(LogLevel.ERROR)
    handler.setFormatter(new LineFormatter('[{channel}]: {message}'))
    logger.pushHandler(handler)
    return logger
  }

  static async forcedLog(
    logger: LoggerInterface,
    action: 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency',
    message: string,
    context: Record<string, any>
  ): Promise<void> {
    if (logger instanceof NullLogger) {
      switch (action) {
        case 'debug':
          console.log(message, context)
          return
        case 'info':
        case 'notice':
          console.info(message, context)
          return
        case 'warning':
          console.warn(message, context)
          return
        default:
          console.error(message, context)
          return
      }
    }

    return logger[action](message, context)
  }
}

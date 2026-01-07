import type { Handler, Processor, LogRecord, LogLevelName } from '../types/logger'
import { LogLevel } from '../types/logger'

export class Logger {
  private readonly channel: string
  private handlers: Handler[] = []
  private processors: Processor[] = []
  private handlersSorted: boolean = false

  constructor(channel: string) {
    this.channel = channel
  }

  // region config ////
  pushHandler(handler: Handler): this {
    this.handlers.push(handler)
    this.handlersSorted = false
    return this
  }

  popHandler(): Handler | null {
    return this.handlers.pop() || null
  }

  setHandlers(handlers: Handler[]): this {
    this.handlers = handlers
    this.handlersSorted = false
    return this
  }

  pushProcessor(processor: Processor): this {
    this.processors.push(processor)
    return this
  }
  // endregion ////

  // region logging methods ////
  log(level: LogLevel, message: string, context: Record<string, any> = {}): void {
    const record: LogRecord = {
      channel: this.channel,
      level,
      levelName: LogLevel[level] as LogLevelName,
      message,
      context,
      extra: {},
      timestamp: new Date()
    }

    // Применяем процессоры
    let processedRecord = record
    for (const processor of this.processors) {
      processedRecord = processor(processedRecord)
    }

    // Сортируем обработчики по уровню (если нужно)
    if (!this.handlersSorted) {
      this.handlers.sort((a, b) => {
        const aHandles = a.isHandling(level) ? 1 : 0
        const bHandles = b.isHandling(level) ? 1 : 0
        return bHandles - aHandles
      })
      this.handlersSorted = true
    }

    // Передаем запись обработчикам
    for (const handler of this.handlers) {
      if (handler.isHandling(level)) {
        handler.handle(processedRecord)
      }
    }
  }
  // endregion ////

  // region helper methods ////
  debug(message: string, context: Record<string, any> = {}): void {
    this.log(LogLevel.DEBUG, message, context)
  }

  info(message: string, context: Record<string, any> = {}): void {
    this.log(LogLevel.INFO, message, context)
  }

  notice(message: string, context: Record<string, any> = {}): void {
    this.log(LogLevel.NOTICE, message, context)
  }

  warning(message: string, context: Record<string, any> = {}): void {
    this.log(LogLevel.WARNING, message, context)
  }

  error(message: string, context: Record<string, any> = {}): void {
    this.log(LogLevel.ERROR, message, context)
  }

  critical(message: string, context: Record<string, any> = {}): void {
    this.log(LogLevel.CRITICAL, message, context)
  }

  alert(message: string, context: Record<string, any> = {}): void {
    this.log(LogLevel.ALERT, message, context)
  }

  emergency(message: string, context: Record<string, any> = {}): void {
    this.log(LogLevel.EMERGENCY, message, context)
  }
  // endregion ////

  // region static methods for creation ////
  static create(channel: string): Logger {
    return new Logger(channel)
  }

  static createWithConsoleHandler(
    channel: string,
    level: LogLevel = LogLevel.DEBUG
  ): Logger {
    const logger = new Logger(channel)
    logger.pushHandler(new ConsoleHandler(level))
    logger.pushProcessor(timestampProcessor)
    logger.pushProcessor(processIdProcessor)
    return logger
  }

  static createForDevelopment(channel: string): Logger {
    const logger = new Logger(channel)
    logger.pushHandler(new ConsoleHandler(LogLevel.DEBUG))
    logger.pushProcessor(timestampProcessor)
    logger.pushProcessor(memoryUsageProcessor)
    return logger
  }

  static createForProduction(channel: string): Logger {
    const logger = new Logger(channel)
    logger.pushHandler(new ConsoleHandler(LogLevel.INFO))
    logger.pushProcessor(timestampProcessor)
    logger.pushProcessor(processIdProcessor)
    return logger
  }
  // endregion ////
}

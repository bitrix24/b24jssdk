import type { Handler, Processor, LogRecord, LogLevelName, LoggerInterface } from '../types/logger'
import { LogLevel } from '../types/logger'
import { AbstractLogger } from './abstract-logger'

/**
 * A logger created according to the principles of `Monolog`
 *
 * @link https://github.com/Seldaek/monolog
 */
export class Logger extends AbstractLogger implements LoggerInterface {
  private readonly channel: string
  private handlers: Handler[] = []
  private processors: Processor[] = []

  constructor(channel: string) {
    super()
    this.channel = channel
  }

  // region static methods for creation ////
  static create(channel: string): Logger {
    return new Logger(channel)
  }
  // endregion ////

  // region config ////
  public pushHandler(handler: Handler): this {
    this.handlers.push(handler)
    return this
  }

  public popHandler(): Handler | null {
    return this.handlers.pop() || null
  }

  public setHandlers(handlers: Handler[]): this {
    this.handlers = handlers
    return this
  }

  public pushProcessor(processor: Processor): this {
    this.processors.push(processor)
    return this
  }
  // endregion ////

  /**
   * @inheritDoc
   */
  public async log(level: LogLevel, message: string, context?: Record<string, any>): Promise<void> {
    const record: LogRecord = {
      channel: this.channel,
      level,
      levelName: LogLevel[level] as LogLevelName,
      message,
      context: context ?? {},
      extra: {},
      timestamp: new Date()
    }

    // Using processors
    let processedRecord = record
    for (const processor of this.processors) {
      processedRecord = processor(processedRecord)
    }

    // Pass the record to the handlers
    for (const handler of this.handlers) {
      if (handler.isHandling(level)) {
        // The handler returns a boolean indicating whether it was processed successfully.
        const handled = await handler.handle(processedRecord)

        // If the handler has processed the record and should NOT proceed further (bubble: false)
        // break the chain of handlers
        if (handled && !handler.shouldBubble()) {
          break
        }
      }
    }
  }
}

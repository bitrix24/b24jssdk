import type { Handler, Formatter, LogRecord } from '../../types/logger'
import { LogLevel } from '../../types/logger'

/**
 * Abstract Handler
 */
export abstract class AbstractHandler implements Handler {
  protected level: LogLevel
  protected formatter: Formatter | null = null
  protected bubble: boolean = true

  constructor(
    level: LogLevel = LogLevel.DEBUG,
    bubble: boolean = true
  ) {
    this.level = level
    this.bubble = bubble
  }

  public isHandling(level: LogLevel): boolean {
    return level >= this.level
  }

  public setFormatter(formatter: Formatter): void {
    this.formatter = formatter
  }

  public getFormatter(): Formatter | null {
    return this.formatter
  }

  /**
   * @inheritDoc
   */
  public abstract handle(record: LogRecord): void
}

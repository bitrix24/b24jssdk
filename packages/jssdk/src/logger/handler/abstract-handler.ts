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
    bubble?: boolean
  ) {
    this.level = level

    if (bubble !== undefined) this.bubble = bubble
  }

  public isHandling(level: LogLevel): boolean {
    return level >= this.level
  }

  public shouldBubble(): boolean {
    return this.bubble
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
  public abstract handle(record: LogRecord): Promise<boolean>
}

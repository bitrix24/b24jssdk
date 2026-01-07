import type { Handler, LogRecord } from '../../types/logger'
import { LogLevel } from '../../types/logger'
import { AbstractHandler } from './abstract-handler'

/**
 * Memory Handler
 *
 * @todo ??
 */
export class MemoryHandler extends AbstractHandler implements Handler {
  private records: LogRecord[] = []
  private readonly limit: number

  constructor(
    limit: number = 1_000,
    level: LogLevel = LogLevel.DEBUG,
    bubble: boolean = true
  ) {
    super(level, bubble)
    this.limit = limit
  }

  /**
   * @inheritDoc
   */
  public override handle(record: LogRecord): void {
    if (!this.isHandling(record.level)) return

    this.records.push(record)
    if (this.records.length > this.limit) {
      this.records.shift()
    }
  }

  getRecords(): LogRecord[] {
    return [...this.records]
  }

  clear(): void {
    this.records = []
  }
}

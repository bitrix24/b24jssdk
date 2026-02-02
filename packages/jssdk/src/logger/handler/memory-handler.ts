import type { Handler, HandlerOptions, LogRecord } from '../../types/logger'
import { LogLevel } from '../../types/logger'
import { AbstractHandler } from './abstract-handler'

export interface MemoryHandlerOptions extends HandlerOptions {
  limit?: number
}

/**
 * Memory Handler
 */
export class MemoryHandler extends AbstractHandler implements Handler {
  private records: LogRecord[] = []
  private readonly limit: number

  constructor(
    level: LogLevel = LogLevel.DEBUG,
    options?: MemoryHandlerOptions
  ) {
    const opts = {
      bubble: true,
      limit: 1_000,
      ...options
    }
    super(level, opts.bubble)
    this.limit = opts.limit
  }

  /**
   * @inheritDoc
   */
  public override async handle(record: LogRecord): Promise<boolean> {
    this.records.push(record)
    if (this.records.length > this.limit) {
      this.records.shift()
    }

    return true
  }

  getRecords(): LogRecord[] {
    return [...this.records]
  }

  clear(): void {
    this.records = []
  }
}

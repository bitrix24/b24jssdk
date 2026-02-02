import type { Handler, HandlerOptions, LogRecord, Formatter, LogLevelName } from '../../types/logger'
import { LogLevel } from '../../types/logger'
import { AbstractHandler } from './abstract-handler'

export interface WinstonAdapterOptions extends HandlerOptions {
  winstonLogger: any
}

/**
 * Adapter for Winston
 *
 * @memo Winston has its own formatter
 * @link https://github.com/winstonjs/winston
 */
export class WinstonAdapter extends AbstractHandler implements Handler {
  private winstonLogger: any

  constructor(
    level: LogLevel = LogLevel.DEBUG,
    options: WinstonAdapterOptions
  ) {
    const opts = {
      bubble: true,
      ...options
    }

    super(level, opts.bubble)
    this.winstonLogger = opts.winstonLogger
  }

  public override setFormatter(_formatter: Formatter): void {
    // Consola has its own formatter
  }

  public override getFormatter(): Formatter | null {
    return null
  }

  public override async handle(record: LogRecord): Promise<boolean> {
    const levelMap: Record<LogLevelName, string> = {
      DEBUG: 'debug',
      INFO: 'info',
      NOTICE: 'notice',
      WARNING: 'warn',
      ERROR: 'error',
      CRITICAL: 'error',
      ALERT: 'error',
      EMERGENCY: 'error'
    }

    const winstonLevel = levelMap[record.levelName] || levelMap.INFO

    this.winstonLogger.log({
      level: winstonLevel,
      channel: record.channel,
      message: record.message,
      context: record.context,
      extra: record.extra,
      timestamp: record.timestamp
    })

    return true
  }
}

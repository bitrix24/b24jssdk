import type { Handler, HandlerOptions, LogRecord, Formatter } from '../../types/logger'
import { LogLevel } from '../../types/logger'
import { AbstractHandler } from './abstract-handler'

/**
 * Adapter for Consola
 *
 * @memo Consola has its own formatter
 * @link https://github.com/unjs/consola
 */
export class ConsolaAdapter extends AbstractHandler implements Handler {
  private consolaInstance: any

  constructor(
    level: LogLevel = LogLevel.DEBUG,
    options: HandlerOptions & { consolaInstance: any }
  ) {
    const opts = {
      bubble: true,
      ...options
    }

    super(level, opts.bubble)
    this.consolaInstance = opts.consolaInstance
  }

  public override setFormatter(_formatter: Formatter): void {
    // Consola has its own formatter
  }

  public override getFormatter(): Formatter | null {
    return null
  }

  public override async handle(record: LogRecord): Promise<boolean> {
    const message = `[${record.channel}] ${record.levelName}: ${record.message}`
    const args = { ...record.context, ...record.extra, timestamp: record.timestamp }

    switch (record.level) {
      case LogLevel.DEBUG:
        this.consolaInstance.log(message, args)
        break
      case LogLevel.INFO:
        this.consolaInstance.info(message, args)
        break
      case LogLevel.NOTICE:
        this.consolaInstance.success(message, args)
        break
      case LogLevel.WARNING:
        this.consolaInstance.warn(message, args)
        break
      case LogLevel.ERROR:
      case LogLevel.CRITICAL:
      case LogLevel.ALERT:
      case LogLevel.EMERGENCY:
        this.consolaInstance.error(message, args)
        break
      default:
        this.consolaInstance.log(message, args)
    }

    return true
  }
}

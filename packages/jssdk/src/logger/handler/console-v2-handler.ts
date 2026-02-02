import type { Handler, LogRecord } from '../../types/logger'
import type { ConsoleHandlerOptions } from './console-handler'
import { LogLevel } from '../../types/logger'
import { LineFormatter } from '../formatter'
import { ConsoleHandler } from './console-handler'

/**
 * Console Handler V2
 */
export class ConsoleV2Handler extends ConsoleHandler implements Handler {
  constructor(
    level: LogLevel = LogLevel.DEBUG,
    options?: ConsoleHandlerOptions
  ) {
    super(level, options)
    this.setFormatter(new LineFormatter('[{channel}]: {message}'))
  }

  /**
   * @inheritDoc
   */
  public override async handle(record: LogRecord): Promise<boolean> {
    const formatter = this.getFormatter()!
    const message = formatter.format(record)

    let method = this._getConsoleMethod(record.level)
    if (record.context['needTrace'] === true) {
      method = 'trace'
    }

    const context = record.context && Object.keys(record.context).length > 0
      ? record.context
      : undefined
    const extra = record.extra && Object.keys(record.extra).length > 0
      ? record.extra
      : undefined

    const params = []
    if (this._useStyles && this._styles.has(record.level)) {
      const style = this._styles.get(record.level)!
      params.push(style[0], style[1])
    }
    params.push(message)
    params.push(context)
    params.push(extra)
    console[method](
      ...params.filter(Boolean)
    )

    return true
  }
}

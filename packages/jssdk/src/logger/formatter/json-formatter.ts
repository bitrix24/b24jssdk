import type { Formatter, LogRecord } from '../../types/logger'
import { AbstractFormatter } from './abstract-formatter'

/**
 * JsonFormatter
 *
 * @inheritDoc
 */
export class JsonFormatter extends AbstractFormatter implements Formatter {
  constructor(
    dateFormat: string = 'YYYY-MM-DD HH:mm:ss'
  ) {
    super(dateFormat)
  }

  public override format(record: LogRecord): string {
    return JSON.stringify({
      channel: record.channel,
      levelName: record.levelName,
      message: record.message,
      context: record.context,
      extra: record.extra,
      timestamp: this._formatTimestamp(record.timestamp),
      date: this._formatDate(record.timestamp)
    })
  }
}

import type { Formatter, LogRecord } from '../../types/logger'
import { AbstractFormatter } from './abstract-formatter'

/**
 * LineFormatter
 *
 * @inheritDoc
 */
export class LineFormatter extends AbstractFormatter implements Formatter {
  protected formatString: string

  constructor(
    formatString: string = '[{channel}] {levelName}: {message} {context} {extra} {date}',
    dateFormat: string = 'YYYY-MM-DD HH:mm:ss'
  ) {
    super(dateFormat)

    this.formatString = formatString
  }

  public override format(record: LogRecord): string {
    let formatted = this.formatString

    const replacements: Record<string, string> = {
      '{channel}': record.channel,
      '{levelName}': record.levelName,
      '{message}': record.message,
      '{context}': JSON.stringify(record.context),
      '{extra}': JSON.stringify(record.extra),
      '{timestamp}': this._formatTimestamp(record.timestamp),
      '{date}': this._formatDate(record.timestamp)
    }

    for (const [key, value] of Object.entries(replacements)) {
      formatted = formatted.replace(key, value)
    }

    return formatted
  }
}

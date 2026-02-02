import type { Formatter, LogRecord } from '../../types/logger'
import { DateTime } from 'luxon'

/**
 * Support date format:
 *  - `YYYY` - Full year (e.g., 2024)
 *  - `YY` - Two-digit year (e.g., 24)
 *  - `MMMM` - Full month name (e.g., "January")
 *  - `MMM` - Abbreviated month name (e.g., "Jan")
 *  - `MM` - Month with leading zero (01-12)
 *  - `M` - Month without leading zero (1-12)
 *  - `DD` - Day of month with leading zero (01-31)
 *  - `D` - Day of month without leading zero (1-31)
 *  - `HH` - Hour (24-hour) with leading zero (00-23)
 *  - `H` - Hour (24-hour) without leading zero (0-23)
 *  - `hh` - Hour (12-hour) with leading zero (00-11)
 *  - `h` - Hour (12-hour) without leading zero (0-11)
 *  - `mm` - Minutes with leading zero (00-59)
 *  - `m` - Minutes without leading zero (0-59)
 *  - `ss` - Seconds with leading zero (00-59)
 *  - `s` - Seconds without leading zero (0-59)
 *  - `SSS` - Milliseconds (000-999)
 *  - `a` - AM/PM lowercase (am/pm)
 *  - `A` - AM/PM uppercase (AM/PM)
 *  - `ZZZ` - Timezone (e.g., UTC)
 *  - `ZZ` - Timezone offset (e.g., +03:00)
 */
export abstract class AbstractFormatter implements Formatter {
  protected dateFormat: string

  constructor(
    dateFormat: string = 'YYYY-MM-DD HH:mm:ss'
  ) {
    this.dateFormat = dateFormat
  }

  public abstract format(record: LogRecord): string

  protected _formatTimestamp(date: Date): string {
    const dt = DateTime.fromJSDate(date)
    return Math.floor(dt.toSeconds()).toFixed(0)
  }

  protected _formatDate(date: Date): string {
    const dt = DateTime.fromJSDate(date)
    return dt.toFormat(this.dateFormat
      .replace(/YYYY/g, 'yyyy')
      .replace(/YY/g, 'yy')
      .replace(/DD/g, 'dd')
      .replace(/D/g, 'd')
    )
  }
}

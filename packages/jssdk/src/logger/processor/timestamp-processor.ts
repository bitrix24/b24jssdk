import type { Processor, LogRecord } from '../../types/logger'
import { DateTime } from 'luxon'

export const timestampProcessor: Processor = (record: LogRecord) => {
  record.extra['timestamp'] = Math.floor(DateTime.fromJSDate(record.timestamp).toSeconds())

  return record
}

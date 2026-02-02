import type { Processor, LogRecord } from '../../types/logger'

export const pidProcessor: Processor = (record: LogRecord) => {
  record.extra['pid'] = '?'

  if (typeof process !== 'undefined' && process.pid) {
    record.extra['pid'] = process.pid
  }

  return record
}

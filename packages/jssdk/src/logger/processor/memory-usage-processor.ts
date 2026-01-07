import type { Processor, LogRecord } from '../../types/logger'

export const memoryUsageProcessor: Processor = (record: LogRecord) => {
  record.extra['memoryUsage'] = '?'

  if (typeof process !== 'undefined' && process.memoryUsage) {
    record.extra['memoryUsage'] = Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
  }

  return record
}

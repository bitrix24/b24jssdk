import type { Writable } from 'node:stream'
import type { Handler, LogRecord } from '../../types/logger'
import { LogLevel } from '../../types/logger'
import { AbstractHandler } from './abstract-handler'
import { LineFormatter } from '../formatter/line-formatter'

/**
 * Stream Handler
 *
 * Node.js stream handler for writing logs to streams.
 *
 * @property {Writable} stream - Stream for writing logs.
 */
export class StreamHandler extends AbstractHandler implements Handler {
  private stream: Writable

  /**
   * Creates a StreamHandler instance.
   *
   * @param {Writable} stream - Stream to write to (e.g., process.stdout, process.stderr, fs.WriteStream).
   * @param {LogLevel} level - Minimum log level.
   * @param {boolean} bubble - Determines whether the handler should bubble the record to the next handler.
   */
  constructor(
    stream: Writable,
    level: LogLevel = LogLevel.DEBUG,
    bubble: boolean = true
  ) {
    super(level, bubble)

    this.stream = stream
    this.setFormatter(new LineFormatter())
  }

  /**
   * @inheritDoc
   */
  public override handle(record: LogRecord): void {
    if (!this.isHandling(record.level)) return

    try {
      const formatter = this.getFormatter()!
      const message = formatter.format(record) + '\n'
      this.stream.write(message)
    } catch (error) {
      // If stream write fails, log to stderr
      console.error(`StreamHandler write error: ${error}`)
    }
  }

  /**
   * Closes the stream (if supported).
   *
   * @returns {Promise<void>}
   */
  public async close(): Promise<void> {
    if (typeof this.stream.end === 'function') {
      return new Promise((resolve, reject) => {
        this.stream.end((error?: Error | null) => {
          if (error) reject(error)
          else resolve()
        })
      })
    }
  }
}

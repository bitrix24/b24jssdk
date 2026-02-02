import type { Writable } from 'node:stream'
import type { Handler, HandlerOptions, LogRecord } from '../../types/logger'
import { LogLevel } from '../../types/logger'
import { AbstractHandler } from './abstract-handler'
import { LineFormatter } from '../formatter'

export interface StreamHandlerOptions extends HandlerOptions {
  stream: Writable
}

/**
 * Stream Handler
 *
 * Node.js stream handler for writing logs to streams.
 */
export class StreamHandler extends AbstractHandler implements Handler {
  /**
   * Stream for writing logs.
   * @private
   */
  private stream: Writable

  /**
   * Creates a StreamHandler instance.
   *
   * @param {LogLevel} level - Minimum log level.
   * @param options
   *     - `stream: Writable` - Stream to write to (e.g., `process.stdout`, `process.stderr`, `fs.WriteStream`)
   *     - `bubble?: boolean` - Determines whether the handler should bubble the record to the next handler.
   */
  constructor(
    level: LogLevel = LogLevel.DEBUG,
    options: StreamHandlerOptions
  ) {
    const opts = {
      bubble: true,
      ...options
    }
    super(level, opts.bubble)

    this.stream = opts.stream
    this.setFormatter(new LineFormatter())
  }

  /**
   * @inheritDoc
   */
  public override async handle(record: LogRecord): Promise<boolean> {
    try {
      const formatter = this.getFormatter()!
      const message = formatter.format(record) + '\n'
      this.stream.write(message)
    } catch (error) {
      // If stream write fails, log to stderr
      console.error(`StreamHandler write error: ${error}`)
      return false
    }

    return true
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

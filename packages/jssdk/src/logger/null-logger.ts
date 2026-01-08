import type { LoggerInterface, LogLevel } from '../types/logger'
import { AbstractLogger } from './abstract-logger'

/**
 * This Logger can be used to avoid conditional log calls.
 *
 * Logging should always be optional, and if no logger is provided to your
 * library creating a NullLogger instance to have something to throw logs at
 * is a good way to avoid littering your code with `if (this.logger) { }`
 * blocks.
 */
export class NullLogger extends AbstractLogger implements LoggerInterface {
  // region static methods for creation ////
  static create(): NullLogger {
    return new NullLogger()
  }
  // endregion ////

  // region logging methods ////
  /**
   * @inheritDoc
   */
  public async log(_level: LogLevel, _message: string, _context?: Record<string, any>): Promise<void> {
    // noop
  }
  // endregion ////
}

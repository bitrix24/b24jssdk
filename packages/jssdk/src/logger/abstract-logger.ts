import type { LoggerInterface } from '../types/logger'
import { LogLevel } from '../types/logger'

export abstract class AbstractLogger implements LoggerInterface {
  // region logging methods ////
  /**
   * @inheritDoc
   */
  public abstract log(_level: LogLevel, _message: string, _context?: Record<string, any>): Promise<void>

  /**
   * @inheritDoc
   */
  public async debug(message: string, context?: Record<string, any>): Promise<void> {
    return this.log(LogLevel.DEBUG, message, context)
  }

  /**
   * @inheritDoc
   */
  public async info(message: string, context?: Record<string, any>): Promise<void> {
    return this.log(LogLevel.INFO, message, context)
  }

  /**
   * @inheritDoc
   */
  public async notice(message: string, context?: Record<string, any>): Promise<void> {
    return this.log(LogLevel.NOTICE, message, context)
  }

  /**
   * @inheritDoc
   */
  public async warning(message: string, context?: Record<string, any>): Promise<void> {
    return this.log(LogLevel.WARNING, message, context)
  }

  /**
   * @inheritDoc
   */
  public async error(message: string, context: Record<string, any>): Promise<void> {
    return this.log(LogLevel.ERROR, message, context)
  }

  /**
   * @inheritDoc
   */
  public async critical(message: string, context?: Record<string, any>): Promise<void> {
    return this.log(LogLevel.CRITICAL, message, context)
  }

  /**
   * @inheritDoc
   */
  public async alert(message: string, context?: Record<string, any>): Promise<void> {
    return this.log(LogLevel.ALERT, message, context)
  }

  /**
   * @inheritDoc
   */
  public async emergency(message: string, context?: Record<string, any>): Promise<void> {
    return this.log(LogLevel.EMERGENCY, message, context)
  }
  // endregion ////
}

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
  public debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context)
  }

  /**
   * @inheritDoc
   */
  public info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context)
  }

  /**
   * @inheritDoc
   */
  public notice(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.NOTICE, message, context)
  }

  /**
   * @inheritDoc
   */
  public warning(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARNING, message, context)
  }

  /**
   * @inheritDoc
   */
  public error(message: string, context: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, context)
  }

  /**
   * @inheritDoc
   */
  public critical(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.CRITICAL, message, context)
  }

  /**
   * @inheritDoc
   */
  public alert(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.ALERT, message, context)
  }

  /**
   * @inheritDoc
   */
  public emergency(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.EMERGENCY, message, context)
  }
  // endregion ////
}

/**
 * Log levels in ascending order of severity.
 *
 * Levels allow filtering messages: when a specific level is set,
 * messages of that level and all higher levels will be logged.
 */
export enum LogLevel {
  /**
   * Detailed debug information for developers.
   * Default level in development environment.
   */
  DEBUG = 0,

  /**
   * Informational messages about normal application operation.
   * Used for tracking business logic.
   */
  INFO = 1,

  /**
   * Important but non-critical events.
   * Examples: successful request processing, configuration changes.
   */
  NOTICE = 2,

  /**
   * Warnings about potential problems.
   * Application continues to run but attention is required.
   */
  WARNING = 3,

  /**
   * Runtime errors requiring intervention.
   * Some functionality is unavailable but the application is running.
   */
  ERROR = 4,

  /**
   * Critical errors disrupting component operation.
   * Require immediate intervention during working hours.
   */
  CRITICAL = 5,

  /**
   * Serious problems requiring immediate resolution.
   * Examples: database unavailable, disk space exhausted.
   */
  ALERT = 6,

  /**
   * System is unusable, requires urgent intervention.
   * Highest severity level.
   */
  EMERGENCY = 7
}

export type LogLevelName = keyof typeof LogLevel

export interface LogRecord {
  channel: string
  level: LogLevel
  levelName: LogLevelName
  message: string
  context: Record<string, any>
  extra: Record<string, any>
  timestamp: Date
}

export interface Formatter {
  format(record: LogRecord): any
}

export interface Handler {
  /**
   * Handles a log record.
   *
   * @param {LogRecord} record - Log record to handle.
   * @returns {void}
   */
  handle(record: LogRecord): void
  isHandling(level: LogLevel): boolean
  setFormatter(formatter: Formatter): void
  getFormatter(): Formatter | null
}

export type Processor = (record: LogRecord) => LogRecord

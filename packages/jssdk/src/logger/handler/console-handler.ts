import type { Handler, HandlerOptions, LogRecord } from '../../types/logger'
import { LogLevel } from '../../types/logger'
import { AbstractHandler } from './abstract-handler'
import { LineFormatter } from '../formatter'

export interface ConsoleHandlerOptions extends HandlerOptions {
  useStyles?: boolean
}

/**
 * Console Handler
 */
export class ConsoleHandler extends AbstractHandler implements Handler {
  protected _styles: Map<LogLevel, string[]> = new Map()
  protected readonly _useStyles: boolean

  constructor(
    level: LogLevel = LogLevel.DEBUG,
    options?: ConsoleHandlerOptions
  ) {
    const opts = {
      useStyles: true,
      ...options
    }

    super(level, opts.bubble)
    this._useStyles = opts.useStyles
    this._initStyles()
    this.setFormatter(new LineFormatter())
  }

  protected _initStyles(): void {
    const style: string = 'color: _color_; background: _bg_; padding: 2px 6px; border-radius: 3px; font-size: 11px;'

    this._styles.set(LogLevel.DEBUG, [
      '%cDEBUG',
      style.replace('_color_', '#666666').replace('_bg_', '#F0F0F0')
    ])
    this._styles.set(LogLevel.INFO, [
      '%cINFO',
      style.replace('_color_', 'white').replace('_bg_', '#2196F3')
    ])
    this._styles.set(LogLevel.NOTICE, [
      '%cNOTICE',
      style.replace('_color_', 'white').replace('_bg_', '#213BF3')
    ])
    this._styles.set(LogLevel.WARNING, [
      '%cWARN',
      style.replace('_color_', 'white').replace('_bg_', '#FF9800')
    ])
    this._styles.set(LogLevel.ERROR, [
      '%cERROR',
      style.replace('_color_', 'white').replace('_bg_', '#F44336')
    ])
    this._styles.set(LogLevel.CRITICAL, [
      '%cCRITICAL',
      style.replace('_color_', 'white').replace('_bg_', '#9C27B0')
    ])
  }

  /**
   * @inheritDoc
   */
  public override async handle(record: LogRecord): Promise<boolean> {
    const formatter = this.getFormatter()!
    const message = formatter.format(record)

    let method = this._getConsoleMethod(record.level)
    if (record.context['needTrace'] === true) {
      method = 'trace'
    }

    const params = []
    if (this._useStyles && this._styles.has(record.level)) {
      const style = this._styles.get(record.level)!
      params.push(style[0], style[1])
    }
    params.push(message)
    console[method](
      ...params.filter(Boolean)
    )

    return true
  }

  protected _getConsoleMethod(level: LogLevel): 'log' | 'info' | 'warn' | 'error' | 'trace' {
    switch (level) {
      case LogLevel.INFO:
      case LogLevel.NOTICE:
        return 'info'
      case LogLevel.WARNING:
        return 'warn'
      case LogLevel.ERROR:
      case LogLevel.CRITICAL:
      case LogLevel.ALERT:
      case LogLevel.EMERGENCY:
        return 'error'
      default:
        return 'log'
    }
  }
}

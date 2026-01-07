import type { Handler, LogRecord } from '../../types/logger'
import { LogLevel } from '../../types/logger'
import { AbstractHandler } from './abstract-handler'
import { LineFormatter } from '../formatter/line-formatter'

/**
 * Console Handler
 */
export class ConsoleHandler extends AbstractHandler implements Handler {
  private styles: Map<LogLevel, string[]> = new Map()
  private readonly useStyles: boolean

  constructor(
    useStyles: boolean = true,
    level: LogLevel = LogLevel.DEBUG,
    bubble: boolean = true
  ) {
    super(level, bubble)
    this.useStyles = useStyles
    this._initStyles()
    this.setFormatter(new LineFormatter())
  }

  private _initStyles(): void {
    const style: string = 'color: _color_; background: _bg_; padding: 2px 6px; border-radius: 3px; font-size: 11px;'

    this.styles.set(LogLevel.DEBUG, [
      '%cDEBUG',
      style.replace('_color_', '#666666').replace('_bg_', '#F0F0F0')
    ])
    this.styles.set(LogLevel.INFO, [
      '%cINFO',
      style.replace('_color_', 'white').replace('_bg_', '#2196F3')
    ])
    this.styles.set(LogLevel.NOTICE, [
      '%cNOTICE',
      style.replace('_color_', 'white').replace('_bg_', '#213BF3')
    ])
    this.styles.set(LogLevel.WARNING, [
      '%cWARN',
      style.replace('_color_', 'white').replace('_bg_', '#FF9800')
    ])
    this.styles.set(LogLevel.ERROR, [
      '%cERROR',
      style.replace('_color_', 'white').replace('_bg_', '#F44336')
    ])
    this.styles.set(LogLevel.CRITICAL, [
      '%cCRITICAL',
      style.replace('_color_', 'white').replace('_bg_', '#9C27B0')
    ])
  }

  /**
   * @inheritDoc
   */
  public override handle(record: LogRecord): void {
    if (!this.isHandling(record.level)) return

    const formatter = this.getFormatter()!
    const message = formatter.format(record)

    if (this.useStyles && this.styles.has(record.level)) {
      const style = this.styles.get(record.level)!
      const method = this._getConsoleMethod(record.level)
      console[method](style[0], style[1], message)
    } else {
      const method = this._getConsoleMethod(record.level)
      console[method](message)
    }
  }

  private _getConsoleMethod(level: LogLevel): 'log' | 'info' | 'warn' | 'error' {
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

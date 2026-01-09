import type { Handler, HandlerOptions, LogRecord } from '../../types/logger'
import { LogLevel } from '../../types/logger'
import { AbstractHandler } from './abstract-handler'
import { TelegramFormatter } from '../formatter'
import { Environment, getEnvironment } from '../../tools/environment'

export interface TelegramHandlerOptions extends HandlerOptions {
  botToken: string
  chatId: string | number
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2'
  disableNotification?: boolean
  disableWebPagePreview?: boolean
  useStyles?: boolean
  warnInBrowser?: boolean
}

/**
 * Telegram Handler
 *
 * Sends logs to Telegram chat.
 * The browser displays a warning in the console.
 * In Node.js, sends a message via the Telegram Bot API.
 */
export class TelegramHandler extends AbstractHandler implements Handler {
  protected botToken: string
  protected chatId: string | number
  protected parseMode: 'HTML' | 'Markdown' | 'MarkdownV2'
  protected disableNotification: boolean
  protected disableWebPagePreview: boolean
  protected readonly environment: Environment
  protected warnInBrowser: boolean

  constructor(
    level: LogLevel = LogLevel.ERROR,
    options: TelegramHandlerOptions
  ) {
    super(level, options.bubble)

    if (!options.botToken) {
      throw new Error('botToken is required for TelegramHandler')
    }

    if (!options.chatId) {
      throw new Error('chatId is required for TelegramHandler')
    }

    this.botToken = options.botToken
    this.chatId = options.chatId
    this.parseMode = options.parseMode || 'HTML'
    this.disableNotification = options.disableNotification || false
    this.disableWebPagePreview = options.disableWebPagePreview || true
    this.environment = getEnvironment()
    this.warnInBrowser = options.warnInBrowser !== false // By default, we warn you in the browser

    // Set the default formatter
    this.setFormatter(new TelegramFormatter(this.parseMode === 'HTML'))
  }

  /**
   * @inheritDoc
   */
  public override async handle(record: LogRecord): Promise<boolean> {
    const formatter = this.getFormatter()
    if (!formatter) {
      console.error('TelegramHandler: No formatter set')
      return false
    }

    const message = formatter.format(record)

    // Depending on the environment, we process it differently.
    if (this.environment === Environment.BROWSE) {
      return this._handleInBrowser(message, record)
    } else if (this.environment === Environment.NODE) {
      return this._handleInNode(message, record)
    }

    console.warn('TelegramHandler: Unknown environment, using fallback')
    return this._handleFallback(message)
  }

  /**
   * Processing in the browser
   */
  protected async _handleInBrowser(_message: string, record: LogRecord): Promise<boolean> {
    if (this.warnInBrowser) {
      const warningMessage
        = `⚠️ TelegramHandler: Cannot send logs to Telegram from browser environment.\n`
          + `This would expose your bot token. Consider disabling this handler in browser.\n`
          + `Log message: ${record.message}\n`
          + `If you need to send logs from browser, use a proxy server.`

      console.warn(warningMessage)

      // We also display a styled message for the developer
      const style = 'color: #FF9800; background: #FFF3E0; padding: 8px; border: 1px solid #FFB74D; border-radius: 4px;'
      console.log('%cTelegram Handler Warning', style, warningMessage)
    }

    // In the browser, we always return false, since the message was not sent.
    return false
  }

  /**
   * Processing in Node.js
   */
  protected async _handleInNode(message: string, _record: LogRecord): Promise<boolean> {
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`
      const config = JSON.stringify({
        chat_id: this.chatId,
        text: message,
        parse_mode: this.parseMode,
        disable_notification: this.disableNotification,
        disable_web_page_preview: this.disableWebPagePreview
      })
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: config
      })

      const result = await response.json()

      if (!result.ok) {
        console.error('TelegramHandler: Failed to send message', result)
        return false
      }

      return true
    } catch (error) {
      console.error('TelegramHandler: Error sending message', error)
      return false
    }
  }

  /**
   * Fallback processing for unknown environments
   */
  protected async _handleFallback(message: string): Promise<boolean> {
    console.log('TelegramHandler (fallback):', message)
    return false
  }

  public updateSettings(options: Partial<TelegramHandlerOptions>): this {
    if (options.botToken) this.botToken = options.botToken
    if (options.chatId) this.chatId = options.chatId
    if (options.parseMode) this.parseMode = options.parseMode
    if (options.disableNotification !== undefined) {
      this.disableNotification = options.disableNotification
    }
    if (options.disableWebPagePreview !== undefined) {
      this.disableWebPagePreview = options.disableWebPagePreview
    }
    if (options.warnInBrowser !== undefined) {
      this.warnInBrowser = options.warnInBrowser
    }
    return this
  }

  /**
   * Get current environment
   */
  public getEnvironment(): Environment {
    return this.environment
  }

  /**
   * Check if the Telegram API is available
   */
  public async testConnection(): Promise<boolean> {
    if (this.environment === 'browser') {
      console.warn('TelegramHandler: Cannot test connection in browser environment')
      return false
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/getMe`
      const response = await fetch(url)
      const result = await response.json()
      return result.ok === true
    } catch (error) {
      console.error('TelegramHandler: Test connection failed', error)
      return false
    }
  }
}

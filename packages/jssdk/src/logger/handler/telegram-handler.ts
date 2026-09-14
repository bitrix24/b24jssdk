import type { Handler, HandlerOptions, LogRecord } from '../../types/logger'
import { LogLevel } from '../../types/logger'
import { AbstractHandler } from './abstract-handler'
import { TelegramFormatter } from '../formatter'
import { Environment, getEnvironment, isBrowserLikeRuntime } from '../../tools/environment'

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
 * In Node.js, sends a message via the Telegram Bot API.
 *
 * In a **browser-like** runtime — the main thread or any Web, Shared or Service
 * Worker — it sends nothing and warns in the console instead: the request would
 * carry the bot token, and code in either scope is equally readable. A worker
 * used to miss that warning, because it was read as an unrecognised environment
 * rather than as browser-like (#505).
 */
export class TelegramHandler extends AbstractHandler implements Handler {
  protected botToken: string
  protected chatId: string | number
  protected parseMode: 'HTML' | 'Markdown' | 'MarkdownV2'
  protected disableNotification: boolean
  protected disableWebPagePreview: boolean
  protected readonly environment: Environment
  /** Captured beside {@link environment}: does the browser's rulebook apply here? */
  protected readonly isBrowserLike: boolean
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
    this.isBrowserLike = isBrowserLikeRuntime()
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

    // Depending on the environment, we process it differently. The browser
    // branch is keyed on `isBrowserLikeRuntime()` rather than on `BROWSE`: a
    // worker has no DOM but is just as public, and its console is where the
    // token warning belongs.
    if (this.isBrowserLike) {
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
        = `⚠️ TelegramHandler: Cannot send logs to Telegram from a browser-like environment.\n`
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
    if (this.isBrowserLike) {
      // Not merely a courtesy: the request below puts the bot token in a URL, so
      // running it from a browser or a worker hands the token to the network
      // from code anyone can read.
      console.warn('TelegramHandler: Cannot test connection in a browser-like environment')
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

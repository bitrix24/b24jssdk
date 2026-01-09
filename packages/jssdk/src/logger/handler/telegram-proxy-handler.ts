import type { Handler, LogRecord } from '../../types/logger'
import type { TelegramHandlerOptions } from './telegram-handler'
import { LogLevel } from '../../types/logger'
import { TelegramHandler } from './telegram-handler'

export interface TelegramProxyHandlerOptions extends TelegramHandlerOptions {
  proxyUrl: string
}

/**
 * Telegram Proxy Handler
 *
 * Proxy version for browser
 */
export class TelegramProxyHandler extends TelegramHandler implements Handler {
  protected proxyUrl: string

  constructor(
    level: LogLevel = LogLevel.ERROR,
    options: TelegramProxyHandlerOptions
  ) {
    super(level, options)

    if (!options.proxyUrl) {
      throw new Error('proxyUrl is required for TelegramProxyHandler')
    }

    this.proxyUrl = options.proxyUrl
  }

  /**
   * Processing proxy
   */
  protected override async _handleInBrowser(message: string, _record: LogRecord): Promise<boolean> {
    try {
      const response = await fetch(this.proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: message
        })
      })

      return response.ok
    } catch (error) {
      console.error('TelegramProxyHandler: Failed to send via proxy', error)
      return false
    }
  }
}

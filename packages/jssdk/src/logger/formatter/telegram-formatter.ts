import type { Formatter, LogRecord } from '../../types/logger'
import { AbstractFormatter } from './abstract-formatter'

/**
 * TelegramFormatter
 *
 * Formats a log entry for sending to Telegram.
 * Supports HTML markup with escaped special characters.
 *
 * @link https://core.telegram.org/bots/api#html-style
 */
export class TelegramFormatter extends AbstractFormatter implements Formatter {
  private useHtml: boolean
  private maxMessageLength: number

  constructor(
    useHtml: boolean = true,
    dateFormat: string = 'YYYY-MM-DD HH:mm:ss',
    maxMessageLength: number = 4096
  ) {
    super(dateFormat)
    this.useHtml = useHtml
    this.maxMessageLength = maxMessageLength
  }

  public override format(record: LogRecord): string {
    // Basic formatting
    let message = this._formatBaseMessage(record)

    // Add context and extra, if any
    const additionalInfo = this._formatAdditionalInfo(record)
    if (additionalInfo) {
      message += `\n\n${additionalInfo}`
    }

    // Truncate the message if it exceeds the maximum length
    if (message.length > this.maxMessageLength) {
      message = message.substring(0, this.maxMessageLength - 3) + '...'
    }

    return message
  }

  protected _formatBaseMessage(record: LogRecord): string {
    const date = this._formatDate(record.timestamp)
    const level = record.levelName

    if (this.useHtml) {
      return `<b>${level}</b> | <code>${record.channel}</code>\n`
        + `<i>Time:</i> ${date}\n`
        + `<i>Message:</i>\n${record.message}`
    } else {
      return `*${level}* \`${record.channel}\`\n`
        + `_Time:_ \`${date}\`\n`
        + `_Message:_\n${record.message}`
    }
  }

  protected _formatAdditionalInfo(record: LogRecord): string {
    const parts: string[] = []

    // Add context if it is not empty
    if (record.context && Object.keys(record.context).length > 0) {
      const contextStr = JSON.stringify(record.context, null, 2)
      if (this.useHtml) {
        parts.push(`<i>Context:</i>\n<pre><code class="language-json">${this._escapeHtml(contextStr)}</code></pre>`)
      } else {
        parts.push(`_Context:_\n\`\`\`json\n${contextStr}\n\`\`\``)
      }
    }

    // Add extra if it is not empty
    if (record.extra && Object.keys(record.extra).length > 0) {
      const extraStr = JSON.stringify(record.extra, null, 2)
      if (this.useHtml) {
        parts.push(`<i>Extra:</i>\n<pre><code class="language-json">${this._escapeHtml(extraStr)}</code></pre>`)
      } else {
        parts.push(`_Extra:_\n\`\`\`json\n${extraStr}\n\`\`\``)
      }
    }

    return parts.join('\n\n')
  }

  protected _escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  protected _escapeMarkdownV2(text: string): string {
    return text
      .replace(/_/g, '\\_')
      .replace(/\*/g, '\\*')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/~/g, '\\~')
      .replace(/`/g, '\\`')
      .replace(/>/g, '\\>')
      .replace(/#/g, '\\#')
      .replace(/\+/g, '\\+')
      .replace(/-/g, '\\-')
      .replace(/=/g, '\\=')
      .replace(/\|/g, '\\|')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\./g, '\\.')
      .replace(/!/g, '\\!')
  }

  /**
   * Set the use of HTML markup
   */
  public setUseHtml(useHtml: boolean): this {
    this.useHtml = useHtml
    return this
  }

  /**
   * // Set the maximum message length
   */
  public setMaxMessageLength(maxLength: number): this {
    this.maxMessageLength = maxLength
    return this
  }
}

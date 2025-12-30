import { consola } from 'consola'
import { LoggerBrowser, LoggerType } from '@bitrix24/b24jssdk'

// region StyleCollection ////
const styleCollection = new Map()

styleCollection.set('title', [
  '%c#title#',
  'color: #959ca4; font-style: italic; padding: 0 6px; border-top: 1px solid #ccc; border-left: 1px solid #ccc; border-bottom: 1px solid #ccc'
])

styleCollection.set(LoggerType.desktop, [
  `%cDESKTOP`,
  'color: white; font-style: italic; background-color: #29619b; padding: 0 6px; border: 1px solid #29619b'
])

styleCollection.set(LoggerType.log, [
  `%cLOG`,
  'color: #2a323b; font-style: italic; background-color: #ccc; padding: 0 6px; border: 1px solid #ccc'
])

styleCollection.set(LoggerType.info, [
  `%cINFO`,
  'color: #fff; font-style: italic; background-color: #6b7f96; padding: 0 6px; border: 1px solid #6b7f96'
])

styleCollection.set(LoggerType.warn, [
  `%cWARNING`,
  'color: #f0a74f; font-style: italic; padding: 0 6px; border: 1px solid #f0a74f'
])

styleCollection.set(LoggerType.error, [
  `%cERROR`,
  'color: white; font-style: italic; background-color: #8a3232; padding: 0 6px; border: 1px solid #8a3232'
])

styleCollection.set(LoggerType.trace, [
  `%cTRACE`,
  'color: #2a323b; font-style: italic; background-color: #ccc; padding: 0 6px; border: 1px solid #ccc'
])
// endregion ////

export class LoggerConsola extends LoggerBrowser {
  #title
  #consola

  static build(title, isDevelopment = false) {
    const logger = new LoggerConsola(title)

    if (isDevelopment) {
      logger.enable(LoggerType.log)
      logger.enable(LoggerType.info)
      logger.enable(LoggerType.warn)
    }

    return logger
  }

  constructor(title) {
    super(title)

    this.#title = title
    this.#consola = consola.create({
      defaults: {
        tag: this.#title
      }
    })
  }

  #getStyle() {
    return ''
  }

  desktop(...params) {
    if (this.isEnabled(LoggerType.desktop)) {
      this.#consola.log(...this.#getStyle(LoggerType.desktop), ...params)
    }
  }

  log(...params) {
    if (this.isEnabled(LoggerType.log)) {
      this.#consola.log(...this.#getStyle(LoggerType.log), ...params)
    }
  }

  info(...params) {
    if (this.isEnabled(LoggerType.info)) {
      this.#consola.info(...this.#getStyle(LoggerType.info), ...params)
    }
  }

  warn(...params) {
    if (this.isEnabled(LoggerType.warn)) {
      this.#consola.warn(...this.#getStyle(LoggerType.warn), ...params)
    }
  }

  error(...params) {
    if (this.isEnabled(LoggerType.error)) {
      this.#consola.error(...this.#getStyle(LoggerType.error), ...params)
    }
  }

  trace(...params) {
    if (this.isEnabled(LoggerType.trace)) {
      this.#consola.trace(...this.#getStyle(LoggerType.trace), ...params)
    }
  }
}

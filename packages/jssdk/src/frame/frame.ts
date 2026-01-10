import type { B24FrameQueryParams, MessageInitData } from '../types/auth'
import { B24LangList } from '../core/language/list'
import { ApiVersion } from '../types/b24'

/**
 * Application Frame Data Manager
 */
export class AppFrame {
  #domain: string = ''
  #protocol: boolean = true
  #appSid: null | string = null
  #path: null | string = null
  #lang: null | string = null
  #b24TargetRest: string
  #b24Target: string
  readonly #b24TargetRestWithPath: Map<ApiVersion, string>

  constructor(
    queryParams: B24FrameQueryParams
  ) {
    if (queryParams.DOMAIN) {
      this.#domain = queryParams.DOMAIN
      this.#domain = this.#domain.replace(/:(80|443)$/, '')
    }

    this.#protocol = queryParams.PROTOCOL === true

    if (queryParams.LANG) {
      this.#lang = queryParams.LANG
    }

    if (queryParams.APP_SID) {
      this.#appSid = queryParams.APP_SID
    }

    this.#b24TargetRestWithPath = new Map()

    this.#b24Target = `${this.#protocol ? 'https' : 'http'}://${this.#domain}`
    this.#b24TargetRest = `${this.#b24Target}/rest`

    this.#b24TargetRestWithPath.set(ApiVersion.v1, `${this.#b24TargetRest}`)
    this.#b24TargetRestWithPath.set(ApiVersion.v2, `${this.#b24TargetRest}`)
    this.#b24TargetRestWithPath.set(ApiVersion.v3, `${this.#b24TargetRest}/api`)
  }

  /**
   * Initializes the data received from the parent window message.
   * @param data
   */
  initData(data: MessageInitData): AppFrame {
    if (!this.#domain) {
      this.#domain = data.DOMAIN
    }

    if (!this.#path) {
      this.#path = data.PATH
    }

    if (!this.#lang) {
      this.#lang = data.LANG
    }

    this.#protocol = Number.parseInt(data.PROTOCOL) === 1
    this.#domain = this.#domain.replace(/:(80|443)$/, '')

    this.#b24Target = `${this.#protocol ? 'https' : 'http'}://${this.#domain}`
    this.#b24TargetRest = `${this.#b24Target}/rest`

    this.#b24TargetRestWithPath.set(ApiVersion.v1, `${this.#b24TargetRest}`)
    this.#b24TargetRestWithPath.set(ApiVersion.v2, `${this.#b24TargetRest}`)
    this.#b24TargetRestWithPath.set(ApiVersion.v3, `${this.#b24TargetRest}/api`)

    return this
  }

  /**
   * Returns the sid of the application relative to the parent window like this `9c33468728e1d2c8c97562475edfd96`
   */
  getAppSid(): string {
    if (null === this.#appSid) {
      throw new Error(`Not init appSid`)
    }

    return this.#appSid
  }

  /**
   * Get the account address BX24 (https://your_domain.bitrix24.com)
   */
  getTargetOrigin(): string {
    return this.#b24Target
  }

  /**
   * Get the account address BX24 with path
   *   - ver1 `https://your_domain.bitrix24.com/rest/`
   *   - ver2 `https://your_domain.bitrix24.com/rest/`
   *   - ver3` https://your_domain.bitrix24.com/rest/api/`
   */
  getTargetOriginWithPath(): Map<ApiVersion, string> {
    return this.#b24TargetRestWithPath
  }

  /**
   * Returns the localization of the B24 interface
   * @return {B24LangList} - default `B24LangList.en`
   *
   * @link https://apidocs.bitrix24.com/sdk/bx24-js-sdk/additional-functions/bx24-get-lang.html
   */
  getLang(): B24LangList {
    return (this.#lang as B24LangList) || B24LangList.en
  }
}

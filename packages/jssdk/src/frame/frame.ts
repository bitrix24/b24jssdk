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

  readonly #version: ApiVersion

  constructor(
    queryParams: B24FrameQueryParams,
    version: ApiVersion = ApiVersion.v2
  ) {
    this.#version = version
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
  }

  get apiVersion(): ApiVersion {
    return this.#version
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
   * Get the account address BX24 (https://name.bitrix24.com)
   */
  getTargetOrigin(): string {
    return `${this.#protocol ? 'https' : 'http'}://${this.#domain}`
  }

  /**
   * Get the account address BX24 with path
   * - for ver1 `https://name.bitrix24.com/rest`
   * - for ver2 `https://name.bitrix24.com/rest`
   * - for ver3` https://name.bitrix24.com/rest/api`
   */
  getTargetOriginWithPath(): string {
    switch (this.apiVersion) {
      case ApiVersion.v1:
      case ApiVersion.v2:
        return `${this.getTargetOrigin()}/rest`
      case ApiVersion.v3:
      default:
        return `${this.getTargetOrigin()}/rest/api`
    }
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

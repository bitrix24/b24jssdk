import type { LoggerInterface } from '../logger'
import type { B24LangList } from '../core/language/list'
import type { AuthActions, MessageInitData, B24FrameQueryParams } from '../types/auth'
import type { RestrictionParams } from '../types/limiters'
import type { TypeB24, ApiVersion } from '../types/b24'
import { AbstractB24 } from '../core/abstract-b24'
import { HttpV1 } from '../core/http/controller-v1'
import { HttpV2 } from '../core/http/controller-v2'
import { HttpV3 } from '../core/http/controller-v3'
import { AppFrame } from './frame'
import { MessageManager, MessageCommands } from './message'
import { AuthManager } from './auth'
import { ParentManager } from './parent'
import { OptionsManager } from './options'
import { DialogManager } from './dialog'
import { SliderManager } from './slider'
import { PlacementManager } from './placement'

/**
 * B24 Manager. Replacement api.bitrix24.com
 *
 * @link https://api.bitrix24.com/api/v1/
 * @link https://bitrix24.github.io/b24jssdk/docs/frame/
 * @see /bitrix/js/rest/applayout.js
 *
 * @todo add docs
 */
export class B24Frame extends AbstractB24 implements TypeB24 {
  #isInstallMode: boolean = false
  #isFirstRun: boolean = false

  readonly #appFrame: AppFrame
  readonly #messageManager: MessageManager
  readonly #authManager: AuthManager
  readonly #parentManager: ParentManager
  readonly #optionsManager: OptionsManager
  readonly #dialogManager: DialogManager
  readonly #sliderManager: SliderManager
  readonly #placementManager: PlacementManager

  readonly #restrictionParams: undefined | Partial<RestrictionParams>

  // region Init ////
  constructor(
    queryParams: B24FrameQueryParams,
    options?: {
      restrictionParams?: Partial<RestrictionParams>
    }
  ) {
    super()

    this.#restrictionParams = options?.restrictionParams

    this.#appFrame = new AppFrame(queryParams)

    this.#messageManager = new MessageManager(this.#appFrame)
    this.#messageManager.subscribe()

    this.#authManager = new AuthManager(
      this.#appFrame,
      this.#messageManager
    )
    this.#parentManager = new ParentManager(this.#messageManager)
    this.#optionsManager = new OptionsManager(this.#messageManager)
    this.#dialogManager = new DialogManager(this.#messageManager)
    this.#sliderManager = new SliderManager(
      this.#appFrame,
      this.#messageManager
    )
    this.#placementManager = new PlacementManager(this.#messageManager)

    this._isInit = false
  }

  public override setLogger(logger: LoggerInterface): void {
    super.setLogger(logger)
    this.#messageManager.setLogger(this.getLogger())
  }

  get isFirstRun(): boolean {
    this._ensureInitialized()
    return this.#isFirstRun
  }

  get isInstallMode(): boolean {
    this._ensureInitialized()
    return this.#isInstallMode
  }

  get parent(): ParentManager {
    this._ensureInitialized()
    return this.#parentManager
  }

  override get auth(): AuthActions {
    this._ensureInitialized()
    return this.#authManager
  }

  get slider(): SliderManager {
    this._ensureInitialized()
    return this.#sliderManager
  }

  get placement(): PlacementManager {
    this._ensureInitialized()
    return this.#placementManager
  }

  get options(): OptionsManager {
    this._ensureInitialized()
    return this.#optionsManager
  }

  get dialog(): DialogManager {
    this._ensureInitialized()
    return this.#dialogManager
  }

  public override async init(): Promise<void> {
    const data: MessageInitData = await this.#messageManager.send(MessageCommands.getInitData, {})

    this.getLogger().debug('init data', { data })

    this.#appFrame.initData(data)
    this.#authManager.initData(data)
    this.#placementManager.initData(data)
    this.#optionsManager.initData(data)

    this.#isInstallMode = data.INSTALL
    this.#isFirstRun = data.FIRST_RUN

    this._httpV1 = new HttpV1(this.#authManager, this._getHttpOptions(), this.#restrictionParams)
    this._httpV2 = new HttpV2(this.#authManager, this._getHttpOptions(), this.#restrictionParams)
    this._httpV3 = new HttpV3(this.#authManager, this._getHttpOptions(), this.#restrictionParams)

    this._isInit = true

    /**
     * @memo Writes the fact of the 1st launch to `app_options`
     */
    if (this.#isFirstRun) {
      return this.#messageManager.send(MessageCommands.setInstall, { install: true })
    }

    return Promise.resolve()
  }

  /**
   * Destructor.
   * Removes an event subscription
   */
  public override destroy() {
    this.#messageManager.unsubscribe()
    super.destroy()
  }
  // endregion ////

  // region Core ////
  /**
   * Signals that the installer or application setup has finished running.
   *
   * @link https://apidocs.bitrix24.com/sdk/bx24-js-sdk/system-functions/bx24-install-finish.html
   */
  public async installFinish(): Promise<any> {
    if (!this.isInstallMode) {
      return Promise.reject(new Error('Application was previously installed. You cannot call installFinish'))
    }

    return this.#messageManager.send(MessageCommands.setInstallFinish, {})
  }
  // endregion ////

  // region Get ////
  /**
   * @inheritDoc
   */
  public override getTargetOrigin(): string {
    this._ensureInitialized()
    return this.#authManager.getTargetOrigin()
  }

  /**
   * @inheritDoc
   */
  public override getTargetOriginWithPath(): Map<ApiVersion, string> {
    this._ensureInitialized()
    return this.#authManager.getTargetOriginWithPath()
  }

  /**
   * Returns the sid of the application relative to the parent window like this `9c33468728e1d2c8c97562475edfd96`
   */
  public getAppSid(): string {
    this._ensureInitialized()
    return this.#appFrame.getAppSid()
  }

  /**
   * Returns the localization of the B24 interface
   *
   * @link https://apidocs.bitrix24.com/sdk/bx24-js-sdk/additional-functions/bx24-get-lang.html
   */
  public getLang(): B24LangList {
    this._ensureInitialized()
    return this.#appFrame.getLang()
  }
  // endregion ////
}

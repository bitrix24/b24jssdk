import type { LoggerInterface } from '../logger'
import type { TypeB24 } from '../types/b24'
import type { TypeHttp } from '../types/http'
import type { AuthActions } from '../types/auth'
import type { RestrictionParams } from '../types/limiters'
import { SdkError } from './sdk-error'
import { ApiVersion } from '../types/b24'
import { versionManager } from './version-manager'
import { LoggerFactory } from '../logger'
// Internal diagnostic — imported from the module directly so it stays off the
// package's public surface (`logger/index.ts` is re-exported from `src/index.ts`).
import { warnOnNonPromiseLogger } from '../logger/assert-logger-shape'
import { ActionsManager } from './actions/manager'
import { ToolsManager } from './tools/manager'

/**
 * Abstract base class for all SDK entry points (B24Frame, B24Hook, etc.).
 * Owns the HTTP clients for REST API v2 and v3, the actions surface via {@link ActionsManager},
 * and built-in tools via {@link ToolsManager}.
 * Concrete subclasses must implement authentication and HTTP transport initialization.
 */
export abstract class AbstractB24 implements TypeB24 {
  protected _isInit: boolean = false
  protected _httpV2: null | TypeHttp = null
  protected _httpV3: null | TypeHttp = null
  protected _logger: LoggerInterface

  protected _actionsManager: ActionsManager
  protected _toolsManager: ToolsManager

  // region Init ////
  protected constructor() {
    this._isInit = false
    this._logger = LoggerFactory.createNullLogger()

    this._actionsManager = new ActionsManager(this)
    this._toolsManager = new ToolsManager(this)
  }

  /**
   * @inheritDoc
   */
  get isInit(): boolean {
    return this._isInit
  }

  public async init(): Promise<void> {
    this._isInit = true
    return
  }

  public destroy(): void {}
  // endregion ////

  // region Core ////
  abstract get auth(): AuthActions

  get actions(): ActionsManager {
    this._ensureInitialized()
    return this._actionsManager
  }

  get tools(): ToolsManager {
    this._ensureInitialized()
    return this._toolsManager
  }

  /**
   * @inheritDoc
   */
  public abstract getTargetOrigin(): string

  /**
   * @inheritDoc
   */
  public abstract getTargetOriginWithPath(): Map<ApiVersion, string>

  // endregion ////

  // region Tools ////
  /**
   * @inheritDoc
   */
  public getHttpClient(version: ApiVersion): TypeHttp {
    this._ensureInitialized()

    switch (version) {
      case ApiVersion.v3:
        if (null === this._httpV3) {
          throw new SdkError({
            code: 'JSSDK_CORE_B24_HTTP_V3_NOT_INIT',
            description: `HttpV3 not init`,
            status: 500
          })
        }
        return this._httpV3
      case ApiVersion.v2:
        if (null === this._httpV2) {
          throw new SdkError({
            code: 'JSSDK_CORE_B24_HTTP_V2_NOT_INIT',
            description: `HttpV2 not init`,
            status: 500
          })
        }
        return this._httpV2
    }
    throw new SdkError({
      code: 'JSSDK_CORE_B24_API_WRONG',
      description: `Wrong Api Version ${version}`,
      status: 500
    })
  }

  /**
   * @inheritDoc
   */
  public setHttpClient(version: ApiVersion, client: TypeHttp): void {
    switch (version) {
      case ApiVersion.v3:
        this._httpV3 = client
        return
      case ApiVersion.v2:
        this._httpV2 = client
        return
    }
    throw new SdkError({
      code: 'JSSDK_CORE_B24_API_WRONG',
      description: `Wrong Api Version ${version}`,
      status: 500
    })
  }

  public setLogger(logger: LoggerInterface): void {
    // Checked here, at the entry point callers actually use, rather than in each
    // of the internal `setLogger` methods below — those receive `this._logger`,
    // which has already been through this. (#346)
    warnOnNonPromiseLogger(logger, 'B24 client')
    this._logger = logger

    this._actionsManager.setLogger(this._logger)
    this._toolsManager.setLogger(this._logger)

    versionManager.getAllApiVersions().forEach((version) => {
      this.getHttpClient(version).setLogger(this._logger)
    })
  }

  public getLogger(): LoggerInterface {
    return this._logger
  }

  /**
   * @inheritDoc
   */
  /**
   * Applies the parameters to every API version's client.
   *
   * `Promise.all`, not `allSettled`: a rejection here means the policy was not
   * applied, and swallowing it made the call resolve while the client kept
   * running the old configuration — or, when a malformed limiter block reached
   * a sub-limiter, while it ran on nothing at all. A caller must be able to see
   * that their policy did not take. (#479)
   *
   * All versions receive the same object, so a value read from one client is
   * written to all of them.
   */
  public async setRestrictionManagerParams(params: RestrictionParams): Promise<void> {
    const promises = versionManager.getAllApiVersions().map(version =>
      this.getHttpClient(version).setRestrictionManagerParams(params)
    )

    await Promise.all(promises)
  }

  /**
   * Returns settings for http connection
   * @protected
   */
  /**
   * Axios config handed to both transports at construction.
   *
   * `null` by default: the transports already choose sensible defaults, and an
   * entry point that takes no such option from its caller has nothing to add.
   * The entry points that do accept one assign this before building the clients.
   *
   * Whatever lands here is spread **after** the transport's own defaults, so a
   * caller wins on any key they name — including `adapter`, which is the reason
   * this channel is open to callers at all.
   */
  protected _httpOptions: null | object = null

  protected _getHttpOptions(): null | object {
    return this._httpOptions
  }

  /**
   * Generates an object not initialized error
   * @protected
   */
  protected _ensureInitialized(): void {
    if (!this._isInit) {
      throw new SdkError({
        code: 'JSSDK_CORE_B24_NOT_INIT',
        description: `B24 not initialized`,
        status: 500
      })
    }
  }
  // endregion ////
}

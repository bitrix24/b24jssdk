import type { LoggerInterface } from '../logger'
import type { AjaxResult } from './http/ajax-result'
import type { CallBatchResult, IB24BatchOptions, TypeB24 } from '../types/b24'
import type {
  BatchCommandsArrayUniversal,
  BatchCommandsObjectUniversal,
  BatchCommandsUniversal,
  BatchNamedCommandsUniversal,
  TypeCallParams,
  TypeHttp
} from '../types/http'
import type { ListPayload } from '../types/payloads'
import type { AuthActions } from '../types/auth'
import type { RestrictionParams } from '../types/limiters'
import { LoggerFactory } from '../logger'
import { Result } from './result'
import { SdkError } from './sdk-error'
import { Type } from '../tools/type'
import { ApiVersion } from '../types/b24'
import { versionManager } from './version-manager'
import { ActionsManager } from './actions/manager'
import { ToolsManager } from './tools/manager'

/**
 * @todo docs
 * @todo test all example
 */
export abstract class AbstractB24 implements TypeB24 {
  static readonly batchSize = 50

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

  /**
   * Calls the Bitrix24 REST API method.
   *
   * @deprecated This method is deprecated and will be removed in version `2.0.0`
   *   - for `restApi:v3` use {@link CallV3.make `b24.actions.v3.call.make(options)`}
   *   - for `restApi:v2` use {@link CallV2.make `b24.actions.v2.call.make(options)`}
   *
   * @removed 2.0.0
   */
  public async callMethod(method: string, params?: object, start?: number): Promise<AjaxResult> {
    LoggerFactory.forcedLog(
      this._logger,
      'warning',
      `The AbstractB24.callMethod() method is deprecated and will be removed in version 2.0.0. Use b24.actions.v3.call.make(options) or b24.actions.v2.call.make(options)`,
      {
        class: 'AbstractB24',
        method: 'callMethod',
        replacement: 'b24.actions.v3.call.make(options) | b24.actions.v2.call.make(options)',
        removalVersion: '2.0.0',
        code: 'JSSDK_CORE_DEPRECATED_METHOD'
      }
    )

    params = params || {}
    if (
      !('start' in params)
      && Number.isInteger(start)
    ) {
      (params as any).start = start
    }

    return this._innerCallMethod(
      method,
      params
    )
  }

  /**
   * @removed 2.0.0
   */
  protected async _innerCallMethod<T = unknown>(
    method: string,
    params?: TypeCallParams,
    requestId?: string
  ): Promise<AjaxResult<T>> {
    params = params || {}

    const version = versionManager.automaticallyObtainApiVersion(method)
    const client = this.getHttpClient(version)

    return client.call<T>(method, params, requestId)
  }

  /**
   * Calls a Bitrix24 REST API list method to retrieve all data.
   *
   * @deprecated This method is deprecated and will be removed in version `2.0.0`
   *   - for `restApi:v3` use {@link CallListV3.make `b24.actions.v3.callList.make(options)`}
   *   - for `restApi:v3` use {@link CallListV2.make `b24.actions.v2.callList.make(options)`}
   *
   * @removed 2.0.0
   */
  public async callListMethod(method: string, params?: object, progress?: null | ((progress: number) => void), customKeyForResult?: string | null): Promise<Result> {
    LoggerFactory.forcedLog(
      this._logger,
      'warning',
      `The AbstractB24.callListMethod() method is deprecated and will be removed in version 2.0.0. Use b24.actions.v3.callList.make(options) or b24.actions.v2.callList.make(options)`,
      {
        class: 'AbstractB24',
        method: 'callListMethod',
        replacement: 'b24.actions.v3.callList.make(options) | b24.actions.v2.callList.make(options)',
        removalVersion: '2.0.0',
        code: 'JSSDK_CORE_DEPRECATED_METHOD'
      }
    )

    const result = new Result()

    if (Type.isFunction(progress) && null !== progress) {
      progress(0)
    }

    const sendParams: TypeCallParams = {
      ...params,
      start: 0
    }
    return this.actions.v2.call.make({
      method,
      params: sendParams
    }).then(async (response) => {
      let list: any[] = []

      let resultData
      if (customKeyForResult) {
        resultData = (response.getData() as ListPayload<any>).result[customKeyForResult] as []
      } else {
        resultData = (response.getData() as ListPayload<any>).result as []
      }

      list = [...list, ...resultData]
      if (response.isMore()) {
        let responseLoop: false | AjaxResult = response
        while (true) {
          responseLoop = await responseLoop.getNext(this.getHttpClient(ApiVersion.v2))

          if (responseLoop === false) {
            break
          }

          let resultData = undefined
          if (customKeyForResult) {
            resultData = (responseLoop.getData() as ListPayload<any>).result[customKeyForResult] as []
          } else {
            resultData = (responseLoop.getData() as ListPayload<any>).result as []
          }

          list = [...list, ...resultData]

          if (progress) {
            const total = responseLoop.getTotal()
            progress(total > 0 ? Math.round((100 * list.length) / total) : 100)
          }
        }
      }

      result.setData(list)
      if (progress) {
        progress(100)
      }

      return result
    })
  }

  /**
   * Calls a Bitrix24 REST API list method and returns an async generator.
   *
   * @deprecated This method is deprecated and will be removed in version `2.0.0`
   *   - for `restApi:v3` use {@link FetchListV3.make `b24.actions.v3.fetchList.make(options)`}
   *   - for `restApi:v3` use {@link FetchListV2.make `b24.actions.v2.fetchList.make(options)`}
   *
   * @removed 2.0.0
   */
  public async* fetchListMethod(method: string, params?: any, idKey?: string, customKeyForResult?: string | null): AsyncGenerator<any[]> {
    LoggerFactory.forcedLog(
      this._logger,
      'warning',
      `The AbstractB24.fetchListMethod() method is deprecated and will be removed in version 2.0.0. Use b24.actions.v3.fetchList.make(options) or b24.actions.v2.fetchList.make(options)`,
      {
        class: 'AbstractB24',
        method: 'fetchListMethod',
        replacement: 'b24.actions.v3.fetchList.make(options) | b24.actions.v2.fetchList.make(options)',
        removalVersion: '2.0.0',
        code: 'JSSDK_CORE_DEPRECATED_METHOD'
      }
    )

    return this.actions.v2.fetchList.make({
      method,
      params,
      idKey,
      customKeyForResult: customKeyForResult === null ? undefined : customKeyForResult
    })
  }

  /**
   * Executes a batch request to the Bitrix24 REST API
   *
   * @deprecated This method is deprecated and will be removed in version `2.0.0`
   *   - for `restApi:v3` use {@link BatchV3.make `b24.actions.v3.batch.make(options)`}
   *   - for `restApi:v3` use {@link BatchV2.make `b24.actions.v2.batch.make(options)`}
   *
   * @removed 2.0.0
   */
  public async callBatch(calls: Array<any> | object, isHaltOnError?: boolean, returnAjaxResult?: boolean): Promise<Result> {
    const callsTyped = calls as BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal

    const apiVersion = versionManager.automaticallyObtainApiVersionForBatch(callsTyped)

    if (apiVersion === ApiVersion.v3) {
      return this.actions.v3.batch.make({
        calls: callsTyped,
        options: {
          isHaltOnError: isHaltOnError ?? true,
          returnAjaxResult: returnAjaxResult ?? false
        }
      })
    }

    return this.actions.v2.batch.make({
      calls: callsTyped,
      options: {
        isHaltOnError: isHaltOnError ?? true,
        returnAjaxResult: returnAjaxResult ?? false
      }
    })
  }

  /**
   * Executes a batch request to the Bitrix24 REST API with automatic chunking for any number of commands.
   *
   * @deprecated This method is deprecated and will be removed in version `2.0.0`
   *   - for `restApi:v3` use {@link BatchByChunkV3.make `b24.actions.v3.batchByChunk.make(options)`}
   *   - for `restApi:v3` use {@link BatchByChunkV2.make `b24.actions.v2.batchByChunk.make(options)`}
   *
   * @removed 2.0.0
   *
   * @todo ! fix this
   */
  public async callBatchByChunk(calls: Array<any>, isHaltOnError: boolean): Promise<Result> {
    const options = this._normalizeBatchOptions(optionsOrIsHaltOnError)
    options.returnAjaxResult = false
    options.apiVersion = options.apiVersion ?? versionManager.automaticallyObtainApiVersionForBatch(calls)

    const result = new Result<T[]>()

    const dataResult: T[] = []
    const chunks = this.chunkArray(calls as BatchCommandsUniversal, AbstractB24.batchSize) as BatchCommandsArrayUniversal[] | BatchCommandsObjectUniversal[]

    for (const chunkRequest of chunks) {
      const response = await this.getHttpClient(options.apiVersion).batch<T[]>(chunkRequest, options)
      if (!response.isSuccess) {
        this.getLogger().error('callBatchByChunk', {
          messages: response.getErrorMessages(),
          calls,
          options
        })
        this._addBatchErrorsIfAny(response, result)
      }

      for (const [_index, data] of response.getData()!.result!) {
        // @memo Add only success rows
        if (data.isSuccess) {
          dataResult.push(data.getData()!.result)
        }
      }
    }

    return result.setData(dataResult)
  }
  // endregion ////

  // region Tools ////
  /**
   * @inheritDoc
   *
   * @todo fix docs
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
   *
   * @todo fix docs
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
   *
   * @todo fix docs
   */
  public async setRestrictionManagerParams(params: RestrictionParams): Promise<void> {
    const promises = versionManager.getAllApiVersions().map(version =>
      this.getHttpClient(version).setRestrictionManagerParams(params)
    )

    await Promise.allSettled(promises)
  }

  /**
   * Returns settings for http connection
   * @protected
   */
  protected _getHttpOptions(): null | object {
    return null
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

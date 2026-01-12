import type {
  BatchCommandsArrayUniversal, BatchCommandsObjectUniversal,
  BatchCommandV3,
  BatchNamedCommandsUniversal,
  ICallBatchOptions,
  ICallBatchResult,
  TypeHttp
} from '../../types/http'
import type { AuthActions } from '../../types/auth'
import type { RestrictionParams } from '../../types/limiters'
import type { BatchResponseData } from './abstract-http'
import type { BatchPayload, BatchPayloadResult, PayloadTime } from '../../types/payloads'
import { AbstractHttp } from './abstract-http'
import { ApiVersion } from '../../types/b24'
import { AjaxResult } from './ajax-result'
import { Result } from '../result'
import { AjaxError } from './ajax-error'

/**
 * Class for working with RestApi v3 requests via http
 *
 * @link https://bitrix24.github.io/b24jssdk/
 * @link https://apidocs.bitrix24.com/api-reference/rest-v3/index.html
 *
 * @todo docs
 */
export class HttpV3 extends AbstractHttp implements TypeHttp {
  constructor(
    authActions: AuthActions,
    options?: null | object,
    restrictionParams?: Partial<RestrictionParams>
  ) {
    super(authActions, options, restrictionParams)
    this._version = ApiVersion.v3
  }

  protected override async _batchAsObject<T = unknown>(
    requestId: string,
    calls: BatchNamedCommandsUniversal,
    _options: ICallBatchOptions
  ): Promise<Result<ICallBatchResult<T>>> {
    throw new AjaxError({
      code: 'JSSDK_REST_V3_BATCH_FROM_OBJECT',
      description: `Working with the BatchNamedCommandsUniversal is not supported.`,
      status: 500,
      requestInfo: { method: 'batch', params: { cmd: calls }, requestId },
      originalError: null
    })

    // const cmd = this._prepareBatchCommandsObjectV3(calls)
    // if (Object.keys(cmd).length === 0) {
    //   return Promise.resolve(new Result())
    // }
    //
    // // @todo ! api ver3 `params.halt` - waite docs
    // const response = await this.call<BatchPayload<T>>(
    //   'batch',
    //   cmd,
    //   requestId
    // )
    //
    // const opts = {
    //   isHaltOnError: !!options.isHaltOnError,
    //   requestId,
    //   isObjectMode: true
    // }
    //
    // return this._processBatchResponseV3<T>(cmd, response, opts)
  }

  protected _prepareBatchCommandsObjectV3(calls: BatchNamedCommandsUniversal): Record<string, BatchCommandV3> {
    const cmd: Record<string, BatchCommandV3> = {}

    Object.entries(calls).forEach(([index, row]) => {
      const command = this._parseBatchRow(row)
      if (command) {
        cmd[index] = this._buildBatchCommandStringV3(command)
      }
    })

    return cmd
  }

  protected override async _batchAsArray<T = unknown>(
    requestId: string,
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal,
    options: ICallBatchOptions
  ): Promise<Result<ICallBatchResult<T>>> {
    const cmd = this._prepareBatchCommandsArrayV3(calls)
    if (cmd.length === 0) {
      return Promise.resolve(new Result())
    }

    // @todo ! api ver3 `params.halt` - waite docs
    const response = await this.call<BatchPayload<T>>(
      'batch',
      cmd,
      requestId
    )

    const opts = {
      isHaltOnError: !!options.isHaltOnError,
      requestId,
      isObjectMode: false
    }

    return this._processBatchResponseV3<T>(cmd, response, opts)
  }

  protected _prepareBatchCommandsArrayV3(calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal): BatchCommandV3[] {
    const cmd: BatchCommandV3[] = []

    calls.forEach((row) => {
      const command = this._parseBatchRow(row)
      if (command) {
        cmd.push(this._buildBatchCommandStringV3(command))
      }
    })

    return cmd
  }

  // @todo ! api ver3 waite docs
  protected _buildBatchCommandStringV3(command: BatchCommandV3): BatchCommandV3 {
    return {
      method: command.method,
      query: command.query || {}
    }
  }

  /**
   * The main method for processing the batch response
   */
  protected async _processBatchResponseV3<T>(
    cmd: Record<string, BatchCommandV3> | BatchCommandV3[],
    response: AjaxResult<BatchPayload<T>>,
    options: Required<ICallBatchOptions> & { isObjectMode: boolean }
  ): Promise<Result<ICallBatchResult<T>>> {
    const responseData = response.getData()

    const responseResult = responseData.result
    const responseTime = responseData.time

    const responseHelper = {
      requestId: response.getQuery().requestId,
      status: response.getStatus(),
      time: responseTime
    }

    const results = await this._processBatchItemsV3<T>(cmd, responseHelper, responseResult)

    return this._handleBatchResults<T>(results, responseTime, options)
  }

  /**
   * Processing batch elements
   */
  protected async _processBatchItemsV3<T>(
    cmd: Record<string, BatchCommandV3> | BatchCommandV3[],
    responseHelper: { requestId: string, status: number, time: PayloadTime },
    responseResult: BatchPayloadResult<T>
  ): Promise<Map<string | number, AjaxResult<T>>> {
    const results = new Map<string | number, AjaxResult<T>>()

    // Processing all commands
    const entries = Array.isArray(cmd)
      ? cmd.entries()
      : Object.entries(cmd)

    for (const [index, row] of entries) {
      await this._processBatchItemV3<T>(row, index, responseHelper, responseResult as BatchResponseData<T>, results)
    }

    return results
  }

  /**
   * Process each response element
   *
   * @todo ! api ver3
   */
  protected async _processBatchItemV3<T>(
    row: BatchCommandV3,
    index: string | number,
    responseHelper: { requestId: string, status: number, time: PayloadTime },
    responseResult: BatchResponseData<T>,
    results: Map<string | number, AjaxResult<T>>
  ): Promise<void> {
    const resultData = this._getBatchResultByIndex((responseResult as T[] | Record<string | number, T> | undefined), index)
    const result = new AjaxResult<T>({
      answer: {
        result: (resultData ?? {}) as T,
        // @todo ! api ver3 waite docs - this fake
        time: responseHelper.time
      },
      query: {
        method: row.method,
        params: row.query!,
        requestId: responseHelper.requestId
      },
      status: responseHelper.status
    })
    results.set(index, result)
    return
  }
}

import type { GetCommandsOptions, IProcessingStrategy } from '../interface-strategy'
import type {
  BatchCommandsArrayUniversal,
  BatchCommandsObjectUniversal,
  BatchCommandV3, ICallBatchResult
} from '../../../../../types/http'
import type { Result } from '../../../../result'
import type { AjaxError } from '../../../../http/ajax-error'
import { AbstractProcessingV2 } from './abstract-processing'
import { ParseRow } from '../../parse-row'

export class ProcessingAsArrayV2 extends AbstractProcessingV2 implements IProcessingStrategy {
  public prepareCommands(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal,
    options: GetCommandsOptions
  ): BatchCommandV3[] {
    const result: BatchCommandV3[] = []
    calls.forEach((row) => {
      const command = ParseRow.getBatchCommand(row, options)
      result.push(command)
    })

    return result
  }

  protected _processResponseError<T>(
    result: Result<ICallBatchResult<T>>,
    ajaxError: AjaxError,
    _index: string
  ): void {
    result.addError(ajaxError)
  }
}

import type { GetCommandsOptions, IProcessingStrategy } from '../interface-strategy'
import type {
  BatchCommandV3, BatchNamedCommandsUniversal, ICallBatchResult
} from '../../../../../types/http'
import type { Result } from '../../../../result'
import type { AjaxError } from '../../../../http/ajax-error'
import { AbstractProcessingV3 } from './abstract-processing'
import { ParseRow } from '../../parse-row'

export class ProcessingAsObjectV3 extends AbstractProcessingV3 implements IProcessingStrategy {
  public prepareCommands(
    calls: BatchNamedCommandsUniversal,
    options: GetCommandsOptions
  ): BatchCommandV3[] {
    const result: BatchCommandV3[] = []
    Object.entries(calls).forEach(([index, row]) => {
      const command = ParseRow.getBatchCommand(row, { ...options, asDefaultValue: index })
      result.push(command)
    })

    return result
  }

  protected _processResponseError<T>(
    result: Result<ICallBatchResult<T>>,
    ajaxError: AjaxError,
    index: string
  ): void {
    result.addError(ajaxError, index)
  }
}

import type {
  BatchCommandsArrayUniversal,
  BatchCommandsObjectUniversal,
  BatchCommandV3, BatchNamedCommandsUniversal,
  CommandObject,
  CommandTuple
} from '../../../types/http'
import { SdkError } from '../../sdk-error'

/**
 * Class for formatting/parsing a set of Batch commands
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class ParseRow {
  public static getBatchCommand(
    row: CommandObject | CommandTuple,
    options: {
      parallelDefaultValue: boolean
      asDefaultValue?: string
    }
  ): BatchCommandV3 {
    if (row) {
      if (typeof row === 'object' && 'method' in row && typeof row.method === 'string') {
        return {
          method: row.method,
          query: row.params,
          as: row.as ?? options.asDefaultValue,
          parallel: row.parallel ?? options.parallelDefaultValue
        }
      }

      if (Array.isArray(row) && row.length > 0 && typeof row[0] === 'string') {
        return {
          method: row[0],
          query: row[1],
          as: options.asDefaultValue,
          parallel: options.parallelDefaultValue
        }
      }
    }

    throw new SdkError({
      code: 'JSSDK_INTERACTION_BATCH_ROW_FAIL',
      description: `There were difficulties parsing the command for batch.\n${JSON.stringify({
        row, options
      })}`,
      status: 500
    })
  }

  public static getMethodsFromCommands(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal
  ): string[] {
    const result: string[] = []
    const optsFake = {
      parallelDefaultValue: false
    }

    if (Array.isArray(calls)) {
      calls.forEach((row) => {
        const command = ParseRow.getBatchCommand(row, optsFake)
        result.push(command.method)
      })
    } else {
      Object.entries(calls).forEach(([index, row]) => {
        const command = ParseRow.getBatchCommand(row, { ...optsFake, asDefaultValue: index })
        result.push(command.method)
      })
    }

    return result
  }
}

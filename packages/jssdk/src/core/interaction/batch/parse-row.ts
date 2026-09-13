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
          // `?? {}` because `params` is optional on both command shapes while
          // `query` is not optional to the portal: it reads every top-level entry
          // of a v3 batch body as a command and rejects the WHOLE batch with
          // `INVALIDSELECTEXCEPTION` when one of them has no `query` — measured,
          // and one bad entry is enough to take the others down with it.
          // `JSON.stringify` drops an `undefined` value, so leaving it undefined
          // is not "sending an empty query", it is sending no key at all.
          query: row.params ?? {},
          as: row.as ?? options.asDefaultValue,
          parallel: row.parallel ?? options.parallelDefaultValue
        }
      }

      if (Array.isArray(row) && row.length > 0 && typeof row[0] === 'string') {
        return {
          method: row[0],
          // Same reason as above — `['rest.scope.list']` is a valid tuple.
          query: row[1] ?? {},
          as: options.asDefaultValue,
          parallel: options.parallelDefaultValue
        }
      }
    }

    // Neither half is serialised whole: an `SdkError` description is NOT run
    // through `redactSensitiveParams` (AGENTS.md), so whatever lands here
    // travels into logs and failure reports unscrubbed.
    //
    // `options` is named field by field — an earlier revision of this change put
    // the caller's `logger` in there and proved the hazard is not hypothetical.
    // `row` is the caller's own command, and this path is reached by exactly the
    // mistake that carries arguments: a mistyped `method` beside a populated
    // `params`, whose values are business data and, measured, can be an `auth`
    // token. Only its shape is described — the key names, and the method if it
    // is a string — which is what a reader needs to find the bad command.
    // `getters` and a `toJSON` on the row are never invoked.
    const { parallelDefaultValue, asDefaultValue } = options
    const rowShape = (row && 'object' === typeof row)
      ? {
          keys: Object.keys(row).join(', '),
          ...(Array.isArray(row)
            ? { length: row.length }
            : { method: 'string' === typeof (row as { method?: unknown }).method ? (row as { method: string }).method : undefined })
        }
      : { type: typeof row }

    throw new SdkError({
      code: 'JSSDK_INTERACTION_BATCH_ROW_FAIL',
      description: `There were difficulties parsing the command for batch.\n${JSON.stringify({
        row: rowShape, options: { parallelDefaultValue, asDefaultValue }
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

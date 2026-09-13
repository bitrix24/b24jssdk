import type {
  BatchCommandsArrayUniversal,
  BatchCommandsObjectUniversal,
  BatchCommandV3, BatchNamedCommandsUniversal,
  CommandObject,
  CommandTuple
} from '../../../types/http'
import type { LoggerInterface } from '../../../types/logger'
import { SdkError } from '../../sdk-error'
import { LoggerFactory } from '../../../logger'

/**
 * The keys `getBatchCommand` reads off a command object. Anything else a caller
 * put there is ignored, and the one that matters is `query`: it is the name the
 * portal's own reference uses for a command's arguments, so a caller reading
 * that reference — or translating a `curl` example — reaches for it naturally.
 */
const READ_COMMAND_KEYS: readonly string[] = ['method', 'params', 'as', 'parallel']

/**
 * Class for formatting/parsing a set of Batch commands
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class ParseRow {
  /**
   * Warns when a command object carries a key this parser does not read.
   *
   * `query` is the reason it exists. The portal's reference calls a command's
   * arguments `query`, and so does every `curl` example; the SDK's own key is
   * `params`, and it does the translation. Write `query` and the command runs with no arguments at all: the portal accepts it — the SDK
   * sends `query: {}`, which satisfies the per-item rule — and answers with
   * whatever the method returns by default. Measured on `main.eventlog.list`:
   * `params: { select: ['id'], pagination: { limit: 2 } }` returns two rows of
   * one field; the same spelled `query` returns full records at the default page
   * size, HTTP 200, no error anywhere.
   *
   * So there is nothing to notice: no error, no empty result, just more data
   * than was asked for. A filter written that way is a wrong answer, not a
   * failure.
   *
   * TypeScript catches a fresh object literal and nothing more: assign the same
   * literal to a variable first, or build the commands from a config object, a
   * `JSON.parse`, or plain JavaScript, and the compiler never sees it. Same hole
   * `_warnMisplacedOptions` was written for (#426).
   *
   * Warn rather than throw, for the same reason as #426: the call still does
   * something, and breaking a running integration over a misplaced key is the
   * worse outcome. Through `forcedLog`, because the default logger is silent and
   * a caller who has not wired one up is exactly the caller this is for (#483).
   */
  protected static _warnUnreadCommandKeys(row: object, logger?: LoggerInterface): void {
    const unread = Object.keys(row).filter(key => !READ_COMMAND_KEYS.includes(key))

    if (0 === unread.length) {
      return
    }

    LoggerFactory.forcedLog(
      logger ?? LoggerFactory.createNullLogger(),
      'warning',
      `[b24jssdk] batch command: ${unread.join(', ')} `
      + `${1 === unread.length ? 'is' : 'are'} ignored — `
      + 'a command\'s arguments go in `params`, which the SDK sends to the portal as `query`. '
      + `Write \`params: { … }\`.`,
      { unread: unread.join(', '), read: READ_COMMAND_KEYS.join(', ') }
    ).catch(() => {})
  }

  public static getBatchCommand(
    row: CommandObject | CommandTuple,
    options: {
      parallelDefaultValue: boolean
      asDefaultValue?: string
      logger?: LoggerInterface
    }
  ): BatchCommandV3 {
    if (row) {
      if (typeof row === 'object' && 'method' in row && typeof row.method === 'string') {
        ParseRow._warnUnreadCommandKeys(row, options.logger)

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

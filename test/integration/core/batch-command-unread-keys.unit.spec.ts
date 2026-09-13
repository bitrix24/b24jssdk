/**
 * #461 — a v3 batch command whose arguments are spelled `query` goes out with
 * an empty body, and nothing says so.
 *
 * `query` is not a typo a caller invents. It is the name the portal's own
 * reference uses for a command's arguments, and the name in every `curl`
 * example; the SDK's key is `params`, and it translates one to the other on the
 * wire. Write `query` and `ParseRow` reads no arguments at all, so the command
 * goes out with `query: {}` — which the portal accepts. Measured live on
 * `main.eventlog.list`: `params: { select: ['id'], pagination: { limit: 2 } }`
 * returns two rows of one field, the same spelled `query` returns full records
 * at the default page size, HTTP 200, no error anywhere. There is nothing to
 * notice — a filter written that way is a wrong answer, not a failure.
 *
 * TypeScript catches a fresh object literal and nothing else: assign the same
 * literal to a variable first, build the commands from a config object, a
 * `JSON.parse`, or plain JavaScript, and the compiler never sees it. The same
 * hole `_warnMisplacedOptions` was written for (#426) — and the same trade: warn
 * rather than throw, because the call still does something and breaking a
 * running integration over a misplaced key is the worse outcome.
 *
 * The compile-time half is pinned in `action-options.types.spec.ts`.
 *
 * `*.unit.spec.ts` — no portal required.
 */
import { describe, it, expect, vi } from 'vitest'
import { ApiVersion, B24Hook } from '../../../packages/jssdk/src/'
import { ParseRow } from '../../../packages/jssdk/src/core/interaction/batch/parse-row'
import { InteractionBatchV3 } from '../../../packages/jssdk/src/core/interaction/batch/v3'
import { ProcessingAsArrayV3 } from '../../../packages/jssdk/src/core/interaction/batch/processing/v3/as-array'
import { ProcessingAsObjectV3 } from '../../../packages/jssdk/src/core/interaction/batch/processing/v3/as-object'
import { RestrictionManager } from '../../../packages/jssdk/src/core/http/limiters/manager'
import { ParamsFactory } from '../../../packages/jssdk/src/core/http/limiters/params-factory'
import { LoggerFactory } from '../../../packages/jssdk/src/logger'
import type { LoggerInterface } from '../../../packages/jssdk/src/types/logger'

/**
 * The calls to `forcedLog`, snapshotted rather than handed out live: restoring a
 * spy swaps in a fresh array, and an assertion made after `restore()` would then
 * be reading whichever array Vitest happened to leave behind.
 */
function captureWarnings(): { calls: () => unknown[][], restore: () => void } {
  const spy = vi.spyOn(LoggerFactory, 'forcedLog').mockResolvedValue(undefined)
  let snapshot: unknown[][] = []
  return {
    calls: () => snapshot,
    restore: () => {
      snapshot = [...spy.mock.calls] as unknown[][]
      spy.mockRestore()
    }
  }
}

/** A batch built without a transport, so the check can be driven directly. */
function addCommands(calls: unknown, logger?: LoggerInterface): void {
  const batch = new InteractionBatchV3({
    requestId: 'req-461',
    parallelDefaultValue: false,
    restrictionManager: new RestrictionManager(ParamsFactory.getDefault()),
    processingStrategy: Array.isArray(calls) ? new ProcessingAsArrayV3() : new ProcessingAsObjectV3(),
    logger
  })

  batch.addCommands(calls as never)
}

describe('a batch command key the parser does not read (#461)', () => {
  it('warns, naming the key and where the arguments belong', () => {
    const { calls, restore } = captureWarnings()

    addCommands([{ method: 'main.eventlog.list', as: 'first', query: { select: ['id'] } }])

    restore()

    expect(calls()).toHaveLength(1)
    const [, level, message, context] = calls()[0]!
    expect(level).toBe('warning')
    // The context, not the message text: `query` and `params` both appear in the
    // static half of the message, so asserting on those words there passes even
    // when the key list is dropped.
    // The whole context, not one field: `read` is what a reader compares their
    // own command against, and nothing else would notice it drifting from
    // `READ_COMMAND_KEYS`.
    expect(context).toEqual({
      code: 'JSSDK_BATCH_UNREAD_COMMAND_KEY',
      unread: 'query',
      read: 'method, params, as, parallel',
      commands: '0'
    })
    expect(String(message)).toContain('params')

    // And the command still goes out — warned, not refused. The arguments are
    // gone, which is the whole point of saying something.
    const command = ParseRow.getBatchCommand(
      { method: 'main.eventlog.list', as: 'first', query: { select: ['id'] } } as never,
      { parallelDefaultValue: false }
    )
    expect(command.method).toBe('main.eventlog.list')
    expect(command.query).toEqual({})
  })

  // One warning per call, not one per command: 50 commands built from the same
  // bad template used to mean 50 identical console lines, and again for every
  // `batchByChunk` chunk. The keys are collected across the batch and reported
  // together, with the positions that carried them.
  it('warns once for a whole batch, naming the positions', () => {
    const { calls, restore } = captureWarnings()

    addCommands([
      { method: 'a.method', query: { x: 1 } },
      { method: 'b.method', params: {} },
      { method: 'c.method', query: { y: 2 } }
    ])

    restore()

    expect(calls()).toHaveLength(1)
    expect(String((calls()[0]?.[3] as { commands?: string })?.commands)).toBe('0, 2')
  })

  // The named-commands form is a different strategy, and a cut wire there used
  // to leave the whole suite green.
  it('warns for the named-commands form too', () => {
    const { calls, restore } = captureWarnings()

    addCommands({ first: { method: 'user.get', query: { filter: {} } } })

    restore()

    expect(calls()).toHaveLength(1)
    expect(String((calls()[0]?.[3] as { commands?: string })?.commands)).toBe('first')
  })

  // A caller's own key beside populated `params` has lost nothing — warning
  // there, on every command of every batch, would be noise, and the advice
  // ("move it into `params`") would be wrong for them.
  it('stays silent for a caller\'s own key beside populated params', () => {
    const { calls, restore } = captureWarnings()

    addCommands([{ method: 'user.get', params: { filter: {} }, id: 7, label: 'mine' }])

    restore()

    expect(calls()).toHaveLength(0)
  })

  // …but `query` is never right, even beside `params`: it is the wire name, and
  // whatever the caller put there is ignored.
  it('warns for `query` even when params is present', () => {
    const { calls, restore } = captureWarnings()

    addCommands([{ method: 'user.get', params: { filter: {} }, query: { filter: { ACTIVE: true } } }])

    restore()

    expect((calls()[0]?.[3] as { unread?: string })?.unread).toBe('query')
  })

  it('names every unread key, not just `query`', () => {
    const { calls, restore } = captureWarnings()

    addCommands([{ method: 'rest.scope.list', parms: { a: 1 }, halt: true }])

    restore()

    const message = String(calls()[0]?.[2])
    expect(message).toContain('parms')
    expect(message).toContain('halt')
  })

  it('stays silent for the documented form', () => {
    const { calls, restore } = captureWarnings()

    addCommands([{ method: 'main.eventlog.list', params: { select: ['id'] }, as: 'first', parallel: true }])

    restore()

    expect(calls()).toHaveLength(0)
  })

  // An argument-less command is the documented form too — `query: {}` is what
  // the portal requires on every item, and the SDK supplies it.
  it('stays silent for a command with no arguments', () => {
    const { calls, restore } = captureWarnings()

    addCommands([{ method: 'rest.scope.list' }, ['rest.scope.list']])

    restore()

    const fromObject = ParseRow.getBatchCommand({ method: 'rest.scope.list' }, { parallelDefaultValue: false })
    const fromTuple = ParseRow.getBatchCommand(['rest.scope.list'], { parallelDefaultValue: false })

    expect(calls()).toHaveLength(0)
    expect(fromObject.query).toEqual({})
    expect(fromTuple.query).toEqual({})
  })

  // The check is only as useful as the wiring: the warning has to reach a real
  // batch call, which means the transport's logger has to travel through the
  // interaction batch and its strategy into the parser. Nothing else in the
  // suite would notice that plumbing coming apart.
  it('reaches a real batch call, on both API versions', async () => {
    for (const version of [ApiVersion.v2, ApiVersion.v3]) {
      const b24 = B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/secret/')
      const client = b24.getHttpClient(version)
      vi.spyOn(client.ajaxClient, 'post').mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as never,
        data: { result: [{ items: [] }], time: {} }
      } as never)

      // A logger of this client's own, so the assertion below can tell the
      // transport's logger from the null logger `ParseRow` falls back to —
      // without it, cutting the plumbing at any point still "passes", because
      // the warning is emitted either way, just into nothing.
      const logger = LoggerFactory.createNullLogger()
      client.setLogger(logger)

      const { calls, restore } = captureWarnings()

      await client.batch([{ method: 'user.get', query: { filter: {} } }] as never).catch(() => {})

      restore()
      b24.destroy()
      vi.restoreAllMocks()

      expect((calls()[0]?.[3] as { unread?: string })?.unread, `on ${version}`).toBe('query')
      expect(calls()[0]?.[0], `logger reached the check on ${version}`).toBe(logger)
    }
  })

  // The parse failure carries the options into its description, and the options
  // now carry the caller's logger. An `SdkError` description is not run through
  // `redactSensitiveParams`, and a `LoggerInterface` is the app's own object —
  // a sink wrapping a DSN, an ingest URL or a bearer token would dump its
  // internals into a message that travels into logs and failure reports.
  it('names only the two known options in the parse-failure description', () => {
    const error = (() => {
      try {
        ParseRow.getBatchCommand({ notAMethod: 1 } as never, {
          parallelDefaultValue: false,
          // Not part of the type — the point is what a *future* key would do if
          // it were added and serialised along with the rest.
          ...{ secretish: 'https://SECRET@ingest.example/42' }
        })
        return null
      } catch (e: unknown) {
        return e as Error & { code?: string }
      }
    })()

    expect(error?.code).toBe('JSSDK_INTERACTION_BATCH_ROW_FAIL')
    expect(error?.message).not.toContain('SECRET')
    expect(error?.message).not.toContain('ingest.example')
  })

  // A self-referential value in the options would make `JSON.stringify` throw a
  // `TypeError` in place of the SdkError — the caller then sees a crash instead
  // of the parse failure that actually happened.
  it('survives a self-referential option value', () => {
    const circular: Record<string, unknown> = {}
    circular['self'] = circular

    const error = (() => {
      try {
        ParseRow.getBatchCommand({ notAMethod: 1 } as never, {
          parallelDefaultValue: false,
          ...{ circular }
        })
        return null
      } catch (e: unknown) {
        return e as { code?: string }
      }
    })()

    expect(error?.code).toBe('JSSDK_INTERACTION_BATCH_ROW_FAIL')
  })
})

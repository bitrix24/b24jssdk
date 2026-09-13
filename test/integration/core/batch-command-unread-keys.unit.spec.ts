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
import { LoggerFactory } from '../../../packages/jssdk/src/logger'

function captureWarnings(): { calls: unknown[][], restore: () => void } {
  const spy = vi.spyOn(LoggerFactory, 'forcedLog').mockResolvedValue(undefined)
  return { calls: spy.mock.calls as unknown[][], restore: () => spy.mockRestore() }
}

describe('a batch command key the parser does not read (#461)', () => {
  it('warns, naming the key and where the arguments belong', () => {
    const { calls, restore } = captureWarnings()

    const command = ParseRow.getBatchCommand(
      { method: 'main.eventlog.list', as: 'first', query: { select: ['id'] } } as never,
      { parallelDefaultValue: false }
    )

    restore()

    expect(calls).toHaveLength(1)
    const [, level, message] = calls[0]!
    expect(level).toBe('warning')
    expect(String(message)).toContain('query')
    expect(String(message)).toContain('params')

    // And the command still goes out — warned, not refused. The arguments are
    // gone, which is the whole point of saying something.
    expect(command.method).toBe('main.eventlog.list')
    expect(command.query).toEqual({})
  })

  it('names every unread key, not just `query`', () => {
    const { calls, restore } = captureWarnings()

    ParseRow.getBatchCommand(
      { method: 'rest.scope.list', parms: { a: 1 }, halt: true } as never,
      { parallelDefaultValue: false }
    )

    restore()

    const message = String(calls[0]?.[2])
    expect(message).toContain('parms')
    expect(message).toContain('halt')
  })

  it('stays silent for the documented form', () => {
    const { calls, restore } = captureWarnings()

    ParseRow.getBatchCommand(
      { method: 'main.eventlog.list', params: { select: ['id'] }, as: 'first', parallel: true },
      { parallelDefaultValue: false }
    )

    restore()

    expect(calls).toHaveLength(0)
  })

  // An argument-less command is the documented form too — `query: {}` is what
  // the portal requires on every item, and the SDK supplies it.
  it('stays silent for a command with no arguments', () => {
    const { calls, restore } = captureWarnings()

    const fromObject = ParseRow.getBatchCommand({ method: 'rest.scope.list' }, { parallelDefaultValue: false })
    const fromTuple = ParseRow.getBatchCommand(['rest.scope.list'], { parallelDefaultValue: false })

    restore()

    expect(calls).toHaveLength(0)
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

      expect(String(calls[0]?.[2]), `on ${version}`).toContain('query')
      expect(calls[0]?.[0], `logger reached the parser on ${version}`).toBe(logger)
    }
  })
})

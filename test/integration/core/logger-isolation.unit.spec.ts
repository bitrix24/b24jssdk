/**
 * #346 — a failure inside logging must not reach the operation being logged.
 *
 * `Logger.log()` is `async`, and every callsite in the SDK invokes it as a bare
 * statement (`this.getLogger().info(…)`) without `await`. A rejected promise
 * there is an *unhandled rejection*, which terminates the Node process by
 * default (`--unhandled-rejections=throw`, the default since Node 15). Handlers
 * do real I/O — Telegram, streams, third-party adapters — so rejection is an
 * ordinary operational event, not a hypothetical: an unreachable endpoint or an
 * `EPIPE` on a closed stream would have taken the process down.
 *
 * `log()` now isolates each processor and handler: a failure is skipped and
 * reported to `console.warn`, and the remaining handlers still receive the
 * record.
 *
 * Pure logic — no portal — so this runs in the jsSdk:unit project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Logger } from '../../../packages/jssdk/src/logger/logger'
import { warnOnNonPromiseLogger } from '../../../packages/jssdk/src/logger/assert-logger-shape'
import { LogLevel } from '../../../packages/jssdk/src/types/logger'
import type { Formatter, Handler, LogRecord, LoggerInterface } from '../../../packages/jssdk/src/types/logger'

/**
 * Minimal Handler. `behaviour` decides how this one fails (or doesn't); every
 * record it accepts is recorded so we can assert what still got through.
 */
class TestHandler implements Handler {
  public readonly received: LogRecord[] = []

  constructor(
    private readonly behaviour: 'ok' | 'reject' | 'throw' | 'throwIsHandling' | 'throwShouldBubble' = 'ok',
    private readonly bubble: boolean = true
  ) {}

  async handle(record: LogRecord): Promise<boolean> {
    if (this.behaviour === 'throw') {
      // Synchronous throw, before the returned promise exists.
      throw new Error('handler exploded synchronously')
    }
    if (this.behaviour === 'reject') {
      // The realistic shape: I/O that fails.
      return Promise.reject(new Error('ECONNREFUSED: telegram unreachable'))
    }
    this.received.push(record)
    return true
  }

  isHandling(): boolean {
    if (this.behaviour === 'throwIsHandling') {
      throw new Error('isHandling exploded')
    }
    return true
  }

  shouldBubble(): boolean {
    if (this.behaviour === 'throwShouldBubble') {
      throw new Error('shouldBubble exploded')
    }
    return this.bubble
  }

  setFormatter(_formatter: Formatter): void {}

  getFormatter(): Formatter | null {
    return null
  }
}

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warnSpy.mockRestore()
})

describe('#346 a failing handler cannot escape Logger.log()', () => {
  it('does not reject when a handler rejects', async () => {
    const logger = Logger.create('test').pushHandler(new TestHandler('reject'))

    // The assertion that matters: an unawaited call here would otherwise be an
    // unhandled rejection, and the default Node policy turns that into a crash.
    await expect(logger.info('anything')).resolves.toBeUndefined()
  })

  it('does not throw when a handler throws synchronously', async () => {
    const logger = Logger.create('test').pushHandler(new TestHandler('throw'))

    await expect(logger.info('anything')).resolves.toBeUndefined()
  })

  it('keeps delivering to the handlers after the broken one', async () => {
    const healthy = new TestHandler('ok')
    const logger = Logger.create('test')
      .pushHandler(new TestHandler('reject'))
      .pushHandler(healthy)

    await logger.info('still gets through')

    // A broken sink isolates itself, it does not sever the chain.
    expect(healthy.received).toHaveLength(1)
    expect(healthy.received[0]?.message).toBe('still gets through')
  })

  it('warns on every failure, so the rate of failure stays visible', async () => {
    const logger = Logger.create('test').pushHandler(new TestHandler('reject'))

    await logger.info('one')
    await logger.info('two')
    await logger.info('three')

    // Deliberately not deduplicated: a sink broken for an hour must not look
    // like one that failed once. Filtering is the reader's job, not the SDK's.
    expect(warnSpy).toHaveBeenCalledTimes(3)
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('TestHandler')
  })

  // `handle()` is the method that fails in practice, but `isHandling()` and
  // `shouldBubble()` are interface methods a third party implements too, and the
  // guarantee on `log()` is unconditional — so the whole interaction with a
  // handler is isolated, not just the one method that does I/O.
  it('does not throw when isHandling() throws, and still reaches later handlers', async () => {
    const healthy = new TestHandler('ok')
    const logger = Logger.create('test')
      .pushHandler(new TestHandler('throwIsHandling'))
      .pushHandler(healthy)

    await expect(logger.info('past a broken predicate')).resolves.toBeUndefined()

    expect(healthy.received).toHaveLength(1)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('does not throw when shouldBubble() throws after a successful handle()', async () => {
    const healthy = new TestHandler('ok')
    const logger = Logger.create('test')
      .pushHandler(new TestHandler('throwShouldBubble'))
      .pushHandler(healthy)

    await expect(logger.info('past a broken bubble check')).resolves.toBeUndefined()

    // The record was delivered to the broken handler before its bubble check
    // failed; the chain then continues rather than stopping on the exception.
    expect(healthy.received).toHaveLength(1)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('reports each broken handler separately within one call', async () => {
    const logger = Logger.create('test')
      .pushHandler(new TestHandler('reject'))
      .pushHandler(new TestHandler('throw'))

    await logger.info('one')

    // Two offenders, two reports — one call does not mask the second failure.
    expect(warnSpy).toHaveBeenCalledTimes(2)
  })
})

describe('#346 a failing processor cannot escape Logger.log()', () => {
  it('skips the throwing processor and still delivers the record', async () => {
    const healthy = new TestHandler('ok')
    const logger = Logger.create('test')
      .pushProcessor((record) => {
        return { ...record, extra: { ...record.extra, first: true } }
      })
      .pushProcessor(() => {
        throw new Error('processor exploded')
      })
      .pushProcessor((record) => {
        return { ...record, extra: { ...record.extra, third: true } }
      })
      .pushHandler(healthy)

    await expect(logger.info('survives')).resolves.toBeUndefined()

    expect(healthy.received).toHaveLength(1)
    // Enrichment from the processors either side of the broken one is retained;
    // only the failed step's contribution is missing.
    expect(healthy.received[0]?.extra).toEqual({ first: true, third: true })
  })
})

describe('#346 the isolation does not change successful logging', () => {
  it('still stops the chain when a non-bubbling handler handles the record', async () => {
    const first = new TestHandler('ok', false) // bubble: false
    const second = new TestHandler('ok')
    const logger = Logger.create('test').pushHandler(first).pushHandler(second)

    await logger.info('stops here')

    expect(first.received).toHaveLength(1)
    expect(second.received).toHaveLength(0)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('passes the level and message through unchanged', async () => {
    const handler = new TestHandler('ok')
    const logger = Logger.create('my-channel').pushHandler(handler)

    await logger.error('boom', { requestId: 'r1' })

    expect(handler.received[0]).toMatchObject({
      channel: 'my-channel',
      level: LogLevel.ERROR,
      message: 'boom',
      context: { requestId: 'r1' }
    })
  })
})

describe('#346 setLogger warns about a logger that cannot be called fire-and-forget', () => {
  it('warns when a logging method is missing', () => {
    // A partial stub — easy to write in plain JavaScript, where nothing checks
    // the interface. The SDK appends `.catch()` to every log call, so a missing
    // method is a TypeError at the callsite rather than a quiet no-op.
    warnOnNonPromiseLogger({ info: async () => {} } as unknown as LoggerInterface, 'test')

    expect(warnSpy).toHaveBeenCalledTimes(1)
    const text = String(warnSpy.mock.calls[0]?.[0])
    expect(text).toContain('missing')
    expect(text).toContain('warning')
  })

  it('warns when the value is not an object at all', () => {
    warnOnNonPromiseLogger(null as unknown as LoggerInterface, 'test')

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('not an object')
  })

  it('stays quiet for a complete implementation', () => {
    const complete = {
      log: async () => {}, debug: async () => {}, info: async () => {},
      notice: async () => {}, warning: async () => {}, error: async () => {},
      critical: async () => {}, alert: async () => {}, emergency: async () => {}
    } as unknown as LoggerInterface

    warnOnNonPromiseLogger(complete, 'test')

    expect(warnSpy).not.toHaveBeenCalled()
  })
})

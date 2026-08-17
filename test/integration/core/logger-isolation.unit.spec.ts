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
 * reported once, and the remaining handlers still receive the record.
 *
 * Pure logic — no portal — so this runs in the jsSdk:unit project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Logger } from '../../../packages/jssdk/src/logger/logger'
import { LogLevel } from '../../../packages/jssdk/src/types/logger'
import type { Formatter, Handler, LogRecord } from '../../../packages/jssdk/src/types/logger'

/**
 * Minimal Handler. `behaviour` decides how this one fails (or doesn't); every
 * record it accepts is recorded so we can assert what still got through.
 */
class TestHandler implements Handler {
  public readonly received: LogRecord[] = []

  constructor(
    private readonly behaviour: 'ok' | 'reject' | 'throw' = 'ok',
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
    return true
  }

  shouldBubble(): boolean {
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

  it('warns once per broken handler, not once per call', async () => {
    const logger = Logger.create('test').pushHandler(new TestHandler('reject'))

    await logger.info('one')
    await logger.info('two')
    await logger.info('three')

    // The failure is usually persistent, so an unthrottled warning would flood
    // the console at the rate of the traffic being logged.
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('TestHandler')
  })

  it('warns separately for a second, distinct broken handler', async () => {
    const logger = Logger.create('test')
      .pushHandler(new TestHandler('reject'))
      .pushHandler(new TestHandler('throw'))

    await logger.info('one')
    await logger.info('two')

    // Keyed by identity, so each offender is reported on its own.
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

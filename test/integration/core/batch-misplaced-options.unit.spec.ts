/**
 * #426 — batch flags passed at the top level instead of inside `options` were
 * silently ignored: no error, no warning, and the call behaved as though they
 * had never been set.
 *
 * The nastier of the two is a dropped `returnAjaxResult`, because the caller
 * then reads `entry.isSuccess` off a plain payload, gets `undefined`, and a
 * batch where every command succeeded reads as one where every command failed.
 * The SDK's own live suite made exactly this mistake and went undetected for
 * months (#425).
 *
 * Two things now catch it, and this file pins both:
 *
 *   1. the option types no longer carry an index signature, so a TypeScript
 *      caller writing an object literal gets a compile error — pinned in
 *      `actions-options.types.spec.ts`, which is type-checked rather than run;
 *   2. a runtime warning for everyone else — a JavaScript caller, a literal
 *      widened through a variable, anything crossing a `JSON.parse` boundary.
 *
 * The warning is a warning and not a throw on purpose: the call still does
 * something useful, and breaking a running integration over a misplaced flag
 * would be a worse trade than telling its author where the flag belongs.
 */
import { describe, it, expect, vi } from 'vitest'
import { BatchV2 } from '../../../packages/jssdk/src/core/actions/v2/batch'
import { BatchV3 } from '../../../packages/jssdk/src/core/actions/v3/batch'
import { Result } from '../../../packages/jssdk/src/core/result'
import type { TypeB24 } from '../../../packages/jssdk/src/types/b24'
import type { LoggerInterface } from '../../../packages/jssdk/src/types/logger'

function harness() {
  const warning = vi.fn().mockResolvedValue(undefined)
  const logger = { warning } as unknown as LoggerInterface

  // A minimally valid batch envelope: the guard runs before the response is
  // processed, but the processing still has to survive for the call to return.
  const response = new Result<{ result: Map<string | number, unknown> }>()
  response.setData({ result: new Map() })
  const batch = vi.fn().mockResolvedValue(response)
  const b24 = {
    getHttpClient: () => ({ batch })
  } as unknown as TypeB24

  return { logger, warning, b24, batch }
}

const CALLS = { now: ['server.time', {}] } as never

describe('batch flags at the top level', () => {
  it('warns, naming the flag and where it belongs', async () => {
    const { logger, warning, b24 } = harness()
    await new BatchV2(b24, logger).make({ calls: CALLS, isHaltOnError: false } as never)

    expect(warning).toHaveBeenCalledTimes(1)
    const message = String(warning.mock.calls[0]?.[0])
    expect(message).toContain('isHaltOnError')
    expect(message).toContain('options')
  })

  it('names every misplaced flag, not just the first', async () => {
    const { logger, warning, b24 } = harness()
    await new BatchV2(b24, logger).make({
      calls: CALLS,
      isHaltOnError: false,
      returnAjaxResult: true
    } as never)

    const message = String(warning.mock.calls[0]?.[0])
    expect(message).toContain('isHaltOnError')
    expect(message).toContain('returnAjaxResult')
  })

  it('stays quiet for the documented form', async () => {
    const { logger, warning, b24 } = harness()
    await new BatchV2(b24, logger).make({
      calls: CALLS,
      options: { isHaltOnError: false, returnAjaxResult: true }
    } as never)

    expect(warning).not.toHaveBeenCalled()
  })

  it('stays quiet when no options are given at all', async () => {
    const { logger, warning, b24 } = harness()
    await new BatchV2(b24, logger).make({ calls: CALLS } as never)

    expect(warning).not.toHaveBeenCalled()
  })

  it('does not swallow the call — the flag is dropped, not the request', async () => {
    // The warning is diagnostic. Whatever the caller asked for still runs, so
    // adding this check cannot break a working integration.
    const { logger, b24, batch } = harness()
    await new BatchV2(b24, logger).make({ calls: CALLS, isHaltOnError: false } as never)

    expect(batch).toHaveBeenCalledTimes(1)
  })

  it('covers v3 as well as v2', async () => {
    const { logger, warning, b24 } = harness()
    await new BatchV3(b24, logger).make({ calls: CALLS, returnAjaxResult: true } as never)

    expect(String(warning.mock.calls[0]?.[0])).toContain('returnAjaxResult')
  })

  it('ignores an inherited property, matching only own keys', async () => {
    // `Object.hasOwn`, not `in`: an object whose prototype happens to carry one
    // of these names has not passed anything.
    const { logger, warning, b24 } = harness()
    const options = Object.create({ isHaltOnError: false })
    options.calls = CALLS
    await new BatchV2(b24, logger).make(options)

    expect(warning).not.toHaveBeenCalled()
  })
})

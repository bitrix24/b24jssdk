/**
 * The load-test harness's three shape accessors — `_asCallParams`,
 * `_asBatchCalls`, `_asCommandTemplate`.
 *
 * They exist because `testConfig.calls` puts three different things in one
 * `params` field, chosen by the entry's `method`, and #279's narrowing of
 * `TypeCallParams`'s index signature from `any` to `unknown` finally made the
 * mismatch a type error instead of a silent malformed request.
 *
 * They live in `test/0_setup/`, whose only consumer is the `jsSdk:underLoad`
 * project — and that needs a live portal, so **CI never executes them**. QA
 * measured the consequence on this PR: neutering the array check in
 * `_asCommandTemplate`, and renaming the thrown code, were both invisible across
 * the whole suite. Guards whose whole job is to fail loudly, that nothing can
 * observe failing, are worse than no guards.
 *
 * These are pure synchronous functions over a field — they need no portal, and
 * no `B24Hook`. So they are exercised here, in `jsSdk:unit`, which does run.
 */
import { describe, expect, it } from 'vitest'
import { AbstractLoadTester } from '../../0_setup/hooks-under-load-jssdk'
import type { LoadTestParams } from '../../0_setup/hooks-under-load-jssdk'
import { Result } from '../../../packages/jssdk/src/index'

/**
 * The three accessors are `protected`, and their subclasses in the harness carry
 * live-portal plumbing. This exposes them without any of that.
 */
class Probe extends AbstractLoadTester {
  constructor(params: LoadTestParams) {
    super(undefined as never, 'probe.method', params)
  }

  public callParams() { return this._asCallParams() }
  public batchCalls() { return this._asBatchCalls() }
  public commandTemplate() { return this._asCommandTemplate() }

  protected async _makeRequestBatchByChunk() { return new Result() as never }
  protected async _makeRequestBatch() { return new Result() as never }
  protected async _makeRequestBase() { return new Result() as never }
}

const CALL_PARAMS = { select: ['id'], filter: { '>id': 2 } }
const BATCH_CALLS = [{ method: 'crm.item.list', params: { select: ['id'] } }]
const TEMPLATE = { method: 'crm.item.list', params: { select: ['id'] } }

const SHAPE = 'JSSDK_TEST_UNDER_LOAD_PARAMS_SHAPE'

describe('#279 load-tester params-shape guards', () => {
  describe('accepts the shape its mode expects', () => {
    it('_asCallParams takes plain call parameters', () => {
      expect(new Probe(CALL_PARAMS).callParams()).toEqual(CALL_PARAMS)
    })

    it('_asBatchCalls takes an array of commands', () => {
      expect(new Probe(BATCH_CALLS as never).batchCalls()).toEqual(BATCH_CALLS)
    })

    it('_asCommandTemplate takes one { method, params } command', () => {
      expect(new Probe(TEMPLATE).commandTemplate()).toEqual(TEMPLATE)
    })
  })

  describe('refuses every other shape, with a code a caller can match', () => {
    it.each([
      ['an array of commands', BATCH_CALLS],
      // The gap the engineer found on this PR: a command template is an object,
      // so an `Array.isArray` check alone let it through and folded `method` /
      // `params` into the call's own parameters.
      ['a { method, params } template', TEMPLATE]
    ])('_asCallParams refuses %s', (_name, params) => {
      expect(() => new Probe(params as never).callParams())
        .toThrowError(expect.objectContaining({ code: SHAPE }))
    })

    it.each([
      ['plain call parameters', CALL_PARAMS],
      ['a { method, params } template', TEMPLATE]
    ])('_asBatchCalls refuses %s', (_name, params) => {
      expect(() => new Probe(params as never).batchCalls())
        .toThrowError(expect.objectContaining({ code: SHAPE }))
    })

    it.each([
      ['an array of commands', BATCH_CALLS],
      ['plain call parameters', CALL_PARAMS]
    ])('_asCommandTemplate refuses %s', (_name, params) => {
      expect(() => new Probe(params as never).commandTemplate())
        .toThrowError(expect.objectContaining({ code: SHAPE }))
    })
  })

  // `SdkError` does not run its description through `redactSensitiveParams`, and
  // a load-test filter legitimately carries portal data — an email or a phone
  // number being searched for. The method name is a fixture literal and is fine;
  // the params are not.
  //
  // Each accessor gets a shape that makes IT throw: they have three separate
  // message strings, and a leak in one is invisible to a test that only makes
  // another one fail. An earlier version of this test used one array fixture for
  // all three — `_asBatchCalls` accepts any array, so it never threw, and a
  // deliberate leak planted in its message survived undetected.
  const LEAKY = { filter: { EMAIL: 'someone@example.com' } }
  it.each([
    ['_asCallParams', [LEAKY] as never, (p: Probe) => p.callParams()],
    ['_asBatchCalls', LEAKY as never, (p: Probe) => p.batchCalls()],
    ['_asCommandTemplate', LEAKY as never, (p: Probe) => p.commandTemplate()]
  ])('%s never puts the params themselves in the message', (_name, params, invoke) => {
    const probe = new Probe(params)
    let message: string | null = null
    try {
      invoke(probe)
    } catch (error) {
      message = (error as Error).message
    }

    // The fixture must actually reach the throw — otherwise this asserts nothing.
    expect(message).not.toBeNull()
    expect(message).toContain('probe.method')
    expect(message).not.toContain('someone@example.com')
    expect(message).not.toContain('EMAIL')
  })
})

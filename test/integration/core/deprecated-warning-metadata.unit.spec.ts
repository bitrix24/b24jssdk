/**
 * The legacy `AbstractB24` shortcuts must emit a deprecation warning whose
 * metadata advertises the correct removal version. This guards against the
 * `removalVersion` silently drifting back (it was historically mislabelled as
 * `2.0.0`; the surface is actually removed in `3.0.0`). Portal-free (jsSdk:unit):
 * the warning is emitted synchronously at the top of each method, before the
 * network call, so we spy on `LoggerFactory.forcedLog` and ignore the (never
 * resolving) request promise.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { B24Hook, LoggerFactory } from '../../../packages/jssdk/src/'

const REMOVAL_VERSION = '3.0.0'

function makeClient(): B24Hook {
  // Well-formed webhook URL — no network is performed in these tests.
  return B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/abcdef1234567890/')
}

describe('legacy AbstractB24 shortcuts — deprecation warning metadata', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const cases: Array<{ name: string, invoke: (b24: B24Hook) => unknown }> = [
    { name: 'callMethod', invoke: b24 => b24.callMethod('server.time') },
    { name: 'callListMethod', invoke: b24 => b24.callListMethod('crm.deal.list') },
    { name: 'fetchListMethod', invoke: b24 => b24.fetchListMethod('crm.deal.list').next() },
    { name: 'callBatch', invoke: b24 => b24.callBatch([['server.time', {}]]) },
    { name: 'callBatchByChunk', invoke: b24 => b24.callBatchByChunk([['server.time', {}]], true) }
  ]

  for (const { name, invoke } of cases) {
    it(`${name}() warns with removalVersion ${REMOVAL_VERSION}`, () => {
      const spy = vi.spyOn(LoggerFactory, 'forcedLog').mockImplementation(() => {})
      const b24 = makeClient()

      // The warning fires synchronously; swallow the trailing network promise.
      void Promise.resolve(invoke(b24)).catch(() => {})

      expect(spy).toHaveBeenCalled()
      const [, level, message, context] = spy.mock.calls[0] as [unknown, string, string, Record<string, unknown>]
      expect(level).toBe('warning')
      expect(message).toContain(REMOVAL_VERSION)
      expect(context).toMatchObject({
        method: name,
        removalVersion: REMOVAL_VERSION,
        code: 'JSSDK_CORE_DEPRECATED_METHOD'
      })
    })
  }
})

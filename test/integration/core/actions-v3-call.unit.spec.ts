/**
 * Unit coverage for the removed v3 method allowlist: `actions.v3.call` /
 * `actions.v3.batch` must NOT pre-flight-throw for a method that used to be off
 * the (now-deleted) `#supportMethods` list — they hand it straight to the v3
 * HTTP client and let the server validate it. Mock the client; no portal.
 */
import { describe, it, expect, vi } from 'vitest'
import { CallV3 } from '../../../packages/jssdk/src/core/actions/v3/call'
import { BatchV3 } from '../../../packages/jssdk/src/core/actions/v3/batch'
import { ApiVersion } from '../../../packages/jssdk/src/types/b24'
import { Result } from '../../../packages/jssdk/src/core/result'

function makeLogger() {
  return { warning: () => {}, error: () => {}, info: () => {}, log: () => {}, debug: () => {}, trace: () => {} } as never
}

describe('actions.v3 no longer gates on a method allowlist', () => {
  it('CallV3.make sends an off-old-list method straight to the v3 client (no throw)', async () => {
    const call = vi.fn().mockResolvedValue({ isSuccess: true })
    const getHttpClient = vi.fn().mockReturnValue({ call })
    const b24 = { getHttpClient } as never

    const action = new CallV3(b24, makeLogger())
    await expect(action.make({ method: 'note.collection.list', params: { pagination: { limit: 1 } } }))
      .resolves.toBeDefined()

    expect(getHttpClient).toHaveBeenCalledWith(ApiVersion.v3)
    expect(call).toHaveBeenCalledWith('note.collection.list', { pagination: { limit: 1 } }, undefined)
  })

  it('CallV3.make does not throw for a method that does not exist on v3 either', async () => {
    const call = vi.fn().mockResolvedValue({ isSuccess: false })
    const b24 = { getHttpClient: vi.fn().mockReturnValue({ call }) } as never
    // The old gate would have thrown JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3 here.
    await expect(new CallV3(b24, makeLogger()).make({ method: 'crm.item.get' })).resolves.toBeDefined()
    expect(call).toHaveBeenCalledWith('crm.item.get', {}, undefined)
  })

  it('BatchV3.make sends off-old-list commands to the v3 batch endpoint (no throw)', async () => {
    const batchResponse = new Result().setData({ result: new Map() })
    const batch = vi.fn().mockResolvedValue(batchResponse)
    const getHttpClient = vi.fn().mockReturnValue({ batch })
    const b24 = { getHttpClient } as never

    const calls = [{ method: 'note.collection.list', query: {} }] as never
    await expect(new BatchV3(b24, makeLogger()).make({ calls } as never)).resolves.toBeDefined()

    expect(getHttpClient).toHaveBeenCalledWith(ApiVersion.v3)
    expect(batch).toHaveBeenCalledTimes(1)
    expect(batch.mock.calls[0][1]).toMatchObject({ apiVersion: ApiVersion.v3 })
  })
})

import { describe, it, expect } from 'vitest'
import { setupB24Tests } from '../../0_setup/hooks-integration-jssdk'

/**
 * Live round trip of `actions.v3.deferredBatch` (#570).
 *
 * Needs a portal whose plan includes deferred batches and a webhook with the
 * scopes the commands need. It uses `rest.scope.list`, a v3 method: a deferred
 * batch takes v3 methods only (a v2 method such as `user.current` is refused at
 * `add` with `INVALID_METHOD`). On other plans the portal answers
 * `FEATURE_NOT_AVAILABLE_ON_CURRENT_PLAN` and this spec reports red with that
 * text — a reason to exclude it locally, not a regression.
 *
 * It adds a small job, waits for it, reads the rows, and deletes the job; the
 * portal is left as it was.
 */
describe('core.actions.deferredBatch @apiV3', () => {
  const { getB24Client } = setupB24Tests()

  it('deferredBatch.make @apiV3 returns one row per command, in order', async () => {
    const b24 = getB24Client()
    const seen: string[] = []

    const response = await b24.actions.v3.deferredBatch.make<Record<string, unknown>>({
      calls: [
        ['rest.scope.list', {}],
        ['rest.scope.list', {}],
        ['rest.scope.list', {}]
      ],
      pollInterval: 1_000,
      timeout: 120_000,
      onStatus: job => seen.push(job.status)
    })

    expect(response.isSuccess, `deferredBatch failed: ${response.getErrorMessages().join('; ')}`).toBe(true)
    expect(response.getData()).toHaveLength(3)
    expect(seen.at(-1)).toBe('done')
  }, 150_000)

  it('deferredBatch steps @apiV3 add → waitFor → download → delete', async () => {
    const b24 = getB24Client()
    const batch = b24.actions.v3.deferredBatch

    const added = await batch.add({ calls: [['rest.scope.list', {}]] })
    expect(added.isSuccess, `add failed: ${added.getErrorMessages().join('; ')}`).toBe(true)
    const id = added.getData()!.id

    try {
      const finished = await batch.waitFor(id, { pollInterval: 1_000, timeout: 120_000 })
      expect(finished.isSuccess, `waitFor failed: ${finished.getErrorMessages().join('; ')}`).toBe(true)

      const rows = await batch.download(id)
      expect(rows.isSuccess, `download failed: ${rows.getErrorMessages().join('; ')}`).toBe(true)
      expect(rows.getData()).toHaveLength(1)
    } finally {
      const deleted = await batch.delete(id)
      expect(deleted.isSuccess).toBe(true)
    }
  }, 150_000)
})

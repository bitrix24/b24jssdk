/**
 * `actions.v3.deferredBatch` — the `rest.deferredbatch.*` family (#570).
 *
 * The request and response shapes are the ones measured on a cloud portal and
 * recorded on #570 (issuecomment 5844466488): `add` takes
 * `{ fields: { commands: [{ method, query }] } }` and answers `{ item }`; `get`
 * went `pending → done`; `downloadresult` answers `{ downloadUrl }`, and that
 * URL serves a gzip-compressed JSON array in command order.
 *
 * `*.unit.spec.ts` — no real Bitrix24 portal required (axios is mocked).
 */
import { gzipSync } from 'node:zlib'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { AxiosError } from 'axios'
import { ApiVersion, B24Hook } from '../../../packages/jssdk/src/'
import type { DeferredBatchJob } from '../../../packages/jssdk/src/'

const SECRET = 'SECRETSECRET123'
const DOWNLOAD_URL = `https://example.bitrix24.com/rest/1/${SECRET}/download/?token=signed`
const TIME = {
  start: 0, finish: 0, duration: 0, processing: 0,
  date_start: '1970-01-01T00:00:00+00:00',
  date_finish: '1970-01-01T00:00:00+00:00',
  operating_reset_at: 1, operating: 0
}

function ok(result: unknown) {
  return { status: 200, statusText: 'OK', headers: {}, config: {} as never, data: { result, time: TIME } }
}

function job(status: DeferredBatchJob['status'], extra: Partial<DeferredBatchJob> = {}): DeferredBatchJob {
  return { id: 7, status, resultFileId: status === 'done' ? 112 : null, ...extra }
}

const ROWS = [{ item: { id: 1 } }, { items: [{ id: 2 }] }]

/**
 * A portal stand-in: answers each `rest.deferredbatch.*` method from a script,
 * and records what was sent.
 */
function portal(b24: B24Hook, script: { statuses?: DeferredBatchJob[], file?: Uint8Array, getError?: unknown, getStatus?: number, listResult?: unknown, addResult?: unknown } = {}) {
  const statuses = [...(script.statuses ?? [job('pending'), job('done')])]
  const sent: Array<{ method: string, body: any, headers: Record<string, unknown> }> = []
  const http = b24.getHttpClient(ApiVersion.v3)

  vi.spyOn(http.ajaxClient, 'post').mockImplementation(async (url: string, body: any, config: any) => {
    const method = /\/([a-z.]+)(?:\?|$)/i.exec(String(url))?.[1] ?? String(url)
    sent.push({ method, body, headers: config?.headers ?? {} })
    if (method.endsWith('rest.deferredbatch.add')) return ok(script.addResult ?? { item: job('pending') }) as never
    if (method.endsWith('rest.deferredbatch.get')) return ok({ item: statuses.length > 1 ? statuses.shift() : statuses[0] }) as never
    if (method.endsWith('rest.deferredbatch.downloadresult')) return ok({ downloadUrl: DOWNLOAD_URL }) as never
    if (method.endsWith('rest.deferredbatch.delete')) return ok({ result: true }) as never
    if (method.endsWith('rest.deferredbatch.list')) return ok(script.listResult ?? { items: [job('done')] }) as never
    throw new Error(`unexpected ${method}`)
  })

  const get = vi.spyOn(http.ajaxClient, 'get').mockImplementation(async () => {
    if (script.getError) throw script.getError
    const file = script.file ?? new Uint8Array(gzipSync(JSON.stringify(ROWS)))
    return { status: script.getStatus ?? 200, statusText: 'OK', headers: {}, config: {} as never, data: file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) } as never
  })

  const called = (name: string) => sent.filter(s => s.method.endsWith(name))
  return { sent, get, called }
}

describe('actions.v3.deferredBatch', () => {
  let b24: B24Hook | null = null

  afterEach(() => {
    vi.restoreAllMocks()
    b24?.destroy()
    b24 = null
  })

  function hook(): B24Hook {
    b24 = B24Hook.fromWebhookUrl(`https://example.bitrix24.com/rest/1/${SECRET}`)
    return b24
  }

  it('@apiV3 make() runs add → wait → download → decode → delete and resolves with the rows', async () => {
    const b24 = hook()
    const p = portal(b24)
    const seen: string[] = []

    const response = await b24.actions.v3.deferredBatch.make<{ item?: { id: number } }>({
      calls: [['tasks.task.get', { id: 1 }], { method: 'tasks.task.list', params: { select: ['id'] } }],
      pollInterval: 250,
      onStatus: j => seen.push(j.status)
    })

    expect(response.isSuccess).toBe(true)
    expect(response.getData()).toEqual(ROWS)
    expect(seen).toEqual(['pending', 'done'])
    expect(p.called('rest.deferredbatch.delete')).toHaveLength(1)
    expect(p.get).toHaveBeenCalledWith(DOWNLOAD_URL, expect.objectContaining({ responseType: 'arraybuffer', maxRedirects: 0 }))
  })

  it('@apiV3 add() sends both command forms as { method, query }', async () => {
    const b24 = hook()
    const p = portal(b24)

    await b24.actions.v3.deferredBatch.add({
      calls: [['tasks.task.get', { id: 1 }], { method: 'user.current' }]
    })

    expect(p.called('rest.deferredbatch.add')[0]!.body.fields.commands).toEqual([
      { method: 'tasks.task.get', query: { id: 1 } },
      { method: 'user.current', query: {} }
    ])
  })

  it('@apiV3 add() carries an idempotency key as the Idempotency-Key header', async () => {
    const b24 = hook()
    const p = portal(b24)

    await b24.actions.v3.deferredBatch.add({ calls: [['user.current']], idempotencyKey: 'export-42' })

    expect(p.called('rest.deferredbatch.add')[0]!.headers['Idempotency-Key']).toBe('export-42')
  })

  it('@apiV3 make() with deleteAfter: false keeps the job', async () => {
    const b24 = hook()
    const p = portal(b24)

    const response = await b24.actions.v3.deferredBatch.make({ calls: [['user.current']], pollInterval: 250, deleteAfter: false })

    expect(response.isSuccess).toBe(true)
    expect(p.called('rest.deferredbatch.delete')).toHaveLength(0)
  })

  it('@apiV3 a job that ends in error fails with JSSDK_DEFERRED_BATCH_FAILED and downloads nothing', async () => {
    const b24 = hook()
    const p = portal(b24, { statuses: [job('processing'), job('error', { errorMessage: 'boom' })] })

    const response = await b24.actions.v3.deferredBatch.make({ calls: [['user.current']], pollInterval: 250 })

    expect(response.isSuccess).toBe(false)
    expect([...response.errors.values()].map(e => (e as { code?: string }).code)).toContain('JSSDK_DEFERRED_BATCH_FAILED')
    expect(p.called('rest.deferredbatch.downloadresult')).toHaveLength(0)
    expect(p.get).not.toHaveBeenCalled()
  })

  it('@apiV3 waitFor() returns the failed job as data, with the portal message on it', async () => {
    const b24 = hook()
    portal(b24, { statuses: [job('error', { errorMessage: 'boom' })] })

    const finished = await b24.actions.v3.deferredBatch.waitFor(7, { pollInterval: 250 })

    expect(finished.isSuccess).toBe(false)
    expect(finished.getData()?.errorMessage).toBe('boom')
  })

  it('@apiV3 waitFor() gives up after the timeout, leaving the job alone', async () => {
    const b24 = hook()
    const p = portal(b24, { statuses: [job('processing')] })

    const finished = await b24.actions.v3.deferredBatch.waitFor(7, { pollInterval: 250, timeout: 300 })

    expect(finished.isSuccess).toBe(false)
    expect([...finished.errors.values()].map(e => (e as { code?: string }).code)).toEqual(['JSSDK_DEFERRED_BATCH_TIMEOUT'])
    expect(p.called('rest.deferredbatch.delete')).toHaveLength(0)
  })

  it('@apiV3 waitFor() stops when the signal is aborted', async () => {
    const b24 = hook()
    portal(b24, { statuses: [job('processing')] })
    const controller = new AbortController()

    const waiting = b24.actions.v3.deferredBatch.waitFor(7, { pollInterval: 10_000, signal: controller.signal })
    setTimeout(() => controller.abort(), 20)
    const finished = await waiting

    expect([...finished.errors.values()].map(e => (e as { code?: string }).code)).toEqual(['JSSDK_DEFERRED_BATCH_ABORTED'])
  })

  it('@apiV3 onStatus fires once per status change, and a throwing callback does not stop the wait', async () => {
    const b24 = hook()
    portal(b24, { statuses: [job('pending'), job('pending'), job('processing'), job('done')] })
    const seen: string[] = []

    const finished = await b24.actions.v3.deferredBatch.waitFor(7, {
      pollInterval: 250,
      onStatus: (j) => {
        seen.push(j.status)
        throw new Error('ui went away')
      }
    })

    expect(finished.isSuccess).toBe(true)
    expect(seen).toEqual(['pending', 'processing', 'done'])
  })

  it('@apiV3 a portal refusal becomes an error on the Result, not a throw', async () => {
    const b24 = hook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post').mockRejectedValue(new AxiosError(
      'Request failed with status code 403', 'ERR_BAD_REQUEST', undefined, undefined,
      {
        status: 403, statusText: 'Forbidden', headers: {}, config: {} as never,
        data: { error: { code: 'FEATURE_NOT_AVAILABLE_ON_CURRENT_PLAN', message: 'not on this plan' } }
      }
    ))

    const response = await b24.actions.v3.deferredBatch.make({ calls: [['user.current']] })

    expect(response.isSuccess).toBe(false)
    expect(response.getErrorMessages().join(' ')).toContain('not on this plan')
  })

  it('@apiV3 a failed download names the HTTP status and never the URL, which carries the secret', async () => {
    const b24 = hook()
    portal(b24, {
      getError: new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined,
        { status: 404, statusText: 'Not Found', headers: {}, config: {} as never, data: '' })
    })

    const rows = await b24.actions.v3.deferredBatch.download(7)

    expect(rows.isSuccess).toBe(false)
    const text = JSON.stringify([...rows.errors.values()].map(e => [(e as { code?: string }).code, e.message]))
    expect(text).toContain('JSSDK_DEFERRED_BATCH_DOWNLOAD_FAILED')
    expect(text).toContain('404')
    expect(text).not.toContain(SECRET)
    expect([...rows.errors.values()].map(e => (e as { status?: number }).status)).toEqual([404])
  })

  it('@apiV3 list() returns the jobs', async () => {
    const b24 = hook()
    portal(b24)

    const jobs = await b24.actions.v3.deferredBatch.list()

    expect(jobs.getData()).toEqual([job('done')])
  })

  it('@apiV3 an empty calls array throws before anything is sent', async () => {
    const b24 = hook()
    const p = portal(b24)

    await expect(b24.actions.v3.deferredBatch.make({ calls: [] })).rejects.toMatchObject({ code: 'JSSDK_DEFERRED_BATCH_EMPTY' })
    expect(p.sent).toHaveLength(0)
  })

  it('@apiV3 an async onStatus that rejects is logged, not an unhandled rejection', async () => {
    const b24 = hook()
    portal(b24, { statuses: [job('pending'), job('done')] })
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)

    try {
      const finished = await b24.actions.v3.deferredBatch.waitFor(7, {
        pollInterval: 250,
        onStatus: async () => {
          throw new Error('async boom')
        }
      })
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(finished.isSuccess).toBe(true)
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  it('@apiV3 an abort during a status request is seen at once, not after a full interval', async () => {
    const b24 = hook()
    portal(b24, { statuses: [job('processing')] })
    const controller = new AbortController()
    const startedAt = Date.now()

    const finished = await b24.actions.v3.deferredBatch.waitFor(7, {
      pollInterval: 10_000,
      signal: controller.signal,
      onStatus: () => controller.abort()
    })

    expect([...finished.errors.values()].map(e => (e as { code?: string }).code)).toEqual(['JSSDK_DEFERRED_BATCH_ABORTED'])
    expect(Date.now() - startedAt).toBeLessThan(2_000)
  }, 3_000)

  it('@apiV3 a non-finite pollInterval falls back to the default instead of polling in a tight loop', async () => {
    const b24 = hook()
    const p = portal(b24, { statuses: [job('processing')] })

    const finished = await b24.actions.v3.deferredBatch.waitFor(7, { pollInterval: Number.NaN, timeout: 1_000 })

    expect(finished.isSuccess).toBe(false)
    expect(p.called('rest.deferredbatch.get').length).toBeLessThanOrEqual(2)
  }, 3_000)

  it('@apiV3 a download answered with no status (a refused redirect on fetch) is a download failure', async () => {
    const b24 = hook()
    portal(b24, { getStatus: 0, file: new Uint8Array() })

    const rows = await b24.actions.v3.deferredBatch.download(7)

    expect([...rows.errors.values()].map(e => (e as { code?: string }).code)).toEqual(['JSSDK_DEFERRED_BATCH_DOWNLOAD_FAILED'])
  })

  it('@apiV3 an answer without the expected data is an error, not a throw', async () => {
    const b24 = hook()
    portal(b24, { addResult: {} })

    const response = await b24.actions.v3.deferredBatch.make({ calls: [['user.current']] })

    expect([...response.errors.values()].map(e => (e as { code?: string }).code)).toEqual(['JSSDK_DEFERRED_BATCH_UNEXPECTED_RESPONSE'])
  })

  it('@apiV3 list() reads a bare array and an { items } envelope, and refuses anything else', async () => {
    const bare = hook()
    portal(bare, { listResult: [] })
    expect((await bare.actions.v3.deferredBatch.list()).getData()).toEqual([])
    vi.restoreAllMocks()
    bare.destroy()

    const odd = B24Hook.fromWebhookUrl(`https://example.bitrix24.com/rest/1/${SECRET}`)
    b24 = odd
    portal(odd, { listResult: { something: 1 } })
    const jobs = await odd.actions.v3.deferredBatch.list()
    expect(jobs.isSuccess).toBe(false)
  })

  it('@apiV3 an error the transport throws becomes an error on the Result, and nothing is sent', async () => {
    const b24 = hook()
    const p = portal(b24)

    const response = await b24.actions.v3.deferredBatch.make({ calls: [['user.current']], idempotencyKey: 'has space' })

    expect(response.isSuccess).toBe(false)
    expect([...response.errors.values()].map(e => (e as { code?: string }).code)).toEqual(['JSSDK_HTTP_INVALID_IDEMPOTENCY_KEY'])
    expect(p.sent).toHaveLength(0)
  })

  it('@apiV3 a result file that does not decode is a failure, not an empty success', async () => {
    const b24 = hook()
    portal(b24, { file: new TextEncoder().encode('{"a":1}') })

    const rows = await b24.actions.v3.deferredBatch.download(7)

    expect(rows.isSuccess).toBe(false)
    expect([...rows.errors.values()].map(e => (e as { code?: string }).code)).toEqual(['JSSDK_DEFERRED_BATCH_DECODE_FAILED'])
  })

  it('@apiV3 add() sends requestId as bx24_request_id', async () => {
    const b24 = hook()
    const post = vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post').mockResolvedValue(ok({ item: job('pending') }) as never)

    await b24.actions.v3.deferredBatch.add({ calls: [['user.current']], requestId: 'req-42' })

    expect(String(post.mock.calls[0]![0])).toContain('bx24_request_id=req-42')
  })

  it('@apiV3 a pollInterval below the minimum is raised to it', async () => {
    const b24 = hook()
    const p = portal(b24, { statuses: [job('processing')] })

    await b24.actions.v3.deferredBatch.waitFor(7, { pollInterval: 1, timeout: 200 })

    expect(p.called('rest.deferredbatch.get')).toHaveLength(1)
  })

  it('@apiV3 make() hands the new job to onStatus before waiting, so an early abort does not lose its id', async () => {
    const b24 = hook()
    const p = portal(b24, { statuses: [job('processing')] })
    const controller = new AbortController()
    const ids: number[] = []

    const response = await b24.actions.v3.deferredBatch.make({
      calls: [['user.current']],
      signal: controller.signal,
      onStatus: (j) => {
        ids.push(j.id)
        controller.abort()
      }
    })

    expect([...response.errors.values()].map(e => (e as { code?: string }).code)).toEqual(['JSSDK_DEFERRED_BATCH_ABORTED'])
    expect(ids).toEqual([7])
    expect(p.called('rest.deferredbatch.get')).toHaveLength(0)
  }, 3_000)

  it('@apiV3 make() with an already-aborted signal adds nothing', async () => {
    const b24 = hook()
    const p = portal(b24)
    const controller = new AbortController()
    controller.abort()

    const response = await b24.actions.v3.deferredBatch.make({ calls: [['user.current']], signal: controller.signal })

    expect([...response.errors.values()].map(e => (e as { code?: string }).code)).toEqual(['JSSDK_DEFERRED_BATCH_ABORTED'])
    expect(p.sent).toHaveLength(0)
  })

  it('@apiV3 a negative timeout is treated as 0', async () => {
    const b24 = hook()
    portal(b24, { statuses: [job('processing')] })

    const finished = await b24.actions.v3.deferredBatch.waitFor(7, { timeout: -5 })

    expect(finished.getErrorMessages().join(' ')).toContain('within 0 ms')
  })

  it('@apiV3 timeout: Infinity waits until the signal aborts', async () => {
    const b24 = hook()
    portal(b24, { statuses: [job('processing')] })
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 600)

    const finished = await b24.actions.v3.deferredBatch.waitFor(7, { pollInterval: 250, timeout: Number.POSITIVE_INFINITY, signal: controller.signal })

    expect([...finished.errors.values()].map(e => (e as { code?: string }).code)).toEqual(['JSSDK_DEFERRED_BATCH_ABORTED'])
  }, 3_000)

  it('@apiV3 delete() counts any success, whatever the answer carries', async () => {
    const b24 = hook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post').mockResolvedValue(ok(null) as never)

    const deleted = await b24.actions.v3.deferredBatch.delete(7)

    expect(deleted.isSuccess).toBe(true)
  })

  describe('decode()', () => {
    it('gunzips and parses the file', async () => {
      const rows = await hook().actions.v3.deferredBatch.decode(gzipSync(JSON.stringify(ROWS)))
      expect(rows).toEqual(ROWS)
    })

    it('parses bytes that are already inflated', async () => {
      const rows = await hook().actions.v3.deferredBatch.decode(new TextEncoder().encode(JSON.stringify(ROWS)))
      expect(rows).toEqual(ROWS)
    })

    it('accepts an ArrayBuffer', async () => {
      const bytes = new TextEncoder().encode('[1,2]')
      const rows = await hook().actions.v3.deferredBatch.decode(bytes.buffer)
      expect(rows).toEqual([1, 2])
    })

    it('refuses JSON that is not an array', async () => {
      await expect(hook().actions.v3.deferredBatch.decode(gzipSync('{"a":1}')))
        .rejects.toMatchObject({ code: 'JSSDK_DEFERRED_BATCH_DECODE_FAILED' })
    })

    it('refuses broken gzip', async () => {
      const broken = Uint8Array.from([0x1F, 0x8B, 1, 2, 3, 4])
      await expect(hook().actions.v3.deferredBatch.decode(broken))
        .rejects.toMatchObject({ code: 'JSSDK_DEFERRED_BATCH_DECODE_FAILED' })
    })
  })
})

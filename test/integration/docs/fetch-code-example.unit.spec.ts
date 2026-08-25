/**
 * #139 — `docs/app/composables/fetchCodeExample.ts`.
 *
 * The composable only reaches Nuxt through auto-imported globals, so stubbing
 * `useState` / `$fetch` on `globalThis` exercises the real module without a
 * Nuxt runtime. Worth doing: the bug being fixed here was invisible precisely
 * because the failure path resolved instead of rejecting, so nothing upstream
 * ever saw it.
 *
 * jsSdk:unit — no Nuxt app, no network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

interface Ref<T> { value: T }

const globals = globalThis as Record<string, unknown>
/**
 * `useState` is per-request on the server, so the stub keys its stores by a
 * switchable request id. A single shared store would quietly model the one
 * thing the cross-request test is trying to detect.
 */
let stateStore: Record<string, Ref<Record<string, unknown>>>
let currentRequest: string
let fetchMock: ReturnType<typeof vi.fn>

const stateFor = (request: string) => stateStore[`${request}:code-example-state`]?.value ?? {}

/** Fresh module per test — `inFlight` is module state. */
async function loadComposable() {
  vi.resetModules()
  return await import('../../../docs/app/composables/fetchCodeExample')
}

const sample = (name: string) => ({ name, filePath: `/x/${name}.ts`, content: 'const a = 1', type: 'ts' })

beforeEach(() => {
  stateStore = {}
  fetchMock = vi.fn()
  currentRequest = 'A'
  globals.useState = (key: string, init: () => Record<string, unknown>) => {
    const scoped = `${currentRequest}:${key}`
    stateStore[scoped] ??= { value: init() }
    return stateStore[scoped]
  }
  // `import.meta.server` is undefined outside Nuxt, so the prerender-header
  // branch is skipped and this is never called — stubbed so a change that
  // starts calling it fails loudly rather than on a missing global.
  globals.useRequestEvent = () => undefined
  globals.$fetch = fetchMock
})

afterEach(() => {
  delete globals.useState
  delete globals.useRequestEvent
  delete globals.$fetch
})

describe('fetchCodeExample (#139)', () => {
  it('returns the fetched example and caches it', async () => {
    const { fetchCodeExample } = await loadComposable()
    fetchMock.mockResolvedValue(sample('one'))

    expect(await fetchCodeExample('one')).toMatchObject({ name: 'one', content: 'const a = 1' })

    // Second call is served from the cache, not the network.
    expect(await fetchCodeExample('one')).toMatchObject({ name: 'one' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects when the fetch fails, instead of resolving to a stub', async () => {
    // The bug: the old `.catch` wrote a stub into the state and only then
    // re-threw, so the trailing `await state.value[name]` awaited a plain
    // object — which resolves — and the stub was returned as if it were data.
    const { fetchCodeExample } = await loadComposable()
    fetchMock.mockRejectedValue(new Error('502'))

    await expect(fetchCodeExample('boom')).rejects.toThrow('502')
  })

  it('does not cache a failure, so a retry can succeed', async () => {
    // The old version cached the stub, so one transient failure poisoned that
    // example for the rest of the session with no way back.
    const { fetchCodeExample } = await loadComposable()
    fetchMock.mockRejectedValueOnce(new Error('502')).mockResolvedValueOnce(sample('flaky'))

    await expect(fetchCodeExample('flaky')).rejects.toThrow('502')
    expect(await fetchCodeExample('flaky')).toMatchObject({ name: 'flaky' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('joins concurrent callers onto one request', async () => {
    const { fetchCodeExample } = await loadComposable()
    let release: (value: unknown) => void = () => {}
    fetchMock.mockReturnValue(new Promise((resolve) => {
      release = resolve
    }))

    const first = fetchCodeExample('shared')
    const second = fetchCodeExample('shared')
    release(sample('shared'))

    // Both get real data — the old dedup path could hand back `undefined`,
    // because the `.then` it stored resolved to the assignment's result.
    expect(await first).toMatchObject({ name: 'shared' })
    expect(await second).toMatchObject({ name: 'shared' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('fills the joining caller\'s own cache, not just the first one\'s', async () => {
    // `useState` is per-request on the server, and the in-flight promise's
    // `.then` closes over the FIRST caller's state. Without writing it again on
    // the joining path, a second SSR request would return the right value but
    // ship a payload missing the example — the client would re-fetch it after
    // hydration, and a second <CodeExample> in the same render would miss both
    // the state and the by-then-deleted in-flight entry.
    const { fetchCodeExample } = await loadComposable()
    let release: (value: unknown) => void = () => {}
    fetchMock.mockReturnValue(new Promise((resolve) => {
      release = resolve
    }))

    const first = fetchCodeExample('joined')

    // Request B: its own `useState` store, joining A's in-flight request.
    currentRequest = 'B'
    const second = fetchCodeExample('joined')

    release(sample('joined'))
    await Promise.all([first, second])

    // A's cache is filled by the request's own `.then`; B's only if the
    // joining path writes it.
    expect(stateFor('A').joined).toMatchObject({ name: 'joined' })
    expect(stateFor('B').joined).toMatchObject({ name: 'joined' })

    // So a second <CodeExample> inside request B is served from cache.
    expect(await fetchCodeExample('joined')).toMatchObject({ name: 'joined' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects both concurrent callers when the shared request fails', async () => {
    const { fetchCodeExample } = await loadComposable()
    fetchMock.mockRejectedValue(new Error('down'))

    const first = fetchCodeExample('shared')
    const second = fetchCodeExample('shared')

    await expect(first).rejects.toThrow('down')
    await expect(second).rejects.toThrow('down')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

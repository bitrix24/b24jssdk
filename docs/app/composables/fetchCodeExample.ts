export interface CodeExample {
  name: string
  filePath: string
  content: string
  type: 'ts' | 'js' | 'vue' | 'other'
}

const useCodeExampleState = () => useState<Record<string, CodeExample>>('code-example-state', () => ({}))

/**
 * In-flight requests, keyed by example name, so a second caller joins the first
 * rather than issuing a duplicate fetch.
 *
 * Held here rather than in `useState` because a Promise is not serialisable
 * into the payload. Entries are removed the moment the request settles, so
 * nothing outlives a render pass — which is what keeps a module-level map from
 * leaking between SSR requests.
 */
const inFlight = new Map<string, Promise<CodeExample>>()

/**
 * Loads one code example, caching the result in Nuxt state.
 *
 * Rejects when the fetch fails. That is the point of the rewrite (#139): the
 * previous version stored a stub carrying an empty `content` into the state and
 * only then re-threw, so the function's trailing `await state.value[name]`
 * awaited that plain object — which resolves. The rejection was swallowed
 * and the stub returned, so a caller could not tell a failed load from an empty
 * example. The stub was also cached, so one transient failure poisoned that
 * example for the rest of the session with no way to retry.
 *
 * The returned value now comes from the awaited request rather than from a
 * second read of the state, so it cannot hand back `undefined` or a
 * still-pending promise on a concurrent call.
 */
export async function fetchCodeExample(name: string): Promise<CodeExample> {
  const state = useCodeExampleState()

  const cached = state.value[name]
  if (cached) {
    return cached
  }

  const pending = inFlight.get(name)
  if (pending) {
    // The in-flight promise's `.then` closes over the FIRST caller's `state`,
    // and `useState` is per-request on the server. So a second SSR request that
    // joins here gets the right value back but never fills its own cache — its
    // payload would omit the example and the client would re-fetch after
    // hydration, and a second `<CodeExample>` in the same render would miss
    // both the state and the (by then deleted) in-flight entry. Write it here.
    const joined = await pending
    state.value[name] = joined
    return joined
  }

  // Add to nitro prerender
  if (import.meta.server) {
    const event = useRequestEvent()
    event?.node?.res?.setHeader(
      'x-nitro-prerender',
      [event?.node.res.getHeader('x-nitro-prerender'), `/api/code-examples/${name}.json`].filter(Boolean).join(',')
    )
  }

  const request = $fetch<CodeExample>(`/api/code-examples/${name}.json`)
    .then((data) => {
      // Only a success writes to the cache, so a failure stays retryable.
      state.value[name] = data
      return data
    })
    .finally(() => {
      inFlight.delete(name)
    })

  inFlight.set(name, request)

  return await request
}

/**
 * Regression for https://github.com/bitrix24/b24jssdk/issues/533
 *
 * The portal reads a `filter` value as a boolean only when the request body is
 * JSON. Under `application/x-www-form-urlencoded`, `ACTIVE: false` arrives as
 * the string `"false"`, the condition is dropped, and the call answers with rows
 * it should have excluded — with no error on either side.
 *
 * Measured against one portal in one minute, `user.get` with
 * `filter: { ACTIVE: … }`:
 *
 *   body JSON            true → 1 row   false → 0 rows
 *   body form-urlencoded true → 1 row   false → 1 row
 *
 * The SDK had always sent JSON, but never asked for it — axios picks
 * `application/json` on its own for a plain-object body. That default is
 * reachable: `ajaxClient` is public and the documentation encourages touching it
 * to raise `defaults.timeout`, so a single header on the instance silently broke
 * every boolean filter portal-wide.
 *
 * `*.unit.spec.ts` — no portal required.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { ApiVersion, B24Hook } from '../../../packages/jssdk/src/'

function buildHook(): B24Hook {
  return B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/secret/')
}

const okResponse = {
  status: 200,
  statusText: 'OK',
  headers: {},
  config: {} as never,
  data: { result: [], time: {} }
}

describe('the JSON content type is stated, not inherited (#533)', () => {
  let b24: B24Hook | null = null

  afterEach(() => {
    vi.restoreAllMocks()
    b24?.destroy()
    b24 = null
  })

  it.each([ApiVersion.v2, ApiVersion.v3])('%s states it on every call', async (version) => {
    b24 = buildHook()
    const client = b24.getHttpClient(version)
    const post = vi.spyOn(client.ajaxClient, 'post').mockResolvedValue(okResponse as never)

    await client.call('user.get', { filter: { ACTIVE: false } }, 'req-533')

    expect(post.mock.calls[0]?.[2]?.headers?.['Content-Type']).toBe('application/json')
  })

  // The reachable failure: one line on the public instance used to change the
  // body encoding for every request the SDK made.
  it('a form-urlencoded default on the instance no longer wins', async () => {
    b24 = buildHook()
    const client = b24.getHttpClient(ApiVersion.v2)
    client.ajaxClient.defaults.headers['Content-Type'] = 'application/x-www-form-urlencoded'
    const post = vi.spyOn(client.ajaxClient, 'post').mockResolvedValue(okResponse as never)

    await client.call('user.get', { filter: { ACTIVE: false } }, 'req-533')

    expect(post.mock.calls[0]?.[2]?.headers?.['Content-Type']).toBe('application/json')
  })

  // Per request rather than on the instance, deliberately. Measured: an
  // instance-level `application/json` sticks to a `FormData` body and replaces
  // the multipart boundary axios would have computed — so setting it there
  // would break a caller who posts their own form data through `ajaxClient`.
  it('leaves the instance default alone, so a caller\'s own FormData still works', async () => {
    b24 = buildHook()
    const client = b24.getHttpClient(ApiVersion.v2)

    const instanceDefault = client.ajaxClient.defaults.headers['Content-Type']

    expect(instanceDefault).toBeUndefined()
  })
})

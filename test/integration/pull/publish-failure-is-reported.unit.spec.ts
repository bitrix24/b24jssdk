/**
 * A failed publish must not look like a successful one.
 *
 * `*.unit.spec.ts` (testing.md's exception): the behaviour under test is what
 * happens when the portal REFUSES a request, and a live portal that answers
 * correctly cannot produce it. Per that exception the seam is
 * `vi.spyOn(httpClient.ajaxClient, 'post')` — the axios client — so the real
 * `HttpV2.call()` runs and builds the `AjaxError` / `AjaxResult` the SDK would
 * really hand to `ChannelManager`.
 *
 * That seam is load-bearing rather than stylistic. An earlier version of this
 * file replaced `actions.v2.call.make` wholesale with a hand-built fake, which
 * cut out the retry loop and `isSoftError()`. A refusal reaches
 * `ChannelManager` in TWO shapes — a thrown `AjaxError`, and a RESOLVED
 * non-success `AjaxResult` on the soft-error path — and the fake only ever
 * produced the first. Restoring the old silent-drop behaviour through the
 * second left the whole suite green.
 *
 * This was measured on a real portal before any of it was written. `PullClient`
 * reported that a message had been accepted, nothing ever arrived, and nothing
 * anywhere said why, because two independent defects lined up:
 *
 *  1. `sendMessageBatch` started the channel-id lookup and dropped the promise,
 *     so it resolved `undefined` before the lookup had answered.
 *  2. `ChannelManager.getPublicIds` caught the REST failure and resolved `{}`,
 *     so the message was encoded with no receivers and the push server dropped
 *     it silently.
 *
 * The underlying cause is not a bug at all, which is why the rejection says it
 * out loud: `pull.channel.public.list` is not part of the application REST
 * surface. An application's Pull client is documented as receive-only — the
 * back end puts messages into the channel with `pull.application.event.add`.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { AxiosError } from 'axios'
import { ApiVersion, B24Hook, ParamsFactory } from '../../../packages/jssdk/src/'
import { PullClient } from '../../../packages/jssdk/src/pullClient/client'
import { SdkError } from '../../../packages/jssdk/src/core/sdk-error'
import type { TypePullClientParams } from '../../../packages/jssdk/src/types/pull'

const TIME = {
  start: 0, finish: 0, duration: 0, processing: 0,
  date_start: '1970-01-01T00:00:00+00:00',
  date_finish: '1970-01-01T00:00:00+00:00',
  operating_reset_at: 1, operating: 0
}

const axiosResponse = (data: unknown, status = 200) => ({
  status, statusText: 'OK', headers: {}, config: {} as never, data
})

/** A thrown `AxiosError` — the delivery most REST failures take. */
function hardRefusal(code: string): AxiosError {
  return new AxiosError('Request failed with status code 400', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 400, statusText: 'Error', headers: {}, config: {} as never,
    data: { error: code, error_description: `simulated ${code}` }
  })
}

function buildHook(): B24Hook {
  return B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/SECRET', {
    restrictionParams: { ...ParamsFactory.getDefault(), retryDelay: 1 }
  })
}

function buildClient(b24: B24Hook): PullClient {
  const client = new PullClient({
    b24: b24 as unknown as TypePullClientParams['b24'],
    userId: 1,
    skipStorageInit: true
  })

  // The only gate on this path: `isPublishingSupported()` is `version > 3`,
  // `isJsonRpc()` is `version >= 5` (so 4 takes the protobuf branch, not RPC),
  // and `isPublishingEnabled()` reads `publish_enabled === true`. This is the
  // state a real portal produces for the branch under test.
  ;(client as unknown as { _config: unknown })._config = {
    server: { version: 4, publish_enabled: true }
  }

  return client
}

/** The portal's own descriptor shape: snake_case, ISO dates. */
const DESCRIPTOR = {
  user_id: '42',
  public_id: 'public-42',
  signature: 'sig-42',
  start: new Date(Date.now() - 60_000).toISOString(),
  end: new Date(Date.now() + 3_600_000).toISOString()
}

/** Put a connector in place whose `send()` answers however the case needs. */
function withConnector(client: PullClient, send: () => boolean) {
  ;(client as unknown as { _connectors: Record<string, unknown> })._connectors = {
    webSocket: { send, connected: true }
  }
  ;(client as unknown as { _connectionType: string })._connectionType = 'webSocket'
}

/** Reach the manager the client built, rather than constructing a second one. */
function managerOf(client: PullClient) {
  return (client as unknown as {
    _channelManager: { getPublicIds: (users: number[]) => Promise<Record<number, unknown>> }
  })._channelManager
}

describe('pull: a refused channel lookup is reported, not swallowed', () => {
  let b24: B24Hook | null = null

  afterEach(() => {
    vi.restoreAllMocks()
    b24?.destroy()
    b24 = null
  })

  it('rejects with a code a caller can branch on, when the portal throws', async () => {
    // The empty map this used to resolve is the dangerous answer: it is a
    // *valid* input to `encodeMessageBatch`, which then builds a message
    // addressed to nobody.
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v2).ajaxClient, 'post')
      .mockRejectedValue(hardRefusal('ERROR_METHOD_NOT_FOUND'))

    const error = await managerOf(buildClient(b24)).getPublicIds([42]).catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(SdkError)
    expect(error).toMatchObject({ code: 'JSSDK_PULL_PUBLIC_IDS_UNAVAILABLE' })
  })

  it('rejects the same way when the portal RESOLVES a non-success result', async () => {
    // The delivery a hand-built `TypeB24` fake cannot produce.
    // `AbstractHttp.call()` resolves a non-success `AjaxResult` whenever
    // `isSoftError()` is true instead of throwing. Before this was handled
    // explicitly, the rejection here happened only because reading `.result`
    // off `getData()`'s `undefined` threw a `TypeError` — and the log then
    // carried that `TypeError` rather than the portal's own message.
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v2).ajaxClient, 'post')
      .mockResolvedValue(axiosResponse({
        error: 'ERROR_ENTITY_NOT_FOUND',
        error_description: 'simulated soft error',
        time: TIME
      }))

    const error = await managerOf(buildClient(b24)).getPublicIds([42]).catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(SdkError)
    expect(error).toMatchObject({ code: 'JSSDK_PULL_PUBLIC_IDS_UNAVAILABLE' })
    // The CODE alone does not pin this branch: without it the request still
    // ends in a rejection carrying the same code, from the "no channel for any
    // user" check further down. What only this branch provides is the portal's
    // own words as the cause — and an answer to "why" is the entire point of
    // the change.
    expect(String(((error as SdkError).originalError as Error | undefined)?.message))
      .toContain('simulated soft error')
  })

  it('rejects when the portal answers 200 with no result', async () => {
    // Neither a refusal nor an answer. It used to take the same accidental
    // `TypeError` and then tell the reader the method was missing from the
    // application surface — while the portal had plainly answered.
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v2).ajaxClient, 'post')
      .mockResolvedValue(axiosResponse({ time: TIME }))

    const error = await managerOf(buildClient(b24)).getPublicIds([42]).catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(SdkError)
    expect(error).toMatchObject({ code: 'JSSDK_PULL_PUBLIC_IDS_UNAVAILABLE' })
  })

  it('carries the cause, so a caller can tell permanent from transient', async () => {
    // The description asserts "the method is not in the application surface",
    // which is permanent. A 503 is not. Without `originalError` the caller
    // cannot tell whether retrying is pointless or correct.
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v2).ajaxClient, 'post')
      .mockRejectedValue(hardRefusal('ERROR_METHOD_NOT_FOUND'))

    const error = await managerOf(buildClient(b24)).getPublicIds([42]).catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(SdkError)
    expect((error as SdkError).originalError).toBeInstanceOf(Error)
  })

  it('names the method that failed and the supported alternative', async () => {
    // The whole point: the message has to answer "why did my message go
    // nowhere?" without a debugger. Led by the instance assertion, because
    // without one a non-rejection makes `message` the string "undefined",
    // which contains neither needle and passes vacuously.
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v2).ajaxClient, 'post')
      .mockRejectedValue(hardRefusal('ERROR_METHOD_NOT_FOUND'))

    const error = await managerOf(buildClient(b24)).getPublicIds([42]).catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(SdkError)
    expect((error as Error).message).toContain('pull.channel.public.list')
    expect((error as Error).message).toContain('pull.application.event.add')
  })

  it('interpolates no caller value into the description', async () => {
    // `SdkError` does NOT run its description through the log redaction, so a
    // caller value reaching it would travel into logs and error messages
    // verbatim. Only the method name — a constant — is interpolated. The user
    // id is a distinctive number rather than `42`, which is short enough to
    // appear by accident in any future wording.
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v2).ajaxClient, 'post')
      .mockRejectedValue(hardRefusal('ERROR_METHOD_NOT_FOUND'))

    const error = await managerOf(buildClient(b24)).getPublicIds([987_654_321]).catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(SdkError)
    expect((error as Error).message).not.toContain('987654321')
  })

  it('sendMessage() REJECTS rather than reporting a send that never happened', async () => {
    // The defect this file exists for. `sendMessageBatch` used to start the
    // channel lookup and drop the promise, so `sendMessage()` reported success
    // before the lookup had even answered, and the failure inside became an
    // unhandled rejection nobody saw. Reverting the `return` in `client.ts`
    // turns this case green again.
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v2).ajaxClient, 'post')
      .mockRejectedValue(hardRefusal('ERROR_METHOD_NOT_FOUND'))
    const client = buildClient(b24)
    const lookup = vi.spyOn(managerOf(client) as never, 'getPublicIds')

    await expect(
      client.sendMessage([42], 'application', 'probe', { hello: 'world' })
    ).rejects.toMatchObject({ code: 'JSSDK_PULL_PUBLIC_IDS_UNAVAILABLE' })

    // Without this, rejecting the right code from BEFORE the lookup — never
    // touching the channel manager, never encoding, never sending — also
    // passes, and publishing would be entirely broken with the suite green.
    expect(lookup).toHaveBeenCalledWith([42])
  })

  it('sendMessage() encodes and sends when the lookup succeeds', async () => {
    // The success half. Deleting the `connector.send(...)` outright used to
    // leave every case here green, which is the PR's own headline symptom
    // reproduced under a passing suite.
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v2).ajaxClient, 'post')
      .mockResolvedValue(axiosResponse({
        result: {
          42: {
            user_id: 42,
            public_id: 'public-42',
            signature: 'sig-42',
            start: '1970-01-01T00:00:00+00:00',
            end: '2099-01-01T00:00:00+00:00'
          }
        },
        time: TIME
      }))

    const client = buildClient(b24)
    const send = vi.fn(() => true)
    ;(client as unknown as { _connectors: Record<string, unknown> })._connectors = {
      webSocket: { send, connected: true }
    }
    ;(client as unknown as { _connectionType: string })._connectionType = 'webSocket'

    await expect(
      client.sendMessage([42], 'application', 'probe', { hello: 'world' })
    ).resolves.toBe(true)

    expect(send).toHaveBeenCalledTimes(1)
    // What went out must be the encoded batch, not an empty frame.
    expect((send.mock.calls[0] as unknown[])[0]).toBeInstanceOf(Uint8Array)
    expect(((send.mock.calls[0] as unknown[])[0] as Uint8Array).byteLength).toBeGreaterThan(0)
  })

  it('rejects when the connector refuses the frame', async () => {
    // `send()` returns `false` when the frame did not leave — the socket is not
    // open, or long-polling has no publication path. Returning that boolean to
    // the caller reproduced this file's whole subject one layer further out: a
    // publish that never happened, reported as a resolved promise.
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v2).ajaxClient, 'post')
      .mockResolvedValue(axiosResponse({ result: { 42: DESCRIPTOR }, time: TIME }))

    const client = buildClient(b24)
    withConnector(client, () => false)

    await expect(
      client.sendMessage([42], 'application', 'probe', { hello: 'world' })
    ).rejects.toMatchObject({ code: 'JSSDK_PULL_SEND_REFUSED' })
  })

  it('rejects when there is no connector at all', async () => {
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v2).ajaxClient, 'post')
      .mockResolvedValue(axiosResponse({ result: { 42: DESCRIPTOR }, time: TIME }))

    const client = buildClient(b24)
    ;(client as unknown as { _connectors: Record<string, unknown> })._connectors = {}

    await expect(
      client.sendMessage([42], 'application', 'probe', { hello: 'world' })
    ).rejects.toMatchObject({ code: 'JSSDK_PULL_SEND_REFUSED' })
  })

  it('rejects with an SdkError when the portal has not enabled publishing', async () => {
    // The guard used to throw a bare `Error`, which the checklist forbids and
    // which a caller cannot branch on.
    b24 = buildHook()
    const client = buildClient(b24)
    ;(client as unknown as { _config: unknown })._config = {
      server: { version: 4, publish_enabled: false }
    }

    const error = await client
      .sendMessage([42], 'application', 'probe', {})
      .catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(SdkError)
    expect(error).toMatchObject({ code: 'JSSDK_PULL_PUBLISHING_DISABLED' })
  })

  it('sendMessageToChannels() never reaches the lookup, so it cannot raise this code', async () => {
    // Both docs claimed this method rejects the same way. It does not: it
    // carries `channelList` and no `userList`, so `userIds` is empty,
    // `getPublicIds([])` takes the early return, and `pull.channel.public.list`
    // is never called. A reader who wrote a catch on that code for this method
    // would be waiting for something that cannot arrive.
    b24 = buildHook()
    const post = vi.spyOn(b24.getHttpClient(ApiVersion.v2).ajaxClient, 'post')
      .mockRejectedValue(hardRefusal('ERROR_METHOD_NOT_FOUND'))

    const client = buildClient(b24)
    const send = vi.fn(() => true)
    ;(client as unknown as { _connectors: Record<string, unknown> })._connectors = {
      webSocket: { send, connected: true }
    }
    ;(client as unknown as { _connectionType: string })._connectionType = 'webSocket'

    await expect(
      client.sendMessageToChannels(['public-1.signature-1'], 'application', 'probe', {})
    ).resolves.toBe(true)

    expect(post).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledTimes(1)
  })
})

/**
 * Regression for https://github.com/bitrix24/b24jssdk/issues/39
 *
 * The HTTP layer used to log the full request URL — including the webhook
 * secret path segment — at INFO level on every REST call. When a consumer
 * wired their own logger via `B24Hook.setLogger(...)`, the secret leaked to
 * every sink that logger ships to (stdout, files, third-party aggregators).
 *
 * This spec exercises the SDK with a synthetic webhook URL whose secret is
 * a recognisable sentinel, mocks the axios client so no network traffic
 * leaves the machine, and asserts that the captured logger context never
 * contains the sentinel — regardless of which path (success/error) ran and
 * how many retries fired.
 *
 * `*.unit.spec.ts` keeps this file in the `jsSdk:integration` Vitest
 * project but signals (alongside `batch-null-result.unit.spec.ts`) that the
 * spec does not need a real Bitrix24 portal — `.env.test` / `B24_HOOK` are
 * not required.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { AxiosError } from 'axios'
import {
  ApiVersion,
  B24Hook,
  ParamsFactory
} from '../../../packages/jssdk/src/'
import { AjaxError } from '../../../packages/jssdk/src/core/http/ajax-error'
import { redactSensitiveParams } from '../../../packages/jssdk/src/core/http/redact'
import type { LoggerInterface } from '../../../packages/jssdk/src/types/logger'

const FAKE_SECRET = 'SECRET_TOKEN_REDACTION_SENTINEL_xyz123'
const V2_PATH_FRAGMENT = '/rest/1/'
const V3_PATH_FRAGMENT = '/rest/api/1/'

type CapturedLog = { level: string, message: string, context?: Record<string, any> }

function buildCapturingLogger(captured: CapturedLog[]): LoggerInterface {
  const sink = (level: string) =>
    async (message: string, context?: Record<string, any>) => {
      captured.push({ level, message, context })
    }
  return {
    log: async (level: any, message: string, context?: Record<string, any>) => {
      captured.push({ level: String(level), message, context })
    },
    debug: sink('debug'),
    info: sink('info'),
    notice: sink('notice'),
    warning: sink('warning'),
    error: sink('error'),
    critical: sink('critical'),
    alert: sink('alert'),
    emergency: sink('emergency')
  }
}

function buildClient(version: 'v2' | 'v3'): B24Hook {
  const url = version === 'v2'
    ? `https://example.bitrix24.com/rest/1/${FAKE_SECRET}`
    : `https://example.bitrix24.com/rest/api/1/${FAKE_SECRET}`
  return B24Hook.fromWebhookUrl(url, {
    restrictionParams: { ...ParamsFactory.getDefault(), retryDelay: 1 }
  })
}

function mockSuccessfulPost(b24: B24Hook, version: ApiVersion): void {
  const httpClient = b24.getHttpClient(version)
  vi.spyOn(httpClient.ajaxClient, 'post').mockResolvedValue({
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as never,
    data: {
      result: { ID: 1 },
      time: {
        start: 0,
        finish: 0,
        duration: 0,
        processing: 0,
        date_start: '1970-01-01T00:00:00+00:00',
        date_finish: '1970-01-01T00:00:00+00:00',
        operating_reset_at: 1,
        operating: 0
      }
    }
  })
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    // Cycle / non-serialisable: fall back to a string coercion so the assertion
    // can still scan for the sentinel without crashing the whole test run.
    return String(value)
  }
}

function assertNoSecretLeak(
  captured: CapturedLog[],
  pathFragment: string
): void {
  for (const entry of captured) {
    const blob = `${entry.message} ${safeStringify(entry.context ?? {})}`
    expect(blob, `secret leaked in log entry "${entry.message}"`).not.toContain(FAKE_SECRET)
    expect(blob, `webhook path leaked in log entry "${entry.message}"`).not.toContain(pathFragment)
  }
}

describe('core.http logger redaction @issue-39', () => {
  let b24: B24Hook | null = null

  afterEach(() => {
    vi.restoreAllMocks()
    b24?.destroy()
    b24 = null
  })

  it('v2 success: post/send context contains bare method name, never the URL/secret', async () => {
    b24 = buildClient('v2')
    mockSuccessfulPost(b24, ApiVersion.v2)
    const captured: CapturedLog[] = []
    b24.setLogger(buildCapturingLogger(captured))

    await b24.actions.v2.call.make({ method: 'user.current', params: {} })

    assertNoSecretLeak(captured, V2_PATH_FRAGMENT)

    const postSend = captured.find(e => e.message === 'post/send')
    expect(postSend, 'post/send must fire on a successful call').toBeDefined()
    expect(postSend!.context!.method).toBe('user.current')

    const postResponse = captured.find(e => e.message === 'post/response')
    expect(postResponse, 'post/response must fire on a successful call').toBeDefined()
    expect(postResponse!.context).not.toHaveProperty('method')
  })

  it('v3 success: post/send context contains bare method name, never the URL/secret', async () => {
    b24 = buildClient('v3')
    mockSuccessfulPost(b24, ApiVersion.v3)
    const captured: CapturedLog[] = []
    b24.setLogger(buildCapturingLogger(captured))

    await b24.actions.v3.call.make({ method: 'tasks.task.get', params: { taskId: 1 } })

    assertNoSecretLeak(captured, V3_PATH_FRAGMENT)

    const postSend = captured.find(e => e.message === 'post/send')
    expect(postSend).toBeDefined()
    expect(postSend!.context!.method).toBe('tasks.task.get')

    const postResponse = captured.find(e => e.message === 'post/response')
    expect(postResponse, 'post/response must fire on a successful v3 call').toBeDefined()
    expect(postResponse!.context).not.toHaveProperty('method')
  })

  it('v2 error: post/catchError logs requestId/status only, never the URL/secret', async () => {
    b24 = buildClient('v2')
    const httpClient = b24.getHttpClient(ApiVersion.v2)
    vi.spyOn(httpClient.ajaxClient, 'post').mockRejectedValue(
      new AxiosError(
        'Request failed with status code 500',
        'ERR_BAD_RESPONSE',
        undefined,
        undefined,
        {
          status: 500,
          statusText: 'Internal Server Error',
          headers: {},
          config: {} as never,
          data: { error: 'INTERNAL_SERVER_ERROR', error_description: 'simulated failure' }
        }
      )
    )
    const captured: CapturedLog[] = []
    b24.setLogger(buildCapturingLogger(captured))

    await expect(
      b24.actions.v2.call.make({ method: 'user.current', params: {} })
    ).rejects.toBeDefined()

    assertNoSecretLeak(captured, V2_PATH_FRAGMENT)

    const postCatch = captured.find(e => e.message === 'post/catchError')
    expect(postCatch, 'post/catchError must fire on an axios rejection').toBeDefined()
    expect(postCatch!.context!.requestId).toBeTruthy()
    expect(postCatch!.context).not.toHaveProperty('url')
    expect(postCatch!.context).not.toHaveProperty('method')
  })

  it('AjaxError.toString() never embeds the webhook URL', () => {
    // Mirrors the shape `_convertAxiosErrorToAjaxError` produces internally.
    const err = new AjaxError({
      code: 'INTERNAL_SERVER_ERROR',
      status: 500,
      requestInfo: {
        method: 'user.current',
        params: {},
        requestId: 'test-request-id'
      }
    })

    const rendered = err.toString() + ' ' + JSON.stringify(err.toJSON())
    expect(rendered).not.toContain(FAKE_SECRET)
    expect(rendered).not.toContain(V2_PATH_FRAGMENT)
  })

  it('post/send redacts credential-bearing keys from params (OAuth `auth` access_token, user-supplied `password`/`token`)', async () => {
    b24 = buildClient('v2')
    mockSuccessfulPost(b24, ApiVersion.v2)
    const captured: CapturedLog[] = []
    b24.setLogger(buildCapturingLogger(captured))

    // The values below stand in for credentials that would otherwise enter the
    // info-level `post/send` log via `JSON.stringify(paramsFormatted)`:
    //  - `auth` is the field `_prepareParams` injects for OAuth flows
    //    (`result.auth = authData.access_token`) — webhook auth skips it, but
    //    OAuth/Frame leak it on every call without this redaction.
    //  - `password` / `token` model a caller passing sensitive business fields
    //    directly inside params (e.g. a CRM custom field).
    await b24.actions.v2.call.make({
      method: 'crm.deal.add',
      params: {
        fields: { TITLE: 'safe' },
        auth: 'OAUTH_ACCESS_TOKEN_LEAK_PROBE_aaa',
        password: 'USER_PASSWORD_LEAK_PROBE_bbb',
        token: 'USER_TOKEN_LEAK_PROBE_ccc'
      } as Record<string, any>
    })

    const postSend = captured.find(e => e.message === 'post/send')
    expect(postSend, 'post/send must fire').toBeDefined()
    const serialized = JSON.stringify(postSend!.context)
    expect(serialized).not.toContain('OAUTH_ACCESS_TOKEN_LEAK_PROBE_aaa')
    expect(serialized).not.toContain('USER_PASSWORD_LEAK_PROBE_bbb')
    expect(serialized).not.toContain('USER_TOKEN_LEAK_PROBE_ccc')
    expect(serialized).toContain('***REDACTED***')
  })

  it('AjaxError.toJSON()/toString() redacts credential-bearing keys in requestInfo.params', () => {
    const err = new AjaxError({
      code: 'JSSDK_INTERNAL_AJAX_ERROR',
      status: 500,
      requestInfo: {
        method: 'crm.deal.add',
        params: {
          fields: { TITLE: 'safe' },
          auth: 'OAUTH_TOKEN_PROBE_xxx',
          password: 'USER_PASSWORD_PROBE_yyy'
        } as Record<string, any>,
        requestId: 'test-request-id'
      }
    })

    const jsonBlob = JSON.stringify(err.toJSON())
    expect(jsonBlob).not.toContain('OAUTH_TOKEN_PROBE_xxx')
    expect(jsonBlob).not.toContain('USER_PASSWORD_PROBE_yyy')
    expect(jsonBlob).toContain('***REDACTED***')
    // Non-sensitive payload survives so error stays diagnosable.
    expect(jsonBlob).toContain('TITLE')

    const stringBlob = err.toString()
    expect(stringBlob).not.toContain('OAUTH_TOKEN_PROBE_xxx')
    expect(stringBlob).not.toContain('USER_PASSWORD_PROBE_yyy')
  })

  it('retry path does not leak the secret across multiple attempts', async () => {
    b24 = buildClient('v2')
    const httpClient = b24.getHttpClient(ApiVersion.v2)
    // First attempt rejects, second succeeds — exercises the `http request
    // attempt` / `http wait` debug logs and `post/catchError` in one flow.
    const successResponse = {
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as never,
      data: {
        result: { ok: true },
        time: {
          start: 0, finish: 0, duration: 0, processing: 0,
          date_start: '1970-01-01T00:00:00+00:00',
          date_finish: '1970-01-01T00:00:00+00:00',
          operating_reset_at: 1, operating: 0
        }
      }
    }
    vi.spyOn(httpClient.ajaxClient, 'post')
      .mockRejectedValueOnce(new AxiosError(
        'Request failed with status code 503',
        'ERR_BAD_RESPONSE',
        undefined,
        undefined,
        {
          status: 503,
          statusText: 'Service Unavailable',
          headers: {},
          config: {} as never,
          data: { error: 'QUERY_LIMIT_EXCEEDED', error_description: 'transient' }
        }
      ))
      .mockResolvedValue(successResponse)
    await b24.setRestrictionManagerParams({
      ...ParamsFactory.getDefault(),
      retryDelay: 1
    })
    const captured: CapturedLog[] = []
    b24.setLogger(buildCapturingLogger(captured))

    await b24.actions.v2.call.make({ method: 'user.current', params: {} })

    assertNoSecretLeak(captured, V2_PATH_FRAGMENT)
    // Sanity: both attempts left a trace.
    expect(captured.some(e => e.message === 'post/catchError')).toBe(true)
    expect(captured.filter(e => e.message === 'post/send').length).toBeGreaterThanOrEqual(2)
  })

  it('v3 error path: post/catchError does not leak the secret', async () => {
    b24 = buildClient('v3')
    const httpClient = b24.getHttpClient(ApiVersion.v3)
    vi.spyOn(httpClient.ajaxClient, 'post').mockRejectedValue(
      new AxiosError(
        'Request failed with status code 500',
        'ERR_BAD_RESPONSE',
        undefined,
        undefined,
        {
          status: 500,
          statusText: 'Internal Server Error',
          headers: {},
          config: {} as never,
          data: { error: 'INTERNAL_SERVER_ERROR', error_description: 'boom' }
        }
      )
    )
    const captured: CapturedLog[] = []
    b24.setLogger(buildCapturingLogger(captured))

    await expect(
      b24.actions.v3.call.make({ method: 'tasks.task.get', params: { taskId: 1 } })
    ).rejects.toBeDefined()

    assertNoSecretLeak(captured, V3_PATH_FRAGMENT)
  })

  it('redacts credential keys even when the value is an empty string (token = "")', async () => {
    b24 = buildClient('v2')
    mockSuccessfulPost(b24, ApiVersion.v2)
    const captured: CapturedLog[] = []
    b24.setLogger(buildCapturingLogger(captured))

    // An empty token is unusual but should still be redacted — leaving an
    // empty `access_token: ""` visible would advertise that the field
    // exists and how the SDK names it, which a falsy-guard would skip.
    await b24.actions.v2.call.make({
      method: 'user.current',
      params: { access_token: '', auth: '', token: '' } as Record<string, any>
    })

    const postSend = captured.find(e => e.message === 'post/send')
    expect(postSend).toBeDefined()
    const serialized = JSON.stringify(postSend!.context)
    expect(serialized).not.toMatch(/"access_token"\s*:\s*""/)
    expect(serialized).not.toMatch(/"auth"\s*:\s*""/)
    expect(serialized).not.toMatch(/"token"\s*:\s*""/)
    expect(serialized).toContain('***REDACTED***')
  })

  it('redacts credentials nested one level deep in params (e.g. data.access_token)', async () => {
    b24 = buildClient('v2')
    mockSuccessfulPost(b24, ApiVersion.v2)
    const captured: CapturedLog[] = []
    b24.setLogger(buildCapturingLogger(captured))

    // A caller might tunnel a credential under a nested object (`data`,
    // `fields`, or a batch entry); the helper walks one level so this is
    // still masked. Goes via a regular call so the mock path stays valid.
    await b24.actions.v2.call.make({
      method: 'crm.deal.add',
      params: {
        fields: { TITLE: 'safe', access_token: 'NESTED_ACCESS_TOKEN_PROBE_qqq' },
        data: { token: 'NESTED_TOKEN_PROBE_rrr' }
      } as Record<string, any>
    })

    const postSend = captured.find(e => e.message === 'post/send')
    expect(postSend).toBeDefined()
    const serialized = JSON.stringify(postSend!.context)
    expect(serialized).not.toContain('NESTED_ACCESS_TOKEN_PROBE_qqq')
    expect(serialized).not.toContain('NESTED_TOKEN_PROBE_rrr')
    expect(serialized).toContain('***REDACTED***')
    expect(serialized).toContain('TITLE') // non-sensitive sibling survives
  })

  it('redactSensitiveParams: directly exercises depth-1 walk through arrays and objects', () => {
    // Direct helper test so the contract is pinned independent of the
    // SDK call chain — `cmd[i].params.<key>` (batch shape) is the
    // motivating example.
    const out = redactSensitiveParams({
      halt: 0,
      cmd: [
        { method: 'user.current', params: { access_token: 'A' } },
        { method: 'profile', params: { token: 'B' } }
      ],
      top_secret: { token: 'C' },
      auth: 'D',
      access_token: ''
    } as Record<string, unknown>)

    // Top-level credential key — masked.
    expect(out.auth).toBe('***REDACTED***')
    // Empty string is still masked (not skipped by a falsy guard).
    expect(out.access_token).toBe('***REDACTED***')
    // Array contents are walked one level.
    const cmd = out.cmd as Array<{ params: Record<string, unknown> }>
    expect(cmd[0].params.access_token).toBe('***REDACTED***')
    expect(cmd[1].params.token).toBe('***REDACTED***')
    // Nested object one level deep — credential key inside is masked.
    expect((out.top_secret as Record<string, unknown>).token).toBe('***REDACTED***')
  })
})

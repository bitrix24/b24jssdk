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

function assertNoSecretLeak(
  captured: CapturedLog[],
  pathFragment: string
): void {
  for (const entry of captured) {
    const blob = `${entry.message} ${JSON.stringify(entry.context ?? {})}`
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
    b24 = buildClient('v2')
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
})

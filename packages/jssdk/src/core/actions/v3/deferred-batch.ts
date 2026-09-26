import type { BatchCommandsUniversal, CommandObject, CommandTuple } from '../../../types/http'
import type { AjaxResult } from '../../http/ajax-result'
import { AbstractAction } from '../abstract-action'
import { ApiVersion } from '../../../types/b24'
import { Result } from '../../result'
import { SdkError } from '../../sdk-error'
import { ParseRow } from '../../interaction/batch/parse-row'

/**
 * Where a deferred batch job is. `pending` and `processing` are still running;
 * `done` and `error` are final. (Measured live: `pending → done`; `processing`
 * and `error` are the rest of the portal's enum, not yet observed.) Any other
 * value is treated as still running until `timeout`.
 */
export type DeferredBatchStatus = 'pending' | 'processing' | 'done' | 'error'

/**
 * A deferred batch job as the portal describes it (`bitrix.rest.deferredbatchdto`).
 */
export interface DeferredBatchJob {
  id: number
  status: DeferredBatchStatus
  /** The commands as the portal stored them: `{ method, query }` each. */
  commands?: Array<{ method: string, query: Record<string, unknown> }>
  createdAt?: string
  updatedAt?: string
  /** Set once the job is `done`: the disk file that holds the results. */
  resultFileId?: number | null
  /** Set when the job is `error`. */
  errorMessage?: string | null
}

/**
 * Commands for a deferred batch: `[['method', params], …]`, `[{ method, params }, …]`,
 * or the two mixed. Named commands are not supported: the result file is an
 * array in command order.
 */
export type DeferredBatchCalls = BatchCommandsUniversal

export type ActionDeferredBatchAddV3 = {
  calls: DeferredBatchCalls
  /**
   * `Idempotency-Key` for the `add` call. `add` is a create call, so the
   * portal's idempotency rules apply (a repeat with the same key and body
   * replays the first answer) — observed only as far as the key being echoed.
   * Give each run its own key: a key reused after the job was deleted replays
   * the id of a job that no longer exists.
   */
  idempotencyKey?: string
  requestId?: string
}

export type ActionDeferredBatchWaitV3 = {
  /** Milliseconds between two `get` calls. Default `2000`, minimum `250`. */
  pollInterval?: number
  /** Milliseconds to wait for a final status before giving up. Default `600000` (10 minutes). */
  timeout?: number
  /** Stops waiting when aborted. The job itself keeps running on the portal. */
  signal?: AbortSignal
  /** Called with the job every time its status changes, the first status included. */
  onStatus?: (job: DeferredBatchJob) => void
}

export type ActionDeferredBatchV3 = ActionDeferredBatchAddV3 & ActionDeferredBatchWaitV3 & {
  /**
   * Delete the job — and with it the result file — once its rows are read.
   * Default `true`. Set `false` to keep it, e.g. to download the file again.
   */
  deleteAfter?: boolean
}

const DEFAULT_POLL_INTERVAL = 2_000
const MIN_POLL_INTERVAL = 250
const DEFAULT_TIMEOUT = 600_000

/**
 * Deferred (background) batch for large command sets. `restApi:v3`
 *
 * The portal takes all commands in one `rest.deferredbatch.add` call — thousands
 * of them, well past the 50 of a synchronous `batch` — runs them in the
 * background, and stores the results as a gzip-compressed JSON file. This action
 * wraps the `rest.deferredbatch.*` family:
 *
 * - {@link DeferredBatchV3.make} does everything in one call: add, wait with a
 *   status callback, download, decode, delete — and resolves with the rows.
 * - {@link DeferredBatchV3.add}, {@link DeferredBatchV3.get},
 *   {@link DeferredBatchV3.waitFor}, {@link DeferredBatchV3.download},
 *   {@link DeferredBatchV3.delete} and {@link DeferredBatchV3.list} are the
 *   single steps, for when you run the flow yourself (a job started in one
 *   request and collected in another, a queue worker, a UI with its own polling).
 * - {@link DeferredBatchV3.decode} turns the downloaded bytes into rows.
 *
 * A row is what that command returned, in command order — measured to be the
 * same shape as one entry of a synchronous v3 `batch` result (`{ item }`,
 * `{ items }`, …). How a failed command appears in the rows is not yet measured.
 *
 * Needs a portal plan that includes deferred batches; on other plans every
 * call answers `FEATURE_NOT_AVAILABLE_ON_CURRENT_PLAN`. The whole result file is
 * held in memory while it is decoded.
 */
export class DeferredBatchV3 extends AbstractAction {
  /**
   * Runs a deferred batch end to end and resolves with its rows.
   *
   * Adds the job, polls it until it is `done` or `error` (calling `onStatus` on
   * every change), downloads and decodes the result file, and deletes the job
   * unless `deleteAfter: false`. Never throws for what the portal answered:
   * check `isSuccess` on the returned `Result`. Throws only for malformed
   * `calls`, before anything is sent.
   *
   * @template T - The type of one row (one command's result).
   *
   * @param {ActionDeferredBatchV3} options
   *     - `calls` - the commands, `[['method', params], …]` or `[{ method, params }, …]`.
   *     - `idempotencyKey?` - sent with `add`; use one per run, so that a retry of an interrupted
   *       `make()` does not start a second job.
   *     - `requestId?` - sent as `bx24_request_id` on the `add` call.
   *     - `pollInterval?` - ms between status checks (default 2000).
   *     - `timeout?` - ms to wait for a final status (default 600000).
   *     - `signal?` - `AbortSignal` that stops waiting.
   *     - `onStatus?` - `(job) => void`, called on every status change.
   *     - `deleteAfter?` - delete the job after reading it (default `true`).
   *
   * @returns {Promise<Result<T[]>>} The rows in command order. On failure the
   *     `Result` carries the errors; `JSSDK_DEFERRED_BATCH_FAILED` when the job
   *     ended in `error`, `JSSDK_DEFERRED_BATCH_TIMEOUT` / `JSSDK_DEFERRED_BATCH_ABORTED`
   *     when waiting stopped, or a download error. The job is left on the portal
   *     in those cases; its id reaches you through `onStatus`, which is called
   *     with the job as soon as it is first read, so it can be collected later
   *     with {@link DeferredBatchV3.waitFor}.
   * @throws {SdkError} `JSSDK_DEFERRED_BATCH_EMPTY` for an empty `calls`,
   *     `JSSDK_INTERACTION_BATCH_ROW_FAIL` for a command that is neither a
   *     tuple nor a `{ method, params }` object.
   *
   * @example
   * import type { BatchCommandsArrayUniversal } from '@bitrix24/b24jssdk'
   *
   * const calls: BatchCommandsArrayUniversal = Array.from({ length: 2000 }, (_, i) =>
   *   ['tasks.task.get', { id: i + 1, select: ['id', 'title'] }]
   * )
   *
   * const response = await $b24.actions.v3.deferredBatch.make<{ item?: { id: number, title: string } }>({
   *   calls,
   *   onStatus: job => console.log(`deferred batch #${job.id}: ${job.status}`)
   * })
   *
   * if (!response.isSuccess) {
   *   throw new Error(response.getErrorMessages().join('; '))
   * }
   * const titles = response.getData()!.flatMap(row => row.item ? [row.item.title] : [])
   * console.log(`${titles.length} tasks read`)
   */
  public override async make<T = unknown>(options: ActionDeferredBatchV3): Promise<Result<T[]>> {
    const result = new Result<T[]>()

    const added = await this.add(options)
    if (!added.isSuccess) {
      return this.#carryErrors(added, result)
    }
    const id = added.getData()!.id

    const finished = await this.waitFor(id, options)
    if (!finished.isSuccess) {
      return this.#carryErrors(finished, result)
    }

    const rows = await this.download<T>(id)
    if (!rows.isSuccess) {
      return this.#carryErrors(rows, result)
    }

    if (options.deleteAfter !== false) {
      // A failed delete does not spoil rows already read: it is logged, and the
      // job expires on the portal's own schedule.
      const deleted = await this.delete(id)
      if (!deleted.isSuccess) {
        this._logger.warning('deferredBatch: the job was read but could not be deleted', {
          id,
          errors: deleted.getErrorMessages()
        }).catch(() => {})
      }
    }

    return result.setData(rows.getData())
  }

  /**
   * Adds a deferred batch job (`rest.deferredbatch.add`). The portal starts it
   * in the background; read its progress with {@link DeferredBatchV3.get} or
   * wait for it with {@link DeferredBatchV3.waitFor}.
   *
   * @param {ActionDeferredBatchAddV3} options - `calls`, and optionally `idempotencyKey` and `requestId`.
   * @returns {Promise<Result<DeferredBatchJob>>} The new job, usually `pending`.
   *
   * @example
   * const added = await $b24.actions.v3.deferredBatch.add({
   *   calls: [['tasks.task.get', { id: 1 }], ['tasks.task.get', { id: 2 }]],
   *   idempotencyKey: 'nightly-export-2026-09-26'
   * })
   * const jobId = added.getData()!.id // keep it, e.g. in your queue
   */
  public async add(options: ActionDeferredBatchAddV3): Promise<Result<DeferredBatchJob>> {
    const commands = this.#toCommands(options.calls)
    return this.#call<{ item: DeferredBatchJob }, DeferredBatchJob>(
      'rest.deferredbatch.add',
      { fields: { commands } },
      payload => payload.item,
      options.requestId,
      options.idempotencyKey
    )
  }

  /**
   * Reads one job (`rest.deferredbatch.get`).
   *
   * @param {number} id - The job id from {@link DeferredBatchV3.add}.
   * @returns {Promise<Result<DeferredBatchJob>>}
   *
   * @example
   * declare const jobId: number
   * const job = (await $b24.actions.v3.deferredBatch.get(jobId)).getData()!
   * if (job.status === 'done') {
   *   // ready to download
   * }
   */
  public async get(id: number): Promise<Result<DeferredBatchJob>> {
    return this.#call<{ item: DeferredBatchJob }, DeferredBatchJob>('rest.deferredbatch.get', { id }, payload => payload.item)
  }

  /**
   * Lists the jobs of this webhook or application (`rest.deferredbatch.list`).
   *
   * @returns {Promise<Result<DeferredBatchJob[]>>}
   */
  public async list(): Promise<Result<DeferredBatchJob[]>> {
    // Measured only empty, as `[]`; the usual v3 list envelope is `{ items }`.
    // Both are read, and anything else is an error rather than an empty list.
    return this.#call<DeferredBatchJob[] | { items?: DeferredBatchJob[] }, DeferredBatchJob[]>(
      'rest.deferredbatch.list',
      {},
      payload => Array.isArray(payload) ? payload : (Array.isArray(payload.items) ? payload.items : undefined)
    )
  }

  /**
   * Polls a job until it is `done` or `error`.
   *
   * Resolves successfully only for `done`. For `error` the `Result` carries
   * `JSSDK_DEFERRED_BATCH_FAILED` with the portal's `errorMessage`, and the job
   * as data. A timeout or an aborted `signal` stops waiting — not the job.
   *
   * @param {number} id - The job id.
   * @param {ActionDeferredBatchWaitV3} options - `pollInterval`, `timeout`, `signal`, `onStatus`.
   * @returns {Promise<Result<DeferredBatchJob>>} The job in its final state.
   *
   * @example
   * declare const jobId: number
   * declare const progressBar: { setLabel(text: string): void }
   * const controller = new AbortController()
   * const finished = await $b24.actions.v3.deferredBatch.waitFor(jobId, {
   *   pollInterval: 5_000,
   *   signal: controller.signal,
   *   onStatus: job => progressBar.setLabel(job.status)
   * })
   */
  public async waitFor(id: number, options: ActionDeferredBatchWaitV3 = {}): Promise<Result<DeferredBatchJob>> {
    const pollInterval = Math.max(MIN_POLL_INTERVAL, finiteOr(options.pollInterval, DEFAULT_POLL_INTERVAL))
    const timeout = Math.max(0, finiteOr(options.timeout, DEFAULT_TIMEOUT))
    const deadline = Date.now() + timeout
    const result = new Result<DeferredBatchJob>()
    let lastStatus: DeferredBatchStatus | undefined

    for (;;) {
      if (options.signal?.aborted) {
        return result.addError(new SdkError({
          code: 'JSSDK_DEFERRED_BATCH_ABORTED',
          description: 'deferredBatch: waiting was aborted; the job keeps running on the portal.',
          status: 499
        }), 'base-error')
      }

      const current = await this.get(id)
      if (!current.isSuccess) {
        return this.#carryErrors(current, result)
      }
      const job = current.getData()!

      if (job.status !== lastStatus) {
        lastStatus = job.status
        // A throwing callback — or an async one that rejects — must not stop
        // the wait, lose the job, or surface as an unhandled rejection.
        const report = (error: unknown) => {
          this._logger.warning('deferredBatch: onStatus threw', { id, error: String(error) }).catch(() => {})
        }
        try {
          const returned: unknown = options.onStatus?.(job)
          if (returned && typeof (returned as PromiseLike<unknown>).then === 'function') {
            Promise.resolve(returned).catch(report)
          }
        } catch (error) {
          report(error)
        }
      }

      if (job.status === 'done') {
        return result.setData(job)
      }
      if (job.status === 'error') {
        result.setData(job)
        return result.addError(new SdkError({
          code: 'JSSDK_DEFERRED_BATCH_FAILED',
          // Static text: the portal's own `errorMessage` stays on the job
          // (`getData().errorMessage`), since an `SdkError` description is not
          // redacted and that message is free text.
          description: 'deferredBatch: the job ended with status "error"; see the job\'s errorMessage.',
          status: 500
        }), 'base-error')
      }
      if (Date.now() + pollInterval > deadline) {
        return result.addError(new SdkError({
          code: 'JSSDK_DEFERRED_BATCH_TIMEOUT',
          description: `deferredBatch: no final status within ${timeout} ms; the job keeps running on the portal.`,
          status: 408
        }), 'base-error')
      }

      await this.#sleep(pollInterval, options.signal)
    }
  }

  /**
   * Gets the result file's download link (`rest.deferredbatch.downloadresult`).
   *
   * **The link is a credential**: on a webhook it contains the webhook secret,
   * on OAuth (per the portal's code, not yet measured) an access token. Do not log it or send it anywhere you would not
   * send those. Most callers want {@link DeferredBatchV3.download} instead.
   *
   * @param {number} id - The job id. The job must be `done`.
   * @returns {Promise<Result<string>>} The absolute URL of the `.json.gz` file.
   */
  public async getDownloadUrl(id: number): Promise<Result<string>> {
    return this.#call<{ downloadUrl: string }, string>('rest.deferredbatch.downloadresult', { id }, payload => payload.downloadUrl)
  }

  /**
   * Downloads a finished job's result file and decodes it into rows.
   *
   * @template T - The type of one row.
   * @param {number} id - The job id. The job must be `done`.
   * @returns {Promise<Result<T[]>>} The rows in command order.
   *
   * @example
   * declare const jobId: number
   * const rows = await $b24.actions.v3.deferredBatch.download<{ item: { id: number } }>(jobId)
   * console.log(rows.getData()!.length)
   */
  public async download<T = unknown>(id: number): Promise<Result<T[]>> {
    const result = new Result<T[]>()
    const link = await this.getDownloadUrl(id)
    if (!link.isSuccess) {
      return this.#carryErrors(link, result)
    }

    let bytes: ArrayBuffer
    try {
      // Through the SDK's own HTTP client, so a caller's proxy / agent settings
      // apply. `maxRedirects: 0`: the URL is a credential and must not be
      // carried to wherever a redirect points.
      const response = await this._b24.getHttpClient(ApiVersion.v3).ajaxClient.get<ArrayBuffer>(link.getData()!, {
        responseType: 'arraybuffer',
        maxRedirects: 0
      })
      // A refused redirect on the fetch adapter is an opaque response with
      // status 0, which axios resolves instead of rejecting.
      if (!response.status) {
        return result.addError(new SdkError({
          code: 'JSSDK_DEFERRED_BATCH_DOWNLOAD_FAILED',
          description: 'deferredBatch: the result file could not be downloaded (no status: a refused redirect or a dropped connection).',
          status: 0
        }), 'base-error')
      }
      bytes = response.data
    } catch (error) {
      // The URL is deliberately left out of the error: it carries the secret.
      const status = Number((error as { response?: { status?: number } })?.response?.status ?? 0)
      return result.addError(new SdkError({
        code: 'JSSDK_DEFERRED_BATCH_DOWNLOAD_FAILED',
        description: `deferredBatch: the result file could not be downloaded (HTTP ${status || 'no response'}).`,
        status: status || 500
      }), 'base-error')
    }

    try {
      return result.setData(await this.decode(bytes) as T[])
    } catch (error) {
      return result.addError(error instanceof Error ? error : new Error(String(error)), 'base-error')
    }
  }

  /**
   * Decodes the bytes of a result file into rows: gunzips them (the file is
   * `application/gzip`) and parses the JSON array inside. Bytes that are not
   * gzip — a proxy that already inflated them — are parsed as they are.
   *
   * Uses the standard `DecompressionStream`, available in Node.js 18+ and every
   * current browser.
   *
   * @param {ArrayBuffer | Uint8Array} bytes - The file contents.
   * @returns {Promise<unknown[]>} The rows.
   * @throws {SdkError} `JSSDK_DEFERRED_BATCH_DECODE_FAILED` when the content is
   *     not a JSON array, `JSSDK_DEFERRED_BATCH_GZIP_UNSUPPORTED` when the
   *     runtime has no `DecompressionStream`.
   *
   * @example
   * declare const bytes: Uint8Array
   * // The file was fetched some other way, e.g. by a separate worker. If you
   * // fetch the link yourself, refuse redirects (`redirect: 'error'`): the link
   * // is a credential.
   * const rows = await $b24.actions.v3.deferredBatch.decode(bytes)
   */
  public async decode(bytes: ArrayBuffer | Uint8Array): Promise<unknown[]> {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
    const isGzip = data.length >= 2 && data[0] === 0x1F && data[1] === 0x8B
    const text = new TextDecoder().decode(isGzip ? await gunzip(data) : data)

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = undefined
    }
    if (!Array.isArray(parsed)) {
      throw new SdkError({
        code: 'JSSDK_DEFERRED_BATCH_DECODE_FAILED',
        description: 'deferredBatch: the result file is not a JSON array.',
        status: 500
      })
    }
    return parsed
  }

  /**
   * Deletes a job and its result file (`rest.deferredbatch.delete`). The
   * download link stops working.
   *
   * @param {number} id - The job id.
   * @returns {Promise<Result<boolean>>}
   */
  public async delete(id: number): Promise<Result<boolean>> {
    return this.#call<unknown, boolean>('rest.deferredbatch.delete', { id }, () => true)
  }

  #toCommands(calls: DeferredBatchCalls): Array<{ method: string, query: Record<string, unknown> }> {
    if (!Array.isArray(calls) || calls.length === 0) {
      throw new SdkError({
        code: 'JSSDK_DEFERRED_BATCH_EMPTY',
        description: 'deferredBatch: `calls` must be a non-empty array of commands.',
        status: 400
      })
    }
    return (calls as Array<CommandObject | CommandTuple>).map((row) => {
      const command = ParseRow.getBatchCommand(row, { parallelDefaultValue: false })
      return { method: command.method, query: (command.query ?? {}) as Record<string, unknown> }
    })
  }

  /**
   * One `rest.deferredbatch.*` call, as a `Result`. A portal refusal on v3 (a
   * 403 for a plan without the feature) already comes back as a failed
   * `AjaxResult`; anything the transport throws instead — a key it refuses
   * before sending, a network error after its retries — becomes an error on
   * the `Result` too, so `make()` and the steps never throw for either.
   */
  async #call<P, D>(
    method: string,
    params: Record<string, unknown>,
    pick: (payload: P) => D | undefined,
    requestId?: string,
    idempotencyKey?: string
  ): Promise<Result<D>> {
    const result = new Result<D>()
    let response: AjaxResult<P>
    try {
      response = await this._b24.getHttpClient(ApiVersion.v3).call<P>(
        method,
        params,
        requestId,
        undefined === idempotencyKey ? undefined : { idempotencyKey }
      )
    } catch (error) {
      return result.addError(error instanceof Error ? error : new Error(String(error)), 'base-error')
    }
    if (!response.isSuccess) {
      return this.#carryErrors(response, result)
    }
    const data = response.getData()?.result
    const picked = data === undefined || data === null ? undefined : pick(data)
    if (picked === undefined || picked === null) {
      return result.addError(new SdkError({
        code: 'JSSDK_DEFERRED_BATCH_UNEXPECTED_RESPONSE',
        description: `deferredBatch: ${method} answered without the expected data.`,
        status: 500
      }), 'base-error')
    }
    return result.setData(picked)
  }

  #carryErrors<D>(from: Result<unknown>, to: Result<D>): Result<D> {
    for (const [key, error] of from.errors) {
      to.addError(error, key)
    }
    return to
  }

  #sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal?.aborted) {
        resolve()
        return
      }
      const timer = setTimeout(done, ms)
      function done() {
        clearTimeout(timer)
        signal?.removeEventListener('abort', done)
        resolve()
      }
      signal?.addEventListener('abort', done, { once: true })
    })
  }
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'function') {
    throw new SdkError({
      code: 'JSSDK_DEFERRED_BATCH_GZIP_UNSUPPORTED',
      description: 'deferredBatch: this runtime has no DecompressionStream, so the gzip result file cannot be decoded. Use Node.js 18+ or a current browser.',
      status: 500
    })
  }
  try {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  } catch {
    throw new SdkError({
      code: 'JSSDK_DEFERRED_BATCH_DECODE_FAILED',
      description: 'deferredBatch: the result file is not valid gzip.',
      status: 500
    })
  }
}

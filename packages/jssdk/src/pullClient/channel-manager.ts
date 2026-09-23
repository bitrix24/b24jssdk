import type { AjaxResult } from '../core/http/ajax-result'
import type { TypeChanel, TypeChannelManagerParams, TypePublicIdDescriptor } from '../types/pull'
import type { TypeB24 } from '../types/b24'
import type { SuccessPayload } from '../types/payloads'
import type { LoggerInterface } from '../logger'
import { LoggerFactory } from '../logger'
import { SdkError } from '../core/sdk-error'

/** Named once: it is compared against as well as thrown. */
const PUBLIC_IDS_UNAVAILABLE = 'JSSDK_PULL_PUBLIC_IDS_UNAVAILABLE'

export class ChannelManager {
  private _logger: LoggerInterface
  private _publicIds: Map<number, TypeChanel>
  private _restClient: TypeB24
  private _getPublicListMethod: string

  constructor(params: TypeChannelManagerParams) {
    this._logger = LoggerFactory.createNullLogger()
    this._publicIds = new Map()

    this._restClient = params.b24
    // Defaulted here as well as in `PullClient`, which is the only caller that
    // passes it today. Without this the name reaches the failure message as
    // `undefined`, and that message exists precisely to tell the reader which
    // method was refused.
    this._getPublicListMethod = params.getPublicListMethod || 'pull.channel.public.list'
  }

  setLogger(logger: LoggerInterface): void {
    this._logger = logger
  }

  getLogger(): LoggerInterface {
    return this._logger
  }

  /**
   * @param {Array} users Array of user ids.
   * @return {Promise}
   */
  async getPublicIds(users: number[]): Promise<Record<number, TypeChanel>> {
    const now = new Date()

    const result: Record<number, TypeChanel> = {}
    const unknownUsers: number[] = []

    for (const userId of users) {
      const chanel = this._publicIds.get(userId)

      if (chanel && chanel.end > now) {
        result[chanel.userId] = chanel
      } else {
        unknownUsers.push(userId)
      }
    }

    if (unknownUsers.length === 0) {
      return Promise.resolve(result)
    }

    /**
     * This REJECTS on failure, and that is the point.
     *
     * It used to log and resolve `{}`, which turned a refused request into an
     * empty channel map. The only caller then encoded a message with no
     * receivers, the push server dropped it without a word, and
     * `sendMessage()` reported success. Measured against a live portal: the
     * message was "accepted" and never arrived, with nothing anywhere saying
     * why.
     *
     * The failure this most often is: `pull.channel.public.list` is not part
     * of the application REST surface. An application's Pull client is
     * documented as RECEIVE-ONLY — its back end puts messages into the channel
     * with `pull.application.event.add`, and the front end subscribes. So for
     * an application this rejection is usually the correct, permanent answer,
     * and the message it carries says so rather than leaving the caller to
     * guess.
     *
     * Usually, not always, and the difference is the cache above rather than
     * anything here. `PullClient` seeds it from `config.publicChannels`,
     * returned by the config call it makes at startup —
     * `pull.application.config.get` in an application, `pull.config.get`
     * otherwise. That map carries the current user's own channel, so a send
     * addressed to SELF commonly finds every recipient cached and unexpired,
     * this method makes no request at all, and there is nothing to refuse: the
     * batch is encoded and handed to the socket. A send to another user
     * normally still needs the lookup, and still gets the rejection.
     *
     * Two things that follows does NOT prove, both measured rather than
     * reasoned. The cache admits a channel on `end > now` by the CLIENT's
     * clock, with no signature check, so a rotated or server-side-invalidated
     * channel can still satisfy it — the frame then encodes and is addressed
     * to something the server does not recognise. And reaching the transport
     * is not a delivery receipt in any case: both connectors return `true` as
     * soon as they have handed the bytes over, long-polling without even
     * reading the response.
     */
    return new Promise((resolve, reject) => {
      // Was `callMethod`, removed in 3.0.0 (#277). `pull.server.time` and the
      // channel methods are `restApi:v2` only, which is what `callMethod`
      // resolved to anyway — so this is the same request, spelled the way the
      // SDK spells every other one.
      this._restClient.actions.v2.call
        .make({
          method: this._getPublicListMethod,
          params: { users: unknownUsers }
        })
        .then((response: AjaxResult) => {
          // A refusal reaches here in TWO shapes, and only one of them throws.
          // `AbstractHttp.call()` rejects with an `AjaxError` for most
          // failures, but RESOLVES a non-success `AjaxResult` whenever
          // `isSoftError()` is true — the built-in soft codes, anything a
          // caller added through `softErrorCodes`, and v3-envelope 4xx outside
          // 401/408/429. Without this branch that delivery fell through to
          // `getData()` returning `undefined`, and the rejection below happened
          // only because reading `.result` off it threw a `TypeError`. It
          // worked, by accident, and it logged the `TypeError` instead of the
          // portal's own message — so the one thing this change exists to
          // provide, an answer to "why did my message go nowhere?", was exactly
          // what it did not provide on that path.
          if (!response.isSuccess) {
            return reject(this.publicIdsUnavailable(
              new Error(response.getErrorMessages().join('; '))
            ))
          }

          const payload = response.getData() as undefined | SuccessPayload<Record<string, TypePublicIdDescriptor>>
          if (payload?.result) {
            this.setPublicIds(Object.values(payload.result))
          }

          for (const userId of unknownUsers) {
            const chanel = this._publicIds.get(userId)
            if (chanel) {
              result[chanel.userId] = chanel
            }
          }

          // A successful answer that yielded no channel at all is the silent
          // drop one level up: the caller asked for recipients, the portal did
          // not refuse, and there is still nobody to send to. It reaches here
          // when the body carries no usable descriptor — a 200 with no
          // `result`, for instance, which `getData()` normalises into a
          // result-shaped object rather than failing.
          //
          // Only the all-or-nothing case rejects. A PARTIAL answer still
          // resolves, and that is a deliberate gap rather than a decision:
          // sending to the subset that resolved is what the old code did, and
          // changing it is a separate question from the one this fixes.
          if (Object.keys(result).length === 0) {
            return reject(this.publicIdsUnavailable(
              new Error(`\`${this._getPublicListMethod}\` answered without a channel for any requested user`)
            ))
          }

          resolve(result)
        })
        .catch((error: unknown) => {
          // `reject` above lands here too, so the already-wrapped error is
          // passed through rather than wrapped twice. The test is the CODE, not
          // `instanceof SdkError`: `AjaxError extends SdkError`, so an
          // instance check would let every transport failure through unwrapped
          // — which is exactly what it did on first run.
          if (error instanceof SdkError && error.code === PUBLIC_IDS_UNAVAILABLE) {
            return reject(error)
          }

          return reject(this.publicIdsUnavailable(error))
        })
    })
  }

  /**
   * The one failure this class reports, built in one place.
   *
   * `originalError` carries the cause. It is deliberately non-enumerable on
   * `SdkError`, so it does not reach a serializer, but it is what lets a caller
   * tell a permanent refusal (the method is not in the application surface —
   * retrying is pointless) from a transient one (a 503, a rate limit — retrying
   * is right). The description alone asserts the former and cannot distinguish
   * them.
   *
   * No caller value is interpolated into the description: `SdkError` does not
   * run it through the log redaction, so only the method name — a constant —
   * goes in.
   */
  private publicIdsUnavailable(cause: unknown): SdkError {
    this.getLogger().error('some error in getPublicIds', { error: cause }).catch(() => {})

    return new SdkError({
      code: PUBLIC_IDS_UNAVAILABLE,
      description: `Pull: could not resolve channel ids through \`${this._getPublicListMethod}\`, so there is nobody to send to. Publishing from the client needs that method; that method is not part of the application REST surface — put messages into the channel with \`pull.application.event.add\` from your back end instead.`,
      status: 0,
      ...(cause instanceof Error ? { originalError: cause } : {})
    })
  }

  /**
   * @param {TypePublicIdDescriptor[]} publicIds
   */
  public setPublicIds(publicIds: TypePublicIdDescriptor[]): void {
    publicIds.forEach((publicIdDescriptor: TypePublicIdDescriptor) => {
      const userId = Number(publicIdDescriptor.user_id)
      this._publicIds.set(userId, {
        userId: userId,
        publicId: publicIdDescriptor.public_id,
        signature: publicIdDescriptor.signature,
        start: new Date(publicIdDescriptor.start),
        end: new Date(publicIdDescriptor.end)
      } as TypeChanel)
    })
  }
}

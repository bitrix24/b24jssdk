import type { AjaxResult } from '../core/http/ajax-result'
import type { TypeChanel, TypeChannelManagerParams, TypePublicIdDescriptor } from '../types/pull'
import type { TypeB24 } from '../types/b24'
import type { SuccessPayload } from '../types/payloads'
import type { LoggerInterface } from '../logger'
import { LoggerFactory } from '../logger'
import { SdkError } from '../core/sdk-error'

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
     * an application this rejection is the correct, permanent answer, and the
     * message it carries says so rather than leaving the caller to guess.
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
          const data = (response.getData() as SuccessPayload<Record<string, TypePublicIdDescriptor>>).result

          /**
           * @memo test this
           */
          this.setPublicIds(Object.values(data))

          for (const userId of unknownUsers) {
            const chanel = this._publicIds.get(userId)
            if (chanel) {
              result[chanel.userId] = chanel
            }
          }

          resolve(result)
        })
        .catch((error: Error | string) => {
          this.getLogger().error('some error in getPublicIds', { error }).catch(() => {})

          return reject(new SdkError({
            code: 'JSSDK_PULL_PUBLIC_IDS_UNAVAILABLE',
            // No caller value is interpolated here: `SdkError` does not run its
            // description through the log redaction, so it carries only the
            // method name, which is a constant.
            description: `Pull: could not resolve channel ids through \`${this._getPublicListMethod}\`, so there is nobody to send to. Publishing from the client needs that method; an application's Pull client is receive-only — put messages into the channel with \`pull.application.event.add\` from your back end instead.`,
            status: 0
          }))
        })
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

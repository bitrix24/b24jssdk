import type { AjaxResult } from '../core/http/ajax-result'
import type { TypeChanel, TypeChannelManagerParams, TypePublicIdDescriptor } from '../types/pull'
import type { TypeB24 } from '../types/b24'
import type { SuccessPayload } from '../types/payloads'
import type { LoggerInterface } from '../logger'
import { LoggerFactory } from '../logger'

export class ChannelManager {
  private _logger: LoggerInterface
  private _publicIds: Map<number, TypeChanel>
  private _restClient: TypeB24
  private _getPublicListMethod: string

  constructor(params: TypeChannelManagerParams) {
    this._logger = LoggerFactory.createNullLogger()
    this._publicIds = new Map()

    this._restClient = params.b24
    this._getPublicListMethod = params.getPublicListMethod
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
     * @memo we not use Promise.reject()
     */
    return new Promise((resolve) => {
      this._restClient
        .callMethod(this._getPublicListMethod, {
          users: unknownUsers
        })
        .then((response: AjaxResult) => {
          const data = (response.getData() as SuccessPayload<TypePublicIdDescriptor>).result

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
          this.getLogger().error('some error in getPublicIds', { error })
          return resolve({})
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

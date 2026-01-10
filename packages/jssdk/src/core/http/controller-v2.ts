import type { TypeHttp } from '../../types/http'
import type { AuthActions } from '../../types/auth'
import type { RestrictionParams } from '../../types/limiters'
import { AbstractHttp } from './abstract-http'
import { ApiVersion } from '../../types/b24'

/**
 * Class for working with RestApi v2 requests via http
 *
 * @link https://bitrix24.github.io/b24jssdk/
 *
 * @todo docs
 */
export class HttpV2 extends AbstractHttp implements TypeHttp {
  constructor(
    authActions: AuthActions,
    options?: null | object,
    restrictionParams?: Partial<RestrictionParams>
  ) {
    super(authActions, options, restrictionParams)
    this._version = ApiVersion.v2
  }
}

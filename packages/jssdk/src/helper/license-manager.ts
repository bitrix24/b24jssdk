import { AbstractHelper } from './abstract-helper'
import type { TypeLicense } from '../types/b24-helper'
import { RestrictionParamsFactory } from '../core/http/restriction-params-factory'

export class LicenseManager extends AbstractHelper {
  protected override _data: null | TypeLicense = null

  /**
   * @inheritDoc
   */
  override async initData(data: TypeLicense): Promise<void> {
    this._data = data

    this.makeRestrictionManagerParams()
  }

  get data(): TypeLicense {
    if (null === this._data) {
      throw new Error('LicenseManager.data not initialized')
    }

    return this._data
  }

  /**
   * Set RestrictionManager params by license
   * @link https://apidocs.bitrix24.com/api-reference/common/system/app-info.html
   */
  makeRestrictionManagerParams(): void {
    if (!this.data?.license) {
      return
    }

    const restrictionParams = RestrictionParamsFactory.fromTariffPlan(this.data.license)
    this.getLogger().log(
      `LICENSE ${this.data.license} => set restriction manager params`,
      restrictionParams
    )

    this._b24
      .getHttpClient()
      .setRestrictionManagerParams(restrictionParams)
  }
}

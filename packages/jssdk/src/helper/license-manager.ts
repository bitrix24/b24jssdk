import type { TypeLicense } from '../types/b24-helper'
import { AbstractHelper } from './abstract-helper'
import { ParamsFactory } from '../core/http/limiters/params-factory'

export class LicenseManager extends AbstractHelper {
  protected override _data: null | TypeLicense = null

  /**
   * @inheritDoc
   */
  override async initData(data: TypeLicense): Promise<void> {
    this._data = data

    await this.makeRestrictionManagerParams()
  }

  get data(): TypeLicense {
    if (null === this._data) {
      throw new Error('LicenseManager.data not initialized')
    }

    return this._data
  }

  /**
   * Set RestrictionManager params by license
   * @link https://apidocs.bitrix24.com/sdk/common/system/app-info.html
   */
  async makeRestrictionManagerParams(): Promise<void> {
    if (!this.data?.license) {
      return
    }

    const restrictionParams = ParamsFactory.fromTariffPlan(this.data.license)
    this.getLogger().debug('set restriction manager params', {
      license: this.data.license,
      restrictionParams
    })

    await this._b24.getHttpClient().setRestrictionManagerParams(restrictionParams)
  }
}

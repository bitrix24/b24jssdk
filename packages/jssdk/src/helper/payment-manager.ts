import { AbstractHelper } from './abstract-helper'
import type { TypePayment } from '../types/b24-helper'

export class PaymentManager extends AbstractHelper {
  protected override _data: null | TypePayment = null

  /**
   * @inheritDoc
   */
  override async initData(data: TypePayment): Promise<void> {
    this._data = data
  }

  get data(): TypePayment {
    if (null === this._data) {
      throw new Error('PaymentManager.data not initialized')
    }

    return this._data
  }
}

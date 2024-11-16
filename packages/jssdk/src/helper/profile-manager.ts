import { AbstractHelper } from './abstract-helper'
import type { TypeUser } from '../types/b24-helper'

export class ProfileManager extends AbstractHelper {
	protected override _data: null | TypeUser = null

	/**
	 * @inheritDoc
	 */
	override async initData(data: TypeUser): Promise<void> {
		this._data = data
	}

	get data(): TypeUser {
		if (null === this._data) {
			throw new Error('ProfileManager.data not initialized')
		}

		return this._data
	}
}

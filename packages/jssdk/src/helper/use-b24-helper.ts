import { B24HelperManager } from './helper-manager'
import { LoadDataType } from '../types/b24-helper'
import type { TypeB24 } from '../types/b24'
import type { TypePullMessage } from '../types/pull'

export const useB24Helper = () => {
	let $isInitB24Helper = false
	let $isInitPullClient = false

	let $b24Helper: null | B24HelperManager = null

	const initB24Helper = async (
		$b24: TypeB24,
		dataTypes: LoadDataType[] = [LoadDataType.App, LoadDataType.Profile]
	): Promise<B24HelperManager> => {
		if (null === $b24Helper) {
			$b24Helper = new B24HelperManager($b24)
		}

		if ($isInitB24Helper) {
			return $b24Helper as B24HelperManager
		}

		return $b24Helper.loadData(dataTypes).then(() => {
			$isInitB24Helper = true
			return $b24Helper as B24HelperManager
		})
	}

	const destroyB24Helper = () => {
		$b24Helper?.destroy()
		$b24Helper = null
		$isInitB24Helper = false
		$isInitPullClient = false
	}

	const isInitB24Helper = () => {
		return $isInitB24Helper
	}

	const getB24Helper = (): B24HelperManager => {
		if (null === $b24Helper) {
			throw new Error(
				'B24HelperManager is not initialized. You need to call initB24Helper first.'
			)
		}

		return $b24Helper
	}

	const usePullClient = () => {
		if (null === $b24Helper) {
			throw new Error(
				'B24HelperManager is not initialized. You need to call initB24Helper first.'
			)
		}

		$b24Helper.usePullClient()
		$isInitPullClient = true
	}

	const useSubscribePullClient = (
		callback: (message: TypePullMessage) => void,
		moduleId: string = 'application'
	) => {
		if (!$isInitPullClient) {
			throw new Error(
				'PullClient is not initialized. You need to call usePullClient first.'
			)
		}

		$b24Helper?.subscribePullClient(callback, moduleId)
	}

	const startPullClient = () => {
		if (!$isInitPullClient) {
			throw new Error(
				'PullClient is not initialized. You need to call usePullClient first.'
			)
		}

		$b24Helper?.startPullClient()
	}

	return {
		initB24Helper,
		isInitB24Helper,
		destroyB24Helper,
		getB24Helper,
		usePullClient,
		useSubscribePullClient,
		startPullClient,
	}
}

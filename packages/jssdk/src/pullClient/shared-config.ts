import { LoggerBrowser, LoggerType } from '../logger/browser'
import Type from '../tools/type'
import Text from '../tools/text'
import { StorageManager } from './storage-manager'
import {
	LsKeys,
	type SharedConfigCallbacks,
	type SharedConfigParams,
	type TypeStorageManager,
} from '../types/pull'

export class SharedConfig {
	private _logger: null | LoggerBrowser = null
	private readonly _storage: TypeStorageManager
	private _ttl: number = 24 * 60 * 60
	private _callbacks: SharedConfigCallbacks

	constructor(params: SharedConfigParams = {}) {
		params = params || {}
		this._storage = params.storage || new StorageManager()

		this._callbacks = {
			onWebSocketBlockChanged: Type.isFunction(params.onWebSocketBlockChanged)
				? params.onWebSocketBlockChanged
				: () => {},
		} as SharedConfigCallbacks

		if (this._storage) {
			window.addEventListener('storage', this.onLocalStorageSet.bind(this))
		}
	}

	setLogger(logger: LoggerBrowser): void {
		this._logger = logger
	}

	getLogger(): LoggerBrowser {
		if (null === this._logger) {
			this._logger = LoggerBrowser.build(`NullLogger`)

			this._logger.setConfig({
				[LoggerType.desktop]: false,
				[LoggerType.log]: false,
				[LoggerType.info]: false,
				[LoggerType.warn]: false,
				[LoggerType.error]: true,
				[LoggerType.trace]: false,
			})
		}

		return this._logger
	}

	private onLocalStorageSet(params: StorageEvent): void {
		if (
			(this._storage as StorageManager).compareKey(
				params.key || '',
				LsKeys.WebsocketBlocked
			) &&
			params.newValue !== params.oldValue
		) {
			this._callbacks.onWebSocketBlockChanged({
				isWebSocketBlocked: this.isWebSocketBlocked(),
			})
		}
	}

	isWebSocketBlocked(): boolean {
		if (!this._storage) {
			return false
		}

		return this._storage.get(LsKeys.WebsocketBlocked, 0) > Date.now()
	}

	setWebSocketBlocked(isWebSocketBlocked: boolean): boolean {
		if (!this._storage) {
			return false
		}

		try {
			this._storage.set(
				LsKeys.WebsocketBlocked,
				isWebSocketBlocked ? Date.now() + this._ttl : 0
			)
		} catch (error) {
			this.getLogger().error(
				new Error(
					`${Text.getDateForLog()}: Pull: Could not save WS_blocked flag in local storage. Error: `
				),
				error
			)

			return false
		}

		return true
	}

	isLongPollingBlocked(): boolean {
		if (!this._storage) {
			return false
		}

		return this._storage.get(LsKeys.LongPollingBlocked, 0) > Date.now()
	}

	setLongPollingBlocked(isLongPollingBlocked: boolean) {
		if (!this._storage) {
			return false
		}

		try {
			this._storage.set(
				LsKeys.LongPollingBlocked,
				isLongPollingBlocked ? Date.now() + this._ttl : 0
			)
		} catch (error) {
			this.getLogger().error(
				new Error(
					`${Text.getDateForLog()}: Pull: Could not save LP_blocked flag in local storage. Error: `
				),
				error
			)

			return false
		}

		return true
	}

	isLoggingEnabled(): boolean {
		if (!this._storage) {
			return false
		}

		return this._storage.get(LsKeys.LoggingEnabled, 0) > this.getTimestamp()
	}

	setLoggingEnabled(isLoggingEnabled: boolean): boolean {
		if (!this._storage) {
			return false
		}

		try {
			this._storage.set(
				LsKeys.LoggingEnabled,
				isLoggingEnabled ? this.getTimestamp() + this._ttl : 0
			)
		} catch (error) {
			this.getLogger().error(
				new Error(`${Text.getDateForLog()}: LocalStorage error: `),
				error
			)

			return false
		}

		return true
	}

	// region Tools ////
	getTimestamp(): number {
		return Date.now()
	}
	// endregion ////
}

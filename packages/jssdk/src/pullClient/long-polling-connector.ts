import Type from '../tools/type'
import Text from '../tools/text'
import { AbstractConnector } from './abstract-connector'
import { ConnectionType } from '../types/pull'
import type { ConnectorConfig } from '../types/pull'

const LONG_POLLING_TIMEOUT = 60

export class LongPollingConnector extends AbstractConnector {
	private _active: boolean

	private _requestTimeout: null | number
	private _failureTimeout: null | number
	private readonly _xhr: XMLHttpRequest
	private _requestAborted: boolean

	constructor(config: ConnectorConfig) {
		super(config)

		this._active = false
		this._connectionType = ConnectionType.LongPolling

		this._requestTimeout = null
		this._failureTimeout = null
		this._xhr = this.createXhr()
		this._requestAborted = false
	}

	/**
	 * @inheritDoc
	 */
	override connect(): void {
		this._active = true
		this.performRequest()
	}

	/**
	 * @inheritDoc
	 * @param code
	 * @param reason
	 */
	override disconnect(code: number, reason: string): void {
		this._active = false

		this.clearTimeOut()

		if (this._xhr) {
			this._requestAborted = true
			this._xhr.abort()
		}

		this._disconnectCode = code
		this._disconnectReason = reason
		this.connected = false
	}

	private performRequest(): void {
		if (!this._active) {
			return
		}

		if (!this.connectionPath) {
			throw new Error('Long polling connection path is not defined')
		}

		if (this._xhr.readyState !== 0 && this._xhr.readyState !== 4) {
			return
		}

		this.clearTimeOut()

		this._failureTimeout = setTimeout(() => {
			this.connected = true
		}, 5_000)

		this._requestTimeout = setTimeout(
			this.onRequestTimeout.bind(this),
			LONG_POLLING_TIMEOUT * 1_000
		)

		this._xhr.open('GET', this.connectionPath)
		this._xhr.send()
	}

	private onRequestTimeout() {
		this._requestAborted = true
		this._xhr.abort()
		this.performRequest()
	}

	private onXhrReadyStateChange(): void {
		if (this._xhr.readyState === 4) {
			if (!this._requestAborted || this._xhr.status == 200) {
				this.onResponse(this._xhr.response)
			}

			this._requestAborted = false
		}
	}

	/**
	 * Via http request
	 * @inheritDoc
	 */
	override send(buffer: ArrayBuffer | string): boolean {
		const path = this._parent.getPublicationPath()
		if (!path) {
			this.getLogger().error(
				new Error(`${Text.getDateForLog()}: Pull: publication path is empty`)
			)
			return false
		}

		const xhr = new XMLHttpRequest()
		xhr.open('POST', path)
		xhr.send(buffer)

		return true
	}

	private onResponse(response: any): void {
		this.clearTimeOut()

		if (this._xhr.status === 200) {
			this.connected = true
			if (Type.isStringFilled(response) || response instanceof ArrayBuffer) {
				this._callbacks.onMessage(response)
			} else {
				this._parent.session.mid = null
			}
			this.performRequest()
		} else if (this._xhr.status === 304) {
			this.connected = true
			if (
				this._xhr.getResponseHeader('Expires') ===
				'Thu, 01 Jan 1973 11:11:01 GMT'
			) {
				const lastMessageId = this._xhr.getResponseHeader('Last-Message-Id')
				if (Type.isStringFilled(lastMessageId)) {
					this._parent.setLastMessageId(lastMessageId || '')
				}
			}
			this.performRequest()
		} else {
			this._callbacks.onError(new Error('Could not connect to the server'))

			this.connected = false
		}
	}

	// region Tools ////
	private clearTimeOut(): void {
		if (this._failureTimeout) {
			clearTimeout(this._failureTimeout)
			this._failureTimeout = null
		}

		if (this._requestTimeout) {
			clearTimeout(this._requestTimeout)
			this._requestTimeout = null
		}
	}

	private createXhr(): XMLHttpRequest {
		const result = new XMLHttpRequest()

		if (this._parent.isProtobufSupported() && !this._parent.isJsonRpc()) {
			result.responseType = 'arraybuffer'
		}

		result.addEventListener(
			'readystatechange',
			this.onXhrReadyStateChange.bind(this)
		)

		return result
	}
	// endregion ////
}

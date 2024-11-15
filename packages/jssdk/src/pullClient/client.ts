import { LoggerBrowser, LoggerType } from '../logger/browser'
import Type from '../tools/type'
import Text from '../tools/text'
import Browser from '../tools/browser'
import { StorageManager } from './storage-manager'
import { JsonRpc } from './json-rpc'
import { SharedConfig } from './shared-config'
import { ChannelManager } from './channelManager'
import {
	//Response,
	ResponseBatch,
	//Request,
	RequestBatch,
	//IncomingMessagesRequest,
	IncomingMessage,
	Receiver,
} from './protobuf'
import type { TypeB24 } from '../types/b24'
import {
	CloseReasons,
	ConnectionType,
	PullStatus,
	RpcMethod,
	SenderType,
	ServerMode,
	SubscriptionType,
	SystemCommands,
	LsKeys,
	type StorageManagerParams,
	type TypePullClientParams,
	type TypePullClientSession,
	type TypeStorageManager,
	type SharedConfigParams,
	type TypeChannelManagerParams,
	type TypeConnector,
	type RpcError,
	type TypePullClientConfig,
	type TypePullMessage,
	type TypeSubscriptionOptions,
	type TypeSubscriptionCommandHandler,
	type TypePullClientEmitConfig,
	type CommandHandlerFunctionV1,
	type CommandHandlerFunctionV2,
	type ConnectorParent,
	type UserStatusCallback,
	type TypePublicIdDescriptor,
	type TypePullClientMessageBatch,
	type TypeChanel,
	type TypeSessionEvent, type TypePullClientMessageBody
} from '../types/pull'
import type {AjaxResult} from '../core/http/ajaxResult'
import type {Payload} from '../types/payloads'
import type {NumberString} from '../types/common'
import {WebSocketConnector} from './web-socket-connector'
import { LongPollingConnector } from './long-polling-connector'
import type {AjaxError} from '../core/http/ajaxError'

/**
 * @memo api revision - check module/pull/include.php
 */
const REVISION = 19
const RESTORE_WEBSOCKET_TIMEOUT = 30 * 60
const OFFLINE_STATUS_DELAY = 5_000
const CONFIG_CHECK_INTERVAL = 60 * 1000
const MAX_IDS_TO_STORE = 10
const PING_TIMEOUT = 10
const JSON_RPC_PING = 'ping'
const JSON_RPC_PONG = 'pong'
const LS_SESSION = 'bx-pull-session'
const LS_SESSION_CACHE_TIME = 20

const EmptyConfig = {
	api: {},
	channels: {},
	publicChannels: {},
	server: {timeShift: 0},
	clientId: null,
	jwt: null,
	exp: 0
} as TypePullClientConfig

/**
 * @todo fix logic for _loggingEnabled
 */
export class PullClient
	implements ConnectorParent
{
	// region Params ////
	private _logger: null|LoggerBrowser = null
	private _restClient: TypeB24
	private _status: PullStatus
	private _context: string
	private readonly _guestMode: boolean
	private readonly _guestUserId: number
	private _userId: number
	
	private _configGetMethod: string
	private _getPublicListMethod: string
	
	private _siteId: string
	private _enabled: boolean
	
	private _unloading: boolean = false
	private _starting: boolean = false
	private _debug: boolean = false
	private _connectionAttempt: number = 0
	private _connectionType: ConnectionType = ConnectionType.WebSocket
	private _reconnectTimeout: null|number = null
	private _restartTimeout: null|number = null
	private _restoreWebSocketTimeout: null|number = null
	
	private _skipStorageInit: boolean
	private _skipCheckRevision: boolean
	
	private _subscribers: Record<string, any> = {}
	private _watchTagsQueue: Map<string, boolean> = new Map()
	private _watchUpdateInterval: number = 1_740_000
	private _watchForceUpdateInterval: number = 5_000
	private _configTimestamp: number = 0
	private _session: TypePullClientSession = {
		mid: null,
		tag: null,
		time: null,
		history: {},
		lastMessageIds: [],
		messageCount: 0
	}
	
	private _connectors: Record<ConnectionType, null|TypeConnector> = {
		[ConnectionType.Undefined]: null,
		[ConnectionType.WebSocket]: null,
		[ConnectionType.LongPolling]: null
	}
	
	private _isSecure: boolean
	
	private _config: null|TypePullClientConfig = null
	
	private _storage: null|TypeStorageManager = null
	private _sharedConfig: SharedConfig
	private _channelManager: ChannelManager
	private _jsonRpcAdapter: null|JsonRpc = null
	
	/**
	 * @depricate
	 * @private
	 */
	// private _notificationPopup: null = null
	
	// timers ////
	private _checkInterval: null|number = null
	private _offlineTimeout: null|number = null
	private _watchUpdateTimeout: null|number = null
	
	private _pingWaitTimeout: null|number = null
	
	// manual stop workaround ////
	private _isManualDisconnect: boolean = false
	
	private _loggingEnabled: boolean = false
	
	// bound event handlers ////
	private _onPingTimeoutHandler: () => void
	
	// [userId] => array of callbacks
	private _userStatusCallbacks: Record<number, UserStatusCallback[]> = {}
	
	private _connectPromise: null|{
		resolve: (response: any) => void,
		reject: (error: string|RpcError|Error) => void,
	} = null
	
	private _startingPromise: null|Promise<boolean> = null
	// endregion ////
	
	// region Init ////
	/**
	 * @done
	 * @param params
	 */
	constructor(params: TypePullClientParams)
	{
		this._restClient = params.b24
		this._status = PullStatus.Offline
		this._context = 'master'
		
		// region RestApplication ////
		if(params.restApplication)
		{
			if(typeof params.configGetMethod === 'undefined')
			{
				params.configGetMethod = 'pull.application.config.get'
			}
			
			if (typeof params.skipCheckRevision === 'undefined')
			{
				params.skipCheckRevision = true
			}
			
			if(Type.isStringFilled(params.restApplication))
			{
				params.siteId = params.restApplication
			}
			
			params.serverEnabled = true
		}
		// endregion ////
		
		// region Params ////
		this._guestMode = params.guestMode
			? Text.toBoolean(params.guestMode)
			: false
		
		this._guestUserId = params.guestUserId ?
			Text.toInteger(params.guestUserId)
			: 0
		
		if(
			this._guestMode
			&& this._guestUserId > 0
		)
		{
			this._userId = this._guestUserId;
		}
		else
		{
			this._guestMode = false
			this._userId = params.userId
				? Text.toInteger(params.userId)
				: 0
		}

		this._siteId = params.siteId ?? 'none'

		// eslint-disable-next-line
		this._enabled = !Type.isUndefined(params.serverEnabled)
			? (params.serverEnabled === true)
			: true

		// eslint-disable-next-line
		this._configGetMethod = !Type.isStringFilled(params.configGetMethod)
			? 'pull.config.get'
			: params.configGetMethod || ''

		// eslint-disable-next-line
		this._getPublicListMethod = !Type.isStringFilled(params.getPublicListMethod)
			? 'pull.channel.public.list'
			: params.getPublicListMethod || ''

		this._skipStorageInit = params.skipStorageInit === true
		this._skipCheckRevision = params.skipCheckRevision === true;

		if(!Type.isUndefined(params.configTimestamp))
		{
			this._configTimestamp = Text.toInteger(params.configTimestamp);
		}
		// endregion ////

		this._isSecure = document?.location.href.indexOf('https') === 0

		if(
			this._userId
			&& !this._skipStorageInit
		)
		{
			this._storage = new StorageManager({
				userId: this._userId,
				siteId: this._siteId
			} as StorageManagerParams);
		}

		this._sharedConfig = new SharedConfig({
			onWebSocketBlockChanged: this.onWebSocketBlockChanged.bind(this),
			storage: this._storage
		} as SharedConfigParams)

		this._channelManager = new ChannelManager({
			b24: this._restClient,
			getPublicListMethod: this._getPublicListMethod
		} as TypeChannelManagerParams)

		this._loggingEnabled = this._sharedConfig.isLoggingEnabled()

		// bound event handlers ////
		this._onPingTimeoutHandler = this.onPingTimeout.bind(this)
	}

	setLogger(logger: LoggerBrowser): void
	{
		this._logger = logger
		this._jsonRpcAdapter?.setLogger(this.getLogger())
		this._storage?.setLogger(this.getLogger())
		this._sharedConfig.setLogger(this.getLogger())
		this._channelManager.setLogger(this.getLogger())

		this._connectors.webSocket?.setLogger(this.getLogger())
		this._connectors.longPolling?.setLogger(this.getLogger())
	}

	getLogger(): LoggerBrowser
	{
		if(null === this._logger)
		{
			this._logger = LoggerBrowser.build(
				`NullLogger`
			)

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

	destroy(): void
	{
		this.stop(
			CloseReasons.NORMAL_CLOSURE,
			'manual stop'
		)

		this.onBeforeUnload()
	}

	/**
	 * @done
	 * @private
	 */
	private init(): void
	{
		this._connectors.webSocket = new WebSocketConnector({
			parent: this,
			onOpen: this.onWebSocketOpen.bind(this),
			onMessage: this.onIncomingMessage.bind(this),
			onDisconnect: this.onWebSocketDisconnect.bind(this),
			onError: this.onWebSocketError.bind(this)
		})

		this._connectors.longPolling = new LongPollingConnector({
			parent: this,
			onOpen: this.onLongPollingOpen.bind(this),
			onMessage: this.onIncomingMessage.bind(this),
			onDisconnect: this.onLongPollingDisconnect.bind(this),
			onError: this.onLongPollingError.bind(this)
		})

		this._connectionType = this.isWebSocketAllowed()
			? ConnectionType.WebSocket
			: ConnectionType.LongPolling

		window.addEventListener('beforeunload', this.onBeforeUnload.bind(this))
		window.addEventListener('offline', this.onOffline.bind(this))
		window.addEventListener('online', this.onOnline.bind(this))

		/**
		 * @memo Not use under Node.js
		 */
		/*/
		if (BX && BX.addCustomEvent)
		{
			BX.addCustomEvent('BXLinkOpened', this.connect.bind(this))
		}

		if (BX && BX.desktop)
		{
			BX.addCustomEvent('onDesktopReload', () => {
				this._session.mid = null
				this._session.tag = null
				this._session.time = null
			})

			BX.desktop.addCustomEvent('BXLoginSuccess', () => this.restart(1_000, 'desktop login'))
		}
		//*/

		this._jsonRpcAdapter = new JsonRpc({
			connector: this._connectors.webSocket,
			handlers: {
				'incoming.message': this.handleRpcIncomingMessage.bind(this)
			}
		});
	}
	// endregion ////

	// region Get-Set ////
	/**
	 * @done
	 */
	get connector(): null|TypeConnector
	{
		return this._connectors[this._connectionType];
	}

	/**
	 * @done
	 */
	get status(): PullStatus
	{
		return this._status;
	}

	/**
	 * @done
	 * @param status
	 */
	set status(status: PullStatus)
	{
		if(this._status === status)
		{
			return
		}

		this._status = status;
		if(this._offlineTimeout)
		{
			clearTimeout(this._offlineTimeout)
			this._offlineTimeout = null
		}

		if(status === PullStatus.Offline)
		{
			this.sendPullStatusDelayed(status, OFFLINE_STATUS_DELAY)
		}
		else
		{
			this.sendPullStatus(status)
		}
	}

	get session(): TypePullClientSession
	{
		return this._session
	}
	// endregion ////

	// region Public /////
	/**
	 * @done
	 * Creates a subscription to incoming messages.
	 *
	 * @param {TypeSubscriptionOptions | TypeSubscriptionCommandHandler} params
	 * @returns {Function} - Unsubscribe callback function
	 */
	public subscribe(params: TypeSubscriptionOptions|TypeSubscriptionCommandHandler): Function
	{
		if (!Type.isPlainObject(params))
		{
			return this.attachCommandHandler(params as TypeSubscriptionCommandHandler)
		}

		params = params as TypeSubscriptionOptions

		params.type = params.type || SubscriptionType.Server
		params.command = params.command || null

		if(
			params.type == SubscriptionType.Server
			|| params.type == SubscriptionType.Client
		)
		{
			if((typeof params.moduleId === 'undefined'))
			{
				throw new Error(`${Text.getDateForLog()}: Pull.subscribe: parameter moduleId is not specified`)
			}

			if(typeof (this._subscribers[params.type]) === 'undefined')
			{
				this._subscribers[params.type] = {}
			}

			if(typeof (this._subscribers[params.type][params.moduleId]) === 'undefined')
			{
				this._subscribers[params.type][params.moduleId] = {
					callbacks: [],
					commands: {}
				}
			}

			if(params.command)
			{
				if (typeof (this._subscribers[params.type][params.moduleId]['commands'][params.command]) === 'undefined')
				{
					this._subscribers[params.type][params.moduleId]['commands'][params.command] = []
				}

				this._subscribers[params.type][params.moduleId]['commands'][params.command].push(params.callback);

				return () => {
					if(
						typeof params.type === 'undefined'
						|| typeof params.moduleId === 'undefined'
						|| typeof params.command === 'undefined'
						|| null === params.command
					)
					{
						return
					}

					this._subscribers[params.type][params.moduleId]['commands'][params.command] =
						this._subscribers[params.type][params.moduleId]['commands'][params.command].filter((element: any) => {
						return element !== params.callback
					});
				}
			}
			else
			{
				this._subscribers[params.type][params.moduleId]['callbacks'].push(params.callback);

				return () => {
					if(
						typeof params.type === 'undefined'
						|| typeof params.moduleId === 'undefined'
					)
					{
						return
					}

					this._subscribers[params.type][params.moduleId]['callbacks'] =
						this._subscribers[params.type][params.moduleId]['callbacks'].filter((element: any) => {
						return element !== params.callback
					})
				}
			}
		}
		else
		{
			if(typeof (this._subscribers[params.type]) === 'undefined')
			{
				this._subscribers[params.type] = []
			}

			this._subscribers[params.type].push(params.callback)

			return () => {
				if(
					typeof params.type === 'undefined'
				)
				{
					return
				}

				this._subscribers[params.type] =
					this._subscribers[params.type].filter((element: any) => {
					return element !== params.callback
				})
			}
		}
	}

	/**
	 * @done
	 * @param {TypeSubscriptionCommandHandler} handler
	 * @returns {Function} - Unsubscribe callback function
	 */
	private attachCommandHandler(handler: TypeSubscriptionCommandHandler): Function
	{
		if (
			typeof handler.getModuleId !== 'function'
			|| typeof handler.getModuleId() !== 'string'
		)
		{
			this.getLogger().error(`${Text.getDateForLog()}: Pull.attachCommandHandler: result of handler.getModuleId() is not a string.`)
			return () => {}
		}

		let type = SubscriptionType.Server;
		if (typeof handler.getSubscriptionType === 'function')
		{
			type = handler.getSubscriptionType()
		}

		return this.subscribe({
			type: type,
			moduleId: handler.getModuleId(),
			callback: (data: TypePullMessage) => {
				let method = null

				if (typeof handler.getMap === 'function')
				{
					const mapping = handler.getMap()
					if(
						mapping
						&& typeof mapping === 'object'
					)
					{
						const rowMapping = mapping[data.command]
						if(
							typeof rowMapping === 'function'
						)
						{
							method = rowMapping.bind(handler)
						}
						else if(
							typeof rowMapping === 'string'
							&& typeof handler[rowMapping] === 'function'
						)
						{
							method = handler[rowMapping].bind(handler);
						}
					}
				}

				/**
				 * handler.handleSomeCommandName: CommandHandlerFunction
				 */
				if(!method)
				{
					const methodName = `handle${Text.capitalize(data.command)}`
					if(typeof handler[methodName] === 'function')
					{
						method = handler[methodName].bind(handler);
					}
				}

				if(method)
				{
					if(
						this._debug
						&& this._context !== 'master'
					)
					{
						this.getLogger().warn(
							`${Text.getDateForLog()}: Pull.attachCommandHandler: result of handler.getModuleId() is not a string`,
							data
						)
					}

					method(
						data.params,
						data.extra,
						data.command
					)
				}
			}
		})
	}


	/**
	 * @done
	 * @param config
	 */
	public async start(
		config: null|TypePullClientConfig & {
			skipReconnectToLastSession?: boolean
		} = null
	): Promise<boolean>
	{
		let allowConfigCaching = true

		if(this.isConnected())
		{
			return Promise.resolve(true)
		}

		if(
			this._starting
			&& this._startingPromise
		)
		{
			return this._startingPromise
		}

		if(!this._userId)
		{
			throw new Error('Not set userId')
		}

		if(this._siteId === 'none')
		{
			throw new Error('Not set siteId')
		}

		let skipReconnectToLastSession = false
		if(!!config && Type.isPlainObject(config))
		{
			if(typeof config?.skipReconnectToLastSession !== 'undefined')
			{
				skipReconnectToLastSession = config.skipReconnectToLastSession
				delete config.skipReconnectToLastSession
			}

			this._config = config
			allowConfigCaching = false
		}

		if(!this._enabled)
		{
			return Promise.reject({
				ex: {
					error: 'PULL_DISABLED',
					error_description: 'Push & Pull server is disabled'
				}
			});
		}

		const now = (new Date()).getTime()
		let oldSession
		if(
			!skipReconnectToLastSession
			&& this._storage
		)
		{
			oldSession = this._storage.get(LS_SESSION, null)
		}

		if(
			Type.isPlainObject(oldSession)
			&& oldSession.hasOwnProperty('ttl')
			&& oldSession.ttl >= now
		)
		{
			this._session.mid = oldSession.mid
		}

		this._starting = true
		return this._startingPromise = new Promise((resolve, reject) => {
			this.loadConfig('client_start')
				.then((config) => {
					this.setConfig(
						config,
						allowConfigCaching
					)
					this.init()
					this.updateWatch(true)
					this.startCheckConfig()

					this.connect()
						.then(
							() => resolve(true),
							(error) => reject(error)
						)
				})
				.catch((error) => {
					this._starting = false
					this.status = PullStatus.Offline
					this.stopCheckConfig()
					this.getLogger().error(`${Text.getDateForLog()}: Pull: could not read push-server config `, error)
					reject(error)
				})
		})
	}


	/**
	 * @done
	 * @param disconnectCode
	 * @param disconnectReason
	 */
	public restart(
		disconnectCode:number|CloseReasons = CloseReasons.NORMAL_CLOSURE,
		disconnectReason: string = 'manual restart'
	): void
	{
		if(this._restartTimeout)
		{
			clearTimeout(this._restartTimeout)
			this._restartTimeout = null
		}

		this.getLogger().log(`${Text.getDateForLog()}: Pull: restarting with code ${disconnectCode}`)

		this.disconnect(
			disconnectCode,
			disconnectReason
		)

		if(this._storage)
		{
			this._storage.remove(LsKeys.PullConfig)
		}

		this._config = null

		const loadConfigReason = `${disconnectCode}_${disconnectReason.replaceAll(' ', '_')}`
		this.loadConfig(loadConfigReason)
			.then(
				(config) => {
					this.setConfig(config, true)
					this.updateWatch()
					this.startCheckConfig()
					this.connect()
						.catch(error => {
							this.getLogger().error(error)
						})
				},
				(error) => {
					this.getLogger().error(`${Text.getDateForLog()}: Pull: could not read push-server config `, error)

					this.status = PullStatus.Offline
					if(this._reconnectTimeout)
					{
						clearTimeout(this._reconnectTimeout)
						this._reconnectTimeout = null
					}

					if(
						error?.status == 401
						|| error?.status == 403
					)
					{
						this.stopCheckConfig()
						this.onCustomEvent('onPullError', ['AUTHORIZE_ERROR'])
					}
				}
			)
	}


	/**
	 * @done
	 */
	public stop(
		disconnectCode: number|CloseReasons = CloseReasons.NORMAL_CLOSURE,
		disconnectReason: string = 'manual stop'
	): void
	{
		this.disconnect(
			disconnectCode,
			disconnectReason
		)

		this.stopCheckConfig()
	}

	/**
	 * @done
	 */
	public reconnect(
		disconnectCode: number|CloseReasons,
		disconnectReason: string,
		delay: number = 1
	): void
	{
		this.disconnect(
			disconnectCode,
			disconnectReason
		)

		this.scheduleReconnect(
			delay
		)
	}

	/**
	 * @done
	 * @param lastMessageId
	 */
	public setLastMessageId(lastMessageId: string): void
	{
		this._session.mid = lastMessageId;
	}

	/**
	 * @done
	 *
	 * Send single message to the specified users.
	 *
	 * @param users User ids of the message receivers.
	 * @param moduleId Name of the module to receive message,
	 * @param command Command name.
	 * @param {object} params Command parameters.
	 * @param [expiry] Message expiry time in seconds.
	 * @return {Promise}
	 */
	public async sendMessage(
		users: number[],
		moduleId: string,
		command: string,
		params: any,
		expiry?: number
	): Promise<any>
	{
		const message = {
			userList: users,
			body: {
				module_id: moduleId,
				command: command,
				params: params,
			},
			expiry: expiry
		}

		if(this.isJsonRpc())
		{
			return this._jsonRpcAdapter?.executeOutgoingRpcCommand(
				RpcMethod.Publish,
				message
			)
		}
		else
		{
			return this.sendMessageBatch([message])
		}
	}

	/**
	 * @done
	 * Send single message to the specified public channels.
	 *
	 * @param  publicChannels Public ids of the channels to receive message.
	 * @param moduleId Name of the module to receive message,
	 * @param command Command name.
	 * @param {object} params Command parameters.
	 * @param [expiry] Message expiry time in seconds.
	 * @return {Promise}
	 */
	public async sendMessageToChannels(
		publicChannels: string[],
		moduleId: string,
		command: string,
		params: any,
		expiry?: number
	): Promise<any>
	{
		const message = {
			channelList: publicChannels,
			body: {
				module_id: moduleId,
				command: command,
				params: params,
			},
			expiry: expiry
		}

		if (this.isJsonRpc())
		{
			return this._jsonRpcAdapter?.executeOutgoingRpcCommand(
				RpcMethod.Publish,
				message
			)
		}
		else
		{
			return this.sendMessageBatch([message])
		}
	}

	/**
	 * @done
	 * @param debugFlag
	 */
	public capturePullEvent(debugFlag: boolean = true): void
	{
		this._debug = debugFlag;
	}

	/**
	 * @done
	 * @param loggingFlag
	 */
	public enableLogging(loggingFlag: boolean = true): void
	{
		this._sharedConfig.setLoggingEnabled(loggingFlag)
		this._loggingEnabled = loggingFlag
	}

	/**
	 * Returns list channels that the connection is subscribed to.
	 *
	 * @returns {Promise}
	 */
	public async listChannels(): Promise<any>
	{
		return this._jsonRpcAdapter?.executeOutgoingRpcCommand(
			RpcMethod.ListChannels, {}
		) || Promise.reject(new Error('jsonRpcAdapter not init'))
	}

	/**
	 * @done
	 * Returns "last seen" time in seconds for the users. Result format: Object{userId: int}
	 * If the user is currently connected - will return 0.
	 * If the user if offline - will return diff between current timestamp and last seen timestamp in seconds.
	 * If the user was never online - the record for user will be missing from the result object.
	 *
	 * @param {integer[]} userList List of user ids.
	 * @returns {Promise}
	 */
	public async getUsersLastSeen(userList: number[]): Promise<Record<number, number>>
	{
		if(
			!Type.isArray(userList)
			|| !userList.every(item => typeof (item) === 'number')
		)
		{
			throw new Error('userList must be an array of numbers')
		}

		let result: Record<number, number> = {}

		return new Promise((resolve, reject) => {
			this._jsonRpcAdapter?.executeOutgoingRpcCommand(
				RpcMethod.GetUsersLastSeen,
				{
					userList: userList
				}
			)
				.then((response: any) => {
					/**
					 * @memo fix this
					 */
					let unresolved = []
					for(let i = 0; i < userList.length; i++)
					{
						if(!response.hasOwnProperty(userList[i]))
						{
							unresolved.push(userList[i]);
						}
					}

					if(unresolved.length === 0)
					{
						return resolve(result)
					}

					const params = {
						userIds: unresolved,
						sendToQueueSever: true
					}

					this._restClient.callMethod(
						'pull.api.user.getLastSeen',
						params
					)
						.then((response: AjaxResult) => {
							/**
							 * @memo fix this
							 */
							let data = (response.getData() as Payload<Record<NumberString, NumberString>>).result
							for (let userId in data)
							{
								result[Number(userId)] = Number(data[userId])
							}

							return resolve(result)
						})
						.catch(error => {
							this.getLogger().error(error)
							reject(error)
						})
				})
				.catch(error => {
					this.getLogger().error(error)
					reject(error)
				})
		})
	}

	/**
	 * @done
	 * Pings server. In case of success promise will be resolved, otherwise - rejected.
	 *
	 * @param {number} timeout Request timeout in seconds
	 * @returns {Promise}
	 */
	public async ping(timeout: number = 5): Promise<void>
	{
		return this._jsonRpcAdapter?.executeOutgoingRpcCommand(
			RpcMethod.Ping,
			{},
			timeout
		)
	}

	/**
	 * @done
	 * @param userId {number}
	 * @param callback {UserStatusCallback}
	 * @returns {Promise}
	 */
	public async subscribeUserStatusChange(
		userId: number,
		callback: UserStatusCallback
	): Promise<void>
	{
		return new Promise((resolve, reject) => {
			this._jsonRpcAdapter?.executeOutgoingRpcCommand(
				RpcMethod.SubscribeStatusChange,
				{
					userId
				}
			)
				.then(() => {
					if(!this._userStatusCallbacks[userId])
					{
						this._userStatusCallbacks[userId] = []
					}

					if(Type.isFunction(callback))
					{
						this._userStatusCallbacks[userId].push(callback)
					}

					return resolve()
				})
				.catch(err => reject(err))
		})
	}

	/**
	 * @done
	 * @param {number} userId
	 * @param {UserStatusCallback} callback
	 * @returns {Promise}
	 */
	public async unsubscribeUserStatusChange(
		userId: number,
		callback: UserStatusCallback
	): Promise<void>
	{
		if(this._userStatusCallbacks[userId])
		{
			this._userStatusCallbacks[userId] = this._userStatusCallbacks[userId].filter(
				cb => cb !== callback
			)

			if(this._userStatusCallbacks[userId].length === 0)
			{
				return this._jsonRpcAdapter?.executeOutgoingRpcCommand(
					RpcMethod.UnsubscribeStatusChange,
					{
						userId
					}
				)
			}
		}

		return Promise.resolve()
	}
	// endregion ////

	// region Get ////
	/**
	 * @done
	 */
	public getRevision(): number|null
	{
		return (this._config && this._config.api) ? this._config.api.revision_web : null
	}

	/**
	 * @done
	 */
	public getServerVersion(): number
	{
		return (this._config && this._config.server) ? this._config.server.version : 0
	}

	/**
	 * @done
	 */
	public getServerMode(): string|null
	{
		return (this._config && this._config.server) ? this._config.server.mode : null;
	}

	/**
	 * @done
	 */
	public getConfig(): null|TypePullClientConfig
	{
		return this._config;
	}

	/**
	 * @done
	 */
	public getDebugInfo(): any
	{
		if(!JSON || !JSON.stringify)
		{
			return {}
		}

		let configDump
		if(this._config && this._config.channels)
		{
			configDump = {
				ChannelID: this._config.channels.private?.id || "n/a",
				ChannelDie: this._config.channels.private?.end || "n/a",
				ChannelDieShared: this._config.channels.shared?.end || "n/a"
			}
		}
		else
		{
			configDump = {
				ConfigError: 'config is not loaded'
			}
		}

		let websocketMode = '-'
		if(
			this._connectors.webSocket
			&& (this._connectors.webSocket as WebSocketConnector)?.socket
		)
		{
			if(this.isJsonRpc())
			{
				websocketMode = 'json-rpc'
			}
			else
			{
				websocketMode = (
					(this._connectors.webSocket as WebSocketConnector)?.socket?.url.search('binaryMode=true') != -1
						? 'protobuf'
						: 'text'
				)
			}
		}

		return {
			"UserId": this._userId + (this._userId > 0 ? '' : '(guest)'),
			"Guest userId": (this._guestMode && this._guestUserId !== 0 ? this._guestUserId : "-"),
			"Browser online": (navigator.onLine ? 'Y' : 'N'),
			"Connect": (this.isConnected() ? 'Y' : 'N'),
			"Server type": (this.isSharedMode() ? 'cloud' : 'local'),
			"WebSocket supported": (this.isWebSocketSupported() ? 'Y' : 'N'),
			"WebSocket connected": (this._connectors.webSocket && this._connectors.webSocket.connected ? 'Y' : 'N'),
			"WebSocket mode": websocketMode,

			"Try connect": (this._reconnectTimeout ? 'Y' : 'N'),
			"Try number": (this._connectionAttempt),

			"Path": (this.connector?.connectionPath || '-'),
			...configDump,

			"Last message": (this._session.mid ? this._session.mid : '-'),
			"Session history": this._session.history,
			"Watch tags": this._watchTagsQueue.entries(),
		}
	}

	/**
	 * @process
	 * @param connectionType
	 */
	public getConnectionPath(connectionType: ConnectionType): string
	{
		let path
		let params: any = {}

		switch(connectionType)
		{
			case ConnectionType.WebSocket:
				path = this._isSecure
					? this._config?.server.websocket_secure
					: this._config?.server.websocket
				break;
			case ConnectionType.LongPolling:
				path = this._isSecure
					? this._config?.server.long_pooling_secure
					: this._config?.server.long_polling
				break
			default: throw new Error(`Unknown connection type ${connectionType}`)
		}

		if(!Type.isStringFilled(path))
		{
			throw new Error(`Empty path`)
		}

		if(
			typeof (this._config?.jwt) === 'string'
			&& this._config?.jwt !== ''
		)
		{
			params['token'] = this._config?.jwt
		}
		else
		{
			let channels: string[] = []

			if(this._config?.channels?.private)
			{
				channels.push(this._config.channels.private?.id || '')
			}

			if(this._config?.channels.private?.id)
			{
				channels.push(this._config.channels.private.id)
			}

			if(this._config?.channels.shared?.id)
			{
				channels.push(this._config.channels.shared.id)
			}

			if(channels.length === 0)
			{
				throw new Error(`Empty channels`)
			}

			params['CHANNEL_ID'] = channels.join('/')
		}

		if(this.isJsonRpc())
		{
			params.jsonRpc = 'true'
		}
		else if(this.isProtobufSupported())
		{
			params.binaryMode = 'true'
		}

		if(this.isSharedMode())
		{
			if(!this._config?.clientId)
			{
				throw new Error('Push-server is in shared mode, but clientId is not set')
			}

			params.clientId = this._config.clientId
		}
		if(this._session.mid)
		{
			params.mid = this._session.mid
		}
		if(this._session.tag)
		{
			params.tag = this._session.tag
		}
		if(this._session.time)
		{
			params.time = this._session.time
		}
		params.revision = REVISION

		return `${path}?${Text.buildQueryString(params)}`
	}

	/**
	 * @process
	 */
	public getPublicationPath(): string
	{
		const path = this._isSecure
			? this._config?.server.publish_secure
			: this._config?.server.publish

		if(!path)
		{
			return ''
		}

		let channels: string[] = []

		if(this._config?.channels.private?.id)
		{
			channels.push(this._config.channels.private.id)
		}

		if(this._config?.channels.shared?.id)
		{
			channels.push(this._config.channels.shared.id)
		}

		const params = {
			CHANNEL_ID: channels.join('/')
		}

		return path + '?' + Text.buildQueryString(params)
	}
	// endregion ////

	// region Is* ////
	/**
	 * @done
	 */
	public isConnected(): boolean
	{
		return this.connector ? this.connector.connected : false
	}

	/**
	 * @done
	 */
	public isWebSocketSupported(): boolean
	{
		return typeof (window.WebSocket) !== 'undefined'
	}

	/**
	 * @done
	 */
	public isWebSocketAllowed(): boolean
	{
		if(this._sharedConfig.isWebSocketBlocked())
		{
			return false
		}

		return this.isWebSocketEnabled()
	}

	/**
	 * @done
	 */
	public isWebSocketEnabled(): boolean
	{
		if(!this.isWebSocketSupported())
		{
			return false
		}

		if(!this._config)
		{
			return false
		}

		if(!this._config.server)
		{
			return false
		}

		return this._config.server.websocket_enabled
	}

	/**
	 * @done
	 */
	public isPublishingSupported(): boolean
	{
		return this.getServerVersion() > 3
	}

	/**
	 * @done
	 */
	public isPublishingEnabled(): boolean
	{
		if(!this.isPublishingSupported())
		{
			return false
		}

		return this._config?.server.publish_enabled === true
	}

	/**
	 * @done
	 */
	public isProtobufSupported(): boolean
	{
		return (
			this.getServerVersion() == 4
			&& !Browser.isIE()
		)
	}

	/**
	 * @done
	 */
	public isJsonRpc(): boolean
	{
		return (this.getServerVersion() >= 5)
	}

	/**
	 * @done
	 */
	public isSharedMode(): boolean
	{
		return (this.getServerMode() === ServerMode.Shared)
	}
	// endregion ////

	// region Events ////
	/**
	 * @dones
	 * @param {TypePullClientEmitConfig} params
	 * @returns {boolean}
	 */
	private emit(params: TypePullClientEmitConfig): boolean
	{
		if(
			params.type == SubscriptionType.Server
			|| params.type == SubscriptionType.Client
		)
		{
			if(typeof (this._subscribers[params.type]) === 'undefined')
			{
				this._subscribers[params.type] = {}
			}

			if((typeof params.moduleId === 'undefined'))
			{
				throw new Error(`${Text.getDateForLog()}: Pull.emit: parameter moduleId is not specified`)
			}

			if(typeof (this._subscribers[params.type][params.moduleId]) === 'undefined')
			{
				this._subscribers[params.type][params.moduleId] = {
					callbacks: [],
					commands: {}
				}
			}

			if(this._subscribers[params.type][params.moduleId]['callbacks'].length > 0)
			{
				this._subscribers[params.type][params.moduleId]['callbacks'].forEach((callback: CommandHandlerFunctionV1) => {
					callback(
						params.data as Record<string, any>,
						{
							type: params.type,
							moduleId: params.moduleId
						}
					)
				})
			}

			if (
				!(typeof (params.data) === 'undefined')
				&& !(typeof (params.data['command']) === 'undefined')
				&& this._subscribers[params.type][params.moduleId]['commands'][params.data['command']]
				&& this._subscribers[params.type][params.moduleId]['commands'][params.data['command']].length > 0)
			{
				this._subscribers[params.type][params.moduleId]['commands'][params.data['command']].forEach((callback: CommandHandlerFunctionV2) => {
					if((typeof (params.data) === 'undefined'))
					{
						return
					}

					callback(
						params.data['params'],
						params.data['extra'],
						params.data['command'],
						{
							type: params.type,
							moduleId: params.moduleId as string
						}
					)
				})
			}

			return true
		}
		else
		{
			if(typeof (this._subscribers[params.type]) === 'undefined')
			{
				this._subscribers[params.type] = []
			}

			if(this._subscribers[params.type].length <= 0)
			{
				return true
			}

			this._subscribers[params.type].forEach((callback: CommandHandlerFunctionV1) => {
				callback(
					params.data as Record<string, any>,
					{
						type: params.type
					}
				)
			})

			return true
		}
	}

	/**
	 * @process
	 *
	 * @param message
	 * @private
	 */
	private broadcastMessage(message: TypePullClientMessageBody): void
	{
		const moduleId = message.module_id = message.module_id.toLowerCase()
		const command = message.command

		if(!message.extra)
		{
			message.extra = {}
		}

		if(message.extra.server_time_unix)
		{
			message.extra.server_time_ago = (((new Date()).getTime() - (message.extra.server_time_unix * 1000)) / 1000) - (this._config?.server.timeShift
				? this._config?.server.timeShift : 0)
			message.extra.server_time_ago = message.extra.server_time_ago > 0
				? message.extra.server_time_ago
				: 0
		}

		this.logMessage(message)
		try
		{
			if(
				message.extra.sender
				&& message.extra.sender.type === SenderType.Client
			)
			{
				this.onCustomEvent('onPullClientEvent-' + moduleId, [command, message.params, message.extra], true)
				this.onCustomEvent('onPullClientEvent', [moduleId, command, message.params, message.extra], true)

				this.emit({
					type: SubscriptionType.Client,
					moduleId: moduleId,
					data: {
						command: command,
						params: Type.clone(message.params),
						extra: Type.clone(message.extra)
					}
				})
			}
			else if(moduleId === 'pull')
			{
				this.handleInternalPullEvent(command, message);
			}
			else if(moduleId == 'online')
			{
				if((message?.extra?.server_time_ago || 0) < 240)
				{
					this.onCustomEvent('onPullOnlineEvent', [command, message.params, message.extra], true)

					this.emit({
						type: SubscriptionType.Online,
						data: {
							command: command,
							params: Type.clone(message.params),
							extra: Type.clone(message.extra)
						}
					})
				}

				if(command === 'userStatusChange')
				{
					this.emitUserStatusChange(
						message.params.user_id,
						message.params.online
					)
				}
			}
			else
			{
				this.onCustomEvent('onPullEvent-' + moduleId, [command, message.params, message.extra], true)
				this.onCustomEvent('onPullEvent', [moduleId, command, message.params, message.extra], true)

				this.emit({
					type: SubscriptionType.Server,
					moduleId: moduleId,
					data: {
						command: command,
						params: Type.clone(message.params),
						extra: Type.clone(message.extra)
					}
				});
			}
		}
		catch(event)
		{
			this.getLogger().warn(
				"\n========= PULL ERROR ===========\n" +
				"Error type: broadcastMessages execute error\n" +
				"Error event: ", event, "\n" +
				"Message: ", message, "\n" +
				"================================\n"
			)
		}

		if(
			message.extra
			&& message.extra.revision_web
		)
		{
			this.checkRevision(Text.toInteger(message.extra.revision_web))
		}
	}


	/**
	 * @process
	 *
	 * @param messages
	 * @private
	 */
	private broadcastMessages(messages: TypePullClientMessageBody[]): void
	{
		messages.forEach(message => this.broadcastMessage(message))
	}

	// endregion ////

	// region sendMessage ////
	/**
	 * @done
	 * Sends batch of messages to the multiple public channels.
	 *
	 * @param messageBatchList Array of messages to send.
	 * @return void
	 */
	private async sendMessageBatch(
		messageBatchList: TypePullClientMessageBatch[]
	): Promise<any>
	{
		if(!this.isPublishingEnabled())
		{
			this.getLogger().error(`Client publishing is not supported or is disabled`)
			return Promise.reject(new Error(`Client publishing is not supported or is disabled`))
		}

		if (this.isJsonRpc())
		{
			let rpcRequest = this._jsonRpcAdapter?.createPublishRequest(messageBatchList)
			this.connector?.send(JSON.stringify(rpcRequest))

			return Promise.resolve(true)
		}
		else
		{
			let userIds: Record<number, number> = {}
			for (let i = 0; i < messageBatchList.length; i++)
			{
				const messageBatch = messageBatchList[i]

				if(typeof (messageBatch.userList) !== 'undefined')
				{
					const cnt = messageBatch.userList.length

					for(let j = 0; j < cnt; j++)
					{
						const userId = Number(messageBatch.userList[j])

						userIds[userId] = userId
					}
				}
			}

			this._channelManager?.getPublicIds(Object.values(userIds))
			.then((publicIds) => {
				const response = this.connector?.send(
					this.encodeMessageBatch(
						messageBatchList,
						publicIds
					)
				)

				return Promise.resolve(response)
			})
		}
	}

	/**
	 * @done
	 * @param messageBatchList
	 * @param publicIds
	 */
	private encodeMessageBatch(
		messageBatchList: TypePullClientMessageBatch[],
		publicIds: Record<number, TypeChanel>
	): ArrayBuffer|string
	{
		let messages: any[] = []
		messageBatchList.forEach((messageFields) => {

			const messageBody = messageFields.body

			let receivers: any[] = []
			if(messageFields.userList)
			{
				receivers = this.createMessageReceivers(
					messageFields.userList,
					publicIds
				)
			}

			if(messageFields.channelList)
			{
				if(!Type.isArray(messageFields.channelList))
				{
					throw new Error('messageFields.publicChannels must be an array')
				}

				messageFields.channelList.forEach((publicChannel) => {
					let publicId
					let signature
					if (
						typeof (publicChannel) === 'string'
						&& publicChannel.includes('.'))
					{
						const fields = publicChannel.toString().split('.')
						publicId = fields[0]
						signature = fields[1]
					}
					else if(
						typeof (publicChannel) === 'object'
						&& ('publicId' in publicChannel)
						&& ('signature' in publicChannel)
					)
					{
						publicId = publicChannel?.publicId
						signature = publicChannel?.signature
					}
					else
					{
						throw new Error('Public channel MUST be either a string, formatted like "{publicId}.{signature}" or an object with fields \'publicId\' and \'signature\'')
					}

					receivers.push(Receiver.create({
						id: this.encodeId(publicId),
						signature: this.encodeId(signature)
					}))
				})
			}

			const message = IncomingMessage.create({
				receivers: receivers,
				body: JSON.stringify(messageBody),
				expiry: messageFields.expiry || 0
			})
			messages.push(message)
		})

		const requestBatch = RequestBatch.create({
			requests: [{
				incomingMessages: {
					messages: messages
				}
			}]
		})

		return RequestBatch.encode(requestBatch).finish()
	}

	/**
	 * @done
	 * @memo fix return type
	 * @param users
	 * @param publicIds
	 */
	private createMessageReceivers(
		users: number[],
		publicIds: Record<number, TypeChanel>
	): any[]
	{
		let result = []
		for(let i = 0; i < users.length; i++)
		{
			let userId = users[i]
			if(
				!publicIds[userId]
				|| !publicIds[userId].publicId
			)
			{
				throw new Error(`Could not determine public id for user ${userId}`)
			}

			result.push(Receiver.create({
				id: this.encodeId(publicIds[userId].publicId),
				signature: this.encodeId(publicIds[userId].signature)
			}))
		}

		return result
	}
	// endregion ////

	// region _userStatusCallbacks ////
	/**
	 * @done
	 * @param userId
	 * @param isOnline
	 * @private
	 */
	private emitUserStatusChange(
		userId: number,
		isOnline: boolean
	): void
	{
		if(this._userStatusCallbacks[userId])
		{
			this._userStatusCallbacks[userId].forEach(callback=> callback({
				userId,
				isOnline
			}))
		}
	}

	/**
	 * @done
	 * @private
	 */
	private restoreUserStatusSubscription(): void
	{
		for(const userId in this._userStatusCallbacks)
		{
			if(
				this._userStatusCallbacks.hasOwnProperty(userId)
				&& this._userStatusCallbacks[userId].length > 0
			)
			{
				this._jsonRpcAdapter?.executeOutgoingRpcCommand(
					RpcMethod.SubscribeStatusChange,
					{
						userId: userId
					}
				)
			}
		}
	}
	// endregion ////

	// region Config ////
	/**
	 * @done
	 *
	 * @param logTag
	 * @private
	 */
	private async loadConfig(logTag?: string): Promise<TypePullClientConfig>
	{
		if(!this._config)
		{
			this._config = Object.assign({}, EmptyConfig)

			let config: any
			if(this._storage)
			{
				config = this._storage.get(LsKeys.PullConfig, null)
			}

			if(
				this.isConfigActual(config)
				&& this.checkRevision(config.api.revision_web)
			)
			{
				return Promise.resolve(config)
			}
			else if(this._storage)
			{
				this._storage.remove(LsKeys.PullConfig)
			}
		}
		else if(
			this.isConfigActual(this._config)
			&& this.checkRevision(this._config.api.revision_web)
		)
		{
			return Promise.resolve(this._config);
		}
		else
		{
			this._config = Object.assign({}, EmptyConfig)
		}

		return new Promise((resolve, reject) => {

			this._restClient.getHttpClient().setLogTag(logTag)

			this._restClient.callMethod(
				this._configGetMethod,
				{
					CACHE: 'N'
				}
			)
			.then((response) => {
				const data = response.getData().result

				let timeShift
				timeShift = Math.floor(((new Date()).getTime() - new Date(data.serverTime).getTime()) / 1000)

				delete data.serverTime

				let config = Object.assign({}, data);
				config.server.timeShift = timeShift

				resolve(config)
			})
			.catch((error) => {
				if(
					error?.answerError?.error === 'AUTHORIZE_ERROR'
					|| error?.answerError?.error === 'WRONG_AUTH_TYPE'
				)
				{
					(error as AjaxError).status = 403;
				}

				reject(error)
			})
			.finally(() => {
				this._restClient.getHttpClient().clearLogTag()
			})
		})
	}

	/**
	 * @done
	 * @param config
	 */
	private isConfigActual(config: any): boolean
	{
		if(!Type.isPlainObject(config))
		{
			return false
		}

		if(Number(config.server.config_timestamp) !== this._configTimestamp)
		{
			return false
		}

		const now = new Date()

		if(
			Type.isNumber(config.exp)
			&& config.exp > 0
			&& config.exp < (now.getTime() / 1000)
		)
		{
			return false
		}

		const channelCount = Object.keys(config.channels).length
		if(channelCount === 0)
		{
			return false
		}

		for(let channelType in config.channels)
		{
			if(!config.channels.hasOwnProperty(channelType))
			{
				continue
			}

			const channel = config.channels[channelType]
			const channelEnd = new Date(channel.end)

			if(channelEnd < now)
			{
				return false
			}
		}

		return true
	}

	/**
	 * @done
	 * @private
	 */
	private startCheckConfig(): void
	{
		if(this._checkInterval)
		{
			clearInterval(this._checkInterval)
			this._checkInterval = null
		}

		this._checkInterval = setInterval(
			this.checkConfig.bind(this),
			CONFIG_CHECK_INTERVAL
		)
	}

	/**
	 * @done
	 */
	private stopCheckConfig(): void
	{
		if(this._checkInterval)
		{
			clearInterval(this._checkInterval)
		}
		this._checkInterval = null
	}

	/**
	 * @done
	 * @private
	 */
	private checkConfig(): boolean
	{
		if (this.isConfigActual(this._config))
		{
			if(!this.checkRevision(Text.toInteger(this._config?.api.revision_web)))
			{
				return false
			}
		}
		else
		{
			this.logToConsole('Stale config detected. Restarting')
			this.restart(
				CloseReasons.CONFIG_EXPIRED,
				'config expired'
			)
		}

		return true
	}

	/**
	 * @done
	 *
	 * @param config
	 * @param allowCaching
	 * @private
	 */
	private setConfig(
		config: TypePullClientConfig,
		allowCaching: boolean
	): void
	{
		for(let key in config)
		{
			if(
				config.hasOwnProperty(key)
				&& this._config?.hasOwnProperty(key)
			)
			{
				// @ts-ignore
				this._config[key] = config[key];
			}
		}

		if(config.publicChannels)
		{
			this.setPublicIds(
				Array.from(Object.values(config.publicChannels))
			)
		}

		this._configTimestamp = Number(config.server.config_timestamp)

		if(
			this._storage
			&& allowCaching
		)
		{
			try
			{
				this._storage.set(
					LsKeys.PullConfig,
					config
				)
			}
			catch(error)
			{
				/**
				 * @memotry to delete the key "history"
				 * (landing site change history, see http://jabber.bx/view.php?id=136492)
				 */
				if(
					localStorage
					&& localStorage.removeItem
				)
				{
					localStorage.removeItem('history')
				}
				this.getLogger().error(`${Text.getDateForLog()}: Pull: Could not cache config in local storage. Error: `, error)
			}
		}
	}

	/**
	 * @done
	 */
	private setPublicIds(publicIds: TypePublicIdDescriptor[]): void
	{
		this._channelManager.setPublicIds(publicIds)
	}

	/**
	 * @done
	 * @param serverRevision
	 * @private
	 */
	private checkRevision(serverRevision: number): boolean
	{
		if(this._skipCheckRevision)
		{
			return true
		}

		if(
			serverRevision > 0
			&& serverRevision !== REVISION
		)
		{
			this._enabled = false
			this.showNotification('PULL_OLD_REVISION')
			this.disconnect(
				CloseReasons.NORMAL_CLOSURE,
				'check_revision'
			)

			this.onCustomEvent('onPullRevisionUp', [serverRevision, REVISION])

			this.emit({
				type: SubscriptionType.Revision,
				data: {
					server: serverRevision,
					client: REVISION
				}
			})

			this.logToConsole(`Pull revision changed from ${REVISION} to ${serverRevision}. Reload required`)

			return false
		}

		return true
	}
	// endregion ////

	// region Connect|ReConnect|DisConnect ////
	/**
	 * @done
	 */
	private disconnect(
		disconnectCode: number,
		disconnectReason: string
	): void
	{
		if(this.connector)
		{
			this._isManualDisconnect = true
			this.connector.disconnect(
				disconnectCode,
				disconnectReason
			)
		}
	}

	/**
	 * @done
	 */
	private restoreWebSocketConnection(): void
	{
		if(this._connectionType === ConnectionType.WebSocket)
		{
			return
		}

		this._connectors.webSocket?.connect()
	}

	/**
	 * @done
	 * @param connectionDelay
	 * @private
	 */
	private scheduleReconnect(connectionDelay: number = 0): void
	{
		if(!this._enabled)
		{
			return
		}

		if(!connectionDelay)
		{
			/**
			 * never fallback to long polling
			 * @memo remove long polling support later
			 */
			/*/
			if(
				this._connectionAttempt > 3
				&& this._connectionType === ConnectionType.WebSocket
				&& !this._sharedConfig.isLongPollingBlocked()
			)
			{
				// Websocket seems to be closed by network filter. Trying to fall back to long polling ////
				this._sharedConfig.setWebSocketBlocked(true)
				this._connectionType = ConnectionType.LongPolling
				this._connectionAttempt = 1
				connectionDelay = 1
			}
			else
			//*/
			{
				connectionDelay = this.getConnectionAttemptDelay(this._connectionAttempt)
			}
		}
		if(this._reconnectTimeout)
		{
			clearTimeout(this._reconnectTimeout)
			this._reconnectTimeout = null
		}

		this.logToConsole(
			`Pull: scheduling reconnection in ${ connectionDelay } seconds; attempt # ${ this._connectionAttempt }`
		);

		this._reconnectTimeout = setTimeout(
			() => {
				this.connect()
				.catch(error => {
					this.getLogger().error(error)
				})
			},
			connectionDelay * 1_000
		)
	}

	/**
	 * @done
	 * @private
	 */
	private scheduleRestoreWebSocketConnection(): void
	{
		this.logToConsole(
			`Pull: scheduling restoration of websocket connection in ${RESTORE_WEBSOCKET_TIMEOUT} seconds`
		);

		if(this._restoreWebSocketTimeout)
		{
			return
		}

		this._restoreWebSocketTimeout = setTimeout(() =>
			{
				this._restoreWebSocketTimeout = 0
				this.restoreWebSocketConnection()
			},
			RESTORE_WEBSOCKET_TIMEOUT * 1_000
		)
	}

	/**
	 * @done
	 * @returns {Promise}
	 */
	private async connect(): Promise<void>
	{
		if(!this._enabled)
		{
			return Promise.reject()
		}
		if(this.connector?.connected)
		{
			return Promise.resolve()
		}

		if(this._reconnectTimeout)
		{
			clearTimeout(this._reconnectTimeout)
			this._reconnectTimeout = null
		}

		this.status = PullStatus.Connecting
		this._connectionAttempt++
		return new Promise((resolve, reject) => {
			this._connectPromise = {
				resolve,
				reject
			}
			this.connector?.connect()
		})
	}

	/**
	 * @done
	 * @param disconnectCode
	 * @param disconnectReason
	 * @param restartDelay
	 * @private
	 */
	private scheduleRestart(
		disconnectCode: number,
		disconnectReason: string,
		restartDelay: number = 0
	): void
	{
		if(this._restartTimeout)
		{
			clearTimeout(this._restartTimeout)
			this._restartTimeout = null
		}

		if(restartDelay < 1)
		{
			restartDelay = Math.ceil(Math.random() * 30) + 5
		}

		this._restartTimeout = setTimeout(
			() => this.restart(disconnectCode, disconnectReason),
			restartDelay * 1_000
		)
	}
	// endregion ////

	// region Handlers ////
	/**
	 * @done
	 *
	 * @param messageFields
	 * @private
	 */
	private handleRpcIncomingMessage(messageFields: any): {}
	{
		this._session.mid = messageFields.mid
		let body = messageFields.body

		if(!messageFields.body.extra)
		{
			body.extra = {}
		}
		body.extra.sender = messageFields.sender

		if(
			"user_params" in messageFields
			&& Type.isPlainObject(messageFields.user_params)
		)
		{
			Object.assign(body.params, messageFields.user_params)
		}

		if(
			"dictionary" in messageFields
			&& Type.isPlainObject(messageFields.dictionary)
		)
		{
			Object.assign(body.params, messageFields.dictionary)
		}

		if(this.checkDuplicate(messageFields.mid))
		{
			this.addMessageToStat(body)
			this.trimDuplicates()
			this.broadcastMessage(body)
		}

		this.connector?.send(`mack:${messageFields.mid}`)

		return {}
	}

	/**
	 * @done
	 * @param events
	 * @private
	 */
	private handleIncomingEvents(events: TypeSessionEvent[]): void
	{
		let messages: TypePullClientMessageBody[] = []
		if(events.length === 0)
		{
			this._session.mid = null
			return
		}

		for(let i = 0; i < events.length; i++)
		{
			let event = events[i]
			this.updateSessionFromEvent(event)

			if(
				event.mid
				&& !this.checkDuplicate(event.mid)
			)
			{
				continue
			}

			this.addMessageToStat(
				event.text as { module_id: string, command: string }
			)
			messages.push(event.text as TypePullClientMessageBody);
		}
		this.trimDuplicates()
		this.broadcastMessages(messages)
	}

	/**
	 * @done
	 * @param event
	 * @private
	 */
	private updateSessionFromEvent(
		event: TypeSessionEvent
	): void
	{
		this._session.mid = event.mid || null
		this._session.tag = event.tag || null
		this._session.time = event.time || null
	}

	/**
	 * @process
	 *
	 * @param command
	 * @param message
	 * @private
	 */
	private handleInternalPullEvent(
		command: string,
		message: TypePullClientMessageBody
	): void
	{
		switch(command.toUpperCase())
		{
			case SystemCommands.CHANNEL_EXPIRE:
			{
				if(message.params.action === 'reconnect')
				{
					const typeChanel = (message.params?.channel.type as string)
					if(
						typeChanel === 'private'
						&& this._config?.channels?.private
					)
					{
						this._config.channels.private = message.params.new_channel
						this.logToConsole(`Pull: new config for ${message.params.channel.type} channel set: ${this._config.channels.private}`)
					}
					if(
						typeChanel === 'shared'
						&& this._config?.channels?.shared
					)
					{
						this._config.channels.shared = message.params.new_channel
						this.logToConsole(`Pull: new config for ${message.params.channel.type} channel set: ${this._config.channels.shared}`)
					}

					this.reconnect(
						CloseReasons.CONFIG_REPLACED,
						'config was replaced'
					)
				}
				else
				{
					this.restart(
						CloseReasons.CHANNEL_EXPIRED,
						'channel expired received'
					)
				}
				break
			}
			case SystemCommands.CONFIG_EXPIRE:
			{
				this.restart(
					CloseReasons.CONFIG_EXPIRED,
					'config expired received'
				)
				break
			}
			case SystemCommands.SERVER_RESTART:
			{
				this.reconnect(
					CloseReasons.SERVER_RESTARTED,
					'server was restarted',
					15
				)
				break
			}
			default:
		}
	}

	// region Handlers For Message ////
	/**
	 * @done
	 * @param response
	 * @private
	 */
	private onIncomingMessage(response: string|ArrayBuffer): void
	{
		if(this.isJsonRpc())
		{
			(response === JSON_RPC_PING)
				? this.onJsonRpcPing()
				: this._jsonRpcAdapter?.parseJsonRpcMessage(
					response as string
				)
		}
		else
		{
			const events = this.extractMessages(response)
			this.handleIncomingEvents(events)
		}
	}

	// region onLongPolling ////
	/**
	 * @done
	 */
	private onLongPollingOpen(): void
	{
		this._unloading = false
		this._starting = false
		this._connectionAttempt = 0
		this._isManualDisconnect = false
		this.status = PullStatus.Online

		this.logToConsole('Pull: Long polling connection with push-server opened')
		if(this.isWebSocketEnabled())
		{
			this.scheduleRestoreWebSocketConnection()
		}
		if(this._connectPromise)
		{
			this._connectPromise.resolve({})
		}
	}

	/**
	 * @done
	 * @param response
	 * @private
	 */
	private onLongPollingDisconnect(response: {code: number, reason: string}): void
	{
		if(this._connectionType === ConnectionType.LongPolling)
		{
			this.status = PullStatus.Offline
		}

		this.logToConsole(`Pull: Long polling connection with push-server closed. Code: ${response.code}, reason: ${response.reason}`)
		if(!this._isManualDisconnect)
		{
			this.scheduleReconnect()
		}
		this._isManualDisconnect = false
		this.clearPingWaitTimeout()
	}

	/**
	 * @done
	 * @param error
	 */
	private onLongPollingError(error: Error): void
	{
		this._starting = false;
		if(this._connectionType === ConnectionType.LongPolling)
		{
			this.status = PullStatus.Offline
		}

		this.getLogger().error(`${Text.getDateForLog()}: Pull: Long polling connection error `, error)

		this.scheduleReconnect()
		if(this._connectPromise)
		{
			this._connectPromise.reject(error)
		}

		this.clearPingWaitTimeout()
	}
	// endregion ////

	// region onWebSocket ////
	/**
	 * @done
	 * @param response
	 * @private
	 */
	private onWebSocketBlockChanged(response: {
		isWebSocketBlocked: boolean,
	}): void
	{
		const isWebSocketBlocked = response.isWebSocketBlocked

		if(
			isWebSocketBlocked
			&& this._connectionType === ConnectionType.WebSocket
			&& !this.isConnected()
		)
		{
			if(this._reconnectTimeout)
			{
				clearTimeout(this._reconnectTimeout)
				this._reconnectTimeout = null
			}

			this._connectionAttempt = 0
			this._connectionType = ConnectionType.LongPolling
			this.scheduleReconnect(1)
		}
		else if(
			!isWebSocketBlocked
			&& this._connectionType === ConnectionType.LongPolling
		)
		{
			if(this._reconnectTimeout)
			{
				clearTimeout(this._reconnectTimeout)
				this._reconnectTimeout = null
			}
			if(this._restoreWebSocketTimeout)
			{
				clearTimeout(this._restoreWebSocketTimeout)
				this._restoreWebSocketTimeout = null
			}

			this._connectionAttempt = 0;
			this._connectionType = ConnectionType.WebSocket
			this.scheduleReconnect(1)
		}
	}

	/**
	 * @done
	 */
	private onWebSocketOpen(): void
	{
		this._unloading = false
		this._starting = false
		this._connectionAttempt = 0
		this._isManualDisconnect = false
		this.status = PullStatus.Online
		this._sharedConfig.setWebSocketBlocked(false)

		// to prevent fallback to long polling in case of networking problems
		this._sharedConfig.setLongPollingBlocked(true)

		if(this._connectionType == ConnectionType.LongPolling)
		{
			this._connectionType = ConnectionType.WebSocket
			this._connectors.longPolling?.disconnect(
				CloseReasons.CONFIG_REPLACED,
				'Fire at onWebSocketOpen'
			)
		}

		if(this._restoreWebSocketTimeout)
		{
			clearTimeout(this._restoreWebSocketTimeout)
			this._restoreWebSocketTimeout = null
		}
		this.logToConsole('Pull: Websocket connection with push-server opened')
		if(this._connectPromise)
		{
			this._connectPromise.resolve({})
		}

		this.restoreUserStatusSubscription()
	}

	/**
	 * @done
	 * @param response
	 * @private
	 */
	private onWebSocketDisconnect(response: {code: number, reason: string}): void
	{
		if(this._connectionType === ConnectionType.WebSocket)
		{
			this.status = PullStatus.Offline;
		}

		this.logToConsole(`Pull: Websocket connection with push-server closed. Code: ${response.code}, reason: ${response.reason}`, true)
		if(!this._isManualDisconnect)
		{
			if(response.code == CloseReasons.WRONG_CHANNEL_ID)
			{
				this.scheduleRestart(
					CloseReasons.WRONG_CHANNEL_ID,
					'wrong channel signature'
				)
			}
			else
			{
				this.scheduleReconnect()
			}
		}

		// to prevent fallback to long polling in case of networking problems
		this._sharedConfig.setLongPollingBlocked(true)
		this._isManualDisconnect = false

		this.clearPingWaitTimeout()
	}

	/**
	 * @done
	 * @param error
	 */
	private onWebSocketError(error: Error): void
	{
		this._starting = false
		if(this._connectionType === ConnectionType.WebSocket)
		{
			this.status = PullStatus.Offline
		}

		this.getLogger().error(`${Text.getDateForLog()}: Pull: WebSocket connection error `, error)
		this.scheduleReconnect()
		if(this._connectPromise)
		{
			this._connectPromise.reject(error)
		}

		this.clearPingWaitTimeout()
	}
	// endregion ////
	// endregion ////

	// endregion ////

	// region extractMessages ////
	/**
	 * @done
	 * @param pullEvent
	 * @private
	 */
	private extractMessages(pullEvent: string|ArrayBuffer): TypeSessionEvent[]
	{
		if(pullEvent instanceof ArrayBuffer)
		{
			return this.extractProtobufMessages(pullEvent)
		}
		else if(Type.isStringFilled(pullEvent))
		{
			return this.extractPlainTextMessages(pullEvent)
		}

		throw new Error('Error pullEvent type')
	}

	/**
	 * @done
	 * @param pullEvent
	 * @private
	 */
	private extractProtobufMessages(pullEvent: ArrayBuffer): TypeSessionEvent[]
	{
		let result = []

		try
		{
			let responseBatch = ResponseBatch.decode(new Uint8Array(pullEvent))
			for(let i = 0; i < responseBatch.responses.length; i++)
			{
				let response = responseBatch.responses[i]
				if(response.command !== 'outgoingMessages')
				{
					continue
				}

				let messages = response.outgoingMessages.messages
				for(let m = 0; m < messages.length; m++)
				{
					const message = messages[m]
					let messageFields
					try
					{
						messageFields = JSON.parse(message.body)
					}
					catch (error)
					{
						this.getLogger().error(`${Text.getDateForLog()}: Pull: Could not parse message body `, error)
						continue
					}

					if(!messageFields.extra)
					{
						messageFields.extra = {}
					}
					messageFields.extra.sender = {
						type: message.sender.type
					}

					if(message.sender.id instanceof Uint8Array)
					{
						messageFields.extra.sender.id = this.decodeId(message.sender.id)
					}

					const compatibleMessage = {
						mid: this.decodeId(message.id),
						text: messageFields
					}

					result.push(compatibleMessage)
				}
			}
		}
		catch (error)
		{
			this.getLogger().error(`${Text.getDateForLog()}: Pull: Could not parse message `, error)
		}

		return result
	}

	/**
	 * @done
	 * @param pullEvent
	 * @private
	 */
	private extractPlainTextMessages(pullEvent: string): TypeSessionEvent[]
	{
		let result = []

		const dataArray = pullEvent.match(/#!NGINXNMS!#(.*?)#!NGINXNME!#/gm)
		if(dataArray === null)
		{
			const text = "\n========= PULL ERROR ===========\n" +
				"Error type: parseResponse error parsing message\n" +
				"\n" +
				`Data string: ${pullEvent}` + "\n" +
				"================================\n\n";
			this.getLogger().warn(text)

			return []
		}
		for(let i = 0; i < dataArray.length; i++)
		{
			dataArray[i] = dataArray[i].substring(12, dataArray[i].length - 12)
			if(dataArray[i].length <= 0)
			{
				continue
			}

			let data
			try
			{
				data = JSON.parse(dataArray[i])
			}
			catch (error)
			{
				continue
			}

			result.push(data as TypeSessionEvent)
		}

		return result
	}

	/**
	 * @done
	 * Converts message id from byte[] to string
	 * @param {Uint8Array} encodedId
	 * @return {string}
	 */
	private decodeId(encodedId: Uint8Array): string
	{
		let result = ''
		for(let i = 0; i < encodedId.length; i++)
		{
			const hexByte = encodedId[i].toString(16)
			if(hexByte.length === 1)
			{
				result += '0'
			}
			result += hexByte
		}

		return result
	}

	/**
	 * @done
	 * Converts message id from hex-encoded string to byte[]
	 * @param {string} id Hex-encoded string.
	 * @return {Uint8Array}
	 */
	private encodeId(id: string): Uint8Array
	{
		if(!id)
		{
			return new Uint8Array()
		}

		let result = [];
		for (let i = 0; i < id.length; i += 2)
		{
			result.push(parseInt(id.substring(i, 2), 16))
		}

		return new Uint8Array(result)
	}
	// endregion ////

	// region Events.Status /////
	/**
	 * @done
	 */
	private onOffline(): void
	{
		this.disconnect(
			CloseReasons.NORMAL_CLOSURE,
			'offline'
		)
	}

	/**
	 * @done
	 */
	private onOnline(): void
	{
		this.connect()
		.catch(error => {
			this.getLogger().error(error)
		})
	}

	/**
	 * @done
	 * @private
	 */
	private onBeforeUnload(): void
	{
		this._unloading = true

		const session = Type.clone(this.session)
		session.ttl = (new Date()).getTime() + LS_SESSION_CACHE_TIME * 1000;
		if(this._storage)
		{
			try
			{
				this._storage.set(
					LS_SESSION,
					JSON.stringify(session),
					//LS_SESSION_CACHE_TIME
				)
			}
			catch(error)
			{
				this.getLogger().error(`${Text.getDateForLog()}: Pull: Could not save session info in local storage. Error: `, error)
			}
		}

		this.scheduleReconnect(15)
	}
	// endregion ////

	// region PullStatus ////
	/**
	 * @done
	 * @param status
	 * @param delay
	 * @private
	 */
	private sendPullStatusDelayed(
		status: PullStatus,
		delay: number
	): void
	{
		if(this._offlineTimeout)
		{
			clearTimeout(this._offlineTimeout)
			this._offlineTimeout = null
		}

		this._offlineTimeout = setTimeout(
			() => {
				this._offlineTimeout = null
				this.sendPullStatus(status)
			},
			delay
		)
	}

	/**
	 * @done
	 * @param status
	 * @private
	 */
	private sendPullStatus(
		status: PullStatus
	): void
	{
		if(this._unloading)
		{
			return
		}

		this.onCustomEvent('onPullStatus', [status])

		this.emit({
			type: SubscriptionType.Status,
			data: {
				status: status
			}
		})
	}
	// endregion ////

	// region _watchTagsQueue ////
	/**
	 * @done
	 * @memo if private ?
	 * @param tagId
	 * @param force
	 */
	private extendWatch(
		tagId: string,
		force: boolean = false
	): void
	{
		if(this._watchTagsQueue.get(tagId))
		{
			return
		}

		this._watchTagsQueue.set(tagId, true)
		if(force)
		{
			this.updateWatch(force)
		}
	}

	/**
	 * @done
	 * @param force
	 * @private
	 */
	private updateWatch(force: boolean = false): void
	{
		if(this._watchUpdateTimeout)
		{
			clearTimeout(this._watchUpdateTimeout)
			this._watchUpdateTimeout = null
		}

		this._watchUpdateTimeout = setTimeout(
			() => {
				/**
				 * @memo test this
				 */
				const watchTags = Array.from(this._watchTagsQueue.keys())

				if(watchTags.length > 0)
				{
					this._restClient.callMethod(
						'pull.watch.extend',
						{
							tags: watchTags
						}
					)
					.then((response: AjaxResult) => {

						/**
						 * @memo test this
						 */
						const updatedTags: NumberString[] = (response.getData() as Payload<NumberString[]>).result

						updatedTags.forEach((tagId: NumberString) => this.clearWatch(tagId))

						this.updateWatch()
					})
					.catch(() => {
						this.updateWatch()
					})
				}
				else
				{
					this.updateWatch()
				}
			},
			force
				? this._watchForceUpdateInterval
				: this._watchUpdateInterval
		)
	}

	/**
	 * @done
	 * @param tagId
	 * @private
	 */
	private clearWatch(tagId: string): void
	{
		this._watchTagsQueue.delete(tagId)
	}
	// endregion ////

	// region Ping ////
	/**
	 * @done
	 * @private
	 */
	private onJsonRpcPing(): void
	{
		this.updatePingWaitTimeout()
		this.connector?.send(
			JSON_RPC_PONG
		)
	}

	/**
	 * @done
	 * @private
	 */
	private updatePingWaitTimeout(): void
	{
		if(this._pingWaitTimeout)
		{
			clearTimeout(this._pingWaitTimeout);
			this._pingWaitTimeout = null
		}

		this._pingWaitTimeout = setTimeout(
			this._onPingTimeoutHandler,
			PING_TIMEOUT * 2 * 1_000
		)
	}

	/**
	 * @done
	 * @private
	 */
	private clearPingWaitTimeout(): void
	{
		if(this._pingWaitTimeout)
		{
			clearTimeout(this._pingWaitTimeout)
		}

		this._pingWaitTimeout = null
	}

	/**
	 * @done
	 * @private
	 */
	private onPingTimeout(): void
	{
		this._pingWaitTimeout = null
		if(
			!this._enabled
			|| !this.isConnected()
		)
		{
			return
		}

		this.getLogger().warn(`No pings are received in ${PING_TIMEOUT * 2} seconds. Reconnecting`)
		this.disconnect(
			CloseReasons.STUCK,
			'connection stuck'
		)

		this.scheduleReconnect()
	}
	// endregion ////

	// region Time ////
	/**
	 * @done
	 * Returns reconnect delay in seconds
	 *
	 * @param attemptNumber
	 * @return {number}
	 */
	private getConnectionAttemptDelay(attemptNumber: number): number
	{
		let result;
		if (attemptNumber < 1)
		{
			result = 0.5;
		}
		else if(attemptNumber < 3)
		{
			result = 15;
		}
		else if(attemptNumber < 5)
		{
			result = 45;
		}
		else if(attemptNumber < 10)
		{
			result = 600;
		}
		else
		{
			result = 3_600;
		}

		return result + (result * Math.random() * 0.2);
	}
	// endregion ////

	// region Tools ////
	/**
	 * @done
	 * @param mid
	 */
	private checkDuplicate(mid: string): boolean
	{
		if(this._session.lastMessageIds.includes(mid))
		{
			this.getLogger().warn(`Duplicate message ${mid} skipped`)
			return false
		}
		else
		{
			this._session.lastMessageIds.push(mid);
			return true
		}
	}

	/**
	 * @done
	 */
	private trimDuplicates(): void
	{
		if(this._session.lastMessageIds.length > MAX_IDS_TO_STORE)
		{
			this._session.lastMessageIds = this._session.lastMessageIds.slice(-MAX_IDS_TO_STORE)
		}
	}
	// endregion ////

	// region Logging ////
	/**
	 * @done
	 * @param message
	 * @private
	 */
	private logMessage(message: TypePullClientMessageBody): void
	{
		if(!this._debug)
		{
			return
		}

		if(message.extra?.sender && message.extra.sender.type === SenderType.Client)
		{
			this.getLogger().info(`onPullClientEvent-${message.module_id}`, message.command, message.params, message.extra)
		}
		else if(message.module_id == 'online')
		{
			this.getLogger().info(`onPullOnlineEvent`, message.command, message.params, message.extra)
		}
		else
		{
			this.getLogger().info(`onPullEvent`, message.module_id, message.command, message.params, message.extra)
		}
	}

	/**
	 * @done
	 * @param message
	 * @param force
	 * @private
	 */
	private logToConsole(
		message: string,
		force: boolean = false
	): void
	{
		if(
			this._loggingEnabled
			|| force
		)
		{
			this.getLogger().log(`${Text.getDateForLog()}: ${message}`)
		}
	}

	/**
	 * @done
	 * @param message
	 * @private
	 */
	private addMessageToStat(message: {
		module_id: string,
		command: string
	}): void
	{
		if(!this._session.history[message.module_id])
		{
			this._session.history[message.module_id] = {}
		}
		if(!this._session.history[message.module_id][message.command])
		{
			this.session.history[message.module_id][message.command] = 0
		}

		this._session.history[message.module_id][message.command]++

		this._session.messageCount++
	}

	/**
	 * @done
	 *
	 * @param text
	 */
	private showNotification(text: string): void
	{
		this.getLogger().warn(text)

		/*/
		if(this._notificationPopup || typeof BX.PopupWindow === 'undefined')
		{
			return;
		}

		this._notificationPopup = new BX.PopupWindow('bx-notifier-popup-confirm', null, {
			zIndex: 200,
			autoHide: false,
			closeByEsc: false,
			overlay: true,
			content: BX.create("div", {
				props: {className: "bx-messenger-confirm"},
				html: text
			}),
			buttons: [
				new BX.PopupWindowButton({
					text: BX.message('JS_CORE_WINDOW_CLOSE'),
					className: "popup-window-button-decline",
					events: {
						click: () => this._notificationPopup.close(),
					}
				})
			],
			events: {
				onPopupClose: () => this._notificationPopup.destroy(),
				onPopupDestroy: () => this._notificationPopup = null,
			}
		});
		this._notificationPopup.show();
		//*/
	}
	// endregion ////

	// region onCustomEvent ////
	/**
	 * @done
	 * @memo may be need use onCustomEvent
	 * @memo wtf ? force
	 */
	private onCustomEvent(
		eventName: string,
		data: any,
		force: boolean = false
	): void
	{
		if(eventName || data || force)
		{

		}
		/*/
		if (BX && BX.onCustomEvent)
		{
			BX.onCustomEvent(window, eventName, data, force)
		}
		//*/
	}
	// endregion ////
	
	// region deprecated /////
	/**
	 * @deprecated
	 */
	/*/
	getRestClientOptions()
	{
		let result = {};

		if (this.guestMode && this.guestUserId !== 0)
		{
			result.queryParams = {
				pull_guest_id: this.guestUserId
			}
		}
		return result;
	}
	//*/
	// endregion ////
}
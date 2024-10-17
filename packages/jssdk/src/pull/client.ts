import { Utils } from './utils'
import { JsonRpc } from './jsonRpc'
import {
	CloseReasons,
	ConnectionType, EmptyConfig, JSON_RPC_PING, JSON_RPC_PONG, PING_TIMEOUT,
	PullStatus, RpcMethod,
	SenderType,
	ServerMode,
	SubscriptionType,
	SystemCommands
} from "../types/pull";

export class PullClient
{
	constructor(params)
	{
		params = params || {};

		if (params.restApplication)
		{
			if (typeof params.configGetMethod === 'undefined')
			{
				params.configGetMethod = 'pull.application.config.get';
			}
			if (typeof params.skipCheckRevision === 'undefined')
			{
				params.skipCheckRevision = true;
			}
			if (typeof params.restApplication === 'string')
			{
				params.siteId = params.restApplication;
			}

			params.serverEnabled = true;
		}

		this._status = PullStatus.Offline;

		this.context = 'master';

		this.guestMode = params.guestMode ? params.guestMode : (typeof BX.message !== 'undefined' && BX.message.pull_guest_mode ? BX.message.pull_guest_mode === 'Y' : false);
		this.guestUserId = params.guestUserId ? params.guestUserId : (typeof BX.message !== 'undefined' && BX.message.pull_guest_user_id ? parseInt(BX.message.pull_guest_user_id, 10) : 0);
		if (this.guestMode && this.guestUserId)
		{
			this.userId = this.guestUserId;
		}
		else
		{
			this.userId = params.userId ? params.userId : (typeof BX.message !== 'undefined' && BX.message.USER_ID ? BX.message.USER_ID : 0);
		}

		this.siteId = params.siteId ? params.siteId : (typeof BX.message !== 'undefined' && BX.message.SITE_ID ? BX.message.SITE_ID : 'none');
		this.restClient = typeof params.restClient !== "undefined" ? params.restClient : new BX.RestClient(this.getRestClientOptions());

		this.enabled = typeof params.serverEnabled !== 'undefined' ? (params.serverEnabled === 'Y' || params.serverEnabled === true) : (typeof BX.message !== 'undefined' && BX.message.pull_server_enabled === 'Y');
		this.unloading = false;
		this.starting = false;
		this.debug = false;
		this.connectionAttempt = 0;
		this.connectionType = ConnectionType.WebSocket;
		this.reconnectTimeout = null;
		this.restartTimeout = null;
		this.restoreWebSocketTimeout = null;

		this.configGetMethod = typeof params.configGetMethod !== 'string'
			? 'pull.config.get'
			: params.configGetMethod;
		this.getPublicListMethod = typeof params.getPublicListMethod !== 'string'
			? 'pull.channel.public.list'
			: params.getPublicListMethod;

		this.skipStorageInit = params.skipStorageInit === true;

		this.skipCheckRevision = params.skipCheckRevision === true;

		this._subscribers = {};

		this.watchTagsQueue = {};
		this.watchUpdateInterval = 1740000;
		this.watchForceUpdateInterval = 5000;

		if (typeof params.configTimestamp !== 'undefined')
		{
			this.configTimestamp = Number(params.configTimestamp);
		}
		else if (typeof BX.message !== 'undefined' && BX.message.pull_config_timestamp)
		{
			this.configTimestamp = Number(BX.message.pull_config_timestamp);
		}
		else
		{
			this.configTimestamp = 0;
		}

		this.session = {
			mid: null,
			tag: null,
			time: null,
			history: {},
			lastMessageIds: [],
			messageCount: 0
		};

		this._connectors = {
			webSocket: null,
			longPolling: null
		};

		this.isSecure = document.location.href.indexOf('https') === 0;
		this.config = null;

		this.storage = null;

		if (this.userId && !this.skipStorageInit)
		{
			this.storage = new StorageManager({
				userId: this.userId,
				siteId: this.siteId
			});
		}

		this.sharedConfig = new SharedConfig({
			onWebSocketBlockChanged: this.onWebSocketBlockChanged.bind(this),
			storage: this.storage
		});
		this.channelManager = new ChannelManager({
			restClient: this.restClient,
			getPublicListMethod: this.getPublicListMethod
		});

		this.notificationPopup = null;

		// timers
		this.checkInterval = null;
		this.offlineTimeout = null;

		this.pingWaitTimeout = null;

		// manual stop workaround
		this.isManualDisconnect = false;

		this.loggingEnabled = this.sharedConfig.isLoggingEnabled();

		// bound event handlers
		this.onPingTimeoutHandler = this.onPingTimeout.bind(this);

		this.userStatusCallbacks = {}; // [userId] => array of callbacks
	}

	get connector()
	{
		return this._connectors[this.connectionType];
	}

	get status()
	{
		return this._status;
	}

	set status(status)
	{
		if (this._status === status)
		{
			return;
		}

		this._status = status;
		if (this.offlineTimeout)
		{
			clearTimeout(this.offlineTimeout)
			this.offlineTimeout = null;
		}

		if (status === PullStatus.Offline)
		{
			this.sendPullStatusDelayed(status, OFFLINE_STATUS_DELAY);
		}
		else
		{
			this.sendPullStatus(status);
		}
	}

	/**
	 * Creates a subscription to incoming messages.
	 *
	 * @param {Object} params
	 * @param {string} [params.type] Subscription type (for possible values see SubscriptionType).
	 * @param {string} [params.moduleId] Name of the module.
	 * @param {Function} params.callback Function, that will be called for incoming messages.
	 * @returns {Function} - Unsubscribe callback function
	 */
	subscribe(params)
	{
		/**
		 * After modify this method, copy to follow scripts:
		 * mobile/install/mobileapp/mobile/extensions/bitrix/pull/client/events/extension.js
		 * mobile/install/js/mobile/pull/client/src/client.js
		 */

		if (!params)
		{
			console.error(Utils.getDateForLog() + ': Pull.subscribe: params for subscribe function is invalid. ');
			return function () {}
		}

		if (!Utils.isPlainObject(params))
		{
			return this.attachCommandHandler(params);
		}

		params = params || {};
		params.type = params.type || SubscriptionType.Server;
		params.command = params.command || null;

		if (params.type == SubscriptionType.Server || params.type == SubscriptionType.Client)
		{
			if (typeof (this._subscribers[params.type]) === 'undefined')
			{
				this._subscribers[params.type] = {};
			}
			if (typeof (this._subscribers[params.type][params.moduleId]) === 'undefined')
			{
				this._subscribers[params.type][params.moduleId] = {
					'callbacks': [],
					'commands': {},
				};
			}

			if (params.command)
			{
				if (typeof (this._subscribers[params.type][params.moduleId]['commands'][params.command]) === 'undefined')
				{
					this._subscribers[params.type][params.moduleId]['commands'][params.command] = [];
				}

				this._subscribers[params.type][params.moduleId]['commands'][params.command].push(params.callback);

				return function () {
					this._subscribers[params.type][params.moduleId]['commands'][params.command] = this._subscribers[params.type][params.moduleId]['commands'][params.command].filter((element) => {
						return element !== params.callback;
					});
				}.bind(this);
			}
			else
			{
				this._subscribers[params.type][params.moduleId]['callbacks'].push(params.callback);

				return function () {
					this._subscribers[params.type][params.moduleId]['callbacks'] = this._subscribers[params.type][params.moduleId]['callbacks'].filter((element) => {
						return element !== params.callback;
					});
				}.bind(this);
			}
		}
		else
		{
			if (typeof (this._subscribers[params.type]) === 'undefined')
			{
				this._subscribers[params.type] = [];
			}

			this._subscribers[params.type].push(params.callback);

			return function () {
				this._subscribers[params.type] = this._subscribers[params.type].filter((element) => {
					return element !== params.callback;
				});
			}.bind(this);
		}
	}

	attachCommandHandler(handler)
	{
		/**
		 * After modify this method, copy to follow scripts:
		 * mobile/install/mobileapp/mobile/extensions/bitrix/pull/client/events/extension.js
		 */
		if (typeof handler.getModuleId !== 'function' || typeof handler.getModuleId() !== 'string')
		{
			console.error(Utils.getDateForLog() + ': Pull.attachCommandHandler: result of handler.getModuleId() is not a string.');
			return function () {}
		}

		let type = SubscriptionType.Server;
		if (typeof handler.getSubscriptionType === 'function')
		{
			type = handler.getSubscriptionType();
		}

		return this.subscribe({
			type: type,
			moduleId: handler.getModuleId(),
			callback: function (data) {
				let method = null;

				if (typeof handler.getMap === 'function')
				{
					const mapping = handler.getMap();
					if (mapping && typeof mapping === 'object')
					{
						if (typeof mapping[data.command] === 'function')
						{
							method = mapping[data.command].bind(handler)
						}
						else if (typeof mapping[data.command] === 'string' && typeof handler[mapping[data.command]] === 'function')
						{
							method = handler[mapping[data.command]].bind(handler);
						}
					}
				}

				if (!method)
				{
					const methodName = 'handle' + data.command.charAt(0).toUpperCase() + data.command.slice(1);
					if (typeof handler[methodName] === 'function')
					{
						method = handler[methodName].bind(handler);
					}
				}

				if (method)
				{
					if (this.debug && this.context !== 'master')
					{
						console.warn(Utils.getDateForLog() + ': Pull.attachCommandHandler: receive command', data);
					}
					method(data.params, data.extra, data.command);
				}
			}.bind(this)
		});
	}

	/**
	 *
	 * @param params {Object}
	 * @returns {boolean}
	 */
	emit(params)
	{
		/**
		 * After modify this method, copy to follow scripts:
		 * mobile/install/mobileapp/mobile/extensions/bitrix/pull/client/events/extension.js
		 * mobile/install/js/mobile/pull/client/src/client.js
		 */
		params = params || {};

		if (params.type == SubscriptionType.Server || params.type == SubscriptionType.Client)
		{
			if (typeof (this._subscribers[params.type]) === 'undefined')
			{
				this._subscribers[params.type] = {};
			}
			if (typeof (this._subscribers[params.type][params.moduleId]) === 'undefined')
			{
				this._subscribers[params.type][params.moduleId] = {
					'callbacks': [],
					'commands': {},
				};
			}

			if (this._subscribers[params.type][params.moduleId]['callbacks'].length > 0)
			{
				this._subscribers[params.type][params.moduleId]['callbacks'].forEach(function (callback) {
					callback(params.data, {type: params.type, moduleId: params.moduleId});
				});
			}

			if (
				this._subscribers[params.type][params.moduleId]['commands'][params.data.command]
				&& this._subscribers[params.type][params.moduleId]['commands'][params.data.command].length > 0)
			{
				this._subscribers[params.type][params.moduleId]['commands'][params.data.command].forEach(function (callback) {
					callback(params.data.params, params.data.extra, params.data.command, {
						type: params.type,
						moduleId: params.moduleId
					});
				});
			}

			return true;
		}
		else
		{
			if (typeof (this._subscribers[params.type]) === 'undefined')
			{
				this._subscribers[params.type] = [];
			}

			if (this._subscribers[params.type].length <= 0)
			{
				return true;
			}

			this._subscribers[params.type].forEach(function (callback) {
				callback(params.data, {type: params.type});
			});

			return true;
		}
	}

	init()
	{
		this._connectors.webSocket = new WebSocketConnector({
			parent: this,
			onOpen: this.onWebSocketOpen.bind(this),
			onMessage: this.onIncomingMessage.bind(this),
			onDisconnect: this.onWebSocketDisconnect.bind(this),
			onError: this.onWebSocketError.bind(this)
		});

		this._connectors.longPolling = new LongPollingConnector({
			parent: this,
			onOpen: this.onLongPollingOpen.bind(this),
			onMessage: this.onIncomingMessage.bind(this),
			onDisconnect: this.onLongPollingDisconnect.bind(this),
			onError: this.onLongPollingError.bind(this)
		});

		this.connectionType = this.isWebSocketAllowed() ? ConnectionType.WebSocket : ConnectionType.LongPolling;

		window.addEventListener("beforeunload", this.onBeforeUnload.bind(this));
		window.addEventListener("offline", this.onOffline.bind(this));
		window.addEventListener("online", this.onOnline.bind(this));

		if (BX && BX.addCustomEvent)
		{
			BX.addCustomEvent("BXLinkOpened", this.connect.bind(this));
		}

		if (BX && BX.desktop)
		{
			BX.addCustomEvent("onDesktopReload", () => {
				this.session.mid = null;
				this.session.tag = null;
				this.session.time = null;
			});

			BX.desktop.addCustomEvent("BXLoginSuccess", () => this.restart(1000, "desktop login"));
		}

		this.jsonRpcAdapter = new JsonRpc({
			connector: this._connectors.webSocket,
			handlers: {
				"incoming.message": this.handleRpcIncomingMessage.bind(this),
			}
		});
	}

	start(config)
	{
		let allowConfigCaching = true;

		if (this.isConnected())
		{
			return Promise.resolve(true);
		}

		if (this.starting && this._startingPromise)
		{
			return this._startingPromise;
		}

		if (!this.userId && typeof (BX.message) !== 'undefined' && BX.message.USER_ID)
		{
			this.userId = BX.message.USER_ID;
			if (!this.storage)
			{
				this.storage = new StorageManager({
					userId: this.userId,
					siteId: this.siteId
				});
			}
		}
		if (this.siteId === 'none' && typeof (BX.message) !== 'undefined' && BX.message.SITE_ID)
		{
			this.siteId = BX.message.SITE_ID;
		}

		let skipReconnectToLastSession = false;
		if (Utils.isPlainObject(config))
		{
			if (typeof config.skipReconnectToLastSession !== 'undefined')
			{
				skipReconnectToLastSession = !!config.skipReconnectToLastSession;
				delete config.skipReconnectToLastSession;
			}
			this.config = config;
			allowConfigCaching = false;
		}

		if (!this.enabled)
		{
			return Promise.reject({
				ex: {error: 'PULL_DISABLED', error_description: 'Push & Pull server is disabled'}
			});
		}

		const now = (new Date()).getTime();
		let oldSession;
		if (!skipReconnectToLastSession && this.storage)
		{
			oldSession = this.storage.get(LS_SESSION);
		}
		if (Utils.isPlainObject(oldSession) && oldSession.hasOwnProperty('ttl') && oldSession.ttl >= now)
		{
			this.session.mid = oldSession.mid;
		}

		this.starting = true;
		return new Promise((resolve, reject) => {
			this._startingPromise = {resolve, reject};
			this.loadConfig("client_start").then(
				(config) => {
					this.setConfig(config, allowConfigCaching);
					this.init();
					this.updateWatch();
					this.startCheckConfig();
					this.connect().then(
						() => resolve(true),
						error => reject(error)
					);
				},
				(error) => {
					this.starting = false;
					this.status = PullStatus.Offline;
					this.stopCheckConfig();
					console.error(Utils.getDateForLog() + ': Pull: could not read push-server config. ', error);
					reject(error);
				}
			);
		})
	}

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

	setLastMessageId(lastMessageId)
	{
		this.session.mid = lastMessageId;
	}

	/**
	 *
	 * @param {object[]} publicIds
	 * @param {integer} publicIds.user_id
	 * @param {string} publicIds.public_id
	 * @param {string} publicIds.signature
	 * @param {Date} publicIds.start
	 * @param {Date} publicIds.end
	 */
	setPublicIds(publicIds)
	{
		return this.channelManager.setPublicIds(publicIds);
	}

	/**
	 * Send single message to the specified users.
	 *
	 * @param {integer[]} users User ids of the message receivers.
	 * @param {string} moduleId Name of the module to receive message,
	 * @param {string} command Command name.
	 * @param {object} params Command parameters.
	 * @param {integer} [expiry] Message expiry time in seconds.
	 * @return {Promise}
	 */
	sendMessage(users, moduleId, command, params, expiry)
	{
		const message = {
			userList: users,
			body: {
				module_id: moduleId,
				command: command,
				params: params,
			},
			expiry: expiry
		};

		if (this.isJsonRpc())
		{
			return this.jsonRpcAdapter.executeOutgoingRpcCommand(RpcMethod.Publish, message)
		}
		else
		{
			return this.sendMessageBatch([message]);
		}
	}

	/**
	 * Send single message to the specified public channels.
	 *
	 * @param {string[]} publicChannels Public ids of the channels to receive message.
	 * @param {string} moduleId Name of the module to receive message,
	 * @param {string} command Command name.
	 * @param {object} params Command parameters.
	 * @param {integer} [expiry] Message expiry time in seconds.
	 * @return {Promise}
	 */
	sendMessageToChannels(publicChannels, moduleId, command, params, expiry)
	{
		const message = {
			channelList: publicChannels,
			body: {
				module_id: moduleId,
				command: command,
				params: params,
			},
			expiry: expiry
		};

		if (this.isJsonRpc())
		{
			return this.jsonRpcAdapter.executeOutgoingRpcCommand(RpcMethod.Publish, message)
		}
		else
		{
			return this.sendMessageBatch([message]);
		}
	}

	/**
	 * Sends batch of messages to the multiple public channels.
	 *
	 * @param {object[]} messageBatch Array of messages to send.
	 * @param  {int[]} messageBatch.userList User ids the message receivers.
	 * @param  {string[]|object[]} messageBatch.channelList Public ids of the channels to send messages.
	 * @param {string} messageBatch.moduleId Name of the module to receive message,
	 * @param {string} messageBatch.command Command name.
	 * @param {object} messageBatch.params Command parameters.
	 * @param {integer} [messageBatch.expiry] Message expiry time in seconds.
	 * @return void
	 */
	sendMessageBatch(messageBatch)
	{
		if (!this.isPublishingEnabled())
		{
			console.error('Client publishing is not supported or is disabled');
			return false;
		}

		if (this.isJsonRpc())
		{
			let rpcRequest = this.jsonRpcAdapter.createPublishRequest(messageBatch);
			return this.connector.send(JSON.stringify(rpcRequest));
		}
		else
		{
			let userIds = {};
			for (let i = 0; i < messageBatch.length; i++)
			{
				if (messageBatch[i].userList)
				{
					for (let j = 0; j < messageBatch[i].userList.length; j++)
					{
						userIds[messageBatch[i].userList[j]] = true;
					}
				}
			}
			this.channelManager.getPublicIds(Object.keys(userIds)).then((publicIds) => {
				return this.connector.send(this.encodeMessageBatch(messageBatch, publicIds));
			})
		}
	}

	encodeMessageBatch(messageBatch, publicIds)
	{
		let messages = [];
		messageBatch.forEach(function (messageFields) {
			const messageBody = messageFields.body;

			let receivers;
			if (messageFields.userList)
			{
				receivers = this.createMessageReceivers(messageFields.userList, publicIds);
			}
			else
			{
				receivers = [];
			}

			if (messageFields.channelList)
			{
				if (!Utils.isArray(messageFields.channelList))
				{
					throw new Error('messageFields.publicChannels must be an array');
				}
				messageFields.channelList.forEach(function (publicChannel) {
					let publicId;
					let signature;
					if (typeof (publicChannel) === 'string' && publicChannel.includes('.'))
					{
						const fields = publicChannel.toString().split('.');
						publicId = fields[0];
						signature = fields[1];
					}
					else if (typeof (publicChannel) === 'object' && ('publicId' in publicChannel) && ('signature' in publicChannel))
					{
						publicId = publicChannel.publicId;
						signature = publicChannel.signature;
					}
					else
					{
						throw new Error('Public channel MUST be either a string, formatted like "{publicId}.{signature}" or an object with fields \'publicId\' and \'signature\'');
					}

					receivers.push(Receiver.create({
						id: this.encodeId(publicId),
						signature: this.encodeId(signature)
					}))
				}.bind(this))
			}

			const message = IncomingMessage.create({
				receivers: receivers,
				body: JSON.stringify(messageBody),
				expiry: messageFields.expiry || 0
			});
			messages.push(message);
		}, this);

		const requestBatch = RequestBatch.create({
			requests: [{
				incomingMessages: {
					messages: messages
				}
			}]
		});

		return RequestBatch.encode(requestBatch).finish();
	}

	createMessageReceivers(users, publicIds)
	{
		let result = [];
		for (let i = 0; i < users.length; i++)
		{
			let userId = users[i];
			if (!publicIds[userId] || !publicIds[userId].publicId)
			{
				throw new Error('Could not determine public id for user ' + userId);
			}

			result.push(Receiver.create({
				id: this.encodeId(publicIds[userId].publicId),
				signature: this.encodeId(publicIds[userId].signature)
			}));
		}
		return result;
	}

	/**
	 * @param userId {number}
	 * @param callback {UserStatusCallback}
	 * @returns {Promise}
	 */
	subscribeUserStatusChange(userId, callback)
	{
		if (typeof (userId) !== 'number')
		{
			throw new Error('userId must be a number');
		}

		return new Promise((resolve, reject) => {
			this.jsonRpcAdapter.executeOutgoingRpcCommand(RpcMethod.SubscribeStatusChange, {userId}).then(() => {
				if (!this.userStatusCallbacks[userId])
				{
					this.userStatusCallbacks[userId] = [];
				}
				if (Utils.isFunction(callback))
				{
					this.userStatusCallbacks[userId].push(callback);
				}

				return resolve()
			}).catch(err => reject(err))
		})
	}

	/**
	 * @param userId {number}
	 * @param callback {UserStatusCallback}
	 * @returns {Promise}
	 */
	unsubscribeUserStatusChange(userId, callback)
	{
		if (typeof (userId) !== 'number')
		{
			throw new Error('userId must be a number');
		}
		if (this.userStatusCallbacks[userId])
		{
			this.userStatusCallbacks[userId] = this.userStatusCallbacks[userId].filter(cb => cb !== callback)
			if (this.userStatusCallbacks[userId].length === 0)
			{
				return this.jsonRpcAdapter.executeOutgoingRpcCommand(RpcMethod.UnsubscribeStatusChange, {userId});
			}
		}

		return Promise.resolve();
	}

	emitUserStatusChange(userId, isOnline)
	{
		if (this.userStatusCallbacks[userId])
		{
			this.userStatusCallbacks[userId].forEach(cb => cb({userId, isOnline}));
		}
	}

	restoreUserStatusSubscription()
	{
		for (const userId in this.userStatusCallbacks)
		{
			if (this.userStatusCallbacks.hasOwnProperty(userId) && this.userStatusCallbacks[userId].length > 0)
			{
				this.jsonRpcAdapter.executeOutgoingRpcCommand(RpcMethod.SubscribeStatusChange, {userId: Number(userId)});
			}
		}
	}

	/**
	 * Returns "last seen" time in seconds for the users. Result format: Object{userId: int}
	 * If the user is currently connected - will return 0.
	 * If the user if offline - will return diff between current timestamp and last seen timestamp in seconds.
	 * If the user was never online - the record for user will be missing from the result object.
	 *
	 * @param {integer[]} userList List of user ids.
	 * @returns {Promise}
	 */
	getUsersLastSeen(userList)
	{
		if (!Utils.isArray(userList) || !userList.every(item => typeof (item) === 'number'))
		{
			throw new Error('userList must be an array of numbers');
		}
		return new Promise((resolve, reject) => {
			this.jsonRpcAdapter.executeOutgoingRpcCommand(RpcMethod.GetUsersLastSeen, {
				userList: userList
			}).then(result => {
				let unresolved = [];
				for (let i = 0; i < userList.length; i++)
				{
					if (!result.hasOwnProperty(userList[i]))
					{
						unresolved.push(userList[i]);
					}
				}
				if (unresolved.length === 0)
				{
					return resolve(result);
				}

				const params = {
					userIds: unresolved,
					sendToQueueSever: true
				}
				this.restClient.callMethod('pull.api.user.getLastSeen', params).then(response => {
					let data = response.data();
					for (let userId in data)
					{
						result[userId] = data[userId];
					}
					return resolve(result);
				}).catch(error => {
					console.error(error);
				})
			})
		})
	}

	/**
	 * Pings server. In case of success promise will be resolved, otherwise - rejected.
	 *
	 * @param {int} timeout Request timeout in seconds
	 * @returns {Promise}
	 */
	ping(timeout)
	{
		return this.jsonRpcAdapter.executeOutgoingRpcCommand(RpcMethod.Ping, {}, timeout);
	}

	/**
	 * Returns list channels that the connection is subscribed to.
	 *
	 * @returns {Promise}
	 */
	listChannels()
	{
		return this.jsonRpcAdapter.executeOutgoingRpcCommand(RpcMethod.ListChannels, {});
	}

	scheduleRestart(disconnectCode, disconnectReason, restartDelay)
	{
		clearTimeout(this.restartTimeout);
		if (!restartDelay || restartDelay < 1)
		{
			restartDelay = Math.ceil(Math.random() * 30) + 5;
		}

		this.restartTimeout = setTimeout(
			() => this.restart(disconnectCode, disconnectReason),
			restartDelay * 1000
		);
	}

	restart(disconnectCode, disconnectReason)
	{
		if (!disconnectCode)
		{
			disconnectCode = CloseReasons.NORMAL_CLOSURE;
		}
		if (!disconnectReason)
		{
			disconnectReason = 'manual restart'
		}
		clearTimeout(this.restartTimeout);
		console.warn(Utils.getDateForLog() + ': Pull: restarting with code ' + disconnectCode)
		this.disconnect(disconnectCode, disconnectReason);
		if (this.storage)
		{
			this.storage.remove('bx-pull-config');
		}
		this.config = null;

		const loadConfigReason = disconnectCode + '_' + disconnectReason.replaceAll(' ', '_');
		this.loadConfig(loadConfigReason).then(
			(config) => {
				this.setConfig(config, true);
				this.updateWatch();
				this.startCheckConfig();
				this.connect().catch(error => console.error(error));
			},
			(error) => {
				console.error(Utils.getDateForLog() + ': Pull: could not read push-server config', error);
				this.status = PullStatus.Offline;

				clearTimeout(this.reconnectTimeout);
				if (error.status == 401 || error.status == 403)
				{
					this.stopCheckConfig();

					if (BX && BX.onCustomEvent)
					{
						BX.onCustomEvent(window, 'onPullError', ['AUTHORIZE_ERROR']);
					}
				}
			}
		);
	}

	loadConfig(logTag)
	{
		if (!this.config)
		{
			this.config = Object.assign({}, EmptyConfig);

			let config;
			if (this.storage)
			{
				config = this.storage.get('bx-pull-config');
			}
			if (this.isConfigActual(config) && this.checkRevision(config.api.revision_web))
			{
				return Promise.resolve(config);
			}
			else if (this.storage)
			{
				this.storage.remove('bx-pull-config')
			}
		}
		else if (this.isConfigActual(this.config) && this.checkRevision(this.config.api.revision_web))
		{
			return Promise.resolve(this.config);
		}
		else
		{
			this.config = Object.assign({}, EmptyConfig);
		}

		return new Promise((resolve, reject) => {
			this.restClient.callMethod(this.configGetMethod, {'CACHE': 'N'}, undefined, undefined, logTag).then((response) => {
				const data = response.data();
				let timeShift;

				timeShift = Math.floor((Utils.getTimestamp() - new Date(data.serverTime).getTime()) / 1000);
				delete data.serverTime;

				let config = Object.assign({}, data);
				config.server.timeShift = timeShift;

				resolve(config);
			}).catch((response) => {
				const error = response.error();
				if (error.getError().error == "AUTHORIZE_ERROR" || error.getError().error == "WRONG_AUTH_TYPE")
				{
					error.status = 403;
				}
				reject(error);
			});
		})
	}

	isConfigActual(config)
	{
		if (!Utils.isPlainObject(config))
		{
			return false;
		}

		if (Number(config.server.config_timestamp) !== this.configTimestamp)
		{
			return false;
		}

		const now = new Date();

		if (BX.type.isNumber(config.exp) && config.exp > 0 && config.exp < now.getTime() / 1000)
		{
			return false;
		}

		const channelCount = Object.keys(config.channels).length;
		if (channelCount === 0)
		{
			return false;
		}

		for (let channelType in config.channels)
		{
			if (!config.channels.hasOwnProperty(channelType))
			{
				continue;
			}

			const channel = config.channels[channelType];
			const channelEnd = new Date(channel.end);

			if (channelEnd < now)
			{
				return false;
			}
		}

		return true;
	}

	startCheckConfig()
	{
		if (this.checkInterval)
		{
			clearInterval(this.checkInterval);
		}

		this.checkInterval = setInterval(this.checkConfig.bind(this), CONFIG_CHECK_INTERVAL)
	}

	stopCheckConfig()
	{
		if (this.checkInterval)
		{
			clearInterval(this.checkInterval);
		}
		this.checkInterval = null;
	}

	checkConfig()
	{
		if (this.isConfigActual(this.config))
		{
			if (!this.checkRevision(this.config.api.revision_web))
			{
				return false;
			}
		}
		else
		{
			this.logToConsole("Stale config detected. Restarting");
			this.restart(CloseReasons.CONFIG_EXPIRED, "config expired");
		}
	}

	setConfig(config, allowCaching)
	{
		for (let key in config)
		{
			if (config.hasOwnProperty(key) && this.config.hasOwnProperty(key))
			{
				this.config[key] = config[key];
			}
		}

		if (config.publicChannels)
		{
			this.setPublicIds(Utils.objectValues(config.publicChannels));
		}

		this.configTimestamp = Number(config.server.config_timestamp);

		if (this.storage && allowCaching)
		{
			try
			{
				this.storage.set('bx-pull-config', config);
			} catch (e)
			{
				// try to delete the key "history" (landing site change history, see http://jabber.bx/view.php?id=136492)
				if (localStorage && localStorage.removeItem)
				{
					localStorage.removeItem('history');
				}
				console.error(Utils.getDateForLog() + " Pull: Could not cache config in local storage. Error: ", e);
			}
		}
	}

	isWebSocketSupported()
	{
		return typeof (window.WebSocket) !== "undefined";
	}

	isWebSocketAllowed()
	{
		if (this.sharedConfig.isWebSocketBlocked())
		{
			return false;
		}

		return this.isWebSocketEnabled();
	}

	isWebSocketEnabled()
	{
		if (!this.isWebSocketSupported())
		{
			return false;
		}

		return (this.config && this.config.server && this.config.server.websocket_enabled === true);
	}

	isPublishingSupported()
	{
		return this.getServerVersion() > 3;
	}

	isPublishingEnabled()
	{
		if (!this.isPublishingSupported())
		{
			return false;
		}

		return (this.config && this.config.server && this.config.server.publish_enabled === true);
	}

	isProtobufSupported()
	{
		return (this.getServerVersion() == 4 && !Utils.browser.IsIe());
	}

	isJsonRpc()
	{
		return (this.getServerVersion() >= 5);
	}

	isSharedMode()
	{
		return (this.getServerMode() == ServerMode.Shared)
	}

	disconnect(disconnectCode, disconnectReason)
	{
		if (this.connector)
		{
			this.isManualDisconnect = true;
			this.connector.disconnect(disconnectCode, disconnectReason);
		}
	}

	stop(disconnectCode, disconnectReason)
	{
		this.disconnect(disconnectCode, disconnectReason);
		this.stopCheckConfig();
	}

	reconnect(disconnectCode, disconnectReason, delay)
	{
		this.disconnect(disconnectCode, disconnectReason);

		delay = delay || 1;
		this.scheduleReconnect(delay);
	}

	restoreWebSocketConnection()
	{
		if (this.connectionType == ConnectionType.WebSocket)
		{
			return true;
		}

		this._connectors.webSocket.connect();
	}

	scheduleReconnect(connectionDelay)
	{
		if (!this.enabled)
		{
			return false;
		}

		if (!connectionDelay)
		{
			// never fallback to long polling
			// TODO remove long polling support later
			/*if (this.connectionAttempt > 3 && this.connectionType === ConnectionType.WebSocket && !this.sharedConfig.isLongPollingBlocked())
			{
				// Websocket seems to be closed by network filter. Trying to fallback to long polling
				this.sharedConfig.setWebSocketBlocked(true);
				this.connectionType = ConnectionType.LongPolling;
				this.connectionAttempt = 1;
				connectionDelay = 1;
			}
			else*/
			{
				connectionDelay = this.getConnectionAttemptDelay(this.connectionAttempt);
			}
		}
		if (this.reconnectTimeout)
		{
			clearTimeout(this.reconnectTimeout);
		}

		this.logToConsole('Pull: scheduling reconnection in ' + connectionDelay + ' seconds; attempt # ' + this.connectionAttempt);

		this.reconnectTimeout = setTimeout(
			() => {
				this.connect().catch(error => {
					console.error(error)
				})
			},
			connectionDelay * 1000);
	}

	scheduleRestoreWebSocketConnection()
	{
		this.logToConsole('Pull: scheduling restoration of websocket connection in ' + RESTORE_WEBSOCKET_TIMEOUT + ' seconds');

		if (this.restoreWebSocketTimeout)
		{
			return;
		}

		this.restoreWebSocketTimeout = setTimeout(() => {
			this.restoreWebSocketTimeout = 0;
			this.restoreWebSocketConnection();
		}, RESTORE_WEBSOCKET_TIMEOUT * 1000);
	}

	/**
	 * @returns {Promise}
	 */
	connect()
	{
		if (!this.enabled)
		{
			return Promise.reject();
		}
		if (this.connector.connected)
		{
			return Promise.resolve();
		}

		if (this.reconnectTimeout)
		{
			clearTimeout(this.reconnectTimeout);
		}

		this.status = PullStatus.Connecting;
		this.connectionAttempt++;
		return new Promise((resolve, reject) => {
			this._connectPromise = {resolve, reject}
			this.connector.connect();
		})
	}

	onIncomingMessage(message)
	{
		if (this.isJsonRpc())
		{
			(message === JSON_RPC_PING) ? this.onJsonRpcPing() : this.jsonRpcAdapter.parseJsonRpcMessage(message);
		}
		else
		{
			const events = this.extractMessages(message);
			this.handleIncomingEvents(events);
		}
	}

	handleRpcIncomingMessage(messageFields)
	{
		this.session.mid = messageFields.mid;
		let body = messageFields.body;

		if (!messageFields.body.extra)
		{
			body.extra = {};
		}
		body.extra.sender = messageFields.sender;

		if ("user_params" in messageFields && Utils.isPlainObject(messageFields.user_params))
		{
			Object.assign(body.params, messageFields.user_params)
		}

		if ("dictionary" in messageFields && Utils.isPlainObject(messageFields.dictionary))
		{
			Object.assign(body.params, messageFields.dictionary)
		}

		if (this.checkDuplicate(messageFields.mid))
		{
			this.addMessageToStat(body);
			this.trimDuplicates();
			this.broadcastMessage(body)
		}

		this.connector.send(`mack:${messageFields.mid}`)

		return {};
	}

	onJsonRpcPing()
	{
		this.updatePingWaitTimeout();
		this.connector.send(JSON_RPC_PONG)
	}

	handleIncomingEvents(events)
	{
		let messages = [];
		if (events.length === 0)
		{
			this.session.mid = null;
			return;
		}

		for (let i = 0; i < events.length; i++)
		{
			let event = events[i];
			this.updateSessionFromEvent(event);
			if (event.mid && !this.checkDuplicate(event.mid))
			{
				continue;
			}

			this.addMessageToStat(event.text);
			messages.push(event.text);
		}
		this.trimDuplicates();
		this.broadcastMessages(messages);
	}

	updateSessionFromEvent(event)
	{
		this.session.mid = event.mid || null;
		this.session.tag = event.tag || null;
		this.session.time = event.time || null;
	}

	checkDuplicate(mid)
	{
		if (this.session.lastMessageIds.includes(mid))
		{
			console.warn("Duplicate message " + mid + " skipped");
			return false;
		}
		else
		{
			this.session.lastMessageIds.push(mid);
			return true;
		}
	}

	trimDuplicates()
	{
		if (this.session.lastMessageIds.length > MAX_IDS_TO_STORE)
		{
			this.session.lastMessageIds = this.session.lastMessageIds.slice(-MAX_IDS_TO_STORE);
		}
	}

	addMessageToStat(message)
	{
		if (!this.session.history[message.module_id])
		{
			this.session.history[message.module_id] = {};
		}
		if (!this.session.history[message.module_id][message.command])
		{
			this.session.history[message.module_id][message.command] = 0;
		}
		this.session.history[message.module_id][message.command]++;

		this.session.messageCount++;
	}

	extractMessages(pullEvent)
	{
		if (pullEvent instanceof ArrayBuffer)
		{
			return this.extractProtobufMessages(pullEvent);
		}
		else if (Utils.isNotEmptyString(pullEvent))
		{
			return this.extractPlainTextMessages(pullEvent)
		}
	}

	extractProtobufMessages(pullEvent)
	{
		let result = [];
		try
		{
			let responseBatch = ResponseBatch.decode(new Uint8Array(pullEvent));
			for (let i = 0; i < responseBatch.responses.length; i++)
			{
				let response = responseBatch.responses[i];
				if (response.command != "outgoingMessages")
				{
					continue;
				}

				let messages = response.outgoingMessages.messages;
				for (let m = 0; m < messages.length; m++)
				{
					const message = messages[m];
					let messageFields;
					try
					{
						messageFields = JSON.parse(message.body)
					} catch (e)
					{
						console.error(Utils.getDateForLog() + ": Pull: Could not parse message body", e);
						continue;
					}

					if (!messageFields.extra)
					{
						messageFields.extra = {}
					}
					messageFields.extra.sender = {
						type: message.sender.type
					};

					if (message.sender.id instanceof Uint8Array)
					{
						messageFields.extra.sender.id = this.decodeId(message.sender.id)
					}

					const compatibleMessage = {
						mid: this.decodeId(message.id),
						text: messageFields
					};

					result.push(compatibleMessage);
				}
			}
		} catch (e)
		{
			console.error(Utils.getDateForLog() + ": Pull: Could not parse message", e)
		}
		return result;
	}

	extractPlainTextMessages(pullEvent)
	{
		let result = [];
		const dataArray = pullEvent.match(/#!NGINXNMS!#(.*?)#!NGINXNME!#/gm);
		if (dataArray === null)
		{
			const text = "\n========= PULL ERROR ===========\n" +
				"Error type: parseResponse error parsing message\n" +
				"\n" +
				"Data string: " + pullEvent + "\n" +
				"================================\n\n";
			console.warn(text);
			return result;
		}
		for (let i = 0; i < dataArray.length; i++)
		{
			dataArray[i] = dataArray[i].substring(12, dataArray[i].length - 12);
			if (dataArray[i].length <= 0)
			{
				continue;
			}

			let data
			try
			{
				data = JSON.parse(dataArray[i])
			} catch (e)
			{
				continue;
			}

			result.push(data);
		}
		return result;
	}

	/**
	 * Converts message id from byte[] to string
	 * @param {Uint8Array} encodedId
	 * @return {string}
	 */
	decodeId(encodedId)
	{
		if (!(encodedId instanceof Uint8Array))
		{
			throw new Error("encodedId should be an instance of Uint8Array");
		}

		let result = "";
		for (let i = 0; i < encodedId.length; i++)
		{
			const hexByte = encodedId[i].toString(16);
			if (hexByte.length === 1)
			{
				result += '0';
			}
			result += hexByte;
		}
		return result;
	}

	/**
	 * Converts message id from hex-encoded string to byte[]
	 * @param {string} id Hex-encoded string.
	 * @return {Uint8Array}
	 */
	encodeId(id)
	{
		if (!id)
		{
			return new Uint8Array();
		}

		let result = [];
		for (let i = 0; i < id.length; i += 2)
		{
			result.push(parseInt(id.substr(i, 2), 16));
		}

		return new Uint8Array(result);
	}

	broadcastMessages(messages)
	{
		messages.forEach(message => this.broadcastMessage(message));
	}

	broadcastMessage(message)
	{
		const moduleId = message.module_id = message.module_id.toLowerCase();
		const command = message.command;

		if (!message.extra)
		{
			message.extra = {};
		}

		if (message.extra.server_time_unix)
		{
			message.extra.server_time_ago = ((Utils.getTimestamp() - (message.extra.server_time_unix * 1000)) / 1000) - (this.config.server.timeShift ? this.config.server.timeShift : 0);
			message.extra.server_time_ago = message.extra.server_time_ago > 0 ? message.extra.server_time_ago : 0;
		}

		this.logMessage(message);
		try
		{
			if (message.extra.sender && message.extra.sender.type === SenderType.Client)
			{
				if (typeof BX.onCustomEvent !== 'undefined')
				{
					BX.onCustomEvent(window, 'onPullClientEvent-' + moduleId, [command, message.params, message.extra], true);
					BX.onCustomEvent(window, 'onPullClientEvent', [moduleId, command, message.params, message.extra], true);
				}

				this.emit({
					type: SubscriptionType.Client,
					moduleId: moduleId,
					data: {
						command: command,
						params: Utils.clone(message.params),
						extra: Utils.clone(message.extra)
					}
				});
			}
			else if (moduleId === 'pull')
			{
				this.handleInternalPullEvent(command, message);
			}
			else if (moduleId == 'online')
			{
				if (message.extra.server_time_ago < 240)
				{
					if (typeof BX.onCustomEvent !== 'undefined')
					{
						BX.onCustomEvent(window, 'onPullOnlineEvent', [command, message.params, message.extra], true);
					}

					this.emit({
						type: SubscriptionType.Online,
						data: {
							command: command,
							params: Utils.clone(message.params),
							extra: Utils.clone(message.extra)
						}
					});
				}

				if (command === 'userStatusChange')
				{
					this.emitUserStatusChange(message.params.user_id, message.params.online);
				}
			}
			else
			{
				if (typeof BX.onCustomEvent !== 'undefined')
				{
					BX.onCustomEvent(window, 'onPullEvent-' + moduleId, [command, message.params, message.extra], true);
					BX.onCustomEvent(window, 'onPullEvent', [moduleId, command, message.params, message.extra], true);
				}

				this.emit({
					type: SubscriptionType.Server,
					moduleId: moduleId,
					data: {
						command: command,
						params: Utils.clone(message.params),
						extra: Utils.clone(message.extra)
					}
				});
			}
		} catch (e)
		{
			if (typeof (console) == 'object')
			{
				console.warn(
					"\n========= PULL ERROR ===========\n" +
					"Error type: broadcastMessages execute error\n" +
					"Error event: ", e, "\n" +
					"Message: ", message, "\n" +
					"================================\n"
				);
				if (typeof BX.debug !== 'undefined')
				{
					BX.debug(e);
				}
			}
		}

		if (message.extra && message.extra.revision_web)
		{
			this.checkRevision(message.extra.revision_web);
		}
	}

	logToConsole(message, force)
	{
		if (this.loggingEnabled || force)
		{
			console.log(Utils.getDateForLog() + ': ' + message);
		}
	}

	logMessage(message)
	{
		if (!this.debug)
		{
			return;
		}

		if (message.extra.sender && message.extra.sender.type === SenderType.Client)
		{
			console.info('onPullClientEvent-' + message.module_id, message.command, message.params, message.extra);
		}
		else if (message.moduleId == 'online')
		{
			console.info('onPullOnlineEvent', message.command, message.params, message.extra);
		}
		else
		{
			console.info('onPullEvent', message.module_id, message.command, message.params, message.extra);
		}
	}

	onLongPollingOpen()
	{
		this.unloading = false;
		this.starting = false;
		this.connectionAttempt = 0;
		this.isManualDisconnect = false;
		this.status = PullStatus.Online;

		this.logToConsole('Pull: Long polling connection with push-server opened');
		if (this.isWebSocketEnabled())
		{
			this.scheduleRestoreWebSocketConnection();
		}
		if (this._connectPromise)
		{
			this._connectPromise.resolve();
		}
	}

	onWebSocketBlockChanged(e)
	{
		const isWebSocketBlocked = e.isWebSocketBlocked;

		if (isWebSocketBlocked && this.connectionType === ConnectionType.WebSocket && !this.isConnected())
		{
			clearTimeout(this.reconnectTimeout);

			this.connectionAttempt = 0;
			this.connectionType = ConnectionType.LongPolling;
			this.scheduleReconnect(1);
		}
		else if (!isWebSocketBlocked && this.connectionType === ConnectionType.LongPolling)
		{
			clearTimeout(this.reconnectTimeout);
			clearTimeout(this.restoreWebSocketTimeout);

			this.connectionAttempt = 0;
			this.connectionType = ConnectionType.WebSocket;
			this.scheduleReconnect(1);
		}
	}

	onWebSocketOpen()
	{
		this.unloading = false;
		this.starting = false;
		this.connectionAttempt = 0;
		this.isManualDisconnect = false;
		this.status = PullStatus.Online;
		this.sharedConfig.setWebSocketBlocked(false);

		// to prevent fallback to long polling in case of networking problems
		this.sharedConfig.setLongPollingBlocked(true);

		if (this.connectionType == ConnectionType.LongPolling)
		{
			this.connectionType = ConnectionType.WebSocket;
			this._connectors.longPolling.disconnect();
		}

		if (this.restoreWebSocketTimeout)
		{
			clearTimeout(this.restoreWebSocketTimeout);
			this.restoreWebSocketTimeout = null;
		}
		this.logToConsole('Pull: Websocket connection with push-server opened');
		if (this._connectPromise)
		{
			this._connectPromise.resolve();
		}
		this.restoreUserStatusSubscription();
	}

	onWebSocketDisconnect(e)
	{
		if (this.connectionType === ConnectionType.WebSocket)
		{
			this.status = PullStatus.Offline;
		}

		if (!e)
		{
			e = {};
		}

		this.logToConsole('Pull: Websocket connection with push-server closed. Code: ' + e.code + ', reason: ' + e.reason, true);
		if (!this.isManualDisconnect)
		{
			if (e.code == CloseReasons.WRONG_CHANNEL_ID)
			{
				this.scheduleRestart(CloseReasons.WRONG_CHANNEL_ID, "wrong channel signature");
			}
			else
			{
				this.scheduleReconnect();
			}
		}

		// to prevent fallback to long polling in case of networking problems
		this.sharedConfig.setLongPollingBlocked(true);
		this.isManualDisconnect = false;

		this.clearPingWaitTimeout();
	}

	onWebSocketError(e)
	{
		this.starting = false;
		if (this.connectionType === ConnectionType.WebSocket)
		{
			this.status = PullStatus.Offline;
		}

		console.error(Utils.getDateForLog() + ": Pull: WebSocket connection error", e);
		this.scheduleReconnect();
		if (this._connectPromise)
		{
			this._connectPromise.reject();
		}

		this.clearPingWaitTimeout();
	}

	onLongPollingDisconnect(e)
	{
		if (this.connectionType === ConnectionType.LongPolling)
		{
			this.status = PullStatus.Offline;
		}

		if (!e)
		{
			e = {};
		}

		this.logToConsole('Pull: Long polling connection with push-server closed. Code: ' + e.code + ', reason: ' + e.reason);
		if (!this.isManualDisconnect)
		{
			this.scheduleReconnect();
		}
		this.isManualDisconnect = false;
		this.clearPingWaitTimeout();
	}

	onLongPollingError(e)
	{
		this.starting = false;
		if (this.connectionType === ConnectionType.LongPolling)
		{
			this.status = PullStatus.Offline;
		}
		console.error(Utils.getDateForLog() + ': Pull: Long polling connection error', e);
		this.scheduleReconnect();
		if (this._connectPromise)
		{
			this._connectPromise.reject();
		}
		this.clearPingWaitTimeout();
	}

	isConnected()
	{
		return this.connector ? this.connector.connected : false;
	}

	onBeforeUnload()
	{
		this.unloading = true;

		const session = Utils.clone(this.session);
		session.ttl = (new Date()).getTime() + LS_SESSION_CACHE_TIME * 1000;
		if (this.storage)
		{
			try
			{
				this.storage.set(LS_SESSION, JSON.stringify(session), LS_SESSION_CACHE_TIME);
			} catch (e)
			{
				console.error(Utils.getDateForLog() + " Pull: Could not save session info in local storage. Error: ", e);
			}
		}

		this.scheduleReconnect(15);
	}

	onOffline()
	{
		this.disconnect("1000", "offline");
	}

	onOnline()
	{
		this.connect();
	}

	handleInternalPullEvent(command, message)
	{
		switch (command.toUpperCase())
		{
			case SystemCommands.CHANNEL_EXPIRE:
			{
				if (message.params.action == 'reconnect')
				{
					this.config.channels[message.params.channel.type] = message.params.new_channel;
					this.logToConsole("Pull: new config for " + message.params.channel.type + " channel set:\n", this.config.channels[message.params.channel.type]);

					this.reconnect(CloseReasons.CONFIG_REPLACED, "config was replaced");
				}
				else
				{
					this.restart(CloseReasons.CHANNEL_EXPIRED, "channel expired received");
				}
				break;
			}
			case SystemCommands.CONFIG_EXPIRE:
			{
				this.restart(CloseReasons.CONFIG_EXPIRED, "config expired received");
				break;
			}
			case SystemCommands.SERVER_RESTART:
			{
				this.reconnect(CloseReasons.SERVER_RESTARTED, "server was restarted", 15);
				break;
			}
			default://
		}
	}

	checkRevision(serverRevision)
	{
		if (this.skipCheckRevision)
		{
			return true;
		}

		serverRevision = parseInt(serverRevision);
		if (serverRevision > 0 && serverRevision != REVISION)
		{
			this.enabled = false;
			if (typeof BX.message !== 'undefined')
			{
				this.showNotification(BX.message('PULL_OLD_REVISION'));
			}
			this.disconnect(CloseReasons.NORMAL_CLOSURE, 'check_revision');

			if (typeof BX.onCustomEvent !== 'undefined')
			{
				BX.onCustomEvent(window, 'onPullRevisionUp', [serverRevision, REVISION]);
			}

			this.emit({
				type: SubscriptionType.Revision,
				data: {
					server: serverRevision,
					client: REVISION
				}
			});

			this.logToConsole("Pull revision changed from " + REVISION + " to " + serverRevision + ". Reload required");

			return false;
		}
		return true;
	}

	showNotification(text)
	{
		if (this.notificationPopup || typeof BX.PopupWindow === 'undefined')
		{
			return;
		}

		this.notificationPopup = new BX.PopupWindow('bx-notifier-popup-confirm', null, {
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
						click: () => this.notificationPopup.close(),
					}
				})
			],
			events: {
				onPopupClose: () => this.notificationPopup.destroy(),
				onPopupDestroy: () => this.notificationPopup = null,
			}
		});
		this.notificationPopup.show();
	}

	getRevision()
	{
		return (this.config && this.config.api) ? this.config.api.revision_web : null;
	}

	getServerVersion()
	{
		return (this.config && this.config.server) ? this.config.server.version : 0;
	}

	getServerMode()
	{
		return (this.config && this.config.server) ? this.config.server.mode : null;
	}

	getConfig()
	{
		return this.config;
	}

	getDebugInfo()
	{
		if (!JSON || !JSON.stringify)
		{
			return false;
		}

		let configDump;
		if (this.config && this.config.channels)
		{
			configDump = {
				"ChannelID": (this.config.channels.private ? this.config.channels.private.id : "n/a"),
				"ChannelDie": (this.config.channels.private ? this.config.channels.private.end : "n/a"),
				"ChannelDieShared": ("shared" in this.config.channels ? this.config.channels.shared.end : "n/a"),
			};
		}
		else
		{
			configDump = {"Config error": "config is not loaded"}
		}

		let websocketMode = "-";
		if (this._connectors.webSocket && this._connectors.webSocket.socket)
		{
			if (this.isJsonRpc())
			{
				websocketMode = "json-rpc"
			}
			else
			{
				websocketMode = (this._connectors.webSocket.socket.url.search("binaryMode=true") != -1 ? "protobuf" : "text")
			}
		}

		return {
			"UserId": this.userId + (this.userId > 0 ? '' : '(guest)'),
			"Guest userId": (this.guestMode && this.guestUserId !== 0 ? this.guestUserId : "-"),
			"Browser online": (navigator.onLine ? 'Y' : 'N'),
			"Connect": (this.isConnected() ? 'Y' : 'N'),
			"Server type": (this.isSharedMode() ? 'cloud' : 'local'),
			"WebSocket supported": (this.isWebSocketSupported() ? 'Y' : 'N'),
			"WebSocket connected": (this._connectors.webSocket && this._connectors.webSocket.connected ? 'Y' : 'N'),
			"WebSocket mode": websocketMode,

			"Try connect": (this.reconnectTimeout ? 'Y' : 'N'),
			"Try number": (this.connectionAttempt),

			"Path": (this.connector ? this.connector.path : '-'),
			...configDump,

			"Last message": (this.session.mid > 0 ? this.session.mid : '-'),
			"Session history": this.session.history,
			"Watch tags": this.watchTagsQueue,
		}
	}

	enableLogging(loggingFlag)
	{
		if (loggingFlag === undefined)
		{
			loggingFlag = true;
		}
		loggingFlag = loggingFlag === true;

		this.sharedConfig.setLoggingEnabled(loggingFlag);
		this.loggingEnabled = loggingFlag;
	}

	capturePullEvent(debugFlag)
	{
		if (debugFlag === undefined)
		{
			debugFlag = true;
		}

		this.debug = debugFlag;
	}

	getConnectionPath(connectionType)
	{
		let path;
		let params = {};

		switch (connectionType)
		{
			case ConnectionType.WebSocket:
				path = this.isSecure ? this.config.server.websocket_secure : this.config.server.websocket;
				break;
			case ConnectionType.LongPolling:
				path = this.isSecure ? this.config.server.long_pooling_secure : this.config.server.long_polling;
				break;
			default:
				throw new Error("Unknown connection type " + connectionType);
		}

		if (!Utils.isNotEmptyString(path))
		{
			return false;
		}

		if (typeof (this.config.jwt) == 'string' && this.config.jwt !== '')
		{
			params['token'] = this.config.jwt;
		}
		else
		{
			let channels = [];
			['private', 'shared'].forEach((type) => {
				if (typeof this.config.channels[type] !== 'undefined')
				{
					channels.push(this.config.channels[type].id);
				}
			});
			if (channels.length === 0)
			{
				return false;
			}

			params['CHANNEL_ID'] = channels.join('/');
		}

		if (this.isJsonRpc())
		{
			params.jsonRpc = 'true';
		}
		else if (this.isProtobufSupported())
		{
			params.binaryMode = 'true';
		}

		if (this.isSharedMode())
		{
			if (!this.config.clientId)
			{
				throw new Error("Push-server is in shared mode, but clientId is not set");
			}
			params.clientId = this.config.clientId;
		}
		if (this.session.mid)
		{
			params.mid = this.session.mid;
		}
		if (this.session.tag)
		{
			params.tag = this.session.tag;
		}
		if (this.session.time)
		{
			params.time = this.session.time;
		}
		params.revision = REVISION;

		return path + '?' + Utils.buildQueryString(params);
	}

	getPublicationPath()
	{
		const path = this.isSecure ? this.config.server.publish_secure : this.config.server.publish;
		if (!path)
		{
			return '';
		}

		let channels = [];
		for (let type in this.config.channels)
		{
			if (!this.config.channels.hasOwnProperty(type))
			{
				continue;
			}
			channels.push(this.config.channels[type].id);
		}

		const params = {
			CHANNEL_ID: channels.join('/')
		};

		return path + '?' + Utils.buildQueryString(params);
	}

	/**
	 * Returns reconnect delay in seconds
	 * @param attemptNumber
	 * @return {number}
	 */
	getConnectionAttemptDelay(attemptNumber)
	{
		let result;
		if (attemptNumber < 1)
		{
			result = 0.5;
		}
		else if (attemptNumber < 3)
		{
			result = 15;
		}
		else if (attemptNumber < 5)
		{
			result = 45;
		}
		else if (attemptNumber < 10)
		{
			result = 600;
		}
		else
		{
			result = 3600;
		}

		return result + (result * Math.random() * 0.2);
	}

	sendPullStatusDelayed(status, delay)
	{
		if (this.offlineTimeout)
		{
			clearTimeout(this.offlineTimeout)
		}
		this.offlineTimeout = setTimeout(
			() => {
				this.offlineTimeout = null;
				this.sendPullStatus(status);
			},
			delay
		)
	}

	sendPullStatus(status)
	{
		if (this.unloading)
		{
			return;
		}

		if (typeof BX.onCustomEvent !== 'undefined')
		{
			BX.onCustomEvent(window, 'onPullStatus', [status]);
		}

		this.emit({
			type: SubscriptionType.Status,
			data: {
				status: status
			}
		});
	}

	extendWatch(tag, force)
	{
		if (!tag || this.watchTagsQueue[tag])
		{
			return false;
		}

		this.watchTagsQueue[tag] = true;
		if (force)
		{
			this.updateWatch(force);
		}
	}

	updateWatch(force)
	{
		clearTimeout(this.watchUpdateTimeout);
		this.watchUpdateTimeout = setTimeout(() => {
			const watchTags = Object.keys(this.watchTagsQueue);
			if (watchTags.length > 0)
			{
				this.restClient.callMethod('pull.watch.extend', {tags: watchTags}, (result) => {
					if (result.error())
					{
						this.updateWatch();

						return false;
					}

					const updatedTags = result.data();

					for (let tagId in updatedTags)
					{
						if (updatedTags.hasOwnProperty(tagId) && !updatedTags[tagId])
						{
							this.clearWatch(tagId);
						}
					}
					this.updateWatch();
				})
			}
			else
			{
				this.updateWatch();
			}
		}, force ? this.watchForceUpdateInterval : this.watchUpdateInterval);
	}

	clearWatch(tagId)
	{
		delete this.watchTagsQueue[tagId];
	}

	updatePingWaitTimeout()
	{
		clearTimeout(this.pingWaitTimeout);
		this.pingWaitTimeout = setTimeout(this.onPingTimeoutHandler, PING_TIMEOUT * 2 * 1000)
	}

	clearPingWaitTimeout()
	{
		clearTimeout(this.pingWaitTimeout);
		this.pingWaitTimeout = null;
	}

	onPingTimeout()
	{
		this.pingWaitTimeout = null;
		if (!this.enabled || !this.isConnected())
		{
			return;
		}

		console.warn("No pings are received in " + PING_TIMEOUT * 2 + " seconds. Reconnecting")
		this.disconnect(CloseReasons.STUCK, "connection stuck");
		this.scheduleReconnect();
	}
}
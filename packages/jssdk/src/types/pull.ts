import { LoggerBrowser } from '../logger/browser'
import type { TypeB24 } from './b24'
import type { ISODate, NumberString } from './common'

export type TypePullMessage = {
	command: string,
	params: Record<string, any>,
	extra: Record<string, any>
}

export type TypePullClientMessageBody = {
	module_id: string,
	command: string,
	params: any,
	extra?: {
		revision_web?: number
		sender?: {
			type: SenderType
		},
		server_time_unix? : number,
		server_time_ago? : number,
	}
}

export enum ConnectionType {
	Undefined = 'undefined',
	WebSocket = 'webSocket',
	LongPolling = 'longPolling'
}

export type TypeConnector = {
	setLogger(logger: LoggerBrowser): void,
	destroy(): void,
	connect(): void,
	disconnect( code: number, reason: string ): void,
	send(buffer: ArrayBuffer|string): boolean,
	connected: boolean
	connectionPath: string
}

export type ConnectorParent = {
	session: TypePullClientSession,
	getConnectionPath(connectionType: ConnectionType): string
	getPublicationPath(): string
	setLastMessageId(lastMessageId: string): void
	isProtobufSupported(): boolean
	isJsonRpc(): boolean
}

export type ConnectorCallbacks = {
	onOpen: () => void,
	onDisconnect: (response: {
		code: number,
		reason: string
	}) => void,
	onError: (error: Error) => void,
	onMessage: (response: string|ArrayBuffer) => void,
}

export type ConnectorConfig = {
	parent: ConnectorParent,
	onOpen?: () => void,
	onDisconnect?: (response: {
		code: number,
		reason: string
	}) => void,
	onError?: (error: Error) => void,
	onMessage?: (response: string|ArrayBuffer) => void,
}

export type StorageManagerParams = {
	userId?: number,
	siteId?: string
}

export type TypeStorageManager = {
	setLogger(logger: LoggerBrowser): void
	getLogger(): LoggerBrowser
	
	set(name: string, value: any): void
	get(name: string, defaultValue: any): any
	remove(name: string): void
	compareKey(eventKey: string, userKey: string): boolean
}

export enum LsKeys {
	PullConfig = 'bx-pull-config',
	WebsocketBlocked = 'bx-pull-websocket-blocked',
	LongPollingBlocked = 'bx-pull-longpolling-blocked',
	LoggingEnabled = 'bx-pull-logging-enabled'
}

export type SharedConfigCallbacks = {
	onWebSocketBlockChanged: (response: {
		isWebSocketBlocked: boolean,
	}) => void,
}

export type SharedConfigParams = {
	storage?: TypeStorageManager,
	onWebSocketBlockChanged?: (response: {
		isWebSocketBlocked: boolean,
	}) => void,
}

export enum PullStatus {
	Online = 'online',
	Offline = 'offline',
	Connecting = 'connect'
}

export enum SenderType {
	Unknown = 0,
	Client = 1,
	Backend = 2
}

export enum SubscriptionType {
	Server = 'server',
	Client = 'client',
	Online = 'online',
	Status = 'status',
	Revision = 'revision'
}

export type TypeSubscriptionOptions = {
	/**
	 * Subscription type
	 */
	type?: SubscriptionType,
	
	/**
	 * Name of the module
	 */
	moduleId?: string,
	
	/**
	 * Name of the command
	 */
	command?: null|string,
	
	/**
	 * Function, that will be called for incoming messages
	 */
	callback: Function,
}

export interface UserStatusCallback {
	(params: {
		userId: number,
		isOnline: boolean
	}): void
}

export interface CommandHandlerFunctionV1 {
	(
		data: Record<string, any>,
		info?: {
			type: SubscriptionType,
			moduleId?: string
		}
	): void
}

export interface CommandHandlerFunctionV2 {
	(
		params: Record<string, any>,
		extra: Record<string, any>,
		command: string,
		info?: {
			type: SubscriptionType,
			moduleId: string
		}
	): void
}

export interface TypeSubscriptionCommandHandler {
	getModuleId: () => string,
	getSubscriptionType?: () => SubscriptionType,
	getMap?: () => Record<string, CommandHandlerFunctionV2>,
	[key: string]: CommandHandlerFunctionV2 | undefined
}

export type TypePullClientEmitConfig = {
	type: SubscriptionType,
	moduleId?: string,
	data?: Record<string, any>
}

export enum CloseReasons {
	NORMAL_CLOSURE = 1000,
	SERVER_DIE = 1001,
	CONFIG_REPLACED = 3000,
	CHANNEL_EXPIRED = 3001,
	SERVER_RESTARTED = 3002,
	CONFIG_EXPIRED = 3003,
	MANUAL = 3004,
	STUCK = 3005,
	WRONG_CHANNEL_ID = 4010,
}

export enum SystemCommands {
	CHANNEL_EXPIRE = 'CHANNEL_EXPIRE',
	CONFIG_EXPIRE = 'CONFIG_EXPIRE',
	SERVER_RESTART = 'SERVER_RESTART'
}

export enum ServerMode {
	Shared = 'shared',
	Personal = 'personal'
}

export type RpcError = {
	code: number,
	message: string
}

export const ListRpcError = {
	Parse: {code: -32700, message: 'Parse error'} as RpcError,
	InvalidRequest: {code: -32600, message: 'Invalid Request'} as RpcError,
	MethodNotFound: {code: -32601, message: 'Method not found'} as RpcError,
	InvalidParams: {code: -32602, message: 'Invalid params'} as RpcError,
	Internal: {code: -32603, message: 'Internal error'} as RpcError,
} as const

export type JsonRpcRequest = {
	method: string,
	params: any,
	id: number,
}

export type RpcCommand = {
	jsonrpc: string,
	method: string,
	params: any,
	id: number,
}

export type RpcRequest = RpcCommand & {}

export type RpcCommandResult = {
	jsonrpc?: string,
	id?: number,
	/**
	 * @fix this TypeRpcResponseAwaiters.resolve(response)
	 */
	result?: any,
	error?: RpcError,
}

export enum RpcMethod {
	Publish = "publish",
	GetUsersLastSeen = "getUsersLastSeen",
	Ping = "ping",
	ListChannels = "listChannels",
	SubscribeStatusChange = "subscribeStatusChange",
	UnsubscribeStatusChange = "unsubscribeStatusChange",
}

export type TypeRpcResponseAwaiters = {
	/**
	 * @fix this RpcCommandResult.result
	 */
	resolve: (response: any) => void,
	reject: (error: string|RpcError) => void,
	timeout: number,
}

export type TypeJsonRpcConfig = {
	connector: TypeConnector,
	handlers: Record<string, (params: any) => RpcCommandResult>
}

export type TypePublicIdDescriptor = {
	id?: string,
	user_id?: NumberString,
	public_id?: string,
	signature?: string,
	start: ISODate,
	end: ISODate,
	type?: string
}

export type TypeChanel = {
	userId: number,
	publicId: string,
	signature: string,
	start: Date,
	end: Date
}

export type TypeChannelManagerParams = {
	b24: TypeB24,
	getPublicListMethod: string
}

export type TypePullClientSession = {
	mid: null|string,
	tag: null|string,
	time: null|number,
	history: any,
	lastMessageIds: string[],
	messageCount: number
}

export type TypeSessionEvent = {
	mid: string,
	tag?: string,
	time?: number,
	text: Record<string, any>|TypePullClientMessageBody
}

export type TypePullClientParams = {
	b24: TypeB24,
	skipCheckRevision?: boolean,
	restApplication?: string,
	siteId?: string,
	
	guestMode?: boolean
	guestUserId?: number
	
	userId?: number
	
	serverEnabled?: boolean,
	configGetMethod?: string,
	getPublicListMethod?: string,
	skipStorageInit?: boolean,
	configTimestamp?: number
}

export type TypePullClientConfig = {
	/**
	 * @fix this
	 */
	clientId: null,
	api: {
		revision_mobile: number,
		revision_web: number
	}
	channels: {
		private?: TypePublicIdDescriptor,
		shared?: TypePublicIdDescriptor
	},
	publicChannels: Record<string, TypePublicIdDescriptor>
	server: {
		timeShift: number,
		config_timestamp: number
		long_polling: string
		long_pooling_secure: string
		mode: string
		publish: string
		publish_enabled: boolean,
		publish_secure: string
		server_enabled: boolean,
		version: number
		websocket: string
		websocket_enabled: boolean,
		websocket_secure: string
	},
	jwt: null|string,
	exp: number
}

export type TypePullClientMessageBatch = {
	userList?: number[],
	channelList?: (string|{
		publicId: string,
		signature: string,
	})[],
	body: TypePullClientMessageBody,
	expiry?: number
}
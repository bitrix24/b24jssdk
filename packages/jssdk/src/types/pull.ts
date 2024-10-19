import { LoggerBrowser } from '../logger/browser'
import {JsonRpc} from "../pull/jsonRpc";
import type {TypeB24} from "./b24";
import type {ISODate, NumberString} from "./common";
import {PullClient} from "../pull/client";


const CONFIG_TTL = 24 * 60 * 60;
const CONFIG_CHECK_INTERVAL = 60 * 1000;
const MAX_IDS_TO_STORE = 10;


const LS_SESSION = "bx-pull-session";
const LS_SESSION_CACHE_TIME = 20;

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
// @todo fix ////
export type ConnectorParentSession = {
	mid: null|string
}

// @todo fix ////
export type ConnectorParent = {
	session: ConnectorParentSession,
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

export const JSON_RPC_PING = "ping"
export const JSON_RPC_PONG = "pong"

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
	jsonrpc: string,
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
	id?: String,
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
	mid: null,
	tag: null,
	time: null,
	history: {},
	lastMessageIds: [],
	messageCount: number
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
	jwt: null,
	exp: number
}
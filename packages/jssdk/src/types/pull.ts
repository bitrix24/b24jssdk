import { LoggerBrowser } from '../logger/browser'
import {JsonRpc} from "../pull/jsonRpc";

/**
 * @memo api revision - check module/pull/include.php
 */
const REVISION = 19
const RESTORE_WEBSOCKET_TIMEOUT = 30 * 60;
const CONFIG_TTL = 24 * 60 * 60;
const CONFIG_CHECK_INTERVAL = 60 * 1000;
const MAX_IDS_TO_STORE = 10;
const OFFLINE_STATUS_DELAY = 5000;

const LS_SESSION = "bx-pull-session";
const LS_SESSION_CACHE_TIME = 20;

export enum ConnectionType {
	Undefined = 'undefined',
	WebSocket = 'webSocket',
	LongPolling = 'longPolling'
}

export type TypeConnector = {
	destroy(): void
	connect(): void
	disconnect( code: number, reason: string ): void
	send(buffer: ArrayBuffer|string): boolean
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

export const EmptyConfig = {
	api: {},
	channels: {},
	publicChannels: {},
	server: {timeShift: 0},
	clientId: null,
	jwt: null,
	exp: 0,
}

export const JSON_RPC_PING = "ping"
export const JSON_RPC_PONG = "pong"

export const PING_TIMEOUT = 10;

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
	 * @fix this
	 */
	resolve: (response: any) => void,
	reject: (error: string|RpcError) => void,
	timeout: number,
}

export type TypeJsonRpcConfig = {
	connector: TypeConnector,
	handlers: Record<string, (params: any) => RpcCommandResult>
}
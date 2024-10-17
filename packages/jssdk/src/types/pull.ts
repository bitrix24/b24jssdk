const REVISION = 19; // api revision - check module/pull/include.php
const LONG_POLLING_TIMEOUT = 60;
const RESTORE_WEBSOCKET_TIMEOUT = 30 * 60;
const CONFIG_TTL = 24 * 60 * 60;
const CONFIG_CHECK_INTERVAL = 60 * 1000;
const MAX_IDS_TO_STORE = 10;
const OFFLINE_STATUS_DELAY = 5000;

const LS_SESSION = "bx-pull-session";
const LS_SESSION_CACHE_TIME = 20;

export enum ConnectionType {
	WebSocket = 'webSocket',
	LongPolling = 'longPolling'
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

const JSON_RPC_VERSION = "2.0"
export const JSON_RPC_PING = "ping"
export const JSON_RPC_PONG = "pong"

export const PING_TIMEOUT = 10;

const RpcError = {
	Parse: {code: -32700, message: "Parse error"},
	InvalidRequest: {code: -32600, message: "Invalid Request"},
	MethodNotFound: {code: -32601, message: "Method not found"},
	InvalidParams: {code: -32602, message: "Invalid params"},
	Internal: {code: -32603, message: "Internal error"},
};

export enum RpcMethod {
	Publish = "publish",
	GetUsersLastSeen = "getUsersLastSeen",
	Ping = "ping",
	ListChannels = "listChannels",
	SubscribeStatusChange = "subscribeStatusChange",
	UnsubscribeStatusChange = "unsubscribeStatusChange",
}

export type StorageManagerParams = {
	userId?: number,
	siteId?: string
}
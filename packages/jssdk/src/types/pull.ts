import type { LoggerInterface } from '../logger'
import type { TypeB24 } from './b24'
import type { ISODate, NumberString } from './common'

export type TypePullMessage = {
  command: string
  params: Record<string, any>
  extra: Record<string, any>
}

export type TypePullClientMessageBody = {
  module_id: string
  command: string
  params: any
  extra?: {
    revision_web?: number
    sender?: {
      type: SenderType
    }
    server_time_unix?: number
    server_time_ago?: number
  }
}

export enum ConnectionType {
  Undefined = 'undefined',
  WebSocket = 'webSocket',
  LongPolling = 'longPolling'
}

export type TypeConnector = {
  setLogger(logger: LoggerInterface): void
  destroy(): void
  connect(): void
  disconnect(code: number, reason: string): void
  send(buffer: ArrayBuffer | string): boolean
  connected: boolean
  connectionPath: string
}

export type ConnectorParent = {
  session: TypePullClientSession
  getConnectionPath(connectionType: ConnectionType): string
  getPublicationPath(): string
  setLastMessageId(lastMessageId: string): void
  isProtobufSupported(): boolean
  isJsonRpc(): boolean
}

export type ConnectorCallbacks = {
  onOpen: () => void
  onDisconnect: (response: { code: number, reason: string }) => void
  onError: (error: Error) => void
  onMessage: (response: string | ArrayBuffer) => void
}

export type ConnectorConfig = {
  parent: ConnectorParent
  onOpen?: () => void
  onDisconnect?: (response: { code: number, reason: string }) => void
  onError?: (error: Error) => void
  onMessage?: (response: string | ArrayBuffer) => void
}

export type StorageManagerParams = {
  userId?: number
  siteId?: string
}

export type TypeStorageManager = {
  setLogger(logger: LoggerInterface): void
  getLogger(): LoggerInterface

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
  onWebSocketBlockChanged: (response: { isWebSocketBlocked: boolean }) => void
}

export type SharedConfigParams = {
  storage?: TypeStorageManager
  onWebSocketBlockChanged?: (response: { isWebSocketBlocked: boolean }) => void
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
  type?: SubscriptionType

  /**
   * Name of the module
   */
  moduleId?: string

  /**
   * Name of the command
   */
  command?: null | string

  /**
   * Function, that will be called for incoming messages
   */
  // eslint-disable-next-line
	callback: Function
}

export interface UserStatusCallback {
  (params: { userId: number, isOnline: boolean }): void
}

export interface CommandHandlerFunctionV1 {
  (
    data: Record<string, any>,
    info?: {
      type: SubscriptionType
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
      type: SubscriptionType
      moduleId: string
    }
  ): void
}

export interface TypeSubscriptionCommandHandler {
  getModuleId: () => string
  getSubscriptionType?: () => SubscriptionType
  getMap?: () => Record<string, CommandHandlerFunctionV2>
  [key: string]: CommandHandlerFunctionV2 | undefined
}

export type TypePullClientEmitConfig = {
  type: SubscriptionType
  moduleId?: string
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

  /**
   * Codes the SERVER sends, below. Everything above is a code the CLIENT
   * sends — `PullClient` passes those to `disconnect()` / `restart()` when it
   * is the one ending the connection — and the two directions must not be
   * mixed up: passing `TOO_MANY_MESSAGES` to `disconnect()` would be
   * meaningless. They share an enum because `WRONG_CHANNEL_ID` always did, and
   * because a single reverse lookup over one enum is what turns a numeric
   * `CloseEvent.code` into a name.
   *
   * These arrive on the socket's `close` event, and that is the only place
   * they appear. The push server does not answer a refused frame and does not
   * error: it closes the connection with one of these and a reason string.
   *
   * Frame-level, i.e. "the publish you just made was rejected":
   * `WRONG_REQUEST_DATA`, `REQUEST_COMMAND_NOT_ALLOWED`,
   * `WRONG_REQUEST_COMMAND`, `TOO_MANY_MESSAGES`, `NO_CHANNELS_FOUND`,
   * `TOO_MANY_CHANNELS`, `INVALID_CHANNEL_ID`, `PRIVATE_CHANNEL_NOT_ALLOWED`,
   * `INVALID_CHANNEL_SIGNATURE`.
   *
   * Connection-level, i.e. "this connection is not usable", and NOT a verdict
   * on any particular frame: `WRONG_CHANNEL_ID` (above), `NO_PUBLIC_CHANNEL_ID`
   * and `TOO_MANY_CONNECTIONS`. A caller branching on "is it 401x, so my
   * publish failed" would misclassify all three.
   *
   * Reported by a third-party audit of an on-prem stand's push-server sources,
   * which is not in this repository and cannot be verified from it. Treat the
   * per-code semantics as informed documentation rather than as contract; the
   * NUMBERS are what the `close` event gives you either way. See
   * `.github/contributing/pull-protobuf.md`.
   */

  /** Connection-level: the connection has no public channel bound to it. */
  NO_PUBLIC_CHANNEL_ID = 4012,
  /** `RequestBatch.decode` threw, or `requests` was empty — a structurally malformed frame. */
  WRONG_REQUEST_DATA = 4013,
  /** Not `incomingMessages` or `channelStats`. */
  REQUEST_COMMAND_NOT_ALLOWED = 4014,
  /** No handler for the command. */
  WRONG_REQUEST_COMMAND = 4015,
  /** More than 100 messages in one batch. */
  TOO_MANY_MESSAGES = 4016,
  /** The message addressed nobody — `receivers` was empty. */
  NO_CHANNELS_FOUND = 4017,
  /** More than 100 channels in one request. */
  TOO_MANY_CHANNELS = 4018,
  /** A trusted-connection check; not reachable from a browser client. */
  INVALID_CHANNEL_ID = 4019,
  /** `Receiver.isPrivate` was true. A client may not publish to a private channel. */
  PRIVATE_CHANNEL_NOT_ALLOWED = 4020,
  /** `Receiver.signature` did not match the server's HMAC for that channel. */
  INVALID_CHANNEL_SIGNATURE = 4021,
  /** Connection-level: more than 100 connections on one channel. */
  TOO_MANY_CONNECTIONS = 4029
}

/**
 * Is this close code the server rejecting the frame that was just published?
 *
 * Not simply "is it 401x". `WRONG_CHANNEL_ID`, `NO_PUBLIC_CHANNEL_ID` and
 * `TOO_MANY_CONNECTIONS` are in that range and are connection-level — they say
 * the connection is unusable, not that a particular publish was refused.
 */
export function isFrameRefusalCloseCode(code: number): boolean {
  return code >= CloseReasons.WRONG_REQUEST_DATA
    && code <= CloseReasons.INVALID_CHANNEL_SIGNATURE
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
  code: number
  message: string
}

export const ListRpcError = {
  Parse: { code: -32700, message: 'Parse error' } as RpcError,
  InvalidRequest: { code: -32600, message: 'Invalid Request' } as RpcError,
  MethodNotFound: { code: -32601, message: 'Method not found' } as RpcError,
  InvalidParams: { code: -32602, message: 'Invalid params' } as RpcError,
  Internal: { code: -32603, message: 'Internal error' } as RpcError
} as const

export type JsonRpcRequest = {
  method: string
  params: any
  id: number
}

export type RpcCommand = {
  jsonrpc: string
  method: string
  params: any
  id: number
}

export type RpcRequest = RpcCommand & {}

export type RpcCommandResult = {
  jsonrpc?: string
  id?: number
  /**
   * @fix this TypeRpcResponseAwaiters.resolve(response)
   */
  result?: any
  error?: RpcError
}

export enum RpcMethod {
  Publish = 'publish',
  GetUsersLastSeen = 'getUsersLastSeen',
  Ping = 'ping',
  ListChannels = 'listChannels',
  SubscribeStatusChange = 'subscribeStatusChange',
  UnsubscribeStatusChange = 'unsubscribeStatusChange'
}

export type TypeRpcResponseAwaiters = {
  /**
   * @fix this RpcCommandResult.result
   */
  resolve: (response: any) => void
  reject: (error: string | RpcError) => void
  timeout: number
}

export type TypeJsonRpcConfig = {
  connector: TypeConnector
  handlers: Record<string, (params: any) => RpcCommandResult>
}

export type TypePublicIdDescriptor = {
  id?: string
  user_id?: NumberString
  public_id?: string
  signature?: string
  start: ISODate
  end: ISODate
  type?: string
}

export type TypeChanel = {
  userId: number
  publicId: string
  signature: string
  start: Date
  end: Date
}

export type TypeChannelManagerParams = {
  b24: TypeB24
  getPublicListMethod: string
}

export type TypePullClientSession = {
  mid: null | string
  tag: null | string
  time: null | number
  history: any
  lastMessageIds: string[]
  messageCount: number
}

export type TypeSessionEvent = {
  mid: string
  tag?: string
  time?: number
  text: Record<string, any> | TypePullClientMessageBody
}

export type TypePullClientParams = {
  b24: TypeB24
  skipCheckRevision?: boolean
  restApplication?: string
  siteId?: string

  guestMode?: boolean
  guestUserId?: number

  userId?: number

  serverEnabled?: boolean
  configGetMethod?: string
  getPublicListMethod?: string
  skipStorageInit?: boolean
  configTimestamp?: number

  /**
   * Which protobuf implementation encodes and decodes the push-server frames.
   *
   * - `'vendored'` (default) — the copy of protobuf.js that has always shipped
   *   with the SDK. Proven, and 94 kB of the bundle.
   * - `'lite'` — the hand-written codec for the ten structures this client
   *   actually uses. Same bytes, no library.
   *
   * **Not part of the public contract.** This is the SDK's own migration switch,
   * visible only because the type it sits on is exported. It is kept off the
   * documentation site, and it will be **removed without a deprecation cycle**
   * — see the `@internal` carve-out in
   * `.github/contributing/package-structure.md`. Do not build on it.
   *
   * @internal
   *
   * @experimental The two codecs are held byte-identical by
   * `test/integration/pull/protobuf-lite-differential.unit.spec.ts`, but that
   * proves they agree, not that they are right: both were derived from the same
   * descriptors. The lite codec has never run against a live portal, which is
   * exactly why the default stays on the proven path.
   *
   * What ends it: a `ResponseBatch` recorded from a real portal and committed as
   * a fixture. At that point the vendored library goes and this option goes with
   * it. See `.github/contributing/pull-protobuf.md`.
   */
  protobufCodec?: 'vendored' | 'lite'
}

export type TypePullClientConfig = {
  /**
   * @fix this
   */
  clientId: null
  api: {
    revision_mobile: number
    revision_web: number
  }
  channels: {
    private?: TypePublicIdDescriptor
    shared?: TypePublicIdDescriptor
  }
  publicChannels: Record<string, TypePublicIdDescriptor>
  server: {
    timeShift: number
    config_timestamp: number
    long_polling: string
    long_pooling_secure: string
    mode: string
    publish: string
    publish_enabled: boolean
    publish_secure: string
    server_enabled: boolean
    version: number
    websocket: string
    websocket_enabled: boolean
    websocket_secure: string
  }
  jwt: null | string
  exp: number
}

export type TypePullClientMessageBatch = {
  userList?: number[]
  channelList?: (
    | string
    | {
      publicId: string
      signature: string
    }
  )[]
  body: TypePullClientMessageBody
  expiry?: number
}

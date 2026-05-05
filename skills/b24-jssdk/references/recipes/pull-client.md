# Pull client (real-time events)

The Bitrix24 Pull (push) channel delivers real-time events to the portal — chat messages, CRM updates, custom app events. The SDK ships a Pull client with WebSocket + long-polling connectors, channel manager, JSON-RPC, and protobuf decoders.

The simplest entry is via `useB24Helper()` — see [helper-manager](helper-manager.md) for the surrounding lifecycle.

## Subscribe to events

```ts
import {
  initializeB24Frame,
  useB24Helper,
  LoadDataType,
  type TypePullMessage
} from '@bitrix24/b24jssdk'

const {
  initB24Helper,
  destroyB24Helper,
  usePullClient,
  useSubscribePullClient,
  startPullClient
} = useB24Helper()

const $b24 = await initializeB24Frame()
await initB24Helper($b24, [LoadDataType.Profile, LoadDataType.App])

usePullClient('myAppPrefix')
useSubscribePullClient((m: TypePullMessage) => {
  console.log('pull message', m.command, m.params)
}, 'application')
startPullClient()
```

Order matters:

1. `initializeB24Frame()` — get a frame.
2. `initB24Helper(...)` — load helper data (license-aware throttling, currency, etc.).
3. `usePullClient(prefix)` — pass an app-specific prefix; identifies your channel within the portal.
4. `useSubscribePullClient(handler, moduleId)` — register handlers per module (`'application'` for app-specific events).
5. `startPullClient()` — open the connection.

## Cleanup

```ts
destroyB24Helper()
$b24.destroy()
```

The helper teardown stops the Pull client; `$b24.destroy()` removes the parent-window listener. **Always run both** on unmount, otherwise you'll leak WebSocket connections across navigations / HMR.

## Notify other instances of the app

`helper.appOptions.save(...)` accepts a Pull command parameter — when one instance of the app updates a setting, other instances receive a Pull message and can refresh their state. See [helper-manager](helper-manager.md) → "App options".

## Direct access (advanced)

`packages/jssdk/src/pullClient` exports the underlying client classes for cases where the helper-managed flow is too constrained. Most apps should not need this — reach for it only when you have a specific reason (custom transport, non-helper context).

## Anti-patterns

- Subscribing inside a component without unsubscribing — handlers accumulate across navigations.
- Multiple `startPullClient()` calls — opens parallel connections.
- Filtering events in the handler when you could pass the right `moduleId` to `useSubscribePullClient` — let the SDK route to your handler.
- Relying on Pull for *guaranteed* delivery — treat it as an event hint and re-fetch authoritative state via REST when needed.

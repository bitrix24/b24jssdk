# Logger

The SDK exposes a small logger (`packages/jssdk/src/logger`) and defaults entry-point instances to a **null logger** — so by default nothing is written to the console. Wire a real logger when you need visibility.

## `LoggerBrowser.build`

```ts
import { LoggerBrowser } from '@bitrix24/b24jssdk'

const logger = LoggerBrowser.build('MyApp', import.meta.env?.DEV === true)
logger.info('boot', { ts: Date.now() })
logger.warn('low quota')
logger.error(new Error('boom'))
```

- First arg: a short tag prepended to every line — typically your app name.
- Second arg: dev mode flag. When `false`, `info`/`debug` are silenced; `warn`/`error` still pass through.

## Attach to an SDK instance

```ts
const $b24 = await initializeB24Frame()
$b24.setLogger(logger)
```

The same pattern applies to `B24Hook` and `B24OAuth`. Once attached, the limiter stack, HTTP transport, and managers all log through it.

## `LoggerFactory`

For libraries embedding the SDK, prefer `LoggerFactory` to produce per-component loggers with a consistent prefix scheme. End-user apps almost always want one `LoggerBrowser.build('AppName', isDev)` and that's it.

## Conventions

- One logger per app, built once at boot. Don't rebuild it on every render.
- Keep messages short and structured: `logger.info('event', { id, count })`. The browser console renders the second arg as a tree.
- For server scripts that pipe logs to a file, use `JSON.stringify` in a small wrapper instead of relying on console formatting.

## Anti-patterns

- Using `console.log` directly — bypasses the tag prefix and the dev/prod gate.
- Building a logger inside a request handler — creates a logger per request and clutters output.
- Logging every REST call payload at `info` — payloads are large; reserve `info` for lifecycle and key decisions, use `debug` for high-volume traces.

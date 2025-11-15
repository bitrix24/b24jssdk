---
outline: deep
---
# Browser Logging {#logger-for-browser}

The `LoggerBrowser` class provides a structured way to log messages in a browser environment with various logging levels and styles.

It allows you to output messages of different levels of detail with formatting.

## Logging Levels {#enum-logger-type}

`LoggerType` is an enumeration that defines various levels of log messages:

```js
import { LoggerType } from '@bitrix24/b24jssdk'
```

| Code      | Default | Description                                                                                                       |
|-----------|---------|-------------------------------------------------------------------------------------------------------------------|
| `desktop` | Yes     | Intended for outputting messages specific to desktop applications (usually not displayed in the browser)           |
| `log`     | No      | General log messages                                                                                              |
| `info`    | No      | Informational messages important for understanding the application's operation                                    |
| `warn`    | No      | Warnings about potential issues.                                                                                  |
| `error`   | Yes     | Application errors.                                                                                               |
| `trace`   | Yes     | Detailed call stack traces for debugging.                                                                         |

## LoggerBrowser {#class-logger-browser}

```js
import { LoggerBrowser } from '@bitrix24/b24jssdk'
```

The `LoggerBrowser` class provides methods for:

- Configuring allowed log message levels.
- Formatting and outputting messages to the console with different levels (_LoggerType.desktop_, _LoggerType.log_, _LoggerType.info_, _LoggerType.warn_, _LoggerType.error_, _LoggerType.trace_).

### Creation {#LoggerBrowser-build}
```ts
static build(
	title: string,
	isDevelopment: boolean = false
): LoggerBrowser
```
Creates and configures a new `LoggerBrowser` instance:

| Parameter        | Type     | Description                                                                                   |
|------------------|----------|-----------------------------------------------------------------------------------------------|
| `title`          | string   | Title for log messages. Will be used in formatting the output messages.                       |
| `isDevelopment`  | boolean  | If `true`, enables logging levels `log`, `info`, and `warn`                                   |

### Management
- `setConfig(types: Record<string|LoggerType, boolean>): void`: Sets the allowed message types.
- `enable(type: LoggerType): boolean`: Enables a specific message type. Returns `true` if successful, `false` otherwise.
- `disable(type: LoggerType): boolean`: Disables a specific message type. Returns `true` if successful, `false` otherwise.
- `isEnabled(type: LoggerType): boolean`: Checks if the specified log type is enabled. Returns `true` if enabled, `false` otherwise.

### Logging

Each of these methods accepts an arbitrary number of parameters (`params`), which will be output to the console if the corresponding log type is enabled:

- `desktop(...params: any[]): void`: Outputs a message at the **desktop** level.
- `log(...params: any[]): void`: Outputs a message at the **log** level.
- `info(...params: any[]): void`: Outputs a message at the **info** level.
- `warn(...params: any[]): void`: Outputs a message at the **warn** level.
- `error(...params: any[]): void`: Outputs a message at the **error** level.
- `trace(...params: any[]): void`: Outputs a message at the **trace** level.

## Example
```ts
import { LoggerBrowser, LoggerType } from '@bitrix24/b24jssdk'

const logger = LoggerBrowser.build(
	'MyApp',
	import.meta.env?.DEV === true // or process.env?.NODE_ENV === 'development'
)

logger.info('>> start >>>')

if(process.env.NODE_ENV === 'development')
{
	logger.enable(LoggerType.log)
}

logger.log('Processing data')
logger.info('This is an informational message.')
logger.warn('A potential warning occurred')
logger.error('This is an error message.')

// ... other logical messages ////
```

This example demonstrates the basic use of `LoggerBrowser` to create a structured and customizable log in the browser.

::: tip
You can test working with **LoggerBrowser** in this [example](https://github.com/bitrix24/b24sdk-examples/blob/main/js/02-nuxt-hook/pages/tools/use-logger.client.vue).
:::
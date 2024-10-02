---
outline: deep
---
# Logger for Browser

The `LoggerBrowser` class provides a structured way to log in a browser environment with various logging levels and styles.

It allows you to output messages of different detail levels with formatting.

## Logging Levels

`LoggerType` is an enumeration (enum) that defines different levels of log messages:

- `desktop`: Intended for messages specific to desktop applications (usually not displayed in the browser).
- `log`: General log messages (disabled by default).
- `info`: Informational messages important for understanding the application's operation (disabled by default).
- `warn`: Warnings about potential issues (disabled by default).
- `error`: Application errors (enabled by default).
- `trace`: Detailed call stack traces for debugging (enabled by default).

## Logger

The `LoggerBrowser` class provides methods for:

- Configuring allowed log message levels.
- Formatting and outputting messages to the console with different levels (_desktop_, _log_, _info_, _warn_, _error_, _trace_).

### Creation
```ts
static build(
	title: string,
	isDevelopment: boolean = false
): LoggerBrowser
```
Creates and configures a new `LoggerBrowser` instance:

- `title`: A title for log messages. It will be used when formatting message output.
- `isDevelopment` (optional, default is _false_): If `true`, enables logging levels `log`, `info`, and `warn`.

### Management
- `setConfig(types: LoggerType[]): void`: Sets the allowed message types.
- `enable(type: LoggerType): boolean`: Enables a specific message type. Returns `true` if successful, `false` otherwise.
- `disable(type: LoggerType): boolean`: Disables a specific message type. Returns `true` if successful, `false` otherwise.
- `isEnabled(type: LoggerType): boolean`: Checks if the specified log type is enabled. Returns `true` if enabled, `false` otherwise.

### Logging

Each of these methods accepts any number of parameters (`params`), which will be output to the console if the corresponding log type is enabled:

- `desktop(...params: any[]): void`: Outputs a message at the desktop level.
- `log(...params: any[]): void`: Outputs a message at the log level.
- `info(...params: any[]): void`: Outputs a message at the info level.
- `warn(...params: any[]): void`: Outputs a message at the warn level.
- `error(...params: any[]): void`: Outputs a message at the error level.
- `trace(...params: any[]): void`: Outputs a message at the trace level.

## Example
```js
import { LoggerBrowser, LoggerType } from '@bitrix24/b24jssdk/logger/browser'

const logger = LoggerBrowser.build(
	'MyApp',
	import.meta.env?.DEV === true // or process.env?.NODE_ENV ===  'development'
)

logger.info('>> start >>>')

if(process.env.NODE_ENV === 'development')
{
	logger.enable(LoggerType.log)
}

logger.log('Processing data');
logger.info('This is an informational message.');
logger.warn('A potential warning occurred');
logger.error('This is an error message.');

// ... other logical messages ////
```

This example demonstrates the basic use of `LoggerBrowser` to create a structured and customizable log in the browser.

::: tip
You can test the logger functionality in a [playground environment](https://github.com/bitrix24/b24jssdk/blob/main/playgrounds/jssdk/src/pages/logger.vue).
:::
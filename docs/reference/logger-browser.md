---

outline: deep

---

# Logger for browser {#logger-for-browser}

The `LoggerBrowser` class provides a structured way to handle logs in a browser environment with various logging levels and styles.

It allows you to output messages of different detail levels with formatting.

## Logging Levels {#enum-logger-type}

`LoggerType` is an enumeration (enum) that defines different levels of log messages:

```js
import { LoggerType } from '@bitrix24/b24jssdk/logger/browser'
```

| Code     | Default | Description                                                                                                     |
|-----------|--------------|----------------------------------------------------------------------------------------------------------------|
| `desktop` | Yes         | Intended for outputting messages specific to the desktop application (usually not displayed in the browser) |
| `log`     | No         | General log messages                                                                                            |
| `info`    | No         | Informational messages important for understanding the application's operation                                 |
| `warn`    | No         | Warnings about potential issues.                                                                     |
| `error` | Yes         | Application errors.                                                                                             |
| `trace` | Yes         | Detailed call stack traces for debugging.                                                             |


## LoggerBrowser {#class-logger-browser}

```js
import { LoggerBrowser } from '@bitrix24/b24jssdk/logger/browser'
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
Creates and configures a new instance of `LoggerBrowser`:

| Parameter         | Type     | Description                                                                                 |
|------------------|----------|--------------------------------------------------------------------------------------------|
| `title`         | string | Title for log messages. Will be used when formatting message output. |
| `isDevelopment` | boolean | If `true`, enables logging levels `log`, `info`, and `warn`                         |


### Management
- `setConfig(types: LoggerType[]): void`: Sets allowed message types.
- `enable(type: LoggerType): boolean`: Enables a specific message type. Returns `true` if successful, `false` otherwise.
- `disable(type: LoggerType): boolean`: Disables a specific message type. Returns `true` if successful, `false` otherwise.
- `isEnabled(type: LoggerType): boolean`: Checks if the specified log type is enabled. Returns `true` if enabled, `false` otherwise.

### Logging

Each of these methods accepts an arbitrary number of parameters (`params`),
which will be output to the console if the corresponding log type is enabled:

- `desktop(...params: any[]): void`: Outputs a message at the **desktop** level.
- `log(...params: any[]): void`: Outputs a message at the **log** level.
- `info(...params: any[]): void`: Outputs a message at the **info** level.
- `warn(...params: any[]): void`: Outputs a message at the **warn** level.
- `error(...params: any[]): void`: Outputs a message at the **error** level.
- `trace(...params: any[]): void`: Outputs a message at the **trace** level.

## Example
```js
import { LoggerBrowser, LoggerType } from '@bitrix24/b24jssdk/logger/browser'

const logger = LoggerBrowser.build(
    'MyApp',
    import.meta.env?.DEV === true // or process.env?.NODE_ENV === 'development'
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

This example demonstrates the basic use of `LoggerBrowser` for creating a structured and customizable log in the browser.

::: tip
You can test the logger in the [sandbox](https://github.com/bitrix24/b24jssdk/blob/main/playgrounds/jssdk/src/pages/logger.vue).
:::
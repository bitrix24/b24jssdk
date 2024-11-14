---
outline: deep
---
# Abstract Class `AbstractHelper` {#AbstractHelper}

This is an abstract class that provides basic functionality for helper classes working with data and logging.

## Methods {#methods}

### `getLogger` {#getLogger}
```ts
getLogger(): LoggerBrowser
```

Returns the current [logger](core-logger-browser).

### `setLogger` {#setLogger}
```ts
setLogger(
	logger: LoggerBrowser
): void
```

Sets the [logger](core-logger-browser).

### `initData` {#initData}
```ts
initData(
	data: any
): Promise<void>
```

Asynchronously initializes data.

By default, it throws an error indicating the need to override the method.

## Getters {#getters}

- **`get data(): any`**: An abstract property that must be implemented in subclasses to retrieve data.
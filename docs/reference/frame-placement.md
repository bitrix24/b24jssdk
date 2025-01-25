---
outline: deep
---
# `PlacementManager` Class {#PlacementManager}

Used for managing the placement of widgets in the Bitrix24 application.

[Learn more](https://apidocs.bitrix24.com/api-reference/widgets/ui-interaction/index.html)

## Getters {#getters}

### `title` {#title}
```ts
get title(): string
```
Returns the placement title. By default, returns `'DEFAULT'` if the title is not set.

### `isDefault` {#isDefault}
```ts
get isDefault(): boolean
```
Returns `true` if the placement title is `'DEFAULT'`.

### `options` {#options}
```ts
get options(): any
```
Returns the placement options object. The object is frozen to prevent modifications.

### `isSliderMode` {#isSliderMode}
```ts
get isSliderMode(): boolean
```
Returns `true` if the widget is operating in slider mode (option `IFRAME` is `'Y'`).

```ts
// ... /////
$b24 = await initializeB24Frame()
// ... /////
if($b24.placement.isSliderMode)
{
	$b24.parent.setTitle('SliderMode')
}
```

## Methods {#methods}

### `getInterface` {#getInterface}
```ts
async getInterface(): Promise<any>
```

Getting information about the JS interface of the current embedding location: a list of possible commands and events.

[Similar to function](https://apidocs.bitrix24.com/api-reference/widgets/ui-interaction/bx24-placement-get-interface.html)

```ts
// ... /////
$b24 = await initializeB24Frame()
// ... /////
const value: any = await $b24.placement.getInterface()
```

### `bindEvent` {#bindEvent}
```ts
async bindEvent(eventName: string): Promise<any>
```

Setting up the event handler for the interface

[Similar to function](https://apidocs.bitrix24.com/api-reference/widgets/ui-interaction/bx24-placement-bind-event.html)

### `call` {#call}
```ts
async call(command: string, parameters: Record<string, any> = {}): Promise<any>
```

Call the registered interface command.

[Similar to function](https://apidocs.bitrix24.com/api-reference/widgets/ui-interaction/bx24-placement-call.html)

```ts
import { LoggerBrowser, LoggerType } from '@bitrix24/b24jssdk'
// ... /////
const logger = LoggerBrowser.build(
  'Demo',
  import.meta.env?.DEV === true
)

$b24 = await initializeB24Frame()
// ... /////
$b24.placement.call(
  'reloadData'
)
.then((respose: any) => {
  logger.log('reload call')
})
```

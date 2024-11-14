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
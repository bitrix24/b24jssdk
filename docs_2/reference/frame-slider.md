---
outline: deep
---
# `SliderManager` Class {#SliderManager}

Provides methods for working with sliders in the Bitrix24 application. It allows opening and closing sliders, as well as managing their content.

```ts
// ... /////
$b24 = await initializeB24Frame()
// ... /////
const makeOpenSliderForUser = async(userId: number) =>
{
	return $b24.slider.openPath(
		$b24.slider.getUrl(`/company/personal/user/${userId}/`),
		950
	)
	.then((response: StatusClose) =>
	{
		if(
			!response.isOpenAtNewWindow
			&& response.isClose
		)
		{
			$logger.info("Slider is closed! Reinit the application")
			return reloadData()
		}
	})
}
```

::: tip
You can test working with **B24Frame.parent** in this [example](https://github.com/bitrix24/b24sdk-examples/blob/main/js/03-nuxt-frame/pages/index.client.vue).
:::

## Methods {#methods}

### `getUrl` {#getUrl}
```ts
getUrl(
	path: string = '/'
): URL
```
Returns a URL relative to the domain name and path.

```ts
// ... /////
$b24 = await initializeB24Frame()
// ... /////
const url = $b24.slider.getUrl('/settings/configs/userfield_list.php')
```

### `getTargetOrigin` {#getTargetOrigin}
```ts
getTargetOrigin(): string
```

Returns the Bitrix24 address (e.g., `https://name.bitrix24.com`). [Similar to function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-get-domain.html)

### `openSliderAppPage` {#openSliderAppPage}
```ts
async openSliderAppPage(
	params: any = {}
): Promise<any>
```

Opens a slider with the application frame. [Similar to function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-open-application.html)

```ts
// ... /////
$b24 = await initializeB24Frame()
// ... /////
const makeOpenAppOptions = async() => {
	return $b24.slider.openSliderAppPage(
		{
			place: 'app.options',
			bx24_width: 650,
			bx24_label: {
				bgColor: 'violet',
				text: '🛠️',
				color: '#ffffff',
			},
			bx24_title: 'App Options',
		}
	)
}
```

### `closeSliderAppPage` {#closeSliderAppPage}
```ts
async closeSliderAppPage(): Promise<void>
```

Closes the slider with the application. [Similar to function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-close-application.html)

```ts
// ... /////
$b24 = await initializeB24Frame()
// ... /////
const makeClosePage = async (): Promise<void> => {
	return $b24.slider.closeSliderAppPage()
}
```

### `openPath` {#openPath}
```ts
async openPath(
	url: URL,
	width: number = 1640
): Promise<StatusClose>
```

Opens the specified path inside the portal in a slider. [Similar to function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-open-path.html)

Handles errors related to mobile device usage and can open the URL in a new tab if the slider is not supported.

Returns [`StatusClose`](https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/types/slider.ts)

| Parameter | Type      | Description                                           |
|-----------|-----------|-------------------------------------------------------|
| `url`     | `URL`     | URL to be opened.                                     |
| `width`   | `number`  | Slider width, a number in the range from 1640 to 900. |

```ts
// ... /////
$b24 = await initializeB24Frame()
// ... /////
const makeOpenSliderEditCurrency = async(currencyCode: string) =>
{
	return $b24.slider.openPath(
		$b24.slider.getUrl(`/crm/configs/currency/edit/${currencyCode}/`),
		950
	)
	.then((response: StatusClose) =>
	{
		$logger.warn(response)
		if(
			!response.isOpenAtNewWindow
			&& response.isClose
		)
		{
			$logger.info("Slider is closed! Reinit the application")
			return reloadData()
		}
	})
}

makeOpenSliderEditCurrency('INR')
```
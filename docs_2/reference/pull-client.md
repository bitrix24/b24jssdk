---
outline: deep
---
# Push&Pull

Let's explore how to work with the Push & Pull client within the [Frame](frame-index) application.

::: danger
Does not work through [Hook](hook-index).
:::

Connecting the PullClient will allow the **front-end** of your application to receive events from the channel, which will be sent there by either the **front-end** or **back-end** of your application using the method [`pull.application.event.add`](https://apidocs.bitrix24.com/api-reference/interactivity/push-and-pull/pull-application-event-add.html).

## Usage {#usage}
```ts
import {
	LoggerBrowser,
	initializeB24Frame,
	B24Frame,
	useB24Helper,
	Text,
	type TypePullMessage
} from '@bitrix24/b24jssdk'

const {
	initB24Helper,
	getB24Helper,
	usePullClient,
	useSubscribePullClient,
	startPullClient
} = useB24Helper()

const $logger = LoggerBrowser.build('MyApp', import.meta.env?.DEV === true)
let $b24: B24Frame

async function init(): Promise<void>
{
	// region B24 ////
	$b24 = await initializeB24Frame()
	
	await initB24Helper($b24)
	// endregion ////
	
	// region Pull Client ////
	// Initialize ////
	usePullClient()
	
	// Subscribe to channel ////
	useSubscribePullClient(
		// Get command ////
		(message: TypePullMessage) => {
			$logger.warn(
				Text.getDateForLog(),
				'<< pull.get <<<',
				message.params.param_1,
				message
			)
		},
		'main'
	)
	
	// Launch ////
	startPullClient()
	// endregion ////
}

/**
 * Send command via Pull
 * @param {string} command
 * @param {Record<string, any>} params
 * @return {Promise<void>}
 */
async function makeSendPullCommand(
	command: string,
	params: Record<string, any> = {}
): Promise<void>
{
	try
	{
		await $b24.callMethod(
			'pull.application.event.add',
			{
				COMMAND: command,
				PARAMS: params,
				MODULE_ID: getB24Helper().getModuleIdPullClient()
			}
		)
	}
	catch(error: any)
	{
		$logger.error(error)
	}
}

// region Start ////
init()
	.then(() => {
		setInterval(() => {
			makeSendPullCommand('ping', {
				param_1: Text.getDateForLog()
			})
		}, 1_000)
	})
	.catch((error: Error|string) => {
		$logger.error(error)
	})
// endregion ////
```

::: tip
You can test working with **Push&Pull** in this [example](https://github.com/bitrix24/b24sdk-examples/blob/main/js/03-nuxt-frame/pages/index.client.vue).
:::
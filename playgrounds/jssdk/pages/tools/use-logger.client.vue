<script setup lang="ts">
import { ref, computed, type Ref, type ComputedRef } from 'vue'
import { LoggerBrowser, LoggerType } from '@bitrix24/b24jssdk';
import TrashBinIcon from '@bitrix24/b24icons-vue/main/TrashBinIcon'
import SendIcon from '@bitrix24/b24icons-vue/main/SendIcon'
import Info from '../../components/Info.vue'
import Toggle from '../../components/Toggle.vue'

definePageMeta({
	layout: "page"
})

const isDevelopment: Ref<boolean> = ref(import.meta.env?.DEV === true);
const debugMessage: Ref<string> = ref('This is a test message for debugging.');

const $logger = LoggerBrowser.build(
	'Demo: Logger',
	isDevelopment.value
);

function clearConsole(): void
{
	console.clear();
}

function makeLog(type: LoggerType): void
{
	switch(type)
	{
		case LoggerType.desktop:
			$logger.desktop(debugMessage.value)
		break;
		case LoggerType.log:
			$logger.log(debugMessage.value)
		break;
		case LoggerType.info:
			$logger.info(debugMessage.value)
		break;
		case LoggerType.warn:
			$logger.warn(debugMessage.value)
		break;
		case LoggerType.error:
			$logger.error(debugMessage.value)
		break;
		case LoggerType.trace:
			$logger.trace(debugMessage.value)
		break;
	}
}

function makeLoggAll(): void
{
	for(const type in LoggerType)
	{
		makeLog(type as LoggerType)
	}
}

function toggleLogger(type: LoggerType): void
{
	$logger.info(`toggle done ...`)
	if($logger.isEnabled(type))
	{
		$logger.disable(type)
		return
	}
	
	$logger.enable(type)
	return
}

type LoggerTypeList = {
	index: string,
	description: string,
	type: LoggerType,
	isEnabled: ComputedRef<boolean>,
	state: Ref<boolean>
}

const loggerTypeList: ComputedRef<LoggerTypeList[]> = computed<LoggerTypeList[]>(() => {
	
	return Object.keys(LoggerType).map((key: string) => {
		// @ts-ignore
		const loggerType = LoggerType[key]
		const row = {
			index: key,
			description: '?',
			type: loggerType,
			isEnabled: computed<boolean>(() => $logger.isEnabled(loggerType)),
			state: ref($logger.isEnabled(loggerType))
		} as LoggerTypeList

		switch(row.type)
		{
			case LoggerType.desktop:
				row.description = 'Used to display messages specific to the desktop application (not typically used in the browser).'
			break
			case LoggerType.log:
				row.description = 'Used to display general information messages (disabled by default).'
			break
			case LoggerType.info:
				row.description = 'Used to display informational messages that are important for understanding the operation of the application (disabled by default).'
			break
			case LoggerType.warn:
				row.description = 'Used to display warnings about potential problems (disabled by default).'
			break
			case LoggerType.error:
				row.description = 'Used to output application errors (enabled by default).'
			break
			case LoggerType.trace:
				row.description = 'Call stack tracing for debugging (enabled by default).'
			break
		}
		
		return row
	})
})

</script>

<template>
	<h1 class="text-h1 mb-sm flex whitespace-pre-wrap">LoggerBrowser</h1>
	<p>Testing the logger</p>
	<Info>To view the result, open the developer console.</Info>
	
	<div class="mt-12 sm:grid sm:grid-cols-3 sm:divide-x sm:divide-base-100">
		<div class="sm:pr-5 mt-0 flex flex-col flex-nowrap gap-4">
			<textarea
				class="resize-none border border-gray-200 rounded px-4 pt-2 min-h-24 w-full"
				v-model="debugMessage"
				placeholder="Enter a message for the log"
			></textarea>
			<div class="flex flex-col lg:flex-row gap-2">
				<button
					type="button"
					class="flex flex-row flex-nowrap gap-1.5 justify-center items-center uppercase rounded border border-blue-400 bg-blue-200 pl-1 pr-3 py-2 text-sm font-medium text-blue-900 hover:bg-blue-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
					@click="makeLoggAll"
				>
					<SendIcon class="size-6" />
					<div class="text-nowrap truncate">Send log</div>
				</button>
				<button
					type="button"
					class="flex flex-row flex-nowrap gap-1.5 justify-center items-center uppercase rounded border border-base-500 pl-1 pr-3 py-2 text-sm font-medium text-base-700 hover:text-base-900 hover:bg-base-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2"
					@click="clearConsole"
				>
					<TrashBinIcon class="size-6" />
					<div class="text-nowrap truncate">Clear console</div>
				</button>
			</div>
		</div>
		<div class="sm:pl-5 mt-12 sm:mt-0 col-span-2 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
			<div
				class="px-lg2 py-sm2 border border-base-30 rounded-md shadow-sm hover:shadow-md sm:rounded-md col-auto md:col-span-2 lg:col-span-1 bg-white"
				v-for="(type) in loggerTypeList"
				:key="type.index"
			>
				<div class="px-4 sm:px-0">
					<h3 class="text-h5 font-semibold">{{ type.index }}</h3>
					<p class="min-h-12 mt-1 max-w-2xl text-xs leading-5">{{ type.description }}</p>
				</div>
				<div class="mt-4 border-t border-base-100">
					<dl class="divide-y divide-base-100">
						<div class="px-2 py-2 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
							<dt class="text-sm font-medium leading-6 text-base-900">State</dt>
							<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">
								<Toggle
									v-model="type.state.value"
									@change="toggleLogger(type.type)"
								/>
							</dd>
						</div>
						<div class="px-2 py-2 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
							<dt class="text-sm font-medium leading-6 text-base-900">Action</dt>
							<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">
								<button
									type="button"
									class="flex flex-row flex-nowrap gap-1.5 justify-center items-center uppercase rounded border border-base-500 pl-1 pr-3 py-1 text-3xs leading-none font-medium text-base-700 hover:text-base-900 hover:bg-base-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2"
									@click="makeLog(type.type)"
								>
									<SendIcon class="size-5" />
									<div class="text-nowrap truncate">Send</div>
								</button>
							</dd>
						</div>
					</dl>
				</div>
			</div>
		</div>
	</div>
</template>
<script setup lang="ts">
import { onMounted, onUnmounted, type Ref, ref, computed } from 'vue'
import { B24Frame, B24LangList, LoadDataType, LoggerBrowser, useB24Helper } from '@bitrix24/b24jssdk'
import SimpleProfile from '~/components/SimpleProfile.vue'
import SimpleAppInfo from '~/components/SimpleAppInfo.vue'

const { $initializeB24Frame } = useNuxtApp()

let $b24: B24Frame
const $logger = LoggerBrowser.build(
	'[playground: jssdk-nuxt] App',
	true
)
const b24CurrentLang: Ref<string> = ref(B24LangList.en)
const { initB24Helper, destroyB24Helper, getB24Helper } = useB24Helper()
const isInit: Ref<boolean> = ref(false)
const $isInitB24Helper = ref(false)

onMounted(async () =>
{
	try
	{
		$logger.warn('onMounted >> ')
		$b24 = await $initializeB24Frame()
		$b24.setLogger($logger)
		b24CurrentLang.value = $b24.getLang()
		$logger.log('locale >>>', b24CurrentLang.value)
		await initB24Helper(
			$b24,
			[
				LoadDataType.AppOptions,
			]
		)
		
		$isInitB24Helper.value = true
		
		isInit.value = true
		
		window.setTimeout(async () =>
		{
			await makeFitWindow()
		}, 200)
		
		window.setInterval(() => {
			isShowComponent1.value = Math.floor(Math.random() * 10) > 6;
			isShowComponent2.value = Math.floor(Math.random() * 10) > 6;
			$logger.info({
				isShowComponent1: isShowComponent1.value,
				isShowComponent2: isShowComponent2.value,
			})
		}, 2_000)
	}
	catch( error: any )
	{
		$logger.error(error)
		showError({
			statusCode: 404,
			statusMessage: error?.message || error,
			cause: error,
			fatal: true
		})
	}
})

onUnmounted(() =>
{
	$b24?.destroy()
	destroyB24Helper()
})

const b24Helper = computed(() => {
	if($isInitB24Helper.value)
	{
		return getB24Helper()
	}
	
	return null
})

const makeFitWindow = async () =>
{
	window.setTimeout(() =>
	{
		$b24.parent.fitWindow()
	}, 200)
}

const isShowComponent1 = ref(true)
const isShowComponent2 = ref(true)

</script>

<template>
	<div class="antialiased">
		<h1>@bitrix24/b24jssdk-nuxt playground</h1>
		<ClientOnly>
			<div v-if="!isInit">
				Connection to Bitrix24 ...
			</div>
			<div v-else>
				<div>
					{{b24Helper?.hostName.replace('https://', '')}}
				</div>
				<div style="margin-top: 10px">
					<SimpleProfile v-if="isShowComponent1" />
					<div v-else>Off SimpleProfile</div>
				</div>
				<div style="margin-top: 10px">
					<SimpleAppInfo v-if="isShowComponent2" />
					<div v-else>Off SimpleAppInfo</div>
				</div>
				<div style="margin-top: 10px">
					Everything is fine
				</div>
			</div>
		</ClientOnly>
	</div>
</template>
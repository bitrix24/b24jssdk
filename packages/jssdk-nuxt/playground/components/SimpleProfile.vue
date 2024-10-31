<script setup lang="ts">
import { onMounted, onUnmounted, type Ref, ref, computed } from 'vue'
import { B24Frame, LoadDataType, LoggerBrowser, useB24Helper } from '@bitrix24/b24jssdk'

const { $initializeB24Frame } = useNuxtApp()

let $b24: B24Frame
const $logger = LoggerBrowser.build(
	'[playground: jssdk-nuxt] Profile',
	true
)
const { initB24Helper, destroyB24Helper, getB24Helper } = useB24Helper()
const isInit: Ref<boolean> = ref(false)
const $isInitB24Helper = ref(false)


onMounted(async () =>
{
	$logger.warn('onMounted >> ')
	
	try
	{
		$b24 = await $initializeB24Frame()
		isInit.value = true
		await initB24Helper(
			$b24,
			[
				LoadDataType.Profile
			]
		)
		
		$isInitB24Helper.value = true
		
		isInit.value = true
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
	//*/
})

onUnmounted(() =>
{
	$logger.warn('onUnmounted << ')
})

const b24Helper = computed(() => {
	if($isInitB24Helper.value)
	{
		return getB24Helper()
	}
	
	return null
})

</script>

<template>
	<div class="">
		<h3>Profile</h3>
	</div>
	
	<ClientOnly>
		<div v-if="!isInit">
			Connection to Bitrix24 ...
		</div>
		<div v-else>
			<div>
				{{
					[
						b24Helper?.profileInfo.data.lastName,
						b24Helper?.profileInfo.data.name,
					].join(' ')
				}}
			</div>
			<div>
				<span>{{b24Helper?.profileInfo.data.isAdmin ? 'Administrator' : 'Not Administrator'}}</span>
			</div>
		</div>
	</ClientOnly>
</template>
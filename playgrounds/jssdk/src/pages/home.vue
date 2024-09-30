<script setup lang="ts">
import { defineComponent } from 'vue'
import { useRouter } from 'vue-router'
import InterconnectionIcon from "@bitrix24/b24icons-vue/crm/InterconnectionIcon"

let Examples = defineComponent({
	props: ['routes'],
	setup: (props, { slots }) => () => slots.default({ routes: props.routes, slots }),
})

let router = useRouter()
let routes = router
	.getRoutes()
	.filter((example) => example.path !== '/')
	.filter((route) => route.meta.isRoot)
</script>

<template>
	<h1 class="text-h1 mb-xs flex whitespace-pre-wrap">Examples</h1>
	<div class="dd-prose">
		<Examples :routes="routes" v-slot="{ routes, slots }">
			<ul>
				<li v-for="{ children, meta, path } in routes">
					
					<template v-if="children.length > 0">
						<h3 class="text-xl">{{ meta.name }}</h3>
						<component v-for="vnode in slots.default({ routes: children, slots })" :is="vnode" />
					</template>
					<template v-else>
						<router-link :key="path" :to="path" class="font-normal">
							<div class="flex flex-row items-center justify-start gap-2">
								<InterconnectionIcon class="size-6"/>
								<div>{{ meta.name }}</div>
							</div>
						</router-link>
					</template>
				</li>
			</ul>
		</Examples>
	</div>
</template>
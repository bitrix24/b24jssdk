<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import Layout from './Layout.vue'

let route = useRoute()
let layout = computed(() => route.query['layout'] ?? 'full')

</script>

<template>
	<router-view v-if="layout === 'raw'" />
	<Layout v-else>
		<router-view />
	</Layout>
</template>
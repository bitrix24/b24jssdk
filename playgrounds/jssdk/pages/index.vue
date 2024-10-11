<script setup lang="ts">
definePageMeta({
	layout: "page"
})
</script>

<template>
	<h2 class="text-h2">Hook</h2>
	<ul class="list-disc list-inside">
		<li class="py-2"><NuxtLink class="hover:text-info" to="/hook/crm.item.list">List Company</NuxtLink></li>
		<li class="py-2"><NuxtLink class="hover:text-info" to="/hook/testing-rest-api-calls">Testing Rest-Api Calls</NuxtLink></li>
	</ul>
	
	<h2 class="text-h2">Frame</h2>
	<ul class="list-disc list-inside">
		<li class="py-2"><NuxtLink class="hover:text-info" to="/frame/">Index</NuxtLink></li>
	</ul>
	
	<h2 class="mt-3 text-h2">Core</h2>
	<ul class="list-disc list-inside">
		<li class="py-2"><NuxtLink class="hover:text-info" to="/core/use-result">Result</NuxtLink></li>
	</ul>
	
	<h2 class="mt-3 text-h2">Tools</h2>
	<ul class="list-disc list-inside">
		<li class="py-2"><NuxtLink class="hover:text-info" to="/tools/use-logger">LoggerBrowser</NuxtLink></li>
		<li class="py-2"><NuxtLink class="hover:text-info" to="/tools/iban">IBAN</NuxtLink></li>
	</ul>
</template>
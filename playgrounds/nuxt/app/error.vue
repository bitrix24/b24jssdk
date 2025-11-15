<script setup lang="ts">
import { ref } from 'vue'
import type { NuxtError } from '#app'
import LetCatInIcon from '@bitrix24/b24icons-vue/specialized/LetCatInIcon'

const $props = defineProps({
  error: Object as () => NuxtError
})

const errorData = ref({
  code: $props.error?.statusCode || 400,
  title: $props.error?.statusMessage || 'Error',
  description: ($props.error?.data as any)?.description || '',
  clearErrorIsShow: ($props.error?.data as any)?.isShowClearError === true,
  clearErrorHref: ($props.error?.data as any)?.clearErrorHref || '/',
  clearErrorTitle: ($props.error?.data as any)?.clearErrorTitle || 'Clear errors',
  homePageIsHide: ($props.error?.data as any)?.homePageIsHide === true,
  homePageHref: ($props.error?.data as any)?.homePageHref || '/',
  homePageTitle: ($props.error?.data as any)?.homePageTitle || 'Go back home'
})

const handleError = () => clearError({ redirect: errorData.value.clearErrorHref })
</script>

<template>
  <div class="flex flex-col">
    <div class="px-lg mb-xs2">
      <LetCatInIcon class="text-info w-full h-[50vh]" />
    </div>
    <div class="my-sm flex flex-col justify-center items-center">
      <div class="mb-1 text-xs text-base-400 ">
        [code: {{ errorData.code }}]
      </div>
      <h1 class="mb-4 text-h1 text-base-master font-normal">
        {{ errorData.title }}
      </h1>
      <div
        v-show="errorData.description"
        class="text-h3 text-base-800"
      >
        {{ errorData.description }}
      </div>
      <NuxtLink
        v-show="!errorData.homePageIsHide"
        class="mt-4 text-md font-medium text-white bg-blue px-4 py-2 rounded hover:bg-blue-400 active:bg-blue-600"
        :to="errorData.homePageHref"
      >{{ errorData.homePageTitle }}</NuxtLink>
      <button
        v-show="errorData.clearErrorIsShow"
        class="mt-4 text-md font-medium text-white bg-blue px-4 py-2 rounded hover:bg-blue-400 active:bg-blue-600"
        @click="handleError"
      >
        {{ errorData.clearErrorTitle }}
      </button>
    </div>
  </div>
</template>

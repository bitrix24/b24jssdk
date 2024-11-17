---
outline: deep
---
# Quick Start for Nuxt 3

This page will help you quickly integrate `@bitrix24/b24jssdk` into your Nuxt 3 project.

## Installation {#install}

Before you begin, make sure you have Nuxt 3 installed.

Then run the following command to install the [module](https://www.npmjs.com/package/@bitrix24/b24jssdk-nuxt):

```bash
npx nuxi module add @bitrix24/b24jssdk-nuxt
```

## Example {#example}

After setting up the module, you can use it in your application's components. Here is an example:

```vue
<script setup>
import { onMounted, onUnmounted } from 'vue'
import { B24Frame } from '@bitrix24/b24jssdk'

let $b24: B24Frame

onMounted(async () => {
    try
    {
        const { $initializeB24Frame } = useNuxtApp()
        $b24 = await $initializeB24Frame()
    }
    catch (error)
    {
        console.error(error)
    }
})

onUnmounted(() => {
    $b24?.destroy()
})
</script>
<template>
<div>
    <h1>@bitrix24/b24jssdk</h1>
</div>
</template>
```

## Documentation

For more detailed information on all available functions and parameters, please refer to our documentation for [B24Hook](/reference/hook-index) and [B24Frame](/reference/frame-initialize-b24-frame).

## Support

If you have any questions or issues, you can create an issue on [GitHub](https://github.com/bitrix24/b24jssdk/issues).
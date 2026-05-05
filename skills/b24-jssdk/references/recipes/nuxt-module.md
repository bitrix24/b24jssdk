# Nuxt module (`@bitrix24/b24jssdk-nuxt`)

Thin Nuxt module wrapper — registers a single runtime plugin that makes the SDK SSR-safe. It does **not** wrap or rename SDK exports; you import from `@bitrix24/b24jssdk` exactly as in any other project.

Use this module when building a Nuxt app that runs as a Bitrix24 placement or talks to the SDK from the client side. For pure server use (`B24Hook` in a Nuxt server route) the module isn't required, but it doesn't hurt.

## Install

```bash
npx nuxi module add @bitrix24/b24jssdk-nuxt
```

This adds the module to `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['@bitrix24/b24jssdk-nuxt']
})
```

Compatibility: Nuxt `>=4.2.2`.

## Use the SDK from a component

```vue
<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef } from 'vue'
import { initializeB24Frame, type B24Frame } from '@bitrix24/b24jssdk'

const $b24 = shallowRef<B24Frame | null>(null)
const ready = ref(false)

if (import.meta.client) {
  initializeB24Frame().then((b24) => {
    $b24.value = b24
    ready.value = true
  })
}

onBeforeUnmount(() => {
  $b24.value?.destroy()
  $b24.value = null
})
</script>
```

Always guard `initializeB24Frame()` with `import.meta.client` (or `<ClientOnly>`) — it relies on `window` and the parent-window handshake, neither of which exist during SSR.

## Server routes (`B24Hook`)

```ts
// server/api/companies.get.ts
import { B24Hook, EnumCrmEntityTypeId } from '@bitrix24/b24jssdk'

export default defineEventHandler(async () => {
  const $b24 = B24Hook.fromWebhookUrl(useRuntimeConfig().b24Hook)
  $b24.offClientSideWarning?.()

  const res = await $b24.callListMethod('crm.item.list', {
    entityTypeId: EnumCrmEntityTypeId.company,
    select: ['id', 'title']
  })

  return res.getData()
})
```

Keep webhook URLs in `runtimeConfig` (server-only secret), never in `runtimeConfig.public`.

## When to update the module

Per `CLAUDE.md`: **whenever the core SDK exposes a new public surface that needs SSR-safe access or Nuxt auto-imports, the module's runtime plugin must be updated.** A pure REST helper added to `AbstractB24` typically needs no module change; a new browser-only manager probably does.

## Anti-patterns

- Calling `initializeB24Frame()` in `<script setup>` without an `import.meta.client` guard — SSR throws.
- Putting the webhook URL in `runtimeConfig.public` — leaks the secret to the client bundle.
- Re-creating `B24Hook` per request when a singleton would work — the limiter state is per-instance and is more effective when shared.

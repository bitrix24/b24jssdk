---
name: b24jssdk-frame-ui
description: Use B24Frame UI managers (slider, dialog, parent, placement, options, auth) from a Bitrix24 placement iframe app. Covers opening sliders with mobile fallback, picking users, resizing the parent window, persisting app/user options, and reading placement context. Load when generating in-frame UI code.
---

# b24jssdk frame UI

These managers exist **only** on `B24Frame`. None of them work for `B24Hook` or `B24OAuth`. Always init via:

```ts
import { initializeB24Frame } from '@bitrix24/b24jssdk'
const $b24 = await initializeB24Frame()
```

…and call `$b24.destroy()` when the page/component unmounts.

## Slider — open paths and app pages

```ts
// 1. Open a portal path in a slider
const url = $b24.slider.getUrl('/crm/deal/details/1')
const status = await $b24.slider.openPath(url, /* width */ 1640)

if (status.isOpenAtNewWindow) {
  // Mobile fallback: it opened a new tab and polled for close
}

// 2. Open YOUR app's page as a slider, then close it
await $b24.slider.openSliderAppPage({ some: 'param' })
await $b24.slider.closeSliderAppPage()
```

`openPath` returns when the slider closes (or the popup is closed on mobile). Always check `isOpenAtNewWindow` if you depend on close-detection.

## Dialog — pick a user

```ts
const single = await $b24.dialog.selectUser()
// single: { id, name, lastName, photo, ... } | null

const many = await $b24.dialog.selectUsers()
// many: SelectedUser[]
```

> `dialog.selectAccess()` and `dialog.selectCRM()` exist but are **deprecated**. Avoid in new code.

## Parent — control the iframe in the portal layout

```ts
await $b24.parent.fitWindow()                // shrink-wrap to content
await $b24.parent.resizeWindow(800, 600)     // explicit size
await $b24.parent.resizeWindowAuto(rootEl, /* minH */ 400, /* minW */ 300)
await $b24.parent.setTitle('My App')         // header title in the portal
await $b24.parent.scrollParentWindow(0)      // scroll the parent
await $b24.parent.reloadWindow()
await $b24.parent.closeApplication()         // close the placement
```

For IM:

```ts
await $b24.parent.imCallTo(/* userId */ 5, /* video */ true)
await $b24.parent.imOpenMessenger('chat12')
```

## Placement — context the user opened your app from

```ts
$b24.placement.title           // string identifier of the placement
$b24.placement.options         // params passed by the placement
$b24.placement.isSliderMode    // boolean

const iface = await $b24.placement.getInterface()

// React to events from the host page
await $b24.placement.bindEvent('onCrmEntityUpdate', (...args) => {
  console.log('host event:', args)
})

// Call host-defined commands
await $b24.placement.call('someCommand', { foo: 'bar' })
await $b24.placement.callCustomBind('someCommand', { opt: 1 }, (...args) => {
  // result callback
})
```

## Options — persist app and per-user settings

```ts
// App-level (visible to all users of this app on the portal)
await $b24.options.appSet('installComplete', true)
const installed = $b24.options.appGet('installComplete')

// User-level (per-user on this portal)
await $b24.options.userSet('theme', 'dark')
const theme = $b24.options.userGet('theme')
```

Values are JSON-serialized server-side. Read returns the parsed value.

For batched/structured options, prefer the helper-level options manager (see `b24jssdk-helpers`).

## Auth — env, refresh, language

```ts
const auth = $b24.auth.getAuthData()
// { access_token, refresh_token, expires_in, domain, member_id } | false

if (!auth) {
  await $b24.auth.refreshAuth()
}

const lang = $b24.getLang()    // portal UI language: 'ru' | 'en' | ...
const sid = $b24.getAppSid()   // app SID for the current session
```

The SDK auto-refreshes auth on 401 — manual `refreshAuth()` is rarely needed.

## Lifecycle template (Vue 3 style)

```ts
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { initializeB24Frame, type B24Frame } from '@bitrix24/b24jssdk'

const $b24 = ref<B24Frame | null>(null)

onMounted(async () => {
  $b24.value = await initializeB24Frame()
  await $b24.value.parent.setTitle('My App')
  await $b24.value.parent.fitWindow()
})

onBeforeUnmount(() => {
  $b24.value?.destroy()
})
```

## Anti-patterns

- ❌ Using `B24Frame` outside a Bitrix24 placement — `initializeB24Frame()` will hang waiting for the parent handshake. Use `B24Hook` for non-frame contexts.
- ❌ Calling slider / dialog APIs before `await initializeB24Frame()` resolves.
- ❌ Storing secrets in `options.appSet` — they are visible to everyone with placement access.

---
name: b24jssdk-frame-ui
description: Use B24Frame UI managers (slider, dialog, parent, placement, options, auth) from a Bitrix24 placement iframe app. Covers opening sliders with mobile fallback, picking users and CRM entities, resizing the parent window, placement setValue, persisting app/user options. Load when generating in-frame UI code.
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

## Dialog — pick users

```ts
const single = await $b24.dialog.selectUser()
// single: { id, name, lastName, photo, … } | null

const many = await $b24.dialog.selectUsers()
// many: SelectedUser[]
```

## Dialog — pick CRM entities (`selectCRM`)

Active method (re-implemented in `packages/jssdk/src/frame/dialog.ts:175-235`). Returns an object with per-entity-type buckets, each a real `Array` so you can use `.length`/`.map()`/`for..of`. Buckets for entity types you did not request are `undefined`.

```ts
import type { SelectCRMParams, SelectedCRM } from '@bitrix24/b24jssdk'

// Pick one contact
const single = await $b24.dialog.selectCRM({
  entityType: ['contact'],
  multiple: false
})
const contact = single.contact?.[0]
// contact: { id: 'C_<n>', title, image, … } | undefined

// Pick multiple deals and companies, with pre-selected values
const picked: SelectedCRM = await $b24.dialog.selectCRM({
  entityType: ['deal', 'company'],
  multiple: true,
  value: { deal: ['D_42'], company: ['CO_7'] }
})

for (const deal of picked.deal ?? []) {
  console.log(deal.id, deal.title) // id type-narrows to `D_${number}`
}
```

The id format is per entity:
- lead → `L_<n>`
- contact → `C_<n>`
- company → `CO_<n>`
- deal → `D_<n>`
- quote → `Q_<n>`

## Dialog — pick access targets (`selectAccess`)

```ts
const access = await $b24.dialog.selectAccess({ /* params */ })
```

Less commonly used. Returns the parent window's raw access-selection payload — refer to Bitrix24's selectAccess docs for the shape.

## Parent — control the iframe in the portal layout

```ts
await $b24.parent.fitWindow()                // shrink-wrap to content
await $b24.parent.resizeWindow(800, 600)     // explicit size
await $b24.parent.resizeWindowAuto(rootEl, /* minH */ 400, /* minW */ 300)
await $b24.parent.setTitle('My App')         // in-page #pagetitle, NOT the browser tab
await $b24.parent.scrollParentWindow(0)
await $b24.parent.reloadWindow()
await $b24.parent.closeApplication()
```

`setTitle` changes the in-page `#pagetitle`, not the browser tab — to set the browser tab title, open a slider via `slider.openSliderAppPage({ bx24_title: '…' })`.

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

### `placement.setValue` — send a value back to the host placement

Use `setValue` when your iframe is mounted in a "select-value" placement (e.g. a custom CRM-field selector). The host expects a **JSON-serialized string** and calls `JSON.parse` on receipt.

```ts
// Convenience helper that serializes for you (preferred)
await $b24.placement.setValue('plain string')
await $b24.placement.setValue({ id: 1, title: 'demo' })
await $b24.placement.setValue([1, 2, 3])
```

Manual form via `placement.call('setValue', …)` is also supported, but `value` MUST already be a JSON-serialized string — the SDK throws `TypeError` otherwise (see `packages/jssdk/src/frame/placement.ts:104-113`):

```ts
// Equivalent but requires you to stringify yourself
await $b24.placement.call('setValue', { value: JSON.stringify({ id: 1 }) })
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

const lang = $b24.getLang()    // 'ru' | 'en' | …
const sid = $b24.getAppSid()
```

The SDK auto-refreshes auth on 401 — manual `refreshAuth()` is rarely needed.

## Lifecycle template (Vue 3)

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
- ❌ `$b24.placement.call('setValue', { value: { id: 1 } })` — throws because `value` is not a string. Use `$b24.placement.setValue({ id: 1 })` or stringify yourself.
- ❌ Storing secrets in `options.appSet` — placement options are visible to everyone with access to the placement.
- ❌ Treating an absent `selectCRM` bucket as an empty array — they are `undefined`. Use `picked.deal ?? []`.

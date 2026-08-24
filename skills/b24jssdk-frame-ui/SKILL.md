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

`openPath` opens a **portal** path; `openSliderAppPage` re-opens **your own registered handler URL**. Pointing `openPath` at an application page yields a 404 on the portal side.

Everything you pass to `openSliderAppPage` is forwarded to the new frame as `PLACEMENT_OPTIONS`, so `place` is an ordinary call parameter — **not** a registered placement, and no `placement.bind` is needed. `bx24_width` below your own mobile breakpoint silently renders the mobile layout.

### Routing the opened slider to the right screen (Nuxt)

The SDK's job ends when the parameter is delivered; routing is yours. In Nuxt, **do not just return `navigateTo()` from route middleware** — that redirect is silently discarded when the entry route is prerendered, which `nuxt build` does for anything in `nitro.prerender.routes` (and, with `crawlLinks`, anything reachable by link). The portal opens the frame with a query string, and for a prerendered page Nuxt hydrates on the bare path and then restores the original URL on `app:suspense:resolve`, bypassing guards. Nothing reports an error; the slider just shows your main page.

```ts
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return

  const { $initializeB24Frame } = useNuxtApp()
  const $b24 = await $initializeB24Frame()

  const target = routeForPlace($b24.placement.options?.place)
  // isSamePath must tolerate a trailing slash: a static server serves `/app/`
  // while the router resolves `/app`, and a strict !== cancels every redirect.
  if (!target || isSamePath(to.path, target)) return

  // Query from the ADDRESS BAR, not `to.query` — a prerendered page hydrates on
  // the bare path, so `to` has no query and the target would lose `place`.
  const dest = { path: target, query: Object.fromEntries(new URLSearchParams(location.search)) }

  const nuxtApp = useNuxtApp()
  if (!nuxtApp.isHydrating) return navigateTo(dest, { replace: true })

  onNuxtReady(() => {
    void nuxtApp.runWithContext(async () => {
      const router = useRouter()
      if (!isSamePath(router.currentRoute.value.path, to.path)) return
      // router.replace, not navigateTo: navigateTo RETURNS a route object when it
      // catches another navigation in progress, and nobody would apply it.
      // Check the result — a failed navigation resolves, it does not throw.
      const failure = await router.replace(dest)
      if (failure) console.warn('slider redirect failed', failure.type)
    })
  })
})
```

`onNuxtReady` works because it hooks the same `app:suspense:resolve` but subscribes later and defers to `requestIdleCallback`, running after the restore. `app:mounted` is too early — it fails with `NavigationFailure: aborted`. `redirectCode` is server-only, `abortNavigation` cannot redirect, and `external: true` means a full reload.

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
await $b24.parent.imPhoneTo('+70000000000')
await $b24.parent.imOpenHistory('chat12')
```

**All four are fire-and-forget.** The portal's handlers take no callback, so
nothing ever answers: the promise resolves on the SDK's own short timer and means
*the command was posted*, not that the call started or the chat opened. Never
branch on it as a success signal, and do not treat the `action im… stop by
timeout` log line that follows as a fault — it is the normal outcome.

Calling any of them prints a deprecation notice in the **portal's** console
recommending `Messenger.startPhoneCall` / `startVideoCall` / `openChat`. Those are
top-window methods and are **not reachable from an application** — they are not
part of a placement's command vocabulary. The notice comes from the portal's own
compatibility layer, which these methods reach anyway; it cannot be avoided, and
there is nothing to migrate to. See [#331](https://github.com/bitrix24/b24jssdk/issues/331).

`imPhoneTo` accepts a second `params` argument and `imOpenMessenger` a second
`messageId`, mirroring the portal's own `startPhoneCall(number, params)` and
`openChat(dialogId, messageId)`. **The portal does not forward either today**, so
they have no effect yet — send them only so that no change is needed when it does.

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

## Install mode — finish it, or the portal sends you nothing

An application is "installing" from the moment the user accepts the install dialog
until it calls `installFinish()`. Until that call lands, the portal treats the app
as half-installed and **delivers no events to it** — bot handlers, handlers
registered with `event.bind`, and other outgoing calls never reach your endpoints.

The failure is silent: registration succeeds, `imbot.register` returns a `botId`,
the handlers are listed when queried, and no traffic arrives. Generated code must
therefore always finish the install flow.

<!-- Keep in sync: docs 30.frame.md (installFinish), docs 99.examples/20.app-installation-wizard.md, skills/b24jssdk-core/SKILL.md. -->

```ts
const $b24 = await initializeB24Frame()

if ($b24.isInstallMode) {
  // provision fields, register placements, seed options...

  // Last statement of the flow: the portal reloads the page in response,
  // so anything after this may never run.
  await $b24.installFinish()
}
```

The opposite holds for an **API-only app with no installation interface**: it must
*not* call `installFinish()`. Its installation completes automatically, and the
method works only inside a browser interface frame — so gate the call on
`isInstallMode`, which is only ever true inside that frame.

Finishing the installation is a **lifecycle** step, not a security one. An app that
also runs an OAuth install/uninstall endpoint still has to verify `application_token`
on `ONAPPINSTALL` / `ONAPPUNINSTALL` — see the [Security patterns](https://bitrix24.github.io/b24jssdk/docs/working-with-the-rest-api/security/)
page. Doing one does not cover the other.

To check an app the portal is ignoring, ask whether it considers it installed:
`app.info` returns `INSTALLED`, and `false` means `installFinish()` never landed.

## Anti-patterns

- ❌ Using `B24Frame` outside a Bitrix24 placement — `initializeB24Frame()` will hang waiting for the parent handshake. Use `B24Hook` for non-frame contexts.
- ❌ Calling slider / dialog APIs before `await initializeB24Frame()` resolves.
- ❌ Provisioning an app in install mode and never calling `installFinish()` — the app stays half-installed and the portal delivers no events to it, with nothing failing loudly to say so.
- ❌ Putting work after `await installFinish()` — the portal reloads the page in response, so it may never run.
- ❌ `$b24.placement.call('setValue', { value: { id: 1 } })` — throws because `value` is not a string. Use `$b24.placement.setValue({ id: 1 })` or stringify yourself.
- ❌ Storing secrets in `options.appSet` — placement options are visible to everyone with access to the placement.
- ❌ Treating a resolved `parent.im*` promise as proof the call started or the chat opened — nothing answers those commands; the promise only means the message was posted.
- ❌ Firing `parent.closeApplication()` without `.catch(() => {})` and calling `$b24.destroy()` in the same breath — `destroy()` rejects every in-flight command with `JSSDK_FRAME_DISPOSED`, and a discarded promise becomes an unhandled rejection. Either `await` the close or attach a `.catch`.
- ❌ Treating an absent `selectCRM` bucket as an empty array — they are `undefined`. Use `picked.deal ?? []`.
- ❌ `return navigateTo(target)` from Nuxt route middleware to route an opened slider — discarded without error on a prerendered entry route. Navigate from `onNuxtReady` while hydrating.
- ❌ Reading `$b24.placement.options?.place` without allowing for a JSON string — `PLACEMENT_OPTIONS` is not always an object, and key case is not guaranteed across entry points. On a string this yields `undefined` silently.
- ❌ Gating slider diagnostics on `placement.isSliderMode` — it is derived from `PLACEMENT_OPTIONS.IFRAME`, so it goes quiet exactly when the placement data you are diagnosing is missing.

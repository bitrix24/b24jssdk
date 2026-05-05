# UI integrations (frame-only)

Sliders, dialogs, parent window control, placement bindings, and per-app/user options. **Available only on `B24Frame`** — the calls don't exist on `B24Hook` or `B24OAuth`.

Assumes `$b24` is an initialized `B24Frame`. See [frame-apps](frame-apps.md) for boot.

## Sliders

```ts
// Open a portal path in a slider (default Bitrix24 slider)
const url = $b24.slider.getUrl('/crm/deal/details/1/')
const status = await $b24.slider.openPath(url, 1640)
if (status.isOpenAtNewWindow) {
  // Mobile: opened in a new tab; the SDK polled until the tab closed
}

// Open *your* application page as a slider, then close it
await $b24.slider.openSliderAppPage({ some: 'params' })
await $b24.slider.closeSliderAppPage()
```

`openPath` automatically falls back to `window.open` on mobile and polls for close. Always check `isOpenAtNewWindow` if your flow depends on the slider being modal.

## Dialogs

```ts
const user = await $b24.dialog.selectUser()        // null | { id, name, ... }
const users = await $b24.dialog.selectUsers()      // SelectedUser[]
```

`selectAccess()` and `selectCRM()` exist but are deprecated — don't reach for them in new code.

## Parent window

```ts
await $b24.parent.fitWindow()                       // size to content
await $b24.parent.resizeWindow(1024, 768)
await $b24.parent.resizeWindowAuto(node, 400, 600)  // measure node, clamp by min
await $b24.parent.setTitle('My Page')
await $b24.parent.scrollParentWindow(0)
await $b24.parent.closeApplication()
await $b24.parent.reloadWindow()

// IM integrations (open chat, place a call)
await $b24.parent.imCallTo(5, true)
await $b24.parent.imOpenMessenger('chat12')
```

Call `fitWindow()` after content changes — Bitrix24 placements don't auto-resize.

## Placement

```ts
console.log($b24.placement.title)
console.log($b24.placement.options)
console.log($b24.placement.isSliderMode)

const iface = await $b24.placement.getInterface()
await $b24.placement.bindEvent('onMessage', (...args) => console.log(args))
await $b24.placement.call('someCommand', { foo: 'bar' })
await $b24.placement.callCustomBind('someCommand', { opt: 1 }, (...args) => {})
```

## Options (per-app / per-user persistence)

```ts
await $b24.options.appSet('installComplete', true)
const installed = $b24.options.appGet('installComplete')

await $b24.options.userSet('theme', 'dark')
const theme = $b24.options.userGet('theme')
```

`appSet` / `userSet` round-trip to the portal; `appGet` / `userGet` are synchronous reads from the cache that was loaded during init.

For higher-level option storage (with batched saves and Pull notifications) see the helper-level `OptionsManager` in [helper-manager](helper-manager.md).

## Auth & environment

```ts
const auth = $b24.auth.getAuthData()    // { access_token, refresh_token, expires_in, domain, member_id } | false
if (!auth) {
  await $b24.auth.refreshAuth()
}
const lang = $b24.getLang()              // portal UI language ('en', 'ru', …)
const sid = $b24.getAppSid()             // app SID for the current session
const uniq = $b24.auth.getUniq('myApp')  // stable per-member unique key
```

The frame auto-refreshes auth on `401`, so you usually don't need `refreshAuth()` explicitly — it's there for edge cases.

## Anti-patterns

- Calling `slider`/`dialog`/`parent` on `B24Hook` or `B24OAuth` — those managers are frame-only.
- Forgetting `fitWindow()` after a content change — leaves an awkward scrollbar in the placement.
- Hard-coding portal paths instead of using `slider.getUrl(path)` — the helper handles the portal domain for you.
- Persisting transient state via `appSet` — round-trips to the portal; for ephemeral state use local component state.

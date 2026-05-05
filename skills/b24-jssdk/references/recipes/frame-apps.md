# Frame apps (iframe placements)

For apps embedded in Bitrix24 as a placement. `B24Frame` talks to the parent window via `postMessage`, auto-refreshes auth on `401`, and exposes UI managers (`auth`, `parent`, `slider`, `dialog`, `placement`, `options`).

Always bootstrap via `initializeB24Frame()` — never `new B24Frame(...)` directly. The loader parses `window.name` for the portal handshake and deduplicates concurrent inits.

## Minimal boot

```ts
import {
  initializeB24Frame,
  B24Frame,
  EnumCrmEntityTypeId,
  Text,
  LoggerBrowser,
  type ISODate
} from '@bitrix24/b24jssdk'

const logger = LoggerBrowser.build('MyApp', import.meta.env?.DEV === true)
let $b24: B24Frame

async function boot() {
  $b24 = await initializeB24Frame()
  $b24.setLogger(logger)

  const res = await $b24.callMethod('crm.item.list', {
    entityTypeId: EnumCrmEntityTypeId.company,
    order: { id: 'desc' },
    select: ['id', 'title', 'createdTime']
  })

  const items = res.getData().result.map((it: any) => ({
    id: Number(it.id),
    title: it.title as string,
    createdTime: Text.toDateTime(it.createdTime as ISODate)
  }))

  logger.info('items', items)
}

function teardown() {
  $b24?.destroy()
}
```

## Vue / Nuxt component lifecycle

```ts
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { initializeB24Frame, type B24Frame } from '@bitrix24/b24jssdk'

const $b24 = shallowRef<B24Frame | null>(null)
const ready = ref(false)

onMounted(async () => {
  $b24.value = await initializeB24Frame()
  ready.value = true
})

onBeforeUnmount(() => {
  $b24.value?.destroy()
  $b24.value = null
})
```

For Nuxt apps prefer the [Nuxt module](nuxt-module.md) — it ensures SSR-safe access.

## React component lifecycle

```ts
import { useEffect, useRef, useState } from 'react'
import { initializeB24Frame, type B24Frame } from '@bitrix24/b24jssdk'

export function useB24() {
  const ref = useRef<B24Frame | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const $b24 = await initializeB24Frame()
      if (cancelled) {
        $b24.destroy()
        return
      }
      ref.current = $b24
      setReady(true)
    })()
    return () => {
      cancelled = true
      ref.current?.destroy()
      ref.current = null
    }
  }, [])

  return { $b24: ref.current, ready }
}
```

## Frame-only services on `$b24`

Available only on `B24Frame` (not `B24Hook` / `B24OAuth`):

- `auth` — `getAuthData()`, `refreshAuth()`, `isAdmin`, `getAppSid()`, `getUniq(prefix)`.
- `parent` — `fitWindow()`, `resizeWindow(w,h)`, `resizeWindowAuto(node?, minH?, minW?)`, `setTitle(title)`, `closeApplication()`, `reloadWindow()`, `scrollParentWindow(scroll)`.
- `slider` — `getUrl(path)`, `openPath(url[, width])`, `openSliderAppPage(params)`, `closeSliderAppPage()`.
- `dialog` — `selectUser()`, `selectUsers()`. `selectAccess()` and `selectCRM()` exist but are deprecated.
- `placement` — `title`, `options`, `isSliderMode`, `getInterface()`, `bindEvent(event, cb)`, `call(command, params)`, `callCustomBind(command, params?, cb)`.
- `options` — `appGet/appSet`, `userGet/userSet`.
- `getLang()` — portal UI language.

For complete UI patterns see [ui-integrations](ui-integrations.md). For helper data (profile, currency, license) see [helper-manager](helper-manager.md).

## Anti-patterns

- Constructing `B24Frame` directly — bypasses the parent-window handshake.
- Skipping `destroy()` on unmount — leaks `postMessage` listeners across navigations.
- Calling `slider`/`dialog`/`parent` outside an iframe placement — those managers don't exist on `B24Hook` or `B24OAuth`.
- Initializing on every render — keep one `$b24` per page/component scope.

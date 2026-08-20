# B24 JS SDK Nuxt Playground

Nuxt playground app for testing `@bitrix24/b24jssdk-nuxt` integration.

## App Scopes

The application requires the following Bitrix24 REST API scopes:

- `crm`
- `entity`
- `user_brief`

## Setup

```bash
pnpm install
cp .env.example .env
# Fill in your Bitrix24 credentials in .env
```

## Run

```bash
pnpm dev
```

Opens at `http://localhost:3001`.

## Deprecation trigger (issue #331)

All four messenger methods this SDK exposes are deprecated upstream, and all
their replacements are top-window `BX.Messenger.Public.*` globals:

| deprecated (ours, iframe-reachable) | replacement (top window only) |
| --- | --- |
| `BX24.im.phoneTo(number)` | `Messenger.startPhoneCall(number[, params])` |
| `BX24.im.callTo(userId, isVideo)` | `Messenger.startVideoCall(dialogId[, withVideo])` |
| `BX24.im.openMessenger(dialogId)` | `Messenger.openChat([dialogId[, messageId]])` |
| `BX24.im.openHistory(dialogId)` | `Messenger.openChat([dialogId[, messageId]])` |

App code runs in a placement iframe with no `BX` global and a cross-origin
parent, so the documented examples cannot run where apps run.

### What this harness is for

Exactly one thing: **fire one deprecated method so the portal prints its own
deprecation notice, and make that notice attributable.** The portal already
names the replacement, so there is nothing to guess. Working out how to reach
that replacement is done from the top window, by the browser assistant — see
[MESSENGER-PROBE-BRIEF.md](MESSENGER-PROBE-BRIEF.md).

The notice looks like this, and is what the whole exercise is after:

```text
Developer: method BXIM.openMessenger is deprecated. Use method
'Messenger.openChat' from 'im.public' or 'im.public.iframe' extension.
```

`im.public.iframe` — an extension named for the iframe case — does not appear
anywhere in the published apidocs. That is the lead.

### Running it

1. `pnpm dev` here, expose it through a tunnel, install it as a placement app on
   a **test** portal.
2. Open the placement, open DevTools, and switch the console context from `top`
   to the app frame — otherwise you will see none of this.
3. Press **Show context** once. It opens nothing, and records the `SecurityError`
   that proves the replacement is unreachable from the frame.
4. Close every open slider and messenger window.
5. Press **one** method button. Read the console after the `#331 ▸` marker.
6. Repeat from step 4 for the next method.

**Every method button opens real UI.** There is no safe mode. An earlier version
of this file claimed one, batched several commands together, and guessed at
undocumented command names — the run opened sliders nobody asked for, ended on a
redirect, and reported "no handler" for a command that visibly worked. Silence
means nothing here: the `im*` bridges are fire-and-forget, so the parent runs
them and never replies. That is why the SDK sends them with an `isSafely` timer,
and why the outcome column distinguishes a real answer from the timer firing.

### Handing the result to a browser assistant

Give it [MESSENGER-PROBE-BRIEF.md](MESSENGER-PROBE-BRIEF.md) together with the
console output. The harness shows what an app can see; the assistant works in the
top window, where the answer actually lives.

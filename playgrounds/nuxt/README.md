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

## Messenger / call probe (issue #331)

Every messenger method this SDK exposes — `imPhoneTo`, `imCallTo`,
`imOpenMessenger`, `imOpenHistory` — is deprecated upstream, and all four
recommended replacements are **top-window** globals:

| deprecated (ours, iframe-reachable) | recommended replacement (top window only) |
| --- | --- |
| `BX24.im.phoneTo(number)` | `BX.Messenger.Public.startPhoneCall(number[, params])` |
| `BX24.im.callTo(userId, isVideo)` | `BX.Messenger.Public.startVideoCall(dialogId[, withVideo])` |
| `BX24.im.openMessenger(dialogId)` | `BX.Messenger.Public.openChat([dialogId[, messageId]])` |
| `BX24.im.openHistory(dialogId)` | `BX.Messenger.Public.openChat([dialogId[, messageId]])` |

App code runs in a placement iframe with no `BX` global and a cross-origin
parent, so the documented examples cannot run where apps actually run. The probe
answers whether a path exists anyway.

### Running it

1. `pnpm dev` here, expose `http://localhost:3001` through a tunnel, and install
   it as a placement app on a **test** portal.
2. Open the placement and scroll to **Messenger / call probe**.
3. Set the inputs to values that are safe to poke on that portal.
4. Press **Run probe** first — it opens nothing and changes nothing.
5. Press **Run deprecated im\*** only when you are ready for real call/chat UI to
   open on the portal.
6. Copy the transcript.

### What the first real run found (2026-08-20)

Run on `b24-kacdup.bitrix24.by`, and it changed the harness.

**Section B behaved as predicted.** `window.BX` is `undefined` inside the frame,
and both cross-origin reads fail with `SecurityError`. That is the artefact: the
documented `BX.Messenger.Public.startPhoneCall('8800…')` example cannot execute
where apps execute.

**The first version of section C drew the wrong conclusion, and the run caught
it.** Every candidate came back "silent — no handler", *including the control* —
while the messenger visibly opened on screen. The control was `imOpenMessenger`,
which is **fire-and-forget**: the parent runs it and never replies. That is
exactly why the SDK sends the `im*` bridges with an `isSafely` timer. Silence
proves nothing for that class of command, and the harness said it did.

Fixed: the control is now `getInterface`, which does reply, so it tests the reply
channel and nothing more. Judging a fire-and-forget candidate needs the
single-command buttons and your eyes on the portal.

**The console gave up the real lead.** Calling the deprecated bridge logs:

> `Developer: method BXIM.openMessenger is deprecated. Use method
> 'Messenger.openChat' from 'im.public' or 'im.public.iframe' extension.`

An extension named **`im.public.iframe`** implies an iframe-facing messenger API
exists. Searching the published apidocs for it returns nothing — so if it is the
intended migration path, it is undocumented, and that alone answers question 1 of
the issue.

### Reading the result

**Section B** — top-window reachability. Every row blocked (a `SecurityError` on
`window.parent.BX`) is the evidence that the documented
`BX.Messenger.Public.startPhoneCall('8800…')` example cannot be executed by an
app. That is the concrete artefact to attach to the upstream report.

**Section C** — the decisive part. It posts the SDK's own wire format
(`command:params:callbackKey:appSid`) with newer command names and waits for a
reply, so it distinguishes *handled* from *ignored* — which the SDK's own
`isSafely` auto-resolve cannot, because that resolves on a timer either way.

Read section C **only if the CONTROL row answered**. The control sends
`imOpenMessenger`, a command the parent is known to handle; if it is silent, the
probe is broken and the candidate rows mean nothing.

- a candidate **ANSWERED** → an undocumented migration path already exists, and
  the fix upstream is documentation, not code;
- **all candidates silent** → apps have no path today, and one has to be added.

The candidate list is a guess informed by the SDK's own naming (`imPhoneTo` is a
bare camelCase command), not a published vocabulary. A silent result is evidence
about those names, not proof that no name exists.

### Handing the result to a browser assistant

The transcript answers what an app can see. The other half — what the portal's
top window actually contains, and what its app-message handler accepts — is only
visible from the browser. [MESSENGER-PROBE-BRIEF.md](MESSENGER-PROBE-BRIEF.md) is
the brief for that: what to establish, what to conclude, and how to write it up
for the Bitrix24 developers.

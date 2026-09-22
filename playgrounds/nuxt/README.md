# B24 JS SDK Nuxt Playground

Nuxt playground app for testing `@bitrix24/b24jssdk-nuxt` integration.

## App Scopes

The application requires the following Bitrix24 REST API scopes:

- `crm`
- `entity`
- `user_brief`
- `pull` — only for `/pull-lab`; without it `pull.application.event.add` fails

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

## v3 batch from a browser (issue #455)

Route: **`/v3-batch-browser`**.

A `restApi:v3` batch sends its commands *as* the request body, so there is
nowhere inside it for a credential, and the portal's CORS preflight allows only
`origin, content-type, accept` — no `Authorization`. The SDK therefore appends
`?auth=<token>` to the URL in a browser.

Everything about that is covered by unit tests and was measured against a live
portal from Node. The one thing neither can settle is the **preflight**: whether
a real browser lets the request out. Open the page inside a Bitrix24 frame and
read the three lines it prints, plus the Network tab — an `OPTIONS` that
succeeds, then the `POST` carrying `auth=`.

A bare network error with no status is what a refused preflight looks like.

Needs a scope the batch's commands can use; the page ships with
`main.eventlog.list` and `rest.scope.list`, so swap them for whatever the app
holds.

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

`im.public.iframe` looked like the lead. It is not: tracing it on a live portal
showed six lines and 471 bytes that read `top.BX.Messenger.Public`, with no
`postMessage` anywhere — an extension for an iframe on the portal's own domain,
not for an app frame on a foreign origin.

The trace settled the rest too: the placement's command vocabulary is 22 names,
of which exactly four are messenger ones, and none of the newer names is among
them. The full findings are at the top of
[MESSENGER-PROBE-BRIEF.md](MESSENGER-PROBE-BRIEF.md).

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

## Pull lab: exercising the two protobuf codecs (`/pull-lab`)

Route: **`/pull-lab`**.

The SDK ships two protobuf implementations — the vendored protobuf.js that has
always been there, and a hand-written one — selected by an `@internal` switch.
They are held byte-identical by unit tests, but those tests derive both sides
from the same schema, so they prove the two *agree*, not that either is *right*.
Only a real portal can go further. This page is how.

### Read this before you run it

**This is a smoke test, not the fixture.**
[`pull-protobuf.md`](../../.github/contributing/pull-protobuf.md) sets the exit
criterion for deleting the vendored library as *a recorded `ResponseBatch` from
a live portal, committed as a fixture and decoded by both codecs*. Two green
runs of this page are not that. What produces the fixture is the **Capture raw
frames** button, and only on a WebSocket connection — see below.

**Two of the three traps are on the encode side, and this page barely reaches
them.** Everything except check 9 sends over REST and receives over Pull, so it
exercises decoding. Check 9 is the only one that runs `encodeRequestBatch`, and
it needs `publish_enabled` on the portal; without it the check reports `skip`
and the encode half is untested by that run.

**Test portals only.** Checks 4 and after publish to the shared application
channel, which reaches every user with this application open — as does anything
typed into the message box.

### What it does

Everything travels through `pull.application.event.add`: a `COMMAND` string, a
free-form `PARAMS` object, and an optional `USER_ID` that switches between the
shared channel and the caller's private one. That covers both directions asked
of it — the server pushing to the front, and one tab reaching the other (which
necessarily goes through the server; Pull has no browser-to-browser path).

| # | check | what a failure would mean |
| --- | --- | --- |
| 1 | the client reaches `online` | nothing below is meaningful |
| 2 | the codec is on the decode path | the portal speaks JSON-RPC; neither codec runs |
| 3 | push-server version and the protobuf gate agree | the portal moved off version 4 |
| 4 | a message on the **shared** channel comes back | the application channel is not wired |
| 5 | a message on the **private** channel comes back | `USER_ID` routing or its signature is wrong |
| 6 | a body of awkward values survives | the body was mangled in transit |
| 7 | a large body survives | a three-byte length prefix or buffer-growth bug |
| 8 | a sequence arrives complete and in order | messages lost or reordered |
| 9 | the **encode** half runs | `encodeRequestBatch` produced something the server rejected |

In an **application**, check 9 is expected to fail with
`[JSSDK_PULL_PUBLIC_IDS_UNAVAILABLE]`. That is not a defect: `sendMessage()`
needs `pull.channel.public.list` to resolve the recipients' channels, and that
method is not part of the application REST surface. Until 3.0.0 the same
situation reported **success** and the message was dropped in silence — seeing
the code is the evidence that the fix is in the build you are running.

Check 7 is the most valuable of the payload checks: a 20 kB body forces a
three-byte varint length prefix, which ordinary traffic never reaches. Check 6
is weaker than it looks and says so on the page — the body is one opaque blob on
the wire, so most of its values exercise JSON rather than protobuf.

**The transport does not decide whether the codec runs.** On a version-4 portal
long-polling also receives an `ArrayBuffer` and decodes through the same codec;
what turns the codec off is JSON-RPC on push-server 5+. Check 2 keys on that
gate, not on the WebSocket.

### Running the lab

1. Do the `## Setup` steps above first — `cp .env.example .env` and fill in the
   credentials. The page cannot run outside a Bitrix24 frame.
2. Add the `pull` scope to the application. Without it
   `pull.application.event.add` fails, and the failure reads as
   `ERROR_METHOD_NOT_FOUND` — it looks like a typo in the method name, not like
   a permissions problem.
3. `pnpm dev`, expose it through a tunnel, and install it as a placement app on
   a **test** portal with the handler URL pointing at **`<tunnel>/pull-lab`** —
   the route is not linked from the app's own navigation, so the placement is
   how you reach it.
4. Open the placement in **two portal tabs**. In one press `use vendored`, in
   the other `use lite` (the buttons reload the page, since a codec is chosen
   when the client is constructed; `?codec=lite` in the URL does the same).
5. Press **▶ Run checks** in both. Then **Ping the other tab**, and send a line
   through the message box — replies appear as lines in the **Log**, there is no
   separate chat pane.
6. If you want the fixture, press **● Capture raw frames** and run the checks
   again.
7. Press **Download JSON** in each tab and hand both files over.

### What is in the report

The connection panel, every check with its verdict, timing and the reason it
exists, the latency samples, the event log, any captured frames, and the SDK's
`getDebugInfo()` dump.

The dump masks the push JWT and the private channel id; the page additionally
masks the push host and `clientId`, which the SDK's redaction list does not
cover. What remains is still a portal fingerprint — your user id, the server
version, whether the portal is cloud or on-premise, and any portal error text a
failed check produced. **Open the report and read it before you send it**; the
page has a button for exactly that.

Captured frames are *every* frame on the connection, including other
applications' events. Look at what you captured before sharing.

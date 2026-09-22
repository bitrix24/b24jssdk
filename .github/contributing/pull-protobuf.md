# The Pull codec: why there are two, and what has to be true to drop one

`PullClient` talks to the push server over protobuf. Until now that meant a
**complete copy of protobuf.js vendored into the source** —
`src/pullClient/protobuf/protobuf.js`, 8716 lines — plus a generated model of
sixteen message types, of which the client uses four.

This file records what the wire format actually is, so the hand-written codec
beside it can be checked against something other than the library it replaces.

## What it costs

All figures are **minified and NOT gzipped**, so the over-the-wire cost is
roughly a third of them. Reproduce with:

```sh
pnpm --filter ./packages/jssdk build
echo "export { B24Hook } from './packages/jssdk/dist/esm/index.mjs'" > /tmp/a.mjs
echo "export { B24Hook, B24PullClientManager } from './packages/jssdk/dist/esm/index.mjs'" > /tmp/b.mjs
npx esbuild /tmp/a.mjs /tmp/b.mjs --bundle --minify --format=esm --outdir=/tmp/out
```

| bundle | minified |
| --- | --- |
| SDK without `B24PullClientManager` | 228 kB |
| SDK with it | 379 kB |
| **Pull's share** | **150 kB** |
| **of which the vendored `protobuf/` directory** | **94 kB** |
| — protobuf.js itself | 79 kB |
| — the generated model | 15 kB |
| the hand-written codec | 4.5 kB |

The absolute pair moves with the entry point (a `B24Frame` entry measures
higher); the **delta is what is stable**, and it is the delta that matters.

Tree-shaking works, with one real exception: `protobuf` does not appear in the
no-Pull bundle at all — but `B24HelperManager` imports `B24PullClientManager`
statically, so **any consumer of the helper ships all 150 kB whatever they
import**. The weight therefore lands on three groups: applications that use
Pull, applications that use the helper, and anyone loading the UMD build with a
`<script>` tag, where nothing can be shaken out.

## Why this is not only about bytes

`protobuf/protobuf.js` is protobuf.js **v6.8.6, compiled 26 Feb 2018**. It is
not in `package.json` and not in `pnpm-lock.yaml`, and it is listed in
`eslint.config.mjs` as ignored. The practical consequence: it is invisible to
`pnpm audit`, to Dependabot and to the linter, so the coverage `SECURITY.md`
describes does not in fact reach it. An eight-year-old parser that reads bytes
straight off a socket is the part of this change that is worth more than the
94 kB.

## Where the schema comes from

**Not from reading traffic.** It was restored from the box's own field
descriptors, `www/bitrix/modules/pull/lib/protobuf/*.php`, and is kept beside
this file as [`pull.proto`](pull.proto) — it feeds `protoc` as-is.

Facts established at the same time, worth not re-establishing:

- **API revision 19** (`modules/pull/include.php:3`) matches the `REVISION`
  constant in `client.ts`. A mismatch disconnects the client, so this is worth
  re-checking whenever the box version moves.
- **Protobuf is tied to push-server version exactly 4.** From version 5 the
  stock client switches to JSON-RPC and does not touch protobuf at all
  (`connector.js:913-921`). Both the current box and the cloud are on 4
  (`CLOUD_SERVER_VERSION = 4` — a box-side constant, not verifiable from this
  repository), and no version 5 exists yet — so protobuf
  cannot simply be deleted.
- **This SDK already implements JSON-RPC**, with the same version gate
  (`client.ts`, `isProtobufSupported()` / `isJsonRpc()`), and `json-rpc.ts`
  beside it. When a v5 server appears, that path is ready.
- **Long-polling is alive** and is the standard fallback. It is not removable.
- No field in the schema is `required`.

## The two traps

Both are places where a hand-written codec goes wrong quietly, and both are
pinned by tests.

**1. What the client receives is not what it sends.** It sends
`IncomingMessage` — `receivers`, `sender`, `body`, `expiry`, `type` — and
receives `OutgoingMessage`: no `receivers`, no `type`, an extra `created`, and
`sender` at a different field number. The vendored library hid this by
resolving the type through the schema.

**2. `created` is `fixed32`** — four little-endian bytes — and it is the only
one in the schema. Read as a varint it yields a plausible wrong number instead
of an error.

A third trap is not in the wire format at all: `client.ts` builds
`Receiver.create(...)` and `IncomingMessage.create(...)` **instances**, and
protobuf.js puts `isPrivate = false` and `type = ''` on the prototype as
defaults. An encoder that tests `!== undefined` writes two fields the library
omits. The codec therefore copies protobuf.js's own rule — own property, and
not null.

## The switch

`new PullClient({ ..., protobufCodec: 'lite' })` selects the hand-written codec,
and `usePullClient(prefix, userId, 'lite')` reaches it through the helper — which
matters, because the helper is how most callers construct a Pull client at all.
It is **opt-in, and the default stays on the vendored library**, because the
lite codec has not yet been proven against a live portal — `/pull-lab` in the
Nuxt playground is how that evidence gets collected.

The option is tagged **`@internal`**: it is the SDK's own migration switch, off
the documentation site, and it will be removed without a deprecation cycle. That
is the whole reason it can exist as a runtime option — see the carve-out in
[`package-structure.md`](package-structure.md#adding-to-the-public-surface).

A separate entry point (`@bitrix24/b24jssdk/pull-lite`) was the alternative, and
it is the only shape that banks the 94 kB **today** rather than making it
collectable: the vendored library would simply not be reachable from that entry.
It was not taken, for two reasons. `B24HelperManager` lives in the main entry and
imports the vendored `PullClient` statically, so the most common way of using
Pull would not have been covered without duplicating the helper too; and the UMD
build is a single file with no subpaths, so `<script>` users would have been left
behind either way. Revisit this if the lite codec is proven but the vendored one
still has to ship for some other reason — that is the case the subpath answers
and the option does not.

Until then both ship, and the honest accounting is that this **costs** rather
than saves: measured the same way as the table above, the Pull bundle went from
375 kB to 379 kB — **+4 kB** for the second codec. What the change buys is that
the 94 kB becomes collectable: with `protobufCodec: 'lite'` the vendored library
is no longer reachable from the encode or the decode path, so deleting it is a
one-line change rather than a rewrite. Measured by stubbing the vendored import
out of `dist`, the same bundle drops from 379 kB to **285 kB**.

## How the two are held together

| script | what it proves |
| --- | --- |
| `pnpm run pull:test-codec` | the two codecs agree, and the switch selects them |

`protobuf-lite-differential.unit.spec.ts` encodes the same value both ways and
compares bytes, and decodes library-produced bytes both ways and compares
results. `protobuf-codec-switch.unit.spec.ts` pins that the default is the
vendored path and that the option reaches **both** the encode and the decode
call site — they are separate, and wiring one and forgetting the other would
give a client that writes with one codec and reads with the other.

When the vendored library is deleted, the differential test loses its oracle.
Convert it then into golden vectors from the fixtures it already carries; do not
simply delete it.

### What the differential test cannot catch

Both codecs were derived from the same descriptors, so the suite proves they
**agree**, not that they are **right**. A wrong field number in the restored
schema is reproduced identically on both sides and stays green — if
`OutgoingMessage.created` were really at a different number, or `sfixed32`
rather than `fixed32`, nothing here would say so. `pull.proto` is checked by
eye against the generated `model.js`, not by code; nothing parses it.

That class of bug is only closed by bytes from a real server. The exit criterion
for dropping the vendored library is therefore **not** a green suite: it is a
recorded `ResponseBatch` from a live portal, committed as a fixture and decoded
by both codecs.

**That fixture now exists.** `test/integration/pull/fixtures/response-batch-frames.json`
holds two frames captured by `/pull-lab` from a push-server v4 portal over a
binary WebSocket — one small, one of 20 424 bytes whose body passes the
three-byte length prefix. `real-portal-frames.unit.spec.ts` decodes both with
both codecs and compares what the client reads. They agree.

The comparison is deliberately narrow, and that matters. An earlier version
normalised every field with `??`, which erased proto2 **presence** — the one
property a proto2 codec gets wrong — and reported agreement on frames where the
codecs genuinely differ. `Sender.id` is absent on the wire in every frame:
protobuf.js leaves it absent, the lite codec materialises an empty
`Uint8Array`. That divergence is deliberate (#552 made the lite codec do it so
`decodeId(undefined)` could not drop a whole batch) and is now **pinned by its
own case** rather than smoothed away.

The fixture's own `knownGaps` field lists what it does not cover, and
`regenerating` says how to make another one — including that the hostname
substitution must be equal in length, because a shorter replacement invalidates
four nested length prefixes and the frame stops parsing. The largest gaps:
it is **decode-side only** (the encode half has never run against a portal, see
below); no `channelStats` / `serverStats` frame was ever emitted, so the `oneof`
rests on the differential suite; every message carries all four scalars, so the
decode defaults need a synthetic case; and the bodies are ASCII, so multi-byte
UTF-8 decoding is not exercised by real bytes at all.

`/pull-lab` in the Nuxt playground is what produces it — see
[`playgrounds/nuxt/README.md`](../../playgrounds/nuxt/README.md). Two things
about it are worth knowing before reading a report it produced:

- Its **Capture raw frames** button is the part that makes the fixture. The rest
  of the page reports decoded results, which are a portal smoke test and not the
  criterion above.
- It sends over REST and receives over Pull, so it exercises **decoding**. Its
  encode check reaches `encodeRequestBatch` through `PullClient.sendMessage()`
  — but measured on a live portal, that path cannot complete in an application
  at all: `sendMessage()` needs `pull.channel.public.list` to resolve the
  recipients' channels, and that method is not part of the application REST
  surface. Bitrix24's own documentation says an application's Pull client is
  **receive-only**: the back end puts messages into the channel with
  `pull.application.event.add`, the front end subscribes.

  So the encode half of the codec has no route to a portal from an application,
  and two of the three traps above sit on that half. That is a limit of the
  evidence, not something a better harness fixes.

  Finding that out took a while, because the SDK reported the failed publish as
  a success — two defects fixed alongside this, pinned by
  `publish-failure-is-reported.unit.spec.ts`: `sendMessageBatch` started the
  channel lookup and dropped the promise, and `ChannelManager.getPublicIds`
  caught the REST refusal and resolved an empty map, so the message was encoded
  with no receivers and the server dropped it in silence.

### Known divergences from protobuf.js

Both are outside anything the push server sends, and are recorded so they are
not rediscovered as bugs:

- **Lone surrogates in a body.** `TextEncoder` substitutes U+FFFD; protobuf.js's
  own UTF-8 writer emits the unpaired surrogate bytes. **Measured on a live
  portal, the question never arises**: a lone surrogate in the payload makes
  `pull.application.event.add` fail with `Wrong authorization data` — the
  request is refused before anything is published, so neither codec sees it.
  `/pull-lab` keeps a check for it, on its own, because when it shared the
  fidelity battery it failed that whole check and hid fourteen values that
  passed.
- **Sign extension.** The codec reads `uint32` for every numeric field in the
  schema, which is what the schema declares. It has no `int32` reader, so a
  negative value — which the schema cannot express — would not round-trip.

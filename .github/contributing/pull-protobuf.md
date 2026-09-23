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

## The three traps

All three are places where a hand-written codec goes wrong quietly, and all
three are pinned by tests. The first two are in the wire format; the third is
not, which is why it reads differently from the other two. Worth knowing which
side each falls on: trap 1 is reachable from both directions, trap 2 is
decode-only (`created` does not exist on `IncomingMessage` at all), and trap 3
is the only encode-only one — which is why `/pull-lab`, whose encode check is
its weakest, can say so little about it.

**1. What the client receives is not what it sends.** It sends
`IncomingMessage` — `receivers`, `sender`, `body`, `expiry`, `type` — and
receives `OutgoingMessage`: no `receivers`, no `type`, an extra `created`, and
`sender` at a different field number. The vendored library hid this by
resolving the type through the schema.

**2. `created` is `fixed32`** — four little-endian bytes — and it is the only
one in the schema. Read as a varint it yields a plausible wrong number instead
of an error.

**3. A trap that is not in the wire format at all.** `client.ts` builds
`Receiver.create(...)` and `IncomingMessage.create(...)` **instances**, and
protobuf.js puts `isPrivate = false` and `type = ''` on the prototype as
defaults. An encoder that tests `!== undefined` writes two fields the library
omits. The codec therefore copies protobuf.js's own rule — own property, and
not null.

## The switch

`new PullClient({ ..., protobufCodec: 'lite' })` selects the hand-written codec,
and `usePullClient(prefix, userId, 'lite')` reaches it through the helper — which
matters, because the helper is how most callers construct a Pull client at all.
It is **opt-in, and the default stays on the vendored library**, because R2,
R3 and R4 below are open: the lite codec has not been shown to agree with
`model.js` across the reachable input space, nor to cope with malformed input
the same way, nor has its one deliberate divergence been signed off. That
evidence comes from fuzz differentials, not from a portal; `/pull-lab` collects
the separate, weaker portal evidence.

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

That class of bug is closed by bytes from a real server, or by the schema
itself. The schema has now been **examined**, which is not the same as closed,
and the distance between those two words is the point of this paragraph.

A third-party audit of an on-prem stand read the push server's own `.proto`
files — `request`, `receiver`, `sender`, `response`, `notification`, under
`lib/models/`, the same sources `pbjs` generates both the server's
`lib/models/index.js` and Bitrix24's client `model.js` from. **That report is
not in this repository and cannot be checked from here.** Two things about its
provenance have to travel with every claim drawn from it:

- it names the stand as push-server **2.0.0**, `pull` module 26.100.0, while
  this document elsewhere uses "push-server version" to mean the PROTOCOL
  number and states that protobuf is tied to version exactly 4. Whether 2.0.0
  is a package version of a daemon implementing protocol 4, or a protocol 2
  server the SDK never speaks to, is not determinable from here;
- the same stand had publishing disabled and was not connected to Bitrix, so
  the publish path it describes was not exercised there.

With that said, the field numbers it reports match ours exactly, in both the
vendored copy and the lite codec:

```proto
message Receiver { bytes id = 1; bool isPrivate = 2; bytes signature = 3; }
```

Verified locally against `protobuf/model.js` (`Receiver.encode`, tags 10/16/26)
and `protobuf-lite/messages.ts` (`writeReceiver`). `isPrivate` is set by neither
implementation, so a `Receiver` on the wire is `{1: id, 3: signature}`, which
the report says is exactly what Bitrix24's own client sends. Their client
likewise leaves `sender` and `type` unset; the report's explanation — the server
overwrites `sender` unconditionally and `type` only feeds a statistics counter —
is one of the server-side claims that cannot be checked here.

Note what this covers and what it does not. Every message quoted is on the SEND
side, and only `Receiver` is quoted at all — the three nesting field numbers the
encoder hardcodes (`RequestBatch.requests`, `Request.incomingMessages`,
`IncomingMessagesRequest.messages`, all `1`) come from `request.proto`, which
the report does not reproduce. Nothing has been said about `OutgoingMessage`,
`Sender`, `ResponseBatch` or the `oneof`, which is where the worked example
above (`created` as `fixed32` rather than `sfixed32`) actually lives. The
recorded fixture does not help there either: both codecs decode it with the
same descriptors, so it proves they agree, and `fixed32` and `sfixed32` are
four bytes either way.

So the exit criterion for dropping the vendored library splits by WHICH RISK a
deletion actually moves:

1. **R1 — is the schema right?** Affects BOTH implementations identically, so
   deleting one moves it **not at all**: a wrong descriptor is equally wrong in
   `model.js`. That, and not the audit, is why R1 does not gate the deletion.
   The audit raises confidence in it on the send side; it does not close it, and
   it says nothing about the receive side.
2. **R2 — does the lite codec agree with `model.js`?** Affects only the lite
   codec, and is therefore the risk the deletion does move, in both directions.
   **Open.** `protobuf-lite-differential.unit.spec.ts` is better than a bare
   byte comparison — it also carries an unknown-field battery at every nesting
   depth, a `oneof` discriminator case, a decode-defaults case and a
   lite→library round trip — but every input in it was written by hand. That
   is a sample, not coverage, and the boundaries most likely to diverge are
   exactly the ones nobody thinks to write down.
3. **R3 — is the lite codec SAFE where the schema is silent?** Also moved by
   the deletion, and not a question about agreement: the two are allowed to
   differ there, and on `Sender.id` they deliberately do. What is not allowed
   is for the lite codec to fail where the library copes. `readSender` is the
   worked example: returning `{}` instead of materialised defaults threw inside
   `decodeId` and, because the `catch` wraps the loop rather than one message,
   took the whole batch with it — a failure-mode difference, invisible to a
   `.proto` audit and to any byte comparison of well-formed output. **Open.**

   Closed when a corpus of malformed and edge-shaped frames — truncated at
   every nesting depth, unknown fields, wrong wire types, absent fields, an
   empty batch, a length prefix that overruns — is decoded by both and the lite
   codec never throws where the library returns, and never returns where the
   library throws. That is a stopping rule rather than a feeling, and it is the
   thing to write down before anyone claims R3 is done.

4. **R4 — does the lite codec's deliberate divergence break a consumer?**
   `Sender.id` is the live case: protobuf.js leaves it absent, the lite codec
   materialises an empty `Uint8Array`, on purpose. R2 waives that by design and
   R3 is satisfied by it, so neither owns it — but a caller writing
   `if (message.sender.id)` sees a behaviour change, and after the deletion the
   lite behaviour simply IS the behaviour. **Open**, and closed by deciding
   whether each divergence is acceptable and writing it into the changelog, not
   by a test.

**The oracle disappears at the moment of deletion, and that sets the order of
operations.** Every one of R2, R3 and R4 is measured against `model.js`.
Deleting it does not reduce those risks — it removes the ability to measure
them, so all three must be closed BEFORE the deletion, not after. Converting
the differential suite into golden vectors (see above) preserves R2's oracle
only over the inputs someone already wrote down, which is the sample this same
section declines to call coverage; and R3's oracle — "where the library copes"
— cannot be frozen into vectors at all, because it is a claim about inputs
nobody has enumerated. Whatever is not settled before `protobuf/` goes stays
unsettled.

R2, R3 and R4 are closable without a portal. `client.ts` builds exactly
`{ receivers: [{ id, signature }], body, expiry }` and never sets `sender` or
`type`, so the space reachable FROM THE SDK TODAY is small enough to cover
rather than sample — but `sendMessage()` is public API, and fuzzing it closes
R2 for the current call site, not for the codec's whole surface. Fuzzing that
space against `model.js`, in both directions and including malformed input, is
what remains. See #559.

The audit also reports that the push server does not exclude the sender when it
broadcasts — so an echo to one's own channel would be expected rather than
hoped for — and that a frame it refuses is answered by a socket CLOSE carrying
a code: `4013` unparseable, `4017` no receivers, `4020` private channel, `4021`
bad signature, among others, now named in `CloseReasons`. `/pull-lab` records
the closures it observes.

That is worth having and it is not a test. A close code is evidence when it
arrives; its ABSENCE proves nothing about the encoder, because only a frame the
server cannot PARSE trips `4013`. Write a scalar at an UNUSED field number and
the frame still parses — proto2 skips what the descriptor does not declare —
addresses valid receivers, and is broadcast with an empty body. No close, no
echo anyone can match, nothing to see. The silent-drop reading this document
has used throughout survives for exactly that class.

The caveat on the caveat: that holds for a number the descriptor does not
declare. Collide with one it does, and the outcome depends on the two wire
types — a generated decoder switches on the field number alone
(`model.js`, `switch (tag >>> 3)`) and reads by the DECLARED type, so it is
the mismatch that decides, not the decoder:

- a **varint written where a length-delimited field is declared** reads the
  value as a length prefix. `expiry` is a timestamp-scale number, so it
  overruns the buffer immediately and `4013` fires. Reliable, and the case
  worth remembering;
- a **string written at `expiry`'s number** has its length byte consumed as
  the value and the stream desynchronises. That usually derails, but a short
  or favourably shaped body can re-align and parse to the end;
- **length-delimited onto length-delimited** parses cleanly every time. And
  four of `IncomingMessage`'s five fields are length-delimited, so most ways
  of misplacing one of them land here.

So the silent bucket is the larger one for this schema, which is the whole
reason a quiet run cannot be read as a passing one.

**The recorded-frames fixture now exists.** `test/integration/pull/fixtures/response-batch-frames.json`
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
it is **decode-side only** (the ENCODE direction has since run against a
portal, but no encoded frame has ever been read BACK — the strongest evidence
available, and not what the deletion waits on; see the risk split above); no `channelStats` / `serverStats` frame was ever emitted, so the `oneof`
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
  encode check reaches the encoder through `PullClient.sendMessage()`, which
  needs `pull.channel.public.list` to resolve the recipients' channels — and
  that method is not part of the application REST surface. Bitrix24's own
  documentation says an application's Pull client is **receive-only**: the back
  end puts messages into the channel with `pull.application.event.add`, the
  front end subscribes.

  That was first written here as "the encode half has no route to a portal from
  an application". It is not true, and the correction is worth keeping because
  it is easy to make again. `ChannelManager` skips the lookup entirely when
  every recipient already has an unexpired cached channel, and the startup
  config call prefills that cache from `publicChannels` — which carries the
  current user's own channel. Check 9 sends to the current user. Measured on a
  live push-server v4 portal: no lookup was made, the batch was encoded under
  both codecs, and the socket accepted the frame.

  What that does **not** establish is that the bytes were right, and a later
  run with the raw-frame tap running makes that gap precise rather than
  merely suspected: across the whole 15-second window of check 9, **not one
  frame arrived on the WebSocket at all**. The tap sits on the socket, below
  every subscription, so this is no longer "the page did not see the echo" —
  nothing came back. Both codecs, same portal, same result.

  The audit report then argues away one of the two explanations: per that
  report the server does not exclude the publisher when it broadcasts, so an
  echo would have been expected, and it refuses a frame by CLOSING the socket
  rather than by silence. If both hold, the run should have produced an echo
  or a close code, and the page was recording neither — it records closures
  now. If it produces neither once closures ARE recorded, then one of those
  two server-side claims does not hold for this protocol version, which is
  itself worth knowing. None of it is checkable from here.

  (An earlier round could not have seen an echo under any circumstances: the
  lab subscribed only to `SubscriptionType.Server`, while a client-published
  message is emitted to `SubscriptionType.Client` subscribers. That was fixed
  first, which is what makes the measurement above worth anything.)

  So reading an encoded frame back would still be the strongest evidence
  available, and no route to it exists from an application today. It is not,
  however, what the deletion waits on: that is R2, R3 and R4, none of which
  needs a portal.
  Until those are closed, the vendored library stays.

  The cheap experiment that would settle the echo question without relying on
  any server-side claim: a SECOND tab, subscribed to `SubscriptionType.Client`,
  receiving a publish made by the first. If it arrives there and not in the
  publisher, the server excludes the sender; if it arrives in neither, the
  frame was refused or dropped.

  Finding that out took a while, because the SDK reported the failed publish as
  a success — two defects fixed alongside this, pinned by
  `publish-failure-is-reported.unit.spec.ts`: `sendMessageBatch` started the
  channel lookup and dropped the promise, and `ChannelManager.getPublicIds`
  caught the REST refusal and resolved an empty map, so the message was encoded
  with no receivers. That one really is silent on the client side: per the
  audit the server answers an empty `receivers` with a `4017` close, but it
  also reports the server returning early without a response when a publish
  resolves to no channels at all — and either way nothing reached the caller,
  which is what the fix addresses.

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

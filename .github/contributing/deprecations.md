# Deciding whether to deprecate

<sub>Last reviewed: 2026-08-29.</sub>

[`package-structure.md`](package-structure.md#adding-to-the-public-surface) covers **how** to
deprecate — the `@deprecated` / `@removed` tags, the `forcedLog` runtime warning,
and shipping both symbols for at least one minor. This page covers the question
that comes first: **should this be deprecated at all?**

It exists because that question was answered wrongly twice in one cycle, and
both answers had already shipped in a release changelog before anyone noticed.

## The test

> **Does a replacement exist that costs the caller nothing?**

If yes, deprecate: the caller rewrites one line, and the old surface is real
duplication worth removing. If no, you are not deprecating anything — you are
planning a breaking change, and the `@deprecated` tag makes it look routine.

Three ways to fail the test. All of them count as *no*.

### 1. No replacement exists

The obvious one, and the one most likely to be missed, because a member that is
clearly tied to something old *feels* replaceable.

`AjaxResult.getTotal()` reads the `restApi:v2` envelope's `total` field. Under
`restApi:v2` there is no other way to obtain a row count: `SuccessPayload` omits
`total` by design, the list helpers iterate without exposing it, and the
`aggregate` action exists for `restApi:v3` only. Removing it would have turned
"how many deals match this filter?" into "download every deal and count them" —
a capability regression inside what read as a cleanup.

Before tagging anything, write down the line of code the caller replaces it
with. If you cannot write that line, stop.

### 2. The replacement does not cover the same ground

A replacement that works somewhere else is not a replacement.

A `restApi:v3`-only replacement does nothing for a `restApi:v2` caller.
`restApi:v2` is where most of the Bitrix24 REST surface still lives, and
Bitrix24's migration to `restApi:v3` is real but slow — so a schedule written as
though the migration were finished deletes methods that work today, for the
majority of callers.

**"Tied to `restApi:v2`" is not by itself a reason to remove anything**, and will
not be for as long as `restApi:v2` is the version most portals answer on.

### 3. The replacement is not proven

`@experimental` means nobody has run it. It cannot be cited as the replacement in
a deprecation notice — you would be telling callers to migrate onto something you
have not verified works.

`actions.v3.aggregate` was written from the published reference and has never
been run against a live portal (#113 is where that gets settled). It was named as
the successor to `getTotal()` regardless. That is the third failure mode, and it
is the easiest to talk yourself past, because the replacement exists in the
source tree and can be pointed at.

## Judge per member, not per batch

The failure that produced this page was not a mistake of fact about any single
method. It was **batching**.

Five `AjaxResult` paging members were tagged together on a shared trait — "reads
a `restApi:v2` envelope field" — which is true of all five and decisive for none
of them. That criterion describes the protocol, not the user.

**All five were eventually kept** (#408). But they are not alike, and treating
them as one thing is what went wrong:

| Members | What they do | Against the test |
| --- | --- | --- |
| `isMore()` / `hasMore()` / `getTotal()` | only report what the portal sent | fail it outright — nothing replaces reading a field |
| `getNext()` / `fetchNext()` | issue a follow-up request, duplicating `callList` / `fetchList` | arguably pass it — but deleting them would still break working `restApi:v2` code for no gain, so they stay too |

The lesson is not where the line landed. It is that **a shared trait is a reason
to review a group together, never to decide it together.** Apply the test to each
member and write down the answer for each.

The same batch also contained `callMethod`, `callListMethod`, `fetchListMethod`,
`callBatch`, `callBatchByChunk`, `batchSize`, and `LoggerBrowser` / `LoggerType`
— all of which pass the test cleanly, each mapping one-for-one onto
`actions.v{2,3}.*` or `LoggerFactory`, both of which work under either protocol
version. The batch was not wrong about everything. It was wrong about the members
nobody checked individually.

## The cost of getting it wrong

`@deprecated` in a released version is **published**. Walking it back is not free:

- a changelog entry saying the removal set narrowed, since the released entry is
  history and does not get edited;
- a migration-guide section explaining the reversal to someone who is mid-migration
  and needs to know whether their work was wasted;
- every doc, skill file and JSDoc block that repeated the claim.

PR #408 had to write all three. That cost belongs on the near side of the decision:
it is cheaper to check whether a replacement exists than to explain later why it
did not.

A related asymmetry worth knowing: a **stale** deprecation is embarrassing, but a
**wrong** one breaks working code. When unsure, ship the tag one release later
rather than one release earlier.

## If the answer is "keep it"

Keeping a member is not the same as saying nothing about it. Record:

- **What it is scoped to.** If it only works under one protocol version, say so
  in the JSDoc, and say what it returns under the other — including whether that
  value is distinguishable from a real answer. `getTotal()` returns `0` under
  `restApi:v3` because the field is absent, which is not "no rows matched"; a
  caller who does not know that will read it as one.
- **The exit condition.** "Stays for as long as `restApi:v2` does" is fine as a
  decision and useless as a promise unless it names a trigger. Which event would
  make you revisit? Write it down, and note that the trigger may differ between
  members that look alike — a member with a working replacement is waiting on the
  protocol alone, while one without is also waiting on a replacement appearing.
- **Tests.** A member slated for deletion tends to have no coverage, because
  nobody pins something that is leaving. The moment it is staying, its behaviour
  is a contract — including whatever it does in the situation that motivated the
  deprecation in the first place.

## Related

- [`package-structure.md`](package-structure.md#adding-to-the-public-surface) — the mechanics,
  once the decision is made
- [`docs-fork.md`](docs-fork.md) — the same pattern applied to a different kind of
  decision record: what is deliberate, why, and what would end it
- #409 — where this page was asked for, with the full account
- #408 — the walk-back that prompted it; #277 — what remains scheduled for `3.0.0`

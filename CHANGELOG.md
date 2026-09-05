# Changelog

## [2.3.0](https://github.com/bitrix24/b24jssdk/compare/v2.2.0...v2.3.0) (2026-09-05)


### Features

* **core:** support `Idempotency-Key` on `restApi:v3` calls ([#475](https://github.com/bitrix24/b24jssdk/issues/475)) ([d6f81c8](https://github.com/bitrix24/b24jssdk/commit/d6f81c81ba2254fdcb211e8b6a5872958b4e517f)), closes [#462](https://github.com/bitrix24/b24jssdk/issues/462)
* **scripts:** check the API Reference index against itself ([#458](https://github.com/bitrix24/b24jssdk/issues/458)) ([5c53c9e](https://github.com/bitrix24/b24jssdk/commit/5c53c9e4698bde7302712636030111c868c9d2ad)), closes [#384](https://github.com/bitrix24/b24jssdk/issues/384)
* **scripts:** compile the ts fences in the contributing guides ([#448](https://github.com/bitrix24/b24jssdk/issues/448)) ([6e8c85f](https://github.com/bitrix24/b24jssdk/commit/6e8c85f4a10cbfea86f8f99f518427a252ac4112)), closes [#435](https://github.com/bitrix24/b24jssdk/issues/435)
* **scripts:** hold v3 method names against a portal's own OpenAPI document ([#471](https://github.com/bitrix24/b24jssdk/issues/471)) ([36dd2e6](https://github.com/bitrix24/b24jssdk/commit/36dd2e6dcaaa2a946305fd62eeb76f244a135bc3)), closes [#463](https://github.com/bitrix24/b24jssdk/issues/463) [#464](https://github.com/bitrix24/b24jssdk/issues/464)
* **scripts:** type-check the JSDoc [@example](https://github.com/example) blocks in the SDK source ([#443](https://github.com/bitrix24/b24jssdk/issues/443)) ([f5e6a76](https://github.com/bitrix24/b24jssdk/commit/f5e6a76f76848ff995e3ee340645f956bf3e6a00)), closes [#439](https://github.com/bitrix24/b24jssdk/issues/439)


### Bug Fixes

* **core:** keep a response without a time block from throwing ([#456](https://github.com/bitrix24/b24jssdk/issues/456)) ([1f90b2b](https://github.com/bitrix24/b24jssdk/commit/1f90b2b57c24bf218453a5b5249ceabbe7ecefdd))
* **core:** mask the webhook secret when it appears in a URL path ([#468](https://github.com/bitrix24/b24jssdk/issues/468)) ([4601238](https://github.com/bitrix24/b24jssdk/commit/4601238f7ef5b10153fa55b9e8f626b3d678be7b))
* **core:** wrap a response body that has no result key into result ([#469](https://github.com/bitrix24/b24jssdk/issues/469)) ([d917cee](https://github.com/bitrix24/b24jssdk/commit/d917ceef40069e383249eee8bf5b3c66e57d30dc))
* **docs:** stop README-AI.md teaching the removed LoggerBrowser, and gate it ([#446](https://github.com/bitrix24/b24jssdk/issues/446)) ([dfc115a](https://github.com/bitrix24/b24jssdk/commit/dfc115a7e4bedd4cff207acca3bf66bc80d2cb2a)), closes [#277](https://github.com/bitrix24/b24jssdk/issues/277)
* **recipes:** validate the portal URLs an install event carries ([#452](https://github.com/bitrix24/b24jssdk/issues/452)) ([5b1bf78](https://github.com/bitrix24/b24jssdk/commit/5b1bf78c8f6d0ec866a788a7523810d35e9acffe)), closes [#389](https://github.com/bitrix24/b24jssdk/issues/389)
* **scripts:** anchor the fence pattern, which was miscounting an inline marker ([#442](https://github.com/bitrix24/b24jssdk/issues/442)) ([638c977](https://github.com/bitrix24/b24jssdk/commit/638c977ca97f008a2b6165f7135039908165d5a1)), closes [#441](https://github.com/bitrix24/b24jssdk/issues/441)


### Dependencies

* bump grammy and openai in the recipes package ([#444](https://github.com/bitrix24/b24jssdk/issues/444)) ([5bbfefd](https://github.com/bitrix24/b24jssdk/commit/5bbfefd3715d9b3f827ba26f1f848c8c227bd3e9))
* raise the audit floors that new advisories moved past ([#453](https://github.com/bitrix24/b24jssdk/issues/453)) ([67a11b9](https://github.com/bitrix24/b24jssdk/commit/67a11b9e5034a6dff6298c8eb8ad97c662af8f0c))
* take the tooling half of the grouped bump, leave the docs app alone ([#470](https://github.com/bitrix24/b24jssdk/issues/470)) ([2abf5fc](https://github.com/bitrix24/b24jssdk/commit/2abf5fc3b05c0f9d07a75b6cbb943ff4d882c676)), closes [#457](https://github.com/bitrix24/b24jssdk/issues/457)


### Changed

* **ci:** drop the typecheck pass the measurement showed was redundant ([#436](https://github.com/bitrix24/b24jssdk/issues/436)) ([778ba82](https://github.com/bitrix24/b24jssdk/commit/778ba829b7efda1517d992f0f07fe9b930d40dad)), closes [#419](https://github.com/bitrix24/b24jssdk/issues/419)
* **scripts:** one directory walk, with the symlink guard the copies lacked ([#437](https://github.com/bitrix24/b24jssdk/issues/437)) ([576c365](https://github.com/bitrix24/b24jssdk/commit/576c36525b84eb68342ba77f56d1a49ac87a935f)), closes [#418](https://github.com/bitrix24/b24jssdk/issues/418)
* **scripts:** one reporter, and GitHub annotations for every check ([#450](https://github.com/bitrix24/b24jssdk/issues/450)) ([134e820](https://github.com/bitrix24/b24jssdk/commit/134e8208b30b4dcb73ee98a33faa9e784071a160)), closes [#418](https://github.com/bitrix24/b24jssdk/issues/418)


### Docs

* **contributing:** re-measure the typecheck coverage table and point AGENTS.md at it ([#447](https://github.com/bitrix24/b24jssdk/issues/447)) ([33ef7df](https://github.com/bitrix24/b24jssdk/commit/33ef7df3b5f09ca0c70e13cb6c66c015d82d4fff)), closes [#419](https://github.com/bitrix24/b24jssdk/issues/419)
* **contributing:** retire the argument [#439](https://github.com/bitrix24/b24jssdk/issues/439) disproved, and refresh the counts ([#451](https://github.com/bitrix24/b24jssdk/issues/451)) ([ea6f38c](https://github.com/bitrix24/b24jssdk/commit/ea6f38ca74ca2102233053783910ad75ce6048b1))
* **core:** agree where a JSDoc block ends, and cut the two longest ([#440](https://github.com/bitrix24/b24jssdk/issues/440)) ([cbdb6fe](https://github.com/bitrix24/b24jssdk/commit/cbdb6fe2766cc94880c6b97b6820a5fb34784f70)), closes [#420](https://github.com/bitrix24/b24jssdk/issues/420)
* **frame:** state the portal-side contract for closing a slider app ([#449](https://github.com/bitrix24/b24jssdk/issues/449)) ([dd04808](https://github.com/bitrix24/b24jssdk/commit/dd04808125ea793805a264fa1270827280dd6bde)), closes [#328](https://github.com/bitrix24/b24jssdk/issues/328)
* **releasing:** decide the release body does not mirror the changelog ([#434](https://github.com/bitrix24/b24jssdk/issues/434)) ([c339d75](https://github.com/bitrix24/b24jssdk/commit/c339d75f0f25ccebbb67680e33b4763cd7968be9))
* **releasing:** write the community post about the reader, not about us ([#432](https://github.com/bitrix24/b24jssdk/issues/432)) ([8206b6e](https://github.com/bitrix24/b24jssdk/commit/8206b6ee3fbd490918d264d75e0ee1b901657e1e))
* **skills:** point the filtering and recipes skills at the field-list guide ([#474](https://github.com/bitrix24/b24jssdk/issues/474)) ([a33d654](https://github.com/bitrix24/b24jssdk/commit/a33d654ecf6f0109cfc0a6111b146ec5502e4dd7))
* **v3:** document *.field.list, and state the camelCase rule once ([#473](https://github.com/bitrix24/b24jssdk/issues/473)) ([9a70742](https://github.com/bitrix24/b24jssdk/commit/9a70742006fbec4376454bcad8ae7141c7780940)), closes [#466](https://github.com/bitrix24/b24jssdk/issues/466)

## [Unreleased]

### Bug Fixes

* **A response body with no `result` key now reaches you instead of being dropped.** `AjaxResult.getData()` rebuilds the payload from two named keys, so a body carrying neither was projected away and a *successful* call handed back `{ result: undefined, time: undefined }`. Such a body is wrapped now: the whole body becomes `result`.

    `rest.documentation.openapi` answers exactly that way — the OpenAPI document at the top level, no envelope — which is the method the docs call the source of truth for v3 discovery, so `getData()?.result` on the discovery page now returns the document it always promised.

    **Worth knowing if you wrote a guard around the old behaviour:** where an envelope-less body used to make `getData()!.result` `undefined`, it is now the body. A check shaped like `if (!getData()?.result)` will no longer treat such a response as empty. An error body is unaffected — it is recognised before the wrap and stays an error.

    `SuccessPayload.time` and `GetPayload.time` are **optional** as a consequence: a wrapped body has no `time`, and nothing is invented to fill it. If you read a field off `time`, guard it — the compiler will now say so.

    Also fixed on the same path: an HTTP 200 with a `null` body threw a `TypeError` from the success-path log line and from `getData()`, which the request path re-wrapped as `JSSDK_UNKNOWN_ERROR`. It now comes back as an ordinary empty success.

* **A webhook URL in a log line no longer shows its secret.** The redactor masks a credential that is an object key or half of a `key=value` query pair. A Bitrix24 webhook secret is neither — it is a path segment, `/rest/<userId>/<secret>/` (and `/rest/api/<userId>/<secret>/` under `restApi:v3`) — so it stayed readable while the rest of the line was masked.

    It shows up there because the redactor runs over response bodies as well as over the params you sent, and a portal method can return such a URL: `rest.deferredbatch.downloadresult` answers with a `downloadUrl` built from the calling webhook. The secret segment is masked now; the host and the user id stay readable, so the line is still useful for debugging.

    Applies to `B24Hook` with a logger wired at `info`. Matching is case-insensitive and covers both API versions.

## [2.2.0](https://github.com/bitrix24/b24jssdk/compare/v2.1.0...v2.2.0) (2026-08-29)


### Deprecations

* **core:** the `AjaxResult` paging members — `isMore()`, `hasMore()`, `getTotal()`, `getNext()`, `fetchNext()` — are **no longer scheduled for removal**, and none of them is `@deprecated` any more. `2.1.0` announced all five as going away in `3.0.0`; that plan is withdrawn.

    **What to do: nothing.** If you already moved to `actions.v{2,3}.{callList,fetchList}`, stay there — those helpers hide the offset bookkeeping and are the only ones that work under `restApi:v3`, so the migration was not wasted. If you have not moved, you no longer have to; and for a row count under `restApi:v2` you should not, because nothing else answers it.

    **Why it was withdrawn.** The removal set was assembled on the criterion "reads a `restApi:v2` envelope field", which describes the protocol rather than the user. `restApi:v2` is where most of the Bitrix24 REST surface still lives and is not going away soon, so deleting methods that work there today breaks running code with no replacement on offer. `getTotal()` is the sharpest case: `SuccessPayload` omits `total` by design, the list helpers iterate without exposing it, and the `aggregate` action (`count` / `countDistinct`) is `restApi:v3`-only *and* `@experimental`, never verified against a live portal — removing it would have left a v2 consumer counting rows by downloading all of them. What remains scheduled for `3.0.0` under #277 is the surface that genuinely duplicates a replacement one-for-one: `callMethod`, `callListMethod`, `fetchListMethod`, `callBatch`, `callBatchByChunk`, `AbstractB24.batchSize`, and `LoggerBrowser` / `LoggerType`.

    **All five are `restApi:v2`-only**, which they always were, and their v3 behaviour is deliberately not uniform. `getTotal()` returns `0` and `isMore()` returns `false` **because the field is absent** — not because the count is zero or the pages ran out, so do not branch on either. `getNext()` / `fetchNext()` throw `JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3`, because a silent `false` would be indistinguishable from "last page".

    One correction to the `2.1.0` entry below while it is in view: its "emits a runtime deprecation warning" applies to the `AbstractB24` shortcuts and `LoggerBrowser`. The `AjaxResult` methods never emitted one.

### Notes on this release

* **New public surface: `AjaxError.validation` and the `ValidationDetail` type (#423).** A `restApi:v3` validation failure comes back with an array naming the field that failed. The SDK dropped it, so a caller building a form could show a banner but could not mark the offending input. It now reaches you on both the soft and the hard error path:

    ```ts
    for (const error of response.getErrors()) {
      if (error instanceof AjaxError) {
        for (const detail of error.validation ?? []) {
          markFieldInvalid(detail.field, detail.message)
        }
      }
    }
    ```

    Absent under `restApi:v2`, which has no equivalent, and absent when v3 reported an error without one. `field` and `message` are both optional, because the portal's own shape says so. `toJSON()` includes it when present — that is where the field name matters most, since the message folds the validation *messages* in but not the `field` each came from — and an error without one serializes exactly as before. Each entry is run through the same redactor as `requestInfo.params`, so a key named `token` or `password` inside an entry is masked; portal prose is untouched. Verified against a live portal.

* **Compile-time break for TypeScript consumers (#426).** Every action option type carried an index signature, so the compiler accepted **any** top-level key on **any** action — `batch.make({ calls, isHaltOnError: false })` type-checked, ran, and dropped the flag, because the transport reads it from `options`. A dropped `returnAjaxResult` is the one that bites: `isSuccess` on a raw payload is `undefined`, so a batch where every command succeeded reads as one where every command failed.

    **Nothing changes at runtime** — those keys were read by nobody. But code that passed an extra top-level key, or a typo like `customKeyForResults`, now fails to compile; move the key where it belongs or remove it. The four batch actions additionally log a warning for callers TypeScript never sees. `batchByChunk` deliberately says nothing about `returnAjaxResult`: it supports the option in neither position.

### Features

* **core:** an unknown option on any action is now a compile error ([#429](https://github.com/bitrix24/b24jssdk/issues/429)) ([3e6510b](https://github.com/bitrix24/b24jssdk/commit/3e6510bd25a96d652da1ce920ce1701933ef2ac2)), closes [#426](https://github.com/bitrix24/b24jssdk/issues/426) [#428](https://github.com/bitrix24/b24jssdk/issues/428)
* **docs:** a Content Security Policy for the documentation site ([#417](https://github.com/bitrix24/b24jssdk/issues/417)) ([a05e356](https://github.com/bitrix24/b24jssdk/commit/a05e3567fc9536c7a1ab1b0527d1ebc7cecfcf53)), closes [#399](https://github.com/bitrix24/b24jssdk/issues/399) [#418](https://github.com/bitrix24/b24jssdk/issues/418)
* **skills:** typecheck the skill code fences; export the missing B24HelperManager ([#404](https://github.com/bitrix24/b24jssdk/issues/404)) ([2d75bee](https://github.com/bitrix24/b24jssdk/commit/2d75bee9f3161658ed788efa51033727b36ba198)), closes [#402](https://github.com/bitrix24/b24jssdk/issues/402)


### Bug Fixes

* **ci:** the gate went green when prepare failed, having run no checks ([#416](https://github.com/bitrix24/b24jssdk/issues/416)) ([fc37774](https://github.com/bitrix24/b24jssdk/commit/fc37774c5a029a59e140fe7017febc64b7d40c2a)), closes [#415](https://github.com/bitrix24/b24jssdk/issues/415)
* **core:** a documented filter shape crashed the v3 list actions. ([da71a77](https://github.com/bitrix24/b24jssdk/commit/da71a77a4722fa54f207a02f30dfb8836c2d39e5))
* **core:** honest return types for Result chaining and the batch envelope ([#395](https://github.com/bitrix24/b24jssdk/issues/395)) ([c7783c3](https://github.com/bitrix24/b24jssdk/commit/c7783c3645f6bdcf98b4b4ceb0a213a9741c404b))
* **core:** reject a non-array filter in v3 callList/fetchList before it crashes mid-page ([#403](https://github.com/bitrix24/b24jssdk/issues/403)) ([da71a77](https://github.com/bitrix24/b24jssdk/commit/da71a77a4722fa54f207a02f30dfb8836c2d39e5))
* **core:** restApi:v3 validation errors reach the caller with the field name ([#424](https://github.com/bitrix24/b24jssdk/issues/424)) ([9d54855](https://github.com/bitrix24/b24jssdk/commit/9d54855d97eb8abead2acc3e0c427264faf38839)), closes [#423](https://github.com/bitrix24/b24jssdk/issues/423)
* **core:** the AjaxResult paging surface is no longer scheduled for removal ([#408](https://github.com/bitrix24/b24jssdk/issues/408)) ([923680e](https://github.com/bitrix24/b24jssdk/commit/923680e2cef851c7b9f41e2c29872b167e9ef9ac))
* **core:** throw SdkError, not bare Error, across the public entry points ([#382](https://github.com/bitrix24/b24jssdk/issues/382)) ([7ccd929](https://github.com/bitrix24/b24jssdk/commit/7ccd929c0431e401cf23bc2966fae7ae98e917df))
* **deps:** make the workspace catalog the single source of axios' version ([#365](https://github.com/bitrix24/b24jssdk/issues/365)) ([b4907e7](https://github.com/bitrix24/b24jssdk/commit/b4907e7d82197d1202dcdca58658a0852ee8b9e8)), closes [#332](https://github.com/bitrix24/b24jssdk/issues/332)
* **docs:** bundle prettier instead of executing six modules from a CDN ([#407](https://github.com/bitrix24/b24jssdk/issues/407)) ([2f1a8f9](https://github.com/bitrix24/b24jssdk/commit/2f1a8f966066a20ca3fd2b49b0b9d02982a13b39)), closes [#399](https://github.com/bitrix24/b24jssdk/issues/399)
* **docs:** code-example indentation was stripped with a hard-coded `.slice(2)`, ([a5b9538](https://github.com/bitrix24/b24jssdk/commit/a5b95382df68a1353b2dd6b3602dcdd5aeac5fcf))
* **docs:** prettier worker could hang the page, and the dedent assumed two spaces ([#398](https://github.com/bitrix24/b24jssdk/issues/398)) ([a5b9538](https://github.com/bitrix24/b24jssdk/commit/a5b95382df68a1353b2dd6b3602dcdd5aeac5fcf))
* **docs:** the four correctness items in the code-example subsystem ([#393](https://github.com/bitrix24/b24jssdk/issues/393)) ([2d79b7e](https://github.com/bitrix24/b24jssdk/commit/2d79b7e2eda8b343d17ff0f32d5620501404cf86))
* **docs:** the prettier worker could leave a page waiting forever. ([a5b9538](https://github.com/bitrix24/b24jssdk/commit/a5b95382df68a1353b2dd6b3602dcdd5aeac5fcf))
* **docs:** the two prettier versions had drifted. The worker hard-coded `3.7.4` ([a5b9538](https://github.com/bitrix24/b24jssdk/commit/a5b95382df68a1353b2dd6b3602dcdd5aeac5fcf))
* **frame:** MessageManager no longer throws on foreign traffic or strands sends ([#367](https://github.com/bitrix24/b24jssdk/issues/367)) ([7b13d02](https://github.com/bitrix24/b24jssdk/commit/7b13d026c4d7b55540551bd0de00490e3b9ef739)), closes [#146](https://github.com/bitrix24/b24jssdk/issues/146)
* **skills:** collapse duplicated recipe helpers and guard against new copies ([#386](https://github.com/bitrix24/b24jssdk/issues/386)) ([e980112](https://github.com/bitrix24/b24jssdk/commit/e98011273c6084a2d57d962342764912b6ef5cc3))
* **skills:** stop teaching the removed LoggerBrowser, and fix the logger misuse it left behind ([#401](https://github.com/bitrix24/b24jssdk/issues/401)) ([50a0e19](https://github.com/bitrix24/b24jssdk/commit/50a0e19363b4f6f686848caceb9c8c27a8742352))
* **skills:** the skill files taught a class removed in 3.0.0. ([50a0e19](https://github.com/bitrix24/b24jssdk/commit/50a0e19363b4f6f686848caceb9c8c27a8742352))
* **skills:** two shipped recipes silently discarded what they logged. ([50a0e19](https://github.com/bitrix24/b24jssdk/commit/50a0e19363b4f6f686848caceb9c8c27a8742352))


### Changed

* **docs:** removed dead code and tightened types — four unreferenced files ([a5b9538](https://github.com/bitrix24/b24jssdk/commit/a5b95382df68a1353b2dd6b3602dcdd5aeac5fcf))


### Docs

* add a security policy, and put it under the same lint and link checks as the rest ([#405](https://github.com/bitrix24/b24jssdk/issues/405)) ([6e07dbf](https://github.com/bitrix24/b24jssdk/commit/6e07dbf562059f8c4aeada1f3942783e930c75b5))
* add an API Reference section indexing the public surface ([#383](https://github.com/bitrix24/b24jssdk/issues/383)) ([ce42d77](https://github.com/bitrix24/b24jssdk/commit/ce42d77472700910637a17343c8ac4437fbf4f6d))
* announce that Node 20 is dropped in 3.0.0, with a site-wide banner ([#380](https://github.com/bitrix24/b24jssdk/issues/380)) ([a266760](https://github.com/bitrix24/b24jssdk/commit/a266760a7ab9e712bf12eebb099d3570e5ebfa0a))
* ask whether to deprecate, in the places that describe how ([#422](https://github.com/bitrix24/b24jssdk/issues/422)) ([24f4910](https://github.com/bitrix24/b24jssdk/commit/24f4910c36f12d2ad3af11707d4bd562b533a954)), closes [#414](https://github.com/bitrix24/b24jssdk/issues/414)
* **logger:** record what [#346](https://github.com/bitrix24/b24jssdk/issues/346) deliberately left outside the isolation ([#364](https://github.com/bitrix24/b24jssdk/issues/364)) ([a29efc2](https://github.com/bitrix24/b24jssdk/commit/a29efc2902f85232c82a97a5f83bc165114a5b9f))
* record where the docs app deliberately diverges from upstream nuxt/ui ([#410](https://github.com/bitrix24/b24jssdk/issues/410)) ([2a8434c](https://github.com/bitrix24/b24jssdk/commit/2a8434c46118e9d9de4a0700f55635910fcd6cff)), closes [#400](https://github.com/bitrix24/b24jssdk/issues/400) [#411](https://github.com/bitrix24/b24jssdk/issues/411)
* **releasing:** merging the release PR does not publish to npm ([#362](https://github.com/bitrix24/b24jssdk/issues/362)) ([b6861d7](https://github.com/bitrix24/b24jssdk/commit/b6861d7242e1f44d3ecb474db3b2500e365b91c1))
* **releasing:** the generated section lands below the Unreleased block, not above ([#430](https://github.com/bitrix24/b24jssdk/issues/430)) ([4d566a8](https://github.com/bitrix24/b24jssdk/commit/4d566a8a554a22182d88ac7bcebf05716907ac8b))
* say how much review a change is worth, and name the signs of process bloat ([#421](https://github.com/bitrix24/b24jssdk/issues/421)) ([b193abb](https://github.com/bitrix24/b24jssdk/commit/b193abbc46fe89f85363fb572c431f11e37e6914))
* **skills:** stop teaching offClientSideWarning(), and correct what it does ([#366](https://github.com/bitrix24/b24jssdk/issues/366)) ([f1cbf15](https://github.com/bitrix24/b24jssdk/commit/f1cbf15d431ecc2e475bedcaadcccd73f514d2df)), closes [#166](https://github.com/bitrix24/b24jssdk/issues/166)
* warn that an app which never calls installFinish() receives no events ([#377](https://github.com/bitrix24/b24jssdk/issues/377)) ([fd72e36](https://github.com/bitrix24/b24jssdk/commit/fd72e360fd10c8191d85dbc57effd4023381acd7))
* write down the test a deprecation has to pass ([#413](https://github.com/bitrix24/b24jssdk/issues/413)) ([c71d524](https://github.com/bitrix24/b24jssdk/commit/c71d524f37148f1dd7a2d8f4f60a3266a04c83cd)), closes [#409](https://github.com/bitrix24/b24jssdk/issues/409)

## [2.1.0](https://github.com/bitrix24/b24jssdk/compare/v2.0.0...v2.1.0) (2026-08-21)

### Features

* **types:** new exported request-side filter/params types — `TypeFilterV2` (the `restApi:v2` prefix-operator object), `TypeFilterV3` (the `restApi:v3` array of triples / `FilterV3` builder groups), and the per-version `TypeCallParamsV2` / `TypeCallParamsV3`. The v2/v3 `call` / `callList` / `fetchList` / `callTail` / `fetchTail` / `aggregate` action options now type their `filter`, so a wrong-dialect filter is flagged in the IDE. Backward compatible — the permissive index signature is retained and v3 still accepts a v2-style object filter (#153).
* **frame:** forward the second im* parameter, and document fire-and-forget ([#355](https://github.com/bitrix24/b24jssdk/issues/355)) ([7eaa0ee](https://github.com/bitrix24/b24jssdk/commit/7eaa0ee4131afbdc9c2576b9da195c1b64a58ad0)), closes [#331](https://github.com/bitrix24/b24jssdk/issues/331)

### Bug Fixes

* **frame:** `parent.imPhoneTo()` and `parent.imOpenMessenger()` now forward the second argument the portal's own replacement methods take — `params` for `Messenger.startPhoneCall(number, params)` and `messageId` for `Messenger.openChat(dialogId, messageId)`. Both are documented arguments that a placement could not reach at all: the portal's bridge handler enumerates fields by hand and reads only `phone` / `dialogId`, so they are dropped on the way today. Sending them costs nothing — an unknown field is ignored — and applications will need no change on the day the portal forwards them. The JSDoc on all four `im*` methods now also states plainly that they are **fire-and-forget**: the portal's handlers are declared `function(params)` and never invoke the callback the message layer offers, so the returned promise means "the command was posted", not "the call started", and the `stop by timeout` log line that follows is the normal outcome rather than a fault. Traced on a live portal; the deprecation warning these calls produce is emitted by the portal's own compatibility layer and cannot be avoided by an application, because the newer method names are not part of a placement's command vocabulary (#331).
* **logger:** a failing log handler can no longer take down the process, or the operation it was logging. `Logger.log()` is `async` and every SDK callsite invokes it as a bare statement without `await`, so a rejected promise was an **unhandled rejection** — which Node terminates the process on by default. Handlers do real I/O (`TelegramHandler`, `StreamHandler`, the `winston` / `consola` adapters), so rejection is an ordinary operational event: an unreachable endpoint, an `EPIPE` on a closed stream, a full disk. A Telegram outage could therefore kill a server-side app that had merely wired the handler, with nothing at the callsite to suggest it. `log()` now isolates each processor and handler — a failure is skipped, the remaining handlers still receive the record, and every failure is reported to `console.warn` (not deduplicated — how often a sink is failing is itself the signal). Separately, all ~90 logging callsites now end in `.catch(() => {})`, stating the fire-and-forget intent in the code rather than leaving it implied; that also covers a caller who installs their own `LoggerInterface`, which isolating our own `Logger` could not. **If you pass a custom logger to `setLogger(...)`, every level must return a promise** — `.catch` on a method returning `undefined` is a `TypeError` at each callsite. TypeScript enforces this via `LoggerInterface`; `setLogger(...)` additionally warns to `console` if a level is missing or not callable. A new local ESLint rule, `local/require-catch-on-logger-call`, keeps the convention from decaying — it flags a fire-and-forget logger call without `.catch(...)` across both packages and auto-fixes it, while leaving a call that is awaited, returned or assigned alone. One limit is deliberate and documented on the [Logger page](https://bitrix24.github.io/b24jssdk/docs/working-with-the-rest-api/logger/): this covers failures *inside* the logger, not an exception raised while a caller builds its log arguments — those are evaluated at the callsite before `log()` is reached (#346).
* **http:** a call no longer dies with `AjaxError: Cannot read properties of undefined (reading 'length')` — surfaced to the caller as `JSSDK_UNKNOWN_ERROR` with status `0`, which reads like a transport failure or a changed response shape and is neither. The crash came from *logging*, not from the request: the `post/response` and `post/catchError` callsites hand `truncateForLog` the output of `JSON.stringify`, which returns the **value** `undefined` (not the string `"undefined"`) when there is nothing to serialise, and reading `.length` off it threw. Two real paths hit it — a v3 method whose success body carries no `result` envelope (`rest.documentation.openapi` answers with a bare OpenAPI document), and any `AxiosError` with no `response` at all (network failure, DNS, timeout, CORS). Both were destructive rather than cosmetic: the first lost a perfectly good response, the second erased the real transport error. Logger configuration made no difference — the argument is evaluated eagerly, so a `NullLogger` or a raised log level did not avoid it. `truncateForLog` now accepts `unknown` and coerces internally, so the guarantee holds at the single point all three callsites share and a new callsite cannot reintroduce it. The `result`-envelope half was already fixed on `main` as a side effect of the credential-redaction work in #287, unreleased and undocumented as a fix; the `post/catchError` half was still live (#338).
* **tools:** `Text.getUniqId()` now returns a well-formed UUID v4. The id template contained a literal `xlsx` segment (`xxxxxxxx-xlsx-4xxx-…`) that the `[xy]` replacer left untouched, so the second group leaked the characters `l`/`s` instead of random hex. Callers that relied on the previous malformed output will now receive a valid UUID v4 shape (#291).
* **oauth:** the `Strange error: …` fallback in `B24OAuth`'s `refreshAuth()` now attaches the caught value as `cause`. Both `instanceof Error` branches above it rethrow, so the previous `cause: error instanceof Error ? error : undefined` was always `undefined` and the original value was dropped. Its message now formats the value with `String(...)` rather than a template literal, so throwing a `Symbol` no longer makes the `catch` block itself raise a `TypeError` and mask the original.
* **helper:** `B24HelperManager.loadData()` and `CurrencyManager.initData()` now attach the caught value as `cause` on the `Failed to load data` error they rethrow, instead of discarding it. Note that both rethrow a real `Error` (including `AjaxError` / `SdkError`) untouched, so `cause` is only ever populated for a thrown value that is not an `Error` at all.
* **docs:** the chat Markdown renderer follows the `@comark/vue` 0.6 rename — `defineComarkComponent` is now `defineMarkdownComponent`. The package is pre-1.0, so the 0.5 → 0.6 bump is breaking even though Dependabot groups it as minor/patch; the option shape (`name` / `plugins` / `class`) is unchanged, so the call site is otherwise identical.
* **deps:** `nuxt typecheck` no longer dies at module setup with `The requested module 'unhead/utils' does not provide an export named 'hasOwn'`. `nuxt-schema-org` needs the `hasOwn` helper that landed in `unhead` 3.3.0, but the tree carried both 3.2.x and 3.3.x and resolved it against the older copy. A new `unhead: '>=3.3.2 <4'` floor collapses the tree onto one copy.
* **deps:** brace expansion works again in `minimatch` below v10. The tree-wide `brace-expansion: '>=5.0.9 <6'` floor was also applied to `minimatch@5.1.9` / `minimatch@9.0.9`, which declare `^2.0.x` and call the package's default export directly — v5 dropped that callable default, so every brace pattern threw (`expand is not a function` on 5.x, `brace_expansion_1.default is not a function` on 9.x; plain patterns kept working, which is why neither `pnpm audit` nor `--frozen-lockfile` caught it). Both are reached through `archiver` → `nitropack`, so the breakage was latent. A version-scoped `'minimatch@<10>brace-expansion': '>=2.1.4 <3'` exemption now gives them the patched 2.x line, while `minimatch@10` — which legitimately declares `^5.0.8` — keeps v5.
* **tools:** `Type.isTypedArray()` now detects typed arrays. Its tag regex checked for `[object Int8]`-style tags, but the real `Object.prototype.toString` tag carries an `Array` suffix (`[object Int8Array]`), so the guard previously returned `false` for every typed array. `DataView` is still excluded, as documented (#291).
* **deps:** raise stale security override floors and unbreak minimatch brace expansion ([#333](https://github.com/bitrix24/b24jssdk/issues/333)) ([2894b7c](https://github.com/bitrix24/b24jssdk/commit/2894b7c2e5b0676b6264784668514594b14e76da))
* **deps:** repo-wide dependency refresh, bound override floors both ways, carry `cause` on rethrown errors ([#320](https://github.com/bitrix24/b24jssdk/issues/320)) ([dde9a9d](https://github.com/bitrix24/b24jssdk/commit/dde9a9d0a3d7cbbaff3026716bfbce3ebcbe5a26))
* **frame:** initializeB24Frame() no longer strands callers or leaks a frame on failed init ([#142](https://github.com/bitrix24/b24jssdk/issues/142)) ([#306](https://github.com/bitrix24/b24jssdk/issues/306)) ([530fcf6](https://github.com/bitrix24/b24jssdk/commit/530fcf69e1c5e8204a4e9df0327d95cfff407fc6))
* **http:** stop a logging TypeError from destroying the request outcome ([#345](https://github.com/bitrix24/b24jssdk/issues/345)) ([5980797](https://github.com/bitrix24/b24jssdk/commit/5980797bd72ef0c59dd0d08ccc089e4fead52da2))
* **logger:** isolate logging failures from the operation being logged ([#348](https://github.com/bitrix24/b24jssdk/issues/348)) ([f2b5bcd](https://github.com/bitrix24/b24jssdk/commit/f2b5bcd14f957117386244869f838e09528dccf1)), closes [#346](https://github.com/bitrix24/b24jssdk/issues/346)
* **playground/cli:** smoke-retry probes server.time, not user.current ([#286](https://github.com/bitrix24/b24jssdk/issues/286)) ([000fb6d](https://github.com/bitrix24/b24jssdk/commit/000fb6d6a0d46171caa0f4c3fbdd6594d621d8ab))
* **pull:** harden PullClient lifecycle — SSR safety, unified teardown, in-flight start() abort ([#222](https://github.com/bitrix24/b24jssdk/issues/222)) ([#305](https://github.com/bitrix24/b24jssdk/issues/305)) ([087d962](https://github.com/bitrix24/b24jssdk/commit/087d962f57abde1842a8755971f866f45866ea7f))

### Security

* **deps:** the dependency refresh above clears every outstanding advisory — `pnpm audit --audit-level=moderate` (the command CI runs, prod + dev deps) goes from **26 findings (1 low, 14 moderate, 11 high) to none**. Most are cleared by the bumps themselves; the one that needed a pin is **GHSA-f88m-g3jw-g9cj** (`sharp` < 0.35.0, reached via `docs>@nuxt/image>ipx` and `docs>nuxt-og-image`), now held by a `sharp: '>=0.35.3 <0.36'` floor in [pnpm-workspace.yaml](pnpm-workspace.yaml) — a minor ceiling because `sharp` is 0.x.
* **deps:** raised four override floors that had fallen behind newly published advisories, and added a missing `nanoid` pin — `pnpm audit --audit-level=moderate` was failing on `main` with **8 findings (1 low, 3 moderate, 4 high)** and is clean again. A floor pins the version patched when it was written, so a later advisory against the same package leaves it holding a vulnerable version; nothing re-checks this, so the first symptom was every open pull request going red on the `test` job. `fast-uri` `>=3.1.2` → `>=3.1.5` (**GHSA-7p8r-x3mc-p8w7**), `hono` `>=4.12.25` → `>=4.12.34` (**GHSA-8j4g-w8fx-2239**, **GHSA-f23p-vx2j-j53r**, **GHSA-54fx-42gc-7vw4**, **GHSA-79qm-7rj5-m7r9**), `brace-expansion` `>=5.0.6` → `>=5.0.9` (**GHSA-rgw5-rvv9-x895**), `js-yaml` `>=4.1.2` → `>=4.3.1` (**GHSA-5p4m-2wfm-xmqj**), plus a new `nanoid: '>=3.3.18 <4'` floor (**GHSA-2v37-7h3g-55p8**). Every `<next-major` ceiling is retained, and none of these packages reaches the published `@bitrix24/b24jssdk` dependency graph — they are dev / docs tooling transitives.
* **auth:** timeout-bounded frame refreshAuth + non-enumerable SdkError.originalError ([#189](https://github.com/bitrix24/b24jssdk/issues/189)) ([#304](https://github.com/bitrix24/b24jssdk/issues/304)) ([8f2b79b](https://github.com/bitrix24/b24jssdk/commit/8f2b79b0bc7de8332137d393280a9ddf21386dd4))
* **http:** redact credentials in the post/response success log ([#69](https://github.com/bitrix24/b24jssdk/issues/69)) ([#287](https://github.com/bitrix24/b24jssdk/issues/287)) ([93170e6](https://github.com/bitrix24/b24jssdk/commit/93170e629a56a3f093300e5ba56daa510fe24666))
* **scripts:** harden b24-self-task agent against prompt injection ([#179](https://github.com/bitrix24/b24jssdk/issues/179)) ([#289](https://github.com/bitrix24/b24jssdk/issues/289)) ([f4fe592](https://github.com/bitrix24/b24jssdk/commit/f4fe59218836ff375ebd9966fddb45fc71e3ea49))

### Dependencies

* bump the npm-minor-patch group across 1 directory with 2 updates ([#321](https://github.com/bitrix24/b24jssdk/issues/321)) ([32c5256](https://github.com/bitrix24/b24jssdk/commit/32c5256ff0e3b13a1d3c44abd05677d9b7b3fdd2))
* minor/patch refresh across 28 packages, with the three fixes it needs ([#335](https://github.com/bitrix24/b24jssdk/issues/335)) ([fc9a63e](https://github.com/bitrix24/b24jssdk/commit/fc9a63e47680c51345a2ca8b8a840ca3808fc39f))
* minor/patch refresh, with reka-ui left to follow @bitrix24/b24ui-nuxt ([#339](https://github.com/bitrix24/b24jssdk/issues/339)) ([b5cb45b](https://github.com/bitrix24/b24jssdk/commit/b5cb45bbcd1f8167b0c7a7a481857b39d3c69a4f))
* take js-yaml 5, with the named-import migration it requires ([#344](https://github.com/bitrix24/b24jssdk/issues/344)) ([222856e](https://github.com/bitrix24/b24jssdk/commit/222856e2b11eb9ed9042e12ed7fbcfc16fd66528))

### Changed

* **types:** `TypeHttp.ajaxClient` is now `AxiosInstance` instead of `AxiosInstance | any` (the union erased the type) (#153).
* **deps:** minor/patch refresh across 28 packages (supersedes the Dependabot group PR #330, which could not land on its own — see below). Three of the bumps reach a published package's runtime `dependencies` — `axios` 1.18 → 1.19 and `@types/luxon` 3.7.2 → 3.7.3 in `@bitrix24/b24jssdk`, and `@nuxt/kit` 4.5.1 → 4.5.2 in `@bitrix24/b24jssdk-nuxt`; everything else is dev/docs tooling. Other notable bumps: `nuxt` 4.5.1 → 4.5.2, `@comark/vue` 0.5 → 0.6, `@nuxtjs/mdc` 0.22 → 0.23, `shiki` / `@shikijs/*` 4.3 → 4.4, `ai` 7.0.39 → 7.0.56 with the `@ai-sdk/*` line, `@bitrix24/b24ui-nuxt` 2.9 → 2.10, `@nuxt/image` 2.0 → 2.1, `@nuxt/devtools` 3.3 → 3.4, `openai` 7.0 → 7.4, `vue-tsc` 3.3.8 → 3.3.9. Three changes had to ride along, none of which Dependabot can make on its own: the `nuxt` override floor moved to `>=4.5.2` in lockstep with the manifests (a Dependabot PR only edits `package.json`, so the floor silently held `nuxt` at 4.5.1 while `@nuxt/kit` went to 4.5.2 and the tree split); new dedupe floors for `unhead` / `@unhead/vue` (see below), `@nuxt/kit`, `@nuxt/schema`, `@nuxtjs/mdc` and the `shiki` / `@shikijs/*` set; and the `@comark/vue` rename below. Without those floors the refresh left a second copy of each of those packages in the tree — `nuxt` moved to 4.5.2 while dependents held `@nuxt/kit` at 4.5.1, and the `@shikijs/*` floor lagged its own manifest range so `docs` silently resolved below what it declared, splitting one `shiki` release across two core versions.
* **deps:** minor/patch refresh — `@regle/core` / `@regle/rules` 1.28 → 1.29, `@types/node` 26.1 → 26.2, `eslint` 10.8.0 → 10.8.1. All dev/docs tooling; nothing reaches a published package. Supersedes the Dependabot group PR #337, whose `reka-ui` 2.10.1 → 2.10.3 bump is dropped here: `@bitrix24/b24ui-nuxt` depends on an *exact* `reka-ui`, so a higher-resolving range in `docs` put a second copy of the component library in the same Vue app — two provide/inject registries, which typecheck, tests and the docs build all pass without noticing. `docs` imports `Slot` from it directly, so the dependency stays declared; it is now pinned to the exact version `@bitrix24/b24ui-nuxt` carries, and Dependabot is told to ignore it so it moves only when `@bitrix24/b24ui-nuxt` does.
* **build:** dropped end-of-life Node.js 18 from `engines` — the supported range is now `^20.0.0 || >=22.0.0`, and `@bitrix24/b24jssdk-nuxt` now declares the same range (it previously had none). Node 20 is retained for now; its removal is a breaking change deferred to the next major (#312). CI now runs the unit tests on a Node `22 + 24` matrix, and both npm-publish workflows build the artifact on a pinned, CI-validated Node 22 instead of the floating `lts/*` (#174).
* **deps:** repo-wide dependency refresh. Notable bumps: `eslint` 10.3 → 10.8 with `@nuxt/eslint-config` 1.15 → 1.16, `nuxt` 4.4.6 → 4.5.1, `axios` 1.15 → 1.18, `vitest` / `@vitest/ui` 4.1.5 → 4.1.10, `vue-tsc` 3.2 → 3.3, `@nuxt/content` 3.13 → 3.15, `shiki` 4.0 → 4.3, plus the `@types/node` 25 → 26, `markdownlint-cli2` 0.22 → 0.23, `@nuxtjs/mdc` 0.21 → 0.22, `openai` 6 → 7, `ai` 6 → 7 and `@ai-sdk/*` majors. TypeScript stays on `6.x`: `rollup-plugin-dts@6.4.1` — the latest, reached through `unbuild` — declares a `typescript` peer of `^4.5 || ^5.0 || ^6.0` and dies on `ts.sys` under TypeScript 7, so the published SDK cannot be built with it yet.
* **deps:** the `overrides` block in [pnpm-workspace.yaml](pnpm-workspace.yaml) is now bounded on both sides. Every range floor carries a `<next-major` ceiling: an override outranks the range each dependent declares, so an unbounded floor adopts a new major silently on the next `pnpm update` — this refresh moved `js-yaml` 4 → 5 (pure ESM with no default export, which broke `scripts/_docs-utils.mjs`) and `fast-uri` 3 → 4 (past the `^3.0.1` that `ajv` declares) before the ceilings went in. Each floor must also stay at or above what the manifests declare, because pnpm records the override string as the lockfile specifier — a lagging floor holds an older version that `pnpm install --frozen-lockfile` still accepts, with no gate that catches it (`nuxt` hit exactly this: the manifests moved to `^4.5.1` while the floor read `>=4.4.7`, so the tree stayed on 4.4.8 and carried duplicate `@nuxt/kit` / `@nuxt/schema` trees). Two dedupe pins added, mirroring the sibling `bitrix24/b24ui` repo — `h3: 1.15.11` (the h3 v2 release candidate reaches the tree through `nuxt-og-image` / `nuxt-schema-org` → `@unhead/vue` → `devframe`, and flips `@nuxtjs/mcp-toolkit`'s h3 *peer* to v2 while Nitro still types docs' server routes against v1) and `@shikijs/core` / `@shikijs/types` `>=4.3.1 <5` (`shiki-transformer-color-highlight@1.1.0` still asks for shiki 3).
* **frame:** collapse initializeB24Frame() poll+booleans into one shared init promise ([#142](https://github.com/bitrix24/b24jssdk/issues/142) follow-up) ([#307](https://github.com/bitrix24/b24jssdk/issues/307)) ([881a168](https://github.com/bitrix24/b24jssdk/commit/881a168025d67ff87752cd60c8060a8c9fb199fa))
* **tools:** document Text/Type/Browser/useFormatter, fix getUniqId & isTypedArray ([#292](https://github.com/bitrix24/b24jssdk/issues/292)) ([09439dc](https://github.com/bitrix24/b24jssdk/commit/09439dc1247c5982ee4e0f6e23b0f25800f65b39))

### Docs

* Filled the `@todo docs` JSDoc placeholders across the public surface — actions (v2/v3), the HTTP transports, `AjaxResult`, the limiter stack, the `B24Hook` / `B24Frame` / `B24OAuth` entry points, tools, and public types (#154).
* **tools:** expanded the `Text`, `Type`, `Browser`, and `useFormatter` documentation pages to the full tools skeleton and added complete JSDoc to `packages/jssdk/src/tools/text.ts`. `Text.getDateForLog()` now uses the `yyyy` year token (was `y`) to match its documented `yyyy-MM-dd HH:mm:ss` format — output is unchanged for four-digit years (#291).
* **security:** new [Security patterns](https://bitrix24.github.io/b24jssdk/docs/working-with-the-rest-api/security/) page for event-receiver / OAuth apps — reply-`2xx`-first ordering and constant-time `application_token` verification, with a checklist (#84).
* **skills:** document the skill installation paths on the AI Skills page — project / personal install, the published `/.well-known/skills/` URL, and vendor-in for non-Claude tools (#124).
* **docs:** corrected the `AGENTS.md` claim that the CHANGELOG is auto-generated — it is hand-maintained (keep-a-changelog style, finalised at release per `RELEASING.md`); and fixed the `v1.0.2` CHANGELOG date `2026-03-17` → `2026-02-17` to match the actual GitHub release (#178).
* align `audited` with the [#320](https://github.com/bitrix24/b24jssdk/issues/320) commit date on 5 pages so docs-lint --strict is green ([#322](https://github.com/bitrix24/b24jssdk/issues/322)) ([5ffbd9e](https://github.com/bitrix24/b24jssdk/commit/5ffbd9e96f40d1b438fccb574de2400f9f9a08d3))
* **contributing:** add Telegram release-post guide ([#359](https://github.com/bitrix24/b24jssdk/issues/359)) ([de7d806](https://github.com/bitrix24/b24jssdk/commit/de7d806b1597088d25451cc78005ffefb212176d))
* correct the hand-maintained-CHANGELOG truth + fix v1.0.2 date ([#178](https://github.com/bitrix24/b24jssdk/issues/178)) ([#311](https://github.com/bitrix24/b24jssdk/issues/311)) ([502c53e](https://github.com/bitrix24/b24jssdk/commit/502c53ef0611c90330754eaed77cd9905f2078ee))
* defer legacy REST surface removal to 3.0.0 + migration guide ([#278](https://github.com/bitrix24/b24jssdk/issues/278)) ([66cb378](https://github.com/bitrix24/b24jssdk/commit/66cb378c1eed8e16c19ffffee67cabaf0c7ceda3))
* drive homepage Cookbook + catalogue from the content collection ([#105](https://github.com/bitrix24/b24jssdk/issues/105)) ([#298](https://github.com/bitrix24/b24jssdk/issues/298)) ([9924322](https://github.com/bitrix24/b24jssdk/commit/992432290e5a5d782c43fa77805271cdea7f4309))
* filtering reference ([#77](https://github.com/bitrix24/b24jssdk/issues/77)), setRestrictionManagerParams scope gotcha ([#82](https://github.com/bitrix24/b24jssdk/issues/82)), redaction-contract jsdoc ([#73](https://github.com/bitrix24/b24jssdk/issues/73)) ([#294](https://github.com/bitrix24/b24jssdk/issues/294)) ([9de8255](https://github.com/bitrix24/b24jssdk/commit/9de825575ba202e36a1be35b805a7ea5b97230fd))
* **frame:** re-audit frame/pull pages — fix 4 drifts + refresh audited ([#299](https://github.com/bitrix24/b24jssdk/issues/299)) ([#301](https://github.com/bitrix24/b24jssdk/issues/301)) ([28ac84f](https://github.com/bitrix24/b24jssdk/commit/28ac84f55f64a74bba31535994f5aae65971bc95))
* pin-b24sdk-examples-to-tags convention ([#120](https://github.com/bitrix24/b24jssdk/issues/120)) + cross-link logging page in CHANGELOG ([#72](https://github.com/bitrix24/b24jssdk/issues/72)) ([#300](https://github.com/bitrix24/b24jssdk/issues/300)) ([a0e01a6](https://github.com/bitrix24/b24jssdk/commit/a0e01a6b3a5874d3d23160fcf47b703df10e37bc))
* **reference:** document public tools/ + types/ — common, payloads, object helpers, environment ([#125](https://github.com/bitrix24/b24jssdk/issues/125)) ([#303](https://github.com/bitrix24/b24jssdk/issues/303)) ([421fb2c](https://github.com/bitrix24/b24jssdk/commit/421fb2cfc2f9f18d5c5bf154765bdac177697644))
* **releasing:** correct the handover — bootstrap-sha does not limit the scan ([#354](https://github.com/bitrix24/b24jssdk/issues/354)) ([91e9e7f](https://github.com/bitrix24/b24jssdk/commit/91e9e7f7fc07b600443eb1ca2ef974ffdc75cf7c)), closes [#347](https://github.com/bitrix24/b24jssdk/issues/347)
* **scripts:** replace hand-rolled frontmatter parser with js-yaml ([#63](https://github.com/bitrix24/b24jssdk/issues/63)) ([#297](https://github.com/bitrix24/b24jssdk/issues/297)) ([34736f6](https://github.com/bitrix24/b24jssdk/commit/34736f6857d3d391637e29df24668b02740bba99))
* security patterns page for event receivers ([#84](https://github.com/bitrix24/b24jssdk/issues/84)) + skill install methods ([#124](https://github.com/bitrix24/b24jssdk/issues/124)) ([#302](https://github.com/bitrix24/b24jssdk/issues/302)) ([7166c0c](https://github.com/bitrix24/b24jssdk/commit/7166c0c348345d3ee692a75deed46887d1ab0496))
* **slider:** how to open your own app page and route to it in Nuxt ([#357](https://github.com/bitrix24/b24jssdk/issues/357)) ([76b007b](https://github.com/bitrix24/b24jssdk/commit/76b007bc63b9e9cce1a6c2a31e5c3a976a8f7da1)), closes [#356](https://github.com/bitrix24/b24jssdk/issues/356)

### Deprecations

* The legacy REST surface — the `AbstractB24` shortcuts (`callMethod`, `callListMethod`, `fetchListMethod`, `callBatch`, `callBatchByChunk`) and the `batchSize` const, the `AjaxResult` paging helpers (`isMore` / `hasMore` / `getNext` / `fetchNext` / `getTotal`), and `LoggerBrowser` / `LoggerType` — remains available in `2.x` (it works and emits a runtime deprecation warning) and is **scheduled for removal in `3.0.0`** (was previously mislabelled for `2.0.0`). Migrate to `b24.actions.v{2,3}.*.make(...)`, the list helpers, and `LoggerFactory` — see the [v2 → v3 migration guide](https://bitrix24.github.io/b24jssdk/docs/getting-started/migration/v3/). Tracked in #277.

## [2.0.0](https://github.com/bitrix24/b24jssdk/compare/v1.3.0...v2.0.0) (2026-06-27)

### ⚠ BREAKING CHANGES

* **v3:** `actions.v3.call` / `actions.v3.batch` no longer pre-flight-throw `JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3` for methods that were not on the (now-removed) hardcoded v3 allowlist. An unknown v3 method now comes back as a `METHODNOTFOUNDEXCEPTION` **soft error** on the `AjaxResult` (`response.isSuccess === false`) instead of a thrown `SdkError`. Code that caught that `SdkError` must switch to checking `response.isSuccess` / `response.getErrorMessages()`.
* **v3:** `versionManager.isSupport()` now always returns `true`, and `automaticallyObtainApiVersion()` / `automaticallyObtainApiVersionForBatch()` now always return `v2` (version auto-detection no longer routes to v3 — v3 is opt-in only via the explicit `actions.v3.*` surface). `actions.v2.call` no longer logs the `JSSDK_CORE_METHOD_AVAILABLE_IN_API_V3` migration warning.

* **batch:** an **array-mode** batch (`actions.v{2,3}.batch.make([...])`) now keys each per-command error by its **numeric position** (`'0'`, `'1'`, …) in `Result.getErrorsByKey()` / `getErrorMessagesByKey()`, instead of a random UUID — so you can tell *which* command failed, matching object/named-command mode. This surfaces on the **v2** path, which reports per-command errors (`result_error`); v3 batch is all-or-nothing (a failure becomes a single envelope soft error), so the v3 strategy is aligned for symmetry but has no per-index error to key today. Behaviour change: code that read the old UUID keys from an array batch now sees position strings (unlikely to be relied on — the old keys were random). Object/named batches (keyed by label), the envelope-level `base-error` key, and `addErrors()` (UUID) are unchanged (#255)

### Features

* **batch:** new `BatchRefV3` helper (`ref` / `refArray`) for the v3 batch `$ref` / `$refArray` cross-command substitution markers (reference §8). The server performs the substitution; the helper builds the marker objects to drop into a later command's `params`/`query` (validated client-side — `refArray` requires a dotted `alias.field` path). Reference an earlier command by its `as` alias. Verified live: a `tasks.task.list as tasks` step followed by a `filter: [['id', 'in', BatchRefV3.refArray('tasks.id')]]` step had the server substitute the collected ids. `import { BatchRefV3 } from '@bitrix24/b24jssdk'`
* **v3:** new `actions.v3.aggregate` action for the v3 `aggregate` action (reference §7): pass a `select` of `sum`/`avg`/`min`/`max`/`count`/`countDistinct` (list form `['amount']` or alias map `{ amount: 'totalAmount' }`) plus an optional `filter`; it returns the response buckets (`{ sum: { amount: 12345 }, count: { id: 87 } }`, keyed by function then field). Validates the function set client-side. Call it via `$b24.actions.v3.aggregate.make(...)`, and pair `FilterV3` to build the `filter`. **`@experimental`** — spec-based, not yet verified against a live portal, as no module on the reference test portal exposes an `*.aggregate` endpoint; the wire shape may change once verified.
* **filter:** new `FilterV3` typed builder for the REST API v3 filter grammar (array-of-triples with AND/OR/NOT groups, §3). Exposes `eq`/`ne`/`gt`/`ge`/`lt`/`le`/`in`/`between` leaf helpers, `and`/`or`/`not` combinators, and `build(...)` to assemble the top-level (AND-joined) `params.filter` array — skipping falsy nodes so conditionals inline cleanly. Validates the operator set and the `in`/node shapes on the client (a bad operator or a malformed `build()` node fails fast instead of as a server `UNKNOWNFILTEROPERATOREXCEPTION`; the `between` signature makes a malformed range unrepresentable). Verified live against a v3 portal. `import { FilterV3 } from '@bitrix24/b24jssdk'`
* **v3:** the SDK no longer keeps a hardcoded v3 method allowlist (`version-manager` `#supportMethods`). `actions.v3.call` / `actions.v3.batch` now send any method to the v3 endpoint and the server validates it — an unknown v3 method comes back as a `METHODNOTFOUNDEXCEPTION` **soft error** on the `AjaxResult` instead of the SDK pre-flight-throwing `JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3`. The portal's OpenAPI (`rest.documentation.openapi`) exposed far more v3 methods than the static list (e.g. `note.*`, `rest.application.*`), and the list both lagged the server and blocked valid methods. Behaviour changes: `actions.v3.*` no longer throws for off-list methods; `actions.v2.call` no longer logs the `JSSDK_CORE_METHOD_AVAILABLE_IN_API_V3` migration warning; `versionManager.isSupport()` always returns `true` and `automaticallyObtainApiVersion()` defaults to v2 (v3 is opt-in via the explicit `actions.v3.*` surface). `AjaxResult.getNext()` still throws `JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3` for v3 clients — it cannot page a v3 envelope; use `callList` / `fetchList` instead.
* **v3:** new `actions.v3.fetchTail` / `actions.v3.callTail` helpers drive the native v3 `tail` (keyset cursor) action with its `cursor: { field, value, order, limit }` parameter, instead of emulating a cursor on top of `list` by injecting a `[field, '>', n]` filter. `fetchTail` streams pages (async generator); `callTail` returns every record as one array. The cursor field is auto-added to `select` and must not appear in `filter` (the helper warns). Same page-cap-tolerant stop as the list helpers (#253)
* **v3:** `tasks.task.list` is now routed through `actions.v3.*` (`call` / `callList` / `fetchList` / `batch`) instead of falling back to v2. On v3 it is a standard all-lowercase list method, so with the list helpers use `idKey: 'id'` (the default) and `customKeyForResult: 'items'` — no `cursorIdKey` override (that is only needed on the v2 endpoint, which sorts by `ID` but returns `id`). A `list tasks` CLI playground command demonstrates the v3 fetch. Verified end-to-end against a live portal (#253)
* **package:** add CommonJS support so the package can be consumed with `require('@bitrix24/b24jssdk')` (and from `tsx`-driven Node projects), in addition to ESM and UMD — previously a CommonJS / non-`import` resolver failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`. `exports` now carries `require`/`default` conditions (with CJS-flavored `.d.cts` types), the build emits `dist/umd/package.json` (`{"type":"commonjs"}`) and `dist/umd/index.d.cts`, and `main` points at the UMD/CJS entry while `module` stays on ESM. ESM remains the recommended entry point; the CommonJS path resolves to the UMD bundle, which inlines its dependencies (a dedicated CJS build with external deps is planned). Verified end-to-end (`require`, `import`, `tsx`, TypeScript `node16`/`nodenext`/`bundler`, `publint`, `@arethetypeswrong/cli`) (#256)

* **build:** ship a **first-class CommonJS build** (`dist/cjs/*.cjs` + `index.d.cts`) with dependencies kept **external** (`require('axios')` / `'luxon'` / `'qs-esm'`), and point the `require` / `main` entry at it instead of the UMD bundle. Previously `require('@bitrix24/b24jssdk')` resolved to the browser UMD bundle, which **inlines** its dependencies (~1.1 MB) and ships a single flat module; the new CJS build mirrors the ESM module structure, dedupes deps against the consumer's own `axios`/`luxon`, and is far smaller (~9 KB entry). The UMD bundle stays the browser `<script>` / unpkg / jsdelivr target; ESM remains the recommended entry. Verified end-to-end (`require`, `import`, `publint`, `@arethetypeswrong/cli` — node10/node16-CJS/node16-ESM/bundler all green) (#258)

### Code Refactoring

* **v3:** the keyset-pagination loop duplicated across the four v3 list/tail helpers (`callList` / `fetchList` / `callTail` / `fetchTail`) is now a single shared driver (`keysetPaginate`, internal). It owns the page-cap-tolerant end-of-data stop (largest page seen, not the requested `limit`), the missing-bucket guard, the cursor-stop warning, and the soft-error handling (via `KeysetPaginationError`); each helper supplies only its request-shape strategy (emulated `[field, '>', n]` filter vs native `cursor`) and decides whether to fold the error into a `Result` (eager `call*`) or rethrow as its `SdkError` (streaming `fetch*`). No public API or behaviour change — verified by parity review, the existing list/tail unit tests, new soft-error fan-out tests, and a live run (a 50-capped `callList` returns all 1200 records; native `tail` walks correctly).

### Bug Fixes

* **http:** the SDK telemetry query params (`bx24_request_id` / `bx24_sdk_ver` / `bx24_sdk_type`) are no longer appended to the request URL for the legacy positional `task.*` methods on the **v3** transport — previously only `HttpV2` dropped them. Those methods (`task.commentitem.*`, `task.checklistitem.*`, …) read the request query string **positionally**, so the telemetry shifted `Param #0` and the server rejected the call (`WRONG_ARGUMENTS: Param #0 (taskId) ... expected integer, but given something else`). After the v3 method allowlist was dropped (#259) such a method can be routed via `actions.v3.*`, where the missing carve-out made e.g. `actions.v3.call.make({ method: 'task.commentitem.getlist' })` fail — verified live against a portal (the same call succeeds without the telemetry params and fails with them; modern `tasks.task.*` with named params is not subject to the constraint — its calls work either way). The carve-out (drop telemetry for any method whose name contains `task.`) now lives once on `AbstractHttp._prepareMethod`, shared by the v2 and v3 transports so they can no longer drift apart (#207)
* **http:** the v3 `callList` / `fetchList` helpers no longer truncate the result when a list method silently caps the page below the requested `limit` (e.g. `tasks.task.list` honours `limit` only up to 50; the doc notes anything above the method's max is silently trimmed). The cursor loop now ends on the largest page actually returned rather than on the requested `limit`, so a `limit` above the server cap pages through every record instead of stopping after the first capped page. Trade-off: a single short page or an exact-multiple result set now costs one extra (empty) trailing request to confirm end-of-data; the v2 helpers keep the original `length < limit` stop condition (#253)
* **pull:** `PullClient.destroy()` now fully tears the client down — removes its `beforeunload` / `offline` / `online` window listeners, cancels all seven pending timers (including the self-rescheduling `pull.watch.extend` watch loop), and no longer schedules a reconnect on teardown. A destroyed client is inert: `updateWatch` / `scheduleReconnect` / `onOnline` / `connect` and every timer-arming path bail out, and `start()` rejects with `PULL_DISPOSED`. Previously only the check interval was cleared, so timers and window listeners survived `destroy()` and the client kept firing background REST and could reconnect after an explicit teardown — accumulating across SPA/Nuxt `destroyB24Helper()` cycles (#141)
* **http:** on retry exhaustion the SDK now surfaces the underlying error with its **real code** (e.g. `QUERY_LIMIT_EXCEEDED`) — thrown for hard codes, returned in the `AjaxResult` for soft codes — instead of the generic `JSSDK_CALL_ALL_ATTEMPTS_EXHAUSTED`, and the final attempt no longer sleeps a full backoff before giving up. `JSSDK_CALL_ALL_ATTEMPTS_EXHAUSTED` is now thrown only for the degenerate `maxRetries < 1` config. Behaviour change: code that caught `JSSDK_CALL_ALL_ATTEMPTS_EXHAUSTED` on rate-limit / transient exhaustion now catches the real code (#143)
* **http:** `getStats().totalRequests` now returns the actual request count (was wired to `totalDuration`) and `reset()` zeroes it; the HTTP client constructor no longer wipes caller-supplied headers (incl. the SDK `User-Agent`) when `options` is passed; and `AjaxResult.getNext()` no longer mutates the previous page's `getQuery().params` (#144)
* **http:** a `batch()` whose envelope soft-errors (any code in `exceptionCodeForSoft` — e.g. a `BITRIX_REST_V3_EXCEPTION_VALIDATION_*` server-side validation code surfaced through a batch call) now returns a `Result` carrying those errors instead of crashing with a raw `TypeError: Cannot read properties of undefined`. `restApi:v2` batch processing dereferenced `response.getData()!.result` / `.time` without first checking `isSuccess` (the soft-error envelope has no `result`, so `getData()` is `undefined`); it now mirrors the existing `restApi:v3` guard — surfaces the envelope errors and returns an empty data map. Behaviour change: code that was inadvertently catching that `TypeError` from a `restApi:v2` `batch()` should check `result.isSuccess` / `result.getErrors()` instead (#145)
* **pull:** `PullClient.getConnectionPath()` no longer duplicates the private channel id in the `CHANNEL_ID` query param — it pushed `channels.private.id` twice (and an empty segment when `private` existed without an `id`), so the push server received a malformed `CHANNEL_ID` like `id/id` or a leading `/`. Now one guarded push per channel; a `private`-without-`id` config — which previously slipped through as an empty `CHANNEL_ID` — now throws `Empty channels`, as does a config with no channel ids (#238)

### Security

* **ci:** an ESLint `no-restricted-syntax` guard scoped to `packages/jssdk/src/core/http/**` forbids leaking a URL- or credential-shaped value into a logger context object — whether a bare variable (`{ url }`), a member access (`{ x: err.config.url }`), a spread of an axios `config`/`request`/`response`, or a value under a credential-shaped property key (`{ apiUrl: someVar }`) — blocking the #39/#40 webhook-secret-leak class at lint time, as defence-in-depth alongside the runtime redaction test. The guard's selectors are locked by a unit test that runs them through ESLint, so an edit that silently stops one from firing turns CI red (#42, #212)
* **ci:** that HTTP-logger credential-leak guard (#42 / #212) is now a dedicated local ESLint rule — `eslint-rules/no-credential-in-logger.js` — instead of four hand-written `no-restricted-syntax` esquery selectors. One credential vocabulary (with the `[Tt]oken(?!s\b)` plural carve-out), explicit AST logic, and contextual messages that name the offending key (e.g. ``{ apiUrl: someVar }`` — the value may carry the webhook secret regardless of its own name). It is **widened from `core/http/**` to the whole `packages/jssdk/src/**`**, so the #39/#40 leak class is caught anywhere the SDK logs — pull / frame / hook / oauth, not just the HTTP layer; the logger callsites outside `core/http` that the #43 fixes already left clean are now regression-guarded by lint too. The wider scope surfaced no new violations. The lock-test drives the real rule module, asserts the contextual message content, and asserts `eslint.config.mjs` keeps the rule wired at the wider scope, so a broken matcher or an unwired / re-narrowed rule turns CI red (#226)
* **redact:** harden `redactSensitiveParams` (the single source of truth behind the logger context, the `post/send` / `post/catchError` logs, and `AjaxError.toJSON()`/`toString()`): the credential-key set gains `client_secret` / `application_token` / `sessid` / `key`; matching is now **case-insensitive** (`AUTH` / `Token` / `PASSWORD` no longer slip through); and credential values embedded in a **query-string** value — most importantly a batch `cmd[i]` like `method?auth=<token>&…` — are masked in place (previously only object *keys* were walked, so a serialised credential survived). The two-level object-depth limit is documented as accepted residual risk, as is the deliberate breadth of `key` (it masks any param literally named `key` — a conservative choice, since `key` is a Bitrix24 credential parameter) (#151, #229)
* **pull:** `PullClient.getDebugInfo()` no longer exposes the push JWT (`token`) or the private/shared `CHANNEL_ID`s — neither in its `Path` field (the connection URL, now run through a new `redactSensitiveUrl()` that reuses the core redactor's key set plus the `CHANNEL_ID` key) nor in the `ChannelID` config field (now masked). The live connector path is unchanged; only the developer-facing debug dump is masked (#148)
* **oauth:** the OAuth token-refresh request now sends `grant_type` / `client_id` / `client_secret` / `refresh_token` in an `application/x-www-form-urlencoded` **POST body** instead of the GET query string, so the client secret and refresh token no longer appear in the request URL — where they leak via the proxy / CDN / server access logs that routinely record full URLs with their query strings. Verified the Bitrix auth server (`oauth.bitrix24.tech`) accepts the body form. No behaviour change for callers (#149)
* **logging:** a credential-handling audit of the surfaces **outside** the core HTTP layer closes the debug-log leaks the #151/#229 redactor never reached, and adds `signature` (the Pull channel HMAC) to the redactor's key set. **Pull** carried the most: the JSON-RPC layer logged unknown / error server frames verbatim (an opaque frame can carry a channel `signature`), and `PullClient`'s `logMessage` / broadcast-error / `attachCommandHandler` contexts logged raw `{ command, params, extra }` — all now run through `redactSensitiveParams`; the `CHANNEL_EXPIRE` channel-refresh log no longer stringifies the `TypeChanel` object (which carries a `.signature`), emitting `[updated]`; and an unparseable raw wire frame now logs only its byte length, never its content. **Frame** leaked auth tokens three ways: the `init` log dumped the full handshake (`AUTH_ID` / `REFRESH_ID` / `MEMBER_ID` plus the app `*_OPTIONS` stores) and is now a safe allowlist projection (`PLACEMENT` / `LANG` / `INSTALL` / `IS_ADMIN` / `FIRST_RUN`); the inbound `postMessage` handler logged `event.data` (which carries the refreshed token) and now logs only the callback id / origin; and the outbound `send` log dumped the assembled `cmd` string (which carries serialised `setAppOption` / `setUserOption` values) and now logs only the command + callback key. **Hook** parse / format errors no longer echo the webhook URL — the secret sits in its path (`/rest/<userId>/<secret>/`). OAuth and the helper were walked and found clean. The shared-origin `localStorage` pull-config cache is documented as accepted residual risk (tracked for re-evaluation in #242); deeper hardening is tracked in #241 / #243 / #244. Regression specs pin each surface; no behaviour change for callers (#43)
* **pull:** `PullClient.destroy()` now drops the cached pull config (`localStorage` key `bx-pull-config`) on teardown. That cache holds the push `jwt` and the per-channel `signature` HMACs; previously it lingered in `localStorage` after the client was gone — readable by any same-origin script and surviving reloads / tabs. A torn-down client is terminal, so a fresh instance simply re-fetches the config. Cache *freshness* was already enforced (`isConfigActual` rejects a config whose `config_timestamp` / `exp` / channel `end` has passed, and `loadConfig` evicts it); this closes the *persistence* half of the #43 audit's accepted-risk note. `setConfig` also refuses to re-persist once disposed, so an in-flight `loadConfig()` that resolves after `destroy()` cannot write the secrets back (#242)
* **frame:** `MessageManager` now logs a `warning` when it rejects an inbound `postMessage` from an unexpected origin — recording only the rejected and expected origins, never `event.data` (which may carry an `AUTH_ID` / `REFRESH_ID`). Previously the foreign-origin check dropped the message silently, leaving no signal for a probe attempt or a misconfigured parent origin. A detection / debugging aid only; the security behaviour (reject non-matching origins) is unchanged, and the warning is emitted once per distinct origin so a peer spamming `postMessage` can't flood the sink (#244)
* **http:** the `post/catchError` log now length-caps the serialised `error.response.data` via the shared `truncateForLog` (the same ~300-char cap `post/send` / `post/response` already use) — previously the error body was logged in full, so a large response (an HTML error page, a big validation dump) flooded every wired logger sink on each failed call, and an oversized body widened the residual exposure beyond the redactor's known-key coverage. Hygiene + defence-in-depth; the redaction layer is unchanged (#236)

### Chore

* **refactor(batch):** the soft-error envelope guard (`!response.isSuccess` → surface the top-level errors and skip per-row parsing) is now a single template method on `AbstractProcessing`: `prepareItems` / `handleResults` short-circuit there once and delegate the success path to per-version `_prepareItemsSuccess` / `_handleResultsSuccess` hooks. Previously the #145 fix was copy-pasted into both `AbstractProcessingV2` and `AbstractProcessingV3` (× `prepareItems` + `handleResults` = four copies), so a future `AbstractProcessingV4` — or an edit to one copy and not the others — could silently reintroduce the #145 `TypeError` crash. No behaviour change: the #145 soft-error test passes unchanged (#228)
* **test(batch):** a unit test now pins that every `RestrictionManager.BUILT_IN_SOFT_ERROR_CODES` entry is classified **soft end-to-end** by `AbstractHttp.call()` — it returns an `AjaxResult` carrying the error rather than throwing — so a dropped or mistyped entry (which would silently turn a soft code into a throw) turns CI red. Also clarified, in the `getErrorsByKey()` JSDoc and the `Result` docs, that batch per-command error keys are meaningful only for **object / named-command** batches; **array-mode** batches use generated UUID keys (not the numeric command position), so prefer `getErrors()` / `getErrorMessages()` there. Behaviour intentionally unchanged (#230)
* **ci(deps):** give Dependabot a `cooldown` (3 days, both ecosystems) so it proposes only aged versions — cutting the churn that made the `npm-minor-patch` group repeatedly fail CI's pnpm `minimumReleaseAge` supply-chain guard (#233 / #248) — and drop the npm `dependencies` label that did not exist in the repo (Dependabot logged a config error on every npm PR). The cooldown gates direct bumps, not pnpm's transitive resolution, so it reduces rather than eliminates the guard trips (#249)
* **ci:** split the single `release.yml` back into two sibling publish workflows — `npm-publish-js-sdk.yml` (`@bitrix24/b24jssdk`) and `npm-publish-js-sdk-nuxt.yml` (`@bitrix24/b24jssdk-nuxt`). npm OIDC trusted publishing keys each package's Trusted Publisher entry to one exact workflow filename, and both were registered under these two names; the consolidated `release.yml` (#194) therefore failed the OIDC token exchange with a 404 (`ERR_PNPM_AUTH_TOKEN_EXCHANGE`) and fell back to an unauthenticated publish that npm rejected. The two workflows keep all of `release.yml`'s guards (version lockstep, tag-match, already-published, Nuxt `__SDK_VERSION__` replacement, `next` dist-tag for pre-releases, SHA-pinned actions, and the Pages-permission grant on the reused `ci.yml`). Re-consolidating later requires a repo/org admin to first repoint both packages' Trusted Publisher filename on npm — documented in `RELEASING.md`
* **deps(jssdk-nuxt):** drop phantom runtime deps `axios` / `qs-esm` / `luxon` (and the orphaned `@types/luxon`) — never imported by the module, which only wraps `@bitrix24/b24jssdk` (already owns them); lightens every Nuxt consumer's install (#180)
* **ci(docs):** add `markdownlint` + an internal-link check over `AGENTS.md` and `.github/contributing/*.md` (permissive config; a renamed/moved link target now fails CI). The link check immediately caught 7 stale `../../.claude/skills/*` links, repointed to `skills/*` (#54)
* **ci(docs):** a one-time formatting sweep re-enables the auto-fixable markdownlint rules the permissive #54 baseline had to disable — **MD022/031/032/012** (whitespace around headings/fences/lists, no multiple blanks) and **MD040** (fenced-code-language) are back on; only **MD013** (line length), **MD033** (inline HTML — `<sub>`/`<details>` are deliberate) and **MD060** (table-column-style — 110 cosmetic hits, tracked separately) stay off by choice (documented in the `.markdownlint.json` `$comment`). The sweep tagged the bare ASCII-tree / template / diagram fences `text`, fixed a markdown-in-markdown example that mis-nested a ` ```ts ` fence inside a ` ```md ` block (now a 4-backtick outer fence) plus the latent blockquote-spacing defect it exposed, kept one justified `^# ` code-span exception inline-disabled, widened the `lint:md` glob to `.github/contributing/**/*.md`, and added a `lint:md-fix` script for the next sweep (#214)
* **dx:** `contributing:typecheck` and `docs:typecheck-blocks` now fail with an actionable "run `pnpm run dev:prepare`" message instead of a cryptic `TS2307` when the SDK types haven't been built yet (#109)
* **dx:** the #109 "run `pnpm run dev:prepare`" SDK-types preflight is extracted to a single shared `scripts/_require-sdk-types.mjs` helper — the marker path and message previously lived in three places across `contributing-typecheck.mjs` / `docs-typecheck.mjs` (one a stale second copy) — and is locked by a fixture test (types missing → exit 1 with the actionable message; present → proceeds) (#213)
* **test(contributing):** compile-check the high-value contributing-guide snippets — the `LoggerFactory.forcedLog` four-arg deprecation pattern, the `B24Hook` quick-start, and the public `Result` type — each with a "Compile-checked example" footnote so drift turns red in CI (#108)
* **ci(docs):** `docs-lint` now errors on a frontmatter `links:` `blob/main/` target whose file is missing (catches renamed/deleted source links — #117), and `docs-link-check` rejects relative `./`/`../` links in `docs/content/docs/` — internal cross-page links must be site-absolute `/docs/…` (#102)
* **docs:** fix a double-hash in-page anchor (`](##…)` → `](#…)`) that silently broke the "Additional options" link on the batch-by-chunk `restApi:v2`/`v3` pages (#131)
* **docs:** remove the "We are still updating this page" WIP banner from the 23 `audited:` pages it contradicted (kept on the 6 genuinely in-progress, non-audited pages), per the `documentation.md` "remove the banner when the page is complete" rule (#170)
* **ci(deps):** add the `npm` ecosystem to Dependabot — minor + patch updates grouped into a single weekly PR so direct dependencies stay current — and document the transitive-override retirement process in `pnpm-workspace.yaml` (#175)
* **chore(playgrounds/cli):** housekeeping + bug-fix pass on the example CLI (playground-only — `packages/jssdk` untouched): dedup the logger + `B24Hook` init into a shared `createB24Client()` helper, replace deep `process.exit(1)` with a typed `SdkError` caught at `runMain`, drop `as any` in favour of typed `GetPayload<…>` / `instanceof` narrowing, enable `noUncheckedIndexedAccess`, fix a `deals.ts` count-before-flush bug and a silent WON/LOSE stage fallback, and gate emoji log prefixes behind a TTY check so CI logs stay clean (PR-1 of #47) (#273)
* **ci(playgrounds/cli):** nightly `smoke-retry` regression workflow (manual dispatch + schedule, gated on a webhook secret, never runs on PRs) for the #45/#44/#46 retry-policy scenarios, plus `cli-utils.unit.spec.ts` so the existing portal-free `jsSdk:unit` gate covers the playground's pure utils (PR-2 of #47, closes it) (#274)
* **ci(playgrounds/cli):** point the `smoke-retry` nightly at the already-configured `NUXT_BITRIX24_TEST_WEBHOOK_URL` secret (mapped onto the `B24_HOOK` env the CLI reads) instead of an unconfigured `B24_HOOK` secret that would have always skipped (#276)

## [1.3.0](https://github.com/bitrix24/b24jssdk/compare/v1.2.0...v1.3.0) (2026-06-16)

### Features

* **core:** `Result.getErrorsByKey()` / `getErrorMessagesByKey()` — keyed error accessors that preserve the batch request label (`Record<string, Error>` / `Record<string, string>`), so `isHaltOnError: false` callers can tell which request failed. Existing `getErrors()` / `getErrorMessages()` are unchanged (#184)
* **core:** the API v3 supported-methods allowlist (`versionManager.#supportMethods`) now covers the newly-published rest-v3 modules — `mail.*` (24), `humanresources.*` (22), `timeman.record.*` (read-only, 3) — plus new `tasks.task.*` (`result.*`, `*.field.list`/`field.get`) and `main.eventlog.field.*`. `actions.v3.*` now routes to them (it previously threw `JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3`), and `actions.v2.*` callers get the existing, non-breaking "worth migrating to v3" warning. The methods are published by Bitrix24, but the new entries carry no `// done` marker yet: routing is wired, not maintainer-verified end-to-end against a live portal. Cross-module references on those pages (`user.get`, `im.*`, `disk.*`) are deferred to their own modules. Adds a `version-manager` unit test that pins the allowlist and the v2/v3 selection logic (#203)

### Bug Fixes

* **http:** a 401 `expired_token` / `invalid_token` response now refreshes the token and retries the request once on every entry point (`B24Frame`, `B24OAuth`, `B24Hook`). Previously the auth-retry branch was silently skipped, so the 401 surfaced to the caller on the first attempt — e.g. a long-lived Frame app idling past the access-token TTL (#182)
* **actions:** `callList` / `fetchList` (v2 and v3) gain a `cursorIdKey` option so keyset pagination works when a method sorts/filters by one field name but returns another — e.g. `tasks.task.list` sorts by `ID` (uppercase) yet returns a lowercase `id`. Previously the single `idKey` drove both the request cursor and the response read, so the default silently stopped after the first 50 records (the `b24jssdk-rest` skill cheat sheet recommended that broken config — now corrected). The helpers now also log a `warning` when a full page is returned but no numeric id can be read via `idKey` (#185)

### Security

* **deps:** pin `esbuild` to `>=0.28.1` via a pnpm override — clears the high-severity advisory GHSA-gv7w-rqvm-qjhr (esbuild's Deno module fetched its native binary without integrity verification → RCE via `NPM_CONFIG_REGISTRY`; affected `>=0.17.0 <0.28.1`) that `pnpm audit --audit-level=high` was failing CI on repo-wide. esbuild is a transitive build dependency (Vite / Nuxt tooling); all instances collapse to a single 0.28.1. The path was already unreachable here (Node-only project, and `allowBuilds: esbuild: false` blocks esbuild's install script) — the override clears the audit gate and adds defense-in-depth (#196)
* **deps:** pin `form-data` to `>=4.0.6` and `vite` to `>=7.3.5 <8` via pnpm overrides — clears two high-severity advisories that `pnpm audit --audit-level=high` began failing CI on repo-wide (form-data GHSA-hmw2-7cc7-3qxx: unsafe random boundary, `<4.0.6`; vite GHSA-fx2h-pf6j-xcff: `server.fs.deny` bypass on Windows, `>=7.0.0 <=7.3.4`). Both are transitive docs/build tooling (`docs` → … → axios / vite), not in the published `@bitrix24/b24jssdk*` packages; vite is capped below the v8 major so it stays a `7.3.3 → 7.3.5` patch (#199)
* **ci:** pin every third-party GitHub Action to a full commit SHA (`uses: …@<sha> # vX.Y.Z`) so a moved or compromised mutable tag can't inject code into the OIDC-privileged publish jobs in `release.yml` (a supply-chain takeover of the npm release). Bundles the safe half of the Dependabot bump #135 — `pnpm/action-setup` v5 → v6 (pnpm 11 support); `actions/download-artifact` is held at v7 (its v8 is a breaking major with no matching `upload-artifact` v8 yet). Dependabot keeps the SHAs current. The other two items in #152 — moving `release.tag_name` out of inline `run:` interpolation, and `--frozen-lockfile` on the Pages build — were already resolved by #177 and #111 (#152)

### Chore

* **docs-lint:** audit-freshness now tracks source-code link targets only — Markdown sources (skills, `AGENTS.md`, `CHANGELOG.md`) no longer staleify the pages that cite them, removing the 1→N `audited:` bump cascade on every skill/changelog edit (#190)
* **nuxt:** the Nuxt module's `meta.version` is now injected from `package.json` at build time via the `__SDK_VERSION__` token (matching the core SDK) instead of a hand-maintained literal in `module.ts`, so `release:bump` can no longer leave it stale; CI and the publish workflow both fail if the token is left unreplaced (#119)
* **ci:** a release now runs through a single `release.yml` — one CI invocation instead of two, then `@bitrix24/b24jssdk` and `@bitrix24/b24jssdk-nuxt` publish sequentially (core first, since the Nuxt module depends on the released core version) behind a combined status gate, so a partial release turns the run red instead of passing unnoticed. Replaces the two separate `npm-publish-*` workflows; CI also gained an `actionlint` gate so workflow errors are caught on PRs (#177)
* **ci:** the docs site is built once per push to `main` — `deploy.yml` is removed and its Pages build + deploy fold into `ci.yml` (the `docs-build` job uploads the Pages artifact; a new `deploy` job ships it), eliminating the duplicate `docs:generate` that previously ran in both workflows on every main push. PRs still validate the docs build (#111)
* **docs:** add a [`RELEASING.md`](RELEASING.md) runbook — the bump → changelog → tag → publish flow (single `release.yml`, npm OIDC trusted publishing, partial-release recovery) plus a bus-factor/handover checklist, so cutting a release is no longer tribal knowledge — though the account-level items (a second npm publisher and a `CODEOWNERS` file) still need a repo/org admin (#171)
* **ci:** `release.yml` now publishes pre-release versions (e.g. `1.3.0-rc.1`) under the `next` dist-tag instead of `latest`, so a pre-release can't move `npm install` consumers off the last stable release; stable releases are unaffected (#198)
* **test(docs-lint):** add fixture coverage for `scripts/docs-link-check.mjs` — the last untested script in the docs-lint pipeline. Valid internal/index/heading-fragment/frontmatter links pass; a missing page, a missing frontmatter `to:` target, and a missing heading fragment each fail the check. The script gained a `DOCS_LINK_CHECK_ROOT` override so the tests run against a temp fixture instead of the live docs tree (#118)

## [1.2.0](https://github.com/bitrix24/b24jssdk/compare/v1.1.2...v1.2.0) (2026-05-29)

### Features

* **skills:** new public [`skills/`](https://github.com/bitrix24/b24jssdk/tree/main/skills) directory with 7 task-focused skill files for AI coding agents — `b24jssdk-core`, `b24jssdk-rest`, `b24jssdk-filtering`, `b24jssdk-frame-ui`, `b24jssdk-helpers`, `b24jssdk-recipes`, `b24jssdk-vibecode`. Designed for selective consumption (load only what the current task needs). Landing page: [/docs/getting-started/ai/skills](https://bitrix24.github.io/b24jssdk/docs/getting-started/ai/skills/) (#38, #114)
* **examples:** 12 end-to-end SDK-native recipes published at [/docs/examples](https://bitrix24.github.io/b24jssdk/docs/examples/) — CRM analytics, mass messaging, task automation, ERP sync, disk files, Telegram bot, webhook handler, AI assistant, web-search LLM, error-handling cookbook, outbound event registration, OAuth install. Each recipe ships as a typed `.ts` file under `skills/b24jssdk-recipes/examples/`, type-checked in CI via `pnpm run skills:typecheck` (#38)
* **docs(reference):** 29 new reference pages covering `B24Hook`, `B24OAuth`, frame sub-managers (`auth`, `dialog`, `slider`, `placement`, `parent`, `options`, `initializeB24Frame`), pull client, core/tools/types, error codes, telemetry, plus 3 worked examples (#114)

### Bug Fixes

* **http:** stop retrying HTTP 4xx client errors. Retryability was decided by a hardcoded error-code allowlist, so any 4xx whose code was not enumerated (e.g. v3 validation errors, `tasks.task.pause` code `1048582`) fell through and burned `maxRetries` round-trips on a deterministic failure. `RestrictionManager.handleError` now gates on HTTP status: 4xx (except `429` rate/operating limit and `408` request timeout) fails fast on the first attempt. Soft codes still surface via `AjaxResult`. Closes #44, #46 (#45)

### Security

* **deps:** bump `nuxt` to `^4.4.6` across all workspaces — fixes reflected XSS in `navigateTo()` external redirects (GHSA-fx6j-w5w5-h468) and shared-cache poisoning via `__nuxt_island` endpoint (GHSA-g8wj-3cr3-6w7v) (#86)
* **deps:** add pnpm overrides for transitive vulnerabilities — `fast-uri >=3.1.2` (path traversal GHSA-q3j6-qgpj-74h6, host confusion GHSA-v39h-62p7-jpjc), `devalue >=5.8.1` (DoS sparse array GHSA-77vg-94rm-hx3p), `hono >=4.12.18` (CSS injection, cache leakage, JWT validation GHSA-qp7p-654g-cw7p), `ws >=8.20.1` (memory disclosure GHSA-58qx-3vcg-4xpx), `qs >=6.15.2` (DoS stringify GHSA-q8mj-m7cp-5q26), `ip-address >=10.1.1` (XSS GHSA-v2v4-37r5-5v8g), `brace-expansion >=5.0.6` (DoS GHSA-jxxr-4gwj-5jf2) (#86)

### Chore

* **deps:** upgrade pnpm `10.33.2` → `11.4.0`; migrate overrides from `package.json` to `pnpm-workspace.yaml` (pnpm v11 requirement) (#86)
* **pnpm-workspace:** replace deprecated `ignoredBuiltDependencies` / `onlyBuiltDependencies` with `allowBuilds` map (pnpm v11 requirement) (#86)
* **vitest:** add `jsSdk:unit` project for portal-free unit tests; exclude `*.unit.spec.ts` from `jsSdk:integration` to prevent duplicate test execution (#86)
* **ci:** add unit-test step (`vitest run --project jsSdk:unit`) and security-audit step (`pnpm audit --prod --audit-level=high`) to CI workflow (#86)
* **ci:** parallelize lint, typecheck, build, and docs-build jobs (#92)
* **ci(docs):** type-check TS code blocks in `docs/content/docs/` (104 blocks, 0 errors) (#87)
* **test(some-code-from-docs):** compile-check canonical contributing snippets (#88)

### Docs

* **agents:** introduce `AGENTS.md` and `.github/contributing/` guides (`package-structure.md`, `transports-and-results.md`, `testing.md`, `documentation.md`, `maintenance.md`, `report.md`, `suggested-examples.md`), `CLAUDE.md` reduced to a single-line redirect to `AGENTS.md` (#35, #59, #114)
* **README:** full rewrite — badges, three entry points (`B24Hook` / `B24Frame` / `B24OAuth`), Quick Start (#114)
* **cookbook:** 5 cookbook recipes + REST page lint + `audited:` freshness contract (#36)
* **examples landing:** refresh `/docs/examples` to list all 20 recipes — Cookbook (5) / Extended catalogue (12) / UI showcases (3) (#116)
* **logging:** document credential redaction in HTTP layer (#67), log-archive audit patterns + logging hygiene cross-link (#75) — see [/docs/working-with-the-rest-api/logging/](https://bitrix24.github.io/b24jssdk/docs/working-with-the-rest-api/logging/) (#52)
* **examples (code align):** align inline TS examples with v1.1.0 / v1.1.1 type changes (#37)
* **homepage:** examples nav cleanup, top-nav entry, cookbook + extended-catalogue sections (#104), card hover polish (#107), vite optimizeDeps + homepage improvements (#115)
* **prerender / 404:** register 12 recipe pages in prerender list (#95), resolve remaining `docs:generate` failures (#99), absolute paths in examples index (#101), GitHub Pages 404 for trailing-slash URLs (#100)
* **maintenance:** weekly `llms-full.txt` triage playbook (#97), VibeCode sync playbook v2 (#98)
* **contributing:** reflect v1.1.2 transport hardening in `transports-and-results.md` (#76)
* **skills relocation cleanup:** repair 43 stale frontmatter `links:` after `.claude/skills/` → `skills/` relocation (#116)

## [1.1.2](https://github.com/bitrix24/b24jssdk/compare/v1.1.1...v1.1.2) (2026-05-18)

### Security

* **http:** stop logging the full webhook URL in the `post/send` info-level log — only the bare REST method name (e.g. `user.current`) enters the logger context, preventing webhook-secret disclosure to user-supplied loggers wired via `B24Hook.setLogger(...)`. The `post/response` and `post/catchError` callsites stay URL-free as well. (#39)
* **http:** redact credential-bearing keys (`auth`, `password`, `token`, `secret`, `access_token`, `refresh_token`) from the serialised `params` blob that enters the `post/send` info log. Closes a smear path for `B24OAuth`/`B24Frame` where `_prepareParams` injects `auth = access_token` into the request body on every call. (#39)
* **http\AjaxError:** redact the same credential-bearing keys from `requestInfo.params` at error-construction time so they do not leak via `AjaxError.toJSON()` / `toString()` if the caller passed sensitive fields directly in their REST payload. (#39)
* **http\AjaxError:** drop the unused `url` field from `requestInfo` typing, `toString()`, and `formatErrorMessage()` so a future change cannot accidentally re-introduce the original webhook-URL leak through error rendering. (#39)

### Migration (affects `>= 1.1.0, < 1.1.2`)

* Update to 1.1.2.
* If you wired a custom logger via `setLogger(...)` on any 1.1.x release, audit historical log sinks (stdout, files, third-party aggregators) for entries matching `/rest/{userId}/{secret}/` (webhook auth) or `"auth":"<token>"` (OAuth / Frame) and rotate the corresponding credentials.
* Downstream redaction shims (e.g. `templates-mcp`'s `logger-redactor`) remain useful as defence in depth — keep them in place.

## [1.1.1](https://github.com/bitrix24/b24jssdk/compare/v1.1.0...v1.1.1) (2026-05-15)

### Features

* **limiters\RestrictionParams:** add `retryOnNetworkError` flag — set to `false` to throw immediately on `NETWORK_ERROR` / `REQUEST_TIMEOUT` instead of retrying. Important for non-idempotent calls (e.g. `crm.documentgenerator.document.add`) where retries can create duplicates
* **limiters\RestrictionParams:** add `hardErrorCodes` and `softErrorCodes` — merge custom REST error codes into the built-in hard/soft lists so business-specific codes can opt out of automatic retry or be returned as soft errors via `AjaxResult` (#24)
* **limiters\RestrictionManager:** expose `BUILT_IN_HARD_ERROR_CODES` / `BUILT_IN_SOFT_ERROR_CODES` as readonly static fields so callers can introspect the defaults

### Bug Fixes

* **batch:** preserve `null` results in batch responses — previously coerced to `{}` via `resultData ?? {}`, which broke nullable interfaces (e.g. `im.chat.get` with non-matching params) and hid the difference between "no data" and "empty object"
* **batch-v3:** tighten response parsing — drop the misleading `result_error`/`result_time` split (a v2-only envelope shape), guard against missing entries in the all-or-nothing v3 model, and stop polluting per-method stats with cross-method failures (#23)

### Chore

* **release:** add `pnpm run release:bump <version>` ([scripts/bump-version.mjs](scripts/bump-version.mjs)) — updates root + both package workspaces in lockstep, refreshes the pnpm lockfile, refuses on out-of-sync versions / invalid semver / no-op bumps
* **ci:** unify CI into `.github/workflows/ci.yml`; both npm publish workflows now gate on green CI, matching versions across all three `package.json` files, the GitHub release tag matching the version, and the `package@version` not already being on npm. `workflow_dispatch` is restricted to `main`

### Docs

* **limiters:** expand long-running request guidance and cross-link the new retry / error-code knobs
* **batch:** document `null` result passthrough and the v3 all-or-nothing model
* **test:** document required webhook scopes for the integration suite (`main` scope for webhook tests)

## [1.1.0](https://github.com/bitrix24/b24jssdk/compare/v1.0.6...v1.1.0) (2026-05-08)

### ⚠ BREAKING CHANGES

* **frame\selectCRM:** result buckets are now real arrays instead of `Record<string, SelectedCRMEntity>`, matching the documented `SelectedCRM` types. Code using array operations keeps working; code that relied on numeric-key record access must switch to array access (#21)
* **types\AjaxResult.getData():** return shape narrowed to `{ result: P, time: PayloadTime }`. The v2-only envelope fields `next` and `total` are no longer exposed on the success type — restApi:v3 has no counterpart for them (#22)

### Deprecations

* **AjaxResult paging helpers:** `isMore`, `hasMore`, `getNext`, `fetchNext`, `getTotal` are deprecated and scheduled for removal in 2.0.0. Use `b24.actions.v{2,3}.{callList,fetchList}.make` instead — these hide pagination for both API versions (#22)
* **AbstractB24 low-level helpers:** `callMethod`, `callBatch`, `callBatchByChunk`, `callListMethod`, `fetchListMethod` are deprecated in favour of `b24.actions.v{2,3}.*` (#22)

### Bug Fixes

* **frame\selectCRM:** normalise parent-window response buckets via `Object.values` so `.length` / `.map` and the documented array shape work as expected; pre-existing arrays pass through untouched (#21)
* **placement\setValue:** add `placement.setValue(value: unknown)` helper that JSON-serialises for the caller, add a `call('setValue', { value: string })` overload to surface the requirement, and throw `TypeError` from `call()` when `value` is not a string instead of silently shipping `[object Object]` on the wire (#20)
* **types\AjaxResult.getData():** narrow result to the generic type — single REST calls no longer leak `T[]` / `BatchPayloadResult<T>` from the previous `SuccessPayload<P>` union (#22)

### Docs

* **placement:** document the `setValue` JSON-string constraint and the new helper
* **frame\dialog:** flesh out `selectAccess` / `selectCRM` coverage with parameter tables and data-type references
* **rest-api\CallV2 / CallV3:** correct `.getData()` return type after #22; drop the deprecated `.isMore()` bullet from the v2 page
* **api-v3:** add internal reference
* **README-AI:** top-level deprecation notice mapping legacy helpers to their `actions.v{2,3}.*` replacements

## [1.0.6](https://github.com/bitrix24/b24jssdk/compare/v1.0.5...v1.0.6) (2026-05-04)

### Bug Fixes

* **callList/fetchList** ignored cursor filter, breaking pagination

### Docs

* improve

## [1.0.5](https://github.com/bitrix24/b24jssdk/compare/v1.0.4...v1.0.5) (2026-03-28)

### Features

* **playgrounds\cli:** CLI command to mass generate deals

### Bug Fixes

* **B24HelperManager\CurrencyManage:** improve batch call

## [1.0.4](https://github.com/bitrix24/b24jssdk/compare/v1.0.3...v1.0.4) (2026-03-06)

### Bug Fixes

* **B24HelperManager:** improve batch call
* **B24HelperManager\OptionsManager:** improve batch call

## [1.0.3](https://github.com/bitrix24/b24jssdk/compare/v1.0.2...v1.0.3) (2026-02-26)

### Bug Fixes

* **ListPayload**: remove any from the union 

## [1.0.2](https://github.com/bitrix24/b24jssdk/compare/v1.0.1...v1.0.2) (2026-02-17)

### Bug Fixes

* **core\RestrictionManager:** add the error code 'ERROR_ENTITY_NOT_FOUND' to the soft exception
* **playground\cli:** increased the number of entities created
* **UMD:** : improve build min version

## [1.0.1](https://github.com/bitrix24/b24jssdk/compare/v0.5.1...v1.0.1) (2026-02-02)

### ⚠ BREAKING CHANGES

For ease of migration, the new version retains compatibility with v0.5.1.
Please see the full [SDK v1 migration guide](https://bitrix24.github.io/b24jssdk/docs/getting-started/migration/v1/)

### Features

* **core:** add tools and actions
* **apiVersion:** support api 3
* **core\logger:** add new logger system
* **core\TypeHttp:** now return ajaxClient
* **core\SdkError:** add SdkError
* **core\restrictions:** new restrictions
* **b24Frame\PlacementManager**: use the property name `placement` instead of `title`
* **core\logger\handler\TelegramHandler:** add Telegram handler
* **tools\environment:** added tool for environment detection

### Docs

* **use Bitrix24 UI** (llms and more demo)

## [0.5.1](https://github.com/bitrix24/b24jssdk/compare/v0.4.10...v0.5.1) (2025-10-29)

### Features

* **AuthActions.getAuthData:** fix `expires` and add `expires_in`

## [0.4.10](https://github.com/bitrix24/b24jssdk/compare/v0.4.9...v0.4.10) (2025-10-09)

### Features

* **B24OAuth:** add CustomRefreshAuth

### Bug Fixes

* **Http.#prepareMethod:** telemetry transfer to task methods

## [0.4.9] (2025-09-12)

_No user-facing changes (empty release)._

## [0.4.8] (2025-09-12)

_No user-facing changes (empty release)._

## [0.4.7](https://github.com/bitrix24/b24jssdk/compare/v0.4.6...v0.4.7) (2025-09-12)

### Bug Fixes
* **MessageManager:** fix null value

## [0.4.6](https://github.com/bitrix24/b24jssdk/compare/v0.4.5...v0.4.6) (2025-09-11)

### Features
* **MessageManager:** add param isRawValue `MessageManager.send`, `PlacementManager.call('setValue', { value: 'some string' })`
* **README:** add AI usage guide for Bitrix24 SDK

### Chore
* **deps:** update

## [0.4.5](https://github.com/bitrix24/b24jssdk/compare/v0.4.4...v0.4.5) (2025-07-07)

### Features
* **Http:** batch now can return AjaxResult in response
* **TypeManager:** support for type casting in check functions


## [0.4.4](https://github.com/bitrix24/b24jssdk/compare/v0.4.3...v0.4.4) (2025-07-01)

### Features

* **B24Hook:** add fromWebhookUrl
* **EventOnAppUnInstallHandlerParams:** improve

## [0.4.3](https://github.com/bitrix24/b24jssdk/compare/v0.4.2...v0.4.3) (2025-05-22)

### ⚠ BREAKING CHANGES
* **AuthHookManager:** fix getTargetOrigin, getTargetOriginWithPath

### Features

* **B24LocaleMap:** add map for B24LangList and Locale
* **types/bizproc/activity:** add some type for `bizproc.activity`
* **types/bizproc:** add some type/functions for `bizproc`
* **types/crm:** add convertor EnumCrmEntityTypeId to EnumCrmEntityTypeShort
* **types/events:** add some interface for EventHandler
* **B24OAuth:** add `issuer` for B24OAuthParams

### Docs

* **we will add new information in the next update**
* for `OAuth` work it is worth looking at an example [@bitrix24/b24sdk-examples/08-nuxt-oauth](https://github.com/bitrix24/b24sdk-examples/tree/main/js/08-nuxt-oauth)

## [0.4.2](https://github.com/bitrix24/b24jssdk/compare/v0.4.1...v0.4.2) (2025-05-08)

### ⚠ BREAKING CHANGES

* **Node.js:** support only Node.js >= 18.0.0
* **uuidv7:** improve

### Features

* **B24OAuth:** add - not a stable implementation - not worth using for now

## [0.4.1](https://github.com/bitrix24/b24jssdk/compare/v0.4.0...v0.4.1) (2025-05-07)

### ⚠ BREAKING CHANGES

* **Node.js:** support only Node.js >= 20.0.0

### Bug Fixes
* **uuidv7:** improve

## [0.4.0](https://github.com/bitrix24/b24jssdk/compare/v0.3.0...v0.4.0) (2025-05-07)

### ⚠ BREAKING CHANGES

* **commonjs:** not support commonjs, only esm and umd
* **Node.js:** support only Node.js >= 18.0.0

### Bug Fixes

* **uuidv7:** support Node.js (Issue #2)

### Chore
* **pullClient:** support Node.js types
* **browser:** add for test UMD
* **esm:** add for test ESM

## [0.3.0](https://github.com/bitrix24/b24jssdk/compare/v0.2.3...v0.3.0) (2025-05-06)

### Features

* **Http:** improve some request params

### Chore

* **deps:** improve

## [0.2.3](https://github.com/bitrix24/b24jssdk/compare/v0.2.2...v0.2.3) (2025-04-30)

### Features

* **PlacementManager::callCustomBind:** make bind for custom events

## [0.2.2](https://github.com/bitrix24/b24jssdk/compare/v0.2.1...v0.2.2) (2025-04-26)

### Features

* **types:** add types for catalog scope, TextType, order, EnumCrmEntityTypeShort, CrmItemProductRow, CrmItemPayment, CrmItemDelivery

## [0.2.1](https://github.com/bitrix24/b24jssdk/compare/v0.2.0...v0.2.1) (2025-04-25)

### Features

* **tools:** add pick, omit and isArrayOfArray functions

### Bug Fixes
* **placement.bindEvent:** restore callBack

## [0.2.0](https://github.com/bitrix24/b24jssdk/compare/v0.1.7...v0.2.0) (2025-04-24)

### Features

* **Result\AjaxResult\AjaxError:** change code-style, improve error collection
* **Http.batch:** improve error collection

### Chore

* **code-style:** improve
* **deps:** remove prettier, npm-run-all, improve vitepress

## 0.1.7 (2025-01-25)

### Features

* **new methods**: PlacementManager::getInterface, PlacementManager::bindEvent, PlacementManager::call

## 0.1.6 (2024-11-22)

- fix FormatterNumbers -> check navigator
- fix Http -> check `error_.response` & check window
- add dependencies @types/luxon
- add docs/guide/example-hook-node-work

## 0.1.5 (2024-11-20)

- add warning about client-side query execution

## 0.1.4 (2024-11-18)

- migrate to `qs-esm`

## 0.1.3 (2024-11-18)

- Fix the error at fetchListMethod

## 0.1.2 (2024-11-18)

- The `protobufjs` module has been moved to internal

## 0.1.1 (2024-11-16)

- fix code Style

## 0.1.0 (2024-11-16)

### Features

- Hooks like initializeB24Frame, useB24Helper, and useFormatter simplify development.
- Text, Type, Pull, Slider, Feedback, LicenseManager, CurrencyManager, RestrictionManager...

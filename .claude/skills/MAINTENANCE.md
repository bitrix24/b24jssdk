# Weekly llms-full.txt review — playbook

`docs/llms-full.txt` is a generated dump of the VibeCode docs (`https://vibecode.bitrix24.tech`). The user re-pulls it once a week and wants the b24jssdk skills kept in sync with the new content. This file is the playbook for that recurring task.

When the user says **"разбери llms-full.txt"** / **"обнови по новым данным"**, follow these steps in order.

## 0. Sanity check

```bash
head -3 /home/user/b24jssdk/docs/llms-full.txt
wc -l /home/user/b24jssdk/docs/llms-full.txt
grep -c '```' /home/user/b24jssdk/docs/llms-full.txt
```

Expected:
- Line 1 starts with `# VibeCode — Complete Documentation`.
- Line 3 has the `# Generated:` timestamp — record it.
- Code-fence count is even (number of code blocks = `count / 2`).

If the format changed (e.g. line 1 isn't a VibeCode header), stop and ask the user — the generator likely rewrote.

## 1. Diff against the last pulled version

```bash
git -C /home/user/b24jssdk diff HEAD~1 -- docs/llms-full.txt | head -200
git -C /home/user/b24jssdk log --oneline -- docs/llms-full.txt | head -5
```

We only care about changes that affect the **public, end-user-visible surface**. Specifically look for:

- New top-level sections (`^# `) — count and names.
- New `Recipe:` entries (`^# Recipe:`).
- Renamed / removed Recipe entries.
- Changes inside the **Filtering**, **Batch**, **Limits**, **Errors** sections — operator/syntax-level, most likely to need a skill update.
- Changes inside the existing 9 recipe sections (CRM analytics, mass messaging, task automation, ERP sync, Disk, Telegram, webhook, AI assistant, web search + LLM).

Sections to ignore:
- `# Bot: …` per-endpoint pages (~lines 10900–16800) — auto-generated, cosmetic churn.
- `# Entity: …` per-endpoint pages (~lines 16800–40800) — same reason.
- `# AI Router`, `# MCP для AI`, `# Bot-platform Troubleshooting` — VibeCode-only, no SDK mapping.
- `# Инфраструктура`, `# Менеджмент-ключи`, `# Partner Connect` — VibeCode platform-internal.

## 2. Triage the diff

For each user-visible change, decide one of:
1. **Update existing skill** — surgical edit when an example or rule already in a skill must change.
2. **Add to SUGGESTED-EXAMPLES.md** — useful new pattern, no matching skill yet.
3. **Conspectus into REPORT.md** — ambiguous, requires a translation decision, or the SDK doesn't expose the surface yet.
4. **Skip** — purely cosmetic or VibeCode-only changes.

## 3. Translation rules — VibeCode → b24jssdk (current as of 2026-05)

| VibeCode (HTTP, with `X-Api-Key`) | b24jssdk (`actions.v{2,3}.*.make`) |
|---|---|
| `GET /v1/{entity}/:id` | `actions.v2.call.make({ method: 'crm.item.get', params: { entityTypeId, id } })` for CRM, `actions.v3.call.make({ method: 'tasks.task.get', params: { id, select } })` for tasks |
| `GET /v1/{entity}` (list) | `actions.v2.callList.make({ method: 'crm.item.list', params, idKey: 'id', customKeyForResult: 'items' })` |
| `POST /v1/{entity}/search` | same as list — Bitrix24 REST has no separate search endpoint |
| `POST /v1/{entity}` (create) | `actions.v2.call.make({ method: 'crm.item.add', params: { entityTypeId, fields } })` for CRM, v3 for `tasks.task.add` |
| `PATCH /v1/{entity}/:id` | `actions.v2.call.make({ method: 'crm.item.update', params: { entityTypeId, id, fields } })` |
| `DELETE /v1/{entity}/:id` | `actions.v2.call.make({ method: 'crm.item.delete', params: { entityTypeId, id } })` |
| `POST /v1/batch` (entity form) | `actions.v2.batch.make({ calls, options })` (object form for named results) |
| `POST /v1/batch` (>50 calls) | `actions.v2.batchByChunk.make({ calls, options })` |
| `X-Api-Key: vibe_api_…` | `B24Hook.fromWebhookUrl(…)` server / `initializeB24Frame()` in-frame / `new B24OAuth(…)` OAuth |
| Filter `{ "stageId": { "$gte": 100 } }` | v2: `{ '>=stageId': 100 }`. v3 array-triples: `[['stageId', '>=', 100]]` |
| Filter `{ "stageId": { "$ne": "LOST" } }` | v2: `{ '!stageId': 'LOST' }`. v3: `[['stageId', '!=', 'LOST']]` |
| Filter `{ "title": { "$contains": "x" } }` | v2 only: `{ '%title': 'x' }` (`=%` for explicit LIKE pattern). **v3 has no substring operator** — fall back to v2 or do client-side filtering. |
| Filter `{ "stageId": { "$in": [...] } }` | v2: `{ stageId: [...] }`. v3: `[['stageId', 'in', [...]]]` |
| `sort: { id: "asc" }` | `order: { id: 'asc' }` (object form only on v3, per `OrderStructure.php`) |
| `select: ["id", "name"]` | unchanged — `select: ['id', 'name']` |
| `limit` / `offset` | use `callList.make` / `fetchList.make` — paging is internal |

If a VibeCode endpoint has no Bitrix24 REST equivalent (AI Router, web search, infra), do NOT port it to the SDK — note it in `b24jssdk-vibecode` or `REPORT.md` instead.

## 4. Skill update conventions

- Keep TypeScript / ESM style throughout. No `fetch + X-Api-Key` examples in the SDK skills (except the documented AI-add-on pattern in `b24jssdk-vibecode`).
- Use `$b24.actions.v{2,3}.*.make({ method, params, requestId? })` everywhere. **Do NOT** introduce `b24.callMethod(...)` or `b24.callBatch(...)` — they're `@deprecated` for 2.0.0.
- Do NOT add MongoDB-style filter operators (`$gt`, `$ne`, `$contains`) anywhere in the b24jssdk skill set.
- Use `EnumCrmEntityTypeId` from `@bitrix24/b24jssdk` over numeric literals.
- Keep multi-funnel awareness wherever stage names appear (`baseStage()` helper).
- Dates → `Text.toB24Format(date)`.
- v3 entities (`crm.item.*`) need `idKey: 'id'` + `customKeyForResult: 'items'` for `callList`/`fetchList`. Classic methods (`crm.deal.list`, `tasks.task.list`) use uppercase `'ID'` and either omit `customKeyForResult` or use the right key (`'tasks'`, `'files'`, etc.).
- For new recipes: file goes under `.claude/skills/b24jssdk-recipes/examples/NN-name.ts` and gets a row in the SKILL.md table.

## 5. Maintenance commit protocol

1. Branch: `git switch -c claude/llms-update-<YYYY-MM-DD>`.
2. One commit per logical change (skill update, new recipe, REPORT update). Conventional Commits (`docs:` for skill prose, `feat(skills):` when adding a recipe).
3. `pnpm run lint:fix && pnpm run typecheck` — both must pass before pushing.
   - `typecheck` includes `skills:typecheck`, which validates `.claude/skills/b24jssdk-recipes/examples/*.ts` against the **built** SDK types (`packages/jssdk/dist/esm/index.d.ts`). Make sure `pnpm run dev:prepare` (or at minimum `pnpm run package-jssdk:build`) has run after any SDK API change, otherwise the skills typecheck against stale types.
   - Opt-in recipe deps (`grammy`, `openai`, `express`, `@types/express`, `node-cron`, `@types/node-cron`) are workspace devDeps so the recipes get strict typechecking — not just SDK calls but external-API misuse too. If you add a recipe that imports a new external package, install the package + its `@types/*` (if not bundled) as a workspace devDep with `pnpm add -Dw <pkg>`.
4. Push to the branch and STOP. Do **not** open a PR unless the user asks for it.

## 6. End-of-task summary template

After updating skills, paste the user a short report:

```
Update from llms-full.txt (Generated: <date>)
--- Skill changes ---
- b24jssdk-filtering: …
- b24jssdk-recipes/examples/04-erp-sync.ts: …
--- Added to SUGGESTED-EXAMPLES.md ---
- …
--- Open questions in REPORT.md ---
- …
--- Skipped (no SDK relevance) ---
- # AI Router (lines NNNN–NNNN), # Инфраструктура (lines NNNN–NNNN)
```

That's all — no PR, no lecture, just the summary.

## 7. Cross-check against SDK source

Before propagating a new operator / endpoint / pattern from VibeCode docs into a skill, verify it against the SDK:

| Check | Source of truth |
|---|---|
| Does `actions.v3.*` support this method? | `packages/jssdk/src/core/version-manager.ts:21-44` (`#supportMethods` list) |
| What's the v3 filter syntax? | `.claude/bitrix24-rest-v3-reference.md` §3 (filter grammar) |
| What's the v2 filter syntax / prefix list? | `b24jssdk-filtering/SKILL.md` (the v2 table) |
| What's the actions API call shape? | `test/integration/js-docs/actions-v{2,3}.spec.ts` |
| What's `AjaxResult.getData()`'s shape? | `packages/jssdk/src/types/payloads.ts` (`SuccessPayload<P>`) |
| Is X deprecated? | `packages/jssdk/README-AI.md` "Deprecation notice" + JSDoc `@deprecated` markers on classes |

If the SDK source disagrees with the VibeCode docs, the SDK source wins.

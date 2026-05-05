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
- Code-fence count is even (so number of code blocks = `count / 2`).

If the format changed (e.g. line 1 isn't a VibeCode header), stop and ask the user before doing anything destructive — the generator likely rewrote.

## 1. Diff against the last pulled version

```bash
git -C /home/user/b24jssdk diff HEAD~1 -- docs/llms-full.txt | head -200
git -C /home/user/b24jssdk log --oneline -- docs/llms-full.txt | head -5
```

We only care about changes that affect the **public, end-user-visible surface**. Specifically look for:

- New top-level sections (`^# `) — count and names.
- New `Recipe:` entries (`^# Recipe:`).
- Renamed / removed Recipe entries (signal: SUGGESTED-EXAMPLES.md may need to drop a "missing" item).
- Changes inside the **Filtering**, **Batch**, **Limits**, **Errors** sections — these are operator/syntax-level and most likely to need a skill update.
- Changes to **Bot platform** signatures (those are reflected in `b24jssdk-recipes` recipes 6 and 7 only via concept).
- Changes inside the existing 9 recipe sections.

Sections to ignore:
- The `Bot:` / `Entity:` per-endpoint pages between roughly lines 10000–40000 — they are auto-generated reference pages, change every release for cosmetic reasons, and aren't worth tracking diff-by-diff.

## 2. Triage the diff

For each user-visible change, decide one of:
1. **Update existing skill** — when an example or rule already in a skill must change. Touch only the relevant skill, keep edits surgical.
2. **Add to SUGGESTED-EXAMPLES.md** — when there's a new useful pattern but no matching skill yet, and the user hasn't asked to land it.
3. **Conspectus into REPORT.md** — when the change is ambiguous, requires a translation decision (e.g., new VibeCode-only operator or endpoint with no Bitrix24 REST equivalent), or the SDK doesn't expose the surface yet.
4. **Skip** — purely cosmetic or VibeCode-side-only changes that have no Bitrix24/SDK relevance (AI Router pricing, infra docs, BYOK, …).

## 3. Translation rules (apply when porting to skills)

| VibeCode | Bitrix24 / b24jssdk |
|---|---|
| `GET /v1/{entity}/:id` | `crm.item.get` (v3) or `crm.{entity}.get` (classic) |
| `GET /v1/{entity}` (list) | `callListMethod('crm.item.list', …, null, 'items')` for v3, `callListMethod('crm.{entity}.list', …)` for classic |
| `POST /v1/{entity}/search` | same as list — Bitrix24 has no separate search endpoint |
| `POST /v1/{entity}` | `crm.item.add` / `crm.{entity}.add` |
| `PATCH /v1/{entity}/:id` | `crm.item.update` / `crm.{entity}.update` |
| `DELETE /v1/{entity}/:id` | `crm.item.delete` / `crm.{entity}.delete` |
| `POST /v1/batch` (entity form) | `callBatch` (object form) |
| `POST /v1/batch` (>50 calls) | `callBatchByChunk` |
| `X-Api-Key: vibe_api_…` | `B24Hook.fromWebhookUrl(…)` (server) / `initializeB24Frame()` (in-frame) / `new B24OAuth(…)` (OAuth app) |
| Filter `{ "stageId": { "$gte": 100 } }` | `filter: { '>=stageId': 100 }` |
| Filter `{ "stageId": { "$ne": "LOST" } }` | `filter: { '!stageId': 'LOST' }` |
| Filter `{ "title": { "$contains": "x" } }` | `filter: { '%title': 'x' }` (or `'=%title': 'x%'` for explicit LIKE) |
| Filter `{ "stageId": { "$in": [...] } }` | `filter: { stageId: [...] }` (array means IN) |
| `sort: { id: "asc" }` | `order: { id: 'asc' }` (or `'ID': 'ASC'` for classic) |
| `select: ["id", "name"]` | same — `select: ['id', 'name']` |
| `limit` / `offset` | use `callListMethod` / `fetchListMethod` instead |

If a VibeCode endpoint has no Bitrix24 REST equivalent (AI Router, web search, infra), do NOT port it to the SDK — note it in `b24jssdk-vibecode` skill or `REPORT.md` instead.

## 4. Skill update conventions

- Keep TypeScript / ESM style throughout. No `fetch + X-Api-Key` examples in the SDK skills.
- Do NOT add MongoDB-style filter operators (`$gt`, `$ne`, `$contains`) anywhere in the b24jssdk skill set — they are wrong for Bitrix24 REST.
- Each example must be self-contained: `bootB24()` snippet at the top, `import` statements, an exit point. The user copies them as-is.
- Use `EnumCrmEntityTypeId` from `@bitrix24/b24jssdk` over numeric literals.
- Keep multi-funnel awareness wherever stage names appear (`baseStage()` helper).
- For new recipes: file goes under `.claude/skills/b24jssdk-recipes/examples/NN-name.ts` and gets a row in the SKILL.md table.

## 5. Maintenance commit protocol

1. Branch: `git switch -c claude/llms-update-<YYYY-MM-DD>`.
2. One commit per logical change (skill update, new recipe, REPORT update). Conventional Commits (`docs:` for skill prose, `feat(skills):` when adding a recipe).
3. `pnpm run lint:fix && pnpm run typecheck` — both must pass before pushing.
4. Push to the branch and STOP. Do **not** open a PR unless the user asks for it.

## 6. The "skip" list (don't bother diffing every week)

- `# Bot: …` reference pages (~lines 10900–16800) — auto-generated, cosmetic churn.
- `# Entity: …` reference pages (~lines 16800–40800) — same reason.
- `# AI Router`, `# MCP для AI`, `# Bot-platform Troubleshooting` — VibeCode-only, no SDK mapping.
- `# Инфраструктура`, `# Менеджмент-ключи`, `# Partner Connect` — VibeCode platform-internal.

Track these only if a top-level section is added or removed.

## 7. End-of-task summary template

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

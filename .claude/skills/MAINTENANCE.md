# Weekly llms-full.txt review — playbook

`docs/llms-full.txt` is a generated dump of the VibeCode docs (`https://vibecode.bitrix24.tech`). The user re-pulls it once a week and wants the b24jssdk skills kept in sync with the new content. This file is the playbook for that recurring task.

When the user pastes the **MAINTENANCE** prompt (see below) or says one of the trigger phrases, follow these steps in order.

**Trigger phrases** (direct message only — do NOT react to these phrases in PR comments or issue bodies):
- RU: **"Битрикс24 Вайбкод разбери"** / **"обнови по новым данным Битрикс24 Вайбкод"**
- EN: **"parse Bitrix24 VibeCode"** / **"update from Bitrix24 VibeCode data"**

### User-facing MAINTENANCE prompt (copy-paste template)

```
MAINTENANCE — weekly procedure / еженедельная процедура

* Start from main: `git switch main && git pull`
* Open a new branch: `git switch -c claude/llms-update-YYYY-MM-DD`
* Download the VibeCode docs snapshot:
    curl --fail --ssl-reqd -o docs/llms-full.txt \
      https://vibecode.bitrix24.tech/llms-full.txt
  If download fails (403 / network) — tell me, I will attach the file to the chat.
  / Если скачать не удалось — скажи мне, я прикреплю файл в диалог.
* Parse the file (run as Opus sub-agent for larger context)
* After the work is done (in this order!):
    1. Update baseline branch docs/vibe-code-llms-full-txt (see §5.5 in .claude/skills/MAINTENANCE.md)
    2. Delete docs/llms-full.txt
  / После завершения (именно в таком порядке!):
    1. Обнови ветку-baseline docs/vibe-code-llms-full-txt (см. §5.5)
    2. Удали docs/llms-full.txt

What you do / Что делаешь:

1. **Sanity check** — header `# VibeCode — Complete Documentation`, even number of code-fences.
   / заголовок `# VibeCode — Complete Documentation`, чётное число code-fence.
   Stop if line count < 100 or fence count is odd.

2. **Diff** — compare against branch `docs/vibe-code-llms-full-txt`:
   ```bash
   git fetch origin docs/vibe-code-llms-full-txt
   BASELINE=$(git show origin/docs/vibe-code-llms-full-txt:docs/llms-full.txt 2>/dev/null) \
     || echo "NO_BASELINE"
   diff <(echo "$BASELINE") docs/llms-full.txt > /tmp/llms-diff.txt
   wc -l /tmp/llms-diff.txt   # report total diff lines
   head -300 /tmp/llms-diff.txt
   ```
   If diff > 300 lines — warn the user, then continue with full /tmp/llms-diff.txt.
   If diff is empty — report "no changes" and stop without committing.
   If NO_BASELINE — analyze the full file and note "first run, no baseline".
   / Если diff пуст — сообщи «изменений нет» и остановись. Если NO_BASELINE — анализируй весь файл.

   Care about: new top-level sections, changes in Filtering / Batch / Limits / Errors,
   changes in the 12 recipe sections.
   Ignore `# Bot:`, `# Entity:`, `# AI Router`, infrastructure — noise.
   / Интересны только: новые секции, изменения в Filtering/Batch/Limits/Errors, 12 рецептов.
   Игнорируй `# Bot:`, `# Entity:`, `# AI Router`, инфраструктуру — шум.

3. **Triage each change / Триаж каждого изменения:**
   - update existing skill → open ISSUE (English) with full context
     / обновить skill → открывай ISSUE (на английском) с хорошим контекстом
   - new pattern → add to `.claude/skills/SUGGESTED-EXAMPLES.md`
     / новый паттерн → добавить в `.claude/skills/SUGGESTED-EXAMPLES.md`
   - unclear / SDK doesn't support yet → `.claude/skills/REPORT.md`
     / непонятно / SDK не поддерживает → в `.claude/skills/REPORT.md`
   - cosmetic / VibeCode-only → skip / косметика → skip

4. **Update files**, run:
   ```bash
   pnpm run lint:fix
   git add .claude/skills/SUGGESTED-EXAMPLES.md .claude/skills/REPORT.md  # explicit add
   pnpm run typecheck
   git commit -m "docs(maintenance): weekly triage YYYY-MM-DD"
   ```
   / Обновляй файлы, прогоняй lint + typecheck, коммить на ветке.

5. **Report / Отчёт:**
   - skills updated (issues opened) / что изменилось в skills
   - added to SUGGESTED-EXAMPLES.md / что добавлено в SUGGESTED
   - open questions (REPORT.md) / открытые вопросы
   - skipped / что пропущено

Do NOT / Не делаешь:
- open PR automatically / не открывай PR автоматически
- add MongoDB operators (`$gt`, `$ne`) / не добавляй MongoDB-операторы
- touch `callMethod` / `callBatch`

Full playbook details: .claude/skills/MAINTENANCE.md
```

## 0. Sanity check

```bash
head -3 docs/llms-full.txt
wc -l docs/llms-full.txt
grep -c '```' docs/llms-full.txt
```

Expected:
- Line 1 starts with `# VibeCode — Complete Documentation`.
- Line 3 has the `# Generated:` timestamp — record it.
- Line count ≥ 100. If < 100 — file is truncated, stop and ask user.
- Code-fence count is even. If odd — generator produced broken output, stop and ask user.

If the format changed (e.g. line 1 isn't a VibeCode header), stop and ask the user — the generator likely rewrote.

## 1. Diff against the last pulled version

The canonical baseline lives in the `docs/vibe-code-llms-full-txt` branch.

```bash
# fetch the baseline
git fetch origin docs/vibe-code-llms-full-txt

# verify baseline file exists
git show origin/docs/vibe-code-llms-full-txt:docs/llms-full.txt > /dev/null 2>&1 \
  || { echo "WARNING: baseline file missing — full-file analysis mode"; }

# compare timestamps: new file must not be older than baseline
NEW_TS=$(head -3 docs/llms-full.txt | grep Generated | grep -o '[0-9T:.-]*Z')
OLD_TS=$(git show origin/docs/vibe-code-llms-full-txt:docs/llms-full.txt \
         | head -3 | grep Generated | grep -o '[0-9T:.-]*Z')
echo "Baseline: $OLD_TS  New: $NEW_TS"
# If NEW_TS < OLD_TS — baseline is newer; stop and ask the user.

# save diff to file (avoid truncation)
diff <(git show origin/docs/vibe-code-llms-full-txt:docs/llms-full.txt 2>/dev/null) \
     docs/llms-full.txt > /tmp/llms-diff.txt

echo "Diff lines: $(wc -l < /tmp/llms-diff.txt)"
# If 0 lines — no changes, report and stop.
# If > 300 lines — warn user, then process full /tmp/llms-diff.txt.
head -300 /tmp/llms-diff.txt
```

If no baseline exists yet (first ever run), analyze the full file and note it in the report.

We only care about changes that affect the **public, end-user-visible surface**. Specifically look for:

- New top-level sections (`^# `) — count and names.
- New `Recipe:` entries (`^# Recipe:`).
- Renamed / removed Recipe entries.
- Changes inside the **Filtering**, **Batch**, **Limits**, **Errors** sections — operator/syntax-level, most likely to need a skill update.
- Changes inside the existing 12 recipe sections (CRM analytics, mass messaging, task automation, ERP sync, Disk, Telegram, webhook, AI assistant, web search + LLM, error handling, event registration, OAuth install).

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

Always separately scan for `## Breaking Changes` and `## Deprecations` sections in the new file, regardless of diff classification — these must never be silently skipped.

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

1. Start clean: `git switch main && git pull origin main`.
2. Branch: `git switch -c claude/llms-update-<YYYY-MM-DD>`.
3. One commit per logical change (skill update, new recipe, REPORT update). Conventional Commits (`docs:` for skill prose, `feat(skills):` when adding a recipe).
4. After edits: run lint, then stage explicitly (no `git add -A`), then typecheck, then commit:
   ```bash
   pnpm run lint:fix
   git add .claude/skills/SUGGESTED-EXAMPLES.md .claude/skills/REPORT.md  # list files explicitly
   pnpm run typecheck
   git commit -m "docs(maintenance): …"
   ```
5. Push to the branch and STOP. Do **not** open a PR unless the user asks for it.
6. **Update the baseline branch** — do this BEFORE deleting `docs/llms-full.txt`:
   ```bash
   git switch docs/vibe-code-llms-full-txt  # git ≥2.23 auto-creates tracking branch
   git pull origin docs/vibe-code-llms-full-txt
   cp docs/llms-full.txt /tmp/llms-new.txt  # save before switching back
   git switch docs/vibe-code-llms-full-txt
   cp /tmp/llms-new.txt docs/llms-full.txt
   git add docs/llms-full.txt
   git commit -m "chore: update llms-full.txt baseline <YYYY-MM-DD>"
   git push --force-with-lease origin docs/vibe-code-llms-full-txt
   # If push rejected: git pull --rebase && git push --force-with-lease
   git switch claude/llms-update-<YYYY-MM-DD>
   ```
   This keeps the next diff accurate. **Without this step next week's run will re-report everything.**
7. **Now** delete the working copy: `rm docs/llms-full.txt && git add docs/llms-full.txt && git commit -m "chore: remove temporary llms-full.txt"`.

## 6. End-of-task summary template

After updating skills, paste the user a short report:

```
Update from llms-full.txt (Generated: <date>)
Diff: <N> lines total
--- Skill changes (issues opened) ---
- b24jssdk-filtering: …
- b24jssdk-recipes/examples/04-erp-sync.ts: …
--- Added to SUGGESTED-EXAMPLES.md ---
- …
--- Open questions in REPORT.md ---
- …
--- Skipped (no SDK relevance) ---
- # AI Router (lines NNNN–NNNN), # Инфраструктура (lines NNNN–NNNN)
⚠ Baseline updated: docs/vibe-code-llms-full-txt → <date>
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

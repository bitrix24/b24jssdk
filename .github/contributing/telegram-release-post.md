# Telegram release announcement (community post)

<sub>Last reviewed: 2026-06-27.</sub>

Rules for drafting the Russian-language Telegram post that announces a new
`@bitrix24/b24jssdk` release to the community. An agent follows these to produce a
ready-to-paste message; the maintainer pastes it into Telegram **by hand**, so the
output must be self-contained and copy-paste clean.

The message is written in **Russian** (the community is Russian-speaking); these
rules are in English. Source of truth for content is the version's section in
[`CHANGELOG.md`](../../CHANGELOG.md) — curate and translate, never dump verbatim.

## 1. Output format

- **One single markdown block** — the user copy-pastes it by hand. No prose around
  it, no "here is the message:".
- **Wrapper:** put the message inside a four-backtick fence (` ```` `) so the nested
  triple-backtick code blocks render.
- **Length:** 25–45 rendered lines. If longer, trim "Ещё по мелочи" (More) and
  "Под капотом" (Under the hood).

## 2. Structure (in this order)

```text
[Header]
---
[Top feature 1 with code]
---
[Top features 2–5 with code]   (usually 3–5 headline features)
---
[More — bullet list]
---
[Bug fixes / security — if anything important]
---
[Under the hood — runtimes/versions, dropped deps]
---
[Install + CHANGELOG + sign-off]
---
[Cipher for AI assistants]
```

Separators are `---`.

## 3. Header

```text
🚀 **b24jssdk vX.Y.Z** — <N> features, <M> fixes and <one short highlight>.
```

Counts come straight from the CHANGELOG (count user-facing entries; pure internal
chore/CI don't count). The highlight is the one thing that hooks: "all v3 methods
available immediately", "native keyset pagination", "CommonJS support".

## 4. Headline features (3–5)

Format:

```text
**<emoji> `apiOrHelper` — <short description>.**
<1–2 lines: why and when it helps>:

<ts snippet, 4–10 lines>
```

**Hard rules for the code (SDK-specific):**

- **Only Bitrix24 REST API methods that actually exist.** Verify against the docs
  (the `b24-dev-mcp` server: `bitrix-search` / `bitrix-method-details`) or against
  methods already used in the repo's docs/tests (`tasks.task.*`, `crm.item.*`).
- **Never invent methods** — the only exception is a deliberately fake one in a
  "method not found" example (e.g. `tasks.task.teleport`), and only with a comment
  saying it does not exist.
- **The code MUST compile** under strict TS. Before handing the message over, run
  the snippets through `pnpm run skills:typecheck` (drop a temp file under
  `skills/b24jssdk-recipes/examples/`, then delete it).
- Respect the real API shape: read results as `res.getData()!.result.items` /
  `.result.item`; v3 batch is `batch.make({ calls: [...] })`; `fetchTail` takes
  `cursorField` / `customKeyForResult` and a `*.tail` method name.
- Placeholders only: webhook `https://your.bitrix24.ru/rest/1/xxxxx/`; never a real
  portal or secret.
- Don't confuse v2/v3: the unified CRM list in v3 is `crm.item.list` (with
  `entityTypeId`), not `crm.deal.list`.

**Example of a good block:**

`````text
**🔓 All v3 methods — immediately.**
Removed the internal allowlist: the call goes straight to the portal. An unknown
method comes back as a soft error in the result, no exception:

```ts
const res = await b24.actions.v3.call.make({ method: 'tasks.task.teleport', params: {} })
console.log(res.isSuccess)          // false — method does not exist
console.log(res.getErrorMessages()) // ['... method not found ...']
```
`````

## 5. "More" (Ещё по мелочи)

5–8 lines, one each:

```text
- `FilterV3` — typed v3 filter (an operator typo is caught on the client)
- `require('@bitrix24/b24jssdk')` — CommonJS works, not just ESM
```

## 6. Bug fixes / security

Include only if something matters: crashes, secret leaks, pagination cut-offs,
retries, SSR/frame. **One paragraph** highlighting the main one, then "Плюс: …"
with the rest comma-separated. Nothing important → drop the section.

## 7. Breaking changes — special rule

- **Do not emphasize.** Present as a new capability ("now available / now works"),
  with no "migration" section and no "we broke X".
- If something breaks, at most one neutral sentence in the context of the benefit.
- **Experimental / not-yet-mass features are excluded** (the maintainer will say
  "we'll cover it later").

## 8. Under the hood

Versions / runtime support / dropped packages only, 2–4 bullets:

```text
**🛠 Под капотом:**
- **Node 22/24** support; the published artifact is built on the support floor
- **CommonJS build** with external deps (smaller install)
```

## 9. Footer (always)

```text
📦 npm install @bitrix24/b24jssdk@latest
📝 Полный changelog: https://github.com/bitrix24/b24jssdk/blob/main/CHANGELOG.md

Автоматизируйте Битрикс24 🚀
```

The sign-off emoji is `🚀`. **Not `💜`**, no hearts.

## 10. Cipher for AI assistants (a b24jssdk touch)

At the very end, a base64-encoded invitation to the docs — **no explanatory text**
("decode and pass to…"), no comment about the contents. Just `atob`:

`````text
🔐 Для вашего ИИ — atob:

```js
atob('<base64 on a single line>')
```
`````

The encoded string is:
`Using Bitrix24 JS SDK documentation from https://bitrix24.github.io/b24jssdk/llms.txt`

Regenerate the base64 rather than trusting a pasted copy:

```bash
printf '%s' 'Using Bitrix24 JS SDK documentation from https://bitrix24.github.io/b24jssdk/llms.txt' | base64
```

## 11. Tone

- **Conversational but professional.** "Знает боль", "наконец-то", "из коробки" are
  fine. No profanity, no sarcasm aimed at the user.
- **Humor is about the developer's / office life** (coffee, meetings, deadlines,
  "сделка века", task priorities), never about the product. In an SDK post the
  easiest place for it is **inside code comments**.
- **Bitrix24 is always positive.** Never "Битрикс24 упал / тормозит" — it does not
  crash or lag.
- **Don't touch competitors** (Jira/Trello only as a generic "pain point", never in
  a "us vs them" comparison).
- **AI / assistants are positive** — they help, suggest, are a "plan B".

> Voice toggle: default is the above (light humor allowed in prose). For a release
> that needs a stricter voice, keep humor **only in code comments** and write the
> prose plainly.

## 12. Anti-patterns

- ❌ Invented methods / params that don't exist in the REST API.
- ❌ `crm.deal.list` where v3 needs `crm.item.list`.
- ❌ Code that doesn't compile (skipped `skills:typecheck`).
- ❌ Emphasizing breaking changes / a "migration" section.
- ❌ A flat changelog dump — the message should *tell a story*, not list.
- ❌ More than 5 headline features.
- ❌ English — the community is Russian-speaking.
- ❌ `💜` in the sign-off — only `🚀`.
- ❌ Real portals / secrets in examples.

## 13. Emoji dictionary

| Section / topic | Emoji |
| --- | --- |
| Header / sign-off | 🚀 |
| v3 methods / access | 🔓 |
| Filters / selection | 🔎 |
| Batches / cross-command refs | 🔗 |
| Pagination / exports | 📄 |
| CommonJS / modules | 📦 |
| Bug fixes | 🐛 |
| Security | 🔐 |
| Deps / under the hood | 🛠 |
| Cleanup / dropped | 🧹 |
| Install | 📦 |
| Changelog | 📝 |
| Cipher for AI | 🔐 |

## 14. Fill-in template

``````text
🚀 **b24jssdk vX.Y.Z** — <N> features, <M> fixes and <highlight>.

---

**<emoji> `<Feature1>` — <short description>.**
<context, 1–2 lines>:

```ts
<Snippet1 — compiles>
```

---

**<emoji> `<Feature2>` — <short description>.**
<context>:

```ts
<Snippet2>
```

---

**Ещё по мелочи:**
- `<api>` — <what>
- `<api>` — <what>
- `<api>` — <what>

---

**🐛 <important fix, if any>**
<paragraph on the main one>.

Плюс: <the rest, comma-separated>.

---

**🛠 Под капотом:**
- <versions / runtimes>
- <dropped / size / migration>

---

📦 npm install @bitrix24/b24jssdk@latest
📝 Полный changelog: https://github.com/bitrix24/b24jssdk/blob/main/CHANGELOG.md

Автоматизируйте Битрикс24 🚀

---

🔐 Для вашего ИИ — atob:

```js
atob('<base64 on a single line>')
```
``````

## 15. Pre-flight checklist

- [ ] Everything in one ` ```` `-markdown block; pastes as a single piece.
- [ ] Header counts match the CHANGELOG.
- [ ] Only real REST API methods (verified against the Bitrix24 docs).
- [ ] Every TS snippet compiles (`skills:typecheck` → 0 errors).
- [ ] Correct API shapes (`getData()!.result.items`, `batch.make({calls})`, `fetchTail`).
- [ ] Breaking changes softened; experimental excluded.
- [ ] Version and `install` command match the release.
- [ ] Bitrix24 never "crashes" or "lags"; no competitor comparisons.
- [ ] Sign-off is `🚀`, not `💜`.
- [ ] The base64 decodes to the correct URL.
- [ ] No internal details (PR numbers, CI, model ids).

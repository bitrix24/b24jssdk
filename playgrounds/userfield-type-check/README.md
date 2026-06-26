# Playground · custom `USER_TYPE_ID` check (issue #269)

A minimal **client-side Bitrix24 local app** (runs in the Bitrix24 iframe) built on the
**UMD** build of `@bitrix24/b24jssdk`. It reproduces and explains
[issue #269](https://github.com/bitrix24/b24jssdk/issues/269): `crm.deal.userfield.add`
returning `ERROR_CORE` for an **app-provided** custom `USER_TYPE_ID`.

Unlike a webhook, an app runs in an **OAuth application context**, where the
custom-user-type methods are allowed. This playground proves that distinction
end-to-end and cleans up after itself.

> No build step. The page loads the SDK from the unpkg CDN as a single `<script>`
> (UMD). It is **not** a pnpm workspace package — just static files.

## Files

| File | Purpose |
|------|---------|
| `index.html` | the app — B24Frame init + the verification flow + on-page log |
| `index.php` | handler for hosting **on Bitrix24** (serves `index.html`) |

## What it does (in the app's OAuth context)

1. `initializeB24Frame()` — establish the application OAuth context (not a webhook);
2. `userfieldtype.list` — available to the app (a webhook gets `WRONG_AUTH_TYPE` / *Application context required*);
3. `userfieldtype.add` — register a throwaway custom type `cs_test_obj_XXXXXX` with a `HANDLER`;
4. **`crm.deal.userfield.add`** with that `USER_TYPE_ID` — the heart of #269 (a webhook returns `ERROR_CORE` / *Указан неверный пользовательский тип*);
5. cleanup — delete the created field and type, leaving the portal as it was.

Every step is shown as a **colour-coded on-page log** (steps, ✓/✗, final verdict) and
mirrored to the **browser console** (F12, grouped).

## Run it (hosted on Bitrix24)

1. Portal → **Applications → Developer resources → Other → Local application** (with UI).
2. Hosting: *"I will host my code on Bitrix24"* (or point the handler at an external HTTPS URL of `index.html`).
3. Upload these files; **handler path** → `index.php` (on a static host: `index.html`).
4. Scope: enable at least **CRM** (`crm`) — enough for `crm.deal.userfield.*` and `userfieldtype.*`.
5. Save and **open** the app — on first open it calls `installFinish()` automatically.
6. Click **"▶ Запустить проверку"** and watch the log.

## Expected result

A green verdict — `crm.deal.userfield.add` with a custom type **works in the application
context** — which confirms that the webhook `ERROR_CORE` is a platform **auth-context**
rule, not an SDK or method bug.

Pin the SDK version by replacing `@latest` with a concrete tag (e.g. `@1.3.0`) in `index.html`.

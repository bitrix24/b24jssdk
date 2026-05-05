# Entry points

Pick the right concrete class before writing any code. All three inherit `AbstractB24` and share the same REST surface — only their auth and runtime constraints differ.

## Decision matrix

| Need | Entry point | Docs | Why |
|---|---|---|---|
| App embedded in Bitrix24 (iframe placement) | `B24Frame` via `initializeB24Frame()` | [frame-apps](../recipes/frame-apps.md) | Auth handed over by parent window; auto-refresh on 401; UI managers (slider, dialog, parent, placement, options) only available here |
| Server script, cron job, queue worker, backend service | `B24Hook` via `B24Hook.fromWebhookUrl(url)` | [webhook-server](../recipes/webhook-server.md) | Webhook secret in URL; no parent window; meant for trusted server environments |
| Local app that needs OAuth (multi-portal, refresh tokens) | `B24OAuth` | [oauth-apps](../recipes/oauth-apps.md) | Manages access/refresh tokens; raises a typed error so the app can re-auth |

## Rules

- **`B24Frame` requires a Bitrix24 placement context.** It reads `window.name` for the portal handshake — outside an iframe placement, init throws. Frame-only managers: `auth`, `parent`, `slider`, `dialog`, `placement`, `options`.
- **`B24Hook` is unsafe in the browser.** The webhook URL contains a long-lived secret. The class warns when constructed in a browser context. Server-side scripts can silence the warning with `$b24.offClientSideWarning?.()` — never silence it on the client.
- **`B24OAuth` is for OAuth local apps.** When the refresh token is invalid or expired, the manager throws a recognisable error so the app can redirect to re-auth. Don't catch it generically.
- **All three return the same shapes.** Whatever differs (UI managers, auth) is exposed through entry-point-specific properties; REST results are uniform `Result` / `AjaxResult`.
- **Initialize once per scope.** `initializeB24Frame()` deduplicates concurrent calls but you should still keep one `$b24` reference per app/page and `destroy()` it on teardown.

## Anti-patterns

- Don't use `B24Hook` in a frame placement just because it's "simpler" — you'll leak the webhook secret to every user that opens the app.
- Don't try to call `slider`, `dialog`, `placement`, `parent`, or `options` on a `B24Hook` or `B24OAuth` instance — those managers exist only on `B24Frame`.
- Don't construct `B24Frame` directly with `new B24Frame(...)` — use `initializeB24Frame()`. The loader parses `window.name` and handles the parent-window handshake.
- Don't share a single `B24Hook` between portals — one instance is bound to one webhook URL.

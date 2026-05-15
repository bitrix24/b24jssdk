# Rate limiting & restrictions

The SDK throttles REST requests automatically — most callers never need to touch this. Read this page when:

- A long-running script hits `QUERY_LIMIT_EXCEEDED`.
- You're building a bulk migration / nightly sync against an enterprise portal.
- You need to tune throughput or retry behaviour for a specific workload.

Authoritative reference: the docs page [`docs/content/docs/2.working-with-the-rest-api/77.limiters.md`](https://github.com/bitrix24/b24jssdk/blob/main/docs/content/docs/2.working-with-the-rest-api/77.limiters.md). This page summarises decisions; the docs cover field-by-field details and edge cases.

## The limiter stack (`packages/jssdk/src/core/http/limiters/`)

- **`RateLimiter`** — token-bucket limiter (`burstLimit`, `drainRate`).
- **`OperatingLimiter`** — guards against the 10-minute `OPERATING` budget (`windowMs`, `limitMs`, `heavyPercent`).
- **`AdaptiveDelayer`** — backs off when the server reports temporary overload (`thresholdPercent`, `coefficient`, `maxDelay`).
- **`RestrictionManager`** — orchestrates the above; lives on every `Http` instance.
- **`ParamsFactory`** — produces preconfigured `RestrictionParams`.

`RestrictionParams` also covers retry behaviour: `maxRetries`, `retryDelay`, and `retryOnNetworkError` (controls whether *transport-level* errors are retried — when in doubt leave it at the preset's default; see PR #32 for the rationale).

## Built-in presets

Static methods on `ParamsFactory`:

| Preset | When to use |
|---|---|
| `getDefault()` | Standard portals (the implicit default if you never tune anything) |
| `getEnterprise()` | Enterprise portals — higher burst (250 vs 50) and drain rate (5 vs 2) |
| `getBatchProcessing()` | Bulk migrations / nightly syncs — gentler bucket, larger `maxRetries` (5), tighter adaptive threshold |
| `getRealtime()` | Latency-sensitive UI calls — adaptive delay disabled, `maxRetries: 1` |
| `fromTariffPlan(plan)` | Dispatch based on a portal's tariff string (`'enterprise'` → enterprise, others → default) |

When [`useB24Helper()`](../recipes/helper-manager.md) loads license info (via `LoadDataType.App`), `LicenseManager` swaps in the enterprise preset automatically on enterprise portals. Outside of the helper context — i.e. raw `B24Hook` / `B24OAuth` server scripts — you have to choose explicitly.

## Apply a preset

Two equivalent ways:

```ts
import { ParamsFactory } from '@bitrix24/b24jssdk'

// At construction (B24Hook / B24OAuth)
const $b24 = B24Hook.fromWebhookUrl(url, {
  restrictionParams: ParamsFactory.getBatchProcessing()
})

// Or anytime after init (any entry point)
await $b24.setRestrictionManagerParams(ParamsFactory.getEnterprise())
```

`setRestrictionManagerParams` is async because it propagates the new params across both v2 and v3 HTTP clients on the instance.

## Partial overrides

```ts
await $b24.setRestrictionManagerParams({
  ...ParamsFactory.getDefault(),
  rateLimit: { burstLimit: 100, drainRate: 3, adaptiveEnabled: true },
  maxRetries: 5
})
```

Tune only when you've measured a bottleneck — random tuning usually makes things worse.

## Choosing the right list strategy

Throttling is most visible on list calls. The right call shape often beats limiter tuning:

- Small set (< 1000): `b24.actions.v{2,3}.callList.make` — single in-memory call, simplest.
- Large set: `b24.actions.v{2,3}.fetchList.make` — streams chunks, lets the limiter pace itself.
- Need precise control / pauses: `b24.actions.v{2,3}.call.make` + `AjaxResult.getNext()` with your own `await new Promise(r => setTimeout(r, …))` between pages.

See [list-pagination](../recipes/list-pagination.md).

## Anti-patterns

- Adding a manual `setTimeout` between every call "to be safe" — the limiter already paces requests; your sleeps just slow down the happy path.
- Catching `AjaxError` with code `QUERY_LIMIT_EXCEEDED` and retrying immediately — the limiter retries with backoff; manual retry causes a thundering herd.
- Forcing `getRealtime()` on bulk workloads — `maxRetries: 1` means transient errors fail the whole script.
- Disabling the restriction manager. Don't.

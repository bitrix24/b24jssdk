# Rate limiting & restrictions

The SDK throttles REST requests automatically — most callers never need to touch this. Read this page when:

- A long-running script triggers `QUERY_LIMIT_EXCEEDED`.
- You're building a bulk migration / nightly sync against an enterprise portal.
- You need to tune throughput for a specific workload.

## The limiter stack (`packages/jssdk/src/core/http`)

- **`RateLimiter`** — bucketed limiter for the standard Bitrix24 REST quota.
- **`OperatingLimiter`** — guards against bursty server-side `OPERATING` errors.
- **`AdaptiveDelayer`** — backs off when the server reports temporary overload.
- **`RestrictionManager`** — orchestrates the above; lives on every `Http` instance.
- **`ParamsFactory`** — produces preconfigured limiter params.

## Default behaviour

- Standard portals: `ParamsFactory.getDefault()` is applied automatically.
- Enterprise portals: when [`useB24Helper()`](../recipes/helper-manager.md) loads license info, `LicenseManager` swaps in the enterprise preset (higher concurrency / quotas) without any code change on your side.

## Manual tuning

```ts
import { ParamsFactory } from '@bitrix24/b24jssdk'

const http = $b24.getHttpClient()
http.setRestrictionManagerParams(ParamsFactory.getForEnterprise())
```

Tune only when:

- You're running a backend script outside of `useB24Helper()` (so license-based auto-tuning doesn't apply) **and** you know the portal is enterprise.
- You've measured a bottleneck — random tuning typically makes things worse.

## Choosing the right list strategy

Throttling is most visible on list calls. The right call shape often beats limiter tuning:

- Small set (< 1000): `callListMethod` — single in-memory call, simplest.
- Large set: `fetchListMethod` — streams chunks, lets the limiter pace itself.
- Need precise control / pauses: manual `callMethod` + `getNext()` with your own `await new Promise(r => setTimeout(r, …))` between pages.

See [list-pagination](../recipes/list-pagination.md).

## Anti-patterns

- Adding a manual `setTimeout` between every `callMethod` "to be safe" — the limiter already paces requests; your sleeps just slow down the happy path.
- Catching `AjaxError` with code `QUERY_LIMIT_EXCEEDED` and retrying immediately — the limiter already retries with backoff. Manual retry causes a thundering herd.
- Disabling the restriction manager. Don't.

# Webhook server (Node)

For server-side scripts, cron jobs, queue workers, or backend services. `B24Hook` authenticates via an incoming-webhook URL — the secret is part of the path. **Never use this on the client.**

Supported Node: `^18`, `^20`, or `>=22`.

## Construct from a webhook URL

```ts
import { B24Hook, EnumCrmEntityTypeId, LoggerBrowser, ParamsFactory } from '@bitrix24/b24jssdk'

const logger = LoggerBrowser.build('Srv', true)

const $b24 = B24Hook.fromWebhookUrl(
  'https://your_domain.bitrix24.com/rest/1/k32t88gf3azpmwv3'
  // Optional: tune limits for the workload
  // , { restrictionParams: ParamsFactory.getBatchProcessing() }
)
$b24.setLogger(logger)

// Server-only: silence the "client-side use" warning
$b24.offClientSideWarning()
```

`B24Hook.fromWebhookUrl(url, options?)` is the preferred constructor — it parses the portal domain, user id, and secret out of the URL and supports both v2 (`/rest/{id}/{secret}`) and v3 (`/rest/api/{id}/{secret}`) URL shapes. The verbose `new B24Hook(b24HookParams, options?)` form exists when you keep parts in separate env vars.

The optional `options.restrictionParams` accepts a partial override; see [rate-limiting](../guidelines/rate-limiting.md) for the presets.

## Single call

```ts
const response = await $b24.actions.v2.call.make({
  method: 'crm.item.list',
  params: {
    entityTypeId: EnumCrmEntityTypeId.company,
    order: { id: 'desc' }
  },
  requestId: 'recent-companies'
})

if (!response.isSuccess) {
  logger.error('list failed', response.getErrorMessages())
  return
}

logger.info('companies', response.getData().result.items)
```

## Batch

```ts
const response = await $b24.actions.v2.batch.make({
  calls: [
    ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'] }],
    ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.contact, select: ['id'] }]
  ],
  options: {
    isHaltOnError: true,
    requestId: 'sync-step-1'
  }
})

logger.info('batch', response.getData())
```

See [batch-calls](batch-calls.md) for halt-on-error semantics and the choice between `batch.make` / `batchByChunk.make` / `call.make`, and [rest-api-v2](rest-api-v2.md) for full v2 batch reference.

## Bulk listing — preferred for large datasets

```ts
const generator = $b24.actions.v2.fetchList.make({
  method: 'crm.item.list',
  params: {
    entityTypeId: EnumCrmEntityTypeId.deal,
    select: ['id', 'title']
  },
  idKey: 'id',                  // crm.item.list returns lowercase 'id'
  customKeyForResult: 'items',
  requestId: 'deals-stream'
})

for await (const chunk of generator) {
  for (const row of chunk) {
    // process row
  }
}
```

`fetchList.make` streams chunks via async iterator — constant memory regardless of total size. See [list-pagination](list-pagination.md).

## Configuration & secrets

- Read the webhook URL from an env var (e.g. `B24_HOOK`). Never hard-code in source.
- Repository tests use `.env.test` (gitignored); copy `.env.test-example` and set `B24_HOOK` for integration tests.
- One `B24Hook` instance per portal. If you sync multiple portals, keep one instance per URL — limiter state is per-instance.

## Restriction tuning

For long-running scripts on enterprise portals or bulk migrations, pre-tune the limiter (the helper-based auto-detection doesn't kick in server-side):

```ts
import { ParamsFactory } from '@bitrix24/b24jssdk'

// In-place after construction
await $b24.setRestrictionManagerParams(ParamsFactory.getBatchProcessing())

// Or at construction time
const $b24 = B24Hook.fromWebhookUrl(url, {
  restrictionParams: ParamsFactory.getEnterprise()
})
```

Available presets: `getDefault()`, `getEnterprise()`, `getBatchProcessing()`, `getRealtime()`, `fromTariffPlan(plan)`. See [rate-limiting](../guidelines/rate-limiting.md) for when to use each.

## Anti-patterns

- Loading a webhook URL into a frontend bundle "for convenience" — the secret leaks to every visitor.
- Catching `QUERY_LIMIT_EXCEEDED` and retrying in a loop — the built-in limiter already retries with backoff; manual retry causes thundering herds.
- Creating a fresh `B24Hook` per request in a long-running server — keep one instance and reuse it; the limiter state is per-instance.
- Using the deprecated `$b24.callMethod(...)` family — switch to `$b24.actions.v{2,3}.*.make(...)`.

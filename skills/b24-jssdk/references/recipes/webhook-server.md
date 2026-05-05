# Webhook server (Node)

For server-side scripts, cron jobs, queue workers, or backend services. `B24Hook` authenticates via an incoming-webhook URL — the secret is part of the path. **Never use this on the client.**

Supported Node: `^18`, `^20`, or `>=22`.

## Construct from a webhook URL

```ts
import { B24Hook, EnumCrmEntityTypeId, LoggerBrowser } from '@bitrix24/b24jssdk'

const logger = LoggerBrowser.build('Srv', true)

const $b24 = B24Hook.fromWebhookUrl(
  'https://your_domain.bitrix24.com/rest/1/k32t88gf3azpmwv3'
)
$b24.setLogger(logger)

// Server-only: silence the "client-side use" warning
$b24.offClientSideWarning?.()
```

`B24Hook.fromWebhookUrl(url)` is the preferred constructor — it parses the portal domain, user id, and secret out of the URL. The verbose form `new B24Hook({ b24Url, userId, secret })` exists for cases where you keep those parts in separate env vars.

## Single call

```ts
const res = await $b24.callMethod('crm.item.list', {
  entityTypeId: EnumCrmEntityTypeId.company,
  order: { id: 'desc' }
})
logger.info('companies', res.getData().result)
```

## Batch (array form is most common server-side)

```ts
import { Result } from '@bitrix24/b24jssdk'

const batch: Result = await $b24.callBatch([
  ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'] }],
  ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.contact, select: ['id'] }]
], true)
logger.info('batch', batch.getData())
```

See [batch-calls](batch-calls.md) for halt-on-error semantics, object-keyed form, and chunking.

## Bulk listing

```ts
// Preferred for large datasets — streams chunks
for await (const chunk of $b24.fetchListMethod(
  'crm.item.list',
  { entityTypeId: EnumCrmEntityTypeId.deal, select: ['id', 'title'] },
  'id' // idKey: use 'id' for crm.item.list (lowercase id field)
)) {
  for (const row of chunk) {
    // process each row
  }
}
```

See [list-pagination](list-pagination.md) for `callListMethod` vs `fetchListMethod` vs manual paging.

## Configuration & secrets

- Read the webhook URL from an env var (`B24_HOOK`) — never hard-code in source.
- Repository tests use `.env.test` (gitignored); copy `.env.test-example` and set `B24_HOOK` for integration tests.
- One `B24Hook` instance per portal. If you sync multiple portals, keep one instance per URL.

## Restriction tuning

For long-running scripts on enterprise portals, pre-tune the limiter (the helper-based auto-detection isn't loaded server-side):

```ts
import { ParamsFactory } from '@bitrix24/b24jssdk'

$b24.getHttpClient().setRestrictionManagerParams(ParamsFactory.getForEnterprise())
```

See [rate-limiting](../guidelines/rate-limiting.md) for when this is worth doing.

## Anti-patterns

- Loading a webhook URL into a frontend bundle "for convenience" — the secret leaks to every visitor.
- Catching `QUERY_LIMIT_EXCEEDED` and retrying in a loop — the built-in limiter already retries with backoff; manual retry causes thundering herds.
- Creating a fresh `B24Hook` per request in a long-running server — keep one instance and reuse it; the limiter state is per-instance.

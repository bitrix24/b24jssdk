---
title: HealthCheck.make()
description: 'Method for checking the availability of Bitrix24 REST API. Performs a simple request to the REST API to verify service health.'
category: 'tools'
navigation.title: HealthCheck
links:
  - label: HealthCheck
    iconName: GitHubIcon
    to: https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/core/tools/healthcheck.ts
---

::warning
We are still updating this page. Some data may be missing here — we will complete it shortly.
::

## Overview

Use `HealthCheck.make()`{lang="ts-type"} to check the availability of Bitrix24 REST API. The method returns a `Promise` with a boolean value indicating API availability.

```ts
// Basic usage
const isHealthy = await $b24.tools.healthCheck.make()

if (isHealthy) {
  console.log('Bitrix24 API is available')
} else {
  console.error('Problems accessing Bitrix24 API')
}
```

## Method Signature

```ts-type
make(
  options?: { requestId?: string }
): Promise<boolean>
```

### Parameters

| Parameter | Type | Required | Description |
|----|----|----|----|
| **`requestId`** | `string`{lang="ts-type"} | No | Unique request identifier for tracking. Used for request deduplication and debugging. |

### Return Value

`Promise<boolean>`{lang="ts-type"} — a promise that resolves to a boolean value:

- **`true`** — REST API is available and responding, webhook is configured correctly.
- **`false`** — REST API is unavailable, an error occurred, or necessary access rights are missing.

## Examples

### Availability check

```ts [HealthCheck.ts]
import { B24Hook, LoggerFactory } from '@bitrix24/b24jssdk'

const devMode = typeof import.meta !== 'undefined' && (import.meta.dev || import.meta.env?.DEV)
const $logger = LoggerFactory.createForBrowser('Example:healthCheck', devMode)
const $b24 = B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/webhook_code/')

async function checkRestApiHealth(): Promise<boolean> {
  try {
    const isHealthy = await $b24.tools.healthCheck.make({
      requestId: `unique-request-id`
    })
    
    return isHealthy
  } catch (error) {
    $logger.error('Health check failed unexpectedly', { error })
    return false
  }
}

// Usage
try {
  const apiAvailable = await checkRestApiHealth()
  
  if (apiAvailable) {
    $logger.info('Bitrix24 API is available and responding')
  } else {
    $logger.error('Bitrix24 API is unavailable. Check:\n1. Correctness of webhook URL\n2. Bitrix24 availability from your network')
  }
} catch (error) {
  $logger.error('Failed to perform health check', { error })
}
```

## Alternatives and Recommendations

* **For measuring response speed**: Use [`Ping`](/docs/working-with-the-rest-api/tools-ping/).
* **For checking specific permissions**: Perform a test request to the required API method.
* **On the client-side (browser):** Use the built-in [`B24Frame`](/docs/getting-started/installation/vue/#init) object.

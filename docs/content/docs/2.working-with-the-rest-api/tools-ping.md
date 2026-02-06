---
title: Ping.make()
description: 'Method for measuring Bitrix24 REST API response speed. Performs a test request and returns response time in milliseconds.'
category: 'tools'
navigation.title: Ping
links:
  - label: Ping
    iconName: GitHubIcon
    to: https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/core/tools/ping.ts
---

::warning
We are still updating this page. Some data may be missing here — we will complete it shortly.
::

## Overview

Use `Ping.make()`{lang="ts-type"} to measure the response time of Bitrix24 REST API. The method returns a `Promise` with a numeric value of the response time in milliseconds.

```ts
// Basic usage
const responseTime = await $b24.tools.ping.make()

if (responseTime >= 0) {
  console.log(`API response time: ${responseTime}ms`)
} else {
  console.error('Failed to measure API response time')
}
```

## Method Signature

```ts-type
make(
  options?: { requestId?: string }
): Promise<number>
```

### Parameters

| Parameter | Type | Required | Description |
|----|----|----|----|
| **`requestId`** | `string`{lang="ts-type"} | No | Unique request identifier for tracking. Used for request deduplication and debugging. |

### Return Value

`Promise<number>`{lang="ts-type"} — a promise that resolves to a numeric value:

- **Positive number** — response time in milliseconds from sending the request to receiving the response.
- **`-1`** — in case of error or timeout.

## Examples

### Measuring response time

::code-example
---
name: 'tools-ping'
---
::

## Alternatives and Recommendations

* **For availability check**: Use [`HealthCheck`](/docs/working-with-the-rest-api/tools-health-check/).
* **For measuring operation performance**: Perform time measurements for specific API methods.
* **On the client-side (browser):** Use the built-in [`B24Frame`](/docs/getting-started/installation/vue/#init) object.

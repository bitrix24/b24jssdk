[![npm version](https://img.shields.io/npm/v/@bitrix24/b24jssdk)](https://www.npmjs.com/package/@bitrix24/b24jssdk)
[![license](https://img.shields.io/npm/l/@bitrix24/b24jssdk)](./LICENSE)
[![CI](https://github.com/bitrix24/b24jssdk/actions/workflows/ci.yml/badge.svg)](https://github.com/bitrix24/b24jssdk/actions/workflows/ci.yml)

# @bitrix24/b24jssdk

JavaScript/TypeScript SDK for the Bitrix24 REST API. Supports three usage scenarios:

- **B24Frame** — iframe apps embedded in the Bitrix24 interface (uses the current user's token automatically)
- **B24Hook** — server-side apps using a permanent webhook token
- **B24OAuth** — server-side apps using OAuth 2.0 with token refresh

## Installation

```bash
pnpm add @bitrix24/b24jssdk
```

For Nuxt projects:

```bash
pnpm add @bitrix24/b24jssdk-nuxt
```

## Quick Start

### B24Frame (iframe app)

```ts
import { initializeB24Frame } from '@bitrix24/b24jssdk'

const $b24 = await initializeB24Frame()

const response = await $b24.actions.v2.call.make({
  method: 'user.current',
  requestId: 'get-current-user'
})

if (response.isSuccess) {
  console.log(response.getData())
}

$b24.destroy()
```

### B24Hook (server webhook)

```ts
import { B24Hook } from '@bitrix24/b24jssdk'

const $b24 = B24Hook.fromWebhookUrl(process.env.B24_HOOK!)

const response = await $b24.actions.v2.call.make({
  method: 'user.current',
  requestId: 'get-current-user'
})

if (response.isSuccess) {
  console.log(response.getData())
}

$b24.destroy()
```

### B24OAuth (OAuth app)

```ts
import { B24OAuth } from '@bitrix24/b24jssdk'

const $b24 = new B24OAuth(tokenData, appCredentials)

const response = await $b24.actions.v2.call.make({
  method: 'user.current',
  requestId: 'get-current-user'
})

if (response.isSuccess) {
  console.log(response.getData())
}

$b24.destroy()
```

## Documentation

Full documentation: [https://bitrix24.github.io/b24jssdk/](https://bitrix24.github.io/b24jssdk/)

## Contributing

See [AGENTS.md](./AGENTS.md) for contributor and AI agent guidance.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

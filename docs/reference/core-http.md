---
outline: deep
---
# `Http` Class {#Http}

The `Http` class is designed for handling requests to the Bitrix24 REST API via HTTP.

Implements the [`TypeHttp`](types-type-http) interface.

It uses the [`axios`](https://github.com/axios/axios) library to perform HTTP requests.

Handles authorization errors and automatically refreshes the access token when necessary.

Creates a [`RestrictionManager`](core-restriction-manager) object to manage request rate limitations.

Creates a [`DefaultRequestIdGenerator`](core-request-id-generator) object to generate unique request identifiers.

::: tip
You can test working with **Http** in this [example](https://github.com/bitrix24/b24sdk-examples/blob/main/js/02-nuxt-hook/pages/hook/testing-rest-api-calls.client.vue).
:::

Restriction parameters are automatically set through the [`LicenseManager`](helper-license-manager).
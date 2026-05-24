# Bitrix24 REST API v3 — Internal Reference

<sub>Last reviewed: 2026-05-24.</sub>

> **Audience:** future Claude sessions writing or reviewing SDK code against REST v3.
> **Not** linked from `docs/`, **not** a SKILL, **not** part of `AGENTS.md`. The user
> will fold parts of this into the public docs gradually.
>
> **Sources:**
> - Server PHP dump under `@tmp/server_b24_restAPI_3/`. All file citations below are
>   relative to that root unless noted otherwise.
> - The official markdown page `api-reference/rest-v3/index.md` from
>   `bitrix-tools/b24-rest-docs` (Russian) — facts extracted, prose discarded.
> - **Every claim in this file is grounded in either a cited PHP file or `index.md`.**
>   Items not yet confirmed live in the **Open gaps** section at the bottom.

Path prefix shorthand:
- `lib/V3/...` → `bitrix/modules/rest/lib/V3/...`
- `lang/<lang>/...` → `bitrix/modules/rest/lang/<lang>/lib/V3/...`
- `general/...` → `bitrix/modules/rest/classes/general/...`

---

## 1. URL scheme and auth

**Endpoint format:**

```
https://{portal}/rest/api/{user_id}/{webhook}/{method}    # webhook auth
https://{portal}/rest/api/{method}                        # OAuth (token in body)
```

The `/api/` segment is what selects the v3 dispatcher. Without it, the legacy v2
dispatcher runs and a v3-only method returns `Method not found` (`index.md`,
"Как вызвать новую версию").

Webhook auth: `{user_id}` and `{webhook}` are the two URL segments.
OAuth auth: pass `auth: "<access_token>"` in the JSON request body.

**Transport rules (`index.md`, "Технические требования"):**
- Content-Type: `application/json`. The body is parsed with
  `HttpRequest::decodeJsonStrict()` (`lib/V3/Interaction/Request/Request.php:69`).
  Any non-JSON body throws `InvalidJsonException`.
- Methods that take parameters must be POST. Methods with no params accept GET or POST.
- Sending a non-POST with body → `WrongHttpRequestMethodException`
  (`lang/en/.../WrongHttpRequestMethodException.php`: `"Only POST requests are allowed"`).

**Special endpoint — OpenAPI schema:**
- `rest.documentation.openapi` (or shortcut alias `documentation`) returns the full
  OpenAPI document. Wired in `lib/V3/Realisation/Controller/Documentation.php`.
- Use this to discover supported fields, scopes, and method signatures of any
  installed module at runtime.

**Authentication & scope resolution** (`general/RestApiServer.php:566` `getRequestAccess`):
- `CRestUtil::checkAuth` validates the auth → on failure with `error: insufficient_scope`
  the dispatcher returns 403 (`STATUS_FORBIDDEN`); any other auth failure returns 401
  (`STATUS_UNAUTHORIZED`).
- The auth string can carry a **field allow-list per scope** using the syntax
  `scopeName[field1:field2:field3]`. The dispatcher parses this into a `Scope`
  object whose `fields` array narrows what `select` may request
  (`general/RestApiServer.php:589-595`, `lib/V3/Schema/Scope.php`).
- Token format: when `query.token` is supplied, the prefix before the first
  `CRestUtil::TOKEN_DELIMITER` is treated as the active scope
  (`general/RestApiServer.php:189`).

---

## 2. Response envelope

Every response is wrapped by the dispatcher (`general/RestApiServer.php:539-564`
`processResponse`):

```json
{ "result": <action-specific payload>, "time": { ...debug... } }
```

- `Response::isShowRawData()` (default `false`) → wrap in `{ "result": ... }`.
- `Response::isShowDebugInfo()` (default `true`) → append timing/debug block.
- `ErrorResponse` overrides both flags (`showRawData = true`, `showDebugInfo = false`),
  so errors come back at the top level, not under `result`.

### Action-specific payload shapes

| Action | Payload type | Shape | Source |
|---|---|---|---|
| `add` | `AddResponse` | `{ "id": int }` | `lib/V3/Interaction/Response/AddResponse.php` |
| `get` | `GetResponse` | `{ "item": { ...dto } }` | `.../GetResponse.php` |
| `list` / `tail` | `ListResponse` | `{ "items": [ ...dtos ] }` | `.../ListResponse.php`, `.../ResponseWithRelations.php` |
| `update` | `UpdateResponse` (`BooleanResponse`) | `{ "result": bool }` | `.../UpdateResponse.php`, `.../BooleanResponse.php` |
| `delete` | `DeleteResponse` (`BooleanResponse`) | `{ "result": bool }` | `.../DeleteResponse.php` |
| `aggregate` | `AggregateResponse` | `{ "result": { "<func>": { "<field>": <value>, ... }, ... } }` | `.../AggregateResponse.php`, `lib/V3/Structure/Aggregation/AggregationResultStructure.php` |
| `batch` | `BatchResponse` | `[ <child response>, <child response>, ... ]` (array, not object) | `.../BatchResponse.php` |
| Scope listing, Field listing | `ArrayResponse` | Arbitrary array, **`showRawData = false`** so still wrapped in `result` | `.../ArrayResponse.php` |
| Errors | `ErrorResponse` | `{ "error": { "code": "...", "message": "...", ...customData } }` | `.../ErrorResponse.php` |

After unwrapping `result`, callers see e.g. `result.item`, `result.items`, `result.id`,
`result.result`, etc. The outer `result.<key>` doubling is real — the SDK should not
"flatten" it.

### Error envelope

`{ "error": { "code": "<REGISTRY_CODE>", "message": "<localized>" } }`
(plus optional `validation: [...]` for validation errors, see §11).

The HTTP status comes from the exception's `STATUS` constant (default
`400 Bad Request` per `lib/V3/Exception/RestException.php:12`); see error catalogue
in §11 for per-class overrides.

---

## 3. Filter grammar

Defined by `lib/V3/Structure/Filtering/{Operator,Logic,FilterStructure}.php`.

### Operators (exhaustive — 8)

```
=   !=   >   >=   <   <=   in   between
```

`Operator` enum at `Filtering/Operator.php`. **There is no `like`, `%`, `~`, or
substring operator at this layer.** Anything outside the eight values throws
`UnknownFilterOperatorException` (`Unknown filter operator "#OPERATOR#"`).

`between` value must be a 2-element array: `[min, max]`.
`in` value must be an array.

### Logic and negation

```
Logic ∈ { "and" (default), "or" }
negative: bool   // wraps entire group in NOT
```

### Condition forms

The `filter` body is **a JSON array**. Each element is either a short condition
or a nested group.

**Short condition (`Filtering/FilterStructure.php:417-422`):**

```jsonc
[ "fieldName", "=", value ]            // 3-arg
[ "fieldName", value ]                 // 2-arg: array → "in", scalar → "="
```

**Long condition (struct form, `Filtering/FilterStructure.php:480-487`):**

```json
{ "type": "condition", "leftOperand": "fieldName", "operator": "=", "rightOperand": "value" }
```

**Nested group:**

```json
{
  "type": "filter",
  "logic": "or",
  "negative": false,
  "conditions": [ <conditions or groups> ]
}
```

The top-level element is always implicitly `logic: "and"`. `index.md` confirms
the same in its filter examples.

### `FilterRequired` attribute (server-side, important for SDK error messages)

A request property may be decorated with `#[FilterRequired(fields: [...])]`. The
parser checks that every listed field appears as a top-level `=` condition; if
missing, it throws `RequiredFieldsInRequestFilterPropertyException` (see
`lib/V3/Interaction/Request/Request.php:139-152`). The SDK should surface this
as a "filter must include …" hint, not a generic validation error.

### Auto-generated cursor condition (do not duplicate)

The `tail` action prepends an inequality condition on the cursor field
(`field > value` or `field < value`). **Putting that same field in your filter
explicitly throws `InvalidFilterException`**
(`lib/V3/Controller/TailOrmActionTrait.php:43-46`):
> `Cursor field <name> cannot be used at filter.`

---

## 4. Order

`lib/V3/Structure/Ordering/OrderStructure.php`.

```json
{ "fieldName": "asc", "anotherField": "desc" }
```

- **Object form only.** Numeric-key arrays throw `InvalidOrderException`
  (`Ordering/OrderStructure.php:34-37`).
- Direction is case-insensitive but normalized to `Asc`/`Desc` enums (`Bitrix\Main\DB\Order`).
- **The DTO field must carry `#[Sortable]`** (`lib/V3/Attribute/Sortable.php`), or the
  request is rejected with `DtoFieldRequiredAttributeException`:
  > `DTO "X" in field "Y" requires attribute "Sortable" to perform this request.`

---

## 5. Select and relations

`lib/V3/Structure/SelectStructure.php`.

```json
"select": ["id", "title", "responsible.name", "responsible.email", "UF_CRM_FOO"]
```

- Empty/missing `select` returns the full default set (subject to scope allow-list,
  see below).
- Plain field name → must exist in the DTO. Otherwise `UnknownDtoPropertyException`:
  > `Unknown field "X" found in entity "DTO".`
- `UF_*` user fields are routed to the user-fields trait
  (`SelectStructure.php:65-70`, `lib/V3/Structure/UserFieldsTrait.php`).
- Dot syntax (`a.b`, `a.b.c`) is the relation expansion mechanism
  (`SelectStructure.php:94-186`):
  - The first segment must be either a relation marked with
    `#[RelationToOne]` / `#[RelationToMany]` (`lib/V3/Attribute/RelationToOne.php`,
    `RelationToMany.php`), or a typed `Dto`/`DtoCollection` property.
  - Each relation creates a dependent `ListRequest` resolved by the dispatcher
    after the parent query (`general/RestApiServer.php:465-508`).
  - Relations whose backing controller declares `#[ResolvedBy(controller: "...")]`
    (`lib/V3/Attribute/ResolvedBy.php`) are resolved by re-entering the dispatcher
    against that controller's `list` action.
  - If the relation has no resolver and no inline DTO type → `UnknownDtoPropertyException`.

### Scope-based field allow-list

When `getRequestAccess` produces a scope of the form `crm.deal[id:title:stageId]`,
`select` is silently filtered to that whitelist
(`SelectStructure.php:42-46`, `lib/V3/Interaction/Request/Request.php:107-110`).
Selecting a field outside the allow-list is rejected with the same
`UnknownDtoPropertyException` as if the field did not exist in the DTO. **From the
client's point of view, OAuth scopes can hide DTO fields.**

---

## 6. Pagination — offset / limit (`list` action)

`lib/V3/Structure/PaginationStructure.php`.

```jsonc
"pagination": {
  "limit": 50,    // default 50, max 1000 (silently clamped)
  "offset": 0,    // OR
  "page": 1       // 1-based; converts to offset = (page - 1) * limit
}
```

Constants:
- `PaginationStructure::DEFAULT_LIMIT = 50`
- `PaginationStructure::MAX_LIMIT = 1000` (`limit > 1000` is silently clamped down,
  not rejected — `PaginationStructure.php:29`).
- `limit == 0` or non-numeric → `InvalidPaginationException`.

`offset` and `page` are **mutually overwriting**. If both supplied, `page` wins
(it is processed last and overwrites `offset` — `PaginationStructure.php:42-50`).

**Total count is not returned.** Detect end-of-data by `items.length < limit`.

---

## 7. Pagination — cursor (`tail` action)

`lib/V3/Structure/CursorStructure.php` + `lib/V3/Controller/TailOrmActionTrait.php`.

This is **keyset pagination, not opaque-token pagination**. The cursor is the last
seen value of a chosen field — the client manages it.

```jsonc
"cursor": {
  "field": "id",         // required; must exist in DTO; default "id"
  "value": 0,            // required; last seen value (use 0 for first page)
  "order": "asc",        // optional; default "asc"
  "limit": 50            // optional; same DEFAULT_LIMIT/MAX_LIMIT as pagination
}
```

How the server handles it (`TailOrmActionTrait.php:33-71`):

1. Reads `field`, `value`, `order`, `limit` from cursor (or applies defaults
   `id`, `0`, `Asc`, `50`).
2. Verifies the field is **not** already used in your `filter` —
   `InvalidFilterException("Cursor field ... cannot be used at filter.")`.
3. Appends `field > value` (Asc) or `field < value` (Desc) to the filter.
4. Forces `order` to `{ field: order }` regardless of any user-supplied order.
5. Runs the underlying ORM query with that synthetic filter and order.

**Driving the loop:**
- Page 1: send `value = 0` (or the lowest possible value for that field's type).
- Page N+1: send `value = items[items.length - 1][field]` from the previous response.
- Stop when `items.length < limit`.

**Caveats:**
- The chosen field must be unique and monotonic for the order, otherwise rows can
  be skipped (or repeated when the order flips).
- The cursor field **must** be present in the response shape so the client can read
  it for the next call. Don't omit it from `select`.
- `cursor.value` and `cursor.field` are both **required** when the `cursor` block
  is present — missing them throws `RequiredFieldInRequestException("cursor.value")`
  / `("cursor.field")` (`CursorStructure.php:50,67`).

---

## 8. Aggregators (`aggregate` action)

`lib/V3/Structure/Aggregation/*` + `lib/V3/Controller/AggregateOrmActionTrait.php`.

```json
{
  "select": {
    "sum":   { "amount": "totalAmount" },
    "count": [ "id" ],
    "avg":   { "price": "avgPrice" },
    "min":   [ "createdAt" ],
    "max":   [ "createdAt" ]
  },
  "filter": [ ... ]
}
```

### Functions (exhaustive — 6)

```
avg   sum   min   max   count   countDistinct
```

`AggregationType` enum at `Structure/Aggregation/AggregationType.php`. Anything
else throws `UnknownAggregateFunctionException`:
> `Unknown aggregate function "#FUNCTION#".`

### Two request forms per function

- **List:** `"sum": ["amount", "qty"]` — alias defaults to `<func>_<field>`,
  e.g. `sum_amount`.
- **Map:** `"sum": { "amount": "totalAmount" }` — alias is the value.
  (`Structure/Aggregation/AggregationSelectStructure.php:42-47`.)

### Field gating

Each field used in `select` **must carry `#[Filterable]`** on its DTO property
(`AggregationSelectStructure.php:55-58`). Otherwise:
> `DTO "X" in field "Y" requires attribute "Filterable" to perform this request.`

This is the same attribute that gates filter usage — aggregators piggy-back on it.

### Response shape

```json
{
  "result": {
    "result": {
      "sum":   { "amount": 12345 },
      "count": { "id": 87 },
      "avg":   { "price": 99.5 }
    }
  }
}
```

Buckets are keyed by function value (`avg`, `sum`, `min`, `max`, `count`,
`countDistinct`). Inside each bucket, keys are the **field names** (not aliases)
because `AggregationResultStructure::toArray()` regroups by
`item.aggregation.value → item.field → item.value`
(`AggregationResultStructure.php:30-38`).

> The custom alias passed in the request never appears in the response — the
> server returns by `<func>.<field>`, not by `<func>.<alias>`. The SDK should
> surface this in its types.

---

## 9. Batch (`batch` action)

Top-level method, registered globally with action URI `batch`
(`lib/V3/Schema/SchemaManager.php:56-65`, scopes
`[GLOBAL_SCOPE, "rest", "rest.batch"]`).

### Request

```jsonc
[
  { "method": "<method>", "query": { ... }, "as": "alias1", "parallel": false },
  { "method": "<method>", "query": { ... }, "as": "alias2" }
]
```

- The body is a **JSON array** at the top level (no wrapping object).
- Per-item required: `method` and `query`. Missing either →
  `InvalidSelectException("Each request item must have a 'method' and 'query' attribute")`
  (`lib/V3/Interaction/Request/BatchRequest.php:20-22`).
- `as` (string) — alias for context lookups. Aliases must be unique across the
  batch; duplicates throw `InvalidSelectException("...two aliases with same name...")`
  (`BatchRequest.php:28-31`).
- `parallel` (bool, default `false`) — present in the schema but the dispatcher
  loops items sequentially in `general/RestApiServer.php:303-318`. **Treat it as
  a no-op for now and document it as such.**

### Context resolution — `$ref` / `$refArray`

**This is undocumented in `index.md`.** Source: `general/RestApiServer.php:322-403`
(`prepareJsonData`).

After each item runs, its response payload is stored in a **context dictionary**
keyed by alias (or numeric index when no alias). Specifically:
- `GetResponse.item` → context entry equals the `item` object.
- `ListResponse.items` → context entry equals the `items` array.
- Any other response shape → no context entry (the alias is unusable downstream).

Subsequent items can pull values from that context using two reference forms in
their `query`:

```jsonc
// Single value
{ "$ref": "alias.path.to.field" }

// Collect a field across array entries (only for items[] context entries)
{ "$refArray": "alias.field" }
// Resolves to: [ context.alias[0].field, context.alias[1].field, ... ]
```

Failure modes (`general/RestApiServer.php:331-393`):
- Path missing in context → `InvalidSelectException("Path 'X' not found in context")`.
- Walking past a non-array key → `InvalidSelectException("Invalid context path 'X' - expected array at 'Y'")`.
- `$refArray` without a `.` in its value → `InvalidSelectException("Invalid $refArray format - expected 'path.to.array.field'")`.
- `$refArray` pointing at a non-iterable → `InvalidSelectException("Path 'X' must point to an array or iterable")`.
- `$refArray` items missing the trailing field → `InvalidSelectException("Field 'F' not found in items")`.

Substitution is **recursive** — `$ref` and `$refArray` are resolved inside nested
arrays and objects, not just at the top level.

### Response

```json
{
  "result": [
    <child response 1>,
    <child response 2>,
    ...
  ]
}
```

Each child is the **already-unwrapped** result for that item (the toArray of the
inner `Response` — see `BatchResponse::toArray()` at `BatchResponse.php:28-37`).
Order matches the request.

### Error short-circuit

If any child item produces an `ErrorResponse`, the dispatcher **aborts the batch**
and returns that error as the overall response — subsequent items are not run
(`general/RestApiServer.php:312-315`). Plan retries accordingly.

### Worked example

```json
[
  {
    "method": "tasks.task.list",
    "as": "tasks",
    "query": {
      "filter": [ ["responsible", "=", 42] ],
      "select": ["id", "title"],
      "pagination": { "limit": 10 }
    }
  },
  {
    "method": "tasks.task.comment.list",
    "as": "comments",
    "query": {
      "filter": [ ["taskId", "in", { "$refArray": "tasks.id" } ] ]
    }
  }
]
```

Step 2's `taskId` filter is rewritten on the server to the array of `id`s pulled
from step 1's `items[]`.

---

## 10. CRUD action wiring (server-side, useful for predicting allowed shapes)

| Trait | Action | Required body | Notes | File |
|---|---|---|---|---|
| `AddOrmActionTrait` | `addAction` | `fields: { ... }` | DTO validated against `RequiredGroup::Add`. | `lib/V3/Controller/AddOrmActionTrait.php` |
| `GetOrmActionTrait` | `getAction` | `id` (string) + optional `select` | Missing → `EntityNotFoundException`. | `.../GetOrmActionTrait.php` |
| `ListOrmActionTrait` | `listAction` | optional `select`/`filter`/`order`/`pagination` | See §5–§6. | `.../ListOrmActionTrait.php` |
| `TailOrmActionTrait` | `tailAction` | optional `select`/`filter`/`cursor` | See §7. | `.../TailOrmActionTrait.php` |
| `UpdateOrmActionTrait` | `updateAction` | `fields: { ... }` + **exactly one of** `id` / `filter` | `id` and `filter` are mutually exclusive (`#[OnlyOneOfPropertyRequired]`); at least one required. Validated against `RequiredGroup::Update`. | `.../UpdateOrmActionTrait.php`, `lib/V3/Interaction/Request/UpdateRequest.php` |
| `DeleteOrmActionTrait` | `deleteAction` | **exactly one of** `id` / `filter` | Same constraint as update. | `.../DeleteOrmActionTrait.php`, `lib/V3/Interaction/Request/DeleteRequest.php` |
| `AggregateOrmActionTrait` | `aggregateAction` | `select` (aggregation map) + optional `filter` | See §8. | `.../AggregateOrmActionTrait.php` |

Note: `id` is typed `string` in `GetRequest`/`UpdateRequest`/`DeleteRequest`. Even
for numeric IDs, the SDK should accept and forward strings to keep BigInt/UUID
support possible.

### DTO attributes the SDK should be aware of (mostly to surface error messages well)

From `lib/V3/Attribute/`:

| Attribute | Effect | Trigger when missing |
|---|---|---|
| `#[OrmEntity(entity: "...")]` | Binds DTO class to an ORM `DataManager`. | Server-side wiring fault (`ClassRequireAttributeException`). |
| `#[DtoType(...)]` | Tells the controller which DTO class a `Request` is for. | `ClassRequireAttributeException`. |
| `#[Filterable]` | Field can appear in `filter` and in aggregator `select`. | `DtoFieldRequiredAttributeException`. |
| `#[Sortable]` | Field can appear in `order`. | Same as above (with attribute name `Sortable`). |
| `#[Editable]` | Field accepted in `add`/`update` `fields`. | Field silently ignored (or rejected as unknown — confirm in real controller, see Open gaps). |
| `#[Required]`, `#[Required(['add'])]`, `#[Required(['update'])]` | Field required in the listed `RequiredGroup`s. | `DtoValidationException`. |
| `#[RelationToOne]`, `#[RelationToMany]` | Field is a related DTO; resolved via dot-syntax in `select`. | `UnknownDtoPropertyException` if relation isn't declared. |
| `#[ResolvedBy(controller: "...")]` | A relation is fetched by re-entering this controller's `list`. | `RelationMethodNotFoundException`. |
| `#[Optional]`, `#[Nullable]`, `#[ElementType]`, `#[JsonArray]` | Property metadata used by validation/serialization. | (varies) |

Real DTO example with attributes (use as a mental model):
`lib/V3/Realisation/Dto/Field/CustomDto.php` — uses `#[Filterable]`, `#[Required]`,
`#[Required(['add'])]`, `#[Editable]`, plus standard `Bitrix\Main\Validation\Rule\InArray`.

---

## 11. Errors catalogue

Base class `lib/V3/Exception/RestException.php`. Registry code derives from FQCN:
all `\` → `_`, uppercased — that's the `code` field on the wire.

Full table of exceptions found in the dump. Status from each class's `STATUS`
constant (default `400 Bad Request`). Messages are the EN strings from
`lang/en/lib/V3/Exception/...`.

| Registry code (prefix `BITRIX_REST_V3_EXCEPTION_`) | HTTP | Message (EN) | Trigger | Source |
|---|---|---|---|---|
| `ACCESSDENIEDEXCEPTION` | 400 / 403 / 401 (depends on caller) | Access denied. | Permission failure or insufficient scope. | `Exception/AccessDeniedException.php`, status set by caller (`general/RestApiServer.php:573`, `general/RestApiServer.php:428`) |
| `CLASSREQUIREATTRIBUTEEXCEPTION` | 400 | Class "#CLASS#" requires attribute "#ATTRIBUTE#". | Server-side wiring; treat as 5xx behaviour. | `Exception/ClassRequireAttributeException.php` |
| `ENTITYNOTFOUNDEXCEPTION` | 400 | Entity with ID #ID# was not found. | `getAction` couldn't load `id`. | `Exception/EntityNotFoundException.php` |
| `INVALIDCLASSINSTANCEPROVIDEDEXCEPTION` | 400 | Invalid object class provided. Provided: "#PROVIDED#", required: "#REQUIRED#". | Internal type mismatch. | `Exception/InvalidClassInstanceProvidedException.php` |
| `INVALIDFILTEREXCEPTION` | 400 | Invalid filter "#FILTER#". | Bad filter shape (array length, missing `conditions`, etc.). | `Exception/InvalidFilterException.php` |
| `INVALIDJSONEXCEPTION` | 400 | Invalid JSON. | Body not parseable. | `Exception/InvalidJsonException.php` |
| `INVALIDORDEREXCEPTION` | 400 | Invalid sort order "#ORDER#". | Numeric-key array, or direction not asc/desc. | `Exception/InvalidOrderException.php` |
| `INVALIDPAGINATIONEXCEPTION` | 400 | Invalid pagination parameter "#PAGE#". | `limit==0`, non-numeric `limit`/`offset`/`page`. | `Exception/InvalidPaginationException.php` |
| `INVALIDSELECTEXCEPTION` | 400 | Invalid select expression "#SELECT#". | Nested arrays where field name expected; bad batch item; `$ref`/`$refArray` failures. | `Exception/InvalidSelectException.php` |
| `LICENSEEXCEPTION` | 400 / 403 | This feature is not supported by the active license. | License gating. Tier-restricted feature. | `Exception/LicenseException.php` |
| `LOGICEXCEPTION` | 400 | Application business logic error. | Module-thrown business rule violation. | `Exception/LogicException.php` |
| `METHODNOTFOUNDEXCEPTION` | 400 | Method "#METHOD#" was not found. | Unknown method, or v3-only method called without `/api/`. | `Exception/MethodNotFoundException.php` |
| `RATELIMITEXCEPTION` | **429** | Request was blocked because the limit was exceeded. | Rate limit hit (`LoadLimiter::is`). | `Exception/RateLimitException.php` (status `\CRestServer::STATUS_TO_MANY_REQUESTS = "429 Too Many Requests"`, `general/rest.php:46`) |
| `RELATIONMETHODNOTFOUNDEXCEPTION` | 400 | (from `RelationMethodNotFound`) | `#[ResolvedBy]` points at a missing controller. | `Exception/RelationMethodNotFoundException.php` |
| `TOOMANYATTRIBUTESEXCEPTION` | 400 | Incorrect number of attributes provided. Class: "#CLASS#", attribute: "#ATTRIBUTE#", expected count: "#EXPECTED_COUNT#". | Internal wiring fault. | `Exception/TooManyAttributesException.php` |
| `UNKNOWNAGGREGATEFUNCTIONEXCEPTION` | 400 | Unknown aggregate function "#FUNCTION#". | Function not in `{avg, sum, min, max, count, countDistinct}`. | `Exception/UnknownAggregateFunctionException.php` |
| `UNKNOWNDTOPROPERTYEXCEPTION` | 400 | Unknown field "#FIELD#" found in entity "#DTO#". | Field not on DTO, or not in the scope's allow-list. | `Exception/UnknownDtoPropertyException.php` |
| `UNKNOWNFILTEROPERATOREXCEPTION` | 400 | Unknown filter operator "#OPERATOR#". | Operator outside the 8-value enum. | `Exception/UnknownFilterOperatorException.php` |
| `WRONGHTTPREQUESTMETHODEXCEPTION` | 400 | Only POST requests are allowed. | GET used where POST is required. | `Exception/WrongHttpRequestMethodException.php` |

### Internal exceptions (`Exception/Internal/`)

These wrap server-side faults. They surface as v3 errors but the user-side code
should rarely care which subclass it was.

| Registry code | HTTP | Message (EN) |
|---|---|---|
| `INTERNAL_INTERNALEXCEPTION` | 500 (effective) | Something's gone wrong. |
| `INTERNAL_ORMSAVEEXCEPTION` | 400 | Internal error when saving a database record. |

### Validation exceptions (`Exception/Validation/`)

These add a `validation: [...]` payload alongside `code` and `message`. Each
entry is `{ field: "...", message: "..." }` (`index.md`, "Структура неуспешного
ответа").

| Registry code | Message (EN) | Trigger |
|---|---|---|
| `VALIDATION_REQUESTVALIDATIONEXCEPTION` | Error validating request object. | Aggregate validation failure (multi-error). |
| `VALIDATION_REQUIREDFIELDINREQUESTEXCEPTION` | Required field "#FIELD#" is missing. | E.g. missing `cursor.value`, `cursor.field`, missing `id`/`filter` on update/delete (field `"id || filter"`). |
| `VALIDATION_INVALIDREQUESTFIELDTYPEEXCEPTION` | Field "#FIELD#" requires type "#TYPE#" to perform this request. | Type coercion failure. |
| `VALIDATION_DTOFIELDREQUIREDATTRIBUTEEXCEPTION` | DTO "#DTO#" in field "#FIELD#" requires attribute "#ATTRIBUTE#" to perform this request. | Used `Sortable`/`Filterable` field that lacks the attribute. |
| `VALIDATION_DTOVALIDATIONEXCEPTION` | Error validating object. | DTO-level validation in add/update. |
| `VALIDATION_INVALIDFILEEXCEPTION` | File validation failed. | File field validator. |

> Localisation: messages above are the **English** strings. Localized message
> returned in responses uses `Accept-Language` / portal default. Russian variants
> live alongside under `lang/ru/...`.

---

## 12. Differences from v2 worth knowing (terse)

| | v2 | v3 |
|---|---|---|
| URL | `/rest/{user_id}/{webhook}/{method}` | `/rest/api/{user_id}/{webhook}/{method}` |
| Body | JSON or `application/x-www-form-urlencoded` | **JSON only** |
| Result wrapper | Method-dependent (`result` is sometimes the value, sometimes an object) | Uniform `{ "result": <action-shape> }` for all actions |
| `add` returns | Often the int id directly | `result.id` (`int`) |
| `get` returns | Method-dependent | `result.item` (DTO object) |
| `list` returns | Often `result` = array; pagination via `start`/`next` | `result.items`; pagination via `pagination.{limit,offset,page}` or `cursor` (`tail`) |
| Filter | Per-method; many lack OR | Universal grammar with `logic`/`negative`, AND of array elements |
| Filter operators | Module-defined, often string-prefixed (`%`, `>=`) | Fixed enum of 8 |
| Batch | URL-encoded sub-calls + `$result[...]` placeholders | JSON array; `$ref` / `$refArray` for cross-step data |
| Errors | `error`, `error_description` (OAuth-style or method-specific) | `error.code` (registry code) + `error.message` (+ `error.validation[]`) |
| Discovery | Hand-written docs only | `rest.documentation.openapi` returns OpenAPI |
| Pagination | `start` integer offset; `next` in response | Explicit `pagination` object **or** keyset `cursor` for `tail` |
| Aggregates | Generally absent or method-specific | Dedicated `aggregateAction` with 6 functions |

---

## 13. Open gaps (update when source available)

These are deliberately left as TODOs because the dump does not contain the source
of truth for them yet:

1. **Numeric rate-limit thresholds.** `RateLimitException` only carries the 429
   status and a generic phrase; the actual per-method / per-auth-type limits live
   in `Bitrix\Rest\Engine\Access\LoadLimiter`, which is not in the dump. Until
   that's confirmed, the SDK should retry on 429 with backoff but not assume
   any specific RPS budget.
2. **`parallel: true` semantics in batch.** The schema accepts the flag
   (`BatchRequestItem.php:11`), but the dispatcher (`general/RestApiServer.php:303-318`)
   loops items sequentially. Either it's a future-reserved flag or there is
   parallel-execution code in another file. Not safe to rely on for now.
3. **Real third-party V3 controller in dump.** User pointed to
   `bitrix/modules/tasks/lib/rest/controllers/`, but those are legacy v2 controllers
   (no `V3` namespace, no `RestController`/`*OrmActionTrait` usage). Confirmed
   by grep — no matches for `extends RestController`, `OrmActionTrait`,
   `#[OrmEntity]`, `#[DtoType]` anywhere under `tasks/`. The only V3 controllers
   present are the framework ones at `lib/V3/Realisation/Controller/{Field,Scope,Documentation}.php`.
   For a real-world example showing scope wiring + DTO attributes, ask the user
   to drop in a CRM or Tasks v3 controller (when one is released).
4. **Behaviour of `#[Editable]` when caller submits a non-editable field in
   `fields`.** Need to read `lib/V3/Structure/FieldsStructure.php` more carefully
   to know if non-editable fields are silently dropped, or rejected with
   `UnknownDtoPropertyException`.
5. **Exact debug block shape.** `processResponse` calls `appendDebugInfo`
   (`general/RestApiServer.php:553-555`) and the SDK's `Result` should expose
   timing if needed — body of `appendDebugInfo` is in `general/rest.php` and
   should be copy-pasted in here once we audit it.
6. **`signature` field on responses.** `processResponse` adds
   `result.signature` when `securityClientState && securityMethodState`
   (`general/RestApiServer.php:543-546`). The SDK probably needs to verify this
   for OAuth flows; needs a closer read of `getApplicationSignature()`.
7. **OAuth refresh / `expired_token` flow on v3.** The dispatcher routes
   `insufficient_scope` → 403 and any other auth failure → 401, but the actual
   error code/payload returned for an expired token in v3 is not explicitly
   in this dump. Confirm by hitting the endpoint or by reading
   `\Bitrix\Rest\OAuthException` in another module dump.

---

## 14. Quick-reference cheatsheet

```jsonc
// Single GET
POST /rest/api/{userId}/{hook}/somemodule.entity.get
{ "id": "42", "select": ["id", "title", "responsible.name"] }

// LIST with offset pagination
POST /rest/api/{userId}/{hook}/somemodule.entity.list
{
  "select":     ["id", "title"],
  "filter":     [ ["status", "=", "NEW"], ["createdAt", ">", "2026-01-01"] ],
  "order":      { "createdAt": "desc" },
  "pagination": { "limit": 100, "page": 1 }
}

// TAIL with cursor (keyset)
POST /rest/api/{userId}/{hook}/somemodule.entity.tail
{
  "select": ["id", "title", "createdAt"],
  "filter": [ ["status", "=", "NEW"] ],
  "cursor": { "field": "id", "value": 0, "order": "asc", "limit": 100 }
}
// Next page → cursor.value = items[items.length-1].id

// AGGREGATE
POST /rest/api/{userId}/{hook}/somemodule.entity.aggregate
{
  "select": {
    "sum":   { "amount": "totalAmount" },
    "count": ["id"]
  },
  "filter": [ ["status", "=", "NEW"] ]
}

// BATCH with $ref / $refArray
POST /rest/api/{userId}/{hook}/batch
[
  { "method": "tasks.task.list", "as": "t",
    "query": { "select": ["id"], "pagination": { "limit": 10 } } },
  { "method": "tasks.task.comment.list",
    "query": { "filter": [ ["taskId", "in", { "$refArray": "t.id" } ] ] } }
]
```

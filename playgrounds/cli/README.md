# @bitrix24/b24jssdk-cli

CLI tool for generating test data and load testing in Bitrix24 via REST API.

## Overview

This CLI utility is designed for developers and QA engineers who need to:

- Generate realistic test entities (tasks, contacts, companies, products) in Bitrix24
- Perform load testing of Bitrix24 REST API integrations
- Quickly populate a Bitrix24 instance with demo data

The tool uses [@bitrix24/b24jssdk](https://bitrix24.github.io/b24jssdk/) for API communication and [citty](https://github.com/unjs/citty) for command-line interface.

## Requirements

- **Node.js** v22.0.0 or higher
- **pnpm** package manager
- **Bitrix24 webhook** with the following permissions:
  - `tasks` and `task`  — for creating tasks
  - `crm` — for creating contacts, companies, invoices
  - `catalog` — for creating products

## Installation

1. Clone the repository and install dependencies from the monorepo root:

```bash
pnpm install
```

2. Navigate to the CLI playground directory and create your environment file:

```bash
cd playgrounds/cli
cp .env.example .env
```

3. Edit `.env` and set your Bitrix24 webhook URL:

```bash
B24_HOOK=https://your-domain.bitrix24.com/rest/your-user-id/your-webhook-code/
```

### Getting a Webhook URL

1. Go to your Bitrix24 portal
2. Navigate to **Applications** → **Developer resources** → **Other** → **Inbound webhook**
3. Create a new webhook with required permissions
4. Copy the webhook URL (format: `https://your-domain.bitrix24.com/rest/1/abc123xyz/`)

> **Important:** The `.env` file must be located in `playgrounds/cli/`, not in the workspace root.

## Commands

### Make Tasks

Creates random tasks in Bitrix24.

**Syntax:**

```bash
pnpm run dev make tasks --total=<number> [--creatorId=<id>] [--responsibleId=<id>]
```

**Arguments:**

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--total` | Yes | — | Number of tasks to create |
| `--creatorId` | No | `1` | User ID of the task creator |
| `--responsibleId` | No | `1` | User ID of the responsible person |

**Generated data:**

- **Title**: Realistic task names in 4 languages (Chinese, English, Russian, Spanish) using verb + object patterns (e.g., "Prepare quarterly report", "Протестировать API-эндпоинты")
- **Priority**: Random (`low`, `average`, `high`)
- **Status**: `pending` (initial)
- **Deadline**: Random time within 1-36 hours from now
- **Description**: Contains a tag in the selected language
- **Checklist**: ~40% of tasks include 2-6 checklist items

**Examples:**

```bash
# Create 10 tasks with default settings
pnpm run dev make tasks --total=10

# Create 50 tasks with specific creator and responsible
pnpm run dev make tasks --total=50 --creatorId=1 --responsibleId=2

# Create 100 tasks for load testing
pnpm run dev make tasks --total=100
```

### Make Products (with SKU)

Creates random products with stock keeping units (SKUs) in Bitrix24 catalog.

**Syntax:**

```bash
pnpm run dev make products-sku --total=<number> [--theme=<industrial|fashion>] [--vatIncluded=<Y|N>] [--currency=<code>]
```

**Arguments:**

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--total` | Yes | — | Number of parent products to create |
| `--theme` | No | `industrial` | Theme for product names (`industrial` or `fashion`) |
| `--vatIncluded` | No | `N` | Whether VAT is included in price (`Y` or `N`) |
| `--currency` | No | `USD` | Currency code for prices (e.g., `USD`, `EUR`, `RUB`) |

**Generated data:**

- **Parent product**: Created in the main product catalog with a unique name based on the selected theme (e.g., "Hydraulic Pump 8421" for industrial, "Leather Jacket 3572" for fashion).
- **SKU (offer)**: A variation linked to the parent product. Includes:
  - Random values for available SKU properties (e.g., color, size) discovered from the catalog.
  - Random physical parameters: height, length, width, weight (1‑1000 units).
  - Random quantity in stock (1‑1000).
  - Random purchase price (200‑10200 in the specified currency).
  - Random VAT rate (selected from existing VAT rates in Bitrix24).
  - Random measure unit (from existing measures, e.g., pieces, kg).
- **Prices**: For each active price type (e.g., retail, wholesale), a random selling price (500‑20500) is added, linked to the SKU.
- **Images**: Currently placeholder (no actual image data is sent; this can be extended).

**Discovery phase**:

Before creation, the script automatically detects:

- Product and SKU information block IDs
- Available price types
- Available measures and VAT rates
- SKU properties of type "list" (e.g., Color, Size) and their possible values
- Existing product names to avoid duplicates (names are generated uniquely)

**Examples:**

```bash
# Create 10 industrial-themed products with default settings
pnpm run dev make products-sku --total=10

# Create 20 fashion products with VAT included in prices, in EUR
pnpm run dev make products-sku --total=20 --theme=fashion --vatIncluded=Y --currency=EUR

# Create 5 products with custom currency
pnpm run dev make products-sku --total=5 --theme=industrial --currency=RUB
```

### Make Contacts

Creates random contacts in Bitrix24 CRM.

**Syntax:**

```bash
pnpm run dev make contacts --total=<number> [--assignedById=<id>]
```

**Arguments:**

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--total` | Yes | — | Number of contacts to create |
| `--assignedById` | No | `1` | User ID of the assigned person |

**Generated data:**

- **Name**: Realistic first and last names in 4 languages (Chinese, English, Russian, Spanish)
- **Email**: Generated from name (e.g., `john.smith@gmail.com`, `王伟@outlook.com`)
- **Phone**: Country-specific format (+86 for China, +1 for US, +7 for Russia, +34 for Spain)
- **Source**: Random (`WEBFORM`, `CALL`, `OTHER`, `RC_GENERATOR`)
- **Position**: Random (`Manager`, `Developer`, `Director`, `Analyst`, `Specialist`)
- **Type**: `CLIENT`

**Examples:**

```bash
# Create 10 contacts
pnpm run dev make contacts --total=10

# Create 25 contacts assigned to user ID 5
pnpm run dev make contacts --total=25 --assignedById=5
```

### Make Companies

Creates random companies in Bitrix24 CRM.

**Syntax:**

```bash
pnpm run dev make companies --total=<number> [--assignedById=<id>]
```

**Arguments:**

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--total` | Yes | — | Number of companies to create |
| `--assignedById` | No | `1` | User ID of the assigned person |

**Generated data:**

- **Title**: Business-style names combining prefix + industry + suffix (e.g., "Global Tech Solutions", "NextGen Finance Corp", "Digital Media Partners")
- **Email**: Generated from company name
- **Phone**: Country-specific format
- **Source**: `OTHER`
- **Type**: `CLIENT`

**Examples:**

```bash
# Create 10 companies
pnpm run dev make companies --total=10

# Create 30 companies assigned to user ID 3
pnpm run dev make companies --total=30 --assignedById=3
```

### Make Deals

Creates random deals in Bitrix24 CRM with products, counterparties, and stages.

**Syntax:**

```bash
pnpm run dev make deals --total=<number> [--assignedById=<id>] [--categoryId=<id>] [--maxProducts=<number>]
```

**Arguments:**

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--total` | Yes | — | Number of deals to create |
| `--assignedById` | No | `1` | User ID of the responsible person |
| `--categoryId` | No | `0` | Sales funnel ID (`0` for default funnel) |
| `--maxProducts` | No | `4` | Maximum number of SKU products per deal (1‑5) |

**Generated data:**

- **Counterparty**: Randomly selects either a **company** (legal entity) or a **contact** (individual) from existing CRM records (50/50 chance).
- **Currency**: Random currency from available CRM currencies.
- **Source**: Random source ID from CRM sources (if any).
- **Stage**: Distributed according to a realistic pipeline:
  - 30% — first stage (e.g., `NEW`)
  - 40% — successful stage (`WON`)
  - 30% — unsuccessful stage (`LOSE`)
- **Dates**:
  - **Start date**: Random within the last 2 years.
  - **Close date**: Random 5‑120 days after start.
- **Title**: English‑language deal names generated from product‑related themes (e.g., "Steel Fabrication Deal").
- **Products**: 1 to `--maxProducts` random SKU products from the catalog. For each product:
  - Quantity: random 1‑10.
  - Price: random 500‑20,000 (in the selected currency).
  - VAT handling: tax included if counterparty is a contact (individual), excluded if company.
  - VAT rate: random from existing VAT rates.
- **Batch processing**: Commands are grouped into batches of up to 50 for maximum performance.

**Examples:**

```bash
# Create 10 deals in the default funnel
pnpm run dev make deals --total=10

# Create 50 deals in funnel ID 3 with up to 5 products each, assigned to user 5
pnpm run dev make deals --total=50 --categoryId=3 --maxProducts=5 --assignedById=5

# Create 150 deals for load testing
pnpm run dev make deals --total=150
```

### List Tasks

Lists tasks from Bitrix24 via the REST API v3 `tasks.task.list` method, paging through the full result set with a keyset cursor.

**Syntax:**

```bash
pnpm run dev list tasks [--limit=<number>]
```

**Arguments:**

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--limit` | No | `50` | Page size per request (the server caps `tasks.task.list` at 50) |

### Smoke Retry

Manual smoke tests for the retry-policy fix.

**Syntax:**

```bash
pnpm run dev smoke-retry [--scenario=<A|B|D|E|all>] [--taskId=<id>] [--total=<n>] [--logFile=<path>]
```

See [Smoke tests: retry policy](#smoke-tests-retry-policy) for full documentation.

## Smoke tests: retry policy

> Manual end-to-end checks for the retry-policy fix (PR #45, issues #44 / #46).
> The unit suite (`pnpm run package-jssdk:test:run`) covers the same regressions
> deterministically; this script exists to confirm the behaviour against a real
> portal. Source: [`src/commands/smoke-retry.ts`](./src/commands/smoke-retry.ts).

### What the file does

| | Scenario | Tests | Main PASS condition |
|---|---|---|---|
| **A** | #44 — v3 validation 400 | Regression for issue #44: the fix fires on v3 | `attempts=1`, `not-retryable=1`, `[THROWN]` < 2s |
| **B** | #46 — `tasks.task.pause` code `1048582` | Regression for issue #46: the fix fires on unlisted 4xx codes | `attempts=1`, `not-retryable=1` (or `[OK]`), < 1.5s |
| **D** | Timeout (HTTP 408) still retries | Negative control: 408 is not caught by the fix | `attempts=3`, `not-retryable=0` |
| **E** | 500 parallel requests | Negative control: the rate limiter still kicks in | `ok=TOTAL`, `attempts ≥ TOTAL`, `rateLimitHits > 0`, `not-retryable=0` |

### `.env`

Required in `playgrounds/cli/.env`:

```
B24_HOOK=https://<portal>/rest/<userId>/<secret>/
```

### CLI arguments

| Argument | Default | Description |
|---|---|---|
| `--scenario` | `all` | Scenario key: `A`, `B`, `D`, `E`, or `all`. |
| `--taskId` | `0` | Real task id used in scenario **B** (`tasks.task.pause`). Scenario B is skipped when `0`. |
| `--total` | `500` | Number of parallel `user.current` calls in scenario **E**. |
| `--logFile` | `smoke-retry.log` | Path of the full-trace log file. Relative paths resolve against the process cwd, which is `playgrounds/cli/` when invoked via `pnpm --filter`. |

### How to run

```bash
# one scenario at a time (recommended — cleaner output):
pnpm --filter @bitrix24/b24jssdk-cli dev smoke-retry --scenario=A
pnpm --filter @bitrix24/b24jssdk-cli dev smoke-retry --scenario=B --taskId=2016
pnpm --filter @bitrix24/b24jssdk-cli dev smoke-retry --scenario=D
pnpm --filter @bitrix24/b24jssdk-cli dev smoke-retry --scenario=E --total=500

# or all of them back-to-back:
pnpm --filter @bitrix24/b24jssdk-cli dev smoke-retry --scenario=all --taskId=2016
```

### Running in CI (nightly)

[`.github/workflows/smoke-retry.yml`](../../.github/workflows/smoke-retry.yml) runs these scenarios on a nightly schedule (and on manual **Run workflow** dispatch) against a real portal. It is gated on a **`B24_HOOK` repository secret** — the same webhook URL the local `.env` uses:

1. In the GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**.
2. Name `B24_HOOK`, value `https://<portal>/rest/<userId>/<secret>/`.

Without that secret the workflow logs a warning and skips (it never runs on pull requests, so forks are unaffected). The full trace is published as the `smoke-retry-log` artifact. Trigger an ad-hoc run from **Actions → smoke-retry → Run workflow** and pick a `scenario`.

The job **fails (red)** when a scenario shows a definitive PR #45 regression — scenario **A** exhausts retries on a 400, **D** stops retrying a timeout, or **E** classifies a rate-limit signal as non-retryable (`smoke-retry` sets a non-zero exit code). Otherwise it stays green and the trace is there for inspection. The deterministic version of these checks also runs portal-free in the unit suite (the CI `test` job), so a regression is caught there first; this nightly confirms it against a live portal.

### What you see in the console

Each scenario prints a compact summary from an in-process `MemoryHandler` — no
manual `grep` needed:

```
===== A. issue #44 — v3 validation 400 (bad payload) =====
[THROWN] 612ms | attempts=1 | not-retryable=1 | exhausted=0
       code=BITRIX_REST_V3_EXCEPTION_VALIDATION_REQUESTVALIDATIONEXCEPTION status=400 msg=...
```

That summary line is the PASS criterion. If you see `attempts=3 | exhausted=1`
instead, it is a regression.

### Analysing the log file

The full trace (every `post/send`, `post/catchError`, limiter state event, …)
is written to the path printed at the end of the run. The script also prints
the most useful `grep` recipes itself:

```bash
grep -c 'http request attempt'         playgrounds/cli/smoke-retry.log   # total attempts across the run
grep -c 'is not retryable'             playgrounds/cli/smoke-retry.log   # 4xx fast-fail hits (PR #45)
grep -c 'all retry attempts exhausted' playgrounds/cli/smoke-retry.log   # must be 0 for scenarios A and B
grep -c 'blocked method'               playgrounds/cli/smoke-retry.log   # limiter pre-throttle hits (E)
```

To extract the trace of a single request by its `requestId`:

```bash
grep '538a952b-1e87' playgrounds/cli/smoke-retry.log
```

## Running from Different Directories

### From the monorepo root:

```bash
pnpm --filter @bitrix24/b24jssdk-cli dev make tasks --total=10
pnpm --filter @bitrix24/b24jssdk-cli dev make products-sku --total=10
pnpm --filter @bitrix24/b24jssdk-cli dev make contacts --total=10
pnpm --filter @bitrix24/b24jssdk-cli dev make companies --total=10
pnpm --filter @bitrix24/b24jssdk-cli dev make deals --total=10
```

### From `playgrounds/cli/`:

```bash
pnpm run dev make tasks --total=10
pnpm run dev make products-sku --total=10
pnpm run dev make contacts --total=10
pnpm run dev make companies --total=10
pnpm run dev make deals --total=10
```

> **Note:** Regardless of where you run the command, the `.env` file must be in `playgrounds/cli/`.

## Project Structure

```
playgrounds/cli/
├── .env.example          # Environment template
├── .env                  # Your local environment (gitignored)
├── package.json          # Package configuration
├── README.md             # This file
└── src/
    ├── index.ts          # CLI entry point
    ├── commands/
    │   └── make/
    │       ├── index.ts      # make command group
    │       ├── tasks.ts      # tasks subcommand
    │       ├── contacts.ts   # contacts subcommand
    │       ├── companies.ts  # companies subcommand
    │       ├── deals.ts      # deals subcommand
    │       └── products-sku.ts # products with SKU subcommand
    ├── constants/
    │   └── index.ts      # Shared constants (languages, priorities, product themes, etc.)
    ├── types/
    │   ├── index.ts      # Type exports
    │   ├── language.ts   # Language types
    │   ├── crm.ts        # CRM entity types
    │   └── task.ts       # Task types
    └── utils/
        ├── index.ts      # Utility exports
        ├── random.ts     # Random value generators
        ├── phone.ts      # Phone number generators
        └── progress.ts   # Progress bar utility
```

## Troubleshooting

### "B24_HOOK environment variable is not set"

- Ensure `.env` file exists in `playgrounds/cli/` directory
- Verify the file contains `B24_HOOK=https://...` with your webhook URL
- Check that the URL ends with a trailing slash

### API errors (403, 401)

- Verify your webhook has the required permissions
- Check if the webhook is active and not expired
- Ensure the Bitrix24 portal is accessible

### "No task/contact/company/product ID returned from API"

- The entity was likely not created due to validation errors
- Check Bitrix24 logs for more details
- Verify required fields are being sent correctly

### Connection timeout

- Check your network connection
- Verify the Bitrix24 portal URL is correct
- The portal might be under heavy load — try again later

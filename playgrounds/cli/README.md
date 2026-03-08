# @bitrix24/b24jssdk-cli

CLI tool for generating test data and load testing in Bitrix24 via REST API.

## Overview

This CLI utility is designed for developers and QA engineers who need to:

- Generate realistic test entities (tasks, contacts, companies) in Bitrix24
- Perform load testing of Bitrix24 REST API integrations
- Quickly populate a Bitrix24 instance with demo data

The tool uses [@bitrix24/b24jssdk](https://bitrix24.github.io/b24jssdk/) for API communication and [citty](https://github.com/unjs/citty) for command-line interface.

## Requirements

- **Node.js** v22.0.0 or higher
- **pnpm** package manager
- **Bitrix24 webhook** with the following permissions:
  - `tasks` — for creating tasks
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

## Running from Different Directories

### From the monorepo root:

```bash
pnpm --filter @bitrix24/b24jssdk-cli dev make tasks --total=10
pnpm --filter @bitrix24/b24jssdk-cli dev make contacts --total=10
pnpm --filter @bitrix24/b24jssdk-cli dev make companies --total=10
```

### From `playgrounds/cli/`:

```bash
pnpm run dev make tasks --total=10
pnpm run dev make contacts --total=10
pnpm run dev make companies --total=10
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
    │       └── companies.ts  # companies subcommand
    ├── constants/
    │   └── index.ts      # Shared constants (languages, priorities, etc.)
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

### "No task/contact/company ID returned from API"

- The entity was likely not created due to validation errors
- Check Bitrix24 logs for more details
- Verify required fields are being sent correctly

### Connection timeout

- Check your network connection
- Verify the Bitrix24 portal URL is correct
- The portal might be under heavy load — try again later

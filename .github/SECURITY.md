# Security Policy

## Supported Versions

`@bitrix24/b24jssdk` and `@bitrix24/b24jssdk-nuxt` follow semantic versioning. Security fixes land on the latest `1.x` release line.

| Version | Supported |
| --- | --- |
| latest `1.x` | ✅ |
| older `1.x` | ❌ — upgrade to the latest `1.x` |

Fixes are not backported to older minor versions; always run the most recent `1.x` release.

## Reporting a Vulnerability

**Please do not open a public issue for security problems.** This SDK handles portal credentials — webhook URLs, OAuth tokens, `client_secret` — so a public report can expose a live secret before a fix ships (see the `1.1.2` credential-disclosure fix in the [CHANGELOG](../CHANGELOG.md)).

Report privately through GitHub instead:

1. Open the repository's **[Security](https://github.com/bitrix24/b24jssdk/security)** tab.
2. Click **Report a vulnerability** (GitHub private vulnerability reporting).
3. Include the affected version(s), impact, and a reproduction if you have one.

Expect an initial acknowledgement within a few business days. Once a fix is confirmed we publish a GitHub Security Advisory (GHSA) and credit the reporter, unless you prefer to stay anonymous.

## Handling Credentials Safely

When reporting or reproducing, **redact real secrets** (webhook URLs, access/refresh tokens, `client_secret`). The SDK already strips known credential-shaped parameters from its logs and error objects via `redactSensitiveParams`, but never paste live values into a report.

## Scope

This policy covers vulnerabilities in the `@bitrix24/b24jssdk` and `@bitrix24/b24jssdk-nuxt` source. For Bitrix24 platform or portal issues unrelated to this SDK, use the official Bitrix24 support channels.

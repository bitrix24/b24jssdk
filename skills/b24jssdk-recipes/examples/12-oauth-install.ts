/**
 * Recipe 12 — OAuth install handshake for a Bitrix24 app
 *
 * Bitrix24 sends ONAPPINSTALL / ONAPPUPDATE / ONAPPUNINSTALL events to your
 * configured handler URL. This server:
 *   1. Accepts the install event, persists the OAuth tokens per portal
 *   2. Exposes a helper that builds B24OAuth from stored tokens
 *   3. Registers a refresh callback so the database always sees the latest pair
 *   4. Demonstrates a per-portal API call via the resulting B24OAuth instance
 *
 * Install: pnpm add express
 * Env:
 *   PORT=3001 (default)
 *   B24_CLIENT_ID=local.abc123        # from your Bitrix24 dev console
 *   B24_CLIENT_SECRET=...
 *   B24_OAUTH_STORE=/var/lib/myapp/tokens.json   # optional; default is
 *                                                # .oauth-store.json in cwd
 * Run:
 *   npx tsx 12-oauth-install.ts
 *
 * In the Bitrix24 dev console set:
 *   Install handler URL = https://your-server.example.com/install
 *   Uninstall handler URL = https://your-server.example.com/uninstall
 *   DEMO_API_SECRET=<random-secret>   (required to call /portal/:memberId/profile)
 *
 * For local development expose with `npx ngrok http 3001`.
 */

import {
  AjaxError,
  B24OAuth,
  EnumAppStatus,
  ConsoleV2Handler,
  LogLevel,
  Logger,
  type B24OAuthParams,
  type B24OAuthSecret
} from '@bitrix24/b24jssdk'
import express, { type Request, type Response } from 'express'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { safeEqual } from '../lib/crypto'
import { checkPortalUrls } from '../lib/portal-url'

const logger = Logger.create('OAuthInstall')
logger.pushHandler(new ConsoleV2Handler(LogLevel.INFO, { useStyles: false }))

const SECRET: B24OAuthSecret = {
  clientId: process.env.B24_CLIENT_ID ?? '',
  clientSecret: process.env.B24_CLIENT_SECRET ?? ''
}

// ────────────────────────────────────────────────────────────────────────
//  PERSISTENCE — JSON file in the working directory.
//  Replace with your real datastore (Postgres, Redis, etc.) in production.
// ────────────────────────────────────────────────────────────────────────

// Overridable so a deployment can put the token store somewhere other than the
// working directory — and so the unit tests can point it at a temp file instead
// of writing real-looking credentials into the repo.
const STORE_FILE = process.env.B24_OAUTH_STORE ?? path.join(process.cwd(), '.oauth-store.json')

// B24OAuthParams already carries applicationToken; aliasing for clarity at storage boundary.
type StoredCredentials = B24OAuthParams

async function loadStore(): Promise<Record<string, StoredCredentials>> {
  try {
    const text = await fs.readFile(STORE_FILE, 'utf8')
    return JSON.parse(text)
  } catch {
    return {}
  }
}

// File mode 0o600: only the file owner can read/write. Tokens MUST NOT be
// readable by other local users (think shared CI runners, multi-tenant hosts).
// Note: read-modify-write below is NOT atomic — two concurrent install events
// for different memberIds may lose one write. In production, replace this file
// store with a transactional datastore (Postgres `ON CONFLICT UPDATE`, Redis
// MULTI, etc.). See REPORT.md "Open questions".
async function saveCredentials(memberId: string, creds: StoredCredentials): Promise<void> {
  const store = await loadStore()
  store[memberId] = creds
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2), { mode: 0o600 })
  logger.info(`  persisted credentials for member ${memberId}`)
}

async function getCredentials(memberId: string): Promise<StoredCredentials | null> {
  const store = await loadStore()
  return store[memberId] ?? null
}

async function deleteCredentials(memberId: string): Promise<void> {
  const store = await loadStore()
  const { [memberId]: _removed, ...rest } = store
  await fs.writeFile(STORE_FILE, JSON.stringify(rest, null, 2), { mode: 0o600 })
}

// ────────────────────────────────────────────────────────────────────────
//  HANDSHAKE — incoming Bitrix24 events
// ────────────────────────────────────────────────────────────────────────

/**
 * Bitrix24 sends this shape on ONAPPINSTALL / ONAPPUPDATE.
 * The `auth` block carries everything we need to build B24OAuthParams.
 * Spec: https://apidocs.bitrix24.com/api-reference/events/safe-event-handlers.html
 */
interface InstallEventPayload {
  event: 'ONAPPINSTALL' | 'ONAPPUPDATE'
  data: { VERSION: string, ACTIVE: '0' | '1', INSTALLED?: '0' | '1', LANGUAGE_ID: string }
  ts: string
  auth: {
    access_token: string
    expires: string
    expires_in: string
    scope: string
    domain: string
    server_endpoint: string
    status: string
    client_endpoint: string
    member_id: string
    user_id: string
    refresh_token: string
    application_token: string
  }
}

interface UninstallEventPayload {
  event: 'ONAPPUNINSTALL'
  data: Record<string, unknown>
  ts: string
  auth: {
    domain: string
    client_endpoint: string
    server_endpoint: string
    member_id: string
    application_token: string
  }
}

export function toOAuthParams(auth: InstallEventPayload['auth']): B24OAuthParams {
  return {
    applicationToken: auth.application_token,
    userId: Number(auth.user_id),
    memberId: auth.member_id,
    accessToken: auth.access_token,
    refreshToken: auth.refresh_token,
    expires: Number(auth.expires),
    expiresIn: Number(auth.expires_in),
    scope: auth.scope,
    domain: auth.domain,
    clientEndpoint: auth.client_endpoint,
    serverEndpoint: auth.server_endpoint,
    status: (Object.values(EnumAppStatus).find(s => s === auth.status) ?? EnumAppStatus.Free)
  }
}

/**
 * Handle `ONAPPINSTALL`.
 *
 * **This endpoint cannot authenticate its caller, and that is a platform
 * constraint rather than an omission here:** `application_token` is *issued* by
 * this very event, so a first-time handler has nothing to compare against. Any
 * POST that reaches `/install` is therefore accepted, and someone who knows or
 * guesses a `member_id` can overwrite that portal's record (#389).
 *
 * What that is *worth* to them is the part this code controls. The stored
 * `domain` / `client_endpoint` / `server_endpoint` decide where every later call
 * for the portal goes, so without a check a forged install redirects the app's
 * own traffic — with its business data — to the forger's server, whose answers
 * the app then trusts. `checkPortalUrls` removes that: the worst a forged
 * install can do is corrupt a record so calls fail, which is noisy and
 * recoverable.
 *
 * It does **not** make the endpoint safe to expose carelessly. Put it behind
 * whatever network control your deployment allows — an allow-list of Bitrix24's
 * ranges, or a secret path segment — and read the security guide.
 */
export async function handleInstall(req: Request, res: Response) {
  const payload = req.body as InstallEventPayload
  // Always 200 — even on bad payloads — so Bitrix24 doesn't retry for 24h.
  res.status(200).send('ok')

  if (!payload?.auth?.member_id) {
    logger.warning('install event missing auth.member_id')
    return
  }

  const badUrls = checkPortalUrls(payload.auth)
  if (badUrls !== null) {
    // Log the reason, answer nothing: telling the caller which check it tripped
    // turns the endpoint into an oracle for finding one that passes.
    logger.warning(`[install] refusing implausible portal URLs for member=${payload.auth.member_id}: ${badUrls}`)
    return
  }

  const params = toOAuthParams(payload.auth)

  // Not protection — observability. A legitimate reinstall lands here too, so
  // this cannot refuse; what it can do is stop a silent takeover being silent.
  const existing = await getCredentials(params.memberId)
  if (existing) {
    logger.warning(`[install] overwriting existing credentials for member=${params.memberId}`)
  }

  await saveCredentials(params.memberId, {
    ...params,
    applicationToken: payload.auth.application_token
  })

  // Keep INFO logs minimal: just the event name + member tag. domain / userId
  // are useful for debugging — log them at DEBUG (or behind a feature flag)
  // so they don't end up in production log aggregators by default.
  logger.info(`[${payload.event}] member=${params.memberId}`)
}

export async function handleUninstall(req: Request, res: Response) {
  const payload = req.body as UninstallEventPayload
  // Always 200 — even on bad payloads — so Bitrix24 doesn't retry for 24h.
  res.status(200).send('ok')

  const memberId = payload?.auth?.member_id
  const receivedToken = payload?.auth?.application_token
  if (!memberId || !receivedToken) {
    logger.warning('uninstall event missing member_id or application_token')
    return
  }

  // Verify the application_token against the one we recorded at install time.
  // Without this check, anyone who can reach /uninstall could delete the
  // credentials of any portal whose member_id they guess.
  const stored = await getCredentials(memberId)
  if (!stored) {
    logger.info(`[ONAPPUNINSTALL] no stored credentials for member=${memberId} (idempotent)`)
    return
  }
  // Constant-time compare so an attacker can't recover applicationToken by
  // hammering /uninstall and measuring response latency.
  if (!safeEqual(stored.applicationToken, receivedToken)) {
    logger.warning(`[ONAPPUNINSTALL] application_token mismatch for member=${memberId} — refusing to delete`)
    return
  }

  await deleteCredentials(memberId)
  logger.info(`[ONAPPUNINSTALL] removed credentials for member=${memberId}`)
}

// ────────────────────────────────────────────────────────────────────────
//  CLIENT FACTORY — build B24OAuth from persisted credentials.
//
//  This is the function the rest of your app calls every time it needs to
//  hit Bitrix24 for a specific portal.
// ────────────────────────────────────────────────────────────────────────

async function clientForMember(memberId: string): Promise<B24OAuth> {
  const creds = await getCredentials(memberId)
  if (!creds) throw new Error(`No credentials stored for member ${memberId}. Install the app first.`)

  const $b24 = new B24OAuth(
    {
      applicationToken: creds.applicationToken,
      userId: creds.userId,
      memberId: creds.memberId,
      accessToken: creds.accessToken,
      refreshToken: creds.refreshToken,
      expires: creds.expires,
      expiresIn: creds.expiresIn,
      scope: creds.scope,
      domain: creds.domain,
      clientEndpoint: creds.clientEndpoint,
      serverEndpoint: creds.serverEndpoint,
      status: creds.status
    },
    SECRET
  )

  // CRITICAL: persist refreshed tokens so the next cold start sees the latest pair.
  $b24.setCallbackRefreshAuth(async ({ b24OAuthParams }) => {
    await saveCredentials(b24OAuthParams.memberId, {
      ...b24OAuthParams,
      applicationToken: creds.applicationToken // unchanged on refresh
    })
  })

  return $b24
}

// ────────────────────────────────────────────────────────────────────────
//  DEMO endpoint — list the current user's portal data via the OAuth client.
// ────────────────────────────────────────────────────────────────────────

async function demoCall($b24: B24OAuth) {
  // The same actions.v2.* / v3.* surface as B24Hook/B24Frame.
  const profile = await $b24.actions.v2.call.make<{ NAME: string, ID: number, ADMIN: boolean }>({
    method: 'profile'
  })
  if (!profile.isSuccess) throw new Error(profile.getErrorMessages().join('; '))

  return profile.getData()!.result
}

// ────────────────────────────────────────────────────────────────────────
//  HTTP server
// ────────────────────────────────────────────────────────────────────────

async function main() {
  if (!SECRET.clientId || !SECRET.clientSecret) {
    throw new Error('B24_CLIENT_ID and B24_CLIENT_SECRET env vars are required')
  }

  // Say this at startup, not only when the first install is refused. Portal-URL
  // validation fails closed, and it fails quietly from Bitrix24's side — the
  // endpoint still answers 200, so a self-hosted operator who has not set the
  // allow-lists sees installs simply not arrive. One line here is the
  // difference between "nothing works" and "I know which env var to set".
  if (!process.env.B24_ALLOWED_PORTAL_HOSTS && !process.env.B24_ALLOWED_OAUTH_HOSTS) {
    logger.info(
      'portal-URL validation is using the Bitrix24 cloud defaults; a self-hosted portal '
      + 'must set B24_ALLOWED_PORTAL_HOSTS and B24_ALLOWED_OAUTH_HOSTS or its installs will be refused'
    )
  }

  const port = Number(process.env.PORT ?? 3001)
  const app = express()
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  app.post('/install', (req: Request, res: Response) => {
    handleInstall(req, res).catch((e: unknown) => {
      // The second argument is a CONTEXT RECORD, not a second value. Passing the
      // Error itself logs `{}` — an Error's message and stack are not own
      // enumerable properties — so the failure vanished from the log entirely.
      //
      // Logging the message and stack is safe HERE because everything this
      // catch can see throws plain filesystem or validation errors. Keep it
      // that way: if `saveCredentials`/`getCredentials` ever throw an error
      // that echoes the credential object, this line publishes an
      // access_token to the log.
      logger.error('install failed', {
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined
      })
      res.status(200).send('ok')
    })
  })

  app.post('/uninstall', (req: Request, res: Response) => {
    handleUninstall(req, res).catch((e: unknown) => {
      // The second argument is a CONTEXT RECORD, not a second value. Passing the
      // Error itself logs `{}` — an Error's message and stack are not own
      // enumerable properties — so the failure vanished from the log entirely.
      logger.error('uninstall failed', {
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined
      })
      res.status(200).send('ok')
    })
  })

  // Demo: hit /portal/<memberId>/profile to call REST on behalf of that portal.
  // The explicit `Request<{ memberId: string }>` generic narrows req.params
  // from `string | string[]` (Express 5 default) to `string`.
  //
  // Demo: call REST on behalf of a portal.
  //
  // ⛔ SECURITY: Gated behind DEMO_API_SECRET env var. Do not expose this
  // to the open internet without a real auth layer (Bearer token, mTLS, etc.).
  // Set DEMO_API_SECRET=<random-secret> and pass it as Authorization: Bearer <secret>.
  app.get('/portal/:memberId/profile', async (req: Request<{ memberId: string }>, res: Response) => {
    const secret = process.env.DEMO_API_SECRET
    const auth = req.headers.authorization
    if (!secret || !auth || !safeEqual(auth, `Bearer ${secret}`)) {
      res.status(401).json({ error: 'UNAUTHORIZED' })
      return
    }

    try {
      const $b24 = await clientForMember(req.params.memberId)
      const profile = await demoCall($b24)
      res.json(profile)
    } catch (e) {
      if (e instanceof AjaxError) {
        res.status(500).json({ error: e.code, message: e.message })
      } else {
        res.status(500).json({ error: (e as Error).message })
      }
    }
  })

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'running', uptime: process.uptime() })
  })

  app.listen(port, () => {
    logger.info(`OAuth install handler on :${port}`)
    logger.info(`  POST /install     ← register in Bitrix24 dev console`)
    logger.info(`  POST /uninstall   ← register in Bitrix24 dev console`)
    logger.info(`  GET  /portal/:memberId/profile`)
    logger.info(`  GET  /health`)
  })
}

// Start the server only when this file IS the program being run. Importing it —
// which the unit tests do, to exercise the uninstall token check — must not bind
// a port. `npx tsx 12-oauth-install.ts` still runs normally.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e: unknown) => {
    // Raw console.error so structured-logger formatting can't hide the trace.
    console.error('\n[recipe failed]', e instanceof Error ? `${e.name}: ${e.message}` : String(e))
    if (e instanceof Error && e.stack) console.error(e.stack)
    process.exit(1)
  })
}

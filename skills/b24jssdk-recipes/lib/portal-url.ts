/**
 * Validation for the portal URLs an install event carries (#389).
 *
 * `ONAPPINSTALL` hands you `domain`, `client_endpoint` and `server_endpoint`,
 * and an app that persists them is trusting them: every later call for that
 * portal goes wherever they point. The install endpoint cannot authenticate its
 * caller — `application_token` is *issued* by that very event, so a first-time
 * handler has nothing to compare against — which means a forged install is
 * possible by design, and the question is what it can achieve.
 *
 * Without a check it achieves two things, and the second is worse than #389
 * describes. `client_endpoint` redirects the app's REST calls, so its business
 * data goes to the forger and it reads the forger's answers as Bitrix24's.
 * `server_endpoint` is where the SDK POSTs `client_id`, **`client_secret`** and
 * `refresh_token` on every token refresh (`oauth/auth.ts`) — so a forged one
 * hands over the application-wide secret, compromising every portal rather than
 * the one whose `member_id` was guessed.
 *
 * With the check, the worst a forged install can do is corrupt a record so
 * calls for that portal fail — noisy, recoverable, and not a leak.
 *
 * Three layers, because they fail for different reasons:
 *
 *   1. **Shape.** `https:` only, no embedded credentials. Works everywhere.
 *   2. **Consistency.** `client_endpoint` must be on the same host as `domain`.
 *      Needs no list, so it holds for a self-hosted portal too.
 *   3. **Host allowlist**, separately for the portal and for the OAuth server —
 *      they are genuinely different hosts, which is the part that is easy to
 *      get wrong. See below.
 *
 * **`server_endpoint` is not the portal.** On the cloud it is the shared token
 * server — `https://oauth.bitrix.info/rest/` — for every portal, so requiring it
 * to match `domain` would reject every legitimate cloud install. That mistake
 * was caught here by a test, not by reading: the existing fixture for this
 * recipe had it right all along.
 *
 * **Both allowlists have to be configurable, and that is not a detail.** A
 * self-hosted (boxed) Bitrix24 lives at whatever domain its owner chose —
 * `intranet.example.com` — and is its own OAuth server, so hard-coded
 * `*.bitrix24.*` suffixes would reject every legitimate on-premise install. The
 * defaults cover the cloud; `B24_ALLOWED_PORTAL_HOSTS` and
 * `B24_ALLOWED_OAUTH_HOSTS` replace them. An app serving self-hosted customers
 * must set them, and setting them to one known host each is *stronger* than the
 * cloud default, not weaker.
 */

/** Cloud portal suffixes. A leading dot, so `evil-bitrix24.com` cannot match. */
const DEFAULT_ALLOWED_SUFFIXES = [
  '.bitrix24.com',
  '.bitrix24.ru',
  '.bitrix24.by',
  '.bitrix24.kz',
  '.bitrix24.ua',
  '.bitrix24.de',
  '.bitrix24.eu',
  '.bitrix24.pl',
  '.bitrix24.es',
  '.bitrix24.fr',
  '.bitrix24.it',
  '.bitrix24.com.br',
  '.bitrix24.in',
  '.bitrix24.vn',
  '.bitrix24.jp',
  '.bitrix24.tr'
]

/** Cloud OAuth token servers. Not portal hosts — see the header. */
const DEFAULT_ALLOWED_OAUTH_HOSTS = ['oauth.bitrix.info', 'oauth.bitrix24.tech']

/**
 * Hosts an install event may name.
 *
 * `B24_ALLOWED_PORTAL_HOSTS` is a comma-separated list. An entry starting with
 * a dot is a suffix (`.bitrix24.com` matches `acme.bitrix24.com` but not
 * `bitrix24.com` itself and not `evil-bitrix24.com`); anything else is an exact
 * host, which is what a self-hosted deployment wants.
 */
function allowedHosts(variable: string, fallback: string[]): string[] {
  const configured = process.env[variable]
  if (configured === undefined || configured.trim() === '') {
    return fallback
  }

  return configured
    .split(',')
    .map(entry => entry.trim().toLowerCase())
    .filter(entry => entry !== '')
}

function hostIsAllowed(host: string, allowed: string[]): boolean {
  const lower = host.toLowerCase()
  return allowed.some(entry => (entry.startsWith('.') ? lower.endsWith(entry) : lower === entry))
}

/**
 * The host of a `domain` field, which arrives bare (`acme.bitrix24.com`) rather
 * than as a URL. Returns `null` if it is not a plausible host — an empty
 * string, a URL, something with a slash or a colon in it.
 */
function domainHost(domain: string): string | null {
  if (domain === '' || /[/\\:\s]/.test(domain)) {
    return null
  }
  return domain.toLowerCase()
}

/** One endpoint URL, parsed and shape-checked. Returns `null` if unusable. */
function endpointHost(value: string): string | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }

  // `https:` only — an `http:` endpoint would carry the access token in clear,
  // and anything else (`javascript:`, `file:`) has no business here at all.
  if (url.protocol !== 'https:') {
    return null
  }

  // `https://portal@attacker.example/` parses with host `attacker.example`, so
  // a reader eyeballing the stored value can be fooled even when the check is
  // not. Refuse rather than normalise.
  if (url.username !== '' || url.password !== '') {
    return null
  }

  return url.hostname.toLowerCase()
}

/**
 * Check the portal URLs from an install payload.
 *
 * @returns `null` when they are acceptable, or a reason string naming what
 *   failed. The reason is for the app's own log — do not send it back to the
 *   caller, which would tell a prober which check it tripped.
 */
export function checkPortalUrls(auth: {
  domain: string
  client_endpoint: string
  server_endpoint: string
}): string | null {
  const domain = domainHost(auth.domain)
  if (domain === null) {
    return 'domain is not a plausible host'
  }

  if (!hostIsAllowed(domain, allowedHosts('B24_ALLOWED_PORTAL_HOSTS', DEFAULT_ALLOWED_SUFFIXES))) {
    return 'domain host is not allowed (set B24_ALLOWED_PORTAL_HOSTS for a self-hosted portal)'
  }

  // The portal's own REST endpoint. This one must be the portal, which holds
  // even for a host nobody could have put on a list.
  const clientHost = endpointHost(auth.client_endpoint)
  if (clientHost === null) {
    return 'client_endpoint is not an https URL without credentials'
  }
  if (clientHost !== domain) {
    return 'client_endpoint host does not match domain'
  }

  // The OAuth token server, which on the cloud is shared and is *not* the
  // portal — so this cannot be the same check. A self-hosted portal is its own
  // token server, hence the second branch.
  const serverHost = endpointHost(auth.server_endpoint)
  if (serverHost === null) {
    return 'server_endpoint is not an https URL without credentials'
  }
  const oauthAllowed = allowedHosts('B24_ALLOWED_OAUTH_HOSTS', DEFAULT_ALLOWED_OAUTH_HOSTS)
  if (serverHost !== domain && !hostIsAllowed(serverHost, oauthAllowed)) {
    return 'server_endpoint is neither the portal nor a known OAuth server (set B24_ALLOWED_OAUTH_HOSTS)'
  }

  return null
}

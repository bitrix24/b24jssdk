/**
 * Define the environment
 */

export enum Environment {
  UNKNOWN = 'unknown',
  BROWSE = 'browser',
  /**
   * A Web Worker, Shared Worker or Service Worker.
   *
   * Reported separately from {@link Environment.BROWSE} because the two differ
   * in the one way most callers of this function care about: a worker has no
   * DOM. It is not a server either — the browser's rules apply to it, CORS
   * included, and code shipped to it is as public as code on the main thread.
   * {@link isBrowserLikeRuntime} is the question to ask when that is what
   * matters rather than the DOM.
   */
  WORKER = 'worker',
  NODE = 'node'
}

/**
 * Is the global object of *this* scope a worker scope?
 *
 * Separate from the enum so the `instanceof` — and the reason it is an
 * `instanceof` rather than a `typeof` — stays readable. Never throws: a global
 * that is not a constructor makes `instanceof` throw a `TypeError`, which a
 * hostile or merely odd runtime could otherwise turn into a crash on import.
 */
function isWorkerGlobalScope(): boolean {
  const scope = (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope

  if ('undefined' === typeof scope) {
    return false
  }

  try {
    return globalThis instanceof (scope as new () => unknown)
  } catch {
    return false
  }
}

export function getEnvironment(): Environment {
  // Check for the presence of a window (browser)
  if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
    return Environment.BROWSE
  }

  // Node before the worker test, and the order was measured rather than
  // reasoned. The tempting argument is the other way round — "a bundler that
  // shims `process` would make a worker look like a server" — but both canonical
  // shims (`process@0.11.10`, `unenv`) set `process.versions = {}`, so
  // `process.versions.node` is `undefined` and the Node branch is not reachable
  // from a shimmed worker anyway. What the order does decide is the runtimes
  // that genuinely have both: a Deno worker and a Cloudflare Worker with
  // `nodejs_compat` define `WorkerGlobalScope` *and* report a Node version.
  // Those are servers, where running a webhook is entirely legitimate, and
  // calling them browser-like would keep credentials out of headers for no
  // reason and — worse — warn on every call that a private secret had leaked.
  //
  // The residual case runs the other way: a browser worker under a shim that
  // fakes a `versions.node` string would be read as a server, and an OAuth v3
  // batch there would ask for a header the portal's preflight refuses. No shim
  // measured does that, and a worker is not where the SDK's credential-bearing
  // clients belong in the first place.
  //
  // Check for the presence of process (Node.js)
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    return Environment.NODE
  }

  // `globalThis instanceof WorkerGlobalScope`, not merely "the constructor is
  // defined": the question is whether *this* scope is a worker scope, and the
  // HTML specification puts that constructor in a real worker's prototype chain.
  //
  // It is a narrower test than the name check it replaces, but not a complete
  // one, and the honest version of why is measured rather than assumed.
  // Cloudflare's workerd **does** have `WorkerGlobalScope` in the chain — it
  // escapes only because it exposes a second, non-identical constructor as the
  // global binding, which is a quirk of that runtime rather than a rule. With
  // `nodejs_compat` it reports a Node version and the branch above answers
  // first, which is the outcome that matters; without it, it lands in `UNKNOWN`
  // today and would land in `WORKER` if workerd ever unified the binding. That
  // would cost a server a dropped `User-Agent` and a false "your secret is
  // public" warning — worth knowing about rather than discovering.
  //
  // Measured: Node 22 and Bun define the global in neither the main thread nor
  // their own workers — so a genuine Bun Web Worker reports `NODE`. That is not
  // the right name for it; it is harmless, because nothing there enforces what
  // this member exists to respect.
  if (isWorkerGlobalScope()) {
    return Environment.WORKER
  }

  return Environment.UNKNOWN
}

/**
 * Does the browser's rulebook apply here — CORS, forbidden request headers, a
 * bundle anyone can read?
 *
 * `getEnvironment() === Environment.BROWSE` is a different question, and answers
 * this one wrongly: it asks whether there is a DOM, which a worker does not
 * have. Everything else a browser enforces still applies in one.
 *
 * Being wrong in the two directions costs very different things.
 *
 * A false **no** in a browser context asks for a header the portal's preflight
 * does not allow, and the request never leaves at all: an opaque network error
 * after the retry budget burns. A false **yes** in a runtime that enforces none
 * of this now costs three things, not one — a credential kept in the body rather
 * than a header (which the portal answers visibly), a dropped `User-Agent`, and
 * a "this webhook is client-side" warning on a runtime where the secret is in
 * fact private. The third is a false security alarm, which is why the worker
 * test asks whether this scope *is* a worker rather than whether the name is
 * defined: a runtime that merely exposes the constructor is not one.
 */
export function isBrowserLikeRuntime(): boolean {
  const environment = getEnvironment()

  return Environment.BROWSE === environment || Environment.WORKER === environment
}

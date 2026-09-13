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

export function getEnvironment(): Environment {
  // Check for the presence of a window (browser)
  if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
    return Environment.BROWSE
  }

  // Before Node, not after: a worker has no `process`, but a bundler that
  // injects a `process` shim would otherwise make one look like a server — and
  // being wrong in that direction is what this member exists to prevent.
  //
  // `WorkerGlobalScope` is the global the HTML specification gives all three
  // worker kinds, and nothing else.
  if ('undefined' !== typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope) {
    return Environment.WORKER
  }

  // Check for the presence of process (Node.js)
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    return Environment.NODE
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
 * Being wrong in the two directions costs very different things, so the test is
 * shaped to fail towards **yes**. A false yes in a runtime that enforces none of
 * it — an edge runtime that happens to define `WorkerGlobalScope` — costs a
 * credential kept in the body rather than a header, which the portal answers
 * visibly. A false no in a browser context asks for a header the portal's
 * preflight does not allow, and the request never leaves at all: an opaque
 * network error after the retry budget burns.
 */
export function isBrowserLikeRuntime(): boolean {
  const environment = getEnvironment()

  return Environment.BROWSE === environment || Environment.WORKER === environment
}

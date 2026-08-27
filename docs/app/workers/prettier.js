/**
 * Client-side formatting worker.
 *
 * Shape taken from upstream `nuxt/ui` (`docs/app/workers/prettier.js`), which
 * this file was forked from and which has since fixed what #139 reported here.
 * Compared against upstream `v4` at commit `b751eae` (2026-08-25) — statements
 * below about what upstream does are true of that commit and may age, so check
 * it again before treating them as current.
 *
 * Two things it gets right and the fork did not:
 *
 * 1. **Every message gets exactly one reply.** `app/plugins/prettier.ts` parks
 *    a `[resolve, reject]` pair under the message's `uid` and clears it only
 *    when a reply arrives, so a message that produces no reply is not a failed
 *    format — it is a promise that never settles, and `CodeExample.vue` awaits
 *    it forever. One try/catch around the whole handler covers both a load
 *    failure and a format failure.
 *
 * 2. **No load queue.** Loading happens lazily inside the format path, so there
 *    is no queue to drain and no "loading failed, everything queued behind it is
 *    stuck" state to get wrong. The previous version kicked off loading at
 *    worker start and buffered messages behind a flag that was never reset on
 *    failure.
 *
 * The deliberate divergence: upstream loads prettier from jsDelivr. This does
 * not (#399).
 *
 * Fetching it meant the page executed six third-party modules that nothing
 * verified. A dynamic `import()` cannot carry an `integrity` attribute, so SRI
 * was not available even in principle, and the site sets no CSP — there was no
 * second line of defence either. The version was at least pinned, after this
 * fork and upstream both drifted (`3.7.4`, then `3.8.2` upstream, against
 * `^3.9.6` in package.json), but a pinned version off a CDN is still a promise
 * from the CDN.
 *
 * `prettier` is already a dependency of this package — the server imports it
 * directly to prerender the same snippets — so the browser was fetching a copy
 * of something already on disk. It is bundled now: no third-party origin, no
 * integrity question, and the version cannot drift from the prerenderer's
 * because it IS the prerenderer's.
 *
 * The imports stay dynamic so the parsers remain a lazy chunk, fetched on the
 * first format rather than at page load. They are also why this worker is no
 * longer `?worker&inline`: inlining a base64 copy of the parsers into the entry
 * bundle would trade a supply-chain problem for a page-weight one.
 */

let _prettier
let _plugins

self.onmessage = async function (event) {
  try {
    self.postMessage({
      uid: event.data.uid,
      message: await handleMessage(event.data.message)
    })
  } catch (error) {
    // A plain string, not the Error: not every browser clones an Error across
    // the worker boundary.
    self.postMessage({
      uid: event.data.uid,
      error: error?.message || String(error)
    })
  }
}

function handleMessage(message) {
  switch (message.type) {
    case 'format':
      return handleFormatMessage(message)
  }
}

async function handleFormatMessage(message) {
  if (!_prettier) {
    // `markdown` is the parser every callsite asks for; the other four are what
    // it delegates to for a fenced code block inside the document.
    const [prettierModule, ...plugins] = await Promise.all([
      import('prettier/standalone'),
      import('prettier/plugins/babel'),
      import('prettier/plugins/estree'),
      import('prettier/plugins/html'),
      import('prettier/plugins/markdown'),
      import('prettier/plugins/typescript')
    ])
    _prettier = prettierModule
    _plugins = plugins
  }

  const { options, source } = message
  return _prettier.format(source, {
    parser: 'markdown',
    plugins: _plugins,
    ...options
  })
}

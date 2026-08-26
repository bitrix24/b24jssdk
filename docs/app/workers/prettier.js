/* global __PRETTIER_VERSION__ */

/**
 * Client-side formatting worker.
 *
 * Shape taken from upstream `nuxt/ui` (`docs/app/workers/prettier.js`), which
 * this file was forked from and which has since fixed what #139 reported here.
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
 * The one deliberate divergence: upstream hard-codes the CDN version, and has
 * the same drift this fork had — `3.8.2` in the worker against `^3.9.6` in its
 * package.json. Here `__PRETTIER_VERSION__` is substituted at build time from
 * the resolved `prettier` package (see `nuxt.config.ts`), so the version the
 * browser loads is the version the server prerendered with, and `pnpm up` moves
 * both together.
 */

const CDN = `https://cdn.jsdelivr.net/npm/prettier@${__PRETTIER_VERSION__}`

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
    const [prettierModule, ...plugins] = await Promise.all([
      import(`${CDN}/standalone.mjs`),
      import(`${CDN}/plugins/babel.mjs`),
      import(`${CDN}/plugins/estree.mjs`),
      import(`${CDN}/plugins/html.mjs`),
      import(`${CDN}/plugins/markdown.mjs`),
      import(`${CDN}/plugins/typescript.mjs`)
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

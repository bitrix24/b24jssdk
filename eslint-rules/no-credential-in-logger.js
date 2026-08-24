/**
 * @fileoverview Forbid passing a URL- or credential-shaped value into a logger
 * context object — the #39/#40 webhook-secret-leak class. Lint-time defence in
 * depth alongside the runtime `redactSensitiveParams()`.
 *
 * Promotes the four hand-written `no-restricted-syntax` esquery selectors (#42 /
 * #212) into one named rule with explicit AST logic, a single credential
 * vocabulary, and contextual messages that name the offending key (#226).
 *
 * Offers an IDE quick-fix suggestion (`hasSuggestions`, #308). There is no single
 * mechanical *replacement* — the author must pick a safe field to log, and a wrong
 * autofix on a security rule is worse than none (#308) — so the suggestion is the
 * one edit that is safe for every shape: **remove the offending entry** from the
 * context object. Dropping data cannot leak; the author then adds back only the
 * specific non-credential fields they need. Suggestions are opt-in (never applied
 * by `--fix`), so this stays a starting point, not an automatic rewrite.
 *
 * Covered (a Property / SpreadElement anywhere inside a `logger.<level>(…)` call):
 *   1. credential-shaped VALUE as a bare identifier — `{ url }`, `{ method: methodFormatted }`
 *   2. credential-shaped VALUE via member access      — `{ foo: err.config.url }`
 *   3. spread of an axios `config`/`request`/`response` — `{ ...error.config }`
 *   4. credential-shaped property KEY with a dynamic value — `{ apiUrl: someVar }`
 *
 * NOT covered — two known gaps:
 *   • String interpolation the linter can't see through: template literals
 *     (`logger.debug(`GET ${url}`)`) and `'…' + url` concatenation. Now that the
 *     rule spans the whole SDK, reviewers in pull / frame / hook / oauth (not just
 *     the HTTP layer) must reject these by hand: log the bare method name.
 *   • Vocabulary: `auth` and `sessid` are deliberately NOT in CREDENTIAL_KEY —
 *     `auth` is too common a word (false-positive risk: `authorized`, `author`,
 *     `authManager`, `isAdminAuth`…) and both are already masked at runtime by
 *     redactSensitiveParams(). Decision (#262): the lint layer intentionally does
 *     NOT mirror the runtime redactor vocabulary — it stays narrow on high-signal
 *     credential words to avoid false positives, and the runtime redactor is the
 *     broader net. If `auth`/`sessid` are ever added, add matching shouldFire
 *     test cases in the lock spec.
 */

// Logger methods whose context object must stay credential-free.
const LOGGER_METHODS = new Set([
  'debug', 'info', 'warning', 'error', 'notice', 'log', 'forcedLog'
])

// Credential-shaped property KEY (selector 4) / member-access property (selector 2).
// `[Tt]oken(?!s\b)` carves out a plural `tokens` (a real retry counter).
// `auth` / `sessid` are intentionally excluded — see the fileoverview vocabulary note.
const CREDENTIAL_KEY = /[Uu]rl|[Pp]assword|[Ss]ecret|[Tt]oken(?!s\b)/
// Credential-shaped VALUE identifier (selector 1) — the key set plus
// `methodFormatted` (the #40 regression: the formatted URL bound to an identifier).
const CREDENTIAL_VALUE = /[Uu]rl|methodFormatted|[Pp]assword|[Ss]ecret|[Tt]oken(?!s\b)/
// Axios objects whose spread drags the full request URL into the context.
const AXIOS_SPREAD = /^(?:config|request|response)$/

function isLoggerCall(node) {
  return (
    !!node
    && node.type === 'CallExpression'
    && !!node.callee
    && node.callee.type === 'MemberExpression'
    && !!node.callee.property
    && node.callee.property.type === 'Identifier'
    && LOGGER_METHODS.has(node.callee.property.name)
  )
}

// Mirror the esquery descendant combinator (`CallExpression[logger] Property`):
// true when `node` has any ancestor that is a logger call.
function insideLoggerCall(node) {
  for (let cur = node.parent; cur; cur = cur.parent) {
    if (isLoggerCall(cur)) {
      return true
    }
  }
  return false
}

export default {
  meta: {
    type: 'problem',
    hasSuggestions: true,
    docs: {
      description:
        'forbid passing a URL/credential-shaped value into a logger context object (#39/#40 webhook-secret leak)'
    },
    schema: [],
    messages: {
      bareValue:
        'Do not pass the URL/credential-shaped variable `{{name}}` into a logger context object — it may carry the webhook secret (#39/#40). Log the bare REST method name (not methodFormatted); let redactSensitiveParams() handle params. Add `// eslint-disable-next-line local/no-credential-in-logger` with a reason for a genuine false positive.',
      memberValue:
        'Do not log the URL/credential-shaped property access `…{{name}}` (e.g. `err.config.url`) — it may carry the webhook secret (#39/#40). Log the bare REST method name; let redactSensitiveParams() handle params. Add `// eslint-disable-next-line local/no-credential-in-logger` with a reason for a genuine false positive.',
      axiosSpread:
        'Do not spread an axios `{{name}}` object into a logger context — it carries the full request URL incl. the webhook secret (#39/#40). Pick the specific safe fields you need. Add `// eslint-disable-next-line local/no-credential-in-logger` with a reason for a genuine false positive.',
      credentialKey:
        'Do not log a value under the URL/credential-shaped key `{{name}}` (e.g. `{ apiUrl: someVar }`) — the value may carry the webhook secret regardless of its own name (#39/#40). Log the bare REST method name; let redactSensitiveParams() handle params. Add `// eslint-disable-next-line local/no-credential-in-logger` with a reason for a genuine false positive.',
      // Suggestion (opt-in quick-fix), shared by every shape. Deliberately NOT a
      // targeted replacement: the rule cannot know a safe field name to log
      // (`method` may not be in scope), and a wrong fix on a security rule is
      // worse than none (#308). Removal always drops the leak and never invents
      // an unsafe substitute.
      removeEntry:
        'Remove this entry from the logger context (safe — dropping data cannot leak). Then add back only the specific non-credential fields you need.'
    }
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode()

    // Fixer for the `removeEntry` suggestion: delete `node` and one adjacent
    // comma so the surrounding object stays valid whether the entry is first,
    // middle, last, or the only one. Comment-safe: the whitespace-consuming
    // ranges stop AT a comment (`includeComments`), never through it — a fixer
    // on a security rule must not silently delete an author's note, least of all
    // an `// eslint-disable-next-line` sitting between entries.
    function removeEntryFix(node) {
      return (fixer) => {
        const after = sourceCode.getTokenAfter(node)
        if (after && after.value === ',') {
          // Extend across whitespace up to the next token OR comment, so a
          // removed leading/middle entry leaves no double space AND a trailing
          // comment on that entry survives.
          const next = sourceCode.getTokenAfter(after, { includeComments: true })
          const end = next ? next.range[0] : after.range[1]
          return fixer.removeRange([node.range[0], end])
        }
        const before = sourceCode.getTokenBefore(node)
        if (before && before.value === ',') {
          // Entry is last. Remove the preceding comma too — unless a comment
          // sits between it and the node, in which case start after the comment
          // so it is preserved (leaves a valid trailing comma).
          const beforeInclComments = sourceCode.getTokenBefore(node, { includeComments: true })
          const start = beforeInclComments && beforeInclComments !== before
            ? beforeInclComments.range[1]
            : before.range[0]
          return fixer.removeRange([start, node.range[1]])
        }
        return fixer.remove(node)
      }
    }

    function suggestRemoval(node) {
      return [{ messageId: 'removeEntry', fix: removeEntryFix(node) }]
    }

    return {
      Property(node) {
        if (!insideLoggerCall(node)) {
          return
        }

        // The three arms below are checked most-specific-first and the first
        // match `return`s. A property whose KEY and VALUE are both credential-
        // shaped (`{ url: err.config.url }`) therefore reports ONCE — as
        // memberValue — not twice as the old four independent selectors did.
        // One report per offending property is enough to redden CI and name a
        // real reason; the duplicate only added noise.

        // selector 1 — VALUE is a credential-shaped bare identifier
        // (shorthand `{ url }` or `{ method: methodFormatted }`).
        if (node.value.type === 'Identifier' && CREDENTIAL_VALUE.test(node.value.name)) {
          context.report({ node, messageId: 'bareValue', data: { name: node.value.name }, suggest: suggestRemoval(node) })
          return
        }

        // selector 2 — VALUE is a member access ending in a credential-shaped property.
        if (
          node.value.type === 'MemberExpression'
          && node.value.property.type === 'Identifier'
          && CREDENTIAL_KEY.test(node.value.property.name)
        ) {
          context.report({ node, messageId: 'memberValue', data: { name: node.value.property.name }, suggest: suggestRemoval(node) })
          return
        }

        // selector 4 — credential-shaped KEY with a dynamic (Identifier|MemberExpression)
        // value (skips shorthand — selector 1 — and literal values — `{ url: '/static' }`).
        if (
          !node.shorthand
          && node.key.type === 'Identifier'
          && CREDENTIAL_KEY.test(node.key.name)
          && (node.value.type === 'Identifier' || node.value.type === 'MemberExpression')
        ) {
          context.report({ node, messageId: 'credentialKey', data: { name: node.key.name }, suggest: suggestRemoval(node) })
        }
      },

      // selector 3 — spread of an axios `config`/`request`/`response`.
      SpreadElement(node) {
        if (!insideLoggerCall(node)) {
          return
        }
        if (
          node.argument.type === 'MemberExpression'
          && node.argument.property.type === 'Identifier'
          && AXIOS_SPREAD.test(node.argument.property.name)
        ) {
          context.report({ node, messageId: 'axiosSpread', data: { name: node.argument.property.name }, suggest: suggestRemoval(node) })
        }
      }
    }
  }
}

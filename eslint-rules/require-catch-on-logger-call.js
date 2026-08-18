/**
 * @fileoverview Require `.catch(...)` on a fire-and-forget logger call.
 *
 * Every logging method on `LoggerInterface` returns `Promise<void>`, and the SDK
 * calls them as bare statements — it does not await the result and does not want
 * to. JavaScript does not read that as indifference: an unawaited promise that
 * rejects is an *unhandled rejection*, which terminates the Node process by
 * default (`--unhandled-rejections=throw`, the default since Node 15). Handlers
 * do real I/O (Telegram, streams, the winston/consola adapters), so rejection is
 * an ordinary operational event, and a logging sink could take the whole process
 * with it (#346).
 *
 * `Logger.log()` isolates its own processors and handlers, but that only covers
 * the SDK's own implementation — a caller who installs a custom `LoggerInterface`
 * through `setLogger(...)` bypasses it. The trailing `.catch(() => {})` is what
 * makes the intent explicit and covers both. This rule keeps callsite N+1 from
 * quietly forgetting it.
 *
 * Reported ONLY for a call in statement position. A logger call that is awaited,
 * returned, assigned, or already chained is deliberately left alone — there the
 * promise has an owner (the deprecated `LoggerBrowser` passthroughs
 * `return this.#logger.debug(…)` are the in-repo example).
 *
 * Fixable: the fix appends `.catch(() => {})`, which is mechanical and safe.
 *
 * Receivers are matched by shape (`this.getLogger()`, `this._logger`, `logger`,
 * `this.#logger`, `$logger`) rather than by type — this is a syntax-only rule, so
 * it needs no type-aware linting. The trade-off is that an unusually-named logger
 * variable is not covered; a same-named non-logger object would be a false
 * positive, which is why the receiver list is narrow.
 */

// Mirrors LoggerInterface. `forcedLog` is LoggerFactory's static helper.
const LOGGER_METHODS = new Set([
  'log', 'debug', 'info', 'notice', 'warning', 'error',
  'critical', 'alert', 'emergency', 'forcedLog'
])

// Identifier receivers that denote a logger.
const LOGGER_IDENTIFIER = /^(?:\$?logger|_logger)$/

/** `this.getLogger()` — a call whose callee is a `getLogger` member access. */
function isGetLoggerCall(node) {
  return (
    node.type === 'CallExpression'
    && node.callee.type === 'MemberExpression'
    && node.callee.property.type === 'Identifier'
    && node.callee.property.name === 'getLogger'
  )
}

/** Does `node` look like a logger instance? */
function isLoggerReceiver(node) {
  if (!node) {
    return false
  }
  // `logger`, `$logger`, `_logger`
  if (node.type === 'Identifier') {
    return LOGGER_IDENTIFIER.test(node.name)
  }
  // `this._logger`, `this.logger`, `LoggerFactory` (for forcedLog)
  if (node.type === 'MemberExpression') {
    if (node.property.type === 'Identifier') {
      return LOGGER_IDENTIFIER.test(node.property.name)
    }
    // `this.#logger` — a private name, not an Identifier
    if (node.property.type === 'PrivateIdentifier') {
      return LOGGER_IDENTIFIER.test(node.property.name)
    }
    return false
  }
  // `this.getLogger()`
  return isGetLoggerCall(node)
}

/** `<loggerReceiver>.<level>(…)` */
function isLoggerCall(node) {
  return (
    node.type === 'CallExpression'
    && node.callee.type === 'MemberExpression'
    && node.callee.property.type === 'Identifier'
    && LOGGER_METHODS.has(node.callee.property.name)
    && isLoggerReceiver(node.callee.object)
  )
}

export default {
  meta: {
    type: 'problem',
    fixable: 'code',
    docs: {
      description:
        'require .catch() on a fire-and-forget logger call, so a rejecting log sink cannot crash the process (#346)'
    },
    schema: [],
    messages: {
      missingCatch:
        'Add `.catch(() => {})` to this fire-and-forget `{{name}}` call. Logger methods return a promise; an unawaited rejection is an unhandled rejection, which terminates the Node process by default — a failing log sink would take the operation with it (#346). If the promise is meant to have an owner, `await` or `return` it instead.'
    }
  },
  create(context) {
    return {
      ExpressionStatement(node) {
        const expression = node.expression
        if (!isLoggerCall(expression)) {
          return
        }

        context.report({
          node: expression,
          messageId: 'missingCatch',
          data: { name: expression.callee.property.name },
          fix(fixer) {
            return fixer.insertTextAfter(expression, '.catch(() => {})')
          }
        })
      }
    }
  }
}

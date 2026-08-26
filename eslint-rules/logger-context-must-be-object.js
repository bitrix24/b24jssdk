/**
 * @fileoverview A logger call's second argument must be an object literal.
 *
 * `LoggerInterface`'s methods take `(message: string, context?: Record<string,
 * any>)`. The removed `LoggerBrowser` took variadic arguments
 * (`info(...params: any[])`), so code written against it reads naturally as
 * "message, then another value" — and that shape still COMPILES against the new
 * interface, because an array, an `Error`, or almost anything else satisfies
 * `Record<string, any>` structurally. The second value is then silently
 * reshaped or dropped.
 *
 * Two shipped recipes had exactly that (#277):
 *
 * - `logger.error('install failed', e)` logged `{}`. An `Error`'s `message` and
 *   `stack` are not own enumerable properties, so the reason for the failure
 *   disappeared — inside an OAuth install handler.
 * - `logger.info('…', res.getErrorMessages())` landed the array as
 *   `{ '0': …, '1': … }`.
 *
 * Neither is a type error, which is why `skills:typecheck` did not catch them.
 *
 * Deliberately strict: the second argument must be written as an object literal
 * at the callsite. `logger.info('x', ctx)` is reported even when `ctx` really
 * does hold a record, because this is a syntax-only rule — it cannot see what a
 * variable holds, and the alternative (allow any identifier) permits exactly the
 * `logger.error('failed', e)` shape that motivated the rule. Spreading is the
 * escape hatch: `logger.info('x', { ...ctx })` states the intent and passes.
 *
 * That strictness is why the rule is enabled ONLY for
 * `skills/b24jssdk-recipes/**`. Hoisting the context into a variable is correct
 * code — the SDK's own `LoggerBrowser` passthroughs do it — so this is a
 * teaching convention, not a correctness rule. It earns its place in files that
 * are shipped for an agent to copy, where the literal is what makes the
 * parameter's meaning visible at the point of copying.
 *
 * Receiver and method matching mirror `require-catch-on-logger-call.js`, for the
 * same reason given there: syntax-only, so the receiver list is narrow rather
 * than type-derived.
 *
 * Not fixable. Wrapping the value automatically would have to guess a key name,
 * and for the `Error` case the correct fix is `{ message, stack }` rather than
 * `{ e }` — a guess would look right and still lose the information.
 */

// Mirrors LoggerInterface. `log` is excluded: its signature is
// `(level, message, context?)`, so its context sits at index 2, not 1.
const LOGGER_METHODS = new Set([
  'debug', 'info', 'notice', 'warning', 'error',
  'critical', 'alert', 'emergency'
])

const LOGGER_IDENTIFIER = /^(?:\$?logger|_logger)$/

/** Does `node` look like a logger instance? */
function isLoggerReceiver(node) {
  if (!node) {
    return false
  }
  if (node.type === 'Identifier') {
    return LOGGER_IDENTIFIER.test(node.name)
  }
  // `this.logger`, `this._logger`, `this.#logger`
  if (node.type === 'MemberExpression' && node.object.type === 'ThisExpression') {
    if (node.property.type === 'PrivateIdentifier') {
      return LOGGER_IDENTIFIER.test(node.property.name)
    }
    return node.property.type === 'Identifier' && LOGGER_IDENTIFIER.test(node.property.name)
  }
  return false
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require a logger call\'s context argument to be an object literal'
    },
    schema: [],
    messages: {
      notAnObject:
        'The second argument to logger.{{method}}() is the context RECORD, not a second value. '
        + 'Passing {{what}} here is not a type error but loses the data: an Error serialises to `{}` '
        + 'and an array to `{ "0": … }`. Write an object literal, e.g. '
        + '`logger.{{method}}(message, { key: value })`.'
    }
  },

  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node
        if (
          callee.type !== 'MemberExpression'
          || callee.computed
          || callee.property.type !== 'Identifier'
          || !LOGGER_METHODS.has(callee.property.name)
          || !isLoggerReceiver(callee.object)
        ) {
          return
        }

        const second = node.arguments[1]
        if (!second || second.type === 'ObjectExpression') {
          return
        }

        // A spread of a known-good record, or an explicit `undefined`, are both
        // deliberate and readable at the callsite.
        if (second.type === 'Identifier' && second.name === 'undefined') {
          return
        }

        const what = second.type === 'ArrayExpression'
          ? 'an array'
          : second.type === 'Identifier'
            ? `\`${second.name}\``
            : 'this value'

        context.report({
          node: second,
          messageId: 'notAnObject',
          data: { method: callee.property.name, what }
        })
      }
    }
  }
}

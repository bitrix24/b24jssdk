import { createConfigForNuxt } from '@nuxt/eslint-config/flat'
import noCredentialInLogger from './eslint-rules/no-credential-in-logger.js'
import requireCatchOnLoggerCall from './eslint-rules/require-catch-on-logger-call.js'

export default createConfigForNuxt({
  features: {
    tooling: true,
    stylistic: {
      commaDangle: 'never',
      braceStyle: '1tbs'
    }
  }
}).overrideRules({
  'import/first': 'off',
  'import/order': 'off',
  '@typescript-eslint/ban-types': 'off',
  '@typescript-eslint/no-empty-object-type': 'off',
  '@typescript-eslint/no-explicit-any': 'off',
  'jsdoc/require-returns-description': 'off',
  'jsdoc/check-param-names': 'off',
  'regexp/optimal-lookaround-quantifier': 'off',
  'vue/multi-word-component-names': 'off',
  'vue/max-attributes-per-line': ['error', { singleline: 5 }],
  'vue/singleline-html-element-content-newline': [
    'error',
    {
      ignores: [
        'ProseA', 'ProseCode',
        'span', 'em', 'a', 'strong', 'b', 'i',
        'div', 'svg', 'time',
        'slot'
      ]
    }
  ]
}).prepend({
  ignores: [
    'packages/jssdk/src/pullClient/protobuf/*.js',
    '.claude/**'
  ]
}).append({
  // Defence-in-depth against re-introducing the #39/#40 webhook-secret leak:
  // forbid passing a URL/credential-shaped value into a logger context object.
  // Promoted from four hand-written `no-restricted-syntax` esquery selectors to
  // the local `no-credential-in-logger` rule (one credential vocabulary, explicit
  // AST logic, contextual messages — see `eslint-rules/no-credential-in-logger.js`),
  // and widened from `core/http/**` to the whole SDK source so a #39-class leak
  // outside the HTTP layer (pull / frame / hook / oauth) is caught too. Also
  // covers the Nuxt module source (`packages/jssdk-nuxt/src/**`) so the same
  // leak class is caught there as the SDK re-exports flow through it. The
  // runtime `redactSensitiveParams()` is the other half; this is the lint layer.
  // (#226 — promotes #42 / #212; Nuxt scope added in #262)
  //
  // NOT covered — the linter can't see the value through string interpolation:
  // template literals like `logger.debug(`GET ${url}`)` and `'…' + url`
  // concatenation. Reviewers must still reject those by hand: log the bare
  // method name, never the formatted URL.
  files: [
    'packages/jssdk/src/**/*.ts',
    'packages/jssdk-nuxt/src/**/*.ts'
  ],
  //
  // `require-catch-on-logger-call` guards a different failure in the same area
  // (#346): logger methods return a promise and the SDK calls them as bare
  // statements, so a rejecting sink becomes an unhandled rejection — fatal by
  // default in Node. Every such callsite must end in `.catch(() => {})`, which
  // states the fire-and-forget intent and also covers a custom LoggerInterface
  // installed via `setLogger(...)`, which the isolation inside our own
  // `Logger.log()` cannot reach. Syntax-only, so no type-aware linting needed;
  // auto-fixable.
  plugins: {
    local: {
      rules: {
        'no-credential-in-logger': noCredentialInLogger,
        'require-catch-on-logger-call': requireCatchOnLoggerCall
      }
    }
  },
  rules: {
    'local/no-credential-in-logger': 'error',
    'local/require-catch-on-logger-call': 'error'
  }
})

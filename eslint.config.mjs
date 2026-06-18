import { createConfigForNuxt } from '@nuxt/eslint-config/flat'

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
  // forbid passing a URL- or credential-shaped value into a logger context
  // object inside the HTTP layer. Log the bare REST method name (not the
  // formatted URL) and let redactSensitiveParams() handle params. (#42)
  //
  // Covered: `logger.debug(msg, { url })` (bare identifier value),
  // `{ foo: err.config.url }` (member-access value), `{ ...error.config }`
  // (spread of an axios config/request/response object that carries the URL),
  // and `{ apiUrl: someVar }` (credential-shaped property KEY with a dynamic
  // value — the value may hold the secret even when its own name looks innocent).
  // NOT covered — the linter can't see the value through string interpolation:
  // template literals like `logger.debug(`GET ${url}`)` and `'…' + url`
  // concatenation. Reviewers must still reject those by hand: log the bare
  // method name, never the formatted URL.
  files: ['packages/jssdk/src/core/http/**/*.ts'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        // { url }, { password }, { method: methodFormatted } — the VALUE is a
        // credential-shaped bare identifier (a credential-shaped KEY is selector 4).
        selector: 'CallExpression[callee.property.name=/^(debug|info|warning|error|notice|log|forcedLog)$/] Property[value.type="Identifier"][value.name=/[Uu]rl|methodFormatted|[Pp]assword|[Ss]ecret|[Tt]oken(?!s\\b)/]',
        message: 'Do not pass a URL/credential-shaped variable into a logger context object — it may carry the webhook secret (#39/#40). Log the bare REST method name (not methodFormatted); let redactSensitiveParams() handle params. Add `// eslint-disable-next-line no-restricted-syntax` with a reason for a genuine false positive.'
      },
      {
        // { foo: err.config.url }, { secret: cfg.password } — value is a member
        // access ending in a credential-shaped property.
        selector: 'CallExpression[callee.property.name=/^(debug|info|warning|error|notice|log|forcedLog)$/] Property[value.type="MemberExpression"][value.property.name=/[Uu]rl|[Pp]assword|[Ss]ecret|[Tt]oken(?!s\\b)/]',
        message: 'Do not log a URL/credential-shaped property access (e.g. `err.config.url`) — it may carry the webhook secret (#39/#40). Log the bare REST method name; let redactSensitiveParams() handle params. Add `// eslint-disable-next-line no-restricted-syntax` with a reason for a genuine false positive.'
      },
      {
        // { ...error.config }, { ...err.request } — spreading an axios object
        // that carries the full request URL into the logger context.
        selector: 'CallExpression[callee.property.name=/^(debug|info|warning|error|notice|log|forcedLog)$/] SpreadElement[argument.type="MemberExpression"][argument.property.name=/^(config|request|response)$/]',
        message: 'Do not spread an axios `config`/`request`/`response` object into a logger context — it carries the full request URL incl. the webhook secret (#39/#40). Pick the specific safe fields you need. Add `// eslint-disable-next-line no-restricted-syntax` with a reason for a genuine false positive.'
      },
      {
        // { apiUrl: someVar }, { password: pw }, { token: cfg.value } — the KEY is
        // credential-shaped and the value is a dynamic identifier/member access
        // that may carry the secret even when its own name looks innocent. Skips
        // shorthand (that's selector 1) and literal values (a hardcoded `{ url:
        // '/static' }` is safe).
        selector: 'CallExpression[callee.property.name=/^(debug|info|warning|error|notice|log|forcedLog)$/] Property[shorthand=false][key.name=/[Uu]rl|[Pp]assword|[Ss]ecret|[Tt]oken(?!s\\b)/][value.type=/^(Identifier|MemberExpression)$/]',
        message: 'Do not log a value under a URL/credential-shaped property key (e.g. `{ apiUrl: someVar }`) — the value may carry the webhook secret regardless of its own name (#39/#40). Log the bare REST method name; let redactSensitiveParams() handle params. Add `// eslint-disable-next-line no-restricted-syntax` with a reason for a genuine false positive.'
      }
    ]
  }
})

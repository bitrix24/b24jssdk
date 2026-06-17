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
  // forbid passing a URL- or credential-shaped variable as a value in a logger
  // context object inside the HTTP layer. Log the bare REST method name (not the
  // formatted URL) and let redactSensitiveParams() handle params. (#42)
  files: ['packages/jssdk/src/core/http/**/*.ts'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: 'CallExpression[callee.property.name=/^(debug|info|warning|error|notice|log|forcedLog)$/] Property[value.type="Identifier"][value.name=/[Uu]rl|methodFormatted|[Pp]assword|[Ss]ecret|[Tt]oken/]',
        message: 'Do not pass a URL/credential-shaped variable into a logger context object — it may carry the webhook secret (#39/#40). Log the bare REST method name (not methodFormatted); let redactSensitiveParams() handle params. Add `// eslint-disable-next-line no-restricted-syntax` with a reason for a genuine false positive.'
      }
    ]
  }
})

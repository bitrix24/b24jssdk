// @ts-check
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
  'regexp/optimal-lookaround-quantifier': 'off'
}).prepend({
  ignores: ['node_modules/**', 'dist/**']
})

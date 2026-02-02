import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [],
  rollup: {},
  hooks: {
    'mkdist:entry:options'(ctx, entry, options) {
      options.addRelativeDeclarationExtensions = false
    }
  }
})

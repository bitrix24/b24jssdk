import { defineBuildConfig } from 'unbuild'
import packageInfo from './package.json'

// Single source of truth for the module version: the `version: '__SDK_VERSION__'`
// placeholder in src/module.ts is replaced from package.json at build time — the
// same mechanism the core SDK uses for `__SDK_VERSION__` (see
// packages/jssdk/build.config.ts). Keeps meta.version from drifting (#119).
export default defineBuildConfig({
  entries: [],
  rollup: {
    // Only the rolled-up module entry (src/module) is processed here; runtime/*
    // files go through mkdist and are NOT replaced — keep version tokens out of
    // runtime code.
    replace: {
      values: {
        __SDK_VERSION__: packageInfo.version
      },
      preventAssignment: true
    }
  },
  hooks: {
    'mkdist:entry:options'(ctx, entry, options) {
      options.addRelativeDeclarationExtensions = false
    }
  }
})

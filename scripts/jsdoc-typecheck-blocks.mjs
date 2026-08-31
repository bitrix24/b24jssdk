#!/usr/bin/env node
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkBlocks } from './_typecheck-blocks.mjs'
import { extractJsDocExamples } from './_extract-jsdoc-examples.mjs'
import { walkFiles } from './_docs-utils.mjs'
import { requireSdkTypes } from './_require-sdk-types.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
requireSdkTypes('jsdoc:typecheck-blocks')

process.exit(checkBlocks({
  label: 'jsdoc-typecheck',
  repoRoot: REPO_ROOT,
  checkDir: join(REPO_ROOT, '.jsdoc-typecheck'),
  files: walkFiles(join(REPO_ROOT, 'packages', 'jssdk', 'src'), { extension: '.ts' }),
  extract: extractJsDocExamples
}))

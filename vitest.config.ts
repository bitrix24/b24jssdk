import { defineConfig } from 'vitest/config'
import dotenv from 'dotenv'
import path from 'node:path'

dotenv.config({ quiet: true, path: path.resolve(__dirname, '.env.test') })

export default defineConfig({
  test: {
    globals: true,
    silent: false,
    // reporters: [['tree', { summary: false }]],
    projects: [
      {
        extends: true,
        test: {
          name: 'jsSdk:unit',
          environment: 'node',
          testTimeout: 10_000,
          // Some unit specs (the PullClient SSR/lifecycle suites) mutate shared
          // browser globals — `globalThis.window` / `document` / `navigator` /
          // `XMLHttpRequest` — to simulate Node/SSR. Running files in parallel
          // let one file's global teardown race another's assertions, producing
          // flaky `window is not defined` failures. Serialise the files so the
          // global mutations can't interleave. (#222)
          fileParallelism: false,
          include: ['./test/integration/**/*.unit.spec.ts']
        }
      },
      {
        extends: true,
        test: {
          name: 'jsSdk:integration',
          environment: 'node',
          testTimeout: 30_000,
          hookTimeout: 30_000,
          include: ['./test/integration/**/*.spec.ts'],
          exclude: ['./test/integration/**/*.unit.spec.ts'],
          setupFiles: ['./test/0_setup/setup-integration-jssdk.ts']
        }
      },
      {
        extends: true,
        test: {
          name: 'jsSdk:contributing-snippets',
          environment: 'node',
          include: ['./test/some-code-from-docs/contributing/**/*.spec.ts']
        }
      },
      {
        extends: true,
        test: {
          name: 'jsSdk:underLoad',
          environment: 'node',
          maxConcurrency: 10,
          testTimeout: 2400_000, // 40 min
          hookTimeout: 2400_000,
          fileParallelism: false,
          sequence: { shuffle: false },
          include: ['./test/under-load/**.spec.ts'],
          setupFiles: ['./test/0_setup/setup-under-load-jssdk.ts']
        }
      }
    ]
  }
})

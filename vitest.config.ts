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
          include: ['./test/integration/**/*.unit.spec.ts'],
          // The recipe specs live in their own project — see `skills:unit`.
          exclude: ['./test/integration/skills-recipes/**']
        }
      },
      {
        extends: true,
        test: {
          // Unit tests for the skill recipes under `skills/b24jssdk-recipes/`
          // (#64). Held apart from `jsSdk:unit` because these are the only
          // specs that import the recipes' opt-in packages (grammy, express)
          // and the recipe files themselves. Keeping the boundary explicit
          // means moving those deps out of the workspace root (#65) has one
          // project to gate rather than a subset of a larger one.
          name: 'skills:unit',
          environment: 'node',
          testTimeout: 10_000,
          include: ['./test/integration/skills-recipes/**/*.unit.spec.ts']
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
          exclude: [
            './test/integration/**/*.unit.spec.ts',
            // Own project — see `skills:live`.
            './test/integration/skills/**'
          ],
          setupFiles: ['./test/0_setup/setup-integration-jssdk.ts']
        }
      },
      {
        extends: true,
        test: {
          // Live-portal verification of the skill files (#113). Its own project
          // rather than a `-t` title filter over jsSdk:integration: the repo
          // already scopes by `include` for `skills:unit`, and a substring match
          // is one copied describe title away from silently running the wrong
          // set — or nothing at all, which in a verification suite reads as
          // "everything passed".
          name: 'skills:live',
          environment: 'node',
          testTimeout: 30_000,
          hookTimeout: 30_000,
          include: ['./test/integration/skills/**/*.spec.ts'],
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

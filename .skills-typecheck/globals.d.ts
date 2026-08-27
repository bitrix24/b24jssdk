/**
 * Ambient declarations for the TypeScript fences in `skills/*\/SKILL.md` (#402).
 *
 * Skill files are reference prose, so many fences are deliberately fragments:
 * they show the call under discussion, not a runnable program. Without ambients
 * every such fence would fail on a name the surrounding paragraph established,
 * and the gate would report noise instead of defects.
 *
 * The line drawn here, which is the whole design of this file:
 *
 *  - A REAL export of `@bitrix24/b24jssdk` is NEVER declared here. If a fence
 *    uses `Text`, `AjaxResult` or `EnumCrmEntityTypeId`, the fence must import
 *    it — an agent copying that snippet needs the import, and hiding it behind
 *    an ambient would make the gate certify code that does not run. The first
 *    run of this gate found `Text.toB24Format(...)` resolving to the DOM `Text`
 *    for exactly that reason.
 *  - A PLACEHOLDER belonging to the reader's own application — a domain type, a
 *    handler they write, an id list they already have — is declared here.
 *  - A framework global that really is auto-imported at the callsite (Nuxt's
 *    `useNuxtApp`, `navigateTo`) is declared here.
 *
 * This mirrors `.docs-typecheck/globals.d.ts`, including its known limitation:
 * an ambient cannot tell whether the reader actually has that binding, so the
 * gate proves a fence type-checks, not that it is complete. Keep the list short
 * for that reason — every entry is a check the gate stops performing.
 */

// region The reader's own application ////

// Domain types used as `<T>` arguments in examples. Deliberately loose: the
// examples illustrate the call shape, not any particular portal's schema.
type CrmItem = Record<string, any>
type Contact = Record<string, any>
type ChatInfo = Record<string, any>
type EventLogItem = Record<string, any>
type Deal = Record<string, any>
type TaskItem = Record<string, any>
type EventItem = Record<string, any>

// Values and functions the surrounding prose establishes the reader already has.
declare const ids: number[]
declare const arrayOfCalls: any[]
declare const b24OAuthParams: any
declare const clientId: string
declare const clientSecret: string
declare const db: any
declare const sixMonthsAgo: Date
declare const rootEl: HTMLElement
declare function processDeal(item: any): void
declare function handleCrmEvent(message: any): void
declare function handleImEvent(message: any): void
declare function handleAppEvent(message: any): void
declare function routeForPlace(place: string): string
declare function isSamePath(a: string, b: string): boolean
declare function risky(): Promise<void>
declare function main(): Promise<void>

// endregion ////

// region Instances a previous fence constructed ////

// The live SDK client, as in `.docs-typecheck/globals.d.ts`. `let`, not `const`:
// frame snippets assign to it via `$b24 = await initializeB24Frame()`, which a
// `declare const` would reject with TS2588.
declare let $b24: import('@bitrix24/b24jssdk').B24Frame

// `helper` and `logger` are built in an earlier fence on the same page and then
// used across several later ones. Same concession `.docs-typecheck` makes for
// `$b24`: the alternative is repeating the constructor in every fragment, which
// buries the call being explained.
declare const helper: ReturnType<typeof import('@bitrix24/b24jssdk').useB24Helper> extends infer H
  ? H extends { getB24Helper: () => infer M } ? M : any
  : any
declare const logger: import('@bitrix24/b24jssdk').LoggerInterface

// Destructured from `useB24Helper()` in the page's first fence.
declare const usePullClient: () => void
declare const useSubscribePullClient: (callback: (message: any) => void, moduleId?: string) => () => void
declare const startPullClient: () => void

// endregion ////

// region Framework globals ////

// Nuxt auto-imports these in an app; a fence showing app code does not import them.
declare function useNuxtApp(): any
declare function useRouter(): any
declare function navigateTo(to: any, options?: any): any
declare function onNuxtReady(callback: () => void): void
declare function defineNuxtRouteMiddleware(handler: (to: any, from: any) => any): any

// endregion ////

// Single-file components are out of scope for a type gate over Markdown; a
// fence importing from 'vue' only needs the names to resolve.
declare module 'vue' {
  export function ref<T>(value: T): { value: T }
  export function computed<T>(getter: () => T): { value: T }
  export function onMounted(callback: () => void): void
  export function onUnmounted(callback: () => void): void
  export function onBeforeUnmount(callback: () => void): void
  export function watch(source: any, callback: any, options?: any): () => void
}

// Vite/Nuxt extend ImportMeta; the DOM lib does not know about these.
interface ImportMeta {
  dev?: boolean
  server?: boolean
  client?: boolean
  env?: Record<string, any>
}

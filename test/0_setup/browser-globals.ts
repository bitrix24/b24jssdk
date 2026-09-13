/**
 * Install and remove a browser global in a Node test, by descriptor rather than
 * by assignment.
 *
 * `globalThis.navigator = …` reads as equivalent to `defineProperty` and is not.
 * Node ships a built-in `navigator` whose own property has a **getter and no
 * setter**, and spec files are ES modules — so in strict mode that assignment
 * throws:
 *
 *     TypeError: Cannot set property navigator of #<Object> which has only a getter
 *
 * The pull specs did exactly that and passed anyway, because their teardown used
 * `delete`, which removes the built-in for the rest of the process. Whichever
 * file ran first paid the error; every file after it found a plain, writable
 * property. `jsSdk:unit` runs its files serially in one process, so "which file
 * runs first" silently decided whether the suite was green.
 *
 * The default order happened to be lucky. Adding an unrelated spec file
 * elsewhere in the suite was enough to change the order and expose it — which is
 * how it surfaced, as a single unexplained failure in a pull request about
 * `.env.test` (#511). Measured on `main` before this fix: five failures in five
 * shuffled runs, zero in the unshuffled order.
 *
 * `defineProperty` works whether or not a getter-only property is in the way,
 * and `restoreGlobal` puts the original descriptor back instead of deleting it —
 * so a file leaves the process as it found it, and the next file's assumptions
 * about Node's built-ins stay true.
 *
 * The file has a second job now, on the same principle: standing in for a
 * **browser worker**, which takes a global (`WorkerGlobalScope`) and one
 * property of `process` (`versions`). Both are saved and restored by descriptor,
 * for the reason above.
 *
 * Exercised directly by
 * `test/integration/pull/pull-globals-descriptor.unit.spec.ts`.
 */
const savedDescriptors = new Map<string, PropertyDescriptor | undefined>()

/** Install `value` as `globalThis[name]`, remembering what was there. */
export function defineGlobal(name: string, value: unknown): void {
  if (!savedDescriptors.has(name)) {
    savedDescriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  }
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

/** Put back whatever `defineGlobal` displaced — including nothing at all. */
export function restoreGlobal(name: string): void {
  const saved = savedDescriptors.get(name)
  if (saved) {
    Object.defineProperty(globalThis, name, saved)
  } else {
    // The key is the caller's global name, so there is no static alternative —
    // and setting it to `undefined` is a different state from absent for every
    // guard the SDK writes against these globals.
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as never as Record<string, unknown>)[name]
  }
  savedDescriptors.delete(name)
}

/**
 * Hide the Node version for the duration of a test, and put it back **by
 * descriptor**.
 *
 * By descriptor, like everything else here — though for a different reason than
 * the globals above, and the difference is worth writing down because it is easy
 * to get backwards. A restore that passes only `{ value, configurable: true }`
 * would *not* silently make the property non-enumerable: `defineProperty` on an
 * **existing** property leaves unspecified attributes alone, and the
 * default-to-`false` rule applies only when creating one. Measured on Node 22:
 * `process.versions` keeps `enumerable: true, writable: false` through hide and
 * restore either way.
 *
 * The descriptor is saved anyway, because the value-only form is right by
 * accident rather than by rule: it depends on the property already existing with
 * the attributes you want back, which is not something a test should have to
 * know about Node's internals. `jsSdk:unit` runs its files serially in one
 * process, and a property left in the wrong shape is the #511 class of defect —
 * cheap to prevent, invisible when it happens.
 *
 * @returns the undo, to call from a `finally`.
 */
export function hideNodeVersion(): () => void {
  const saved = Object.getOwnPropertyDescriptor(process, 'versions')

  Object.defineProperty(process, 'versions', { value: {}, configurable: true })

  return () => {
    if (saved) {
      Object.defineProperty(process, 'versions', saved)
      return
    }

    delete (process as never as Record<string, unknown>)['versions']
  }
}

/**
 * Make this process look like a **browser** worker for the duration of a test.
 *
 * Two globals decide it, and both matter:
 *
 *   - `globalThis instanceof WorkerGlobalScope` — the SDK asks whether this
 *     scope *is* a worker scope, not whether the constructor exists, so the
 *     stand-in answers through `Symbol.hasInstance` rather than by pretending to
 *     be a prototype;
 *   - no Node version. That is what separates a browser worker from a Deno
 *     worker or a Cloudflare Worker, which report one and are servers —
 *     `getEnvironment()` tests Node first for exactly that reason. This suite
 *     runs under a real Node, so modelling the browser case means hiding it.
 *
 * Shared rather than re-invented per spec: written the short way (define the
 * global and nothing else) a test claims to describe a browser worker and
 * describes a Deno one.
 *
 * @returns the undo, to call from a `finally`.
 */
export function installBrowserWorkerGlobals(): () => void {
  const WorkerGlobalScope = function WorkerGlobalScope() {} as unknown as {
    [Symbol.hasInstance](value: unknown): boolean
  }

  Object.defineProperty(WorkerGlobalScope, Symbol.hasInstance, {
    value: (value: unknown) => value === globalThis
  })

  defineGlobal('WorkerGlobalScope', WorkerGlobalScope)

  const restoreVersions = hideNodeVersion()

  return () => {
    restoreVersions()
    restoreGlobal('WorkerGlobalScope')
  }
}

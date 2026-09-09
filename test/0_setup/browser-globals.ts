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

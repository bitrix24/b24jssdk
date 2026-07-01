const OBJECT_CONSTRUCTOR_STRING = Function.prototype.toString.call(Object)

interface BlobLike {
  readonly size: number
  readonly type: string
  slice(start?: number, end?: number, contentType?: string): Blob
}

interface FileLike extends BlobLike {
  name: string
  lastModified?: number
  lastModifiedDate?: object
}

/**
 * A collection of runtime type guards used across the SDK.
 *
 * Every method (other than `getTag` and `clone`) is a TypeScript type guard
 * (`value is X`), so it can be used directly in `if` chains and have the
 * compiler narrow the value's type. It groups together checks for:
 * - primitives (strings, numbers, booleans, `null` / `undefined`),
 * - objects (plain objects, functions, `Map` / `Set` / `WeakMap` / `WeakSet`, `RegExp`, prototypes),
 * - arrays and array-like values (including typed arrays and `ArrayBuffer`),
 * - DOM nodes (elements, text nodes),
 * - file-like values (`Blob`, `File`, `FormData`),
 * - JSON-RPC message shapes.
 *
 * The class is exported as the `Type` singleton — you never instantiate it yourself.
 *
 * @example
 * ```ts
 * import { Type } from '@bitrix24/b24jssdk'
 *
 * function process(value: unknown) {
 *   if (Type.isStringFilled(value)) {
 *     // value: string
 *     return value.trim()
 *   }
 * }
 * ```
 *
 * @see bitrix/js/main/core/src/lib/type.js
 */
class TypeManager {
  /**
   * Returns the internal `[[Class]]` tag of a value.
   * @param value - The value to inspect.
   * @returns The result of `Object.prototype.toString.call(value)`, e.g. `'[object Array]'`.
   */
  getTag(value: any): string {
    return Object.prototype.toString.call(value)
  }

  /**
   * Checks that value is string
   * @param value
   * @return {boolean}
   *
   * @memo get from pull.client.Utils
   */
  isString(value: any): value is string {
    return typeof value === 'string' || value instanceof String
  }

  /**
   * Returns true if a value is not an empty string
   * @param value
   * @returns {boolean} Returns true if a value is not an empty string
   */
  isStringFilled(value: any): value is string {
    return this.isString(value) && value !== ''
  }

  /**
   * Checks that value is function
   * @param value
   * @return {boolean}
   *
   * @memo get from pull.client.Utils
   */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  isFunction(value: any): value is Function {
    return value === null
      ? false
      : typeof value === 'function' || value instanceof Function
  }

  /**
   * Checks that value is an object
   * @param value
   * @return {boolean}
   */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  isObject(value: any): value is object | Function {
    return !!value && (typeof value === 'object' || typeof value === 'function')
  }

  /**
   * Checks that value is object like
   * @param value
   * @return {boolean}
   */
  isObjectLike<T>(value: any): value is T {
    return !!value && typeof value === 'object'
  }

  /**
   * Checks that value is plain object
   * @param value
   * @return {boolean}
   */
  isPlainObject(value: any): value is Record<string | number, any> {
    if (!this.isObjectLike(value) || this.getTag(value) !== '[object Object]') {
      return false
    }

    const proto = Object.getPrototypeOf(value)
    if (proto === null) {
      return true
    }

    const ctor = Object.prototype.hasOwnProperty.call(proto, 'constructor') && proto.constructor

    return (
      typeof ctor === 'function'
      && Function.prototype.toString.call(ctor) === OBJECT_CONSTRUCTOR_STRING
    )
  }

  /**
   * Checks that value looks like a JSON-RPC request object.
   * @param value - The value to check.
   * @returns True when `value` has a non-empty `jsonrpc` string and a non-empty `method` string.
   */
  isJsonRpcRequest(value: any): boolean {
    return (
      typeof value === 'object'
      && value
      && 'jsonrpc' in value
      && this.isStringFilled(value.jsonrpc)
      && 'method' in value
      && this.isStringFilled(value.method)
    )
  }

  /**
   * Checks that value looks like a JSON-RPC response object.
   * @param value - The value to check.
   * @returns True when `value` has a non-empty `jsonrpc` string, an `id`, and either a `result` or an `error` property.
   */
  isJsonRpcResponse(value: any): boolean {
    return (
      typeof value === 'object'
      && value
      && 'jsonrpc' in value
      && this.isStringFilled(value.jsonrpc)
      && 'id' in value
      && ('result' in value || 'error' in value)
    )
  }

  /**
   * Checks that value is boolean
   * @param value
   * @return {boolean}
   */
  isBoolean(value: any): value is boolean {
    return value === true || value === false
  }

  /**
   * Checks that value is number
   * @param value
   * @return {boolean}
   */
  isNumber(value: any): value is number {
    return typeof value === 'number' && !Number.isNaN(value)
  }

  /**
   * Checks that value is integer
   * @param value
   * @return {boolean}
   */
  isInteger(value: any): value is number {
    return Number.isInteger(value)
  }

  /**
   * Checks that value is float
   * @param value
   * @return {boolean}
   */
  isFloat(value: any): value is number {
    return this.isNumber(value) && !this.isInteger(value)
  }

  /**
   * Checks that value is nil
   * @param value
   * @return {boolean}
   */
  isNil(value: any): value is null | undefined {
    return value === null || value === undefined
  }

  /**
   * Checks that value is an array
   * @param value
   * @return {boolean}
   */
  isArray(value: any): value is any[] {
    return !this.isNil(value) && Array.isArray(value)
  }

  /**
   * Returns true if a value is an array, and it has at least one element
   * @param value
   * @returns {boolean} Returns true if a value is an array, and it has at least one element
   */
  isArrayFilled(value: any): value is any[] {
    return this.isArray(value) && value.length > 0
  }

  /**
   * Checks that value is array like
   * @param value
   * @return {boolean}
   */
  isArrayLike(value: any): value is ArrayLike<any> {
    return (
      !this.isNil(value)
      && !this.isFunction(value)
      && value.length > -1
      && value.length <= Number.MAX_SAFE_INTEGER
    )
  }

  /**
   * Checks that value is Date
   * @param value
   * @return {boolean}
   */
  isDate(value: any): value is Date {
    return value instanceof Date
  }

  /**
   * Checks that is a DOM node
   * @param value
   * @return {boolean}
   */
  isDomNode(value: any): value is Node {
    return (
      this.isObjectLike<{
        nodeType?: any
      }>(value)
      && !this.isPlainObject(value)
      && 'nodeType' in value
    )
  }

  /**
   * Checks that value is element node
   * @param value
   * @return {boolean}
   */
  isElementNode(value: any): value is HTMLElement {
    return this.isDomNode(value) && value.nodeType === Node.ELEMENT_NODE
  }

  /**
   * Checks that value is a text node
   * @param value
   * @return {boolean}
   */
  isTextNode(value: any): value is Text {
    return this.isDomNode(value) && value.nodeType === Node.TEXT_NODE
  }

  /**
   * Checks that value is Map
   * @param value
   * @return {boolean}
   */
  isMap(value: any): value is Map<unknown, unknown> {
    return this.isObjectLike(value) && this.getTag(value) === '[object Map]'
  }

  /**
   * Checks that value is Set
   * @param value
   * @return {boolean}
   */
  isSet(value: any): value is Set<unknown> {
    return this.isObjectLike(value) && this.getTag(value) === '[object Set]'
  }

  /**
   * Checks that value is WeakMap
   * @param value
   * @return {boolean}
   */
  isWeakMap(value: any): value is WeakMap<object, unknown> {
    return this.isObjectLike(value) && this.getTag(value) === '[object WeakMap]'
  }

  /**
   * Checks that value is WeakSet
   * @param value
   * @return {boolean}
   */
  isWeakSet(value: any): value is WeakSet<object> {
    return this.isObjectLike(value) && this.getTag(value) === '[object WeakSet]'
  }

  /**
   * Checks that value is prototype
   * @param value
   * @return {boolean}
   */
  isPrototype(value: any): value is object {
    return (
      (
        (
          typeof (value && value.constructor) === 'function'
          && value.constructor.prototype
        ) || Object.prototype
      ) === value
    )
  }

  /**
   * Checks that value is regexp
   * @param value
   * @return {boolean}
   */
  isRegExp(value: any): value is RegExp {
    return this.isObjectLike(value) && this.getTag(value) === '[object RegExp]'
  }

  /**
   * Checks that value is null
   * @param value
   * @return {boolean}
   */
  isNull(value: any): value is null {
    return value === null
  }

  /**
   * Checks that value is undefined
   * @param value
   * @return {boolean}
   */
  isUndefined(value: any): value is undefined {
    return typeof value === 'undefined'
  }

  /**
   * Checks that value is ArrayBuffer
   * @param value
   * @return {boolean}
   */
  isArrayBuffer(value: any): value is ArrayBuffer {
    return (
      this.isObjectLike(value) && this.getTag(value) === '[object ArrayBuffer]'
    )
  }

  /**
   * Checks that value is typed array
   * @param value
   * @return {boolean}
   */
  isTypedArray(value: any): value is
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array {
    const regExpTypedTag
      = /^\[object (?:Float(?:32|64)|(?:Int|Uint)(?:8|16|32)|Uint8Clamped)Array\]$/
    return this.isObjectLike(value) && regExpTypedTag.test(this.getTag(value))
  }

  /**
   * Checks that value is Blob
   * @param value
   * @return {boolean}
   */
  isBlob(value: any): value is BlobLike {
    return (
      this.isObjectLike(value)
      && this.isNumber((value as BlobLike).size)
      && this.isString((value as BlobLike).type)
      && this.isFunction((value as BlobLike).slice)
    )
  }

  /**
   * Checks that value is File
   * @param value
   * @return {boolean}
   */
  isFile(value: any): value is FileLike {
    return (
      this.isBlob(value)
      && this.isString((value as FileLike).name)
      && (this.isNumber((value as FileLike).lastModified) || this.isObjectLike((value as FileLike).lastModifiedDate))
    )
  }

  /**
   * Checks that value is FormData
   * @param value
   * @return {boolean}
   */
  isFormData(value: any): value is FormData {
    if (typeof FormData !== 'undefined' && value instanceof FormData) {
      return true
    }

    return this.isObjectLike(value) && this.getTag(value) === '[object FormData]'
  }

  /**
   * Deep-clones a value, with support for DOM nodes.
   *
   * Primitives and `null` / `undefined` are returned unchanged. `Date` instances
   * are cloned via `new Date(obj)`, DOM nodes via `Node.cloneNode`, and plain
   * objects/arrays are copied property by property (recursively, when `bCopyObj` is true).
   *
   * @param obj - The value to clone.
   * @param bCopyObj - When true (default), nested objects/arrays are cloned recursively; when false, they are copied by reference.
   * @returns A clone of `obj` (or `obj` itself for primitives).
   */
  clone(obj: any, bCopyObj: boolean = true): any {
    let _obj, i, l

    if (this.isNil(obj) || typeof obj !== 'object') {
      return obj
    }

    if (this.isDomNode(obj)) {
      _obj = obj.cloneNode(bCopyObj)
    } else if (typeof obj == 'object') {
      if (this.isArray(obj)) {
        _obj = []
        for (i = 0, l = obj.length; i < l; i++) {
          if (typeof obj[i] == 'object' && bCopyObj) {
            _obj[i] = this.clone(obj[i], bCopyObj)
          } else {
            _obj[i] = obj[i]
          }
        }
      } else {
        _obj = {}
        if (obj.constructor) {
          if (this.isDate(obj)) {
            _obj = new Date(obj)
          } else {
            _obj = new obj.constructor()
          }
        }

        for (i in obj) {
          if (!Object.prototype.hasOwnProperty.call(obj, i)) {
            continue
          }
          if (typeof obj[i] === 'object' && bCopyObj) {
            _obj[i] = this.clone(obj[i], bCopyObj)
          } else {
            _obj[i] = obj[i]
          }
        }
      }
    } else {
      _obj = obj
    }

    return _obj
  }
}

export const Type = new TypeManager()

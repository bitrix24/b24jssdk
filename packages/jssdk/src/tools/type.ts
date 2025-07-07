const OBJECT_CONSTRUCTOR_STRING = Function.prototype.toString.call(Object)

interface BlobLike {
  readonly size: number
  readonly type: string
  slice(start?: number, end?: number, contentType?: string): Blob
}

interface FileLike extends BlobLike {
  name: string;
  lastModified?: number;
  lastModifiedDate?: object;
}

/**
 * The `Type` class is designed to check and determine data types
 *
 * @see bitrix/js/main/core/src/lib/type.js
 */
class TypeManager {
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
    // eslint-disable-next-line unicorn/no-instanceof-builtins
    return typeof value === 'string' || value instanceof String
  }

  /**
   * Returns true if a value is not an empty string
   * @param value
   * @returns {boolean}
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
      : // eslint-disable-next-line unicorn/no-instanceof-builtins
      typeof value === 'function' || value instanceof Function
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

    const ctor = proto.hasOwnProperty('constructor') && proto.constructor

    return (
      typeof ctor === 'function' &&
      Function.prototype.toString.call(ctor) === OBJECT_CONSTRUCTOR_STRING
    )
  }

  isJsonRpcRequest(value: any): boolean {
    return (
      typeof value === 'object' &&
      value &&
      'jsonrpc' in value &&
      this.isStringFilled(value.jsonrpc) &&
      'method' in value &&
      this.isStringFilled(value.method)
    )
  }

  isJsonRpcResponse(value: any): boolean {
    return (
      typeof value === 'object' &&
      value &&
      'jsonrpc' in value &&
      this.isStringFilled(value.jsonrpc) &&
      'id' in value &&
      ('result' in value || 'error' in value)
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
   * @returns {boolean}
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
    | Float64Array
  {
    const regExpTypedTag =
      /^\[object (?:Float(?:32|64)|(?:Int|Uint)(?:8|16|32)|Uint8Clamped)]$/
    return this.isObjectLike(value) && regExpTypedTag.test(this.getTag(value))
  }

  /**
   * Checks that value is Blob
   * @param value
   * @return {boolean}
   */
  isBlob(value: any): value is BlobLike {
    return (
      this.isObjectLike(value) &&
      this.isNumber((value as BlobLike).size) &&
      this.isString((value as BlobLike).type) &&
      this.isFunction((value as BlobLike).slice)
    )
  }

  /**
   * Checks that value is File
   * @param value
   * @return {boolean}
   */
  isFile(value: any): value is FileLike {
    return (
      this.isBlob(value) &&
      this.isString((value as FileLike).name) &&
      (this.isNumber((value as FileLike).lastModified) || this.isObjectLike((value as FileLike).lastModifiedDate))
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
          if (!obj.hasOwnProperty(i)) {
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

const Type = new TypeManager()

export default Type

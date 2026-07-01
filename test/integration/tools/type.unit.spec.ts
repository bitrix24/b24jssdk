import { describe, it, expect } from 'vitest'
import { Type } from '../../../packages/jssdk/src/'

describe('tools Type Manager', () => {
  describe('getTag()', () => {
    it('should return correct tag for objects', () => {
      expect(Type.getTag({})).toEqual('[object Object]')
      expect(Type.getTag([])).toEqual('[object Array]')
      expect(Type.getTag(null)).toEqual('[object Null]')
    })
  })

  describe('isString()', () => {
    it('should return true for strings', () => {
      expect(Type.isString('')).toBe(true)
      expect(Type.isString('text')).toBe(true)
      expect(Type.isString(String(''))).toBe(true)
    })

    it('should return false for non-strings', () => {
      expect(Type.isString(123)).toBe(false)
      expect(Type.isString(null)).toBe(false)
      expect(Type.isString(undefined)).toBe(false)
    })
  })

  describe('isStringFilled()', () => {
    it('should return true for non-empty strings', () => {
      expect(Type.isStringFilled('text')).toBe(true)
      expect(Type.isStringFilled(' ')).toBe(true)
    })

    it('should return false for empty or non-strings', () => {
      expect(Type.isStringFilled('')).toBe(false)
      expect(Type.isStringFilled(null)).toBe(false)
      expect(Type.isStringFilled(undefined)).toBe(false)
    })
  })

  describe('isFunction()', () => {
    it('should return true for functions', () => {
      expect(Type.isFunction(() => {})).toBe(true)
      expect(Type.isFunction(function () {})).toBe(true)
      // eslint-disable-next-line @typescript-eslint/no-extraneous-class
      expect(Type.isFunction(class {})).toBe(true)
    })

    it('should return false for non-functions', () => {
      expect(Type.isFunction({})).toBe(false)
      expect(Type.isFunction(null)).toBe(false)
    })
  })

  describe('isObject()', () => {
    it('should return true for objects and functions', () => {
      expect(Type.isObject({})).toBe(true)
      expect(Type.isObject(() => {})).toBe(true)
      expect(Type.isObject([])).toBe(true)
    })

    it('should return false for primitives and null', () => {
      expect(Type.isObject(null)).toBe(false)
      expect(Type.isObject(123)).toBe(false)
      expect(Type.isObject('text')).toBe(false)
    })
  })

  describe('isObjectLike()', () => {
    it('should return true for non-null objects', () => {
      expect(Type.isObjectLike({})).toBe(true)
      expect(Type.isObjectLike([])).toBe(true)
      expect(Type.isObjectLike(new Date())).toBe(true)
    })

    it('should return false for null and primitives', () => {
      expect(Type.isObjectLike(null)).toBe(false)
      expect(Type.isObjectLike(123)).toBe(false)
      expect(Type.isObjectLike(undefined)).toBe(false)
    })
  })

  describe('isPlainObject()', () => {
    it('should return true for plain objects', () => {
      expect(Type.isPlainObject({})).toBe(true)
      expect(Type.isPlainObject(Object.create(null))).toBe(true)
      expect(Type.isPlainObject(new Object())).toBe(true)
    })

    it('should return false for non-plain objects', () => {
      expect(Type.isPlainObject([])).toBe(false)
      expect(Type.isPlainObject(new Date())).toBe(false)
      expect(Type.isPlainObject(null)).toBe(false)
    })
  })

  describe('isJsonRpcRequest()', () => {
    it('should validate correct JSON-RPC requests', () => {
      const request = { jsonrpc: '2.0', method: 'test' }
      expect(Type.isJsonRpcRequest(request)).toBe(true)
    })

    it('should reject invalid requests', () => {
      expect(Type.isJsonRpcRequest({})).toBe(false)
      expect(Type.isJsonRpcRequest({ jsonrpc: '2.0' })).toBe(false)
      expect(Type.isJsonRpcRequest({ method: 'test' })).toBe(false)
    })
  })

  describe('isBoolean()', () => {
    it('should return true for booleans', () => {
      expect(Type.isBoolean(true)).toBe(true)
      expect(Type.isBoolean(false)).toBe(true)
    })

    it('should return false for non-booleans', () => {
      expect(Type.isBoolean(0)).toBe(false)
      expect(Type.isBoolean('true')).toBe(false)
      expect(Type.isBoolean(null)).toBe(false)
    })
  })

  describe('isNumber()', () => {
    it('should return true for valid numbers', () => {
      expect(Type.isNumber(42)).toBe(true)
      expect(Type.isNumber(0)).toBe(true)
      expect(Type.isNumber(-1.5)).toBe(true)
    })

    it('should return false for NaN and non-numbers', () => {
      expect(Type.isNumber(Number.NaN)).toBe(false)
      expect(Type.isNumber('123')).toBe(false)
      expect(Type.isNumber(undefined)).toBe(false)
    })
  })

  describe('isInteger()', () => {
    it('should return true for integers', () => {
      expect(Type.isInteger(42)).toBe(true)
      expect(Type.isInteger(0)).toBe(true)
      expect(Type.isInteger(-100)).toBe(true)
    })

    it('should return false for floats and non-numbers', () => {
      expect(Type.isInteger(42.5)).toBe(false)
      expect(Type.isInteger('42')).toBe(false)
      expect(Type.isInteger(Number.NaN)).toBe(false)
    })
  })

  describe('isNil()', () => {
    it('should return true for null and undefined', () => {
      expect(Type.isNil(null)).toBe(true)
      expect(Type.isNil(undefined)).toBe(true)
    })

    it('should return false for other values', () => {
      expect(Type.isNil(0)).toBe(false)
      expect(Type.isNil('')).toBe(false)
      expect(Type.isNil(false)).toBe(false)
    })
  })

  describe('isArray()', () => {
    it('should return true for arrays', () => {
      expect(Type.isArray([])).toBe(true)
      expect(Type.isArray([1, 2])).toBe(true)
    })

    it('should return false for array-like objects', () => {
      expect(Type.isArray({ length: 0 })).toBe(false)
      expect(Type.isArray('array')).toBe(false)
      expect(Type.isArray(null)).toBe(false)
    })
  })

  describe('isArrayFilled()', () => {
    it('should return true for non-empty arrays', () => {
      expect(Type.isArrayFilled([1])).toBe(true)
      expect(Type.isArrayFilled(['a', 'b'])).toBe(true)
    })

    it('should return false for empty arrays and non-arrays', () => {
      expect(Type.isArrayFilled([])).toBe(false)
      expect(Type.isArrayFilled({})).toBe(false)
      expect(Type.isArrayFilled(null)).toBe(false)
    })
  })

  describe('isArrayLike()', () => {
    it('should return true for array-like objects', () => {
      expect(Type.isArrayLike([])).toBe(true)
      expect(Type.isArrayLike({ length: 3 })).toBe(true)
      expect(Type.isArrayLike('string')).toBe(true)
    })

    it('should return false for non-array-like objects', () => {
      expect(Type.isArrayLike({})).toBe(false)
      expect(Type.isArrayLike(() => {})).toBe(false)
      expect(Type.isArrayLike(null)).toBe(false)
    })
  })

  describe('isDate()', () => {
    it('should return true for Date objects', () => {
      expect(Type.isDate(new Date())).toBe(true)
    })

    it('should return false for non-dates', () => {
      expect(Type.isDate(Date.now())).toBe(false)
      expect(Type.isDate('2023-01-01')).toBe(false)
      expect(Type.isDate(null)).toBe(false)
    })
  })

  describe('isBlob()', () => {
    it('should return true for Blob-like objects', () => {
      const blob = {
        size: 100,
        type: 'text/plain',
        slice: () => new Blob()
      }
      expect(Type.isBlob(blob)).toBe(true)
    })

    it('should return false for non-blob objects', () => {
      expect(Type.isBlob({})).toBe(false)
      expect(Type.isBlob(null)).toBe(false)
    })
  })

  describe('isFile()', () => {
    it('should return true for File-like objects', () => {
      const file = {
        name: 'test.txt',
        size: 100,
        type: 'text/plain',
        slice: () => new Blob(),
        lastModified: Date.now()
      }
      expect(Type.isFile(file)).toBe(true)
    })

    it('should return false for non-file objects', () => {
      const blob = {
        size: 100,
        type: 'text/plain',
        slice: () => new Blob()
      }
      expect(Type.isFile(blob)).toBe(false)
      expect(Type.isFile({})).toBe(false)
    })
  })

  describe('clone()', () => {
    it('should clone primitive values', () => {
      expect(Type.clone(42)).toBe(42)
      expect(Type.clone('text')).toBe('text')
      expect(Type.clone(null)).toBe(null)
    })

    it('should shallow clone objects', () => {
      const obj = { a: 1, b: { c: 2 } }
      const cloned = Type.clone(obj, false)

      expect(cloned).not.toBe(obj)
      expect(cloned.b).toBe(obj.b)
    })

    it('should deep clone objects', () => {
      const obj = { a: 1, b: { c: 2 } }
      const cloned = Type.clone(obj)

      expect(cloned).not.toBe(obj)
      expect(cloned.b).not.toBe(obj.b)
      expect(cloned).toEqual(obj)
    })

    it('should clone arrays', () => {
      const arr = [1, [2, 3]]
      const cloned = Type.clone(arr)

      expect(cloned).not.toBe(arr)
      expect(cloned[1]).not.toBe(arr[1])
      expect(cloned).toEqual(arr)
    })

    it('should clone dates', () => {
      const date = new Date()
      const cloned = Type.clone(date)

      expect(cloned).not.toBe(date)
      expect(cloned.getTime()).toBe(date.getTime())
    })
  })

  describe('isMap()', () => {
    it('should return true for Map instances', () => {
      expect(Type.isMap(new Map())).toBe(true)
    })

    it('should return false for non-map objects', () => {
      expect(Type.isMap({})).toBe(false)
    })
  })

  describe('isSet()', () => {
    it('should return true for Set instances', () => {
      expect(Type.isSet(new Set())).toBe(true)
    })

    it('should return false for non-set objects', () => {
      expect(Type.isSet({})).toBe(false)
    })
  })

  // @todo fix this - it was commented out
  describe('isFormData()', () => {
    it('should return true for FormData instances', () => {
      if (typeof FormData !== 'undefined') {
        expect(Type.isFormData(new FormData())).toBe(true)
      }

      const formDataLike = {
        [Symbol.toStringTag]: 'FormData'
      }
      Object.defineProperty(formDataLike, Symbol.toStringTag, {
        value: 'FormData',
        configurable: true
      })

      expect(Type.isFormData(formDataLike)).toBe(true)
    })

    it('should return false for non-formdata objects', () => {
      expect(Type.isFormData({})).toBe(false)
      expect(Type.isFormData(null)).toBe(false)
    })
  })
})

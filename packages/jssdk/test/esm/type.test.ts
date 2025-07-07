import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Type } from '../../dist/esm/index.mjs';

describe('TypeManager', () => {
  describe('getTag()', () => {
    it('should return correct tag for objects', () => {
      assert.equal(Type.getTag({}), '[object Object]');
      assert.equal(Type.getTag([]), '[object Array]');
      assert.equal(Type.getTag(null), '[object Null]');
    });
  });

  describe('isString()', () => {
    it('should return true for strings', () => {
      assert.equal(Type.isString(''), true);
      assert.equal(Type.isString('text'), true);
      assert.equal(Type.isString(String('')), true);
    });

    it('should return false for non-strings', () => {
      assert.equal(Type.isString(123), false);
      assert.equal(Type.isString(null), false);
      assert.equal(Type.isString(undefined), false);
    });
  });

  describe('isStringFilled()', () => {
    it('should return true for non-empty strings', () => {
      assert.equal(Type.isStringFilled('text'), true);
      assert.equal(Type.isStringFilled(' '), true);
    });

    it('should return false for empty or non-strings', () => {
      assert.equal(Type.isStringFilled(''), false);
      assert.equal(Type.isStringFilled(null), false);
      assert.equal(Type.isStringFilled(undefined), false);
    });
  });

  describe('isFunction()', () => {
    it('should return true for functions', () => {
      assert.equal(Type.isFunction(() => {}), true);
      assert.equal(Type.isFunction(function() {}), true);
      assert.equal(Type.isFunction(class {}), true);
    });

    it('should return false for non-functions', () => {
      assert.equal(Type.isFunction({}), false);
      assert.equal(Type.isFunction(null), false);
    });
  });

  describe('isObject()', () => {
    it('should return true for objects and functions', () => {
      assert.equal(Type.isObject({}), true);
      assert.equal(Type.isObject(() => {}), true);
      assert.equal(Type.isObject([]), true);
    });

    it('should return false for primitives and null', () => {
      assert.equal(Type.isObject(null), false);
      assert.equal(Type.isObject(123), false);
      assert.equal(Type.isObject('text'), false);
    });
  });

  describe('isObjectLike()', () => {
    it('should return true for non-null objects', () => {
      assert.equal(Type.isObjectLike({}), true);
      assert.equal(Type.isObjectLike([]), true);
      assert.equal(Type.isObjectLike(new Date()), true);
    });

    it('should return false for null and primitives', () => {
      assert.equal(Type.isObjectLike(null), false);
      assert.equal(Type.isObjectLike(123), false);
      assert.equal(Type.isObjectLike(undefined), false);
    });
  });

  describe('isPlainObject()', () => {
    it('should return true for plain objects', () => {
      assert.equal(Type.isPlainObject({}), true);
      assert.equal(Type.isPlainObject(Object.create(null)), true);
      assert.equal(Type.isPlainObject(new Object()), true);
    });

    it('should return false for non-plain objects', () => {
      assert.equal(Type.isPlainObject([]), false);
      assert.equal(Type.isPlainObject(new Date()), false);
      assert.equal(Type.isPlainObject(null), false);
    });
  });

  describe('isJsonRpcRequest()', () => {
    it('should validate correct JSON-RPC requests', () => {
      const request = { jsonrpc: '2.0', method: 'test' };
      assert.equal(Type.isJsonRpcRequest(request), true);
    });

    it('should reject invalid requests', () => {
      assert.equal(Type.isJsonRpcRequest({}), false);
      assert.equal(Type.isJsonRpcRequest({ jsonrpc: '2.0' }), false);
      assert.equal(Type.isJsonRpcRequest({ method: 'test' }), false);
    });
  });

  describe('isBoolean()', () => {
    it('should return true for booleans', () => {
      assert.equal(Type.isBoolean(true), true);
      assert.equal(Type.isBoolean(false), true);
    });

    it('should return false for non-booleans', () => {
      assert.equal(Type.isBoolean(0), false);
      assert.equal(Type.isBoolean('true'), false);
      assert.equal(Type.isBoolean(null), false);
    });
  });

  describe('isNumber()', () => {
    it('should return true for valid numbers', () => {
      assert.equal(Type.isNumber(42), true);
      assert.equal(Type.isNumber(0), true);
      assert.equal(Type.isNumber(-1.5), true);
    });

    it('should return false for NaN and non-numbers', () => {
      assert.equal(Type.isNumber(Number.NaN), false);
      assert.equal(Type.isNumber('123'), false);
      assert.equal(Type.isNumber(undefined), false);
    });
  });

  describe('isInteger()', () => {
    it('should return true for integers', () => {
      assert.equal(Type.isInteger(42), true);
      assert.equal(Type.isInteger(0), true);
      assert.equal(Type.isInteger(-100), true);
    });

    it('should return false for floats and non-numbers', () => {
      assert.equal(Type.isInteger(42.5), false);
      assert.equal(Type.isInteger('42'), false);
      assert.equal(Type.isInteger(Number.NaN), false);
    });
  });

  describe('isNil()', () => {
    it('should return true for null and undefined', () => {
      assert.equal(Type.isNil(null), true);
      assert.equal(Type.isNil(undefined), true);
    });

    it('should return false for other values', () => {
      assert.equal(Type.isNil(0), false);
      assert.equal(Type.isNil(''), false);
      assert.equal(Type.isNil(false), false);
    });
  });

  describe('isArray()', () => {
    it('should return true for arrays', () => {
      assert.equal(Type.isArray([]), true);
      assert.equal(Type.isArray([1, 2]), true);
    });

    it('should return false for array-like objects', () => {
      assert.equal(Type.isArray({ length: 0 }), false);
      assert.equal(Type.isArray('array'), false);
      assert.equal(Type.isArray(null), false);
    });
  });

  describe('isArrayFilled()', () => {
    it('should return true for non-empty arrays', () => {
      assert.equal(Type.isArrayFilled([1]), true);
      assert.equal(Type.isArrayFilled(['a', 'b']), true);
    });

    it('should return false for empty arrays and non-arrays', () => {
      assert.equal(Type.isArrayFilled([]), false);
      assert.equal(Type.isArrayFilled({}), false);
      assert.equal(Type.isArrayFilled(null), false);
    });
  });

  describe('isArrayLike()', () => {
    it('should return true for array-like objects', () => {
      assert.equal(Type.isArrayLike([]), true);
      assert.equal(Type.isArrayLike({ length: 3 }), true);
      assert.equal(Type.isArrayLike('string'), true);
    });

    it('should return false for non-array-like objects', () => {
      assert.equal(Type.isArrayLike({}), false);
      assert.equal(Type.isArrayLike(() => {}), false);
      assert.equal(Type.isArrayLike(null), false);
    });
  });

  describe('isDate()', () => {
    it('should return true for Date objects', () => {
      assert.equal(Type.isDate(new Date()), true);
    });

    it('should return false for non-dates', () => {
      assert.equal(Type.isDate(Date.now()), false);
      assert.equal(Type.isDate('2023-01-01'), false);
      assert.equal(Type.isDate(null), false);
    });
  });

  // describe('isDomNode()', () => {
  //   it('should return true for DOM-like nodes', () => {
  //     const node = { nodeType: 1 };
  //     assert.equal(Type.isDomNode(node), true);
  //   });
  //
  //   it('should return false for non-node objects', () => {
  //     assert.equal(Type.isDomNode({}), false);
  //     assert.equal(Type.isDomNode(null), false);
  //   });
  // });

  // describe('isElementNode()', () => {
  //   it('should return true for element nodes', () => {
  //     const element = { nodeType: Node.ELEMENT_NODE };
  //     assert.equal(Type.isElementNode(element), true);
  //   });
  //
  //   it('should return false for non-element nodes', () => {
  //     const textNode = { nodeType: Node.TEXT_NODE };
  //     assert.equal(Type.isElementNode(textNode), false);
  //     assert.equal(Type.isElementNode({ nodeType: 999 }), false);
  //   });
  // });

  describe('isBlob()', () => {
    it('should return true for Blob-like objects', () => {
      const blob = {
        size: 100,
        type: 'text/plain',
        slice: () => new Blob()
      };
      assert.equal(Type.isBlob(blob), true);
    });

    it('should return false for non-blob objects', () => {
      assert.equal(Type.isBlob({}), false);
      assert.equal(Type.isBlob(null), false);
    });
  });

  describe('isFile()', () => {
    it('should return true for File-like objects', () => {
      const file = {
        name: 'test.txt',
        size: 100,
        type: 'text/plain',
        slice: () => new Blob(),
        lastModified: Date.now()
      };
      assert.equal(Type.isFile(file), true);
    });

    it('should return false for non-file objects', () => {
      const blob = {
        size: 100,
        type: 'text/plain',
        slice: () => new Blob()
      };
      assert.equal(Type.isFile(blob), false);
      assert.equal(Type.isFile({}), false);
    });
  });

  describe('clone()', () => {
    it('should clone primitive values', () => {
      assert.equal(Type.clone(42), 42);
      assert.equal(Type.clone('text'), 'text');
      assert.equal(Type.clone(null), null);
    });

    it('should shallow clone objects', () => {
      const obj = { a: 1, b: { c: 2 } };
      const cloned = Type.clone(obj, false);

      assert.notEqual(cloned, obj);
      assert.equal(cloned.b, obj.b);
    });

    it('should deep clone objects', () => {
      const obj = { a: 1, b: { c: 2 } };
      const cloned = Type.clone(obj);

      assert.notEqual(cloned, obj);
      assert.notEqual(cloned.b, obj.b);
      assert.deepEqual(cloned, obj);
    });

    it('should clone arrays', () => {
      const arr = [1, [2, 3]];
      const cloned = Type.clone(arr);

      assert.notEqual(cloned, arr);
      assert.notEqual(cloned[1], arr[1]);
      assert.deepEqual(cloned, arr);
    });

    it('should clone dates', () => {
      const date = new Date();
      const cloned = Type.clone(date);

      assert.notEqual(cloned, date);
      assert.equal(cloned.getTime(), date.getTime());
    });
  });

  // Дополнительные тесты для остальных методов...
  describe('isMap()', () => {
    it('should return true for Map instances', () => {
      assert.equal(Type.isMap(new Map()), true);
    });

    it('should return false for non-map objects', () => {
      assert.equal(Type.isMap({}), false);
    });
  });

  describe('isSet()', () => {
    it('should return true for Set instances', () => {
      assert.equal(Type.isSet(new Set()), true);
    });

    it('should return false for non-set objects', () => {
      assert.equal(Type.isSet({}), false);
    });
  });

  // describe('isFormData()', () => {
  //   it('should return true for FormData instances', () => {
  //     if (typeof FormData !== 'undefined') {
  //       assert.equal(Type.isFormData(new FormData()), true);
  //     }
  //
  //     const formDataLike = {
  //       [Symbol.toStringTag]: 'FormData'
  //     };
  //     Object.defineProperty(formDataLike, Symbol.toStringTag, {
  //       value: 'FormData',
  //       configurable: true
  //     });
  //
  //     assert.equal(Type.isFormData(formDataLike), true);
  //   });
  //
  //   it('should return false for non-formdata objects', () => {
  //     assert.equal(Type.isFormData({}), false);
  //     assert.equal(Type.isFormData(null), false);
  //   });
  // });
});

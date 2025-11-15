---
outline: deep
---
# `Type` {#Type}

The `Type` object of the `TypeManager` class is designed to check and determine various data types in JavaScript. It provides methods for checking primitive types, objects, arrays, DOM nodes, and other data structures.

```ts
import { Type, LoggerBrowser } from '@bitrix24/b24jssdk'

const $logger = LoggerBrowser.build('Test', import.meta.env?.DEV === true)
const testString: any = undefined

$logger.info('isStringFilled:', Type.isStringFilled(testString), testString)
// isStringFilled: false undefined ////
```

## Methods {#methods}

### `getTag`
```ts
getTag(value: any): string
```
Returns a string representation of the object's type using the `Object.prototype.toString` method.

### `isString`
```ts
isString(value: any): boolean
```
Checks if the value is a string.

### `isStringFilled`
```ts
isStringFilled(value: any): boolean
```
Returns `true` if the value is a non-empty string.

### `isFunction`
```ts
isFunction(value: any): boolean
```
Checks if the value is a function.

### `isObject`
```ts
isObject(value: any): boolean
```
Checks if the value is an object or a function.

### `isObjectLike`
```ts
isObjectLike(value: any): boolean
```
Checks if the value is object-like (not `null` and of type `object`).

### `isPlainObject`
```ts
isPlainObject(value: any): boolean
```
Checks if the value is a plain object (created via `{}` or `new Object()`).

### `isJsonRpcRequest`
```ts
isJsonRpcRequest(value: any): boolean
```
Checks if the value is a JSON-RPC request.

### `isJsonRpcResponse`
```ts
isJsonRpcResponse(value: any): boolean
```
Checks if the value is a JSON-RPC response.

### `isBoolean`
```ts
isBoolean(value: any): boolean
```
Checks if the value is a boolean.

### `isNumber`
```ts
isNumber(value: any): boolean
```
Checks if the value is a number.

### `isInteger`
```ts
isInteger(value: any): boolean
```
Checks if the value is an integer.

### `isFloat`
```ts
isFloat(value: any): boolean
```
Checks if the value is a floating-point number.

### `isNil`
```ts
isNil(value: any): boolean
```
Checks if the value is `null` or `undefined`.

### `isArray`
```ts
isArray(value: any): boolean
```
Checks if the value is an array.

### `isArrayFilled`
```ts
isArrayFilled(value: any): boolean
```
Returns `true` if the value is an array and contains at least one element.

### `isArrayLike`
```ts
isArrayLike(value: any): boolean
```
Checks if the value is array-like (has a `length` property).

### `isDate`
```ts
isDate(value: any): boolean
```
Checks if the value is a `Date` object.

### `isDomNode`
```ts
isDomNode(value: any): boolean
```
Checks if the value is a DOM node.

### `isElementNode`
```ts
isElementNode(value: any): boolean
```
Checks if the value is a DOM element.

### `isTextNode`
```ts
isTextNode(value: any): boolean
```
Checks if the value is a DOM text node.

### `isMap`
```ts
isMap(value: any): boolean
```
Checks if the value is a `Map` object.

### `isSet`
```ts
isSet(value: any): boolean
```
Checks if the value is a `Set` object.

### `isWeakMap`
```ts
isWeakMap(value: any): boolean
```
Checks if the value is a `WeakMap` object.

### `isWeakSet`
```ts
isWeakSet(value: any): boolean
```
Checks if the value is a `WeakSet` object.

### `isPrototype`
```ts
isPrototype(value: any): boolean
```
Checks if the value is a prototype.

### `isRegExp`
```ts
isRegExp(value: any): boolean
```
Checks if the value is a regular expression.

### `isNull`
```ts
isNull(value: any): boolean
```
Checks if the value is `null`.

### `isUndefined`
```ts
isUndefined(value: any): boolean
```
Checks if the value is `undefined`.

### `isArrayBuffer`
```ts
isArrayBuffer(value: any): boolean
```
Checks if the value is an `ArrayBuffer` object.

### `isTypedArray`
```ts
isTypedArray(value: any): boolean
```
Checks if the value is a typed array.

### `isBlob`
```ts
isBlob(value: any): boolean
```
Checks if the value is a `Blob` object.

### `isFile`
```ts
isFile(value: any): boolean
```
Checks if the value is a `File` object.

### `isFormData`
```ts
isFormData(value: any): boolean
```
Checks if the value is a `FormData` object.

### `clone` {#clone}
```ts
clone(
	obj: any,
	bCopyObj: boolean = true
): any
```
Clones an object, creating a deep copy if `bCopyObj` is `true`.
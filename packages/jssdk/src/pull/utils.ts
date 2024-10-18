export const Utils = {
	browser: {
		IsChrome: function () {
			return navigator.userAgent.toLowerCase().indexOf('chrome') != -1;
		},
		IsFirefox: function () {
			return navigator.userAgent.toLowerCase().indexOf('firefox') != -1;
		},
		IsIe: function () {
			return navigator.userAgent.match(/(Trident\/|MSIE\/)/) !== null;
		}
	},
	getTimestamp: function () {
		return (new Date()).getTime();
	},
	/**
	 * Reduces errors array to single string.
	 * @param {array} errors
	 * @return {string}
	 */
	errorsToString: function (errors) {
		if (!this.isArray(errors))
		{
			return "";
		}
		else
		{
			return errors.reduce(function (result, currentValue) {
				if (result != "")
				{
					result += "; ";
				}
				return result + currentValue.code + ": " + currentValue.message;
			}, "");
		}
	},
	isString: function (item) {
		return item === '' ? true : (item ? (typeof (item) == "string" || item instanceof String) : false);
	},
	isArray: function (item) {
		return item && Object.prototype.toString.call(item) == "[object Array]";
	},
	isFunction: function (item) {
		return item === null ? false : (typeof (item) == "function" || item instanceof Function);
	},
	isDomNode: function (item) {
		return item && typeof (item) == "object" && "nodeType" in item;
	},
	isDate: function (item) {
		return item && Object.prototype.toString.call(item) == "[object Date]";
	},
	isPlainObject: function (item) {
		if (!item || typeof (item) !== "object" || item.nodeType)
		{
			return false;
		}
		
		const hasProp = Object.prototype.hasOwnProperty;
		try
		{
			if (item.constructor && !hasProp.call(item, "constructor") && !hasProp.call(item.constructor.prototype, "isPrototypeOf"))
			{
				return false;
			}
		} catch (e)
		{
			return false;
		}
		
		let key;
		for (key in item)
		{
		}
		return typeof (key) === "undefined" || hasProp.call(item, key);
	},
	isNotEmptyString: function (item) {
		return this.isString(item) ? item.length > 0 : false;
	},
	isJsonRpcRequest: function (item) {
		return (
			typeof (item) === "object"
			&& item
			&& "jsonrpc" in item
			&& Utils.isNotEmptyString(item.jsonrpc)
			&& "method" in item
			&& Utils.isNotEmptyString(item.method)
		);
	},
	isJsonRpcResponse: function (item) {
		return (
			typeof (item) === "object"
			&& item
			&& "jsonrpc" in item
			&& Utils.isNotEmptyString(item.jsonrpc)
			&& "id" in item
			&& (
				"result" in item
				|| "error" in item
			)
		);
		
	},
	buildQueryString: function (params) {
		let result = '';
		for (let key in params)
		{
			if (!params.hasOwnProperty(key))
			{
				continue;
			}
			const value = params[key];
			if (Utils.isArray(value))
			{
				value.forEach((valueElement, index) => {
					result += encodeURIComponent(key + "[" + index + "]") + "=" + encodeURIComponent(valueElement) + "&";
				});
			}
			else
			{
				result += encodeURIComponent(key) + "=" + encodeURIComponent(value) + "&";
			}
		}
		
		if (result.length > 0)
		{
			result = result.substr(0, result.length - 1);
		}
		
		return result;
	},
	objectValues: function values(obj) {
		let result = [];
		for (let key in obj)
		{
			if (obj.hasOwnProperty(key) && obj.propertyIsEnumerable(key))
			{
				result.push(obj[key]);
			}
		}
		return result;
	},
	clone: function (obj, bCopyObj) {
		let _obj, i, l;
		if (bCopyObj !== false)
		{
			bCopyObj = true;
		}
		
		if (obj === null)
		{
			return null;
		}
		
		if (this.isDomNode(obj))
		{
			_obj = obj.cloneNode(bCopyObj);
		}
		else if (typeof obj == 'object')
		{
			if (this.isArray(obj))
			{
				_obj = [];
				for (i = 0, l = obj.length; i < l; i++)
				{
					if (typeof obj[i] == "object" && bCopyObj)
					{
						_obj[i] = this.clone(obj[i], bCopyObj);
					}
					else
					{
						_obj[i] = obj[i];
					}
				}
			}
			else
			{
				_obj = {};
				if (obj.constructor)
				{
					if (this.isDate(obj))
					{
						_obj = new Date(obj);
					}
					else
					{
						_obj = new obj.constructor();
					}
				}
				
				for (i in obj)
				{
					if (!obj.hasOwnProperty(i))
					{
						continue;
					}
					if (typeof obj[i] == "object" && bCopyObj)
					{
						_obj[i] = this.clone(obj[i], bCopyObj);
					}
					else
					{
						_obj[i] = obj[i];
					}
				}
			}
			
		}
		else
		{
			_obj = obj;
		}
		
		return _obj;
	},
}
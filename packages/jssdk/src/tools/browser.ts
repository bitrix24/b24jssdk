import Type from './type'

const UA = navigator.userAgent.toLowerCase()

/**
 * @see bitrix/js/main/core/src/lib/browser.js
 */
export default class Browser
{
	static isOpera(): boolean
	{
		return UA.includes('opera')
	}

	static isIE(): boolean
	{
		return ('attachEvent' in document) && !Browser.isOpera()
	}

	static isIE6(): boolean
	{
		return UA.includes('msie 6')
	}

	static isIE7(): boolean
	{
		return UA.includes('msie 7')
	}

	static isIE8(): boolean
	{
		return UA.includes('msie 8')
	}

	static isIE9(): boolean
	{
		// @ts-ignore ////
		return ('documentMode' in document) && document.documentMode >= 9
	}

	static isIE10(): boolean
	{
		// @ts-ignore ////
		return ('documentMode' in document) && document.documentMode >= 10
	}

	static isSafari(): boolean
	{
		return UA.includes('safari') && !UA.includes('chrome')
	}

	static isFirefox()
	{
		return UA.includes('firefox')
	}

	static isChrome()
	{
		return UA.includes('chrome')
	}

	static detectIEVersion()
	{
		if (Browser.isOpera() || Browser.isSafari() || Browser.isFirefox() || Browser.isChrome())
		{
			return -1
		}

		let rv = -1

		if (
			// @ts-ignore ////
			!!(window.MSStream)
			// @ts-ignore ////
			&& !(window.ActiveXObject)
			&& ('ActiveXObject' in window)
		)
		{
			rv = 11
		}
		else if (Browser.isIE10())
		{
			rv = 10
		}
		else if (Browser.isIE9())
		{
			rv = 9
		}
		else if (Browser.isIE())
		{
			rv = 8
		}

		if (rv === -1 || rv === 8)
		{
			// @ts-ignore ////
			if (navigator.appName === 'Microsoft Internet Explorer')
			{
				const re = new RegExp('MSIE ([0-9]+[.0-9]*)')
				const res = navigator.userAgent.match(re)
				
				// @ts-ignore ////
				if (Type.isArrayLike(res) && res.length > 0)
				{
					// @ts-ignore ////
					rv = parseFloat(res[1])
				}
			}
			
			// @ts-ignore ////
			if (navigator.appName === 'Netscape')
			{
				// Alternative check for IE 11
				rv = 11;
				const re = new RegExp('Trident/.*rv:([0-9]+[.0-9]*)')

				if (re.exec(navigator.userAgent) != null)
				{
					const res = navigator.userAgent.match(re)
					
					// @ts-ignore ////
					if (Type.isArrayLike(res) && res.length > 0)
					{
						// @ts-ignore ////
						rv = parseFloat(res[1])
					}
				}
			}
		}

		return rv
	}

	static isIE11(): boolean
	{
		return Browser.detectIEVersion() >= 11
	}

	static isMac(): boolean
	{
		return UA.includes('macintosh')
	}

	static isWin(): boolean
	{
		return UA.includes('windows')
	}

	static isLinux(): boolean
	{
		return UA.includes('linux') && !Browser.isAndroid()
	}

	static isAndroid(): boolean
	{
		return UA.includes('android')
	}

	static isIPad(): boolean
	{
		return UA.includes('ipad;') || (this.isMac() && this.isTouchDevice())
	}

	static isIPhone(): boolean
	{
		return UA.includes('iphone;')
	}

	static isIOS(): boolean
	{
		return Browser.isIPad() || Browser.isIPhone()
	}

	static isMobile(): boolean
	{
		return (
			Browser.isIPhone()
			|| Browser.isIPad()
			|| Browser.isAndroid()
			|| UA.includes('mobile')
			|| UA.includes('touch')
		);
	}

	static isRetina(): boolean
	{
		return (window.devicePixelRatio && window.devicePixelRatio >= 2) === true
	}

	static isTouchDevice(): boolean
	{
		return (
			('ontouchstart' in window)
			|| navigator.maxTouchPoints > 0
			// @ts-ignore ////
			|| navigator.msMaxTouchPoints > 0
		);
	}

	static isDoctype(target: any): boolean
	{
		const doc = target || document

		if (doc.compatMode)
		{
			return (doc.compatMode === 'CSS1Compat')
		}

		return (doc.documentElement && doc.documentElement.clientHeight)
	}

	static isLocalStorageSupported(): boolean
	{
		try
		{
			localStorage.setItem('test', 'test')
			localStorage.removeItem('test');
			return true;
		}
		catch (error)
		{
			return false
		}
	}
	
	static detectAndroidVersion(): number
	{
		const re = new RegExp('Android ([0-9]+[.0-9]*)')

		if (re.exec(navigator.userAgent) != null)
		{
			const res = navigator.userAgent.match(re)

			// @ts-ignore ////
			if (Type.isArrayLike(res) && res.length > 0)
			{
				// @ts-ignore ////
				return parseFloat(res[1])
			}
		}

		return 0;
	}
}
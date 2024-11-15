import Type from './type'

let UA: string = ''
try
{
	UA = navigator?.userAgent.toLowerCase()
}
catch  {
	UA = '?'
}

/**
 * @see bitrix/js/main/core/src/lib/browser.js
 */
class BrowserManager
{
	isOpera(): boolean
	{
		return UA.includes('opera')
	}

	isIE(): boolean
	{
		return ('attachEvent' in document) && !this.isOpera()
	}

	isIE6(): boolean
	{
		return UA.includes('msie 6')
	}

	isIE7(): boolean
	{
		return UA.includes('msie 7')
	}

	isIE8(): boolean
	{
		return UA.includes('msie 8')
	}

	isIE9(): boolean
	{
		// @ts-ignore ////
		return ('documentMode' in document) && document.documentMode >= 9
	}

	isIE10(): boolean
	{
		// @ts-ignore ////
		return ('documentMode' in document) && document.documentMode >= 10
	}

	isSafari(): boolean
	{
		return UA.includes('safari') && !UA.includes('chrome')
	}

	isFirefox()
	{
		return UA.includes('firefox')
	}

	isChrome()
	{
		return UA.includes('chrome')
	}

	detectIEVersion()
	{
		if (this.isOpera() || this.isSafari() || this.isFirefox() || this.isChrome())
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
		else if (this.isIE10())
		{
			rv = 10
		}
		else if (this.isIE9())
		{
			rv = 9
		}
		else if (this.isIE())
		{
			rv = 8
		}

		if (rv === -1 || rv === 8)
		{
			// @ts-ignore ////
			if (navigator.appName === 'Microsoft Internet Explorer')
			{
				// eslint-disable-next-line
				const re = new RegExp('MSIE ([0-9]+[.0-9]*)')
				const res = navigator.userAgent.match(re)
				
				// @ts-ignore ////
				if (Type.isArrayLike(res) && res.length > 0)
				{
					// @ts-ignore ////
					rv = Number.parseFloat(res[1])
				}
			}
			
			// @ts-ignore ////
			if (navigator.appName === 'Netscape')
			{
				// Alternative check for IE 11
				rv = 11
				// eslint-disable-next-line
				const re = new RegExp('Trident/.*rv:([0-9]+[.0-9]*)')

				if (re.exec(navigator.userAgent) != null)
				{
					const res = navigator.userAgent.match(re)
					
					// @ts-ignore ////
					if (Type.isArrayLike(res) && res.length > 0)
					{
						// @ts-ignore ////
						rv = Number.parseFloat(res[1])
					}
				}
			}
		}

		return rv
	}

	isIE11(): boolean
	{
		return this.detectIEVersion() >= 11
	}

	isMac(): boolean
	{
		return UA.includes('macintosh')
	}

	isWin(): boolean
	{
		return UA.includes('windows')
	}

	isLinux(): boolean
	{
		return UA.includes('linux') && !this.isAndroid()
	}

	isAndroid(): boolean
	{
		return UA.includes('android')
	}

	isIPad(): boolean
	{
		return UA.includes('ipad;') || (this.isMac() && this.isTouchDevice())
	}

	isIPhone(): boolean
	{
		return UA.includes('iphone;')
	}

	isIOS(): boolean
	{
		return this.isIPad() || this.isIPhone()
	}

	isMobile(): boolean
	{
		return (
			this.isIPhone()
			|| this.isIPad()
			|| this.isAndroid()
			|| UA.includes('mobile')
			|| UA.includes('touch')
		);
	}

	isRetina(): boolean
	{
		return (window.devicePixelRatio && window.devicePixelRatio >= 2) === true
	}

	isTouchDevice(): boolean
	{
		return (
			('ontouchstart' in window)
			|| navigator.maxTouchPoints > 0
			// @ts-ignore ////
			|| navigator.msMaxTouchPoints > 0
		);
	}

	isDoctype(target: any): boolean
	{
		const doc = target || document

		if (doc.compatMode)
		{
			return (doc.compatMode === 'CSS1Compat')
		}

		return (doc.documentElement && doc.documentElement.clientHeight)
	}

	isLocalStorageSupported(): boolean
	{
		try
		{
			localStorage.setItem('test', 'test')
			localStorage.removeItem('test');
			return true;
		}
		catch {
			return false
		}
	}
	
	detectAndroidVersion(): number
	{
		// eslint-disable-next-line
		const re = new RegExp('Android ([0-9]+[.0-9]*)')

		if (re.exec(navigator.userAgent) != null)
		{
			const res = navigator.userAgent.match(re)

			// @ts-ignore ////
			if (Type.isArrayLike(res) && res.length > 0)
			{
				// @ts-ignore ////
				return Number.parseFloat(res[1])
			}
		}

		return 0;
	}
}

const Browser = new BrowserManager()

export default Browser
import { B24LangList } from "../core/language/list";
import type {
	B24FrameQueryParams,
	MessageInitData
} from "../types/auth";

/**
 * Application Frame Data Manager
 */
export class AppFrame
{
	#domain: string = '';
	#protocol: boolean = true;
	#appSid: null|string = null;
	#path: null|string = null;
	#lang: null|string = null;
	
	constructor(queryParams: B24FrameQueryParams)
	{
		if(queryParams.DOMAIN)
		{
			this.#domain = queryParams.DOMAIN;
			this.#domain = this.#domain.replace(/:(80|443)$/, '');
		}
		
		this.#protocol = (queryParams.PROTOCOL === true);
		
		if(queryParams.LANG)
		{
			this.#lang = queryParams.LANG;
		}
		
		if(queryParams.APP_SID)
		{
			this.#appSid = queryParams.APP_SID;
		}
	}
	
	/**
	 * Initializes the data received from the parent window message.
	 * @param data
	 */
	initData(data: MessageInitData): AppFrame
	{
		if(!this.#domain)
		{
			this.#domain = data.DOMAIN;
		}
		
		if(!this.#path)
		{
			this.#path = data.PATH;
		}
		
		if(!this.#lang)
		{
			this.#lang = data.LANG;
		}
		
		this.#protocol = parseInt(data.PROTOCOL) === 1;
		this.#domain = this.#domain.replace(/:(80|443)$/, '');
		
		return this;
	}
	
	/**
	 * Returns the sid of the application relative to the parent window like this `9c33468728e1d2c8c97562475edfd96`
	 */
	getAppSid(): string
	{
		if(null === this.#appSid)
		{
			throw new Error(`Not init appSid`);
		}
		
		return this.#appSid;
	}
	
	/**
	 * Get the account address BX24 ( https://name.bitrix24.com )
	 */
	getTargetOrigin(): string
	{
		return `${this.#protocol ? 'https' : 'http'}://${this.#domain}`;
	}
	
	/**
	 * Get the account address BX24 with Path ( https://name.bitrix24.com/rest )
	 */
	getTargetOriginWithPath(): string
	{
		return this.getTargetOrigin() + (this.#path ?? '');
	}
	
	/**
	 * Returns the localization of the B24 interface
	 * @return {B24LangList} - default B24LangList.en
	 *
	 * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-get-lang.html
	 */
	getLang(): B24LangList
	{
		return (this.#lang as B24LangList) || B24LangList.en;
	}
}
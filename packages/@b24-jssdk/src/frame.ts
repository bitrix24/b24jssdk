import type { B24FrameQueryParams, MessageInitData } from "./types/auth";
import { B24LangList } from "./language/list";

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
	 * Returns the sid of the application relative to the parent window
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
	 * Returns the URL of the parent window (B24)
	 */
	getTargetOrigin(): string
	{
		return `${this.#protocol ? 'https' : 'http'}://${this.#domain}`;
	}
	
	getTargetOriginWithPath(): string
	{
		return this.getTargetOrigin() + (this.#path ?? '');
	}
	
	/**
	 * Returns the localization of the B24 interface
	 */
	getLang(): B24LangList
	{
		return (this.#lang as B24LangList) || B24LangList.en;
	}
}
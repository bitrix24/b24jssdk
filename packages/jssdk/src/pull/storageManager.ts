import type { StorageManagerParams } from '../types/pull'

export class StorageManager
{
	private readonly userId: number
	private readonly siteId: string
	
	constructor(params: StorageManagerParams)
	{
		params = params || {};
		
		this.userId = params.userId ? params.userId : 0
		this.siteId = params.siteId ? params.siteId : 'none'
	}
	
	set(
		name: string,
		value: any
	): void
	{
		if (typeof window.localStorage === 'undefined')
		{
			console.error('undefined window.localStorage')
			return
		}
		
		if (typeof value != 'string')
		{
			if(value)
			{
				value = JSON.stringify(value);
			}
		}
		
		window.localStorage.setItem(
			this.getKey(name),
			value
		)
	}
	
	get(
		name: string,
		defaultValue: any
	): any
	{
		if (typeof window.localStorage === 'undefined')
		{
			return defaultValue || null;
		}
		
		const result = window.localStorage.getItem(this.getKey(name))
		if(result === null)
		{
			return defaultValue || null
		}
		
		return JSON.parse(result)
	}
	
	remove(name: string): void
	{
		if (typeof window.localStorage === 'undefined')
		{
			console.error('undefined window.localStorage')
			return
		}
		
		return window.localStorage.removeItem(
			this.getKey(name)
		)
	}
	
	getKey(name: string): string
	{
		return `@bitrix24/b24jssdk-pull-${this.userId}-${this.siteId}-${name}`
	}
	
	compareKey(
		eventKey: string,
		userKey: string
	): boolean
	{
		return eventKey === this.getKey(userKey)
	}
}
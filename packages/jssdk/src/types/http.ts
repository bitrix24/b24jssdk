import { LoggerBrowser } from '../logger/browser'
import { Result } from '../core/result'
import { AjaxResult } from '../core/http/ajaxResult'

export type TypeHttp = {
	setLogger(logger: LoggerBrowser): void
	getLogger(): LoggerBrowser
	
	batch(
		calls: any[]|object,
		isHaltOnError: boolean
	): Promise<Result>
	
	call(
		method: string,
		params: {},
		start: number
	): Promise<AjaxResult>
	
	setRestrictionManagerParams(params: TypeRestrictionManagerParams): void
	
	getRestrictionManagerParams(): TypeRestrictionManagerParams
	
	setLogTag(logTag?: string): void
	clearLogTag(): void
}

export type TypeRestrictionManagerParams = {
	sleep: number
	speed: number
	amount: number
}

export const RestrictionManagerParamsBase = {
	sleep: 1_000,
	speed: 0.001,
	amount: 30
} as TypeRestrictionManagerParams

/**
 * @todo Need test
 */
export const RestrictionManagerParamsForEnterprise = {
	sleep: 600,
	speed: 0.01,
	amount: 30 * 5
} as TypeRestrictionManagerParams
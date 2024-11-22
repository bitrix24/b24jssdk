import { LoggerBrowser, LoggerType } from '../../logger/browser'
import type { TypeHttp, TypeRestrictionManagerParams } from '../../types/http'
import { default as RestrictionManager } from './restriction-manager'
import { default as RequestIdGenerator } from './request-id-generator'
import { Result } from '../result'
import { AjaxError, type AjaxErrorParams } from './ajax-error'
import { AjaxResult } from './ajax-result'
import Type from '../../tools/type'
import type { AjaxQuery, AjaxResultParams } from './ajax-result'
import type {
	AuthActions,
	AuthData,
	TypeDescriptionError,
} from '../../types/auth'
import type { BatchPayload } from '../../types/payloads'

import axios, { type AxiosInstance, AxiosError } from 'axios'
import * as qs from 'qs-esm'

type AjaxResponse = {
	status: number
	payload: AjaxResultParams
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const BITRIX24_OAUTH_SERVER_URL = 'https://oauth.bitrix.info'

/**
 * Class for working with RestApi requests via http
 *
 * @link https://dev.1c-bitrix.ru/rest_help/
 */
export default class Http implements TypeHttp {
	#clientAxios: AxiosInstance
	#authActions: AuthActions
	#restrictionManager: RestrictionManager
	#requestIdGenerator: RequestIdGenerator
	private _logger: null | LoggerBrowser = null
	private _loggerSystem: null | LoggerBrowser = null

	#logTag: string = ''
	#isClientSideWarning: boolean = false
	#clientSideWarningMessage: string = ''

	constructor(
		baseURL: string,
		authActions: AuthActions,
		options?: null | object
	) {
		/**
		 * @memo can be added on the server side
		 */
		/*/
			headers: {
				'User-Agent': '__SDK_USER_AGENT__-v-__SDK_VERSION__',
				'X-BITRIX24-JS-SDK-VERSION': '__SDK_VERSION__',
			},
		//*/
		this.#clientAxios = axios.create({
			baseURL: baseURL,
			...options,
		})

		this.#authActions = authActions
		this.#restrictionManager = new RestrictionManager()
		this.#requestIdGenerator = new RequestIdGenerator()
	}
	
	// region Logger ////
	setLogger(logger: LoggerBrowser): void {
		this._logger = logger
		this.#restrictionManager.setLogger(this.getLogger())
	}

	getLogger(): LoggerBrowser {
		if (null === this._logger) {
			this._logger = LoggerBrowser.build(`NullLogger`)

			this._logger.setConfig({
				[LoggerType.desktop]: false,
				[LoggerType.log]: false,
				[LoggerType.info]: false,
				[LoggerType.warn]: false,
				[LoggerType.error]: true,
				[LoggerType.trace]: false,
			})
		}

		return this._logger
	}
	
	getSystemLogger(): LoggerBrowser {
		if (null === this._loggerSystem) {
			this._loggerSystem = LoggerBrowser.build(`SystemLogger`)

			this._loggerSystem.setConfig({
				[LoggerType.desktop]: false,
				[LoggerType.log]: false,
				[LoggerType.info]: true,
				[LoggerType.warn]: true,
				[LoggerType.error]: true,
				[LoggerType.trace]: false,
			})
		}

		return this._loggerSystem
	}
	// endregion ////
	
	// region RestrictionManager ////
	setRestrictionManagerParams(params: TypeRestrictionManagerParams): void {
		this.#restrictionManager.params = params
	}

	getRestrictionManagerParams(): TypeRestrictionManagerParams {
		return this.#restrictionManager.params
	}
	// endregion ////
	
	// region LogTag ////
	setLogTag(logTag: string): void {
		this.#logTag = logTag
	}

	clearLogTag(): void {
		this.#logTag = ''
	}
	// endregion ////
	
	// region Actions Call ////
	async batch(
		calls: any[] | object,
		isHaltOnError: boolean = true
	): Promise<Result> {
		const isArrayMode = Array.isArray(calls)
		const cmd: any = isArrayMode ? [] : {}
		let cnt = 0

		const processRow = (row: any, index: string | number) => {
			let method = null
			let params = null

			if (Array.isArray(row)) {
				method = row[0]
				params = row[1]
			} else if (row.method) {
				method = row.method
				params = row.params
			}

			if (method) {
				cnt++

				const data = method + '?' + qs.stringify(params)
				if (isArrayMode || Array.isArray(cmd)) {
					cmd.push(data)
				} else {
					cmd[index] = data
				}
			}
		}

		if (isArrayMode) {
			for (const [index, item] of calls.entries()) processRow(item, index)
		} else {
			for (const [index, item] of Object.entries(calls)) processRow(item, index)
		}

		if (cnt < 1) {
			return Promise.resolve(new Result())
		}

		return this.call('batch', {
			halt: isHaltOnError ? 1 : 0,
			cmd: cmd,
		}).then((response: AjaxResult) => {
			const responseResult = (response.getData() as BatchPayload<unknown>)
				.result
			const results: any = isArrayMode ? [] : {}

			const processResponse = (row: string, index: string | number) => {
				if (
					// @ts-ignore
					typeof responseResult.result[index] !== 'undefined' ||
					// @ts-ignore
					typeof responseResult.result_error[index] !== 'undefined'
				) {
					const q = row.split('?')

					const data = new AjaxResult(
						{
							// @ts-ignore
							result: Type.isUndefined(responseResult.result[index])
								? // @ts-ignore
									{}
								: // @ts-ignore
									responseResult.result[index],
							// @ts-ignore
							error: responseResult?.result_error[index] || undefined,
							// @ts-ignore
							total: responseResult.result_total[index],
							// @ts-ignore
							next: responseResult.result_next[index],
						},
						{
							method: q[0] || '',
							params: qs.parse(q[1] || ''),
							start: 0,
						} as AjaxQuery,
						response.getStatus()
					)

					if (isArrayMode || Array.isArray(results)) {
						results.push(data)
					} else {
						results[index] = data
					}
				}
			}

			if (Array.isArray(cmd)) {
				for (const [index, item] of cmd.entries()) processResponse(item, index)
			} else {
				for (const [index, item] of Object.entries(cmd))
					processResponse(item as string, index)
			}

			let dataResult

			const initError = (result: AjaxResult): AjaxError => {
				return new AjaxError({
					status: 0,
					answerError: {
						error: result.getErrorMessages().join('; '),
						errorDescription: `batch ${result.getQuery().method}: ${qs.stringify(result.getQuery().params, { encode: false })}`,
					},
					cause: result.getErrors().next().value,
				})
			}

			const result = new Result()

			if (isArrayMode || Array.isArray(results)) {
				dataResult = []

				for (const data of results as AjaxResult[]) {
					if (data.getStatus() !== 200 || !data.isSuccess) {
						const error = initError(data)

						if (!isHaltOnError && !data.isSuccess) {
							result.addError(error)
							continue
						}

						return Promise.reject(error)
					}

					dataResult.push(data.getData().result)
				}
			} else {
				dataResult = {}

				for (const key of Object.keys(results)) {
					const data: AjaxResult = results[key]

					if (data.getStatus() !== 200 || !data.isSuccess) {
						const error = initError(data)

						if (!isHaltOnError && !data.isSuccess) {
							result.addError(error)
							continue
						}

						return Promise.reject(error)
					}

					// @ts-ignore
					dataResult[key] = data.getData().result
				}
			}

			result.setData(dataResult)

			return Promise.resolve(result)
		})
	}

	/**
	 * Calling the RestApi function
	 *
	 * If we get a problem with authorization, we make one attempt to update the access token
	 *
	 * @param method
	 * @param params
	 * @param start
	 */
	async call(
		method: string,
		params: object,
		start: number = 0
	): Promise<AjaxResult> {
		let authData = this.#authActions.getAuthData()
		if (authData === false) {
			authData = await this.#authActions.refreshAuth()
		}

		await this.#restrictionManager.check()
		
		if(
			this.#isClientSideWarning
			&& !this.isServerSide()
			&& Type.isStringFilled(this.#clientSideWarningMessage)
		)
		{
			this.getSystemLogger().warn(this.#clientSideWarningMessage)
		}
		
		return this.#clientAxios
			.post(
				this.#prepareMethod(method),
				this.#prepareParams(authData, params, start)
			)
			.then(
				(response: {
					data: AjaxResultParams
					status: any
				}): Promise<AjaxResponse> => {
					const payload = response.data as AjaxResultParams
					return Promise.resolve({
						status: response.status,
						payload: payload,
					} as AjaxResponse)
				},
				async (error_: AxiosError) => {
					let answerError = {
						error: error_?.code || 0,
						errorDescription: error_?.message || '',
					}

					if (
						error_ instanceof AxiosError &&
						error_.response &&
						error_.response.data &&
						!Type.isUndefined((error_.response.data as TypeDescriptionError).error)
					)
					{
						const response = error_.response.data as {
							error: string
							error_description: string
						} as TypeDescriptionError
						
						answerError = {
							error: response.error,
							errorDescription: response.error_description,
						}
					}

					const problemError: AjaxError = new AjaxError({
						status: error_.response?.status || 0,
						answerError,
						cause: error_,
					} as AjaxErrorParams)

					/**
					 * Is response status === 401 -> refresh Auth?
					 */
					if (
						problemError.status === 401 &&
						['expired_token', 'invalid_token'].includes(
							problemError.answerError.error
						)
					) {
						this.getLogger().info(
							`refreshAuth >> ${problemError.answerError.error} >>>`
						)

						authData = await this.#authActions.refreshAuth()
						await this.#restrictionManager.check()

						return this.#clientAxios
							.post(
								this.#prepareMethod(method),
								this.#prepareParams(authData, params, start)
							)
							.then(
								async (response: {
									data: AjaxResultParams
									status: any
								}): Promise<AjaxResponse> => {
									const payload = response.data as AjaxResultParams
									return Promise.resolve({
										status: response.status,
										payload: payload,
									} as AjaxResponse)
								},
								async (error__: AxiosError) => {
									let answerError = {
										error: error__?.code || 0,
										errorDescription: error__?.message || '',
									}

									if (
										error__ instanceof AxiosError &&
										error__.response &&
										error__.response.data
									) {
										const response = error__.response.data as {
											error: string
											error_description: string
										} as TypeDescriptionError

										answerError = {
											error: response.error,
											errorDescription: response.error_description,
										}
									}

									const problemError: AjaxError = new AjaxError({
										status: error__.response?.status || 0,
										answerError,
										cause: error__,
									} as AjaxErrorParams)

									return Promise.reject(problemError)
								}
							)
					}

					return Promise.reject(problemError)
				}
			)
			.then((response: AjaxResponse): Promise<AjaxResult> => {
				const result = new AjaxResult(
					response.payload,
					{
						method,
						params,
						start,
					} as AjaxQuery,
					response.status
				)

				return Promise.resolve(result)
			})
	}
	// endregion ////
	
	// region Prepare ////
	/**
	 * Processes function parameters and adds authorization
	 *
	 * @param authData
	 * @param params
	 * @param start
	 *
	 * @private
	 */
	#prepareParams(authData: AuthData, params: any, start: number = 0): object {
		const result = Object.assign({}, params)

		if (this.#logTag.length > 0) {
			result.logTag = this.#logTag
		}

		result[this.#requestIdGenerator.getQueryStringParameterName()] =
			this.#requestIdGenerator.getRequestId()
		result[this.#requestIdGenerator.getQueryStringSdkParameterName()] =
			'__SDK_VERSION__'

		if (!!result.data && !!result.data.start) {
			delete result.data.start
		}

		/**
		 * @memo we skip auth for hook
		 */
		if (authData.refresh_token !== 'hook') {
			result.auth = authData.access_token
		}

		result.start = start

		return result
	}

	/**
	 * Makes the function name safe and adds JSON format
	 *
	 * @param method
	 * @private
	 */
	#prepareMethod(method: string): string {
		return `${encodeURIComponent(method)}.json`
	}
	
	/**
	 * @inheritDoc
	 */
	public setClientSideWarning(
		value: boolean,
		message: string
	): void
	{
		this.#isClientSideWarning = value
		this.#clientSideWarningMessage = message
	}
	// endregion ////
	
	// region Tools ////
	/**
	 * Tests whether the code is executed on the client side
	 * @return {boolean}
	 * @protected
	 */
	protected isServerSide(): boolean
	{
		return typeof window === 'undefined'
	}
	// endregion ////
}

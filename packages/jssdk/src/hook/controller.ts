import { AbstractB24, type IB24 } from '../core/abstractB24'
import Http from '../core/http/controller'
import { AuthHookManager } from './auth'
import type { B24HookParams } from '../types/auth'
import { LoggerBrowser } from '../logger/browser'

/**
 * B24.Hook Manager.
 *
 * @link https://dev.1c-bitrix.ru/learning/course/index.php?COURSE_ID=99&LESSON_ID=8581&LESSON_PATH=8771.8583.8581
 */
export class B24Hook
	extends AbstractB24
	implements IB24
{
	readonly #authHookManager: AuthHookManager
	
	// region Init ////
	constructor(
		b24HookParams: B24HookParams,
	)
	{
		super()
		
		this.#authHookManager = new AuthHookManager(
			b24HookParams
		)
		
		this._http = new Http(
			this.#authHookManager.getTargetOriginWithPath(),
			this.#authHookManager,
			this._getHttpOptions(),
		)
		
		this._isInit = true
	}
	
	override setLogger(logger: LoggerBrowser): void
	{
		super.setLogger(logger)
	}
	// endregion ////
	
	// region Core ////
	// endregion ////
	
	// region Get ////
	/**
	 * Get the account address BX24 ( https://name.bitrix24.com )
	 */
	override getTargetOrigin(): string
	{
		this._ensureInitialized()
		return this.#authHookManager.getTargetOrigin()
	}
	
	/**
	 * Get the account address BX24 with Path ( https://name.bitrix24.com/rest/1/xxxxx )
	 */
	override getTargetOriginWithPath(): string
	{
		this._ensureInitialized()
		return this.#authHookManager.getTargetOriginWithPath()
	}
	// endregion ////
	
	// region Tools ////
	// endregion ////
}
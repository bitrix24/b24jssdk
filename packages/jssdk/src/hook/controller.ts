import { AbstractB24 } from '../core/abstractB24'
import Http from "../core/http/controller"
import { AuthHookManager } from "./auth"
import type { B24HookParams } from "../types/auth"
import { LoggerBrowser } from "../logger/browser";

/**
 * B24.Hook Manager.
 *
 * @link https://dev.1c-bitrix.ru/learning/course/index.php?COURSE_ID=99&LESSON_ID=8581&LESSON_PATH=8771.8583.8581
 */
export class B24Hook
	extends AbstractB24
{
	readonly #authHookManager: AuthHookManager;
	
	// region Init ////
	constructor(
		b24HookParams: B24HookParams,
	)
	{
		super();
		
		this.#authHookManager = new AuthHookManager(
			b24HookParams
		);
		
		this._http = new Http(
			this.#authHookManager.getTargetOriginWithPath(),
			this.#authHookManager,
			this._getHttpOptions(),
		);
		
		this._isInit = true;
	}
	
	override setLogger(logger: LoggerBrowser): void
	{
		super.setLogger(logger);
		this.getHttpClient().setLogger(this.getLogger());
	}
	// endregion ////
	
	// region Core ////
	// endregion ////
	
	// region Tools ////
	// endregion ////
}
import { AbstractB24 } from '../core/abstractB24';
import { LoggerBrowser, LoggerType } from "../logger/browser";
import { Http } from "../core";
import { AuthHookManager } from "./auth";
import type {
	B24HookParams
} from "../types";

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
		this.logger = LoggerBrowser.build(`B24Frame:controller`);
		this.logger.disable(LoggerType.log);
		// this.logger.disable(LoggerType.info); ////
		// this.logger.disable(LoggerType.warn); ////
		
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
	// endregion ////
	
	// region Core ////
	// endregion ////
	
	// region Tools ////
	// endregion ////
}
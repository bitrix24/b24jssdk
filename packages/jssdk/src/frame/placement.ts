import { LoggerBrowser } from "../logger/browser";
import type { MessageInitData } from "../types/auth";

/**
 * Placement Manager
 *
 * @see https://dev.1c-bitrix.ru/rest_help/application_embedding/index.php
 * @see https://dev.1c-bitrix.ru/learning/course/index.php?COURSE_ID=99&CHAPTER_ID=02535&LESSON_PATH=8771.5380.2535
 */
export class PlacementManager
{
	#title: string = '';
	#options: object = {};
	
	private logger: LoggerBrowser;
	
	constructor()
	{
		this.logger = LoggerBrowser.build('b24frame:placementManager');
		// this.logger.disable(LoggerType.log); ////
		// this.logger.disable(LoggerType.info); ////
		// this.logger.disable(LoggerType.warn); ////
	}
	
	/**
	 * Initializes the data received from the parent window message.
	 * @param data
	 */
	initData(data: MessageInitData): PlacementManager
	{
		this.#title = data.PLACEMENT || 'DEFAULT';
		const options = data.PLACEMENT_OPTIONS;
		
		this.#options = Object.freeze(options);
		
		return this;
	}
	
	get title(): string
	{
		return this.#title;
	}
	
	get isDefault(): boolean
	{
		return this.title === 'DEFAULT';
	}
	
	get options(): any
	{
		return this.#options;
	}
}
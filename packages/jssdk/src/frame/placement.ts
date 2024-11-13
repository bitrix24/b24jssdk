import type { MessageInitData } from "../types/auth";

/**
 * Placement Manager
 *
 * @see https://apidocs.bitrix24.com/api-reference/widgets/ui-interaction/index.html
 * @see https://dev.1c-bitrix.ru/learning/course/index.php?COURSE_ID=99&CHAPTER_ID=02535&LESSON_PATH=8771.5380.2535
 */
export class PlacementManager
{
	#title: string = ''
	#options: object = {}
	
	constructor()
	{
	
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
	
	get isSliderMode(): boolean
	{
		return this.options?.IFRAME === 'Y'
	}
}
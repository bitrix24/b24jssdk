export type AnswerError = {
	error: string;
	errorDescription: string;
}

export type AjaxErrorParams = {
	status: number;
	answerError: AnswerError;
	cause?: Error
}

/**
 * Error requesting RestApi
 */
export class AjaxError
	extends Error
{
	override cause: null|Error;
	status: number;
	answerError: AnswerError;
	
	constructor(params: AjaxErrorParams)
	{
		const message = `${params.answerError.error}${!!params.answerError.errorDescription ? ': ' + params.answerError.errorDescription : ''}`;
		super(message);
		this.cause = params.cause || null;
		this.name = this.constructor.name;
		
		this.status = params.status;
		this.answerError = params.answerError;
	}
	
	getAnswerError(): AnswerError
	{
		return this.answerError;
	}
	
	getStatus()
	{
		return this.status;
	}
	
	override toString()
	{
		return `${this.answerError.error}${!!this.answerError.errorDescription ? ': ' + this.answerError.errorDescription : ''} (${this.status})`;
	}
}
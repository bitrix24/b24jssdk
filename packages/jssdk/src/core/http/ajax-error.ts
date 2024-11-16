export type AnswerError = {
	error: string
	errorDescription: string
}

export type AjaxErrorParams = {
	status: number
	answerError: AnswerError
	cause?: Error
}

/**
 * Error requesting RestApi
 */
export class AjaxError extends Error {
	override cause: null | Error
	private _status: number
	private _answerError: AnswerError

	constructor(params: AjaxErrorParams) {
		const message = `${params.answerError.error}${
			params.answerError.errorDescription
				? ': ' + params.answerError.errorDescription
				: ''
		}`

		super(message)
		this.cause = params.cause || null
		this.name = this.constructor.name

		this._status = params.status
		this._answerError = params.answerError
	}

	get answerError(): AnswerError {
		return this._answerError
	}

	get status(): number {
		return this._status
	}

	set status(status: number) {
		this._status = status
	}

	override toString(): string {
		return `${this.answerError.error}${
			this.answerError.errorDescription
				? ': ' + this.answerError.errorDescription
				: ''
		} (${this.status})`
	}
}

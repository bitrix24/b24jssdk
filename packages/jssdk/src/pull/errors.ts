export class ErrorNotConnected extends Error
{
	constructor(message: string)
	{
		super(message);
		this.name = 'ErrorNotConnected';
	}
}

export class ErrorTimeout extends Error
{
	constructor(message: string)
	{
		super(message);
		this.name = 'ErrorTimeout';
	}
}

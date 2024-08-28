const isDevelopment = process.env["NODE_ENV"] === 'development';

export enum LoggerType
{
	desktop = 'desktop',
	log = 'log',
	info = 'info',
	warn = 'warn',
	error = 'error',
	trace = 'trace',
}

interface LoggerTypes
{
	desktop: boolean;
	log: boolean;
	info: boolean;
	warn: boolean;
	error: boolean;
	trace: boolean;
}

// region StyleCollection ////
const styleCollection: Map<string, string[]> = new Map();

styleCollection.set(
	'title',
	[
		'%c#title#',
		'color: #959ca4; font-style: italic; padding: 0 6px; border-top: 1px solid #ccc; border-left: 1px solid #ccc; border-bottom: 1px solid #ccc'
	]
);

styleCollection.set(
	LoggerType.desktop,
	[
		`%cDESKTOP`,
		'color: white; font-style: italic; background-color: #29619b; padding: 0 6px; border: 1px solid #29619b'
	]
);

styleCollection.set(
	LoggerType.log,
	[
		`%cLOG`,
		'color: #2a323b; font-style: italic; background-color: #ccc; padding: 0 6px; border: 1px solid #ccc'
	]
);

styleCollection.set(
	LoggerType.info,
	[
		`%cINFO`,
		'color: #fff; font-style: italic; background-color: #6b7f96; padding: 0 6px; border: 1px solid #6b7f96'
	]
);

styleCollection.set(
	LoggerType.warn,
	[
		`%cWARNING`,
		'color: #f0a74f; font-style: italic; padding: 0 6px; border: 1px solid #f0a74f'
	]
);

styleCollection.set(
	LoggerType.error,
	[
		`%cERROR`,
		'color: white; font-style: italic; background-color: #8a3232; padding: 0 6px; border: 1px solid #8a3232'
	]
);

styleCollection.set(
	LoggerType.trace,
	[
		`%cTRACE`,
		'color: #2a323b; font-style: italic; background-color: #ccc; padding: 0 6px; border: 1px solid #ccc'
	]
);
// endregion ////

export class LoggerBrowser
{
	#title: string;
	#types: LoggerTypes = {
		desktop: true,
		log: false,
		info: false,
		warn: false,
		error: true,
		trace: true,
	};

	static build(
		title: string
	): LoggerBrowser
	{
		const logger = new LoggerBrowser(title);
		
		if(isDevelopment)
		{
			logger.enable(LoggerType.log);
			logger.enable(LoggerType.info);
			logger.enable(LoggerType.warn);
		}
		
		return logger;
	}
	
	private constructor(
		title: string
	)
	{
		this.#title = title;
	}
	
	// region Styles ////
	#getStyle(type: LoggerType): string[]
	{
		const resultText: string[] = [];
		const resultStyle: string[] = [];
		
		if(styleCollection.has('title'))
		{
			const styleTitle = styleCollection.get('title') as string[];
			if(styleTitle[0])
			{
				resultText.push(styleTitle[0].replace('#title#', this.#title));
				resultStyle.push(styleTitle[1] || '');
			}
		}
		
		if(styleCollection.has(type))
		{
			const styleBadge = styleCollection.get(type) as string[];
			if(styleBadge[0])
			{
				resultText.push(styleBadge[0]);
				resultStyle.push(styleBadge[1] || '');
			}
		}
		
		return [resultText.join(''), ...resultStyle];
	}
	// endregion ////
	
	// region Config ////
	setConfig(types: LoggerType[])
	{
		for(let type of types)
		{
			this.#types[type] = !!type;
		}
	}
	
	enable(type: LoggerType)
	{
		if (typeof this.#types[type] === 'undefined')
		{
			return false;
		}
		
		this.#types[type] = true;
		
		return true;
	}
	
	disable(type: LoggerType)
	{
		if (typeof this.#types[type] === 'undefined')
		{
			return false;
		}
		
		this.#types[type] = false;
		
		return true;
	}
	
	isEnabled(type: LoggerType)
	{
		return this.#types[type];
	}
	// endregion ////
	
	// region Functions ////
	desktop(...params: any[])
	{
		if (this.isEnabled(LoggerType.desktop))
		{
			console.log(...[...this.#getStyle(LoggerType.desktop), this.#title, ...params]);
		}
	}
	
	log(...params: any[])
	{
		if (this.isEnabled(LoggerType.log))
		{
			console.log(...[...this.#getStyle(LoggerType.log), ...params]);
		}
	}
	
	info(...params: any[])
	{
		if (this.isEnabled(LoggerType.info))
		{
			console.info(...[...this.#getStyle(LoggerType.info), ...params]);
		}
	}
	
	warn(...params: any[])
	{
		if (this.isEnabled(LoggerType.warn))
		{
			console.warn(...[...this.#getStyle(LoggerType.warn), ...params]);
		}
	}
	
	error(...params: any[])
	{
		if (this.isEnabled(LoggerType.error))
		{
			console.error(...[...this.#getStyle(LoggerType.error), ...params]);
		}
	}
	
	trace(...params: any[])
	{
		if (this.isEnabled(LoggerType.trace))
		{
			console.trace(...[...this.#getStyle(LoggerType.trace), ...params]);
		}
	}
	// endregion ////
}

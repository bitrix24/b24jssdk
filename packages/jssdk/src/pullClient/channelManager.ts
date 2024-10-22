import { LoggerBrowser, LoggerType } from '../logger/browser'
import { AjaxResult } from '../core/http/ajaxResult'
import type { TypeChanel, TypeChannelManagerParams, TypePublicIdDescriptor } from '../types/pull'
import type { TypeB24 } from '../types/b24'
import type { Payload } from '../types/payloads'

export class ChannelManager
{
	private _logger: null|LoggerBrowser = null
	private _publicIds: Map<number, TypeChanel>
	private _restClient: TypeB24
	private _getPublicListMethod: string
	
	constructor(params: TypeChannelManagerParams)
	{
		this._publicIds = new Map()
		
		this._restClient = params.b24
		this._getPublicListMethod = params.getPublicListMethod
	}
	
	setLogger(logger: LoggerBrowser): void
	{
		this._logger = logger
	}
	
	getLogger(): LoggerBrowser
	{
		if(null === this._logger)
		{
			this._logger = LoggerBrowser.build(
				`NullLogger`
			)
			
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
	
	/**
	 * @param {Array} users Array of user ids.
	 * @return {Promise}
	 */
	async getPublicIds(users: number[]): Promise<Record<number, TypeChanel>>
	{
		const now = new Date()
		
		let result: Record<number, TypeChanel> = {}
		let unknownUsers: number[] = []
		
		users.forEach((userId) => {
			const chanel = this._publicIds.get(userId)
			
			if(
				chanel
				&& chanel.end > now
			)
			{
				result[chanel.userId] = chanel
			}
			else
			{
				unknownUsers.push(userId)
			}
		})
		
		if(unknownUsers.length === 0)
		{
			return Promise.resolve(result)
		}
		
		/**
		 * @memo we not use Promise.reject()
		 */
		return new Promise((resolve) => {
			this._restClient.callMethod(
				this._getPublicListMethod,
				{
					users: unknownUsers
				}
			)
			.then((response: AjaxResult) => {
				const data = (response.getData() as Payload<TypePublicIdDescriptor>).result
				
				/**
				 * @todo fix this
				 */
				debugger
				this.setPublicIds(Object.values(data))
				
				unknownUsers.forEach((userId) => {
					const chanel = this._publicIds.get(userId)
					if(chanel)
					{
						result[chanel.userId] = chanel
					}
				})
				
				resolve(result)
			})
			.catch((error: Error|string) => {
				this.getLogger().error(error)
				return resolve({})
			})
		})
	}
	
	/**
	 * @param {TypePublicIdDescriptor[]} publicIds
	 */
	public setPublicIds(publicIds: TypePublicIdDescriptor[]): void
	{
		publicIds.forEach((publicIdDescriptor: TypePublicIdDescriptor) => {
			const userId = Number(publicIdDescriptor.user_id)
			/**
			 * @todo test this
			 */
			debugger
			this._publicIds.set(
				userId,
				{
					userId: userId,
					publicId: publicIdDescriptor.public_id,
					signature: publicIdDescriptor.signature,
					start: new Date(publicIdDescriptor.start),
					end: new Date(publicIdDescriptor.end)
				} as TypeChanel
			)
		})
	}
}
import { Utils } from './utils'

export class ChannelManager
{
	constructor(params)
	{
		this.publicIds = {};
		
		this.restClient = typeof params.restClient !== "undefined" ? params.restClient : BX.rest;
		
		this.getPublicListMethod = params.getPublicListMethod;
	}
	
	/**
	 *
	 * @param {Array} users Array of user ids.
	 * @return {Promise}
	 */
	getPublicIds(users)
	{
		const now = new Date();
		let result = {};
		let unknownUsers = [];
		
		for (let i = 0; i < users.length; i++)
		{
			const userId = users[i];
			if (this.publicIds[userId] && this.publicIds[userId]['end'] > now)
			{
				result[userId] = this.publicIds[userId];
			}
			else
			{
				unknownUsers.push(userId);
			}
		}
		
		if (unknownUsers.length === 0)
		{
			return Promise.resolve(result);
		}
		
		return new Promise((resolve) => {
			this.restClient.callMethod(this.getPublicListMethod, {users: unknownUsers}).then((response) => {
				if (response.error())
				{
					return resolve({});
				}
				
				const data = response.data();
				this.setPublicIds(Utils.objectValues(data));
				unknownUsers.forEach((userId) => {
					result[userId] = this.publicIds[userId];
				});
				
				resolve(result);
			});
		})
	}
	
	/**
	 *
	 * @param {object[]} publicIds
	 * @param {integer} publicIds.user_id
	 * @param {string} publicIds.public_id
	 * @param {string} publicIds.signature
	 * @param {Date} publicIds.start
	 * @param {Date} publicIds.end
	 */
	setPublicIds(publicIds)
	{
		for (let i = 0; i < publicIds.length; i++)
		{
			const publicIdDescriptor = publicIds[i];
			const userId = publicIdDescriptor.user_id;
			this.publicIds[userId] = {
				userId: userId,
				publicId: publicIdDescriptor.public_id,
				signature: publicIdDescriptor.signature,
				start: new Date(publicIdDescriptor.start),
				end: new Date(publicIdDescriptor.end)
			}
		}
	};
}
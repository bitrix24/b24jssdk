import { PullClient } from './client'
import { StorageManager } from './storageManager'
import { CloseReasons, PullStatus, SubscriptionType } from "../types/pull";

export const usePull = () => {
	
	const B24Pull = new PullClient({});
	
	return {
		B24Pull,
		PullStatus,
		SubscriptionType,
		CloseReasons,
		StorageManager
	}
}
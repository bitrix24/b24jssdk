import { PullClient } from './client'
import { StorageManager } from './storageManager'
import { CloseReasons, PullStatus, SubscriptionType } from "../types/pull";


/**
 * Bitrix Push & Pull
 * Pull client
 *
 * @package bitrix
 * @subpackage pull
 * @copyright 2001-2019 Bitrix
 */

/****************** ATTENTION *******************************
 * Please do not use Bitrix CoreJS in this class.
 * This class can be called on a page without Bitrix Framework
 *************************************************************/

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
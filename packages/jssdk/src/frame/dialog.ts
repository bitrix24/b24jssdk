import type { MessageManager } from './message'
import { MessageCommands } from './message'
import type { NumberString } from '../types/common'

export type SelectedUser = {
  /**
   * user identifier
   */
  id: NumberString

  /**
   * formatted username
   */
  name: string

  photo: string

  position: string

  url: string

  /**
   * The flag indicates that the selected user is a subordinate of the current user
   */
  sub: boolean

  /**
   * The flag indicates that the selected user is the manager of the current user
   */
  sup: boolean
}

export type SelectedAccess = {
  /**
   * access permission identifier. Examples of identifiers:
   * - U1 — user with identifier 1
   * - IU1 — employees with identifier 1
   * - DR2 — all department and subdepartment employees with identifier 2
   * - D6 — all department employees with identifier 6
   * - G2 — group with identifier 2 (all visitors)
   * - SG4 — social network group with identifier 4
   * - AU — all authorized users
   * - CR — current user
   */
  id:
    | `AU`
    | `CR`
    | `U${number}`
    | `IU${number}`
    | `DR${number}`
    | `D${number}`
    | `G${number}`
    | `SG${number}`

  /**
   * name of the access permission
   */
  name: string
}

export type SelectCRMParamsEntityType
  = | 'lead'
    | 'contact'
    | 'company'
    | 'deal'
    | 'quote'

export type SelectCRMParamsValue = {
  lead?: number[]
  contact?: number[]
  company?: number[]
  deal?: number[]
  quote?: number[]
}

export type SelectCRMParams = {
  /**
   * Which types of objects to display in the dialog. Possible values:
   * - lead — Leads
   * - contact — Contacts
   * - company — Companies
   * - deal — Deals
   * - quote — Estimates
   */
  entityType: SelectCRMParamsEntityType[]

  /**
   * Whether multiple objects can be selected. Default is `false`
   */
  multiple: boolean

  /**
   * Which objects to initially add to the selected in the dialog. Works only if `multiple = true`
   */
  value?: SelectCRMParamsValue
}

export type SelectedCRMEntity = {
  id: string
  type: SelectCRMParamsEntityType
  place: string
  title: string
  desc: string
  url: string
}

export type SelectedCRM = {
  lead?: (SelectedCRMEntity & { id: `L_${number}` })[]
  contact?: (SelectedCRMEntity & { id: `C_${number}`, image: string })[]
  company?: (SelectedCRMEntity & { id: `CO_${number}`, image: string })[]
  deal?: (SelectedCRMEntity & { id: `D_${number}` })[]
  quote?: (SelectedCRMEntity & { id: `Q_${number}` })[]
}

/**
 * Select dialog manager
 *
 * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/system-dialogues/index.html
 */
export class DialogManager {
  #messageManager: MessageManager

  constructor(messageManager: MessageManager) {
    this.#messageManager = messageManager
  }

  /**
   * Method displays the standard single user selection dialog
   * It only shows company employees
   *
   * @return {Promise<null|SelectedUser>}
   *
   * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/system-dialogues/bx24-select-user.html
   */
  async selectUser(): Promise<null | SelectedUser> {
    return this.#messageManager.send(MessageCommands.selectUser, {
      mult: false
    })
  }

  /**
   * Method displays the standard multiple user selection dialog
   * It only shows company employees
   *
   * @return {Promise<SelectedUser[]>}
   *
   * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/system-dialogues/bx24-select-users.html
   */
  async selectUsers(): Promise<SelectedUser[]> {
    return this.#messageManager.send(MessageCommands.selectUser, {
      mult: true
    })
  }

  /**
   * @deprecated
   * Method displays a standard access permission selection dialog
   *
   * @param {string[]} blockedAccessPermissions
   * @return {Promise<SelectedAccess[]>}
   *
   * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/system-dialogues/bx24-select-access.html
   */
  async selectAccess(
    blockedAccessPermissions: string[] = []
  ): Promise<SelectedAccess[]> {
    console.warn(`@deprecated selectAccess`)
    return this.#messageManager.send(MessageCommands.selectAccess, {
      value: blockedAccessPermissions
    })
  }

  /**
   * @deprecated
   * Method invokes the system dialog for selecting a CRM entity
   *
   * @param {SelectCRMParams} params
   * @return {Promise<SelectedCRM>}
   *
   * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/system-dialogues/bx24-select-crm.html
   */
  async selectCRM(params?: SelectCRMParams): Promise<SelectedCRM> {
    console.warn(`@deprecated selectCRM`)
    return this.#messageManager.send(MessageCommands.selectCRM, {
      entityType: params?.entityType,
      multiple: params?.multiple,
      value: params?.value
    })
  }
}

import { camelCase } from 'scule'
import { SdkError } from '@bitrix24/b24jssdk'
import {
  Action_toolsPing, Action_toolsHealthCheck,
  Action_callRestApiVer2, Action_callRestApiVer3,
  Action_batchRestApiVer2, Action_batchRestApiVer2DataStorage, Action_batchRestApiVer2DataStorageDelete,
  Action_frameParentCall,
  Action_frameSliderAppPageOpen, Action_frameSliderAppPageClose, Action_frameSliderOpenPath

} from '../examples'

export function useCodeExample() {
  const mapActions = new Map([
    ['toolsPingAction', Action_toolsPing],
    ['toolsHealthCheckAction', Action_toolsHealthCheck],
    ['callRestApiVer2Action', Action_callRestApiVer2],
    ['callRestApiVer3Action', Action_callRestApiVer3],
    ['batchRestApiVer2Action', Action_batchRestApiVer2],
    ['batchRestApiVer2DataStorageAction', Action_batchRestApiVer2DataStorage],
    ['batchRestApiVer2DataStorageDeleteAction', Action_batchRestApiVer2DataStorageDelete],
    ['frameParentCallAction', Action_frameParentCall],
    ['frameSliderAppPageOpenAction', Action_frameSliderAppPageOpen],
    ['frameSliderAppPageCloseAction', Action_frameSliderAppPageClose],
    ['frameSliderOpenPathAction', Action_frameSliderOpenPath]
  ])

  function prepareTitle(name: string): string {
    return `${camelCase(name)}Action`
  }

  function isHasAction(title: string): boolean {
    return mapActions.has(title)
  }

  async function runAction(title: string): Promise<void> {
    if (isHasAction(title)) {
      const someAction = mapActions.get(title)!
      return await someAction()
    }

    throw new SdkError({
      code: 'DOCS_WRONG_CODE_EXAMPLE_TITLE',
      description: `Couldn't find the action ${title}`,
      status: 404
    })
  }

  return {
    prepareTitle,
    isHasAction,
    runAction
  }
}

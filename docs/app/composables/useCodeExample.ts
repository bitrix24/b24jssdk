import { camelCase } from 'scule'
import { SdkError } from '@bitrix24/b24jssdk'
import { toolsPingAction } from '../examples'

export function useCodeExample() {

  const mapActions = new Map([
    ['toolsPingAction', toolsPingAction]
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

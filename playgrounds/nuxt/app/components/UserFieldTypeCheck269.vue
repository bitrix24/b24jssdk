<script setup lang="ts">
/**
 * Playground component for issue #269.
 *
 * `crm.deal.userfield.add` returns `ERROR_CORE` ("invalid user type") for an
 * app-provided custom `USER_TYPE_ID` when the call is NOT made in the owning
 * app's OAuth context (e.g. via a webhook → `WRONG_AUTH_TYPE`). Running inside
 * the Bitrix24 frame (B24Frame = application OAuth context), the same flow
 * succeeds — this component proves that and cleans up after itself.
 */
import { onMounted, ref } from 'vue'
import type { B24Frame } from '@bitrix24/b24jssdk'
import { LoggerFactory, AjaxError } from '@bitrix24/b24jssdk'

const { $initializeB24Frame } = useNuxtApp()
const $logger = LoggerFactory.createForBrowserDevelopment('[playground] UserFieldType #269')

let $b24: B24Frame
const isInit = ref(false)
const verdict = ref<{ ok: boolean, text: string } | null>(null)
const lines = ref<Array<{ kind: 'step' | 'ok' | 'err' | 'dim', text: string }>>([])

function push(kind: 'step' | 'ok' | 'err' | 'dim', text: string) {
  lines.value.push({ kind, text })
}

onMounted(async () => {
  try {
    $b24 = await $initializeB24Frame()
    if ($b24.isInstallMode) {
      try {
        await $b24.installFinish()
      } catch (error) {
        $logger.info('installFinish', { error })
      }
    }
    isInit.value = true
  } catch (error) {
    $logger.error('initializeB24Frame failed', { error })
  }
})

/** One REST call with uniform logging; returns the result on success. */
async function call(method: string, params: Record<string, unknown>, label: string): Promise<{ success: boolean, result: unknown }> {
  push('dim', `• ${label} …`)
  try {
    const res = await $b24.actions.v2.call.make({ method, params })
    if (!res.isSuccess) {
      const messages = res.getErrorMessages().join('; ')
      push('err', `✗ ${method} → ${messages}`)
      $logger.warning(method, { messages })
      return { success: false, result: undefined }
    }
    const result = res.getData()?.result
    push('ok', `✓ ${method} → ${JSON.stringify(result).slice(0, 160)}`)
    return { success: true, result }
  } catch (error) {
    const code = error instanceof AjaxError ? ` [${error.code}]` : ''
    const message = error instanceof Error ? error.message : String(error)
    push('err', `✗ ${method} → exception${code}: ${message}`)
    $logger.error(method, { error })
    return { success: false, result: undefined }
  }
}

async function run() {
  lines.value = []
  verdict.value = null

  const stamp = String(Date.now()).slice(-6)
  const typeId = `cs_test_obj_${stamp}`
  const fieldName = `CS_TEST_OBJ_${stamp}`
  // Use the current origin (e.g. your tunnel URL) so the type's HANDLER points
  // at wherever this app is actually served from while testing.
  const handler = window.location.origin

  let userFieldId: unknown = null
  let typeRegistered = false

  try {
    push('step', 'Step 1 · application context')
    await call('scope', {}, 'app scopes')

    push('step', 'Step 2 · userfieldtype.list (denied to a webhook: WRONG_AUTH_TYPE)')
    const list = await call('userfieldtype.list', {}, 'list custom types')
    if (list.success) {
      push('ok', 'method IS available to the app (unlike a webhook).')
    }

    push('step', `Step 3 · register custom type ${typeId}`)
    push('dim', `HANDLER = ${handler}`)
    const added = await call('userfieldtype.add', {
      USER_TYPE_ID: typeId,
      HANDLER: handler,
      TITLE: `CS test obj ${stamp}`,
      DESCRIPTION: '#269 check'
    }, 'userfieldtype.add')
    typeRegistered = added.success

    // The reported symptom: userfieldtype.add returns success, yet the type is
    // not actually persisted — userfieldtype.list does not contain it. Re-list
    // and check so this run says clearly whether registration really took.
    if (added.success) {
      const recheck = await call('userfieldtype.list', {}, 're-list to confirm the type persisted')
      const types = Array.isArray(recheck.result) ? (recheck.result as Array<Record<string, unknown>>) : []
      const present = types.some(item => item.USER_TYPE_ID === typeId)
      if (present) {
        push('ok', `type ${typeId} IS present in userfieldtype.list`)
      } else {
        push('err', `type ${typeId} NOT found in userfieldtype.list despite add success — matches the reported platform bug`)
      }
    }

    push('step', `Step 4 · crm.deal.userfield.add with USER_TYPE_ID=${typeId} ← the #269 case`)
    push('dim', 'A webhook returned ERROR_CORE / "invalid user type" here.')
    const field = await call('crm.deal.userfield.add', {
      fields: {
        FIELD_NAME: fieldName,
        USER_TYPE_ID: typeId,
        LABEL: `CS object ${stamp}`,
        EDIT_FORM_LABEL: { en: 'Real estate object (form)' },
        LIST_COLUMN_LABEL: { en: 'Real estate object (form)' }
      }
    }, 'crm.deal.userfield.add')

    if (field.success) {
      userFieldId = field.result
      verdict.value = {
        ok: true,
        text: `crm.deal.userfield.add with a custom type WORKS in the app context (id=${String(userFieldId)}). `
          + 'So the webhook ERROR_CORE is an auth-context rule, not an SDK/method bug.'
      }
    } else {
      verdict.value = {
        ok: false,
        text: 'The call failed even in the app context — see the error above. '
          + 'Most likely the app lacks rights to manage fields, or the type did not register (step 3).'
      }
    }
  } finally {
    push('step', 'Step 5 · cleanup')
    if (userFieldId !== null && userFieldId !== undefined) {
      await call('crm.deal.userfield.delete', { id: userFieldId }, `delete user field ${String(userFieldId)}`)
    }
    if (typeRegistered) {
      await call('userfieldtype.delete', { USER_TYPE_ID: typeId }, `delete type ${typeId}`)
    }
    push('ok', 'done — portal left as it was.')
  }
}
</script>

<template>
  <ClientOnly>
    <B24Alert
      v-if="!isInit"
      description="Connection to Bitrix24 ..."
    />
    <div v-else class="flex flex-col gap-3">
      <div class="flex flex-row items-center gap-2">
        <B24Button
          label="▶ Run #269 check"
          color="air-boost"
          loading-auto
          @click="run"
        />
        <ProseP class="mb-0 text-sm opacity-70">
          Registers a throwaway custom user type and adds a deal field with it, then cleans up.
        </ProseP>
      </div>

      <div
        v-if="lines.length > 0"
        class="rounded-lg border border-(--ui-border) p-3 font-mono text-xs whitespace-pre-wrap break-words"
      >
        <div
          v-for="(line, index) in lines"
          :key="index"
          :class="{
            'font-bold mt-2': line.kind === 'step',
            'text-(--ui-color-success-text)': line.kind === 'ok',
            'text-(--ui-color-danger-text) font-bold': line.kind === 'err',
            'opacity-60': line.kind === 'dim'
          }"
        >
          {{ line.text }}
        </div>
      </div>

      <B24Alert
        v-if="verdict"
        :title="verdict.ok ? 'OK — works in the app context' : 'Failed'"
        :description="verdict.text"
        :color="verdict.ok ? 'air-primary-success' : 'air-primary-alert'"
      />
    </div>
  </ClientOnly>
</template>

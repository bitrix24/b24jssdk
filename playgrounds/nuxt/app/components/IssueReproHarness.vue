<script setup lang="ts">
/**
 * Issue-repro harness for the nuxt playground.
 *
 * Purpose: turn a user report ("I did X, nothing worked, here's my snippet")
 * into a runnable chain of REST calls. You run it locally inside Bitrix24
 * (B24Frame = application OAuth context), read the per-call request/response
 * log, and copy a clean transcript to hand back (to confirm/fix, or to show the
 * reporter "call it like this and it works").
 *
 * To repro a NEW issue: edit ONLY the `scenario()` function below
 * (the `===== SCENARIO =====` block). The harness around it stays the same.
 */
import { onMounted, ref } from 'vue'
import type { B24Frame } from '@bitrix24/b24jssdk'
import { LoggerFactory, AjaxError } from '@bitrix24/b24jssdk'

const { $initializeB24Frame } = useNuxtApp()
const $logger = LoggerFactory.createForBrowserDevelopment('[playground] IssueRepro')

type ApiVer = 'v2' | 'v3'
type CallRow = {
  kind: 'call'
  n: number
  ver: ApiVer
  method: string
  params: unknown
  ok: boolean
  result?: unknown
  error?: string
  ms: number
}
type Entry
  = | { kind: 'step', text: string }
    | { kind: 'note', text: string, tone: 'info' | 'ok' | 'err' }
    | { kind: 'verdict', ok: boolean, text: string }
    | CallRow

let $b24: B24Frame
const isInit = ref(false)
const entries = ref<Entry[]>([])
const transcript = ref('')
const view = ref<'raw' | 'preview'>('raw')
let counter = 0

const pretty = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}

const step = (text: string) => entries.value.push({ kind: 'step', text })
const note = (text: string, tone: 'info' | 'ok' | 'err' = 'info') => entries.value.push({ kind: 'note', text, tone })
const verdict = (ok: boolean, text: string) => entries.value.push({ kind: 'verdict', ok, text })

/**
 * Run one REST call, record its request + response, and return a small result.
 * `opts.ver` picks the API version (default v2).
 */
async function call(
  method: string,
  params: Record<string, unknown> = {},
  opts: { ver?: ApiVer } = {}
): Promise<{ success: boolean, result: unknown }> {
  const ver = opts.ver ?? 'v2'
  const n = ++counter
  const startedAt = Date.now()
  const api = ver === 'v3' ? $b24.actions.v3 : $b24.actions.v2
  try {
    const res = await api.call.make({ method, params })
    const ms = Date.now() - startedAt
    if (!res.isSuccess) {
      const error = res.getErrorMessages().join('; ')
      entries.value.push({ kind: 'call', n, ver, method, params, ok: false, error, ms })
      $logger.warning(method, { params, error })
      return { success: false, result: undefined }
    }
    const result = res.getData()?.result
    entries.value.push({ kind: 'call', n, ver, method, params, ok: true, result, ms })
    $logger.info(method, { params, result })
    return { success: true, result }
  } catch (error) {
    const ms = Date.now() - startedAt
    const code = error instanceof AjaxError ? ` [${error.code}]` : ''
    const message = (error instanceof Error ? error.message : String(error)) + code
    entries.value.push({ kind: 'call', n, ver, method, params, ok: false, error: message, ms })
    $logger.error(method, { params, error })
    return { success: false, result: undefined }
  }
}

// ============================ SCENARIO ============================
// Edit ONLY this function per issue. Use `call(method, params, { ver })`,
// plus `step()` / `note()` / `verdict()` for readability. Clean up anything
// you create so the portal is left as it was.
async function scenario(): Promise<void> {
  // ----- Issue #269 · custom USER_TYPE_ID on crm.deal.userfield.add -----
  const stamp = String(Date.now()).slice(-6)
  const typeId = `cs_test_obj_${stamp}`
  const fieldName = `CS_TEST_OBJ_${stamp}`
  const handler = window.location.origin // current origin (your tunnel while testing)

  let userFieldId: unknown = null
  let typeRegistered = false

  try {
    step('1 · application context')
    await call('scope')

    step('2 · register the custom user type')
    const added = await call('userfieldtype.add', {
      USER_TYPE_ID: typeId,
      HANDLER: handler,
      TITLE: `CS test obj ${stamp}`,
      DESCRIPTION: '#269 repro'
    })
    typeRegistered = added.success

    step('3 · confirm the type actually persisted')
    const list = await call('userfieldtype.list')
    const types = Array.isArray(list.result) ? (list.result as Array<Record<string, unknown>>) : []
    if (types.some(item => item.USER_TYPE_ID === typeId)) {
      note(`type ${typeId} is present in userfieldtype.list`, 'ok')
    } else {
      note(`type ${typeId} NOT in userfieldtype.list despite add success`, 'err')
    }

    step('4 · crm.deal.userfield.add with the custom type')
    const field = await call('crm.deal.userfield.add', {
      fields: {
        FIELD_NAME: fieldName,
        USER_TYPE_ID: typeId,
        LABEL: `CS object ${stamp}`,
        EDIT_FORM_LABEL: { en: 'Real estate object (form)' },
        LIST_COLUMN_LABEL: { en: 'Real estate object (form)' }
      }
    })
    userFieldId = field.success ? field.result : null

    verdict(
      field.success,
      field.success
        ? `Works: crm.deal.userfield.add with a custom type succeeded (id=${String(userFieldId)}).`
        : 'Failed: see the call above for the exact error.'
    )
  } finally {
    step('5 · cleanup')
    if (userFieldId !== null && userFieldId !== undefined) {
      await call('crm.deal.userfield.delete', { id: userFieldId })
    }
    if (typeRegistered) {
      await call('userfieldtype.delete', { USER_TYPE_ID: typeId })
    }
  }
}
// ========================== END SCENARIO ==========================

async function run(): Promise<void> {
  entries.value = []
  counter = 0
  transcript.value = ''
  try {
    await scenario()
  } catch (error) {
    note('harness error: ' + (error instanceof Error ? error.message : String(error)), 'err')
    $logger.error('scenario crashed', { error })
  }
  // Render the full request/response chain as a markdown document to copy.
  transcript.value = buildTranscript()
}

/** Build a copy-paste transcript (requests + responses) for handing back. */
function buildTranscript(): string {
  const lines: string[] = ['# REST repro transcript', '']
  for (const e of entries.value) {
    if (e.kind === 'step') lines.push('', `## ${e.text}`)
    else if (e.kind === 'note') lines.push(`> ${e.text}`)
    else if (e.kind === 'verdict') lines.push('', `### ${e.ok ? 'OK' : 'FAILED'} — ${e.text}`)
    else {
      lines.push(`### #${e.n} ${e.method} [${e.ver}] — ${e.ok ? 'OK' : 'ERROR'} (${e.ms}ms)`)
      lines.push('request:', '```json', pretty(e.params), '```')
      if (e.ok) lines.push('response:', '```json', pretty(e.result), '```')
      else lines.push('error:', '```', String(e.error), '```')
    }
  }
  return lines.join('\n')
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
</script>

<template>
  <ClientOnly>
    <B24Alert
      v-if="!isInit"
      description="Connection to Bitrix24 ..."
    />
    <div v-else class="flex flex-col gap-3">
      <B24Button label="▶ Run scenario" color="air-boost" loading-auto class="self-start" @click="run" />

      <!-- Compact live status of the chain -->
      <div v-if="entries.length > 0" class="flex flex-col gap-1 text-xs">
        <template v-for="(e, index) in entries" :key="index">
          <div v-if="e.kind === 'step'" class="mt-1 font-bold">
            {{ e.text }}
          </div>
          <div
            v-else-if="e.kind === 'note'"
            :class="{
              'opacity-60': e.tone === 'info',
              'text-(--ui-color-success-text)': e.tone === 'ok',
              'text-(--ui-color-danger-text) font-bold': e.tone === 'err'
            }"
          >
            {{ e.text }}
          </div>
          <B24Alert
            v-else-if="e.kind === 'verdict'"
            :title="e.ok ? 'OK' : 'Failed'"
            :description="e.text"
            :color="e.ok ? 'air-primary-success' : 'air-primary-alert'"
          />
          <div
            v-else
            class="font-mono"
            :class="e.ok ? 'text-(--ui-color-success-text)' : 'text-(--ui-color-danger-text)'"
          >
            #{{ e.n }} {{ e.method }} <span class="opacity-60">[{{ e.ver }}] · {{ e.ms }}ms · {{ e.ok ? 'OK' : 'ERROR' }}</span>
          </div>
        </template>
      </div>

      <!-- Full request/response chain as markdown — select & copy, hand it back -->
      <div v-if="transcript" class="flex flex-col gap-1">
        <div class="flex flex-row items-center gap-2">
          <B24Button
            label="raw md"
            size="xs"
            :color="view === 'raw' ? 'air-boost' : 'air-secondary-no-accent'"
            @click="view = 'raw'"
          />
          <B24Button
            label="preview"
            size="xs"
            :color="view === 'preview' ? 'air-boost' : 'air-secondary-no-accent'"
            @click="view = 'preview'"
          />
          <span class="text-xs opacity-60">Transcript — select all and copy</span>
        </div>

        <pre
          v-if="view === 'raw'"
          class="w-full rounded-lg border border-(--ui-border) p-2 font-mono text-xs whitespace-pre-wrap break-words"
        >{{ transcript }}</pre>

        <B24Editor
          v-else
          :model-value="transcript"
          content-type="markdown"
          :editable="false"
          class="rounded-lg border border-(--ui-border) p-2"
        />
      </div>
    </div>
  </ClientOnly>
</template>

/**
 * Recipe 5 — Bitrix24 Disk: storages, folders, files
 *
 * Demonstrates:
 *   - Listing storages (disk.storage.getlist)
 *   - Reading the root folder of a storage
 *   - Creating a subfolder (disk.folder.addsubfolder)
 *   - Listing children of a folder
 *   - Inspecting a single file
 *
 * NOTE: file UPLOAD requires multipart and is not covered here — call
 * disk.folder.uploadfile manually with a binary payload.
 *
 * Run:
 *   B24_HOOK=https://your.bitrix24.com/rest/1/secret npx tsx 05-disk-files.ts
 */

import {
  AjaxError,
  B24Hook,
  LoggerBrowser,
  type TypeB24
} from '@bitrix24/b24jssdk'

const logger = LoggerBrowser.build('Disk', true)

function bootB24(): TypeB24 {
  const url = process.env.B24_HOOK
  if (!url) throw new Error('B24_HOOK env var is required')
  const $b24 = B24Hook.fromWebhookUrl(url)
  $b24.offClientSideWarning?.()
  return $b24
}

interface Storage {
  ID: string
  NAME: string
  ENTITY_TYPE: string
  ROOT_OBJECT_ID: string
}

interface DiskItem {
  ID: string
  NAME: string
  TYPE: 'folder' | 'file'
  SIZE?: string
  PARENT_ID?: string
}

async function listStorages($b24: TypeB24): Promise<Storage[]> {
  const res = await $b24.callMethod('disk.storage.getlist')
  return (res.getData().result as Storage[]) ?? []
}

async function listFolderChildren($b24: TypeB24, folderId: string): Promise<DiskItem[]> {
  // disk.folder.getchildren returns a paged list — auto-page with callListMethod
  const res = await $b24.callListMethod('disk.folder.getchildren', { id: folderId })
  return (res.getData() as DiskItem[]) ?? []
}

async function createSubfolder($b24: TypeB24, parentId: string, name: string): Promise<DiskItem> {
  const res = await $b24.callMethod('disk.folder.addsubfolder', {
    id: parentId,
    data: { NAME: name }
  })
  return res.getData().result as DiskItem
}

async function getFile($b24: TypeB24, fileId: string): Promise<DiskItem> {
  const res = await $b24.callMethod('disk.file.get', { id: fileId })
  return res.getData().result as DiskItem
}

async function main() {
  const $b24 = bootB24()

  logger.info('Storages:')
  const storages = await listStorages($b24)
  for (const s of storages) {
    logger.info(`  [${s.ID}] ${s.NAME} (${s.ENTITY_TYPE}) — root: ${s.ROOT_OBJECT_ID}`)
  }
  if (storages.length === 0) return

  // Pick the first storage and list its root folder
  const storage = storages[0]
  logger.info(`\nRoot of storage ${storage.ID}:`)
  const children = await listFolderChildren($b24, storage.ROOT_OBJECT_ID)
  for (const it of children.slice(0, 20)) {
    logger.info(`  [${it.ID}] ${it.NAME} (${it.TYPE}${it.SIZE ? `, ${it.SIZE} bytes` : ''})`)
  }

  // Create a folder + read it back
  try {
    const folder = await createSubfolder($b24, storage.ROOT_OBJECT_ID, `Project_${Date.now()}`)
    logger.info(`\nCreated folder #${folder.ID}: ${folder.NAME}`)
  } catch (e) {
    if (e instanceof AjaxError) logger.warn(`Could not create folder: ${e.code}`)
    else throw e
  }

  // Combine storages + first 5 files of the first storage in one round-trip
  const batch = await $b24.callBatch({
    Storages: { method: 'disk.storage.getlist', params: {} },
    Children: { method: 'disk.folder.getchildren', params: { id: storage.ROOT_OBJECT_ID } }
  }, true)
  const data = batch.getData() as { Storages: Storage[]; Children: DiskItem[] }
  logger.info(`\nBatch: ${data.Storages.length} storages, ${data.Children.length} root items`)
}

main().catch((e) => { logger.error(e); process.exit(1) })

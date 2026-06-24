/**
 * Unit tests for VersionManager — the v2/v3 routing decision. Pure logic, no
 * portal required, so it runs in the `jsSdk:unit` CI project.
 *
 * Pins the `#supportMethods` allowlist (a typo in any entry silently changes
 * routing: `actions.v3.call` throws for off-list methods, `actions.v2.call`
 * warns for on-list ones) and the version-selection helpers.
 */
import { describe, it, expect } from 'vitest'
import { versionManager } from '../../../packages/jssdk/src/core/version-manager'
import { ApiVersion } from '../../../packages/jssdk/src/types/b24'
import type { BatchCommandsArrayUniversal } from '../../../packages/jssdk/src/types/http'

describe('VersionManager — v3 supported-methods allowlist', () => {
  describe('isSupport(v3, …)', () => {
    it('routes representative methods of each newly-added v3 module', () => {
      expect(versionManager.isSupport(ApiVersion.v3, 'mail.mailbox.list')).toBe(true)
      expect(versionManager.isSupport(ApiVersion.v3, 'mail.message.send')).toBe(true)
      expect(versionManager.isSupport(ApiVersion.v3, 'mail.recipient.field.get')).toBe(true)
      expect(versionManager.isSupport(ApiVersion.v3, 'humanresources.node.add')).toBe(true)
      expect(versionManager.isSupport(ApiVersion.v3, 'humanresources.employee.search')).toBe(true)
      expect(versionManager.isSupport(ApiVersion.v3, 'timeman.record.list')).toBe(true)
      expect(versionManager.isSupport(ApiVersion.v3, 'tasks.task.result.add')).toBe(true)
      expect(versionManager.isSupport(ApiVersion.v3, 'tasks.task.field.list')).toBe(true)
      expect(versionManager.isSupport(ApiVersion.v3, 'main.eventlog.field.list')).toBe(true)
    })

    it('keeps the previously-supported core methods on v3', () => {
      expect(versionManager.isSupport(ApiVersion.v3, 'tasks.task.get')).toBe(true)
      expect(versionManager.isSupport(ApiVersion.v3, 'main.eventlog.list')).toBe(true)
      expect(versionManager.isSupport(ApiVersion.v3, 'batch')).toBe(true)
    })

    it('routes tasks.task.list through v3 (rest-v3 list method)', () => {
      expect(versionManager.isSupport(ApiVersion.v3, 'tasks.task.list')).toBe(true)
      expect(versionManager.automaticallyObtainApiVersion('tasks.task.list')).toBe(ApiVersion.v3)
    })

    it('rejects methods that are not on the allowlist (they fall to v2)', () => {
      expect(versionManager.isSupport(ApiVersion.v3, 'crm.item.list')).toBe(false)
      expect(versionManager.isSupport(ApiVersion.v3, 'crm.deal.list')).toBe(false)
      expect(versionManager.isSupport(ApiVersion.v3, 'user.current')).toBe(false)
    })

    it('keeps the deliberately-deferred cross-module methods OFF v3', () => {
      // Referenced on the rest-v3 docs pages but owned by modules not yet
      // actualized here — see the comment in version-manager.ts. Pin the choice
      // so a future edit doesn't silently route them before their module lands.
      expect(versionManager.isSupport(ApiVersion.v3, 'user.get')).toBe(false)
      expect(versionManager.isSupport(ApiVersion.v3, 'im.message.update')).toBe(false)
      expect(versionManager.isSupport(ApiVersion.v3, 'disk.storage.uploadfile')).toBe(false)
    })

    it('does not match by prefix — only exact method names', () => {
      expect(versionManager.isSupport(ApiVersion.v3, 'mail')).toBe(false)
      expect(versionManager.isSupport(ApiVersion.v3, 'tasks.task')).toBe(false)
    })
  })

  describe('isSupport(v2, …)', () => {
    it('returns true for any method — v2 is the universal fallback', () => {
      expect(versionManager.isSupport(ApiVersion.v2, 'crm.item.list')).toBe(true)
      expect(versionManager.isSupport(ApiVersion.v2, 'mail.mailbox.list')).toBe(true)
      expect(versionManager.isSupport(ApiVersion.v2, 'anything.at.all')).toBe(true)
    })
  })

  describe('automaticallyObtainApiVersion', () => {
    it('prefers v3 for an allowlisted method', () => {
      expect(versionManager.automaticallyObtainApiVersion('tasks.task.get')).toBe(ApiVersion.v3)
      expect(versionManager.automaticallyObtainApiVersion('mail.message.list')).toBe(ApiVersion.v3)
    })

    it('falls back to v2 for a non-allowlisted method', () => {
      expect(versionManager.automaticallyObtainApiVersion('crm.item.list')).toBe(ApiVersion.v2)
    })
  })

  describe('automaticallyObtainApiVersionForBatch', () => {
    it('returns v3 only when every command is v3-supported', () => {
      const allV3: BatchCommandsArrayUniversal = [
        ['tasks.task.get', {}],
        ['mail.mailbox.list', {}]
      ]
      expect(versionManager.automaticallyObtainApiVersionForBatch(allV3)).toBe(ApiVersion.v3)
    })

    it('falls back to v2 when any command is not v3-supported', () => {
      const mixed: BatchCommandsArrayUniversal = [
        ['tasks.task.get', {}],
        ['crm.item.list', {}]
      ]
      expect(versionManager.automaticallyObtainApiVersionForBatch(mixed)).toBe(ApiVersion.v2)
    })
  })

  describe('getAllApiVersions', () => {
    it('lists the highest version first (v3 before v2)', () => {
      expect(versionManager.getAllApiVersions()).toEqual([ApiVersion.v3, ApiVersion.v2])
    })
  })
})

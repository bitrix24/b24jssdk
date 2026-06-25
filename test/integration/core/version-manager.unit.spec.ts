/**
 * Unit tests for VersionManager after the v3 method allowlist was removed.
 *
 * The SDK no longer gates v3 by a hardcoded list — the server is the source of
 * truth (an unknown v3 method returns METHODNOTFOUNDEXCEPTION). So:
 *   - `isSupport` always returns true (no client-side gating);
 *   - version auto-detection defaults to v2 (v3 is opt-in via `actions.v3.*`).
 * Pure logic, no portal required — runs in the `jsSdk:unit` CI project.
 */
import { describe, it, expect } from 'vitest'
import { versionManager } from '../../../packages/jssdk/src/core/version-manager'
import { ApiVersion } from '../../../packages/jssdk/src/types/b24'
import type { BatchCommandsArrayUniversal } from '../../../packages/jssdk/src/types/http'

describe('VersionManager — no v3 allowlist (server is the source of truth)', () => {
  describe('isSupport', () => {
    it('returns true for any method on v3 — the SDK no longer gates client-side', () => {
      expect(versionManager.isSupport(ApiVersion.v3, 'tasks.task.list')).toBe(true)
      expect(versionManager.isSupport(ApiVersion.v3, 'note.collection.list')).toBe(true)
      expect(versionManager.isSupport(ApiVersion.v3, 'rest.application.list')).toBe(true)
      expect(versionManager.isSupport(ApiVersion.v3, 'crm.item.list')).toBe(true)
      expect(versionManager.isSupport(ApiVersion.v3, 'anything.at.all')).toBe(true)
    })

    it('returns true for any method on v2 — the universal fallback', () => {
      expect(versionManager.isSupport(ApiVersion.v2, 'crm.item.list')).toBe(true)
      expect(versionManager.isSupport(ApiVersion.v2, 'anything.at.all')).toBe(true)
    })
  })

  describe('automaticallyObtainApiVersion', () => {
    it('defaults to v2 for every method (v3 is opt-in via actions.v3.*)', () => {
      expect(versionManager.automaticallyObtainApiVersion('tasks.task.get')).toBe(ApiVersion.v2)
      expect(versionManager.automaticallyObtainApiVersion('main.eventlog.list')).toBe(ApiVersion.v2)
      expect(versionManager.automaticallyObtainApiVersion('crm.item.list')).toBe(ApiVersion.v2)
    })
  })

  describe('automaticallyObtainApiVersionForBatch', () => {
    it('defaults to v2 regardless of the commands', () => {
      const calls: BatchCommandsArrayUniversal = [
        ['tasks.task.get', {}],
        ['main.eventlog.list', {}]
      ]
      expect(versionManager.automaticallyObtainApiVersionForBatch(calls)).toBe(ApiVersion.v2)
    })
  })

  describe('getAllApiVersions', () => {
    it('lists the highest version first (v3 before v2)', () => {
      expect(versionManager.getAllApiVersions()).toEqual([ApiVersion.v3, ApiVersion.v2])
    })
  })
})

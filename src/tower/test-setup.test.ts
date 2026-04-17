// src/tower/test-setup.test.ts
import { describe, it, expect } from 'vitest'

describe('test-setup', () => {
  it('injects IndexedDB polyfill globally', () => {
    expect(globalThis.indexedDB).toBeDefined()
    expect(typeof globalThis.indexedDB.open).toBe('function')
  })
})

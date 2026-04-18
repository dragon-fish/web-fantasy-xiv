import { describe, it, expect } from 'vitest'
import { TOWER_RUN_SCHEMA_VERSION, type TowerRun, type TowerNode } from './types'

describe('tower types — phase 4 additions', () => {
  it('TOWER_RUN_SCHEMA_VERSION is 2 (phase 4 bump)', () => {
    expect(TOWER_RUN_SCHEMA_VERSION).toBe(2)
  })

  it('TowerRun accepts blueprintVersion number', () => {
    const run: Partial<TowerRun> = { blueprintVersion: 1 }
    expect(run.blueprintVersion).toBe(1)
  })

  it('TowerNode accepts optional encounterId', () => {
    const node: Partial<TowerNode> = { encounterId: 'mob-frost-sprite' }
    expect(node.encounterId).toBe('mob-frost-sprite')
  })

  it('TowerNode encounterId is optional (undefined OK)', () => {
    const node: Partial<TowerNode> = {}
    expect(node.encounterId).toBeUndefined()
  })
})

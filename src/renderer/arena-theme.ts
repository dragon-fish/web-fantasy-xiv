// src/renderer/arena-theme.ts
import { Color3 } from '@babylonjs/core'
import type { SceneAtmosphere } from './scene-manager'

export type ArenaThemeId = 'default' | 'fire' | 'water' | 'wind' | 'stone' | 'void'
export type ArenaPropKind = 'pillar' | 'brazier' | 'crystal' | 'rock'

export interface ArenaTheme {
  id: ArenaThemeId
  /** Stone tile base / variation / grout colors (CSS hex) */
  tile: string
  tileAlt: string
  grout: string
  /** Engraved rune lines on the floor */
  rune: string
  /** Emissive accent: rune glow, boundary rim, prop flames/crystals */
  accent: string
  /** Platform side wall for lethal-edge arenas */
  cliff: string
  atmosphere: SceneAtmosphere
  props: ArenaPropKind[]
  /** Ambient floating motes outside the arena edge */
  motes: string
}

const c = (hex: string) => Color3.FromHexString(hex)

export const ARENA_THEMES: Record<ArenaThemeId, ArenaTheme> = {
  default: {
    id: 'default', tile: '#717a88', tileAlt: '#606777', grout: '#2c3039', rune: '#8c97ab', accent: '#7fc8ff', cliff: '#2a2e38',
    atmosphere: { clearColor: c('#0c1018'), skyColor: c('#c9d6ff'), groundColor: c('#2a2433'), sunColor: c('#fff1dc'), ambientIntensity: 0.6, sunIntensity: 1.15 },
    props: ['pillar', 'crystal'], motes: '#9fd8ff',
  },
  fire: {
    id: 'fire', tile: '#6f4c40', tileAlt: '#5a3b33', grout: '#1d0f0b', rune: '#c46a3c', accent: '#ff7a2a', cliff: '#2b1611',
    atmosphere: { clearColor: c('#1a0805'), skyColor: c('#ffc49a'), groundColor: c('#4a1608'), sunColor: c('#ffcf9e'), ambientIntensity: 0.55, sunIntensity: 1.2 },
    props: ['brazier', 'rock'], motes: '#ff9a4a',
  },
  water: {
    id: 'water', tile: '#496d7c', tileAlt: '#3b5d6c', grout: '#14262e', rune: '#6fb6c8', accent: '#45d4ff', cliff: '#10232b',
    atmosphere: { clearColor: c('#04121c'), skyColor: c('#a8e2ff'), groundColor: c('#0e3346'), sunColor: c('#dff6ff'), ambientIntensity: 0.65, sunIntensity: 1.05 },
    props: ['crystal', 'rock'], motes: '#7fe9ff',
  },
  wind: {
    id: 'wind', tile: '#824949', tileAlt: '#6d3d3d', grout: '#251212', rune: '#e0a35a', accent: '#ff5a4a', cliff: '#2d1414',
    atmosphere: { clearColor: c('#160609'), skyColor: c('#ffd9c2'), groundColor: c('#3d1418'), sunColor: c('#ffe2c4'), ambientIntensity: 0.6, sunIntensity: 1.15 },
    props: ['pillar', 'brazier'], motes: '#ffb36b',
  },
  stone: {
    id: 'stone', tile: '#878173', tileAlt: '#767064', grout: '#2e2b26', rune: '#a39a84', accent: '#ffd28a', cliff: '#2e2b26',
    atmosphere: { clearColor: c('#11100d'), skyColor: c('#fff0d6'), groundColor: c('#332c22'), sunColor: c('#fff0d6'), ambientIntensity: 0.6, sunIntensity: 1.2 },
    props: ['pillar', 'rock'], motes: '#ffe2a8',
  },
  void: {
    id: 'void', tile: '#4a4061', tileAlt: '#3e3554', grout: '#120e1c', rune: '#8e6cc8', accent: '#c278ff', cliff: '#160f22',
    atmosphere: { clearColor: c('#07040d'), skyColor: c('#d4c2ff'), groundColor: c('#22113a'), sunColor: c('#e8dcff'), ambientIntensity: 0.55, sunIntensity: 1.05 },
    props: ['crystal', 'pillar'], motes: '#c79bff',
  },
}

export function resolveArenaTheme(id: string | undefined): ArenaTheme {
  return ARENA_THEMES[id as ArenaThemeId] ?? ARENA_THEMES.default
}

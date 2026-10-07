// src/renderer/vfx/vfx-assets.ts
// Element palettes + texture choices. Textures under public/vfx/xiv are FINAL
// FANTASY XIV effect textures (© SQUARE ENIX) used for non-commercial fan purposes;
// every one is referenced only through this table so they can be swapped wholesale.
import { Color3, Texture, type Scene } from '@babylonjs/core'
import type { VfxElement } from '@/core/types'

export type VfxTex =
  | 'slash' | 'slashArc' | 'slashRing' | 'streak' | 'streakGold' | 'streakRed' | 'swordCross'
  | 'spark' | 'sparkB' | 'flashStar' | 'crescent' | 'flashGold' | 'burstFlower' | 'flashRays' | 'zan'
  | 'circleOrnate' | 'circleOctagon' | 'circleRose' | 'circleSym' | 'circleSimple'
  | 'fireOrb' | 'fireSmall' | 'flame' | 'fireMask'
  | 'iceCrystals' | 'iceShard' | 'iceMask' | 'icicle'
  | 'bolt' | 'boltPurple' | 'elcWeb'
  | 'holyFlare' | 'lightBurst' | 'lightCross' | 'lightPillar' | 'lightStar' | 'lensGlow'
  | 'darkMark' | 'darkAura' | 'darkWave' | 'darkFire'
  | 'ringThick' | 'ringThin' | 'ringMid' | 'shockSpike' | 'waveRing'
  | 'glow' | 'glowDisc' | 'orbGold' | 'softWhite' | 'glowRing'
  // Head markers / lock-ons
  | 'spreadArcs' | 'tankCrest' | 'ringAll' | 'ringBold' | 'chevronUp' | 'shareGlow'
  | 'arrowRed' | 'arrowBlue' | 'exclamation' | 'clockRing' | 'knockbackEmblem' | 'chevronTriple'

const FILES: Record<VfxTex, string> = {
  slash: 'ksk_mask_wide', slashArc: 'slash_arc_kiseki0', slashRing: 'kiseki_ring_tallon', streak: 'sla_streak',
  streakGold: 'ksk_yellow', streakRed: 'ksk_red', swordCross: 'swd_cross',
  spark: 'hit_spark_star', sparkB: 'hit_spark_star_bj', flashStar: 'flash_star', crescent: 'hit_crescent',
  flashGold: 'hit_flash_gold', burstFlower: 'hit_burst_flower', flashRays: 'flash_rays', zan: 'zan_hit',
  circleOrnate: 'magicc_ornate', circleOctagon: 'octagon_mahoujin', circleRose: 'rose_mahoujin', circleSym: 'sym_gss3', circleSimple: 'ring_thin_glow',
  fireOrb: 'fire_orb', fireSmall: 'sm_fire', flame: 'flame_single', fireMask: 'fire_mask',
  iceCrystals: 'ice_crystals', iceShard: 'ice_shard', iceMask: 'ice_mask', icicle: 'icicle_line',
  bolt: 'thunder_bolt', boltPurple: 'thunder_bolt_k', elcWeb: 'elc_web',
  holyFlare: 'holy_flare', lightBurst: 'light_burst', lightCross: 'light_cross', lightPillar: 'light_pillar', lightStar: 'light_star4', lensGlow: 'lens_glow',
  darkMark: 'dark_mark1', darkAura: 'aura_yami', darkWave: 'wave_dark', darkFire: 'fire_dark',
  ringThick: 'ring_thick_glow', ringThin: 'ring_thin_glow', ringMid: 'ring_mid', shockSpike: 'shock_spike', waveRing: 'wave_ring',
  glow: 'glow002', glowDisc: 'glow_disc', orbGold: 'light_orb_gold', softWhite: 'light_soft_white', glowRing: 'glow_ring',
  spreadArcs: 'spread_arcs', tankCrest: 'tank_mark_crest', ringAll: 'ring_all', ringBold: 'ring_thick', chevronUp: 'chevron_up', shareGlow: 'share_glow',
  arrowRed: 'arrow_red', arrowBlue: 'arrow_blue', exclamation: 'exclamation', clockRing: 'clock_ring', knockbackEmblem: 'knockback_emblem', chevronTriple: 'chevron_triple',
}

export interface ElementStyle {
  /** Main tint */
  color: Color3
  /** Hot core tint (near white) */
  core: Color3
  /** Projectile head sprite */
  orb: VfxTex
  /** Impact flash sprite */
  impact: VfxTex
  /** Small debris particles */
  debris: VfxTex
  /** Ground circle while casting */
  circle: VfxTex
  /** Particles rise (aura) or fall (debris) */
  gravity: number
}

const c = (hex: string) => Color3.FromHexString(hex)

export const ELEMENTS: Record<VfxElement, ElementStyle> = {
  physical: { color: c('#ffe2b0'), core: c('#ffffff'), orb: 'streak', impact: 'spark', debris: 'lightStar', circle: 'circleOctagon', gravity: -6 },
  fire: { color: c('#ff7a2e'), core: c('#ffe0a0'), orb: 'fireOrb', impact: 'flashGold', debris: 'fireSmall', circle: 'circleOrnate', gravity: 3 },
  ice: { color: c('#7fd8ff'), core: c('#e8fbff'), orb: 'iceShard', impact: 'flashStar', debris: 'iceShard', circle: 'circleOrnate', gravity: -8 },
  lightning: { color: c('#a98bff'), core: c('#f0e8ff'), orb: 'lensGlow', impact: 'flashStar', debris: 'lightStar', circle: 'circleSym', gravity: 0 },
  holy: { color: c('#ffe48a'), core: c('#ffffff'), orb: 'orbGold', impact: 'lightBurst', debris: 'lightStar', circle: 'circleOrnate', gravity: 2 },
  dark: { color: c('#b04cff'), core: c('#ffb8e0'), orb: 'darkMark', impact: 'crescent', debris: 'darkFire', circle: 'circleRose', gravity: 1.5 },
  wind: { color: c('#7fffc0'), core: c('#f0fff8'), orb: 'streak', impact: 'flashRays', debris: 'lightStar', circle: 'circleSym', gravity: 1 },
  water: { color: c('#4aa8ff'), core: c('#d8f0ff'), orb: 'glow', impact: 'waveRing', debris: 'glowDisc', circle: 'circleOctagon', gravity: -7 },
  earth: { color: c('#e0a050'), core: c('#fff0c8'), orb: 'iceShard', impact: 'burstFlower', debris: 'iceShard', circle: 'circleOctagon', gravity: -9 },
  aether: { color: c('#8fa8ff'), core: c('#f0f4ff'), orb: 'glow', impact: 'flashStar', debris: 'lightStar', circle: 'circleOrnate', gravity: 1 },
  heal: { color: c('#7dffa0'), core: c('#f0fff4'), orb: 'glow', impact: 'lightBurst', debris: 'lightStar', circle: 'circleRose', gravity: 2.5 },
  poison: { color: c('#9bff5a'), core: c('#f4ffe0'), orb: 'glow', impact: 'flashRays', debris: 'glowDisc', circle: 'circleSym', gravity: 1 },
}

/** Default element for enemy AOE bursts by arena theme */
export const THEME_ELEMENT: Record<string, VfxElement> = {
  default: 'aether', fire: 'fire', water: 'water', wind: 'fire', stone: 'earth', void: 'dark',
}

/** Textures authored as one quadrant (centre at the image's bottom-right), mirrored 4x when drawn */
export const QUARTER_TEXTURES = new Set<VfxTex>(['circleOrnate', 'spreadArcs'])

const cache = new WeakMap<Scene, Map<VfxTex, Texture>>()

export function vfxTexture(scene: Scene, key: VfxTex): Texture {
  let map = cache.get(scene)
  if (!map) { map = new Map(); cache.set(scene, map) }
  let tex = map.get(key)
  if (!tex) {
    tex = new Texture(`${import.meta.env.BASE_URL}vfx/xiv/${FILES[key]}.png`, scene, false, true, Texture.TRILINEAR_SAMPLINGMODE)
    tex.hasAlpha = true
    tex.wrapU = Texture.CLAMP_ADDRESSMODE
    tex.wrapV = Texture.CLAMP_ADDRESSMODE
    map.set(key, tex)
  }
  return tex
}

/** Warm the texture cache so the first cast doesn't hitch. */
export function preloadVfxTextures(scene: Scene): void {
  for (const key of Object.keys(FILES) as VfxTex[]) vfxTexture(scene, key)
}

// src/renderer/characters/model-catalog.ts
// Maps entities to glTF models (public/models, CC0 — see public/models/CREDITS.md)
// and maps abstract animation roles to each model's clip names.
import type { ModelKind } from './procedural-models'

export type AnimRole =
  | 'idle' | 'combatIdle' | 'move'
  | 'attack' | 'castLoop' | 'castRelease' | 'shoot'
  | 'hit' | 'death'

export interface WeaponAttachment {
  url: string
  /** Node in the character hierarchy to parent to (e.g. KayKit `handslot.r`) */
  slot: string
  position: [number, number, number]
  /** Euler radians */
  rotation: [number, number, number]
  scale: number
}

export interface ModelSpec {
  id: string
  /** Path under BASE_URL */
  url: string
  /** Rendered height in meters (model is uniformly scaled to fit) */
  height: number
  /** Candidate clip names per role; the first existing one wins, multiple attacks rotate */
  clips: Partial<Record<AnimRole, string[]>>
  /** Mesh node names to keep under weapon slots; every other slotted mesh is hidden */
  weapons?: string[]
  /** Parent nodes whose children count as weapon slots */
  weaponSlots?: string[]
  attach?: WeaponAttachment[]
  /** Albedo tint (CSS hex) for palette variants */
  tint?: string
  /** multiply (default): keeps texture detail; replace: drops the texture and recolours, sparing near-black materials (eyes, mouths) */
  tintMode?: 'multiply' | 'replace'
  /** Extra hover above ground (meters) for flying models */
  hover?: number
  /** Extra yaw (radians) when the asset's forward axis isn't +Z */
  yaw?: number
  /** Hit radius the authored height corresponds to (defaults: boss 1.5, others 0.6) */
  nominalRadius?: number
  /** Procedural placeholder while loading / on failure */
  placeholder: ModelKind
}

const KAYKIT_SLOTS = ['handslot.l', 'handslot.r']

const KAYKIT_COMMON: ModelSpec['clips'] = {
  idle: ['Idle'],
  combatIdle: ['2H_Melee_Idle', 'Idle'],
  move: ['Running_A'],
  hit: ['Hit_A', 'Hit_B'],
  death: ['Death_A'],
  castLoop: ['Spellcasting'],
  castRelease: ['Spellcast_Shoot', 'Spellcast_Raise'],
}

const KAYKIT_1H = { ...KAYKIT_COMMON, attack: ['1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Stab'], combatIdle: ['Idle'] }
const KAYKIT_2H = { ...KAYKIT_COMMON, attack: ['2H_Melee_Attack_Slice', '2H_Melee_Attack_Chop', '2H_Melee_Attack_Spin', '2H_Melee_Attack_Stab'] }

const MONSTER_BIG: ModelSpec['clips'] = {
  idle: ['Idle'], move: ['Walk'], attack: ['Weapon', 'Punch'], castLoop: ['Idle'], castRelease: ['Weapon', 'Punch'],
  hit: ['HitReact'], death: ['Death'],
}

export const MODELS: Record<string, ModelSpec> = {
  // --- Player archetypes (KayKit Adventurers, shared rig) ---
  'job:swordsman': {
    id: 'job:swordsman', url: 'models/characters/knight.glb', height: 2.0, placeholder: 'player',
    clips: KAYKIT_1H, weaponSlots: KAYKIT_SLOTS, weapons: ['1H_Sword', 'Round_Shield'],
  },
  'job:paladin': {
    id: 'job:paladin', url: 'models/characters/knight.glb', height: 2.0, placeholder: 'player',
    clips: KAYKIT_1H, weaponSlots: KAYKIT_SLOTS, weapons: ['1H_Sword', 'Badge_Shield'], tint: '#f4ead2',
  },
  'job:dark_knight': {
    id: 'job:dark_knight', url: 'models/characters/knight.glb', height: 2.05, placeholder: 'player',
    clips: KAYKIT_2H, weaponSlots: KAYKIT_SLOTS, weapons: ['2H_Sword'], tint: '#8a7fa6',
  },
  'job:warrior': {
    id: 'job:warrior', url: 'models/characters/barbarian.glb', height: 2.05, placeholder: 'player',
    clips: { ...KAYKIT_2H, attack: ['2H_Melee_Attack_Chop', '2H_Melee_Attack_Slice', '2H_Melee_Attack_Spin'] },
    weaponSlots: KAYKIT_SLOTS, weapons: ['2H_Axe'],
  },
  'job:samurai': {
    id: 'job:samurai', url: 'models/characters/rogue-hooded.glb', height: 1.95, placeholder: 'player',
    clips: { ...KAYKIT_COMMON, attack: ['1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal', '2H_Melee_Attack_Slice', '1H_Melee_Attack_Stab'], combatIdle: ['Idle'] },
    weaponSlots: KAYKIT_SLOTS, weapons: [], tint: '#e8d6d6',
    attach: [{ url: 'models/weapons/katana.glb', slot: 'handslot.r', position: [0, 0, 0], rotation: [0, 0, 0], scale: 0.32 }],
  },
  'job:archer': {
    id: 'job:archer', url: 'models/characters/rogue.glb', height: 2.0, placeholder: 'player',
    clips: { ...KAYKIT_COMMON, attack: ['1H_Ranged_Shoot'], shoot: ['1H_Ranged_Shoot'], combatIdle: ['1H_Ranged_Aiming', 'Idle'] },
    weaponSlots: KAYKIT_SLOTS, weapons: [],
    attach: [{ url: 'models/weapons/bow.glb', slot: 'handslot.l', position: [0, 0, 0], rotation: [0, 0, 0], scale: 0.38 }],
  },
  'job:bard': {
    id: 'job:bard', url: 'models/characters/rogue.glb', height: 2.0, placeholder: 'player',
    clips: { ...KAYKIT_COMMON, attack: ['1H_Ranged_Shoot'], shoot: ['1H_Ranged_Shoot'], combatIdle: ['1H_Ranged_Aiming', 'Idle'] },
    weaponSlots: KAYKIT_SLOTS, weapons: [], tint: '#f0d9b8',
    attach: [{ url: 'models/weapons/bow.glb', slot: 'handslot.l', position: [0, 0, 0], rotation: [0, 0, 0], scale: 0.38 }],
  },
  'job:thaumaturge': {
    id: 'job:thaumaturge', url: 'models/characters/mage.glb', height: 2.05, placeholder: 'player',
    clips: { ...KAYKIT_COMMON, attack: ['Spellcast_Shoot', '1H_Melee_Attack_Stab'] },
    weaponSlots: KAYKIT_SLOTS, weapons: ['1H_Wand', 'Spellbook_open'],
  },
  'job:black_mage': {
    id: 'job:black_mage', url: 'models/characters/mage.glb', height: 2.1, placeholder: 'player',
    clips: { ...KAYKIT_COMMON, attack: ['Spellcast_Shoot'] },
    weaponSlots: KAYKIT_SLOTS, weapons: ['2H_Staff'], tint: '#6b6f9c',
  },
  // white-mage.glb = mage.glb with its palette atlas recoloured (white robe, red lining, bronze staff).
  // `head` joins the slots so the wizard hat is filtered out like an unused weapon.
  'job:white_mage': {
    id: 'job:white_mage', url: 'models/characters/white-mage.glb', height: 2.05, placeholder: 'player',
    clips: { ...KAYKIT_COMMON, attack: ['Spellcast_Shoot'] },
    weaponSlots: [...KAYKIT_SLOTS, 'head'], weapons: ['2H_Staff'],
  },

  // --- Bosses (Quaternius Ultimate Monsters / poly.pizza) ---
  demon: { id: 'demon', url: 'models/monsters/demon.glb', height: 5, nominalRadius: 1.5, placeholder: 'sentinel', clips: MONSTER_BIG },
  fishman: { id: 'fishman', url: 'models/monsters/fishman.glb', height: 5, nominalRadius: 1.5, placeholder: 'sentinel', clips: MONSTER_BIG },
  tribal: { id: 'tribal', url: 'models/monsters/tribal.glb', height: 4.8, nominalRadius: 1.5, placeholder: 'sentinel', clips: MONSTER_BIG },
  dragon: {
    id: 'dragon', url: 'models/monsters/dragon.glb', height: 4.6, nominalRadius: 1.5, hover: 0.8, placeholder: 'sentinel',
    clips: { idle: ['Flying_Idle'], move: ['Fast_Flying'], attack: ['Headbutt', 'Punch'], castLoop: ['Flying_Idle'], castRelease: ['Punch', 'Headbutt'], hit: ['HitReact'], death: ['Death'] },
  },
  giant: {
    id: 'giant', url: 'models/monsters/giant.glb', height: 4.6, nominalRadius: 1.8, placeholder: 'sentinel',
    clips: { idle: ['Idle'], move: ['Walk'], attack: ['Attack'], castRelease: ['Attack'], hit: ['HitRecieve'], death: ['Death'] },
  },
  dummy: { id: 'dummy', url: 'models/monsters/dummy.glb', height: 2.6, nominalRadius: 1.5, placeholder: 'golem', clips: {} },

  // --- Adds ---
  'skeleton-minion': {
    id: 'skeleton-minion', url: 'models/monsters/skeleton-minion.glb', height: 1.8, placeholder: 'imp',
    clips: { idle: ['Idle'], combatIdle: ['Idle_Combat'], move: ['Running_C', 'Walking_D_Skeletons'], attack: ['1H_Melee_Attack_Chop', '1H_Melee_Attack_Stab'], castRelease: ['1H_Melee_Attack_Jump_Chop'], hit: ['Hit_A'], death: ['Death_C_Skeletons'] },
  },
  'skeleton-warrior': {
    id: 'skeleton-warrior', url: 'models/monsters/skeleton-warrior.glb', height: 2.3, placeholder: 'elite',
    clips: { idle: ['Idle'], combatIdle: ['Idle_Combat'], move: ['Running_C'], attack: ['2H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal'], castRelease: ['2H_Melee_Attack_Spin'], castLoop: ['Taunt'], hit: ['Hit_A', 'Hit_B'], death: ['Death_C_Skeletons'] },
  },
  'skeleton-mage': {
    id: 'skeleton-mage', url: 'models/monsters/skeleton-mage.glb', height: 1.9, placeholder: 'imp',
    clips: { idle: ['Idle'], combatIdle: ['Idle_Combat'], move: ['Walking_D_Skeletons'], attack: ['Spellcast_Shoot'], castLoop: ['Spellcasting'], castRelease: ['Spellcast_Summon', 'Spellcast_Shoot'], hit: ['Hit_A'], death: ['Death_C_Skeletons'] },
  },
  imp: {
    id: 'imp', url: 'models/monsters/imp.glb', height: 1.9, placeholder: 'imp',
    clips: { idle: ['Idle'], move: ['Run', 'Walk'], attack: ['Attack'], castRelease: ['Attack'], hit: ['HitRecieve'], death: ['Death'] },
  },
  bat: {
    id: 'bat', url: 'models/monsters/bat.glb', height: 1.6, hover: 0.9, placeholder: 'bat',
    clips: { idle: ['Bat_Flying'], move: ['Bat_Flying'], attack: ['Bat_Attack', 'Bat_Attack2'], castRelease: ['Bat_Attack2'], hit: ['Bat_Hit'], death: ['Bat_Death'] },
  },
  slime: {
    id: 'slime', url: 'models/monsters/slime.glb', height: 1.3, placeholder: 'imp',
    clips: { idle: ['Slime_Idle'], move: ['Slime_Walk'], attack: ['Slime_Attack'], castRelease: ['Slime_Attack'], death: ['Slime_Death'] },
  },
  firebird: {
    id: 'firebird', url: 'models/monsters/dragon.glb', height: 2.6, hover: 0.6, placeholder: 'bat', tint: '#ff8a5c', nominalRadius: 0.8,
    clips: { idle: ['Flying_Idle'], move: ['Fast_Flying'], attack: ['Headbutt', 'Punch'], castLoop: ['Flying_Idle'], castRelease: ['Punch'], hit: ['HitReact'], death: ['Death'] },
  },
  // The firebird circling the arena during 朱红旋律: larger and higher so it reads from the overview camera
  phoenix: {
    id: 'phoenix', url: 'models/monsters/dragon.glb', height: 4.2, hover: 2, placeholder: 'bat', tint: '#ffb066', nominalRadius: 0.8,
    clips: { idle: ['Fast_Flying'], move: ['Fast_Flying'], death: ['Death'] },
  },
  feather: {
    id: 'feather', url: 'models/props/crystal.glb', height: 1.8, hover: 0.5, placeholder: 'bat', tint: '#ff9a52', tintMode: 'replace', nominalRadius: 0.6,
    clips: {},
  },
  // Titan: the Heart (P3 DPS check) and the Granite Gaolers
  'titan-heart': {
    id: 'titan-heart', url: 'models/props/big-crystal.glb', height: 3, nominalRadius: 1.2, hover: 0.6, placeholder: 'golem', tint: '#e0a24a', tintMode: 'replace', clips: {},
  },
  gaoler: {
    id: 'gaoler', url: 'models/monsters/giant.glb', height: 3.2, nominalRadius: 1.4, placeholder: 'sentinel', tint: '#9a9184',
    clips: { idle: ['Idle'], move: ['Walk'], attack: ['Attack'], castRelease: ['Attack'], hit: ['HitRecieve'], death: ['Death'] },
  },
  // Granite Gaol: a boulder encasing a party member. The rock is ~2.5× wider than tall, so keep it low
  jail: {
    id: 'jail', url: 'models/props/rock-large.glb', height: 1.1, nominalRadius: 1, placeholder: 'golem', tint: '#a89a86', tintMode: 'replace', clips: {},
  },
  'slime-frost': {
    id: 'slime-frost', url: 'models/monsters/slime.glb', height: 1.3, placeholder: 'imp', tint: '#8fd0ff', tintMode: 'replace',
    clips: { idle: ['Slime_Idle'], move: ['Slime_Walk'], attack: ['Slime_Attack'], castRelease: ['Slime_Attack'], death: ['Slime_Death'] },
  },
  spider: {
    id: 'spider', url: 'models/monsters/spider.glb', height: 1.2, placeholder: 'imp',
    clips: { idle: ['Spider_Idle'], move: ['Spider_Walk'], attack: ['Spider_Attack'], castRelease: ['Spider_Attack'], death: ['Spider_Death'] },
  },
}

export interface ModelQuery {
  type: string
  /** Entity.model from YAML (`model:`) or the player's `job:<id>` */
  model?: string
  size: number
}

/** Pick the model for an entity: explicit id first, then sensible defaults by type and size. */
export function resolveModel(q: ModelQuery): ModelSpec {
  if (q.model && MODELS[q.model]) return MODELS[q.model]
  if (q.type === 'player') return MODELS['job:warrior']
  if (q.type === 'boss') return MODELS.tribal
  if (q.type === 'mob') return q.size >= 1 ? MODELS['skeleton-warrior'] : MODELS['skeleton-minion']
  return MODELS['skeleton-minion']
}

/**
 * Non-player models scale with their hit radius relative to the radius the
 * model was authored for, so a size-2.2 tower boss reads bigger than a size-1.2 add.
 */
export function modelScaleFor(spec: ModelSpec, q: ModelQuery): number {
  if (q.type === 'player') return VISUAL_SCALE
  const nominal = spec.nominalRadius ?? (q.type === 'boss' ? 1.5 : 0.6)
  return VISUAL_SCALE * Math.max(0.7, Math.min(1.6, q.size / nominal))
}

/**
 * Characters are drawn larger than life (chibi proportions under a distant camera).
 * Purely visual: hit radius, feet dot and rings keep their real sizes.
 */
export const VISUAL_SCALE = 1.3

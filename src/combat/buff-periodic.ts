// src/combat/buff-periodic.ts
import type { BuffDef, BuffEffectDef } from '@/core/types'
import type { BuffInstance, Entity, PeriodicState } from '@/entity/entity'
import type { BuffSystem } from './buff'
import { calculateDamage } from './damage'

/**
 * Narrowed BuffEffectDef type within the periodic effect scope.
 * Only these three effect types trigger periodic ticks.
 */
export type PeriodicEffectDef =
  | { type: 'dot'; potency: number; interval: number }
  | { type: 'hot'; potency: number; interval: number }
  | { type: 'mp_regen'; potency: number; interval: number }

/**
 * Type guard: checks if a BuffEffectDef is a periodic effect type.
 */
export function isPeriodicEffect(effect: BuffEffectDef): effect is PeriodicEffectDef {
  return effect.type === 'dot' || effect.type === 'hot' || effect.type === 'mp_regen'
}

/**
 * Build a periodic snapshot.
 * - dot / hot: freeze caster's attack + damage_increase buffs + effect potency
 * - mp_regen: freeze target.maxMp + effect potency (caster data not involved)
 */
export function buildPeriodicSnapshot(
  effect: PeriodicEffectDef,
  caster: Entity,
  target: Entity,
  buffSystem: BuffSystem,
): PeriodicState['snapshot'] {
  if (effect.type === 'mp_regen') {
    return {
      attack: 0,
      casterIncreases: [],
      potency: effect.potency,
      targetMaxMp: target.maxMp,
    }
  }
  // dot / hot
  return {
    attack: caster.attack,
    casterIncreases: buffSystem.getDamageIncreases(caster),
    potency: effect.potency,
  }
}

/**
 * Apply a periodic buff to target.
 * - If target already has same buffId instance: remove it directly (no compensation tick fired)
 * - Build new snapshot + nextTickAt = gameTime + interval
 * - Does NOT fire the first tick immediately
 *
 * Assumes buffDef.effects contains at most one periodic effect (phase 3 constraint).
 */
export function applyPeriodicBuff(
  target: Entity,
  buffDef: BuffDef,
  caster: Entity,
  gameTime: number,
  buffSystem: BuffSystem,
): void {
  const periodicEffect = buffDef.effects.find(isPeriodicEffect)
  if (!periodicEffect) {
    throw new Error(`applyPeriodicBuff: buff ${buffDef.id} has no periodic effect`)
  }

  // Refresh: remove old instance directly (no pending tick fire, no removed event).
  const existingIdx = target.buffs.findIndex((b) => b.defId === buffDef.id)
  if (existingIdx >= 0) {
    target.buffs.splice(existingIdx, 1)
  }

  // Register def on buffSystem if not yet (parity with applyBuff's behavior).
  buffSystem.registerDef(buffDef)

  const snapshot = buildPeriodicSnapshot(periodicEffect, caster, target, buffSystem)
  const baseDuration = buffDef.duration
  // Match BuffSystem.applyBuff: +500ms grace so last tick at exact expireAt can fire.
  const effectiveDuration = baseDuration > 0 ? baseDuration + 500 : 0

  // Phase 3 constraints:
  // - stacks is always 1 (stackable periodic buffs not yet supported)
  // - damageType is intentionally omitted; spec §5.2 treats it as a future hook
  //   for UI / death log / element resistance. T05 firePeriodicTick must not
  //   assume it is set. If needed later, populate it here from the skill
  //   effect metadata.
  target.buffs.push({
    defId: buffDef.id,
    sourceId: caster.id,
    remaining: effectiveDuration,
    stacks: 1,
    periodic: {
      nextTickAt: gameTime + periodicEffect.interval,
      interval: periodicEffect.interval,
      effectType: periodicEffect.type,
      snapshot,
      sourceCasterId: caster.id,
    },
  })
}

/**
 * Single periodic tick settlement.
 * - dot: caster snapshot (attack + casterIncreases) + target LIVE vulnerability
 *   merged into calculateDamage `increases`; target LIVE mitigations go into
 *   `mitigations`. Result subtracted from target.hp, clamped to [0, maxHp].
 * - hot: caster snapshot only (attack + casterIncreases) goes through
 *   calculateDamage for amplification — no mitigation, no vulnerability for
 *   heals. Added to target.hp, clamped to target.maxHp.
 * - mp_regen: independent calculation, snapshot.targetMaxMp × snapshot.potency;
 *   clamped to target.maxMp.
 *
 * No-op if inst.periodic is missing.
 */
export function firePeriodicTick(
  inst: BuffInstance,
  target: Entity,
  buffSystem: BuffSystem,
): void {
  const p = inst.periodic
  if (!p) return
  const snap = p.snapshot

  switch (p.effectType) {
    case 'dot': {
      // Invulnerability / damage immunity: DoT tick negated (same rule as
      // combat-resolver.applyDamage). Phase 3 DoT has no 'special' type,
      // so the special-bypass branch is intentionally omitted.
      if (buffSystem.isInvulnerable(target) || buffSystem.hasDamageImmunity(target)) {
        return
      }
      // dot pipeline: snapshot attack / increases frozen at apply-time;
      // vulnerability & mitigations read LIVE from target.
      let dmg = calculateDamage({
        attack: snap.attack,
        potency: snap.potency,
        increases: [
          ...snap.casterIncreases,
          buffSystem.getVulnerability(target),
        ],
        mitigations: buffSystem.getMitigations(target),
      })
      // Shield absorption (shields absorb DoT ticks too, FF14 behavior).
      dmg = buffSystem.absorbShield(target, dmg)
      // Undying: clamp HP floor to 1 instead of 0.
      if (buffSystem.isUndying(target)) {
        target.hp = Math.max(1, target.hp - dmg)
      } else {
        target.hp = Math.max(0, target.hp - dmg)
      }
      // Emit damage:dealt so UI (hit-effect renderer, damage number spawner,
      // event log) can react to DoT ticks. Source is a partial stub carrying
      // only the caster id — we don't have the Entity reference here. The
      // periodic: true flag lets consumers filter / style ticks distinctly
      // (e.g. lighter-color damage number) vs direct hits.
      buffSystem.eventBus.emit('damage:dealt', {
        source: { id: p.sourceCasterId } as Entity,
        target,
        amount: dmg,
        skill: { name: 'DoT' },
        periodic: true,
      })
      break
    }
    case 'hot': {
      // hot pipeline: reuse calculateDamage for amplification math, but no
      // mitigation / vulnerability applies to healing.
      const heal = calculateDamage({
        attack: snap.attack,
        potency: snap.potency,
        increases: snap.casterIncreases,
        mitigations: [],
      })
      target.hp = Math.min(target.maxHp, target.hp + heal)
      // Emit heal via damage:dealt with negative amount (existing convention
      // used by lifesteal / heal effects in combat-resolver.ts).
      buffSystem.eventBus.emit('damage:dealt', {
        source: { id: p.sourceCasterId } as Entity,
        target,
        amount: -heal,
        skill: { name: 'HoT' },
        periodic: true,
      })
      break
    }
    case 'mp_regen': {
      // mp_regen is independent of damage pipeline: % of targetMaxMp.
      // No event emitted: no current consumer. A dedicated event can be added
      // later if UI needs to surface MP regen ticks.
      const amount = (snap.targetMaxMp ?? 0) * snap.potency
      target.mp = Math.min(target.maxMp, target.mp + amount)
      break
    }
  }
}

/**
 * Per-frame tick dispatcher. Iterates entities and their periodic buffs,
 * firing ticks whose nextTickAt has been reached.
 *
 * Uses a while loop to catch up dropped frames (e.g. pause/resume or heavy frames).
 * Buff expiration is handled elsewhere by `BuffSystem.update(entity, dt)` —
 * once `remaining` hits 0 the buff is spliced out of entity.buffs, so a subsequent
 * call to tickPeriodicBuffs naturally skips it. The 500ms grace applied at buff
 * apply time ensures the last scheduled tick (at exact duration boundary) fires
 * before expiration in the same frame.
 *
 * Skips entities with `alive: false` — dead targets do not take DoT ticks,
 * dead self-targets do not regenerate.
 *
 * Call from the main game loop once per frame with GameLoop.logicTime as gameTime.
 */
export function tickPeriodicBuffs(
  entities: Entity[],
  gameTime: number,
  buffSystem: BuffSystem,
): void {
  for (const entity of entities) {
    if (!entity.alive) continue  // Dead entities don't take/fire periodic effects
    for (const inst of entity.buffs) {
      if (!inst.periodic) continue
      while (gameTime >= inst.periodic.nextTickAt) {
        firePeriodicTick(inst, entity, buffSystem)
        inst.periodic.nextTickAt += inst.periodic.interval
      }
    }
  }
}

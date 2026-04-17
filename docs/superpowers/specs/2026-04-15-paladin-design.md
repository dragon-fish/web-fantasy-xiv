# Paladin (骑士) Job Design

## Overview

Paladin is a tank job that alternates between physical melee and magical ranged phases. Two mutually-enhancing buff resources drive a rhythm: melee builds stacks consumed by magic, magic builds stacks consumed by melee.

- **Category**: Tank
- **Stats**: HP 10,000 / MP 10,000 / ATK 900 / SPD default
- **Auto-attack**: Physical melee, potency 1.0, interval 3.0s

## Buff Definitions

### 安魂祈祷 (Requiescat) `pld_requiescat`

| Field | Value |
|-------|-------|
| Type | buff |
| Stackable | yes, max 4 |
| Duration | 21s |
| Effects | none (pure resource counter) |

Built by skill 1 (先锋剑), consumed by skill 2 (圣灵) for instant cast.

### 战逃反应 (Fight or Flight) `pld_fof`

| Field | Value |
|-------|-------|
| Type | buff |
| Stackable | yes, max 4 |
| Duration | 21s |
| Effects | none (pure resource counter) |

Built by skill 2 (圣灵), consumed by skill 1 (先锋剑) for +25% potency and 2000 MP restore.

### 神圣领域 (Hallowed Ground) `pld_hallowed`

| Field | Value |
|-------|-------|
| Type | buff |
| Duration | 10s |
| Stackable | no |
| Effects | `invulnerable` (new effect type) |

All non-`special` attacks are fully negated (no damage calculation, no displacement). Floating text shows gray "无效" instead of a number.

## Skill Definitions

### Skill 1 — 先锋剑 (Vanguard Blade)

| Field | Value |
|-------|-------|
| Type | weaponskill |
| GCD | yes |
| Cast time | 0 (instant) |
| Range | melee |
| MP cost | 0 |
| Potency | 2.0 |
| Target | single, requires target |

Effects:
- `damage`: potency 2.0, physical
- `apply_buff`: `pld_requiescat` +1 stack to caster

Buff interaction — `potencyWithBuff` (new field):
- `buffId`: `pld_fof`
- `damageIncrease`: 0.25 (additive, added to `increases` list per damage formula)
- `consumeStack`: true (consume 1 stack)
- `restoreMp`: 2000 (flat MP restore on consumption)

When 战逃反应 stacks exist: consume 1 → +0.25 added to increases (additive with other buffs) + restore 2000 MP.
When no stacks: normal 2.0 potency hit, no MP restore.

### Skill 2 — 圣灵 (Holy Spirit)

| Field | Value |
|-------|-------|
| Type | spell |
| GCD | yes |
| Cast time | 2500ms |
| Range | 25 |
| MP cost | 2250 |
| Potency | 3.0 |
| Target | single, requires target |

Effects:
- `damage`: potency 3.0, magical
- `heal`: potency 0.5 to caster (0.5 × 900 = 450 HP)
- `apply_buff`: `pld_fof` +1 stack to caster

Buff interaction — `castTimeWithBuff` (existing field):
- `buffId`: `pld_requiescat`
- `castTime`: 0 (instant)
- `consumeStack`: true (consume 1 stack)

When 安魂祈祷 stacks exist: consume 1 → instant cast.
When no stacks: normal 2.5s cast.

### Skill 3 — 投盾 (Shield Lob)

| Field | Value |
|-------|-------|
| Type | weaponskill |
| GCD | yes |
| Cast time | 0 (instant) |
| Range | 20 |
| MP cost | 0 |
| Potency | 0.5 |
| Target | single, requires target |

Effects:
- `damage`: potency 0.5, physical

Stop-loss filler for when melee range is unavailable. Does not interact with any buffs.

### Skill 4 — 深仁厚泽 (Clemency)

| Field | Value |
|-------|-------|
| Type | spell |
| GCD | yes |
| Cast time | 1800ms |
| Range | self |
| MP cost | 3500 |
| Potency | 5.0 (heal) |
| Target | self |

Effects:
- `heal`: potency 5.0 to caster (5.0 × 900 = 4500 HP, 45% of max)

Pure defensive option. High MP cost discourages spam — one cast costs more than a full 圣灵 hit and cuts into DPS rotation.

### Skill 5 — 神圣领域 (Hallowed Ground)

| Field | Value |
|-------|-------|
| Type | ability (oGCD) |
| GCD | no |
| Cooldown | 420s |
| Cast time | 0 (instant) |
| Range | self |
| MP cost | 0 |
| Target | self |

Effects:
- `apply_buff`: `pld_hallowed` to caster (10s duration)

Ultimate defensive cooldown. Can be weaved between GCDs without disrupting rotation.

## New Mechanics Required

### 1. `potencyWithBuff` field on SkillDef

```typescript
potencyWithBuff?: {
  buffId: string
  damageIncrease: number  // 0.25 → added to increases list (additive, not multiplicative)
  consumeStack: boolean
  restoreMp?: number      // flat MP restore on consumption
}
```

Symmetrical to existing `castTimeWithBuff`. Checked during damage resolution:
- If buff stacks > 0 and `consumeStack`: consume 1 stack, add `damageIncrease` to the `increases` list (additive with other damage buffs per formula), restore `restoreMp` if defined.
- If buff stacks = 0: no effect.
- Follows the damage formula: `attack × potency × (1 + sum_of_increases)` — only mitigations are multiplicative.

### 2. `invulnerable` buff effect type

```typescript
{ type: 'invulnerable' }
```

Checked at the top of `applyDamage` in CombatResolver, before any damage calculation:
1. If target has `invulnerable` buff AND damage type is NOT `special`:
   - Skip all damage calculation (no mitigation, no shield, no undying)
   - Skip all displacement effects (knockback, pull)
   - Emit a dedicated event for gray "无效" floating text
2. If damage type includes `special`: bypass invulnerable, proceed normally

## Balance Verification

### Optimal Rotation

4× 先锋剑 → 4× 圣灵 (instant) → repeat. 8 GCD = 20s per cycle.

### 60s Theoretical Damage

| Source | Count | Damage/Hit | Total |
|--------|-------|------------|-------|
| Auto-attack | 20 | 900 | 18,000 |
| 先锋剑 (cycle 1, no buff) | 4 | 1,800 | 7,200 |
| 先锋剑 (cycle 2-3, +25%) | 8 | 2,250 | 18,000 |
| 圣灵 (all cycles) | 12 | 2,700 | 32,400 |
| **Total** | | | **75,600** |

75,600 / 68,000 = **1.112x** baseline ✓ (target ~1.10x, within 0.95–1.15 range)

### MP Sustainability

| Per cycle (20s) | Amount |
|-----------------|--------|
| 圣灵 ×4 cost | -9,000 |
| 战逃反応 ×4 restore | +8,000 |
| Net | -1,000 |

1,000 MP deficit per 20s covered by natural MP regeneration.

### Degenerate Rotation Check

Spam 先锋剑 only (no magic phase): 24 × 1,800 + 18,000 = 61,200 → 0.90x (penalty for ignoring rotation)

Spam 圣灵 only (hardcast, no instant): 12 × 2,700 + 18,000 = 50,400 → 0.74x (heavy penalty + OOM quickly)

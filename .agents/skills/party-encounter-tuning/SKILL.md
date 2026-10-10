---
name: party-encounter-tuning
description: Verify and tune a party (player + 3 NPC) encounter by letting the NPCs play it at high speed with a simulated player — phase timings, NPC deaths, mechanic hits, DPS checks. Use after writing or changing a party encounter's YAML, NPC rules or numbers.
---

# Party encounter tuning

Read numbers off real runs instead of reasoning about them: the NPC brain, damage director, enmity
and mechanics interact in ways the YAML does not show.

## 1. Simulated run

Dev builds expose `globalThis.__gameScene` (GameScene) and `globalThis.__battle.seek()`. In a
browser automation session:

1. **Pick the player's job before the page loads**: set `localStorage['xiv-selected-job']` (a fresh
   browser context otherwise starts on the default job, a tank). Use an unremarkable DPS: a tank or
   healer player changes who holds aggro and who heals.
2. **Simulate an average player, not an absent one.** Wrap `scene.onLogicTick` to:
   - keep the player at full HP and glued next to the NPC healer (it stays a party member, so marks
     and gaols can still land on it);
   - deal a flat amount per second to the current priority target (heart → gaol → adds → boss),
     skipped while stunned or untargetable.

   An invisible or neutral player skews targeted mechanics; a player dealing nothing fails every DPS
   check by design.
3. **Speed it up**: `scene.gameLoop.timeScale = 6`. Pull by emitting a 1-damage `damage:dealt` from
   an NPC to the boss.
4. **Log, don't watch**: collect `phase:activated`, `entity:died` (NPCs), `damage:dealt` filtered to
   avoidable mechanics, and `combat:ended`, each stamped with `scene.getCombatElapsed()`.

Read the result as: clear time, per-phase duration, who died to what, which mechanics hit NPCs.

## 2. What the numbers mean

- `party.targetTime` paces NPC damage against boss HP only. Pauses (invulnerable heart phases,
  gaols, adds, set-piece jumps) come on top: the real clear runs that much longer. Size the soft
  enrage against the real clear, not `targetTime`.
- A DPS check must pass with margin for an average player and fail with an idle one (Titan Hard's
  heart: ~19 s of its 30 s with a 700 DPS player).
- One NPC death per run is noise (NPCs fumble by design: `mistakeRate`, tanks/healers a third of
  it). Repeated deaths to the same mechanic mean the NPC rules or the layout are wrong — fix those,
  not the damage.

## 3. Jumping to a phase

Lower the boss's HP and emit `damage:dealt` to trip an HP trigger. Phases with an `hpFloor` lock
the boss at their floor, so cross one threshold per step (wait a few hundred ms between steps).
`__battle.seek(<seconds|checkpoint>)` moves within the current timeline and fast-forwards lasting
state (arena changes, visibility, positions).

## 4. Before calling it done

- Run at least one full clear per difficulty after the last numbers change.
- Check the timeline panel and the console for duplicate-key or missing-skill warnings while
  `choose:` sets resolve.
- Have the human play it: simulated runs prove the fight is clearable, not that it feels right.

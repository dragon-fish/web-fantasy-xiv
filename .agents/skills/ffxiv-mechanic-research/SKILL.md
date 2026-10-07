---
name: ffxiv-mechanic-research
description: Research how an FFXIV encounter actually plays — cactbot timelines and triggers for timing and ability ids, xivapi sheets for names/ranges/cast times, Huiji Wiki for Chinese names and strategy. Use before designing or replicating a boss fight, mechanic or status effect.
---

# FFXIV mechanic research

Same fair-use rules as `ffxiv-asset-sourcing`: serial requests, cache what you read, never bypass
anti-bot pages.

## 1. Timeline and logic: cactbot

Repo `OverlayPlugin/cactbot`, folder `ui/raidboss/data/<NN-expansion>/<content type>/`
(e.g. `04-sb/trial/suzaku-ex.txt` + `suzaku-ex.ts`). Read via
`gh api repos/OverlayPlugin/cactbot/contents/<path> --jq .content | base64 -d` or
`raw.githubusercontent.com`.

**`.txt` timeline** — one line per boss action, seconds from pull:

```
33.5 "Fleeting Summer" Ability { id: "32D3", source: "Suzaku" }
107.8 "Eternal Flame" Ability { id: "3222", source: "Suzaku" } # drift 0.023
125.1 "--sync--" Ability { id: "3226", source: "Suzaku" }
```

- `id` is the Action row in **hex** (convert to decimal for xivapi).
- `--untargetable--` / `--targetable--` mark phase transitions; `jump <t>` marks loops;
  `label` + `forcejump` mark branches. Alternative sequences for one slot = the fight's preset
  "random" variants.
- `window a,b` / `--sync--` are re-sync aids, not gameplay.

**`.ts` triggers** — how each mechanic resolves (which player is targeted, safe spots, headmarker
ids, tether ids) plus `timelineReplace` with localized names (including `cn`).

## 2. Numbers and names: xivapi sheets

See `ffxiv-asset-sourcing` §2 for bases. Useful fields:

- `Action/<dec id>?fields=Name,Cast100ms,Range,EffectRange,CastType,Icon` — cast time
  (×100 ms), targeting range, AoE size and shape class.
- `Status/<id>?fields=Name,Description,Icon` — buff/debuff names and icons.
- The China mirror returns Chinese names by default — use it for in-game wording.

## 3. Context and community names: Huiji Wiki

`https://ff14.huijiwiki.com` has Chinese fight pages, mechanic write-ups and player nicknames
(e.g. 鸳鸯锅). It serves a JavaScript challenge to non-browser clients: read it through a real
browser session or ask the user to paste the relevant section.

## 4. FFXIV design facts to preserve when replicating

- "Random" means one of a few fixed presets per slot, not free randomness.
- Damage resolves at cast end in a single frame; multi-hit animations are visual only.
- AoE checks are infinite-height cylinders — airborne players are still hit.
- A mechanic's first occurrence is a slower, weaker tutorial; later casts combine mechanics.
- Gap closers land just inside the target's hitbox ring; ranges are measured to the hitbox edge.

---
name: ffxiv-asset-sourcing
description: Find and fetch FINAL FANTASY XIV game assets (icons, status icons, VFX textures, UI parts) by game path — xivapi asset/sheet endpoints, ResLogger2 path discovery, community h5ai mirrors. Use when a feature needs an original FFXIV texture or icon, or when an asset path is unknown.
---

# FFXIV asset sourcing

## Ground rules

- **Fair use.** Requests are serial, spaced ≥1s apart, and cached locally. Fetch only the files you
  need; list mirror directories one level at a time and never walk a whole tree. Do not work around
  anti-bot challenge pages — use a real browser session or ask the user instead.
- **Licensing.** Game assets are © SQUARE ENIX, usable only for non-commercial fan work. Keep a
  NOTICE beside them and reference every file through one lookup table so the set can be swapped.
  Community uploads may be fan-made recreations (check the file name/author): credit them, or redraw
  the design yourself rather than vendoring someone's artwork.

## 1. Know the path

Everything is addressed by its game path (`ui/icon/...tex`, `vfx/.../texture/...atex`).

- **Icons** from a sheet row: the sheet API returns `Icon.path_hr1` directly (see §2). From a bare
  icon id: `ui/icon/{floor(id/1000)*1000 as 6 digits}/{id as 6 digits}_hr1.tex`
  (e.g. 15273 → `ui/icon/015000/015273_hr1.tex`).
- **Anything else (VFX, UI parts):** search the ResLogger2 path list —
  `https://rl2.perchbird.dev/download/export/CurrentPathList.gz` (~8 MB gz, ~1.8 M known paths).
  Download once, cache, grep keywords. Example: target ring → `grep -i tar_ring` →
  `vfx/common/eff/tar_ring0af.avfx` + `vfx/common/texture/tar_ring{0,1,2}f.atex`.
- **Common VFX catalogue:** `0ceal0t/Dalamud-VFXEditor` → `VFXEditor/Files/common_vfx` (lock-ons,
  omens, channeling tethers) is a curated starting list.
- An `.avfx` is not downloadable through xivapi; find its textures by the shared stem in the path
  list (`tar_ring0af.avfx` ↔ `tar_ring*.atex`).

## 2. Fetch it (xivapi v2)

| Endpoint | Use |
| --- | --- |
| `GET {base}/api/asset?path=<game path>&format=png` | Convert `.tex` / `.atex` to an image |
| `GET {base}/api/sheet/<Sheet>/<row>?fields=Name,Icon` | One row (Action, Status, BNpcName…) |
| `GET {base}/api/search?sheets=Status&query=Name~"<text>"&fields=Name,Icon` | Find rows by name |

Bases:

- Global `https://v2.xivapi.com` — English by default (`language=ja|de|fr`); newest game data.
- China mirror `https://xivapi-v2.xivcdn.com` — Chinese names by default (`language=chs`). Its
  asset endpoint may answer `format=png` with **webp** bytes (check the content type), and some
  VFX paths 404 there while the global base has them — fall back to the global base.

`{"code":404,...}` JSON instead of image bytes means the path is unknown to that base; `400`
means the type cannot be served (e.g. `.avfx`).

## 3. Community mirrors (h5ai)

Curated packs (e.g. `https://resources.yyyy.games/`: skill/status/job icons, head markers, HUD
sheets, fan-made AoE marker recreations) are often served by h5ai. List one directory:

```
POST https://<host>/
Content-Type: application/json

{"action":"get","items":{"href":"/<url-encoded dir>/","what":1}}
```

`items[]` holds `href` (URL-encoded; trailing `/` = directory) and `size`. Read any
`说明.txt` / `出处.url` / disclaimer in the folder before using its files.

## 4. Using what you get

- VFX textures are mostly **grayscale masks or partial pieces** (a quadrant, half an arrow, an arc
  segment). The `.avfx` mirrors, tints and composes them at runtime, so expect to recompose:
  mirror quadrant textures 4×, multiply by a tint, draw additively.
- Black-backed masks vanish on bright floors; add a dark underlay or use alpha blending when
  readability matters more than fidelity.
- `_hr1` icons are the 2× variant; prefer them.

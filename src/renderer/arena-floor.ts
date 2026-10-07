// src/renderer/arena-floor.ts
// Procedural arena floor: stone tiles + engraved rune circle, drawn once on a
// canvas at scene load. Produces diffuse, emissive (rune glow) and normal maps
// that share the ground mesh UVs (0..1 across the arena's bounding square).
import { DynamicTexture, Texture, type Scene } from '@babylonjs/core'
import type { ArenaTheme } from './arena-theme'

export interface FloorTextures {
  diffuse: DynamicTexture
  emissive: DynamicTexture
  normal: DynamicTexture
}

interface FloorShape {
  kind: 'circle' | 'rect'
  /** World extent covered by the texture (meters) */
  width: number
  height: number
}

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function shade(hex: string, k: number, jitter = 0): string {
  const [r, g, b] = hexToRgb(hex)
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k + jitter)))
  return `rgb(${f(r)},${f(g)},${f(b)})`
}

/** Tile outline paths in texture pixel space, plus the per-tile base colour. */
interface Tile { path: Path2D; color: string; cx: number; cy: number }

function circleTiles(size: number, radiusPx: number, pxPerM: number, theme: ArenaTheme, rand: () => number): Tile[] {
  const tiles: Tile[] = []
  const c = size / 2
  const ringWidth = 2.4 * pxPerM
  const centerR = 2.2 * pxPerM
  // Center medallion
  const center = new Path2D()
  center.arc(c, c, centerR, 0, Math.PI * 2)
  tiles.push({ path: center, color: shade(theme.tileAlt, 1.08), cx: c, cy: c })
  let inner = centerR
  let ringIndex = 0
  while (inner < radiusPx + ringWidth) {
    const outer = inner + ringWidth
    const mid = (inner + outer) / 2
    const segments = Math.max(6, Math.round((Math.PI * 2 * mid) / (3.2 * pxPerM)))
    const offset = ringIndex % 2 === 0 ? 0 : Math.PI / segments
    for (let i = 0; i < segments; i++) {
      const a0 = offset + (i / segments) * Math.PI * 2
      const a1 = offset + ((i + 1) / segments) * Math.PI * 2
      const p = new Path2D()
      p.arc(c, c, outer, a0, a1)
      p.arc(c, c, inner, a1, a0, true)
      p.closePath()
      const base = rand() < 0.5 ? theme.tile : theme.tileAlt
      const am = (a0 + a1) / 2
      tiles.push({ path: p, color: shade(base, 0.9 + rand() * 0.2, (rand() - 0.5) * 8), cx: c + Math.cos(am) * mid, cy: c + Math.sin(am) * mid })
    }
    inner = outer
    ringIndex++
  }
  return tiles
}

function gridTiles(w: number, h: number, pxPerM: number, theme: ArenaTheme, rand: () => number): Tile[] {
  const tiles: Tile[] = []
  const step = 2.5 * pxPerM
  for (let y = 0, row = 0; y < h; y += step, row++) {
    const shift = row % 2 === 0 ? 0 : step / 2
    for (let x = -shift; x < w; x += step) {
      const p = new Path2D()
      p.rect(x, y, step, step)
      const base = rand() < 0.5 ? theme.tile : theme.tileAlt
      tiles.push({ path: p, color: shade(base, 0.9 + rand() * 0.2, (rand() - 0.5) * 8), cx: x + step / 2, cy: y + step / 2 })
    }
  }
  return tiles
}

/** Concentric rune circle + cardinal markers, stroked with `style`. */
function drawRunes(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, pxPerM: number, style: string, rand: () => number, glyphs: boolean) {
  ctx.save()
  ctx.strokeStyle = style
  ctx.fillStyle = style
  ctx.lineCap = 'round'
  const lw = Math.max(2, 0.08 * pxPerM)
  ctx.lineWidth = lw
  const ring = (rr: number, w = lw) => { ctx.lineWidth = w; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke() }
  const r1 = r * 0.28, r2 = r * 0.34, r3 = r * 0.62, r4 = r * 0.66
  ring(r1); ring(r2, lw * 0.6); ring(r3, lw * 0.6); ring(r4)
  // Octagram between r1 and r3
  for (const rot of [0, Math.PI / 8]) {
    ctx.lineWidth = lw * 0.7
    ctx.beginPath()
    for (let i = 0; i <= 8; i++) {
      const a = rot + (i * 3 * Math.PI * 2) / 8
      const x = cx + Math.cos(a) * r3 * 0.97, y = cy + Math.sin(a) * r3 * 0.97
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  // Radial ticks on the outer band
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2
    const long = i % 9 === 0
    const a0 = r4 + lw * 2, a1 = r4 + (long ? 0.9 : 0.4) * pxPerM
    ctx.lineWidth = long ? lw : lw * 0.5
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * a0, cy + Math.sin(a) * a0)
    ctx.lineTo(cx + Math.cos(a) * a1, cy + Math.sin(a) * a1)
    ctx.stroke()
  }
  if (glyphs) {
    // Pseudo-glyph band between r1 and r2
    const band = (r1 + r2) / 2, gh = (r2 - r1) * 0.55
    const count = Math.max(16, Math.round((Math.PI * 2 * band) / (0.7 * pxPerM)))
    ctx.lineWidth = lw * 0.45
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      ctx.save()
      ctx.translate(cx + Math.cos(a) * band, cy + Math.sin(a) * band)
      ctx.rotate(a + Math.PI / 2)
      ctx.beginPath()
      const strokes = 2 + Math.floor(rand() * 3)
      for (let s = 0; s < strokes; s++) {
        const x0 = (rand() - 0.5) * gh, y0 = (rand() - 0.5) * gh
        ctx.moveTo(x0, y0)
        ctx.lineTo(x0 + (rand() - 0.5) * gh, y0 + (rand() - 0.5) * gh)
      }
      ctx.stroke()
      ctx.restore()
    }
  }
  // Cardinal markers just inside the edge; north gets a filled diamond
  const markerR = r * 0.86
  const card = [
    // Canvas -Y maps to world +Z (screen top = north)
    { a: -Math.PI / 2, big: true }, { a: 0, big: false }, { a: Math.PI / 2, big: false }, { a: Math.PI, big: false },
  ]
  for (const { a, big } of card) {
    const x = cx + Math.cos(a) * markerR, y = cy + Math.sin(a) * markerR
    const s = (big ? 0.55 : 0.38) * pxPerM
    ctx.lineWidth = lw
    ctx.beginPath()
    ctx.moveTo(x + Math.cos(a) * s, y + Math.sin(a) * s)
    ctx.lineTo(x + Math.cos(a + Math.PI / 2) * s * 0.6, y + Math.sin(a + Math.PI / 2) * s * 0.6)
    ctx.lineTo(x - Math.cos(a) * s, y - Math.sin(a) * s)
    ctx.lineTo(x - Math.cos(a + Math.PI / 2) * s * 0.6, y - Math.sin(a + Math.PI / 2) * s * 0.6)
    ctx.closePath()
    if (big) ctx.fill(); else ctx.stroke()
  }
  ctx.restore()
}

export function createFloorTextures(scene: Scene, theme: ArenaTheme, shape: FloorShape): FloorTextures {
  const maxSide = Math.max(shape.width, shape.height)
  const size = maxSide > 60 ? 2048 : maxSide > 30 ? 2048 : 1536
  const w = size, h = Math.round(size * (shape.height / shape.width))
  const pxPerM = w / shape.width
  const rand = rng([...theme.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7))

  const diffuse = new DynamicTexture('arena-floor-diffuse', { width: w, height: h }, scene, true)
  const emissive = new DynamicTexture('arena-floor-emissive', { width: w, height: h }, scene, true)
  const heightTex = new DynamicTexture('arena-floor-normal', { width: w / 2, height: h / 2 }, scene, true)
  const dctx = diffuse.getContext() as CanvasRenderingContext2D
  const ectx = emissive.getContext() as CanvasRenderingContext2D
  const hctx = heightTex.getContext() as CanvasRenderingContext2D

  const tiles = shape.kind === 'circle'
    ? circleTiles(w, w / 2, pxPerM, theme, rand)
    : gridTiles(w, h, pxPerM, theme, rand)
  const grout = Math.max(2, 0.06 * pxPerM)

  // --- Diffuse ---
  dctx.fillStyle = theme.grout
  dctx.fillRect(0, 0, w, h)
  for (const t of tiles) {
    dctx.fillStyle = t.color
    dctx.fill(t.path)
  }
  // Grout lines + bevel highlight
  dctx.lineJoin = 'round'
  dctx.strokeStyle = theme.grout
  dctx.lineWidth = grout
  for (const t of tiles) dctx.stroke(t.path)
  // Speckle / wear noise
  for (let i = 0; i < (w * h) / 220; i++) {
    const x = rand() * w, y = rand() * h, s = 1 + rand() * 2.5
    dctx.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.05)'
    dctx.fillRect(x, y, s, s)
  }
  // Dirt blotches
  for (let i = 0; i < 26; i++) {
    const x = rand() * w, y = rand() * h, r = (1.5 + rand() * 4) * pxPerM
    const g = dctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(0,0,0,0.18)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    dctx.fillStyle = g
    dctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  // Cracks
  dctx.strokeStyle = 'rgba(0,0,0,0.35)'
  dctx.lineWidth = Math.max(1, 0.025 * pxPerM)
  for (let i = 0; i < 18; i++) {
    let x = rand() * w, y = rand() * h, a = rand() * Math.PI * 2
    dctx.beginPath()
    dctx.moveTo(x, y)
    for (let s = 0; s < 6; s++) {
      a += (rand() - 0.5) * 1.2
      x += Math.cos(a) * 0.5 * pxPerM; y += Math.sin(a) * 0.5 * pxPerM
      dctx.lineTo(x, y)
    }
    dctx.stroke()
  }
  const runeR = shape.kind === 'circle' ? w / 2 : Math.min(w, h) * 0.32
  drawRunes(dctx, w / 2, h / 2, runeR, pxPerM, shade(theme.rune, 0.8), rand, true)
  // Edge darkening band for circle arenas (subtle frame)
  if (shape.kind === 'circle') {
    const g = dctx.createRadialGradient(w / 2, h / 2, w * 0.38, w / 2, h / 2, w / 2)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,0.22)')
    dctx.fillStyle = g
    dctx.fillRect(0, 0, w, h)
  }

  // --- Emissive: only rune strokes glow, faintly ---
  ectx.fillStyle = '#000'
  ectx.fillRect(0, 0, w, h)
  drawRunes(ectx, w / 2, h / 2, runeR, pxPerM, shade(theme.accent, 0.4), rng(99), true)

  // --- Height → normal map (half resolution) ---
  const hw = w / 2, hh = h / 2
  hctx.save()
  hctx.scale(0.5, 0.5)
  hctx.fillStyle = '#000'
  hctx.fillRect(0, 0, w, h)
  hctx.fillStyle = '#fff'
  for (const t of tiles) hctx.fill(t.path)
  hctx.strokeStyle = '#000'
  hctx.lineWidth = grout * 1.6
  for (const t of tiles) hctx.stroke(t.path)
  drawRunes(hctx, w / 2, h / 2, runeR, pxPerM, '#555', rng(7), false)
  hctx.restore()
  const img = hctx.getImageData(0, 0, hw, hh)
  const src = img.data
  const height = new Float32Array(hw * hh)
  for (let i = 0; i < height.length; i++) height[i] = src[i * 4] / 255 + (rand() - 0.5) * 0.04
  const out = hctx.createImageData(hw, hh)
  const strength = 2.2
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < hw; x++) {
      const xl = height[y * hw + Math.max(0, x - 1)], xr = height[y * hw + Math.min(hw - 1, x + 1)]
      const yu = height[Math.max(0, y - 1) * hw + x], yd = height[Math.min(hh - 1, y + 1) * hw + x]
      let nx = (xl - xr) * strength, ny = (yu - yd) * strength, nz = 1
      const len = Math.hypot(nx, ny, nz)
      nx /= len; ny /= len; nz /= len
      const o = (y * hw + x) * 4
      out.data[o] = (nx * 0.5 + 0.5) * 255
      out.data[o + 1] = (ny * 0.5 + 0.5) * 255
      out.data[o + 2] = (nz * 0.5 + 0.5) * 255
      out.data[o + 3] = 255
    }
  }
  hctx.putImageData(out, 0, 0)

  for (const t of [diffuse, emissive, heightTex]) {
    t.wrapU = Texture.CLAMP_ADDRESSMODE
    t.wrapV = Texture.CLAMP_ADDRESSMODE
    t.anisotropicFilteringLevel = 8
    t.update(false)
  }
  return { diffuse, emissive, normal: heightTex }
}

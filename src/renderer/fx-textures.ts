// src/renderer/fx-textures.ts
// Small procedural sprite textures shared by particles and VFX meshes.
// Cached per scene; disposed with the scene.
import { DynamicTexture, Texture, type Scene } from '@babylonjs/core'

export type FxTextureKind = 'dot' | 'flare' | 'spark' | 'ring' | 'smoke' | 'streak'

const cache = new WeakMap<Scene, Map<FxTextureKind, Texture>>()

function draw(kind: FxTextureKind, ctx: CanvasRenderingContext2D, s: number) {
  const c = s / 2
  ctx.clearRect(0, 0, s, s)
  switch (kind) {
    case 'dot': {
      const g = ctx.createRadialGradient(c, c, 0, c, c, c)
      g.addColorStop(0, 'rgba(255,255,255,1)')
      g.addColorStop(0.25, 'rgba(255,255,255,0.75)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, s, s)
      break
    }
    case 'flare': {
      const g = ctx.createRadialGradient(c, c, 0, c, c, c)
      g.addColorStop(0, 'rgba(255,255,255,1)')
      g.addColorStop(0.08, 'rgba(255,255,255,0.9)')
      g.addColorStop(0.3, 'rgba(255,255,255,0.25)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, s, s)
      ctx.globalCompositeOperation = 'lighter'
      for (const [w, h] of [[s, s * 0.04], [s * 0.04, s]] as const) {
        const lg = ctx.createRadialGradient(c, c, 0, c, c, c)
        lg.addColorStop(0, 'rgba(255,255,255,0.9)')
        lg.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = lg
        ctx.fillRect(c - w / 2, c - h / 2, w, h)
      }
      ctx.globalCompositeOperation = 'source-over'
      break
    }
    case 'spark': {
      const g = ctx.createLinearGradient(0, c, s, c)
      g.addColorStop(0, 'rgba(255,255,255,0)')
      g.addColorStop(0.5, 'rgba(255,255,255,1)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.ellipse(c, c, c, s * 0.08, 0, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'ring': {
      const g = ctx.createRadialGradient(c, c, c * 0.6, c, c, c)
      g.addColorStop(0, 'rgba(255,255,255,0)')
      g.addColorStop(0.75, 'rgba(255,255,255,1)')
      g.addColorStop(0.85, 'rgba(255,255,255,0.8)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, s, s)
      break
    }
    case 'smoke': {
      let seed = 17
      const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
      for (let i = 0; i < 14; i++) {
        const x = c + (r() - 0.5) * c * 0.8, y = c + (r() - 0.5) * c * 0.8, rr = c * (0.3 + r() * 0.4)
        const g = ctx.createRadialGradient(x, y, 0, x, y, rr)
        g.addColorStop(0, 'rgba(255,255,255,0.22)')
        g.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, s, s)
      }
      break
    }
    case 'streak': {
      // Vertical soft streak: bright core fading to both ends, used for slashes & trails
      const g = ctx.createLinearGradient(0, 0, 0, s)
      g.addColorStop(0, 'rgba(255,255,255,0)')
      g.addColorStop(0.5, 'rgba(255,255,255,1)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, s, s)
      ctx.globalCompositeOperation = 'destination-in'
      const m = ctx.createLinearGradient(0, 0, s, 0)
      m.addColorStop(0, 'rgba(255,255,255,0)')
      m.addColorStop(0.5, 'rgba(255,255,255,1)')
      m.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = m
      ctx.fillRect(0, 0, s, s)
      ctx.globalCompositeOperation = 'source-over'
      break
    }
  }
}

export function fxTexture(scene: Scene, kind: FxTextureKind): Texture {
  let map = cache.get(scene)
  if (!map) { map = new Map(); cache.set(scene, map) }
  let tex = map.get(kind)
  if (!tex) {
    const size = kind === 'smoke' ? 128 : 64
    const dt = new DynamicTexture(`fx-${kind}`, { width: size, height: size }, scene, true)
    draw(kind, dt.getContext() as CanvasRenderingContext2D, size)
    dt.hasAlpha = true
    dt.update(false)
    tex = dt
    map.set(kind, tex)
  }
  return tex
}

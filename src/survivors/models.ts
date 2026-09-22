import { Mesh, MeshBuilder, StandardMaterial, Color3, type Scene } from '@babylonjs/core'

export type ModelKind = 'player' | 'imp' | 'bat' | 'golem' | 'elite'
/** Build once per scene; enemies share geometry/materials through Babylon instances. */
export function buildModel(scene: Scene, kind: ModelKind): Mesh {
  const parts: Mesh[] = []
  const material = (name: string, hex: string, glow = 0.16) => {
    const m = new StandardMaterial(`${kind}-${name}`, scene)
    m.diffuseColor = Color3.FromHexString(hex)
    m.emissiveColor = m.diffuseColor.scale(glow)
    m.specularColor.set(0.12, 0.12, 0.12)
    return m
  }
  const colors = { player: '#355e72', imp: '#ac6250', bat: '#6d5895', golem: '#536572', elite: '#7d3446' }
  const body = material('body', colors[kind])
  const dark = material('dark', kind === 'player' ? '#1a293c' : '#292432')
  const light = material('trim', kind === 'player' ? '#e4c885' : '#c6b28c')
  const glow = material('glow', kind === 'player' ? '#8cfff1' : kind === 'golem' ? '#67dfed' : '#ffb465', 0.85)
  function box(x: number, y: number, z: number, w: number, h: number, d: number, mat = body, tilt = 0) {
    const m = MeshBuilder.CreateBox('part', { width: w, height: h, depth: d }, scene)
    m.position.set(x, y, z); m.rotation.z = tilt; m.material = mat; parts.push(m); return m
  }
  function cone(x: number, y: number, z: number, bottom: number, top: number, height: number, mat = body, tilt = 0) {
    const m = MeshBuilder.CreateCylinder('part', { diameterBottom: bottom, diameterTop: top, height, tessellation: 5 }, scene)
    m.position.set(x, y, z); m.rotation.z = tilt; m.material = mat; parts.push(m); return m
  }
  function ball(x: number, y: number, z: number, size: number, mat = body) {
    const m = MeshBuilder.CreateSphere('part', { diameter: size, segments: 4 }, scene)
    m.position.set(x, y, z); m.material = mat; parts.push(m); return m
  }
  if (kind === 'player') {
    box(-0.22, 0.2, 0.07, 0.26, 0.4, 0.4, dark)
    box(0.22, 0.2, 0.07, 0.26, 0.4, 0.4, dark)
    cone(0, 0.87, 0, 1.1, 0.6, 1.1)
    box(0, 0.95, -0.36, 0.9, 1.1, 0.12, dark, 0.08)
    box(0, 1.12, 0.34, 0.12, 0.65, 0.1, light)
    ball(0, 1.65, 0, 0.58, light)
    cone(0, 1.99, 0, 1.12, 0.9, 0.1, dark)
    cone(-0.08, 2.28, 0, 0.82, 0, 0.6, dark, 0.15)
    box(-0.5, 1.12, 0, 0.28, 0.7, 0.3, body, -0.2)
    box(0.5, 1.12, 0.1, 0.28, 0.7, 0.3, body, 0.3)
    cone(0.76, 0.95, 0.28, 0.08, 0.08, 1.9, light)
    const crystal = ball(0.76, 2.03, 0.28, 0.35, glow); crystal.scaling.y = 1.7
  } else if (kind === 'bat') {
    ball(0, 0.95, 0, 0.62)
    for (const side of [-1, 1]) {
      const wing = box(side * 0.65, 1, 0, 1.15, 0.09, 0.55, body, side * 0.3)
      wing.rotation.y = side * 0.3
      cone(side * 0.2, 1.4, 0, 0.24, 0, 0.45, dark, side * -0.3)
      ball(side * 0.14, 1.04, 0.28, 0.12, glow)
    }
  } else if (kind === 'imp') {
    cone(0, 0.65, 0, 0.55, 0.75, 0.9)
    ball(0, 1.25, 0, 0.85)
    for (const side of [-1, 1]) {
      cone(side * 0.5, 1.45, 0, 0.36, 0, 0.65, body, side * -0.9)
      box(side * 0.25, 0.16, 0.12, 0.23, 0.32, 0.4, dark)
      box(side * 0.48, 0.65, 0, 0.2, 0.65, 0.22, body, side * 0.35)
      ball(side * 0.19, 1.35, 0.34, 0.13, glow)
    }
  } else {
    box(0, 1.15, 0, 1.05, 1.2, 0.7)
    box(0, 2, 0.03, 0.62, 0.55, 0.57, dark)
    box(0, 1.3, 0.39, 0.34, 0.48, 0.12, glow, Math.PI / 4)
    for (const side of [-1, 1]) {
      box(side * 0.35, 0.3, 0.04, 0.4, 0.6, 0.6, dark)
      box(side * 0.76, 1.6, 0, 0.62, 0.65, 0.85, body, side * 0.2)
      box(side * 0.82, 0.98, 0.08, 0.46, 0.85, 0.55)
      ball(side * 0.16, 2.05, 0.3, 0.14, glow)
      if (kind === 'elite') cone(side * 0.42, 2.45, 0, 0.3, 0, 1, light, side * -0.4)
    }
  }
  const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, true)!
  merged.name = `survivor-${kind}-template`
  merged.isVisible = false
  merged.isPickable = false
  return merged
}

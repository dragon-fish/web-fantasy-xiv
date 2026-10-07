// src/renderer/vfx/vfx-material.ts
// Unlit additive "texture × tint" material for effect quads.
// StandardMaterial can't do this: with disableLighting the diffuse term is zero,
// and emissiveTexture is ADDED to emissiveColor (never multiplied by it).
import { Constants, Effect, ShaderMaterial, type Color3, type Scene, type Texture, type AbstractMesh } from '@babylonjs/core'

const NAME = 'vfxAdditive'

Effect.ShadersStore[`${NAME}VertexShader`] = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec2 vUV;
void main() {
  vUV = uv;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`

Effect.ShadersStore[`${NAME}FragmentShader`] = /* glsl */ `
precision highp float;
varying vec2 vUV;
uniform sampler2D tex;
uniform vec3 tint;
uniform float visibility;
uniform float intensity;
uniform float quarter;
void main() {
  vec2 uv = vUV;
  // Quarter textures (FFXIV magic circles): centre at the image's bottom-right; mirror 4x
  if (quarter > 0.5) { vec2 q = abs(uv * 2.0 - 1.0); uv = vec2(1.0 - q.x, q.y); }
  vec4 t = texture2D(tex, uv);
  // Additive, premultiplied by texture alpha so both black-backed and alpha-backed textures work
  gl_FragColor = vec4(t.rgb * t.a * tint * intensity * visibility, 1.0);
}
`

export function createVfxMaterial(name: string, scene: Scene, texture: Texture, tint: Color3, opts: { intensity?: number; quarter?: boolean } = {}): ShaderMaterial {
  const mat = new ShaderMaterial(name, scene, NAME, {
    attributes: ['position', 'uv'],
    uniforms: ['worldViewProjection', 'tint', 'visibility', 'intensity', 'quarter'],
    samplers: ['tex'],
    needAlphaBlending: true,
  })
  mat.setTexture('tex', texture)
  mat.setColor3('tint', tint)
  mat.setFloat('intensity', opts.intensity ?? 1.35)
  mat.setFloat('quarter', opts.quarter ? 1 : 0)
  mat.alphaMode = Constants.ALPHA_ONEONE
  mat.backFaceCulling = false
  mat.disableDepthWrite = true
  // Per-mesh fade without per-mesh materials
  mat.onBindObservable.add((mesh: AbstractMesh) => {
    mat.getEffect()?.setFloat('visibility', mesh.visibility)
  })
  return mat
}

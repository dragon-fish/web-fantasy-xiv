// src/renderer/aoe-shader.ts
// Signed-distance telegraph material shared by every AOE shape. The mesh is a
// flat ground quad in local meters (forward = +Z); the fragment shader carves
// the actual shape so edges stay crisp at any size.
import { Color3, Effect, ShaderMaterial, Vector2, type Scene } from '@babylonjs/core'
import type { AoeShapeDef } from '@/core/types'

export interface TelegraphGeometry {
  /** 0 circle, 1 fan, 2 ring, 3 rect */
  shape: number
  /** circle/fan/ring outer radius; rect: unused */
  radius: number
  /** ring inner radius */
  inner: number
  /** fan half-angle in radians */
  halfAngle: number
  /** rect width / length (meters) */
  width: number
  length: number
  /** Quad size the mesh must be built with */
  quadWidth: number
  quadLength: number
  /** Local Z offset of the quad center relative to the zone center (rects extend forward) */
  forwardOffset: number
}

export function telegraphGeometry(shape: AoeShapeDef): TelegraphGeometry {
  switch (shape.type) {
    case 'circle':
      return { shape: 0, radius: shape.radius, inner: 0, halfAngle: 0, width: 0, length: 0, quadWidth: shape.radius * 2, quadLength: shape.radius * 2, forwardOffset: 0 }
    case 'fan':
      return { shape: 1, radius: shape.radius, inner: 0, halfAngle: (shape.angle * Math.PI) / 360, width: 0, length: 0, quadWidth: shape.radius * 2, quadLength: shape.radius * 2, forwardOffset: 0 }
    case 'ring':
      return { shape: 2, radius: shape.outerRadius, inner: shape.innerRadius, halfAngle: 0, width: 0, length: 0, quadWidth: shape.outerRadius * 2, quadLength: shape.outerRadius * 2, forwardOffset: 0 }
    case 'rect':
      return { shape: 3, radius: 0, inner: 0, halfAngle: 0, width: shape.width, length: shape.length, quadWidth: shape.width, quadLength: shape.length, forwardOffset: shape.length / 2 }
  }
}

const NAME = 'aoeTelegraph'

Effect.ShadersStore[`${NAME}VertexShader`] = /* glsl */ `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
uniform float forwardOffset;
varying vec2 vLocal;
void main() {
  // Local coordinates relative to the zone origin (rects start at the origin and extend forward)
  vLocal = vec2(position.x, position.z + forwardOffset);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`

Effect.ShadersStore[`${NAME}FragmentShader`] = /* glsl */ `
precision highp float;
varying vec2 vLocal;
uniform float shape;
uniform float radius;
uniform float inner;
uniform float halfAngle;
uniform vec2 rectSize;
uniform vec3 fillColor;
uniform vec3 rimColor;
uniform float progress;
uniform float time;
uniform float flash;
uniform float opacity;
uniform float flashScale;

float sdPie(vec2 p, vec2 c, float r) {
  p.x = abs(p.x);
  float l = length(p) - r;
  float m = length(p - c * clamp(dot(p, c), 0.0, r));
  return max(l, m * sign(c.y * p.x - c.x * p.y));
}
float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

void main() {
  vec2 p = vLocal;
  float d;
  float s; // 0..1 "depth" coordinate used by the progress sweep
  float len = length(p);
  if (shape < 0.5) {
    d = len - radius;
    s = len / radius;
  } else if (shape < 1.5) {
    d = sdPie(p, vec2(sin(halfAngle), cos(halfAngle)), radius);
    s = len / radius;
  } else if (shape < 2.5) {
    d = max(len - radius, inner - len);
    s = (len - inner) / max(radius - inner, 0.001);
  } else {
    d = sdBox(p - vec2(0.0, rectSize.y * 0.5), rectSize * 0.5);
    s = p.y / rectSize.y;
  }
  float aa = fwidth(d) * 1.2;
  float inside = 1.0 - smoothstep(-aa, aa, d);
  if (inside <= 0.001) discard;

  // Bright band hugging the edge, soft gradient toward the middle (FFXIV omen look)
  float edgeDist = -d;
  float rim = 1.0 - smoothstep(0.0, 0.14 + aa, edgeDist);
  float band = pow(1.0 - clamp(edgeDist / 2.6, 0.0, 1.0), 2.2);
  float fill = 0.16 + 0.34 * band;

  // Cast progress: filled region slightly brighter + glowing leading front
  float swept = step(s, progress);
  float front = (1.0 - smoothstep(0.0, 0.035, abs(s - progress))) * step(0.001, progress) * step(progress, 0.999);
  fill += swept * 0.12;

  // Faint drifting texture so large areas don't look flat
  float ripple = sin(len * 2.4 - time * 2.0) * 0.5 + 0.5;
  fill += ripple * 0.035;

  vec3 col = fillColor * (1.0 + band * 0.35);
  col = mix(col, rimColor, rim);
  col += rimColor * front * 0.8;
  float alpha = max(fill, rim * 0.95) + front * 0.5;

  // Resolve flash: whiten and brighten, then fade out
  float fl = flash * flashScale;
  col = mix(col, vec3(1.0, 0.95, 0.85), fl * 0.45);
  alpha = mix(alpha, 0.75, fl);

  gl_FragColor = vec4(col, clamp(alpha * opacity * inside, 0.0, 1.0));
}
`

export function createTelegraphMaterial(scene: Scene, name: string, geo: TelegraphGeometry, fill: Color3, rim: Color3): ShaderMaterial {
  const mat = new ShaderMaterial(name, scene, NAME, {
    attributes: ['position'],
    uniforms: ['flashScale', 'worldViewProjection', 'forwardOffset', 'shape', 'radius', 'inner', 'halfAngle', 'rectSize', 'fillColor', 'rimColor', 'progress', 'time', 'flash', 'opacity'],
    needAlphaBlending: true,
  })
  mat.backFaceCulling = false
  mat.disableDepthWrite = true
  mat.setFloat('forwardOffset', geo.forwardOffset)
  mat.setFloat('shape', geo.shape)
  mat.setFloat('radius', geo.radius)
  mat.setFloat('inner', geo.inner)
  mat.setFloat('halfAngle', geo.halfAngle)
  mat.setVector2('rectSize', new Vector2(geo.width, geo.length))
  mat.setColor3('fillColor', fill)
  mat.setColor3('rimColor', rim)
  mat.setFloat('progress', 0)
  mat.setFloat('time', 0)
  mat.setFloat('flash', 0)
  mat.setFloat('opacity', 1)
  // Resolve flash fades out for huge zones (an arena-wide flash whites out the screen)
  const area = geo.shape === 3 ? geo.width * geo.length
    : geo.shape === 1 ? geo.radius * geo.radius * geo.halfAngle
    : Math.PI * (geo.radius * geo.radius - geo.inner * geo.inner)
  mat.setFloat('flashScale', Math.min(1, 90 / Math.max(1, area)))
  return mat
}

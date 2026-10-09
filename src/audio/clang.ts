// src/audio/clang.ts
// Synthesised metal-on-metal clangs (Sekiro-style blocks and deflects). Built from inharmonic
// partials plus a short filtered noise transient, so no audio assets are needed.

export type ClangKind = 'block' | 'deflect' | 'perfect'

interface Preset {
  /** Fundamental (Hz) */
  base: number
  /** Inharmonic partial ratios — what makes it ring like a struck blade rather than a tone */
  partials: number[]
  /** Ring-out time (s) */
  decay: number
  /** Transient loudness relative to the ring */
  noise: number
  gain: number
}

const PRESETS: Record<ClangKind, Preset> = {
  // Dull, short: a shield taking the hit
  block: { base: 480, partials: [1, 2.32, 3.87], decay: 0.16, noise: 0.6, gain: 0.2 },
  // Bright ring: a clean deflect
  deflect: { base: 1180, partials: [1, 2.76, 5.4, 8.93], decay: 0.32, noise: 0.35, gain: 0.17 },
  // Brighter and longer, with a high shimmer
  perfect: { base: 1420, partials: [1, 2.76, 5.4, 8.93, 13.34], decay: 0.55, noise: 0.3, gain: 0.2 },
}

const MASTER = 0.6

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null
  ctx ??= new AudioContext()
  // Browsers start the context suspended until a user gesture; the battle always follows one
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

let noiseBuffer: AudioBuffer | null = null
function noise(a: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    noiseBuffer = a.createBuffer(1, Math.floor(a.sampleRate * 0.06), a.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  return noiseBuffer
}

/** Play one clang. `accent` makes it louder and longer (e.g. the last hit of a flurry). */
export function playClang(kind: ClangKind, opts: { accent?: boolean } = {}): void {
  const a = audio()
  if (!a) return
  const p = PRESETS[kind]
  const t = a.currentTime
  const accent = opts.accent ? 1.5 : 1
  const out = a.createGain()
  out.gain.value = p.gain * MASTER * accent
  out.connect(a.destination)
  // Slight pitch scatter so a chain of clangs never sounds like one sample on repeat
  const pitch = 1 + (Math.random() - 0.5) * 0.08

  p.partials.forEach((ratio, i) => {
    const osc = a.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = p.base * ratio * pitch
    const g = a.createGain()
    const decay = p.decay * accent * (1 - i * 0.12)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(1 / (i + 1), t + 0.002)
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay)
    osc.connect(g).connect(out)
    osc.start(t)
    osc.stop(t + decay + 0.05)
  })

  const src = a.createBufferSource()
  src.buffer = noise(a)
  const band = a.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = p.base * 3 * pitch
  band.Q.value = 1.2
  const ng = a.createGain()
  ng.gain.setValueAtTime(p.noise, t)
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.045)
  src.connect(band).connect(ng).connect(out)
  src.start(t)
}

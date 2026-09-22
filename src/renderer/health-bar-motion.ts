export interface HealthBarSnapshot {
  damageEnd: number
  healStart: number
  pulse: number
  shake: number
  kind: 'damage' | 'heal' | null
}

/** Visual history only; never delays or changes actual health. Time follows scene pause. */
export class HealthBarMotion {
  private now = 0
  private burstStart: number | null = null
  private lastDamage = 0
  private settling: { start: number; from: number; forced: boolean } | null = null
  private healAt = -Infinity
  private healFrom = 0
  private pulseAt = -Infinity
  private kind: HealthBarSnapshot['kind'] = null
  private end: number
  private hp: number
  private max: number
  constructor(hp: number, max: number) {
    this.hp = hp; this.max = max
    this.end = this.fraction
  }
  private get fraction() { return this.max > 0 ? Math.max(0, Math.min(1, this.hp / this.max)) : 0 }
  update(hp: number, max: number, dt: number) {
    this.now += dt
    if (max !== this.max || hp <= 0) {
      this.hp = hp; this.max = max; this.end = this.fraction
      this.burstStart = null; this.settling = null; this.kind = null
      this.healAt = this.pulseAt = -Infinity
      return
    }
    if (this.burstStart !== null) {
      const deadline = Math.min(this.lastDamage + 1000, this.burstStart + 10000)
      if (!this.settling && this.now >= deadline) this.settling = { start: deadline, from: this.end, forced: deadline === this.burstStart + 10000 }
      if (this.settling) {
        const t = Math.min(1, (this.now - this.settling.start) / 250)
        this.end = this.settling.from + (this.fraction - this.settling.from) * t
        if (t >= 1) { this.burstStart = null; this.settling = null }
      }
    }
    if (hp < this.hp) {
      if (this.settling && !this.settling.forced) {
        this.settling = null
        this.burstStart = this.now
      }
      if (this.burstStart === null) { this.burstStart = this.now; this.end = this.fraction }
      this.lastDamage = this.now
      this.kind = 'damage'; this.pulseAt = this.now
      this.healAt = -Infinity
    } else if (hp > this.hp) {
      this.healFrom = this.fraction; this.healAt = this.now
      this.kind = 'heal'; this.pulseAt = this.now
    }
    this.hp = hp
    this.end = Math.max(this.fraction, this.end)
    if (this.burstStart === null) this.end = this.fraction
  }
  get snapshot(): HealthBarSnapshot {
    const pulse = Math.max(0, 1 - (this.now - this.pulseAt) / 220)
    const t = Math.min(1, (this.now - this.healAt) / 250)
    return {
      damageEnd: this.end,
      healStart: this.healFrom + (this.fraction - this.healFrom) * t,
      pulse, kind: this.kind,
      shake: this.kind === 'damage' && pulse > 0 ? Math.sin((this.now - this.pulseAt) / 17) * pulse : 0,
    }
  }
}

import { CARDS, type Card } from './catalog'

export class Progression {
  level = 1
  xp = 0
  pending = 0
  ranks: Record<string, number> = { fire: 1 }
  offers: Card[] = []
  constructor(private random: () => number = Math.random) {}
  get requiredXp() { return 7 + this.level * 4 }
  rank(id: string) { return this.ranks[id] ?? 0 }
  gainXp(amount: number) {
    this.xp += amount
    while (this.xp >= this.requiredXp) {
      this.xp -= this.requiredXp
      this.level++
      this.pending++
    }
    if (this.pending && !this.offers.length) this.roll()
  }
  choose(id: string): Card {
    const card = this.offers.find(c => c.id === id)
    if (!this.pending || !card) throw new Error(`Card not offered: ${id}`)
    this.ranks[id] = this.rank(id) + 1
    this.pending--
    this.offers = []
    if (this.pending) this.roll()
    return card
  }
  private roll() {
    const pool = CARDS.filter(c => this.rank(c.id) < c.max)
    // Keep a weapon option available while builds are still developing.
    const weapons = pool.filter(c => c.weapon)
    if (weapons.length) {
      const chosen = weapons[Math.floor(this.random() * weapons.length)]!
      this.offers.push(chosen)
      pool.splice(pool.indexOf(chosen), 1)
    }
    while (this.offers.length < 3 && pool.length) {
      this.offers.push(pool.splice(Math.floor(this.random() * pool.length), 1)[0]!)
    }
    if (!this.offers.length) this.pending = 0
  }
}

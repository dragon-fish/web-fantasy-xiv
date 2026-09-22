<script setup lang="ts">
import { computed, onBeforeUnmount, provide, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { useEventListener } from '@vueuse/core'
import { useEngine } from '@/composables/use-engine'
import { useStateAdapter } from '@/composables/use-state-adapter'
import { useBattleStore } from '@/stores/battle'
import { SKILL_TRIGGER_KEY } from '@/components/hud/skill-trigger-key'
import { GameScene } from '@/game/game-scene'
import { SurvivorRuntime, RUN_DURATION } from '@/survivors/runtime'
import { SurvivorVisuals } from '@/survivors/visuals'
import { WEAPONS, CARDS, skillFor, type Card } from '@/survivors/catalog'
import { icon } from '@/jobs/commons/icon-paths'
import { DASH_GUARD } from '@/survivors/dash'
import type { SkillBarEntry } from '@/jobs/shared'
import { computeMoveDirection, computeDirectionAngle } from '@/input/input-manager'

const { engine } = useEngine()
const root = useTemplateRef<HTMLDivElement>('root')
const battle = useBattleStore()
const started = ref(false)
const ready = ref(false)
const session = ref(0)
const state = shallowRef({ elapsed: 0, level: 1, xp: 0, required: 11, kills: 0, count: 0, offers: [] as Card[], ranks: {} as Record<string, number> })
let scene: GameScene | null = null
let run: SurvivorRuntime | null = null
let visuals: SurvivorVisuals | null = null
let adapter: ReturnType<typeof useStateAdapter> | null = null
const trigger = ref<(idx: number) => void>((idx) => { if (idx === 200) dash() })
provide(SKILL_TRIGGER_KEY, trigger)
const clock = computed(() => `${Math.floor(state.value.elapsed / 60000).toString().padStart(2, '0')}:${Math.floor(state.value.elapsed / 1000 % 60).toString().padStart(2, '0')}`)
const stage = computed(() => ['以太苏醒', '魔物涌动', '暗潮逼近', '群星坠落'][Math.min(3, Math.floor(state.value.elapsed / 120000))])
const unlocked = computed(() => WEAPONS.filter(w => state.value.ranks[w.id]).length)
const awakened = computed(() => WEAPONS.filter(w => state.value.ranks[w.id] === 5).length)
const entries = () => {
  if (!run) return []
  const r = run
  const slots: SkillBarEntry[] = WEAPONS.filter(c => r.rank(c.id)).map(c => ({
    key: '自动', skill: skillFor(c, r.rank(c.id), r.weapons.interval(c.weapon)), automatic: true, level: r.rank(c.id), description: `${c.description}<br>${c.evolution}`,
  }))
  slots.push({ key: 'Space', skill: { ...skillFor({ ...WEAPONS[0]!, id: 'dash', name: '前冲步', icon: icon('skill_icons/38_DNC', 3467) }, 1, r.dash.cooldown), name: '前冲步', type: 'ability' }, triggerIndex: 200, charges: r.dash.charges, maxCharges: r.dash.max, description: '向移动方向突进 6 米，起始 0.25 秒无敌。逐次恢复充能。' })
  return slots
}
function sync() {
  if (!run || !scene || !adapter) return
  scene.skillBarEntries = entries()
  adapter.writeFrame(0)
  battle.cooldowns = new Map(WEAPONS.map(c => [`sv_${c.id}`, Math.max(0, run!.weapons.remaining[c.weapon] ?? 0)]))
  battle.cooldowns.set('sv_dash', run.dash.remaining)
  state.value = { elapsed: run.elapsed, level: run.progression.level, xp: run.progression.xp, required: run.progression.requiredXp, kills: run.kills, count: run.enemies().length, offers: [...run.progression.offers], ranks: { ...run.progression.ranks } }
}
function cleanup() {
  adapter?.dispose()
  adapter = null
  scene?.dispose()
  scene = null
  run = null
  visuals = null
}
function boot() {
  if (!engine.value || !root.value) return
  cleanup()
  session.value++
  started.value = false
  scene = new GameScene({
    engine: engine.value, uiRoot: root.value,
    arena: { name: '以太荒原', shape: { type: 'rect', width: 120, height: 120 }, boundary: 'wall' },
    playerInputConfig: { skills: [], autoAttackInterval: 1000, noMpRegen: true }, restart: boot,
    createEntityRenderer: (s, bus) => { visuals = new SurvivorVisuals(s, bus); return visuals },
  })
  scene.createPlayer({ id: 'survivor-player', type: 'player', hp: 600, attack: 32, speed: 6, size: 0.45 })
  scene.sceneManager.camera.radius = 46
  run = new SurvivorRuntime(scene)
  visuals!.bind(run)
  scene.buffDefs = new Map(CARDS.filter(c => c.buff).map(c => [c.buff!.id, c.buff!]))
  scene.buffDefs.set(DASH_GUARD.id, DASH_GUARD)
  scene.getCombatElapsed = () => run!.elapsed
  scene.bus.on('combat:ended', ({ result }) => { scene!.endBattle(result); sync() })
  scene.onLogicTick = (dt) => {
    run!.tick(dt)
    if (run!.progression.pending) { scene!.pause(); scene!.input.clear(); sync() }
  }
  adapter = useStateAdapter(scene, { maxDamageEvents: 55 })
  let sinceSync = 0
  scene.onRenderTick = (dt) => {
    visuals!.render(dt, scene!.paused || scene!.battleOver)
    sinceSync += dt
    if (sinceSync >= 80) { sync(); sinceSync = 0 }
  }
  scene.pause()
  scene.start()
  ready.value = true
  sync()
}
function begin() { started.value = true; scene?.resume(); sync() }
function choose(card: Card) {
  if (!run || !scene) return
  run.choose(card.id)
  scene.input.clear()
  if (!run.progression.pending) scene.resume()
  sync()
}
function pause() {
  if (!started.value || !scene || run?.result || run?.progression.pending) return
  scene.togglePause()
  scene.input.clear()
  sync()
}
function dash() {
  if (!scene || scene.paused || !run || scene.devTerminal.isVisible()) return
  const dir = computeMoveDirection(scene.input.keys)
  if (dir.x || dir.y) run.player.facing = computeDirectionAngle(dir)
  run.useDash()
  sync()
}
function cardLabel(c: Card) {
  const rank = state.value.ranks[c.id] ?? 0
  return c.weapon ? rank === 0 ? '装载新技能' : rank === 4 ? '最终觉醒' : `技能强化 ${rank} → ${rank + 1}` : `永久强化 ${rank + 1} / ${c.max}`
}
useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (scene?.devTerminal.isVisible() || e.isComposing || (e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName))) return
  if (e.code === 'Space' || e.code === 'Escape') {
    e.preventDefault()
    e.stopImmediatePropagation()
    if (!e.repeat) { if (e.code === 'Space') dash(); else pause() }
  }
}, { capture: true })
useEventListener(window, 'blur', () => { if (scene && started.value && !scene.paused && !scene.battleOver) { scene.pause(); sync() } })
watch([engine, root], () => { if (engine.value && root.value && !scene) boot() }, { immediate: true, flush: 'post' })
onBeforeUnmount(cleanup)
</script>

<template lang="pug">
.survivors(ref="root")
  header.run-header
    .run-title
      span.eyebrow AETHER SURVIVORS
      strong 以太幸存者
      span.subtitle {{ stage }}
    .run-time
      strong {{ clock }}
      span / 08:00
    .run-stats
      span 讨伐
      strong {{ state.kills }}
      button.pause-button(type="button" @click="pause" aria-label="暂停战斗") Ⅱ
  .experience
    .experience-fill(:style="{ width: (state.xp / state.required * 100) + '%' }")
    span Lv.{{ state.level }} · {{ state.xp }} / {{ state.required }}
  .run-progress(:style="{ width: Math.min(100, state.elapsed / RUN_DURATION * 100) + '%' }")
  .field-notes(v-if="started && !battle.battleOver")
    span {{ state.count }} 魔物逼近
    span {{ unlocked }} / 6 战技装载 · {{ awakened }} 觉醒
  HudHpBar(mode="player")
  HudSkillBar
  HudBuffBar
  HudDamageFloater(:key="session")
  HudTooltip
  .controls(v-if="started") WASD 移动 · SPACE 前冲步 · ESC 暂停
  .veil(v-if="!started")
    section.intro
      span.eyebrow XIV · EXPERIMENTAL MODE
      h1 以太幸存者
      p.intro-lead 集百家战技，破无尽魔潮。
      .intro-weapons
        img(v-for="w in WEAPONS" :key="w.id" :src="w.icon" :alt="w.name" :title="w.name")
      p 六种自动战技，自由叠加强化。
      p 拾取以太结晶升级，五级觉醒改变攻击形态。
      .instructions
        span #[kbd W A S D] 走位与拾取
        span #[kbd SPACE] 前冲步 · 短暂无敌
      button.primary(type="button" :disabled="!ready" @click="begin") {{ ready ? '进入荒原' : '凝聚以太…' }}
      RouterLink.back(to="/") 返回大厅
      small FF14 概念改编 · 8 分钟生存挑战
  .veil(v-else-if="state.offers.length && !battle.battleOver")
    section.selection
      span.eyebrow LEVEL {{ state.level }} · AETHER ATTUNEMENT
      h2 选择你的力量
      p.selection-hint 时间已暂停 · 本次选择将持续整场战斗
      .cards
        button.upgrade-card(v-for="card in state.offers" :key="card.id" :style="{ '--card-color': card.color }" type="button" @click="choose(card)")
          span.card-type {{ cardLabel(card) }}
          img(:src="card.icon" :alt="card.name")
          h3 {{ card.name }}
          p {{ card.description }}
          .evolution(v-if="card.evolution")
            span V · 觉醒
            p {{ card.evolution }}
          span.card-select 选择此强化 →
  .veil(v-else-if="battle.battleOver")
    section.result
      span.eyebrow {{ battle.battleResult === 'victory' ? 'DUTY COMPLETE' : 'THE ECHO REMAINS' }}
      h2 {{ battle.battleResult === 'victory' ? '魔潮退散' : '以太归寂' }}
      p {{ clock }} 生存 · {{ state.kills }} 讨伐 · 等级 {{ state.level }}
      p {{ awakened }} 种战技完成觉醒
      button.primary(type="button" @click="boot") 再次挑战
      RouterLink.back(to="/") 返回大厅
  .veil(v-else-if="battle.paused")
    section.result
      span.eyebrow INTERMISSION
      h2 战斗暂停
      button.primary(type="button" @click="pause") 继续战斗
      button.secondary(type="button" @click="boot") 重新开始
      RouterLink.back(to="/") 返回大厅
</template>

<style scoped lang="scss">
.survivors { position: absolute; inset: 0; pointer-events: none; --gold: #e0c58d; color: #e9eee9; }
.run-header { display: flex; align-items: center; justify-content: space-between; padding: 25px 32px 18px; background: linear-gradient(#08131be8, #08131b00); }
.run-title { display: flex; flex-direction: column; gap: 3px; strong { font: 23px 'Songti SC', 'Noto Serif SC', serif; letter-spacing: .13em; } }
.eyebrow { color: var(--gold); font-size: 10px; letter-spacing: .24em; }
.subtitle { color: #8ca6a8; font-size: 11px; margin-top: 5px; }
.run-time { display: flex; align-items: baseline; gap: 8px; font-variant-numeric: tabular-nums; strong { font: 36px Georgia, serif; } span { color: #92a6aa; font-size: 12px; } }
.run-stats { display: flex; align-items: center; gap: 12px; span { color: #9baeb1; font-size: 12px; } strong { font: 28px Georgia, serif; } }
.pause-button { pointer-events: auto; margin-left: 10px; border: 1px solid #94b3b34a; background: #0b1d24aa; color: #d6e6e4; width: 34px; height: 34px; cursor: pointer; }
.experience { position: absolute; top: 0; left: 0; right: 0; height: 5px; background: #10292e; .experience-fill { height: 100%; background: #9de8d5; box-shadow: 0 0 12px #7de2c9; transition: width .15s; } span { position: absolute; top: 7px; left: 50%; transform: translateX(-50%); font-size: 10px; color: #b3d9cd; } }
.run-progress { position: absolute; bottom: 0; height: 2px; background: #d5ba7a; opacity: .5; }
.field-notes { position: absolute; left: 28px; bottom: 26px; display: flex; flex-direction: column; gap: 7px; color: #9ab4b2; font-size: 11px; }
.controls { position: absolute; bottom: 114px; width: 100%; text-align: center; color: #a1b2b3; font-size: 10px; letter-spacing: .08em; }
.veil { pointer-events: auto; position: absolute; inset: 0; display: grid; place-items: center; overflow: auto; padding: 28px; background: #030c16cb; backdrop-filter: blur(5px); z-index: 30; }
.intro, .result { text-align: center; max-width: 600px; padding: 35px; }
h1, h2 { font-family: 'Songti SC', 'Noto Serif SC', Georgia, serif; font-weight: 400; letter-spacing: .13em; }
h1 { font-size: clamp(36px, 5vw, 64px); margin: 18px 0; color: #f5e7cc; }
h2 { font-size: 36px; margin: 13px 0; }
p { font-size: 13px; line-height: 1.85; color: #adc0c2; }
.intro-lead { color: #dbc79d; font-size: 17px; letter-spacing: .12em; }
.intro-weapons { display: flex; justify-content: center; gap: 12px; margin: 30px 0 24px; img { width: 44px; height: 44px; border: 1px solid #d8c18b60; border-radius: 4px; box-shadow: 0 5px 22px #0008; } }
.instructions { display: flex; flex-wrap: wrap; justify-content: center; gap: 20px; font-size: 11px; color: #9fb2b4; margin: 30px 0; kbd { color: #e8d5ac; border: 1px solid #9ba7a050; padding: 4px 6px; margin-right: 6px; font-size: 10px; } }
.primary, .secondary { display: block; margin: 20px auto 14px; min-width: 230px; padding: 13px 28px; cursor: pointer; font: inherit; font-size: 14px; letter-spacing: .18em; }
.primary { border: 1px solid #d3bd87; color: #f2e4c5; background: linear-gradient(110deg, #4a4533, #34382e); &:hover { background: #5a513b; box-shadow: 0 0 25px #bca76b24; } &:disabled { opacity: .5; cursor: wait; } }
.secondary { border: 1px solid #80989860; background: transparent; color: #a8bebd; }
.back { display: block; margin: 15px 0; color: #a8bebd; text-decoration: none; font-size: 12px; }
small { display: block; margin-top: 30px; color: #648385; font-size: 10px; letter-spacing: .13em; }
.selection { max-width: 970px; width: 100%; text-align: center; }
.selection-hint { margin-bottom: 28px; }
.cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; text-align: left; }
.upgrade-card { color: #e7eeec; background: linear-gradient(160deg, #203039ee, #101d26); border: 1px solid #7b979749; border-top: 2px solid var(--card-color); padding: 24px; text-align: left; cursor: pointer; display: flex; flex-direction: column; align-items: flex-start; transition: transform .15s, border-color .15s; &:hover, &:focus-visible { transform: translateY(-6px); border-color: var(--card-color); outline: none; } img { width: 52px; height: 52px; margin-top: 22px; border-radius: 5px; } h3 { margin: 17px 0 0; font: 23px 'Songti SC', serif; } > p { min-height: 72px; } }
.card-type { color: var(--card-color); font-size: 10px; letter-spacing: .14em; }
.evolution { border-top: 1px solid #7891913a; padding-top: 14px; margin-top: auto; span { color: var(--gold); font-size: 10px; letter-spacing: .12em; } p { font-size: 11px; color: #97aaa9; } }
.card-select { color: var(--card-color); font-size: 11px; margin-top: auto; padding-top: 22px; }
@media (max-width: 650px) { .run-header { padding: 24px 16px; } .run-title strong { font-size: 17px; } .run-time strong { font-size: 27px; } .field-notes { left: 12px; bottom: 185px; } .cards { gap: 7px; } .upgrade-card { padding: 12px; h3 { font-size: 17px; } > p { font-size: 11px; } } .veil { padding: 12px; } }
</style>

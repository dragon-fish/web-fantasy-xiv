import { GameScene } from '@/game/game-scene'
import { DEMO_SKILLS, AUTO_ATTACK, SKILL_DASH, SKILL_BACKSTEP } from './demo-skills'
import { DEMO_SKILL_BAR } from './demo-skill-bar'
import type { ArenaDef } from '@/core/types'

const ARENA: ArenaDef = {
  name: 'Training Ground',
  shape: { type: 'circle', radius: 15 },
  boundary: 'wall',
}

let scene: GameScene | null = null

export function startDemo(canvas: HTMLCanvasElement, uiRoot: HTMLDivElement): void {
  scene?.dispose()

  scene = new GameScene({
    canvas, uiRoot, arena: ARENA,
    skillBarEntries: DEMO_SKILL_BAR,
    playerInputConfig: {
      skills: DEMO_SKILLS,
      extraSkills: new Map([[100, SKILL_DASH], [101, SKILL_BACKSTEP]]),
      autoAttackSkill: AUTO_ATTACK,
      autoAttackInterval: 3000,
    },
    restart: () => startDemo(canvas, uiRoot),
  })

  scene.createPlayer({
    id: 'player', type: 'player',
    position: { x: 0, y: -5, z: 0 },
    hp: 30000, maxHp: 30000, attack: 1000,
    speed: 6, size: 0.5, autoAttackRange: 5,
  })
  scene.player.inCombat = true

  const dummy = scene.entityMgr.create({
    id: 'dummy', type: 'boss',
    position: { x: 0, y: 0, z: 0 },
    hp: 999999, maxHp: 999999, attack: 0,
    speed: 0, size: 1.5, autoAttackRange: 5, facing: 180,
  })
  scene.bossEntity = dummy

  scene.announce.show('战斗开始')
  scene.start()
}

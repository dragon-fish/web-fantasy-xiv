// src/input/input-manager.ts
import type { Vec2 } from '@/core/types'

export interface InputState {
  w: boolean
  a: boolean
  s: boolean
  d: boolean
}

export interface MouseState {
  /** Mouse position in world XY coordinates */
  worldPos: Vec2
  leftDown: boolean
  rightDown: boolean
}

export function computeMoveDirection(keys: InputState): Vec2 {
  let x = 0
  let y = 0
  if (keys.w) y += 1
  if (keys.s) y -= 1
  if (keys.d) x += 1
  if (keys.a) x -= 1

  if (x === 0 && y === 0) return { x: 0, y: 0 }

  const len = Math.sqrt(x * x + y * y)
  return { x: x / len, y: y / len }
}

export function computeFacingAngle(entityPos: Vec2, mouseWorldPos: Vec2): number {
  const dx = mouseWorldPos.x - entityPos.x
  const dy = mouseWorldPos.y - entityPos.y
  if (dx === 0 && dy === 0) return 0
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360
}

export class InputManager {
  readonly keys: InputState = { w: false, a: false, s: false, d: false }
  readonly mouse: MouseState = { worldPos: { x: 0, y: 0 }, leftDown: false, rightDown: false }
  readonly skillPressed: (number | null)[] = [null, null, null, null]

  private pendingSkill: number | null = null
  private escPressed = false

  constructor(
    private canvas: HTMLCanvasElement,
    /** Optional predicate; when returns true, window key events are ignored (e.g. dev terminal open). */
    private shouldBlockInput?: () => boolean,
  ) {
    this.bindEvents()
  }

  /** Returns and clears pending skill press (1-4 → index 0-3) */
  consumeSkillPress(): number | null {
    const skill = this.pendingSkill
    this.pendingSkill = null
    return skill
  }

  /** Returns and clears ESC press */
  consumeEsc(): boolean {
    const esc = this.escPressed
    this.escPressed = false
    return esc
  }

  private bindEvents(): void {
    window.addEventListener('keydown', (e) => {
      if (this.shouldBlockInput?.()) return
      switch (e.code) {
        case 'KeyW': this.keys.w = true; break
        case 'KeyA': this.keys.a = true; break
        case 'KeyS': this.keys.s = true; break
        case 'KeyD': this.keys.d = true; break
        case 'Digit1': this.pendingSkill = 0; break
        case 'Digit2': this.pendingSkill = 1; break
        case 'Digit3': this.pendingSkill = 2; break
        case 'Digit4': this.pendingSkill = 3; break
        case 'Digit5': this.pendingSkill = 4; break
        case 'Digit6': this.pendingSkill = 5; break
        case 'KeyQ': this.pendingSkill = 100; break  // special: dash
        case 'KeyE': this.pendingSkill = 101; break  // special: backstep
        case 'Escape': this.escPressed = true; break
      }
    })

    window.addEventListener('keyup', (e) => {
      if (this.shouldBlockInput?.()) return
      switch (e.code) {
        case 'KeyW': this.keys.w = false; break
        case 'KeyA': this.keys.a = false; break
        case 'KeyS': this.keys.s = false; break
        case 'KeyD': this.keys.d = false; break
      }
    })

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouse.leftDown = true
      if (e.button === 2) this.mouse.rightDown = true
    })

    this.canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.leftDown = false
      if (e.button === 2) this.mouse.rightDown = false
    })

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  /** Call each frame with projected mouse world position */
  updateMouseWorldPos(worldPos: Vec2): void {
    this.mouse.worldPos = worldPos
  }

  dispose(): void {
    // In production, would remove event listeners. For prototype, no-op.
  }
}

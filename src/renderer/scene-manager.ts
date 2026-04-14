import { Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight, Vector3, Matrix, Plane } from '@babylonjs/core'

export class SceneManager {
  readonly engine: Engine
  readonly scene: Scene
  readonly camera: ArcRotateCamera

  // Camera roll animation state
  private rollAngle = 0          // current roll in radians
  private rollTarget = 0         // target roll
  private rollSnapSpeed = 0      // rad/ms for snap phase
  private rollReturnSpeed = 0    // rad/ms for return phase
  private rollPhase: 'idle' | 'snap' | 'return' = 'idle'

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true })

    this.scene = new Scene(this.engine)
    this.scene.clearColor.set(0.12, 0.12, 0.14, 1)

    this.camera = new ArcRotateCamera(
      'camera',
      -Math.PI / 2,
      (28 * Math.PI) / 180,
      40,
      Vector3.Zero(),
      this.scene,
    )
    this.camera.attachControl(canvas, false)
    this.camera.inputs.clear()

    const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene)
    ambient.intensity = 0.5

    const sun = new DirectionalLight('sun', new Vector3(-1, -2, -1).normalize(), this.scene)
    sun.intensity = 0.6
  }

  /** Set camera target directly (used by CameraController) */
  setCameraTarget(x: number, y: number, heightOffset = 0): void {
    this.camera.target.set(x, -heightOffset, y)
  }

  /**
   * Trigger a camera roll animation (tilt effect).
   * Quickly snaps to angleDeg, then slowly returns to 0.
   * Positive = clockwise, negative = counter-clockwise.
   */
  rollCamera(angleDeg: number, snapMs = 150, returnMs = 1500): void {
    this.rollTarget = (angleDeg * Math.PI) / 180
    this.rollSnapSpeed = Math.abs(this.rollTarget) / Math.max(snapMs, 1)
    this.rollReturnSpeed = Math.abs(this.rollTarget) / Math.max(returnMs, 1)
    this.rollPhase = 'snap'
  }

  /** Call each render frame to advance roll animation */
  updateRoll(deltaMs: number): void {
    if (this.rollPhase === 'idle') return

    if (this.rollPhase === 'snap') {
      // Move toward target quickly
      const step = this.rollSnapSpeed * deltaMs
      if (Math.abs(this.rollTarget - this.rollAngle) <= step) {
        this.rollAngle = this.rollTarget
        this.rollPhase = 'return'
      } else {
        this.rollAngle += Math.sign(this.rollTarget - this.rollAngle) * step
      }
    } else if (this.rollPhase === 'return') {
      // Slowly return to 0
      const step = this.rollReturnSpeed * deltaMs
      if (Math.abs(this.rollAngle) <= step) {
        this.rollAngle = 0
        this.rollPhase = 'idle'
      } else {
        this.rollAngle -= Math.sign(this.rollAngle) * step
      }
    }

    // Apply roll via upVector rotation
    if (Number.isFinite(this.rollAngle)) {
      const cos = Math.cos(this.rollAngle)
      const sin = Math.sin(this.rollAngle)
      this.camera.upVector.set(sin, cos, 0)
    }
  }

  startRenderLoop(onBeforeRender: () => void): void {
    this.engine.runRenderLoop(() => {
      onBeforeRender()
      this.scene.render()
    })
  }

  pickGroundPosition(): { x: number; y: number } | null {
    const ray = this.scene.createPickingRay(
      this.scene.pointerX,
      this.scene.pointerY,
      null,
      this.camera,
    )
    const groundPlane = Plane.FromPositionAndNormal(Vector3.Zero(), Vector3.Up())
    const distance = ray.intersectsPlane(groundPlane)
    if (distance === null || distance < 0) return null
    const hit = ray.origin.add(ray.direction.scale(distance))
    return { x: hit.x, y: hit.z }
  }

  /** Project world position to screen pixel coordinates */
  worldToScreen(x: number, y: number, heightOffset = 0): { x: number; y: number } | null {
    const worldPos = new Vector3(x, heightOffset, y) // game Y → Babylon Z
    const viewProjection = this.scene.getTransformMatrix()
    const viewport = this.camera.viewport.toGlobal(
      this.engine.getRenderWidth(),
      this.engine.getRenderHeight(),
    )
    const projected = Vector3.Project(worldPos, Matrix.Identity(), viewProjection, viewport)
    if (projected.z < 0 || projected.z > 1) return null
    return { x: projected.x, y: projected.y }
  }

  dispose(): void {
    this.engine.dispose()
  }
}

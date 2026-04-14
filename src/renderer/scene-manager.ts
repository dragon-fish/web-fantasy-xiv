import { Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight, Vector3, Matrix, Quaternion, Plane } from '@babylonjs/core'

export class SceneManager {
  readonly engine: Engine
  readonly scene: Scene
  readonly camera: ArcRotateCamera

  // Camera roll animation state (applied as CSS transform on canvas)
  private rollAngle = 0          // current roll in degrees
  private rollTarget = 0         // target roll in degrees
  private rollSnapSpeed = 0      // deg/ms for snap phase
  private rollReturnSpeed = 0    // deg/ms for return phase
  private rollPhase: 'idle' | 'snap' | 'return' = 'idle'
  private canvas: HTMLCanvasElement

  constructor(engine: Engine) {
    this.engine = engine
    const canvas = engine.getRenderingCanvas()!

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

    this.canvas = canvas
    this.setupRollModifier()
  }

  /** Set camera target directly (used by CameraController) */
  setCameraTarget(x: number, y: number, heightOffset = 0): void {
    this.camera.target.set(x, -heightOffset, y)
  }

  /**
   * Trigger a camera roll animation (tilt effect).
   * Applied as CSS rotate() on the canvas — safe, doesn't touch Babylon internals.
   * Positive = clockwise, negative = counter-clockwise.
   */
  rollCamera(angleDeg: number, snapMs = 150, returnMs = 1500): void {
    this.canvas.style.transform = '' // clear any CSS leftover
    this.rollTarget = angleDeg
    this.rollSnapSpeed = Math.abs(angleDeg) / Math.max(snapMs, 1)
    this.rollReturnSpeed = Math.abs(angleDeg) / Math.max(returnMs, 1)
    this.rollPhase = 'snap'
  }

  /** Call each render frame to advance roll animation */
  updateRoll(deltaMs: number): void {
    if (this.rollPhase === 'idle') return

    if (this.rollPhase === 'snap') {
      const step = this.rollSnapSpeed * deltaMs
      if (Math.abs(this.rollTarget - this.rollAngle) <= step) {
        this.rollAngle = this.rollTarget
        this.rollPhase = 'return'
      } else {
        this.rollAngle += Math.sign(this.rollTarget - this.rollAngle) * step
      }
    } else if (this.rollPhase === 'return') {
      const step = this.rollReturnSpeed * deltaMs
      if (Math.abs(this.rollAngle) <= step) {
        this.rollAngle = 0
        this.rollPhase = 'idle'
      } else {
        this.rollAngle -= Math.sign(this.rollAngle) * step
      }
    }

    // Applied via getViewMatrix override — see constructor
  }

  private setupRollModifier(): void {
    // Override the camera's view matrix to inject roll rotation
    const originalGetViewMatrix = this.camera.getViewMatrix.bind(this.camera)
    this.camera.getViewMatrix = () => {
      const view = originalGetViewMatrix()
      if (this.rollAngle === 0) return view

      // Build a rotation around the camera's forward axis (Z in view space)
      const rollRad = (this.rollAngle * Math.PI) / 180
      const rollMatrix = Matrix.RotationZ(-rollRad)

      // Post-multiply: view × roll
      return view.multiply(rollMatrix)
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
    try {
      const worldPos = new Vector3(x, heightOffset, y)
      const viewProjection = this.scene.getTransformMatrix()
      if (!viewProjection) return null
      const viewport = this.camera.viewport.toGlobal(
        this.engine.getRenderWidth(),
        this.engine.getRenderHeight(),
      )
      const projected = Vector3.Project(worldPos, Matrix.Identity(), viewProjection, viewport)
      if (projected.z < 0 || projected.z > 1) return null
      return { x: projected.x, y: projected.y }
    } catch {
      return null
    }
  }

  dispose(): void {
    this.engine.stopRenderLoop()
    this.scene.dispose()
  }
}

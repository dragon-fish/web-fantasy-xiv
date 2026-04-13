import { Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight, Vector3, Plane } from '@babylonjs/core'

export interface CameraFollowConfig {
  /**
   * Smoothing factor (0-1). Higher = faster catch-up.
   * At each frame: speed = distance * smoothing * (dt_factor)
   * Default: 0.08
   */
  smoothing: number
  /**
   * When distance exceeds this, camera snaps harder (extra lerp boost).
   * Prevents the camera from falling too far behind during fast movement.
   * Default: 8
   */
  maxLag: number
  /**
   * Minimum speed (units/s) so the camera always creeps toward target
   * even at very small offsets, avoiding floating-point stall.
   * Default: 0.5
   */
  minSpeed: number
}

const DEFAULT_FOLLOW: CameraFollowConfig = {
  smoothing: 0.08,
  maxLag: 8,
  minSpeed: 0.5,
}

export class SceneManager {
  readonly engine: Engine
  readonly scene: Scene
  readonly camera: ArcRotateCamera

  private cameraPos = { x: 0, y: 0 }
  followConfig: CameraFollowConfig

  constructor(canvas: HTMLCanvasElement, followConfig?: Partial<CameraFollowConfig>) {
    this.followConfig = { ...DEFAULT_FOLLOW, ...followConfig }

    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true })

    this.scene = new Scene(this.engine)
    this.scene.clearColor.set(0.12, 0.12, 0.14, 1) // dark gray

    // Fixed top-down camera (~62° elevation)
    this.camera = new ArcRotateCamera(
      'camera',
      -Math.PI / 2, // alpha: rotation around Y
      (28 * Math.PI) / 180, // beta: 28° from zenith (~62° elevation)
      40, // radius: distance from target
      Vector3.Zero(),
      this.scene,
    )
    // Disable user camera control (fixed view)
    this.camera.attachControl(canvas, false)
    this.camera.inputs.clear()

    // Ambient fill light (soft, from above)
    const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene)
    ambient.intensity = 0.5

    // Directional light from northwest → shadows fall to southeast
    const sun = new DirectionalLight('sun', new Vector3(-1, -2, -1).normalize(), this.scene)
    sun.intensity = 0.6
  }

  /**
   * Smooth-follow a world position. Call every render frame with deltaTime.
   *
   * Uses exponential interpolation: the further the camera is from target,
   * the faster it moves. As it approaches, it decelerates naturally.
   * This creates a soft, non-linear follow feel.
   */
  followTarget(targetX: number, targetY: number, deltaMs: number): void {
    const { smoothing, maxLag, minSpeed } = this.followConfig

    const dx = targetX - this.cameraPos.x
    const dy = targetY - this.cameraPos.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < 0.001) {
      // Close enough, snap
      this.cameraPos.x = targetX
      this.cameraPos.y = targetY
    } else {
      // Normalize dt to ~16ms baseline so smoothing factor feels consistent
      const dtFactor = deltaMs / 16

      // Base lerp: exponential decay toward target
      let t = 1 - Math.pow(1 - smoothing, dtFactor)

      // Boost when distance exceeds maxLag (prevent falling too far behind)
      if (dist > maxLag) {
        const excess = (dist - maxLag) / maxLag
        t = Math.min(1, t + excess * 0.3)
      }

      // Ensure minimum movement speed
      const lerpDist = dist * t
      const minDist = minSpeed * (deltaMs / 1000)
      const moveDist = Math.max(lerpDist, Math.min(minDist, dist))

      const ratio = moveDist / dist
      this.cameraPos.x += dx * ratio
      this.cameraPos.y += dy * ratio
    }

    this.camera.target.set(this.cameraPos.x, 0, this.cameraPos.y)
  }

  /** Instantly snap camera to position (use on init / scene reset) */
  snapTo(x: number, y: number): void {
    this.cameraPos.x = x
    this.cameraPos.y = y
    this.camera.target.set(x, 0, y)
  }

  startRenderLoop(onBeforeRender: () => void): void {
    this.engine.runRenderLoop(() => {
      onBeforeRender()
      this.scene.render()
    })
  }

  /** Project screen mouse position to Y=0 ground plane (works even outside arena mesh) */
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

  dispose(): void {
    this.engine.dispose()
  }
}

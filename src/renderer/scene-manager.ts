import { Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight, Vector3, Plane } from '@babylonjs/core'

export class SceneManager {
  readonly engine: Engine
  readonly scene: Scene
  readonly camera: ArcRotateCamera

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
  setCameraTarget(x: number, y: number): void {
    this.camera.target.set(x, 0, y)
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
    const projected = Vector3.Project(
      worldPos,
      this.scene.getTransformMatrix(),
      this.scene.getProjectionMatrix(),
      this.camera.viewport.toGlobal(this.engine.getRenderWidth(), this.engine.getRenderHeight()),
    )
    if (projected.z < 0 || projected.z > 1) return null
    return { x: projected.x, y: projected.y }
  }

  dispose(): void {
    this.engine.dispose()
  }
}

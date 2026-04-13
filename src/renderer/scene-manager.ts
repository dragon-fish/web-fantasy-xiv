import { Engine, Scene, ArcRotateCamera, HemisphericLight, Vector3 } from '@babylonjs/core'

export class SceneManager {
  readonly engine: Engine
  readonly scene: Scene
  readonly camera: ArcRotateCamera

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true })

    this.scene = new Scene(this.engine)
    this.scene.clearColor.set(0.12, 0.12, 0.14, 1) // dark gray

    // Fixed top-down camera (~70° elevation from ground = 20° from zenith)
    this.camera = new ArcRotateCamera(
      'camera',
      -Math.PI / 2, // alpha: rotation around Y
      (20 * Math.PI) / 180, // beta: 20° from zenith (~70° elevation)
      40, // radius: distance from target
      Vector3.Zero(),
      this.scene,
    )
    // Disable user camera control (fixed view)
    this.camera.attachControl(canvas, false)
    this.camera.inputs.clear()

    // Lighting
    const light = new HemisphericLight('light', new Vector3(0, 1, -0.3), this.scene)
    light.intensity = 0.9
  }

  /** Follow a world position (e.g. player) */
  followTarget(x: number, y: number): void {
    this.camera.target.set(x, 0, y)
  }

  startRenderLoop(onBeforeRender: () => void): void {
    this.engine.runRenderLoop(() => {
      onBeforeRender()
      this.scene.render()
    })
  }

  dispose(): void {
    this.engine.dispose()
  }
}

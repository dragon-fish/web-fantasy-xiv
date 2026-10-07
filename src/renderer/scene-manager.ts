import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight, Vector3, Matrix, Plane,
  ShadowGenerator, GlowLayer, DefaultRenderingPipeline, ImageProcessingConfiguration, Color3,
  type AbstractMesh,
} from '@babylonjs/core'

export interface SceneAtmosphere {
  clearColor: Color3
  skyColor: Color3
  groundColor: Color3
  sunColor: Color3
  ambientIntensity: number
  sunIntensity: number
}

export class SceneManager {
  readonly engine: Engine
  readonly scene: Scene
  readonly camera: ArcRotateCamera
  readonly ambient: HemisphericLight
  readonly sun: DirectionalLight
  readonly shadows: ShadowGenerator
  readonly pipeline: DefaultRenderingPipeline
  private glowLayer: GlowLayer | null = null

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
      // Polar angle from vertical. Steeper than ~40° foreshortens far-side telegraphs too much;
      // flatter than ~30° shows only the tops of character heads.
      (36 * Math.PI) / 180,
      38,
      Vector3.Zero(),
      this.scene,
    )
    this.camera.attachControl(canvas, false)
    this.camera.inputs.clear()

    this.ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene)
    this.ambient.intensity = 0.5

    this.sun = new DirectionalLight('sun', new Vector3(-0.8, -2, 0.9).normalize(), this.scene)
    this.sun.position = new Vector3(16, 40, -18)
    this.sun.intensity = 0.6
    this.sun.shadowMinZ = 1
    this.sun.shadowMaxZ = 120

    this.shadows = new ShadowGenerator(2048, this.sun)
    this.shadows.usePercentageCloserFiltering = true
    this.shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM
    this.shadows.bias = 0.002
    this.shadows.normalBias = 0.02
    this.shadows.darkness = 0.35

    this.pipeline = new DefaultRenderingPipeline('main', true, this.scene, [this.camera])
    this.pipeline.samples = 4
    this.pipeline.fxaaEnabled = true
    this.pipeline.bloomEnabled = true
    this.pipeline.bloomThreshold = 0.82
    this.pipeline.bloomWeight = 0.22
    this.pipeline.bloomKernel = 48
    this.pipeline.bloomScale = 0.5
    this.pipeline.imageProcessingEnabled = true
    const ip = this.pipeline.imageProcessing
    ip.toneMappingEnabled = true
    // KHR neutral keeps authored albedo; ACES crushed dark-textured models to silhouettes
    ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL
    ip.exposure = 1.1
    ip.contrast = 1.0
    ip.vignetteEnabled = true
    ip.vignetteWeight = 1.6
    ip.vignetteStretch = 0.4
    ip.vignetteColor.set(0, 0, 0, 0)
    this.setAtmosphere({
      clearColor: new Color3(0.07, 0.07, 0.09),
      skyColor: new Color3(0.85, 0.88, 1),
      groundColor: new Color3(0.25, 0.22, 0.28),
      sunColor: new Color3(1, 0.95, 0.86),
      ambientIntensity: 0.55,
      sunIntensity: 1.1,
    })

    this.canvas = canvas
    this.setupRollModifier()
  }

  setAtmosphere(a: SceneAtmosphere): void {
    // Image processing treats the clear colour as linear; convert so the authored sRGB hex shows as-is
    const clear = a.clearColor.toLinearSpace()
    this.scene.clearColor.set(clear.r, clear.g, clear.b, 1)
    this.ambient.diffuse = a.skyColor
    this.ambient.groundColor = a.groundColor
    this.ambient.specular = Color3.Black()
    this.ambient.intensity = a.ambientIntensity
    this.sun.diffuse = a.sunColor
    this.sun.intensity = a.sunIntensity
  }

  /** Register a mesh (and its descendants) as a shadow caster. */
  addShadowCaster(mesh: AbstractMesh): void {
    this.shadows.addShadowCaster(mesh, true)
  }

  removeShadowCaster(mesh: AbstractMesh): void {
    this.shadows.removeShadowCaster(mesh, true)
  }

  /**
   * Opt a mesh into the glow layer. The layer is include-only: meshes never
   * registered here do not glow, so emissive-heavy scenes (survivors) are not
   * washed out by accident.
   */
  addGlow(mesh: AbstractMesh): void {
    if (!this.glowLayer) {
      this.glowLayer = new GlowLayer('glow', this.scene, { mainTextureSamples: 4, blurKernelSize: 48 })
      this.glowLayer.intensity = 0.9
    }
    this.glowLayer.addIncludedOnlyMesh(mesh as any)
  }

  removeGlow(mesh: AbstractMesh): void {
    this.glowLayer?.removeIncludedOnlyMesh(mesh as any)
  }

  private shakeAmp = 0
  private shakeLeft = 0
  private shakeTotal = 1

  /** Brief positional camera shake; stronger requests override weaker ones in flight. */
  shake(amplitude: number, ms: number): void {
    const current = this.shakeTotal > 0 ? this.shakeAmp * (this.shakeLeft / this.shakeTotal) : 0
    if (amplitude < current) return
    this.shakeAmp = amplitude
    this.shakeLeft = this.shakeTotal = ms
  }

  /** Set camera target directly (used by CameraController) */
  setCameraTarget(x: number, y: number, heightOffset = 0, deltaMs = 0): void {
    let ox = 0, oz = 0
    if (this.shakeLeft > 0) {
      this.shakeLeft = Math.max(0, this.shakeLeft - deltaMs)
      const k = this.shakeAmp * (this.shakeLeft / this.shakeTotal)
      ox = (Math.random() - 0.5) * 2 * k
      oz = (Math.random() - 0.5) * 2 * k
    }
    this.camera.target.set(x + ox, -heightOffset, y + oz)
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

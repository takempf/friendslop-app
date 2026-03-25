import { Effect } from 'postprocessing'
import { Uniform, Vector2, WebGLRenderer, WebGLRenderTarget } from 'three'

const TARGET_HEIGHT = 640

const fragmentShader = /* glsl */ `
  uniform vec2 uResolution; // always 640p dimensions, regardless of output size

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {

    vec2 texel = 1.0 / uResolution;

    // ── Horizontal phosphor spread ────────────────────────────────────────────
    vec3 c0 = texture(inputBuffer, uv + vec2(-texel.x, 0.0)).rgb;
    vec3 c1 = texture(inputBuffer, uv                      ).rgb;
    vec3 c2 = texture(inputBuffer, uv + vec2( texel.x, 0.0)).rgb;
    vec3 col = c0 * 0.22 + c1 * 0.56 + c2 * 0.22;

    // ── Shadow mask / aperture-grille ─────────────────────────────────────────
    float maskPhase = mod(floor(uv.x * uResolution.x), 3.0);
    vec3 triad = maskPhase < 0.5 ? vec3(1.0, 0.4, 0.4)
               : maskPhase < 1.5 ? vec3(0.4, 1.0, 0.4)
               :                   vec3(0.4, 0.4, 1.0);
    col *= mix(vec3(1.0), triad, 0.28);

    // ── Scanlines ─────────────────────────────────────────────────────────────
    // uResolution.y is locked to 640 so this is always 640 scanline cycles
    // across the full UV height — visible at any display resolution.
    float scan = pow(sin(uv.y * uResolution.y * 3.14159265), 2.0);
    col *= mix(0.1, 1.0, scan);  // pitch-dark gaps, bright centres

    // ── Brightness compensation ───────────────────────────────────────────────
    col *= 1.4;

    outputColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`

export class CRTEffect extends Effect {
  private _size = new Vector2()

  constructor() {
    super('CRTEffect', fragmentShader, {
      uniforms: new Map<string, Uniform>([
        ['uResolution', new Uniform(new Vector2(TARGET_HEIGHT * (16 / 9), TARGET_HEIGHT))],
      ]),
    })
  }

  update(renderer: WebGLRenderer, _inputBuffer: WebGLRenderTarget, _deltaTime: number) {
    // Always use 640p dimensions — not the actual output resolution — so that
    // scanline and mask frequencies stay locked to render pixels, not display pixels.
    renderer.getSize(this._size)
    const aspect = this._size.x / this._size.y
    ;(this.uniforms.get('uResolution')!.value as Vector2).set(
      Math.round(TARGET_HEIGHT * aspect),
      TARGET_HEIGHT,
    )
  }
}

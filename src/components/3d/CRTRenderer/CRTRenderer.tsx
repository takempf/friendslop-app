import { useThree, useFrame } from "@react-three/fiber";
import { debugConfig } from "@/debug/config";
import { useEffect, useRef } from "react";
import {
  WebGLRenderTarget,
  NearestFilter,
  LinearFilter,
  OrthographicCamera,
  Scene,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
} from "three";

const TARGET_HEIGHT = 640;

// Vertex shader uses Three.js injected matrices so it works correctly
// with our OrthographicCamera(-1,1,1,-1,0,1) + PlaneGeometry(2,2) setup.
const vert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// FXAA antialiasing pass — applied to the raw game render before dithering.
// Uses the classic Timothy Lottes FXAA algorithm (simplified 3.11 variant).
const fragAA = /* glsl */ `
  precision highp float;

  uniform sampler2D tAA;
  uniform vec2 texelSize;
  varying vec2 vUv;

  const float FXAA_SPAN_MAX   = 8.0;
  const float FXAA_REDUCE_MUL = 1.0 / 8.0;
  const float FXAA_REDUCE_MIN = 1.0 / 128.0;
  const vec3  LUMA            = vec3(0.299, 0.587, 0.114);

  void main() {
    vec3 rgbNW = texture2D(tAA, vUv + vec2(-1.0, -1.0) * texelSize).rgb;
    vec3 rgbNE = texture2D(tAA, vUv + vec2( 1.0, -1.0) * texelSize).rgb;
    vec3 rgbSW = texture2D(tAA, vUv + vec2(-1.0,  1.0) * texelSize).rgb;
    vec3 rgbSE = texture2D(tAA, vUv + vec2( 1.0,  1.0) * texelSize).rgb;
    vec3 rgbM  = texture2D(tAA, vUv).rgb;

    float lumaNW = dot(rgbNW, LUMA);
    float lumaNE = dot(rgbNE, LUMA);
    float lumaSW = dot(rgbSW, LUMA);
    float lumaSE = dot(rgbSE, LUMA);
    float lumaM  = dot(rgbM,  LUMA);

    float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
    float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));

    vec2 dir;
    dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
    dir.y =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));

    float dirReduce = max(
      (lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * FXAA_REDUCE_MUL),
      FXAA_REDUCE_MIN
    );
    float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
    dir = min(vec2(FXAA_SPAN_MAX), max(vec2(-FXAA_SPAN_MAX), dir * rcpDirMin)) * texelSize;

    vec3 rgbA = 0.5 * (
      texture2D(tAA, vUv + dir * (1.0 / 3.0 - 0.5)).rgb +
      texture2D(tAA, vUv + dir * (2.0 / 3.0 - 0.5)).rgb
    );
    vec3 rgbB = rgbA * 0.5 + 0.25 * (
      texture2D(tAA, vUv + dir * -0.5).rgb +
      texture2D(tAA, vUv + dir *  0.5).rgb
    );

    float lumaB = dot(rgbB, LUMA);
    gl_FragColor = vec4(
      (lumaB < lumaMin || lumaB > lumaMax) ? rgbA : rgbB,
      1.0
    );
  }
`;

// Dithering pass — runs at 640p so gl_FragCoord.xy are exact game-pixel integers.
//
// Replicates the PS1 GPU dithering pipeline:
//   1. Convert linear light → gamma (PS1 processed raw CRT-destined 8-bit values)
//   2. Add the exact 4×4 hardware dither offset (range [-4, 3]) to the 8-bit value
//   3. Clamp to [0, 255] and truncate to 5-bit (>> 3) → RGB555, 32 levels/channel
//   4. Convert back to linear so the CRT shader's gamma correction fires once normally
const fragDither = /* glsl */ `
  precision highp float;

  uniform sampler2D tGame;
  varying vec2 vUv;

  // PS1 hardware dither matrix — offsets added to 8-bit colour before 5-bit truncation.
  // Source: No$PSX GPU documentation / PSYDEV SDK dither table.
  float ps1Offset(vec2 pos) {
    ivec2 p = ivec2(pos) & ivec2(3);
    int m[16] = int[16](
      -4,  0, -3,  1,
       2, -2,  3, -1,
      -3,  1, -4,  0,
       3, -1,  2, -2
    );
    return float(m[p.y * 4 + p.x]);
  }

  void main() {
    vec3 lin = texture2D(tGame, vUv).rgb;

    // Linear → gamma (PS1 worked in gamma-encoded 8-bit space)
    vec3 g = pow(max(lin, vec3(0.0)), vec3(1.0 / 2.2));

    // Add PS1 dither offset in 8-bit space, clamp, truncate to 5-bit, normalise
    float offset = ps1Offset(gl_FragCoord.xy);
    vec3 rgb555 = floor(clamp(g * 255.0 + offset, 0.0, 255.0) / 8.0) / 31.0;

    // Back to linear for the CRT shader
    gl_FragColor = vec4(pow(rgb555, vec3(2.2)), 1.0);
  }
`;

// Fragment shader from https://github.com/gingerbeardman/webgl-crt-shader/
// PI renamed → CRT_PI to avoid collision with any Three.js preamble #define.
// curvature and vignetteStrength are set to 0 by default (per project preference).
const frag = /* glsl */ `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
  #else
    precision mediump float;
  #endif

  uniform sampler2D tDiffuse;
  uniform float scanlineIntensity;
  uniform float scanlineCount;
  uniform float time;
  uniform float yOffset;
  uniform float brightness;
  uniform float contrast;
  uniform float saturation;
  uniform float bloomIntensity;
  uniform float bloomThreshold;
  uniform float rgbShift;
  uniform float adaptiveIntensity;
  uniform float vignetteStrength;
  uniform float curvature;
  uniform float flickerStrength;

  varying vec2 vUv;

  const float CRT_PI = 3.14159265;
  const vec3 LUMA = vec3(0.299, 0.587, 0.114);
  const float BLOOM_THRESHOLD_FACTOR = 0.5;
  const float BLOOM_FACTOR_MULT = 1.5;
  const float RGB_SHIFT_SCALE = 0.005;
  const float RGB_SHIFT_INTENSITY = 0.08;

  vec2 curveRemapUV(vec2 uv, float curvature) {
    vec2 coords = uv * 2.0 - 1.0;
    float curveAmount = curvature * 0.25;
    float dist = dot(coords, coords);
    coords = coords * (1.0 + dist * curveAmount);
    return coords * 0.5 + 0.5;
  }

  vec4 sampleBloom(sampler2D tex, vec2 uv, float radius, vec4 centerSample) {
    vec2 o = vec2(radius);
    vec4 c = centerSample * 0.4;
    vec4 cross_ = (
      texture2D(tex, uv + vec2(o.x, 0.0)) +
      texture2D(tex, uv - vec2(o.x, 0.0)) +
      texture2D(tex, uv + vec2(0.0, o.y)) +
      texture2D(tex, uv - vec2(0.0, o.y))
    ) * 0.15;
    return c + cross_;
  }

  float vignetteApprox(vec2 uv, float strength) {
    vec2 vigCoord = uv * 2.0 - 1.0;
    float dist = max(abs(vigCoord.x), abs(vigCoord.y));
    return 1.0 - dist * dist * strength;
  }

  void main() {
    vec2 uv = vUv;

    if (curvature > 0.001) {
      uv = curveRemapUV(uv, curvature);
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0);
        return;
      }
    }

    vec4 pixel = texture2D(tDiffuse, uv);

    if (bloomIntensity > 0.001) {
      float pixelLum = dot(pixel.rgb, LUMA);
      float bloomThresholdHalf = bloomThreshold * BLOOM_THRESHOLD_FACTOR;
      if (pixelLum > bloomThresholdHalf) {
        vec4 bloomSample = sampleBloom(tDiffuse, uv, 0.005, pixel);
        bloomSample.rgb *= brightness;
        float bloomLum = dot(bloomSample.rgb, LUMA);
        float bloomFactor = bloomIntensity * max(0.0, (bloomLum - bloomThreshold) * BLOOM_FACTOR_MULT);
        pixel.rgb += bloomSample.rgb * bloomFactor;
      }
    }

    if (rgbShift > 0.005) {
      float shift = rgbShift * RGB_SHIFT_SCALE;
      pixel.r += texture2D(tDiffuse, vec2(uv.x + shift, uv.y)).r * RGB_SHIFT_INTENSITY;
      pixel.b += texture2D(tDiffuse, vec2(uv.x - shift, uv.y)).b * RGB_SHIFT_INTENSITY;
    }

    pixel.rgb *= brightness;
    float luminance = dot(pixel.rgb, LUMA);
    pixel.rgb = (pixel.rgb - 0.5) * contrast + 0.5;
    pixel.rgb = mix(vec3(luminance), pixel.rgb, saturation);

    float lightingMask = 1.0;

    if (scanlineIntensity > 0.001) {
      float scanlineY = (uv.y + yOffset) * scanlineCount;
      float scanlinePattern = abs(sin(scanlineY * CRT_PI));
      float adaptiveFactor = 1.0;
      if (adaptiveIntensity > 0.001) {
        float yPattern = sin(uv.y * 30.0) * 0.5 + 0.5;
        adaptiveFactor = 1.0 - yPattern * adaptiveIntensity * 0.2;
      }
      lightingMask *= 1.0 - scanlinePattern * scanlineIntensity * adaptiveFactor;
    }

    if (flickerStrength > 0.001) {
      lightingMask *= 1.0 + sin(time * 110.0) * flickerStrength;
    }

    if (vignetteStrength > 0.001) {
      lightingMask *= vignetteApprox(uv, vignetteStrength);
    }

    pixel.rgb *= lightingMask;

    // Three.js does not inject linearToSRGB for custom ShaderMaterial gl_FragColor
    // writes, so the linear render-target values would display ~30% too dark on an
    // sRGB canvas without this manual gamma correction.
    pixel.rgb = pow(clamp(pixel.rgb, 0.0, 1.0), vec3(1.0 / 2.2));

    gl_FragColor = pixel;
  }
`;

export function CRTRenderer() {
  const { gl, scene, camera } = useThree();
  const timeRef = useRef(0);

  const crtRef = useRef<{
    gameTarget: WebGLRenderTarget;
    aaTarget: WebGLRenderTarget;
    ditherTarget: WebGLRenderTarget;
    aaMat: ShaderMaterial;
    ditherMat: ShaderMaterial;
    mat: ShaderMaterial;
    crtScene: Scene;
    aaScene: Scene;
    ditherScene: Scene;
    crtCamera: OrthographicCamera;
  } | null>(null);

  if (crtRef.current == null) {
    const w0 = Math.round(TARGET_HEIGHT * (16 / 9));

    const aaMat = new ShaderMaterial({
      vertexShader: vert,
      fragmentShader: fragAA,
      uniforms: {
        tAA: { value: null },
        texelSize: { value: [1 / w0, 1 / TARGET_HEIGHT] },
      },
      depthTest: false,
      depthWrite: false,
    });
    const aaScene = new Scene();
    aaScene.add(new Mesh(new PlaneGeometry(2, 2), aaMat));

    const ditherMat = new ShaderMaterial({
      vertexShader: vert,
      fragmentShader: fragDither,
      uniforms: { tGame: { value: null } },
      depthTest: false,
      depthWrite: false,
    });
    const ditherScene = new Scene();
    ditherScene.add(new Mesh(new PlaneGeometry(2, 2), ditherMat));

    const mat = new ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        tDiffuse: { value: null },
        scanlineIntensity: { value: 0.5 },
        scanlineCount: { value: 320.0 },
        time: { value: 0.0 },
        yOffset: { value: 0.0 },
        brightness: { value: 1.0 },
        contrast: { value: 1.0 },
        saturation: { value: 1.1 },
        bloomIntensity: { value: 0.25 },
        bloomThreshold: { value: 0.65 },
        rgbShift: { value: 1.0 },
        adaptiveIntensity: { value: 0.0 }, // non-zero causes slow horizontal gradient bands
        vignetteStrength: { value: 0.0 },
        curvature: { value: 0.0 },
        flickerStrength: { value: 0.01 },
      },
      depthTest: false,
      depthWrite: false,
    });
    const crtScene = new Scene();
    crtScene.add(new Mesh(new PlaneGeometry(2, 2), mat));

    crtRef.current = {
      gameTarget: new WebGLRenderTarget(w0, TARGET_HEIGHT, {
        minFilter: NearestFilter,
        magFilter: NearestFilter,
      }),
      aaTarget: new WebGLRenderTarget(w0, TARGET_HEIGHT, {
        minFilter: LinearFilter,
        magFilter: LinearFilter,
      }),
      ditherTarget: new WebGLRenderTarget(w0, TARGET_HEIGHT, {
        minFilter: LinearFilter,
        magFilter: LinearFilter,
      }),
      aaMat,
      aaScene,
      ditherMat,
      mat,
      crtScene,
      ditherScene,
      crtCamera: new OrthographicCamera(-1, 1, 1, -1, 0, 1),
    };
  }

  useEffect(
    () => () => {
      const {
        gameTarget,
        aaTarget,
        ditherTarget,
        aaMat,
        ditherMat,
        mat,
        crtScene,
        aaScene,
        ditherScene,
      } = crtRef.current!;
      gameTarget.dispose();
      aaTarget.dispose();
      ditherTarget.dispose();
      (aaScene.children[0] as Mesh).geometry.dispose();
      aaMat.dispose();
      (ditherScene.children[0] as Mesh).geometry.dispose();
      ditherMat.dispose();
      (crtScene.children[0] as Mesh).geometry.dispose();
      mat.dispose();
    },
    [],
  );

  useFrame((_, delta) => {
    timeRef.current += delta;

    const { aaMat, ditherMat, mat, crtScene, aaScene, ditherScene, crtCamera } =
      crtRef.current!;

    // Rebuild render targets if aspect ratio or smoothing filter changes
    const aspect = gl.domElement.width / gl.domElement.height;
    const w = Math.round(TARGET_HEIGHT * aspect);
    const filter = debugConfig.crtSmoothing ? LinearFilter : NearestFilter;
    if (
      crtRef.current!.gameTarget.width !== w ||
      crtRef.current!.gameTarget.texture.magFilter !== filter
    ) {
      crtRef.current!.gameTarget.dispose();
      crtRef.current!.gameTarget = new WebGLRenderTarget(w, TARGET_HEIGHT, {
        minFilter: filter,
        magFilter: filter,
      });
      crtRef.current!.aaTarget.dispose();
      crtRef.current!.aaTarget = new WebGLRenderTarget(w, TARGET_HEIGHT, {
        minFilter: LinearFilter,
        magFilter: LinearFilter,
      });
      crtRef.current!.ditherTarget.dispose();
      crtRef.current!.ditherTarget = new WebGLRenderTarget(w, TARGET_HEIGHT, {
        minFilter: LinearFilter,
        magFilter: LinearFilter,
      });
      aaMat.uniforms.texelSize.value = [1 / w, 1 / TARGET_HEIGHT];
    }
    const { gameTarget, aaTarget, ditherTarget } = crtRef.current!;

    if (!debugConfig.crtEnabled) {
      // Bypass: render scene directly to canvas at native resolution
      gl.setRenderTarget(null);
      gl.render(scene, camera);
      return;
    }

    // Pass 1 — render game scene into 640p target (full colour)
    gl.setRenderTarget(gameTarget);
    gl.render(scene, camera);

    // Pass 2 — FXAA on the raw game render, still at 640p
    aaMat.uniforms.tAA.value = gameTarget.texture;
    gl.setRenderTarget(aaTarget);
    gl.render(aaScene, crtCamera);

    // Pass 3 — dither the AA'd game render to 64 colours, still at 640p
    ditherMat.uniforms.tGame.value = aaTarget.texture;
    gl.setRenderTarget(ditherTarget);
    gl.render(ditherScene, crtCamera);

    // Pass 4 — CRT shader at display resolution → canvas
    mat.uniforms.tDiffuse.value = ditherTarget.texture;
    mat.uniforms.time.value = timeRef.current;
    gl.setRenderTarget(null);
    gl.render(crtScene, crtCamera);
  }, 1);

  return null;
}

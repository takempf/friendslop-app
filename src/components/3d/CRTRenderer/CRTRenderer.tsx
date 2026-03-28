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

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Consolidated Super Shader: FXAA -> PS1 Dither -> CRT Effects.
// All logic runs in a single pass at native resolution, sampling from a 640p target.
const fragCombined = /* glsl */ `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
  #else
    precision mediump float;
  #endif

  uniform sampler2D tDiffuse;
  uniform vec2 texelSize;       // 1/640p_resolution
  uniform vec2 resolution;      // 640p_resolution
  uniform float time;
  uniform float scanlineIntensity;
  uniform float scanlineCount;
  uniform float brightness;
  uniform float contrast;
  uniform float saturation;
  uniform float bloomIntensity;
  uniform float bloomThreshold;
  uniform float rgbShift;
  uniform float flickerStrength;

  varying vec2 vUv;

  const float CRT_PI = 3.14159265;
  const vec3 LUMA = vec3(0.299, 0.587, 0.114);

  // --- FXAA ---
  const float FXAA_SPAN_MAX   = 8.0;
  const float FXAA_REDUCE_MUL = 1.0 / 8.0;
  const float FXAA_REDUCE_MIN = 1.0 / 128.0;

  vec3 applyFXAA(sampler2D tex, vec2 uv, vec2 tSize) {
    vec3 rgbNW = texture2D(tex, uv + vec2(-1.0, -1.0) * tSize).rgb;
    vec3 rgbNE = texture2D(tex, uv + vec2( 1.0, -1.0) * tSize).rgb;
    vec3 rgbSW = texture2D(tex, uv + vec2(-1.0,  1.0) * tSize).rgb;
    vec3 rgbSE = texture2D(tex, uv + vec2( 1.0,  1.0) * tSize).rgb;
    vec3 rgbM  = texture2D(tex, uv).rgb;

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

    float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * FXAA_REDUCE_MUL), FXAA_REDUCE_MIN);
    float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
    dir = min(vec2(FXAA_SPAN_MAX), max(vec2(-FXAA_SPAN_MAX), dir * rcpDirMin)) * tSize;

    vec3 rgbA = 0.5 * (
      texture2D(tex, uv + dir * (1.0 / 3.0 - 0.5)).rgb +
      texture2D(tex, uv + dir * (2.0 / 3.0 - 0.5)).rgb
    );
    vec3 rgbB = rgbA * 0.5 + 0.25 * (
      texture2D(tex, uv + dir * -0.5).rgb +
      texture2D(tex, uv + dir *  0.5).rgb
    );

    float lumaB = dot(rgbB, LUMA);
    return (lumaB < lumaMin || lumaB > lumaMax) ? rgbA : rgbB;
  }

  // --- Dithering ---
  float ps1Offset(vec2 pos) {
    ivec2 p = ivec2(pos) & ivec2(3);
    int m[16] = int[16](-4, 0, -3, 1, 2, -2, 3, -1, -3, 1, -4, 0, 3, -1, 2, -2);
    return float(m[p.y * 4 + p.x]);
  }

  vec3 applyDither(vec3 color, vec2 pos) {
    vec3 g = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));
    float offset = ps1Offset(pos);
    vec3 rgb555 = floor(clamp(g * 255.0 + offset, 0.0, 255.0) / 8.0) / 31.0;
    return pow(rgb555, vec3(2.2));
  }

  // --- CRT Utility ---
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

  void main() {
    // 1. AA (FXAA) at source resolution
    vec3 color = applyFXAA(tDiffuse, vUv, texelSize);

    // 2. PS1 Dither (at fixed 640p grid resolution)
    vec2 virtualPos = floor(vUv * resolution);
    color = applyDither(color, virtualPos);

    vec4 pixel = vec4(color, 1.0);

    // 3. Bloom
    if (bloomIntensity > 0.001) {
      float pixelLum = dot(pixel.rgb, LUMA);
      if (pixelLum > bloomThreshold * 0.5) {
        vec4 bloomSample = sampleBloom(tDiffuse, vUv, 0.005, pixel);
        bloomSample.rgb *= brightness;
        float bloomLum = dot(bloomSample.rgb, LUMA);
        float bloomFactor = bloomIntensity * max(0.0, (bloomLum - bloomThreshold) * 2.25);
        pixel.rgb += bloomSample.rgb * bloomFactor;
      }
    }

    // 4. RGB Shift
    if (rgbShift > 0.005) {
      float shift = rgbShift * 0.005;
      pixel.r += texture2D(tDiffuse, vec2(vUv.x + shift, vUv.y)).r * 0.08;
      pixel.b += texture2D(tDiffuse, vec2(vUv.x - shift, vUv.y)).b * 0.08;
    }

    // 5. Brightness, Contrast, Saturation
    pixel.rgb *= brightness;
    float luminance = dot(pixel.rgb, LUMA);
    pixel.rgb = (pixel.rgb - 0.5) * contrast + 0.5;
    pixel.rgb = mix(vec3(luminance), pixel.rgb, saturation);

    // 6. Lighting / Scanlines / Flicker
    float lightingMask = 1.0;

    if (scanlineIntensity > 0.001) {
      float scanlineY = vUv.y * scanlineCount;
      float scanlinePattern = abs(sin(scanlineY * CRT_PI));
      lightingMask *= 1.0 - scanlinePattern * scanlineIntensity;
    }

    if (flickerStrength > 0.001) {
      lightingMask *= 1.0 + sin(time * 110.0) * flickerStrength;
    }

    pixel.rgb *= lightingMask;

    // 7. Gamma Correction for Canvas
    pixel.rgb = pow(clamp(pixel.rgb, 0.0, 1.0), vec3(1.0 / 2.2));

    gl_FragColor = pixel;
  }
`;

export function CRTRenderer() {
  const { gl, scene, camera } = useThree();
  const timeRef = useRef(0);

  const crtRef = useRef<{
    gameTarget: WebGLRenderTarget;
    mat: ShaderMaterial;
    crtScene: Scene;
    crtCamera: OrthographicCamera;
  } | null>(null);

  if (crtRef.current == null) {
    const w0 = Math.round(TARGET_HEIGHT * (16 / 9));

    const mat = new ShaderMaterial({
      vertexShader: vert,
      fragmentShader: fragCombined,
      uniforms: {
        tDiffuse: { value: null },
        texelSize: { value: [1 / w0, 1 / TARGET_HEIGHT] },
        resolution: { value: [w0, TARGET_HEIGHT] },
        scanlineIntensity: { value: 0.5 },
        scanlineCount: { value: 320.0 },
        time: { value: 0.0 },
        brightness: { value: 1.0 },
        contrast: { value: 1.0 },
        saturation: { value: 1.1 },
        bloomIntensity: { value: 0.25 },
        bloomThreshold: { value: 0.65 },
        rgbShift: { value: 1.0 },
        flickerStrength: { value: 0.01 },
      },
      depthTest: false,
      depthWrite: false,
    });
    const crtScene = new Scene();
    crtScene.add(new Mesh(new PlaneGeometry(2, 2), mat));

    crtRef.current = {
      gameTarget: new WebGLRenderTarget(w0, TARGET_HEIGHT, {
        minFilter: LinearFilter,
        magFilter: LinearFilter,
      }),
      mat,
      crtScene,
      crtCamera: new OrthographicCamera(-1, 1, 1, -1, 0, 1),
    };
  }

  useEffect(
    () => () => {
      const { gameTarget, mat, crtScene } = crtRef.current!;
      gameTarget.dispose();
      (crtScene.children[0] as Mesh).geometry.dispose();
      mat.dispose();
    },
    [],
  );

  useFrame((_, delta) => {
    timeRef.current += delta;

    const { mat, crtScene, crtCamera } = crtRef.current!;

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
      mat.uniforms.texelSize.value = [1 / w, 1 / TARGET_HEIGHT];
      mat.uniforms.resolution.value = [w, TARGET_HEIGHT];
    }

    const { gameTarget } = crtRef.current!;

    if (!debugConfig.crtEnabled) {
      gl.setRenderTarget(null);
      gl.render(scene, camera);
      return;
    }

    // PASS 1 — render game scene at 640p
    gl.setRenderTarget(gameTarget);
    gl.render(scene, camera);

    // PASS 2 — Full post-processing sweep (AA -> Dither -> CRT) at native resolution
    mat.uniforms.tDiffuse.value = gameTarget.texture;
    mat.uniforms.time.value = timeRef.current;
    gl.setRenderTarget(null);
    gl.render(crtScene, crtCamera);
  }, 1);

  return null;
}

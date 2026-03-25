import { useThree, useFrame } from "@react-three/fiber";
import { debugConfig } from "../debug/config";
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
  Vector2,
  Uniform,
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
    target: WebGLRenderTarget;
    mat: ShaderMaterial;
    crtScene: Scene;
    crtCamera: OrthographicCamera;
  } | null>(null);

  if (crtRef.current == null) {
    const mat = new ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        tDiffuse: { value: null },
        scanlineIntensity: { value: 0.33 },
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
      target: new WebGLRenderTarget(
        Math.round(TARGET_HEIGHT * (16 / 9)),
        TARGET_HEIGHT,
        { minFilter: NearestFilter, magFilter: NearestFilter },
      ),
      mat,
      crtScene,
      crtCamera: new OrthographicCamera(-1, 1, 1, -1, 0, 1),
    };
  }

  useEffect(
    () => () => {
      const { target, mat, crtScene } = crtRef.current!;
      target.dispose();
      (crtScene.children[0] as Mesh).geometry.dispose();
      mat.dispose();
    },
    [],
  );

  useFrame((_, delta) => {
    timeRef.current += delta;

    const { mat, crtScene, crtCamera } = crtRef.current!;

    // Rebuild render target if aspect ratio or smoothing filter changes
    const aspect = gl.domElement.width / gl.domElement.height;
    const w = Math.round(TARGET_HEIGHT * aspect);
    const filter = debugConfig.crtSmoothing ? LinearFilter : NearestFilter;
    if (
      crtRef.current!.target.width !== w ||
      crtRef.current!.target.texture.magFilter !== filter
    ) {
      crtRef.current!.target.dispose();
      crtRef.current!.target = new WebGLRenderTarget(w, TARGET_HEIGHT, {
        minFilter: filter,
        magFilter: filter,
      });
    }
    const target = crtRef.current!.target;

    if (!debugConfig.crtEnabled) {
      // Bypass: render scene directly to canvas at native resolution
      gl.setRenderTarget(null);
      gl.render(scene, camera);
      return;
    }

    // Pass 1 — render game scene into 640p target
    gl.setRenderTarget(target);
    gl.render(scene, camera);

    // Pass 2 — CRT shader at display resolution → canvas
    mat.uniforms.tDiffuse.value = target.texture;
    mat.uniforms.time.value = timeRef.current;
    gl.setRenderTarget(null);
    gl.render(crtScene, crtCamera);
  }, 1);

  return null;
}

import { useThree, useFrame } from "@react-three/fiber";
import { gameConfig } from "@/config";
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

// PASS 1: FXAA, PS1 Dither, Bloom at 640p
const fragPost = /* glsl */ `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
  #else
    precision mediump float;
  #endif

  uniform sampler2D tDiffuse;
  uniform vec2 texelSize;       // 1/640p_resolution
  uniform vec2 resolution;      // 640p_resolution
  uniform float bloomIntensity;
  uniform float bloomThreshold;

  varying vec2 vUv;

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

  // --- Bloom ---
  vec3 bloomBlur(sampler2D tex, vec2 uv, float threshold) {
    vec3 sum = vec3(0.0);
    float wTotal = 0.0;
    float step = 0.003;
    for (int x = -2; x <= 2; x++) {
      for (int y = -2; y <= 2; y++) {
        float w = exp(-float(x * x + y * y) * 0.5);
        vec3 s = texture2D(tex, uv + vec2(float(x), float(y)) * step).rgb;
        sum += max(s - threshold, 0.0) * w;
        wTotal += w;
      }
    }
    return sum / wTotal;
  }

  void main() {
    vec3 color = applyFXAA(tDiffuse, vUv, texelSize);

    vec2 virtualPos = floor(vUv * resolution);
    color = applyDither(color, virtualPos);

    if (bloomIntensity > 0.001) {
      color += bloomBlur(tDiffuse, vUv, bloomThreshold) * bloomIntensity;
    }

    gl_FragColor = vec4(color, 1.0);
  }
`;

// PASS 2: Color, Distortions, Scanlines, Phosphor Masks at NATIVE res
const fragCRT = /* glsl */ `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
  #else
    precision mediump float;
  #endif

  uniform sampler2D tDiffuse;
  uniform vec2 resolution;      // 640p_resolution
  uniform float time;
  uniform float scanlineIntensity;
  uniform float scanlineCount;
  uniform float brightness;
  uniform float contrast;
  uniform float saturation;
  uniform float rgbShift;
  uniform float flickerStrength;

  varying vec2 vUv;

  const float CRT_PI = 3.14159265;
  const vec3 LUMA = vec3(0.299, 0.587, 0.114);

  void main() {
    vec4 pixel = vec4(0.0, 0.0, 0.0, 1.0);

    // 4. RGB Shift
    if (rgbShift > 0.005) {
      float shift = rgbShift * 0.005;
      pixel.r += texture2D(tDiffuse, vec2(vUv.x + shift, vUv.y)).r;
      pixel.b += texture2D(tDiffuse, vec2(vUv.x - shift, vUv.y)).b;
      pixel.g += texture2D(tDiffuse, vUv).g;
    } else {
      pixel.rgb = texture2D(tDiffuse, vUv).rgb;
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
      float scanlinePattern = abs(sin((scanlineY - 0.25) * CRT_PI));
      lightingMask *= 1.0 - scanlinePattern * scanlineIntensity;
    }

    // RGB Shadow Mask (Staggered Phosphor Triads)
    float maskCountY = scanlineCount;
    // Scale X to maintain square cells regardless of aspect ratio
    float maskCountX = scanlineCount * (resolution.x / resolution.y);
    
    // Offset Y by +0.25 so the physical mask row boundaries perfectly align with the darkest scanline gaps
    vec2 maskPos = vec2(vUv.x * maskCountX, (vUv.y * maskCountY) + 0.25);
    
    // Stagger every other row by half a triad (which is 1.5 subpixels, or 0.5 of a triad)
    if (mod(floor(maskPos.y), 2.0) == 0.0) {
      maskPos.x += 0.5;
    }
    
    // 3 subpixels per triad (R, G, B)
    float subpixel = mod(floor(maskPos.x * 3.0), 3.0);
    
    vec3 shadowMask = vec3(0.5); // "Off" phosphor darkness level
    if (subpixel == 0.0) shadowMask.r = 1.0;
    else if (subpixel == 1.0) shadowMask.g = 1.0;
    else shadowMask.b = 1.0;
    
    // Boost by 1.5 to maintain overall average brightness (since mean of 1, 0.5, 0.5 is ~0.66)
    pixel.rgb *= shadowMask * 1.5;

    if (flickerStrength > 0.001) {
      lightingMask *= 1.0 + sin(time * 110.0) * flickerStrength;
    }

    pixel.rgb *= lightingMask;

    // 7. Gamma Correction for Canvas
    pixel.rgb = pow(clamp(pixel.rgb, 0.0, 1.0), vec3(1.0 / 2.2));

    gl_FragColor = pixel;
  }
`;

export function CRTRenderer({ scanlines }: { scanlines: number }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const timeRef = useRef(0);
  const crtRef = useRef<{
    gameTarget: WebGLRenderTarget;
    postTarget: WebGLRenderTarget;
    matPost: ShaderMaterial;
    matCRT: ShaderMaterial;
    crtScene: Scene;
    crtCamera: OrthographicCamera;
    quad: Mesh;
  } | null>(null);

  if (crtRef.current == null) {
    const w0 = Math.round(TARGET_HEIGHT * (16 / 9));

    const matPost = new ShaderMaterial({
      vertexShader: vert,
      fragmentShader: fragPost,
      uniforms: {
        tDiffuse: { value: null },
        texelSize: { value: [1 / w0, 1 / TARGET_HEIGHT] },
        resolution: { value: [w0, TARGET_HEIGHT] },
        bloomIntensity: { value: 0.5 },
        bloomThreshold: { value: 0.5 },
      },
      depthTest: false,
      depthWrite: false,
    });

    const matCRT = new ShaderMaterial({
      vertexShader: vert,
      fragmentShader: fragCRT,
      uniforms: {
        tDiffuse: { value: null },
        resolution: { value: [w0, TARGET_HEIGHT] },
        scanlineIntensity: { value: 0.45 },
        scanlineCount: { value: scanlines * 1.0 },
        time: { value: 0.0 },
        brightness: { value: 1.5 },
        contrast: { value: 1.0 },
        saturation: { value: 1.1 },
        rgbShift: { value: 0.1 },
        flickerStrength: { value: 0.01 },
      },
      depthTest: false,
      depthWrite: false,
    });

    const gameTarget = new WebGLRenderTarget(w0, TARGET_HEIGHT, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      generateMipmaps: false,
      depthBuffer: true,
    });

    const postTarget = new WebGLRenderTarget(w0, TARGET_HEIGHT, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      generateMipmaps: false,
      depthBuffer: false,
    });

    matPost.uniforms.tDiffuse.value = gameTarget.texture;
    matCRT.uniforms.tDiffuse.value = postTarget.texture;

    const crtScene = new Scene();
    crtScene.matrixAutoUpdate = false;

    const quad = new Mesh(new PlaneGeometry(2, 2), matPost);
    quad.frustumCulled = false;
    quad.matrixAutoUpdate = false;
    crtScene.add(quad);

    crtRef.current = {
      gameTarget,
      postTarget,
      matPost,
      matCRT,
      crtScene,
      crtCamera: new OrthographicCamera(-1, 1, 1, -1, 0, 1),
      quad,
    };
  }

  useEffect(
    () => () => {
      const { gameTarget, postTarget, matPost, matCRT, quad } = crtRef.current!;
      gameTarget.dispose();
      postTarget.dispose();
      quad.geometry.dispose();
      matPost.dispose();
      matCRT.dispose();
    },
    [],
  );

  useFrame((_, delta) => {
    timeRef.current += delta;

    const { matPost, matCRT, crtScene, crtCamera, quad } = crtRef.current!;
    if (matCRT.uniforms.scanlineCount.value !== scanlines) {
      matCRT.uniforms.scanlineCount.value = scanlines * 1.0;
    }

    // Rebuild render targets if aspect ratio or smoothing filter changes
    const aspect = gl.domElement.width / gl.domElement.height;
    const w = Math.round(TARGET_HEIGHT * aspect);
    const filter = gameConfig.crtSmoothing ? LinearFilter : NearestFilter;

    if (
      crtRef.current!.gameTarget.width !== w ||
      crtRef.current!.gameTarget.texture.magFilter !== filter
    ) {
      crtRef.current!.gameTarget.dispose();
      crtRef.current!.postTarget.dispose();

      const newGameTarget = new WebGLRenderTarget(w, TARGET_HEIGHT, {
        minFilter: filter,
        magFilter: filter,
        generateMipmaps: false,
        depthBuffer: true,
      });
      const newPostTarget = new WebGLRenderTarget(w, TARGET_HEIGHT, {
        minFilter: filter,
        magFilter: filter,
        generateMipmaps: false,
        depthBuffer: false,
      });

      crtRef.current!.gameTarget = newGameTarget;
      crtRef.current!.postTarget = newPostTarget;

      matPost.uniforms.texelSize.value = [1 / w, 1 / TARGET_HEIGHT];
      matPost.uniforms.resolution.value = [w, TARGET_HEIGHT];
      matPost.uniforms.tDiffuse.value = newGameTarget.texture;

      matCRT.uniforms.resolution.value = [w, TARGET_HEIGHT];
      matCRT.uniforms.tDiffuse.value = newPostTarget.texture;
    }

    const { gameTarget, postTarget } = crtRef.current!;

    // PASS 1 — render game scene at 640p
    gl.setRenderTarget(gameTarget);
    gl.render(scene, camera);

    // PASS 2 — FXAA and Bloom at 640p
    quad.material = matPost;
    gl.setRenderTarget(postTarget);
    gl.render(crtScene, crtCamera);

    // PASS 3 — CRT Effects at Native Resolution
    quad.material = matCRT;
    matCRT.uniforms.time.value = timeRef.current;

    gl.setRenderTarget(null);
    gl.render(crtScene, crtCamera);
  }, 1);

  return null;
}

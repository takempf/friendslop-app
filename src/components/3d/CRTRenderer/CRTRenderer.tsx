import { useThree, useFrame } from "@react-three/fiber";
import { gameConfig, subscribeToConfig } from "@/config";
import { CRT_TARGET_HEIGHT } from "@/constants/render";
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

import { ditherVert, fragDither } from "@/components/3d/Dither/ditherShader";

const TARGET_HEIGHT = CRT_TARGET_HEIGHT;

// PASS 2: Color, Distortions, Scanlines, Phosphor Masks at NATIVE res
const fragCRT = /* glsl */ `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
  #else
    precision mediump float;
  #endif

  uniform sampler2D tDiffuse;
  uniform vec2 texelSize;
  uniform float time;
  uniform float scanlineIntensity;
  uniform float cellHeight;
  uniform float subpixelWidth;
  uniform float brightness;
  uniform float contrast;
  uniform float saturation;
  uniform float rgbShift;
  uniform float flickerStrength;
  uniform float bloomStrength;
  uniform float maskType; // 0.0 = Aperture Grille, 1.0 = Slot Mask

  varying vec2 vUv;

  const float CRT_PI = 3.14159265359;
  const vec3 LUMA = vec3(0.299, 0.587, 0.114);

  // Optical crosstalk / emissive floor between adjacent phosphors on glass
  // Real phosphors radiate light in all directions, creating an emissive floor rather than black gaps
  const float CROSSTALK = 0.28;
  const vec3 PHOSPHOR_R = vec3(1.0, CROSSTALK, CROSSTALK);
  const vec3 PHOSPHOR_G = vec3(CROSSTALK, 1.0, CROSSTALK);
  const vec3 PHOSPHOR_B = vec3(CROSSTALK, CROSSTALK, 1.0);

  void main() {
    vec2 uv = vUv;
    vec3 color;

    // 1. RGB Shift / Beam Convergence
    if (rgbShift > 0.005) {
      float shift = rgbShift * 0.0025;
      color.r = texture2D(tDiffuse, vec2(uv.x + shift, uv.y)).r;
      color.g = texture2D(tDiffuse, uv).g;
      color.b = texture2D(tDiffuse, vec2(uv.x - shift, uv.y)).b;
    } else {
      color = texture2D(tDiffuse, uv).rgb;
    }

    // 2. Emissive Phosphor Bloom & Color Leak
    // Phosphors are emissive and radiate light across neighboring phosphors and scanlines
    if (bloomStrength > 0.01) {
      vec2 bOffset1 = texelSize * 1.5;
      vec3 bloomOrth = (
        texture2D(tDiffuse, uv + vec2(-bOffset1.x, 0.0)).rgb +
        texture2D(tDiffuse, uv + vec2( bOffset1.x, 0.0)).rgb +
        texture2D(tDiffuse, uv + vec2(0.0, -bOffset1.y)).rgb +
        texture2D(tDiffuse, uv + vec2(0.0,  bOffset1.y)).rgb
      ) * 0.25;

      vec2 bOffset2 = texelSize * 1.05;
      vec3 bloomDiag = (
        texture2D(tDiffuse, uv + vec2(-bOffset2.x, -bOffset2.y)).rgb +
        texture2D(tDiffuse, uv + vec2( bOffset2.x, -bOffset2.y)).rgb +
        texture2D(tDiffuse, uv + vec2(-bOffset2.x,  bOffset2.y)).rgb +
        texture2D(tDiffuse, uv + vec2( bOffset2.x,  bOffset2.y)).rgb
      ) * 0.25;

      vec3 bloomColor = mix(bloomOrth, bloomDiag, 0.5);
      float bloomLuma = dot(bloomColor, LUMA);

      // Emissive bleed: softens harsh edges and adds luminous highlight glow
      vec3 emissive = bloomColor * (bloomStrength * (0.65 + smoothstep(0.35, 1.0, bloomLuma) * 0.75));
      color += emissive;
    }

    // 3. Color grading (contrast, saturation, base brightness)
    color = (color - 0.5) * contrast + 0.5;
    float luma = dot(color, LUMA);
    color = mix(vec3(luma), color, saturation);
    color = max(color * brightness, vec3(0.0));

    // Perceptual luminance for dynamic beam interactions
    float beamLuma = clamp(dot(color, LUMA), 0.0, 1.0);

    // 4. Dynamic Beam Dynamics (Scanlines with Bloom)
    // High-current highlights physically widen the electron beam, washing out scanline gaps
    float lightingMask = 1.0;
    if (scanlineIntensity > 0.001) {
      float scanlineY = gl_FragCoord.y / cellHeight;
      // Smooth cosine beam profile: bright across scanline, narrow dip at boundary
      float scanlinePattern = 0.5 - 0.5 * cos(scanlineY * 2.0 * CRT_PI);
      scanlinePattern = pow(scanlinePattern, 1.5);

      // Highlights bloom out the scanlines up to 85%
      float bloomFactor = 1.0 - pow(beamLuma, 0.8) * 0.85;
      lightingMask *= 1.0 - scanlinePattern * (scanlineIntensity * bloomFactor);
    }

    // 5. Phosphor Mask (Aperture Grille vs Slot Mask)
    float maskPixelX = gl_FragCoord.x;
    if (maskType > 0.5) {
      // Slot Mask: stagger alternating scanline rows by half a triad (1.5 subpixels)
      float maskRow = floor((gl_FragCoord.y + cellHeight * 0.25) / cellHeight);
      if (mod(maskRow, 2.0) == 0.0) {
        maskPixelX += subpixelWidth * 1.5;
      }
    }
    // maskType == 0: Aperture Grille / Trinitron continuous vertical phosphor stripes

    // Triad subpixel selection: 0 = Red, 1 = Green, 2 = Blue
    float triadX = maskPixelX / subpixelWidth;
    int subpixel = int(mod(floor(triadX), 3.0));

    // Smooth rounded intra-subpixel profile avoids harsh digital steps
    float subpixelFract = fract(triadX);
    float intraProfile = 0.92 + 0.08 * sin(subpixelFract * CRT_PI);

    vec3 phosphorMask = PHOSPHOR_B;
    if (subpixel == 0) {
      phosphorMask = PHOSPHOR_R;
    } else if (subpixel == 1) {
      phosphorMask = PHOSPHOR_G;
    }

    // Radiometric compensation for triad absorption
    vec3 activePhosphor = phosphorMask * (intraProfile * 1.85);

    // Subtle faceplate halation / glass glow on extreme highlights
    vec3 halation = vec3(smoothstep(0.7, 1.0, beamLuma) * 0.12);

    // Apply true phosphor primary excitation with emissive bleed
    color = color * activePhosphor + halation;

    // 6. CRT Faceplate Vignette (subtle peripheral falloff)
    vec2 vignetteCoord = (uv - 0.5) * 2.0;
    float vignette = clamp(1.0 - dot(vignetteCoord, vignetteCoord) * 0.06, 0.0, 1.0);
    lightingMask *= vignette;

    // 7. 60Hz/110Hz Subtle Beam Flicker
    if (flickerStrength > 0.001) {
      lightingMask *= 1.0 + sin(time * 110.0) * flickerStrength;
    }

    color *= lightingMask;

    // 8. Gamma Correction to sRGB Display
    gl_FragColor = vec4(pow(clamp(color, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
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
    matDither: ShaderMaterial;
    matCRT: ShaderMaterial;
    crtScene: Scene;
    crtCamera: OrthographicCamera;
    quad: Mesh;
  } | null>(null);

  if (crtRef.current == null) {
    const w0 = Math.round(TARGET_HEIGHT * (16 / 9));

    const matDither = new ShaderMaterial({
      vertexShader: ditherVert,
      fragmentShader: fragDither,
      uniforms: {
        tDiffuse: { value: null },
        texelSize: { value: [1 / w0, 1 / TARGET_HEIGHT] },
        resolution: { value: [w0, TARGET_HEIGHT] },
        ditherEnabled: { value: gameConfig.ditherEnabled ? 1.0 : 0.0 },
        toLinear: { value: gameConfig.crtEnabled ? 1.0 : 0.0 },
      },
      depthTest: false,
      depthWrite: false,
    });

    const matCRT = new ShaderMaterial({
      vertexShader: ditherVert,
      fragmentShader: fragCRT,
      uniforms: {
        maskType: { value: gameConfig.crtMaskStyle === "slot" ? 1.0 : 0.0 },
        tDiffuse: { value: null },
        texelSize: { value: [1 / w0, 1 / TARGET_HEIGHT] },
        resolution: { value: [w0, TARGET_HEIGHT] },
        cellHeight: { value: 6.0 },
        subpixelWidth: { value: 2.0 },
        scanlineIntensity: { value: gameConfig.crtScanlines },
        scanlineCount: { value: scanlines * 1.0 },
        time: { value: 0.0 },
        brightness: { value: 1.3 },
        contrast: { value: 1.0 },
        saturation: { value: 1.1 },
        rgbShift: { value: gameConfig.crtRgbShift * 0.4 },
        flickerStrength: { value: gameConfig.crtFlicker ? 0.015 : 0.0 },
        bloomStrength: { value: gameConfig.crtBloom },
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

    matDither.uniforms.tDiffuse.value = gameTarget.texture;
    matCRT.uniforms.tDiffuse.value = postTarget.texture;

    const crtScene = new Scene();
    crtScene.matrixAutoUpdate = false;

    const quad = new Mesh(new PlaneGeometry(2, 2), matDither);
    quad.frustumCulled = false;
    quad.matrixAutoUpdate = false;
    crtScene.add(quad);

    crtRef.current = {
      gameTarget,
      postTarget,
      matDither,
      matCRT,
      crtScene,
      crtCamera: new OrthographicCamera(-1, 1, 1, -1, 0, 1),
      quad,
    };
  }

  useEffect(() => {
    const unsub = subscribeToConfig(() => {
      if (crtRef.current) {
        const { matDither, matCRT } = crtRef.current;
        matDither.uniforms.ditherEnabled.value = gameConfig.ditherEnabled
          ? 1.0
          : 0.0;
        matDither.uniforms.toLinear.value = gameConfig.crtEnabled ? 1.0 : 0.0;
        matDither.uniformsNeedUpdate = true;
        matCRT.uniforms.maskType.value =
          gameConfig.crtMaskStyle === "slot" ? 1.0 : 0.0;
        matCRT.uniforms.scanlineIntensity.value = gameConfig.crtScanlines;
        matCRT.uniforms.bloomStrength.value = gameConfig.crtBloom;
        matCRT.uniforms.rgbShift.value = gameConfig.crtRgbShift * 0.4;
        matCRT.uniforms.flickerStrength.value = gameConfig.crtFlicker
          ? 0.015
          : 0.0;
        matCRT.uniformsNeedUpdate = true;
      }
    });

    return () => {
      unsub();
      const { gameTarget, postTarget, matDither, matCRT, quad } =
        crtRef.current!;
      gameTarget.dispose();
      postTarget.dispose();
      quad.geometry.dispose();
      matDither.dispose();
      matCRT.dispose();
    };
  }, []);

  useFrame((_, delta) => {
    timeRef.current += delta;

    const { matDither, matCRT, crtScene, crtCamera, quad } = crtRef.current!;
    if (matCRT.uniforms.scanlineCount.value !== scanlines) {
      matCRT.uniforms.scanlineCount.value = scanlines * 1.0;
      matCRT.uniformsNeedUpdate = true;
    }

    const rawPeriod = scanlines > 0 ? gl.domElement.height / scanlines : 6.0;
    const subpixelW = Math.max(1, Math.round(rawPeriod / 3));
    const cellH = subpixelW * 3;

    const targetMaskType = gameConfig.crtMaskStyle === "slot" ? 1.0 : 0.0;
    if (matCRT.uniforms.maskType.value !== targetMaskType) {
      matCRT.uniforms.maskType.value = targetMaskType;
      matCRT.uniformsNeedUpdate = true;
    }

    if (matCRT.uniforms.scanlineIntensity.value !== gameConfig.crtScanlines) {
      matCRT.uniforms.scanlineIntensity.value = gameConfig.crtScanlines;
      matCRT.uniformsNeedUpdate = true;
    }

    if (matCRT.uniforms.bloomStrength.value !== gameConfig.crtBloom) {
      matCRT.uniforms.bloomStrength.value = gameConfig.crtBloom;
      matCRT.uniformsNeedUpdate = true;
    }

    const targetRgbShift = gameConfig.crtRgbShift * 0.4;
    if (matCRT.uniforms.rgbShift.value !== targetRgbShift) {
      matCRT.uniforms.rgbShift.value = targetRgbShift;
      matCRT.uniformsNeedUpdate = true;
    }

    const targetFlicker = gameConfig.crtFlicker ? 0.015 : 0.0;
    if (matCRT.uniforms.flickerStrength.value !== targetFlicker) {
      matCRT.uniforms.flickerStrength.value = targetFlicker;
      matCRT.uniformsNeedUpdate = true;
    }

    if (matCRT.uniforms.cellHeight.value !== cellH) {
      matCRT.uniforms.cellHeight.value = cellH;
      matCRT.uniforms.subpixelWidth.value = subpixelW;
      matCRT.uniformsNeedUpdate = true;
    }

    const targetDither = gameConfig.ditherEnabled ? 1.0 : 0.0;
    if (matDither.uniforms.ditherEnabled.value !== targetDither) {
      matDither.uniforms.ditherEnabled.value = targetDither;
      matDither.uniformsNeedUpdate = true;
    }

    const targetToLinear = gameConfig.crtEnabled ? 1.0 : 0.0;
    if (matDither.uniforms.toLinear.value !== targetToLinear) {
      matDither.uniforms.toLinear.value = targetToLinear;
      matDither.uniformsNeedUpdate = true;
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

      matDither.uniforms.texelSize.value = [1 / w, 1 / TARGET_HEIGHT];
      matDither.uniforms.resolution.value = [w, TARGET_HEIGHT];
      matDither.uniforms.tDiffuse.value = newGameTarget.texture;

      matCRT.uniforms.texelSize.value = [1 / w, 1 / TARGET_HEIGHT];
      matCRT.uniforms.resolution.value = [w, TARGET_HEIGHT];
      matCRT.uniforms.tDiffuse.value = newPostTarget.texture;
    }

    const { gameTarget, postTarget } = crtRef.current!;

    // PASS 1 — render game scene at 640p
    gl.setRenderTarget(gameTarget);
    gl.render(scene, camera);

    if (gameConfig.crtEnabled) {
      // PASS 2 — Dither/AA at 640p into postTarget (linear light output)
      quad.material = matDither;
      gl.setRenderTarget(postTarget);
      gl.render(crtScene, crtCamera);

      // PASS 3 — CRT Effects at Native Resolution into canvas (sRGB output)
      quad.material = matCRT;
      matCRT.uniforms.time.value = timeRef.current;

      gl.setRenderTarget(null);
      gl.render(crtScene, crtCamera);
    } else {
      // CRT disabled, but Dither is enabled
      // PASS 2 — Dither directly to canvas at 640p (sRGB output)
      quad.material = matDither;
      gl.setRenderTarget(null);
      gl.render(crtScene, crtCamera);
    }
  }, 1);

  return null;
}

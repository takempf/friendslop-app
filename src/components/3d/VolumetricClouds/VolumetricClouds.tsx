import { useEffect, useState, type JSX } from "react";
import { useFrame } from "@react-three/fiber";
import {
  DataTexture,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  Mesh,
  NoColorSpace,
  NormalBlending,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type Camera,
  type WebGLRenderer,
} from "three";
import { SUN_POSITION } from "@/constants/sunPosition";

const SUN_DIRECTION = new Vector3(...SUN_POSITION).normalize();

// Cloud space is anchored to the camera (ray origin is always the origin), so
// the layer never gets closer as the player walks around — it behaves like a
// skybox. One unit is roughly "a cloud diameter"; nothing here is in meters.
const NOISE_SIZE = 256;

/** iq's trick: a white-noise lattice that hardware bilinear filtering turns into
 *  3D value noise. Green holds N(uv), red holds N(uv + (37, 239)) so a single
 *  fetch gives both z-planes. */
function createNoiseTexture(): DataTexture {
  const lattice = new Uint8Array(NOISE_SIZE * NOISE_SIZE);
  let seed = 0x9e3779b9;
  for (let i = 0; i < lattice.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    lattice[i] = seed >>> 24;
  }

  const data = new Uint8Array(NOISE_SIZE * NOISE_SIZE * 4);
  for (let y = 0; y < NOISE_SIZE; y++) {
    for (let x = 0; x < NOISE_SIZE; x++) {
      const i = y * NOISE_SIZE + x;
      const ox = (x + 37) & (NOISE_SIZE - 1);
      const oy = (y + 239) & (NOISE_SIZE - 1);
      data[i * 4 + 0] = lattice[oy * NOISE_SIZE + ox];
      data[i * 4 + 1] = lattice[i];
      data[i * 4 + 3] = 255;
    }
  }

  const texture = new DataTexture(
    data,
    NOISE_SIZE,
    NOISE_SIZE,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

const fullscreenVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`;

// PASS 1 — volumetric raymarch into a low-res offscreen target.
const marchFrag = /* glsl */ `
  precision highp float;

  uniform sampler2D uNoise;
  uniform mat4 uInvProjection;
  uniform mat4 uCameraWorld;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform vec3 uAmbientColor;
  uniform float uTime;
  uniform float uCoverage;
  uniform float uHighCoverage;
  uniform float uDensity;
  uniform vec2 uWind;

  varying vec2 vUv;

  // MAX_STEPS, LIGHT_STEPS and FBM_OCTAVES arrive as #defines from the
  // material so the graphics settings can trade quality for speed.
  #define PI 3.141592653589793

  // ── Scale ──────────────────────────────────────────────────────────────
  // One world unit is about 265 m, fixed by putting the cumulus base at the
  // 900 m mark typical of a fair-weather afternoon. Every altitude and speed
  // below is a real figure divided through by that.
  //
  //   cumulus base      790 – 1010 m  →  3.0 – 3.8 units
  //   cumulus tops      1190 – 2230 m  →  4.5 – 8.4 units
  //   cloud width        1.7 – 3.9 km  →  6.6 – 14.7 units
  //   cloud spacing            3.0 km  →  11.5 units
  //   altocumulus              2400 m  →  9.0 units
  //
  const float CUMULUS_BASE = 3.4;        // 900 m — the condensation level
  const float BASE_SPREAD = 0.4;         // ±105 m — bases stay nearly level
  const float CUMULUS_MIN_HEIGHT = 1.1;  // 290 m
  const float CUMULUS_MAX_HEIGHT = 3.6;  // 950 m
  // Turrets ride up out of the body, so a cloud reaches higher than its own
  // nominal height. The march has to bracket that or it clips their tops off.
  const float CUMULUS_TOP = CUMULUS_MAX_HEIGHT * 1.45;
  const float ALTO_Y = 9.0;              // 2400 m — the altocumulus deck

  // One cloud per cell, and the cells are large: big clouds, far apart. Each
  // cloud is a cluster of lobes rather than a single ellipsoid — a broad body
  // with smaller turrets riding up and out of it — which is where a cloud this
  // size gets a silhouette worth looking at.
  const float CELL_SIZE = 11.5;         // 3.0 km between cloud centres
  const int CLOUD_LOBES = 3;
  const float LOBE_SPREAD = 3.7;        // how far turrets sit off the body
  const float MAX_DISTANCE = 110.0;     // beyond this the deck fades to sky
  const float PUFF_RADIUS = 4.1;
  const float JITTER = 0.18;            // cloud offset within its cell
  const float NOISE_SCALE = 1.8;
  const float NOISE_AMPLITUDE = 0.85;
  const float MAX_GROWTH = 0.25;        // cap on outward noise, keeps puffs in cell
  const float ABSORPTION = 5.0;
  const float LIGHT_ABSORPTION = 0.85;
  const float LIGHT_REACH = 5.0;        // ~one cloud radius into the body
  const float ANISOTROPY = 0.35;

  // Fair-weather cumulus line up into "streets" along the wind. Squashing the
  // weather field on one axis is what turns scattered blobs into those rows.
  const float WEATHER_SCALE = 0.018;
  const vec2 STREET_AXIS = vec2(0.947, 0.322);
  const float STREET_STRETCH = 0.42;

  // ── Motion ─────────────────────────────────────────────────────────────
  // A single rigid translation reads as a sliding texture, so the drift is
  // split into parts that run at their own rates and never quite line up.
  const float SYSTEM_DRIFT = 0.78;      // systems lag the puffs inside them
  const float DETAIL_DRIFT = 0.42;      // fine detail lags again
  const float EVOLVE_RATE = 0.035;      // billows churning in place
  const float LIFECYCLE_RATE = 0.012;   // ~9 min to swell and fade
  const float SHEAR = 0.3;              // towers lean into the stronger wind up top
  const float ALTO_GAIN = 2.1;          // 12 m/s at 2400 m against 6 m/s below
  const float ALTO_VEER = 0.45;         // and backed ~26°, as wind does with height
  const float ALTO_SCALE = 0.11;       // ~9 unit (2.4 km) cloudlets
  const float ALTO_EPS = 1.1;           // gradient step, in deck-plane units
  const float ALTO_RELIEF = 9.0;
  // ── Ground ─────────────────────────────────────────────────────────────
  // In scene metres, not the 265 m cloud unit: this plane is pinned to world
  // y = 0 where the floor sits, so it has to share the scene's coordinates.
  const float GROUND_Y = 0.0;
  const float GROUND_HAZE_NEAR = 60.0;   // metres — haze starts eating it
  const float GROUND_HAZE_FAR = 3000.0;  // fully dissolved into the horizon
  const float GROUND_SCALE = 0.02;       // ~50 m patches
  const vec3 GROUND_DARK = vec3(0.17, 0.22, 0.11);
  const vec3 GROUND_LIGHT = vec3(0.28, 0.33, 0.16);

  const float ALTO_FADE_START = 55.0;
  const float ALTO_FADE_END = 230.0;

  float noise(vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);

    vec2 uv = (p.xy + vec2(37.0, 239.0) * p.z) + f.xy;
    vec2 tex = texture2D(uNoise, (uv + 0.5) / 256.0).yx;

    return mix(tex.x, tex.y, f.z) * 2.0 - 1.0;
  }

  float fbmDetail(vec3 p) {
    float f = 0.0;
    float scale = 0.5;
    float factor = 2.02;
    float total = 0.0;
    for (int i = 0; i < FBM_OCTAVES; i++) {
      f += scale * noise(p);
      total += scale;
      p *= factor;
      factor += 0.21;
      scale *= 0.5;
    }
    // Normalised, so dropping octaves for performance thins the detail without
    // also thinning the clouds themselves.
    return f / total;
  }

  float fbmCoarse(vec3 p) {
    return 0.5 * noise(p) + 0.25 * noise(p * 2.02);
  }

  // Dave Hoskins' hash — four randoms per cloud cell.
  vec4 hash42(vec2 p) {
    vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
    p4 += dot(p4, p4.wzxy + 33.33);
    return fract((p4.xxyz + p4.yzzw) * p4.zywx);
  }

  float sdEllipsoid(vec3 p, vec3 r) {
    return (length(p / r) - 1.0) * min(min(r.x, r.y), r.z);
  }

  // Polynomial smooth max — merges neighbouring puffs into one mass instead of
  // leaving a visible crease where they overlap.
  float smoothMax(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (a - b) / k, 0.0, 1.0);
    return mix(b, a, h) + k * h * (1.0 - h);
  }

  // Low-frequency field standing in for a weather map: where a cloud system
  // sits, and how vertically developed it is. Stretched along STREET_AXIS so
  // systems form rows rather than an even scatter.
  // Returns (coverage, base offset). Cumulus bases are famously level — they
  // all sit on the same condensation level — so the offset is a very low
  // frequency, moving a whole air mass up or down rather than each cloud.
  vec2 weather(vec2 xz) {
    vec2 w = vec2(dot(xz, STREET_AXIS), dot(xz, vec2(-STREET_AXIS.y, STREET_AXIS.x)));
    w.x *= STREET_STRETCH;
    w *= WEATHER_SCALE;

    float n = noise(vec3(w, 0.0)) * 0.5 + 0.5;
    n += (noise(vec3(w * 2.7, 5.0))) * 0.22;

    // A gentle ramp, not a bimodal one. This field grades how *big* the clouds
    // in a patch of sky are, and size wants to vary smoothly; switching it
    // hard instead gates whether clouds exist at all, which is what opens
    // bare holes with dense bands of leftovers on either side.
    float cover = smoothstep(0.28, 0.78, n);

    float base = noise(vec3(w * 0.55, 21.0));
    return vec2(cover, base);
  }

  // Density, not distance: positive inside the cloud. Same shape as the
  // classic "-sdf + fbm", with the sphere swapped for a grid of jittered
  // ellipsoids so the whole sky is covered.
  float cloudDensity(vec3 p, bool coarse) {
    // Systems drift slower than the puffs inside them, so clouds are forever
    // forming on a system's upwind edge and dissolving off the back of it
    // instead of the whole sky sliding along as one piece.
    vec2 wx = weather(p.xz + uWind * uTime * SYSTEM_DRIFT);
    float cover = wx.x;
    float baseY = CUMULUS_BASE + wx.y * BASE_SPREAD;

    vec3 q = p;
    q.xz += uWind * uTime;
    // Wind picks up with altitude, so a tower leans downwind of its own base.
    q.xz -= normalize(uWind) * SHEAR * max(q.y - baseY, 0.0);

    // Union of the four nearest cells, so a puff can overhang its own cell
    // without being sliced off at the boundary.
    vec2 base = floor(q.xz / CELL_SIZE - 0.5);
    float shape = -2.0;

    for (int i = 0; i < 4; i++) {
      vec2 cell = base + vec2(float(i - 2 * (i / 2)), float(i / 2));
      vec4 h = hash42(cell);

      // Presence stays fairly even across the whole sky. It is deliberately
      // only weakly tied to the weather: gate presence hard on it and you get
      // bare holes fringed by whatever survived, rather than a field of cloud.
      float grow = smoothstep(
        0.0,
        0.35,
        h.z - (1.0 - uCoverage * (0.55 + 0.8 * cover))
      );
      if (grow <= 0.0) continue;

      // Every puff runs its own lifecycle off a per-cell phase, so clouds
      // swell and dissipate independently rather than the field pulsing.
      float life =
        0.5 + 0.5 * sin(uTime * LIFECYCLE_RATE + (h.x + h.y) * PI * 2.0);
      grow *= mix(0.62, 1.0, life);

      // Size is what the weather actually controls. Where it runs high the
      // clouds grow wide enough to swallow their neighbours and merge into one
      // broad mass; where it runs low they stay small and separate. That is
      // the difference between the reference sky and a field of popcorn — not
      // whether a cell has a cloud, but how big that cloud is.
      float size = mix(0.6, 1.0, cover) * mix(0.7, 1.15, h.w);
      float height =
        mix(CUMULUS_MIN_HEIGHT, CUMULUS_MAX_HEIGHT, cover * mix(0.5, 1.0, h.w)) *
        grow;
      float rxz = PUFF_RADIUS * size * grow;

      vec2 centre = (cell + 0.5) * CELL_SIZE + (h.xy - 0.5) * CELL_SIZE * JITTER;

      // Lobe 0 is the body, sitting on the condensation level. The rest are
      // turrets: smaller, thrown outward on a per-cloud rotation, and lifted so
      // they billow up out of the body rather than sitting beside it. They stay
      // well inside the body's own width, so the union merges them into one
      // mass instead of leaving separate blobs.
      for (int j = 0; j < CLOUD_LOBES; j++) {
        float fj = float(j);
        float turret = step(0.5, fj);
        float t = fract(h.y + fj * 0.37);

        float angle = (h.x + fj * 0.333) * PI * 2.0;
        vec2 offset =
          vec2(cos(angle), sin(angle)) * LOBE_SPREAD * turret * mix(0.5, 1.0, t);

        float lobeR = rxz * mix(1.0, mix(0.5, 0.78, t), turret);
        float lobeH = height * mix(1.0, 0.75, turret);
        float lift = height * turret * mix(0.18, 0.5, t);

        vec3 radii = max(vec3(lobeR, lobeH * 0.58, lobeR), vec3(1e-3));

        // Centred below its own mid-height so the base plane below slices a
        // real flat bottom off the body, the way a condensation level does.
        vec3 rel = vec3(
          q.x - centre.x - offset.x,
          q.y - baseY - lift - lobeH * 0.42,
          q.z - centre.y - offset.y
        );

        // Narrow the lobe toward its top: a cumulus profile, not a lozenge.
        float hf = clamp((q.y - baseY - lift) / max(lobeH, 1e-3), 0.0, 1.0);
        rel.xz /= 1.0 - 0.3 * hf * hf;

        float radius = min(min(radii.x, radii.y), radii.z);
        shape = smoothMax(shape, -sdEllipsoid(rel, radii) / radius, 0.35);
      }
    }

    // Far enough outside every puff that no amount of noise can pull it back.
    if (shape < -NOISE_AMPLITUDE) return -1.0;

    // Flat bottoms: below the condensation level there is no cloud, however
    // much noise says otherwise.
    shape = min(shape, (q.y - baseY) * 5.0);

    // Detail lags the puffs and churns in place on top of that, so billows
    // boil rather than slide across a cloud that is itself moving.
    vec3 np = q * NOISE_SCALE;
    np.xz -= uWind * uTime * NOISE_SCALE * DETAIL_DRIFT;
    np.y -= uTime * EVOLVE_RATE;
    float erosion = coarse ? fbmCoarse(np) : fbmDetail(np);

    // Billowing tops, smooth bases — and a cap on outward growth so an eroded
    // puff can never reach past the neighbouring cells we actually sampled.
    float heightFraction =
      clamp((q.y - baseY) / CUMULUS_TOP, 0.0, 1.0);
    erosion *= NOISE_AMPLITUDE * mix(0.55, 1.3, heightFraction);

    return (shape + min(erosion, MAX_GROWTH)) * uDensity;
  }

  float beersLaw(float depth, float absorption) {
    return exp(-depth * absorption);
  }

  float henyeyGreenstein(float g, float mu) {
    float gg = g * g;
    return (1.0 / (4.0 * PI)) * ((1.0 - gg) / pow(1.0 + gg - 2.0 * g * mu, 1.5));
  }

  // Secondary march toward the sun for self-shadowing.
  //
  // The reach is fixed rather than being step count times step size, for two
  // reasons. It has to cross a good fraction of a cloud or the interior comes
  // back uniformly lit and the whole thing reads as one flat blob — only the
  // rim ever picks up shading. And pinning the distance means the Shadow Steps
  // quality setting changes how well this is sampled without changing how the
  // sky looks; the old form made every notch on that slider a different sky.
  //
  // Steps grow as they go, so the near field where the gradient actually lives
  // is sampled finely and the far field cheaply.
  float lightMarch(vec3 position) {
    float count = float(LIGHT_STEPS);
    float unit = LIGHT_REACH / (count * (count + 1.0) * 0.5);

    float depth = 0.0;
    for (int i = 0; i < LIGHT_STEPS; i++) {
      float len = unit * (float(i) + 1.0);
      position += uSunDirection * len;
      depth += max(cloudDensity(position, true), 0.0) * len;
    }
    return beersLaw(depth, LIGHT_ABSORPTION);
  }

  // A second deck 2400 m up. Seen from below an altocumulus sheet has no
  // readable volume, so it is one ray/plane hit rather than a second march —
  // and it costs a handful of texture fetches for the whole screen instead of
  // per step. Its job is depth: something for the cumulus to sit in front of.
  float altoField(vec2 p, float evolve) {
    vec3 np = vec3(p * ALTO_SCALE, evolve);
    return 0.5 +
      0.5 * (noise(np) * 0.57 + noise(np * 2.3) * 0.29 + noise(np * 5.1) * 0.14);
  }

  vec4 highClouds(vec3 rd) {
    if (rd.y < 0.012) return vec4(0.0);

    float t = ALTO_Y / rd.y;

    // Wind aloft is stronger and backed relative to the surface, which is what
    // sells the parallax: the two decks slide past each other.
    float c = cos(ALTO_VEER);
    float sn = sin(ALTO_VEER);
    vec2 aloft = vec2(uWind.x * c - uWind.y * sn, uWind.x * sn + uWind.y * c);
    vec2 pos = rd.xz * t + aloft * uTime * ALTO_GAIN;

    // Kept isotropic on purpose: stretching this field into rows the way the
    // cumulus streets are stretched projects into radial smears running to the
    // horizon, because near the horizon the plane is viewed nearly edge on.
    float evolve = uTime * EVOLVE_RATE * 0.08;
    float n = altoField(pos, evolve);

    // A tight threshold breaks the sheet into discrete cloudlets; a loose one
    // smears it into haze.
    float amount = smoothstep(0.63, 0.7, n) * uHighCoverage;
    amount *= 1.0 - smoothstep(ALTO_FADE_START, ALTO_FADE_END, t);
    // Grazing rays cross more of a thin sheet than overhead ones do, but only
    // a little — lean on this too hard and the deck walls up at the horizon.
    amount *= mix(0.85, 0.6, clamp(rd.y * 1.6, 0.0, 1.0));
    if (amount <= 0.002) return vec4(0.0);

    // Relief from the field's own slope. Without this the deck is one flat
    // tone and reads as a stain on the sky rather than as cloud.
    float nx = altoField(pos + vec2(ALTO_EPS, 0.0), evolve);
    float ny = altoField(pos + vec2(0.0, ALTO_EPS), evolve);
    vec3 normal = normalize(
      vec3((n - nx) * ALTO_RELIEF, 1.0, (n - ny) * ALTO_RELIEF)
    );
    float lit = clamp(dot(normal, uSunDirection) * 0.5 + 0.5, 0.0, 1.0);

    // Grey rather than white. Seen from below, a thin deck is lit from the far
    // side and lands somewhere between the sky and the cumulus in tone — it
    // has to read through opacity, not brightness, or it is just a pale smear.
    vec3 colour = uSunColor * (0.1 + 0.42 * lit * lit) + uAmbientColor * 0.95;
    return vec4(colour * amount, amount);
  }

  // The ground is an analytic ray/plane hit rather than geometry, so it is
  // infinite for free: no far-plane limit to outrun, nothing to tessellate,
  // and no z-fighting with the scene. Real geometry still occludes it, because
  // the quad this all lands on is depth tested at the far plane.
  vec4 groundPlane(vec3 rd, vec3 eye) {
    if (rd.y > -0.0005) return vec4(0.0);

    float height = max(eye.y - GROUND_Y, 0.05);
    float t = height / -rd.y;

    vec2 p = eye.xz + rd.xz * t;
    float n = noise(vec3(p * GROUND_SCALE, 0.0)) * 0.5 + 0.5;
    n = mix(n, noise(vec3(p * GROUND_SCALE * 3.7, 7.0)) * 0.5 + 0.5, 0.4);

    vec3 colour = mix(GROUND_DARK, GROUND_LIGHT, n);
    colour *= uSunColor * 0.35 + uAmbientColor;

    // Dissolve into the horizon haze instead of ending on a hard line. From
    // eye height this whole gradient lives inside about a degree of view —
    // flat ground really does compress that hard — so it wants to be gentle.
    float fade = 1.0 - smoothstep(GROUND_HAZE_NEAR, GROUND_HAZE_FAR, t);
    return vec4(colour * fade, fade);
  }

  // Interleaved gradient noise — spatial-only, so it stays stable when the
  // camera holds still (there is no TAA here to clean up temporal jitter).
  float dither(vec2 fragCoord) {
    return fract(52.9829189 * fract(dot(fragCoord, vec2(0.06711056, 0.00583715))));
  }

  void main() {
    vec2 ndc = vUv * 2.0 - 1.0;
    vec4 viewPos = uInvProjection * vec4(ndc, -1.0, 1.0);
    vec3 rd = normalize((uCameraWorld * vec4(viewPos.xyz / viewPos.w, 0.0)).xyz);

    // Backdrop the cumulus march then composites itself over. Ground and high
    // deck are on opposite sides of the horizon, so it is one or the other.
    vec3 eye = uCameraWorld[3].xyz;
    vec4 high = rd.y < 0.0 ? groundPlane(rd, eye) : highClouds(rd);
    gl_FragColor = high;
    if (rd.y < 0.02) return;

    // Wide enough to contain every air mass's base and the tallest tops.
    float entry = (CUMULUS_BASE - BASE_SPREAD) / rd.y;
    float exit = min(
      (CUMULUS_BASE + BASE_SPREAD + CUMULUS_TOP) / rd.y,
      MAX_DISTANCE
    );
    if (entry >= exit) return;

    float stepSize = (exit - entry) / float(MAX_STEPS);
    float t = entry + stepSize * dither(gl_FragCoord.xy);

    float phase = henyeyGreenstein(ANISOTROPY, dot(rd, uSunDirection)) * 4.0 * PI;

    float transmittance = 1.0;
    vec3 lightEnergy = vec3(0.0);

    for (int i = 0; i < MAX_STEPS; i++) {
      vec3 p = t * rd;
      float fade = 1.0 - smoothstep(MAX_DISTANCE * 0.3, MAX_DISTANCE, t);
      float density = max(cloudDensity(p, false), 0.0) * fade;

      if (density > 0.0) {
        float shadow = lightMarch(p);
        float powder = 1.0 - beersLaw(density, 2.0);
        vec3 scatter =
          uSunColor * shadow * phase * mix(1.0, powder, 0.5) + uAmbientColor;

        float stepTransmittance = beersLaw(density * stepSize, ABSORPTION);
        lightEnergy += transmittance * scatter * (1.0 - stepTransmittance);
        transmittance *= stepTransmittance;

        if (transmittance < 0.01) break;
      }

      t += stepSize;
    }

    // Premultiplied — the composite pass blends it straight over the sky.
    gl_FragColor = vec4(
      lightEnergy + transmittance * high.rgb,
      (1.0 - transmittance) + transmittance * high.a
    );
  }
`;

// PASS 2 — upscale and blend over the sky, at the far plane so scene geometry
// still occludes it.
const compositeFrag = /* glsl */ `
  precision highp float;

  uniform sampler2D tClouds;
  uniform vec2 uTexelSize;
  varying vec2 vUv;

  void main() {
    // 5-tap cross reconstruction filter to smooth raymarch step jitter (interleaved gradient noise)
    vec4 c = texture2D(tClouds, vUv);
    vec4 u = texture2D(tClouds, vUv + vec2(0.0, uTexelSize.y));
    vec4 d = texture2D(tClouds, vUv - vec2(0.0, uTexelSize.y));
    vec4 l = texture2D(tClouds, vUv - vec2(uTexelSize.x, 0.0));
    vec4 r = texture2D(tClouds, vUv + vec2(uTexelSize.x, 0.0));

    vec4 clouds = c * 0.4 + (u + d + l + r) * 0.15;
    if (clouds.a < 0.002) discard;

    // Un-premultiply linear color so standard tone mapping and sRGB colorspace conversion work correctly
    vec3 straightRGB = clouds.rgb / max(clouds.a, 0.0001);
    gl_FragColor = vec4(straightRGB, clouds.a);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

type CloudResources = {
  target: WebGLRenderTarget;
  noise: DataTexture;
  marchScene: Scene;
  marchCamera: OrthographicCamera;
  marchMaterial: ShaderMaterial;
  marchQuad: Mesh;
  compositeMaterial: ShaderMaterial;
  compositeMesh: Mesh;
  bufferSize: Vector2;
};

function createResources(): CloudResources {
  const noise = createNoiseTexture();

  const marchMaterial = new ShaderMaterial({
    vertexShader: fullscreenVert,
    fragmentShader: marchFrag,
    uniforms: {
      uNoise: { value: noise },
      uInvProjection: { value: new Matrix4() },
      uCameraWorld: { value: new Matrix4() },
      uSunDirection: { value: SUN_DIRECTION },
      uSunColor: { value: new Vector3(1.0, 0.95, 0.87).multiplyScalar(1.7) },
      uAmbientColor: {
        value: new Vector3(0.44, 0.56, 0.8).multiplyScalar(0.4),
      },
      uTime: { value: 0 },
      uCoverage: { value: 0.5 },
      uHighCoverage: { value: 0.75 },
      uDensity: { value: 1.0 },
      uWind: { value: new Vector2(0.012, 0.004) },
    },
    defines: {
      MAX_STEPS: "42",
      LIGHT_STEPS: "5",
      FBM_OCTAVES: "5",
    },
    depthTest: false,
    depthWrite: false,
  });

  const target = new WebGLRenderTarget(2, 2, {
    type: HalfFloatType,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    generateMipmaps: false,
    depthBuffer: false,
  });

  const marchScene = new Scene();
  marchScene.matrixAutoUpdate = false;
  const marchQuad = new Mesh(new PlaneGeometry(2, 2), marchMaterial);
  marchQuad.frustumCulled = false;
  marchQuad.matrixAutoUpdate = false;
  marchScene.add(marchQuad);

  const compositeMaterial = new ShaderMaterial({
    vertexShader: fullscreenVert,
    fragmentShader: compositeFrag,
    uniforms: {
      tClouds: { value: target.texture },
      uTexelSize: { value: new Vector2(1 / 2, 1 / 2) },
    },
    transparent: true,
    premultipliedAlpha: false,
    blending: NormalBlending,
    depthWrite: false,
  });

  const compositeMesh = new Mesh(new PlaneGeometry(2, 2), compositeMaterial);
  compositeMesh.frustumCulled = false;
  compositeMesh.matrixAutoUpdate = false;
  // Behind every other transparent object; depth testing keeps it behind the
  // opaque scene, and the drei <Sky> never writes depth so it stays visible.
  compositeMesh.renderOrder = -1;

  return {
    target,
    noise,
    marchScene,
    marchCamera: new OrthographicCamera(-1, 1, 1, -1, 0, 1),
    marchMaterial,
    marchQuad,
    compositeMaterial,
    compositeMesh,
    bufferSize: new Vector2(),
  };
}

export type VolumetricCloudsProps = {
  /** Fraction of the sky that grows a cloud puff. */
  coverage?: number;
  /** Multiplier on cloud opacity/thickness. */
  density?: number;
  /** How much of the high altocumulus deck shows through. */
  highCoverage?: number;
  /** Multiplier on the 5.9 m/s base wind. */
  windSpeed?: number;
  /** Raymarch resolution as a fraction of the target being rendered into. */
  resolutionScale?: number;
  /** Samples along each view ray through the cloud layer. */
  marchSteps?: number;
  /** Samples along each shadow ray toward the sun. */
  lightSteps?: number;
  /** fbm octaves used to erode the cloud silhouettes. */
  detailOctaves?: number;
};

export function VolumetricClouds({
  coverage = 0.5,
  density = 1.0,
  highCoverage = 0.75,
  windSpeed = 1.0,
  resolutionScale = 0.5,
  marchSteps = 42,
  lightSteps = 5,
  detailOctaves = 5,
}: VolumetricCloudsProps): JSX.Element {
  const [resources] = useState(createResources);

  // The GPU objects below are imperative three.js resources that outlive any
  // render; the immutability rule reads writing to them as mutating state.
  useEffect(() => {
    const { uniforms } = resources.marchMaterial;
    // eslint-disable-next-line react-hooks/immutability
    uniforms.uCoverage.value = coverage;
    uniforms.uDensity.value = density;
    uniforms.uHighCoverage.value = highCoverage;
    // 0.0221 units/s at 265 m per unit is a 5.9 m/s breeze — a cloud crosses
    // its own width in about a minute and a half, which is what a real sky
    // does. Everything else in the shader is a fraction of this.
    uniforms.uWind.value.set(0.021 * windSpeed, 0.007 * windSpeed);
  }, [resources, coverage, density, highCoverage, windSpeed]);

  // Quality knobs are #defines rather than uniforms so the loops stay
  // unrollable; changing one recompiles the program, which is fine for a
  // setting nobody touches mid-play.
  useEffect(() => {
    const material = resources.marchMaterial;
    // eslint-disable-next-line react-hooks/immutability
    material.defines = {
      MAX_STEPS: String(Math.round(marchSteps)),
      LIGHT_STEPS: String(Math.round(lightSteps)),
      FBM_OCTAVES: String(Math.round(detailOctaves)),
    };
    material.needsUpdate = true;
  }, [resources, marchSteps, lightSteps, detailOctaves]);

  useEffect(() => {
    const {
      target,
      noise,
      marchMaterial,
      marchQuad,
      compositeMaterial,
      compositeMesh,
    } = resources;
    return (): void => {
      target.dispose();
      noise.dispose();
      marchMaterial.dispose();
      marchQuad.geometry.dispose();
      compositeMaterial.dispose();
      compositeMesh.geometry.dispose();
    };
  }, [resources]);

  useFrame((_, delta) => {
    // eslint-disable-next-line react-hooks/immutability
    resources.marchMaterial.uniforms.uTime.value += delta;
  });

  // Rendered from onBeforeRender so the march always uses this frame's camera
  // matrices — a frame of lag here shows up as the sky sliding during mouse
  // look. Same pattern three's Reflector uses.
  useEffect(() => {
    const {
      target,
      marchScene,
      marchCamera,
      marchMaterial,
      compositeMaterial,
      compositeMesh,
      bufferSize,
    } = resources;

    // eslint-disable-next-line react-hooks/immutability
    compositeMesh.onBeforeRender = (
      renderer: WebGLRenderer,
      _scene: Scene,
      camera: Camera,
    ): void => {
      const previousTarget = renderer.getRenderTarget();

      if (previousTarget === null) {
        renderer.getDrawingBufferSize(bufferSize);
      } else {
        bufferSize.set(previousTarget.width, previousTarget.height);
      }

      // Cap max raymarch resolution to 320p height to keep GPU time under 1.5ms at native resolutions
      const MAX_RAYMARCH_H = 320;
      const rawTargetH = bufferSize.y * resolutionScale;
      const effectiveScale =
        rawTargetH > MAX_RAYMARCH_H
          ? MAX_RAYMARCH_H / bufferSize.y
          : resolutionScale;

      const width = Math.max(2, Math.round(bufferSize.x * effectiveScale));
      const height = Math.max(2, Math.round(bufferSize.y * effectiveScale));
      if (target.width !== width || target.height !== height) {
        target.setSize(width, height);
        compositeMaterial.uniforms.uTexelSize.value.set(1 / width, 1 / height);
      }

      marchMaterial.uniforms.uInvProjection.value.copy(
        camera.projectionMatrixInverse,
      );
      marchMaterial.uniforms.uCameraWorld.value.copy(camera.matrixWorld);

      renderer.setRenderTarget(target);
      renderer.render(marchScene, marchCamera);
      renderer.setRenderTarget(previousTarget);
    };

    return (): void => {
      compositeMesh.onBeforeRender = (): void => {};
    };
  }, [resources, resolutionScale]);

  return <primitive object={resources.compositeMesh} />;
}

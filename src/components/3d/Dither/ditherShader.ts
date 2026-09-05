export const ditherVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fragDither = /* glsl */ `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
  #else
    precision mediump float;
  #endif

  uniform sampler2D tDiffuse;
  uniform vec2 texelSize;       // 1/resolution
  uniform vec2 resolution;      // 640p resolution
  uniform float ditherEnabled;  // 1.0 = on, 0.0 = off
  uniform float toLinear;       // 1.0 = output linear (for CRT pass), 0.0 = output sRGB (for canvas)

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

  vec3 applyDither(vec3 color, vec2 pos, bool linearOut) {
    // Linear -> gamma (PS1 worked in gamma-encoded 8-bit space)
    vec3 g = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));
    float offset = ps1Offset(pos);
    vec3 rgb555 = floor(clamp(g * 255.0 + offset, 0.0, 255.0) / 8.0) / 31.0;
    // If downstream pass (e.g. CRT) expects linear light, convert back; otherwise keep gamma for display
    return linearOut ? pow(rgb555, vec3(2.2)) : rgb555;
  }

  void main() {
    vec3 color = applyFXAA(tDiffuse, vUv, texelSize);

    if (ditherEnabled > 0.5) {
      vec2 virtualPos = floor(vUv * resolution);
      color = applyDither(color, virtualPos, toLinear > 0.5);
    } else if (toLinear < 0.5) {
      // CRT is off and dither is off: convert linear to sRGB for direct canvas display
      color = pow(clamp(color, 0.0, 1.0), vec3(1.0 / 2.2));
    }

    gl_FragColor = vec4(color, 1.0);
  }
`;

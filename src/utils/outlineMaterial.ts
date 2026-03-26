import * as THREE from "three";

// Vertex shader: expands back-faces by a fixed number of screen-space pixels.
// Multiplying the NDC offset by clipPos.w undoes the perspective divide so the
// expansion is constant in pixels regardless of camera distance.
export const outlineVert = /* glsl */ `
  uniform vec2 resolution;
  uniform float outlineWidth;
  void main() {
    vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec3 viewNormal = normalize(normalMatrix * normal);
    vec2 screenNormal = normalize(vec2(
      projectionMatrix[0][0] * viewNormal.x,
      projectionMatrix[1][1] * viewNormal.y
    ));
    clipPos.xy += screenNormal * (outlineWidth * 2.0 / resolution) * clipPos.w;
    gl_Position = clipPos;
  }
`;

export const outlineFrag = /* glsl */ `
  uniform vec3 color;
  uniform float opacity;
  void main() {
    gl_FragColor = vec4(color, opacity);
  }
`;

// Shared singleton materials — white inner outline + black outer stroke.
// Used by Basketballs, ResetButton, and any other interactable objects.
// Call updateOutlineResolution(gl) once per frame from any consumer.
export const sharedOutlineMat = new THREE.ShaderMaterial({
  vertexShader: outlineVert,
  fragmentShader: outlineFrag,
  uniforms: {
    resolution: { value: new THREE.Vector2(1, 1) },
    outlineWidth: { value: 5.0 },
    color: { value: new THREE.Color(1, 1, 1) },
    opacity: { value: 1.0 },
  },
  side: THREE.BackSide,
  transparent: true,
  depthWrite: false,
});

export const sharedStrokeMat = new THREE.ShaderMaterial({
  vertexShader: outlineVert,
  fragmentShader: outlineFrag,
  uniforms: {
    resolution: { value: new THREE.Vector2(1, 1) },
    outlineWidth: { value: 6.5 },
    color: { value: new THREE.Color(0, 0, 0) },
    opacity: { value: 0.5 },
  },
  side: THREE.BackSide,
  transparent: true,
  depthWrite: false,
});

export function updateOutlineResolution(gl: THREE.WebGLRenderer): void {
  const aspect = gl.domElement.width / gl.domElement.height;
  const gameW = Math.round(640 * aspect);
  sharedOutlineMat.uniforms.resolution.value.set(gameW, 640);
  sharedStrokeMat.uniforms.resolution.value.set(gameW, 640);
}

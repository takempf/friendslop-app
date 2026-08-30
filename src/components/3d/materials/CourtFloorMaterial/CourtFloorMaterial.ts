import * as THREE from "three";

// World-space span the court texture covers, matching CourtTexture's mapping:
//   canvas_x = (world_X + 10) * SCALE
//   canvas_y = (world_Z + 10) * SCALE
const FLOOR_SIZE = 20;
const FLOOR_HALF = FLOOR_SIZE / 2;

/**
 * Gym floor: tiled wood with the court markings composited in the fragment
 * shader.
 *
 * The markings used to be a second 20×20m transparent quad hovering 2mm above
 * the floor, which shaded every floor pixel twice and needed depthWrite:false
 * plus a polygonOffset to avoid z-fighting the surface it sat on. Sampling them
 * here costs one extra texture fetch on a surface that was being shaded anyway.
 *
 * They are addressed from world XZ rather than the slab's own UVs, so the wood
 * keeps its high-frequency 10×10 tiling while the court stays a single 20m span.
 */
export function createCourtFloorMaterial(
  woodTexture: THREE.Texture,
  courtTexture: THREE.Texture,
): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ map: woodTexture });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.courtMap = { value: courtTexture };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vCourtWorldPos;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvCourtWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform sampler2D courtMap;\nvarying vec3 vCourtWorldPos;",
      )
      .replace(
        "#include <map_fragment>",
        /* glsl */ `
        #include <map_fragment>
        // Only the top face is painted — the slab's side faces sit below y=0.
        if ( vCourtWorldPos.y > -0.01 ) {
          // V is flipped: CanvasTexture uploads with flipY, so canvas row 0
          // (world Z = -10) lands at v = 1.
          vec2 courtUv = vec2(
            ( vCourtWorldPos.x + ${FLOOR_HALF.toFixed(1)} ) / ${FLOOR_SIZE.toFixed(1)},
            ( ${FLOOR_HALF.toFixed(1)} - vCourtWorldPos.z ) / ${FLOOR_SIZE.toFixed(1)}
          );
          vec4 court = texture2D( courtMap, courtUv );
          diffuseColor.rgb = mix( diffuseColor.rgb, court.rgb, court.a );
        }
        `,
      );
  };

  // Every wall in the level is also a mapped MeshLambertMaterial, so these
  // compile to the same cache key. Without a distinct one the renderer would
  // share a single program between them and the injection would leak or be lost.
  material.customProgramCacheKey = () => "court-floor";

  return material;
}

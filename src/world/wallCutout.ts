import * as THREE from 'three';

/** Shared uniforms: where the player is, so walls between camera and player can be cut away. */
export const cutoutUniforms = {
  uCutTarget: { value: new THREE.Vector3() },
  uCutRadius: { value: 1.7 },
};

/**
 * Patch a material so fragments near the camera→player line (and in front of
 * the player) are discarded with a dithered edge. Keeps the hero visible behind walls.
 */
export function applyWallCutout(material: THREE.Material): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCutTarget = cutoutUniforms.uCutTarget;
    shader.uniforms.uCutRadius = cutoutUniforms.uCutRadius;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCutWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 cutWp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          cutWp = instanceMatrix * cutWp;
        #endif
        vCutWorld = (modelMatrix * cutWp).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vCutWorld;\nuniform vec3 uCutTarget;\nuniform float uCutRadius;',
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        {
          vec3 seg = uCutTarget - cameraPosition;
          float t = clamp(dot(vCutWorld - cameraPosition, seg) / dot(seg, seg), 0.0, 1.0);
          float d = distance(vCutWorld, cameraPosition + seg * t);
          if (t < 0.96 && d < uCutRadius && vCutWorld.y > 0.6) {
            float edge = d / uCutRadius;
            float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
            if (edge < 0.65 || n > (edge - 0.65) / 0.35) discard;
          }
        }`,
      );
  };
  material.customProgramCacheKey = () => 'wall-cutout';
}

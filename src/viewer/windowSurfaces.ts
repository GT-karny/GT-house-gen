import * as THREE from 'three';
import type { WindowSize } from '../gen/types';
import { rand01 } from '../shared/rng';
import { imageTex, tex } from './textures';

export type WindowLightingMode = 'day' | 'night' | 'mixed';

export type WindowSurface =
  | 'curtain-blackout-day'
  | 'curtain-lace-day'
  | 'interior-dark-day'
  | 'curtain-warm-night'
  | 'curtain-lace-warm-night'
  | 'blinds-warm-night'
  | 'frosted-glass-warm-night';

const DAY_LARGE: WindowSurface[] = [
  'curtain-lace-day', 'curtain-lace-day', 'curtain-lace-day',
  'interior-dark-day', 'interior-dark-day',
  'curtain-blackout-day',
];
const DAY_SMALL: WindowSurface[] = [
  'interior-dark-day', 'interior-dark-day', 'interior-dark-day',
  'curtain-lace-day', 'curtain-lace-day',
  'curtain-blackout-day',
];
const NIGHT_LARGE: WindowSurface[] = [
  'curtain-lace-warm-night', 'curtain-lace-warm-night', 'curtain-lace-warm-night',
  'curtain-warm-night', 'curtain-warm-night',
  'blinds-warm-night', 'blinds-warm-night',
  'frosted-glass-warm-night',
];
const NIGHT_SMALL: WindowSurface[] = [
  'frosted-glass-warm-night', 'frosted-glass-warm-night', 'frosted-glass-warm-night',
  'curtain-lace-warm-night',
  'blinds-warm-night',
  'curtain-warm-night',
];

/** Pick a stable window dressing without leaking any Three.js state into gen/. */
export function resolveWindowSurface(
  mode: WindowLightingMode,
  seed: number,
  size: WindowSize,
  ...positionKey: number[]
): WindowSurface {
  const salt = positionKey.map((n) => Math.round(n));
  const lighting = mode === 'mixed'
    ? (rand01(seed, 0x71a0, ...salt) < 0.3 ? 'night' : 'day')
    : mode;
  const small = size === 'small';
  const palette = lighting === 'night'
    ? (small ? NIGHT_SMALL : NIGHT_LARGE)
    : (small ? DAY_SMALL : DAY_LARGE);
  return palette[Math.floor(rand01(seed, 0x71a1, ...salt) * palette.length)];
}

export type InteriorRoomVariant =
  | 'curtain-offwhite-on'
  | 'curtain-offwhite-off'
  | 'curtain-beige-on'
  | 'curtain-gray-off'
  | 'empty-room-on'
  | 'empty-room-off';

export type WindowAppearanceKey = `surface/${WindowSurface}` | `interior/${InteriorRoomVariant}`;

interface InteriorRoomSpec {
  atlas: string;
  lit: boolean;
  /** Normalized ray-box depth. Curtains sit near the glass; empty rooms extend back. */
  depth: number;
}

const INTERIOR_ROOMS: Record<InteriorRoomVariant, InteriorRoomSpec> = {
  'curtain-offwhite-on': { atlas: 'window/interior-map-curtain-offwhite-on.png', lit: true, depth: 0.07 },
  'curtain-offwhite-off': { atlas: 'window/interior-map-curtain-offwhite-off.png', lit: false, depth: 0.07 },
  'curtain-beige-on': { atlas: 'window/interior-map-curtain-beige-on.png', lit: true, depth: 0.07 },
  'curtain-gray-off': { atlas: 'window/interior-map-curtain-gray-off.png', lit: false, depth: 0.07 },
  'empty-room-on': { atlas: 'window/interior-map-empty-room-on.png', lit: true, depth: 1.10 },
  'empty-room-off': { atlas: 'window/interior-map-empty-room-off.png', lit: false, depth: 1.10 },
};

const INTERIOR_DAY: InteriorRoomVariant[] = [
  'curtain-offwhite-off', 'curtain-offwhite-off',
  'curtain-gray-off', 'curtain-gray-off',
  'empty-room-off', 'empty-room-off',
];
const INTERIOR_NIGHT: InteriorRoomVariant[] = [
  'curtain-offwhite-on', 'curtain-offwhite-on',
  'curtain-beige-on', 'curtain-beige-on',
  'empty-room-on', 'empty-room-on',
];

const cache = new Map<string, THREE.MeshPhysicalMaterial>();

function resolveLighting(mode: WindowLightingMode, seed: number, salt: number[]): 'day' | 'night' {
  return mode === 'mixed'
    ? (rand01(seed, 0x71a0, ...salt) < 0.3 ? 'night' : 'day')
    : mode;
}

export function resolveInteriorRoomVariant(
  mode: WindowLightingMode,
  seed: number,
  ...positionKey: number[]
): InteriorRoomVariant {
  const salt = positionKey.map((n) => Math.round(n));
  const palette = resolveLighting(mode, seed, salt) === 'night' ? INTERIOR_NIGHT : INTERIOR_DAY;
  return palette[Math.floor(rand01(seed, 0x71a2, ...salt) * palette.length)];
}

/** Interior Mapping ON selects one of the authored rooms; OFF restores the
 * existing deterministic flat surface assignment. */
export function resolveWindowAppearance(
  interiorMapping: boolean,
  mode: WindowLightingMode,
  seed: number,
  size: WindowSize,
  ...positionKey: number[]
): WindowAppearanceKey {
  return interiorMapping
    ? `interior/${resolveInteriorRoomVariant(mode, seed, size === 'small' ? 1 : 0, ...positionKey)}`
    : `surface/${resolveWindowSurface(mode, seed, size, ...positionKey)}`;
}

function addInteriorMapping(shader: { vertexShader: string; fragmentShader: string }, roomDepth: number): void {
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
       varying vec2 vWindowUv;
       varying vec3 vWindowRayDir;`,
    )
    .replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
       vWindowUv = uv;`,
    )
    .replace(
      '#include <project_vertex>',
      `#include <project_vertex>
       mat3 windowBasis = mat3( modelViewMatrix );
       #ifdef USE_INSTANCING
         windowBasis = windowBasis * mat3( instanceMatrix );
       #endif
       vec3 windowViewRay = normalize( mvPosition.xyz );
       vWindowRayDir = vec3(
         dot( windowViewRay, normalize( windowBasis[ 0 ] ) ),
         dot( windowViewRay, normalize( windowBasis[ 1 ] ) ),
         dot( windowViewRay, normalize( windowBasis[ 2 ] ) )
       );`,
    );

  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
       varying vec2 vWindowUv;
       varying vec3 vWindowRayDir;`,
    )
    .replace(
      '#include <map_pars_fragment>',
      `#include <map_pars_fragment>

       vec4 sampleWindowInterior( vec2 surfaceUv, vec3 localRay ) {
         const float roomDepth = ${roomDepth.toFixed(2)};
         const float safeRay = 0.0001;
         vec3 rayOrigin = vec3( surfaceUv * 2.0 - 1.0, 0.0 );
         vec3 rayDir = normalize( vec3( localRay.xy, -max( abs( localRay.z ), safeRay ) ) );

         float sideX = rayDir.x < 0.0 ? -1.0 : 1.0;
         float sideY = rayDir.y < 0.0 ? -1.0 : 1.0;
         float rayX = abs( rayDir.x ) < safeRay ? ( rayDir.x < 0.0 ? -safeRay : safeRay ) : rayDir.x;
         float rayY = abs( rayDir.y ) < safeRay ? ( rayDir.y < 0.0 ? -safeRay : safeRay ) : rayDir.y;
         float hitX = ( sideX - rayOrigin.x ) / rayX;
         float hitY = ( sideY - rayOrigin.y ) / rayY;
         float hitBack = -roomDepth / rayDir.z;
         float distanceToFace = min( hitBack, min( hitX, hitY ) );
         vec3 hit = rayOrigin + rayDir * max( distanceToFace, 0.0 );

         vec2 faceUv;
         vec2 tile;
         if ( hitBack <= hitX && hitBack <= hitY ) {
           faceUv = hit.xy * 0.5 + 0.5;
           tile = vec2( 0.0, 1.0 ); // closed curtain / back wall
         } else if ( hitX < hitY ) {
           faceUv = vec2( clamp( -hit.z / roomDepth, 0.0, 1.0 ), hit.y * 0.5 + 0.5 );
           tile = hit.x < 0.0 ? vec2( 1.0, 1.0 ) : vec2( 2.0, 1.0 );
         } else {
           faceUv = vec2( hit.x * 0.5 + 0.5, clamp( -hit.z / roomDepth, 0.0, 1.0 ) );
           tile = hit.y < 0.0 ? vec2( 0.0, 0.0 ) : vec2( 1.0, 0.0 );
         }

         // Keep bilinear filtering inside each 512 px tile of the 3x2 atlas.
         faceUv = clamp( faceUv, vec2( 0.003 ), vec2( 0.997 ) );
         return texture2D( map, ( tile + faceUv ) / vec2( 3.0, 2.0 ) );
       }`,
    )
    .replace(
      '#include <map_fragment>',
      `vec4 windowInteriorColor = sampleWindowInterior( vWindowUv, vWindowRayDir );
       diffuseColor *= windowInteriorColor;`,
    )
    .replace(
      '#include <emissivemap_fragment>',
      `#ifdef USE_EMISSIVEMAP
         totalEmissiveRadiance *= windowInteriorColor.rgb;
       #endif`,
    );
}

/**
 * One opaque draw that reads as a privacy layer behind glass. Clearcoat supplies
 * a separate, sharp IBL reflection lobe over the softer curtain/interior base,
 * avoiding transparent sorting and a second backing mesh on window-heavy blocks.
 */
export function windowAppearanceMaterial(appearance: WindowAppearanceKey): THREE.MeshPhysicalMaterial {
  const mapped = appearance.startsWith('interior/');
  const variant = mapped ? appearance.slice('interior/'.length) as InteriorRoomVariant : null;
  const surface = mapped ? null : appearance.slice('surface/'.length) as WindowSurface;
  const room = variant ? INTERIOR_ROOMS[variant] : null;
  const key = appearance;
  const hit = cache.get(key);
  if (hit) return hit;

  const map = room ? imageTex(room.atlas, true) : tex(`window/${surface!}`, 1, true);
  // These are complete images, not tiling PBR surfaces. Clamp the authored
  // border so the 0..1 window UV cannot sample a wrapped seam at its edges.
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  const lit = room?.lit ?? surface!.endsWith('-night');
  const dark = surface === 'interior-dark-day';
  const material = new THREE.MeshPhysicalMaterial({
    map,
    // Cool and darken the image slightly so it reads through glazing rather
    // than as fabric pasted directly onto the facade plane.
    color: dark ? 0x8294a2 : lit ? 0xdadfe2 : 0xb8c2c8,
    roughness: dark ? 0.3 : 0.44,
    metalness: 0,
    envMapIntensity: dark ? 1.4 : 1.15,
    ior: 1.5,
    reflectivity: 0.58,
    clearcoat: 1,
    clearcoatRoughness: dark ? 0.045 : 0.065,
    emissive: lit ? 0xffc47a : 0x000000,
    emissiveMap: lit ? map : null,
    emissiveIntensity: lit ? 0.36 : 0,
  });

  // MeshPhysicalMaterial already applies physically based Fresnel to its
  // specular lobes. Residential glazing benefits from a slightly stronger
  // grazing response, though, because the opaque privacy image otherwise wins
  // visually. Reuse the shader's actual IBL terms so this follows the HDRI
  // instead of painting a fixed blue rim. Still one opaque material / one draw.
  material.onBeforeCompile = (shader) => {
    if (room) addInteriorMapping(shader, room.depth);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `
        float windowDotNV = saturate( dot( geometryNormal, geometryViewDir ) );
        float windowFresnel = pow( 1.0 - windowDotNV, 3.0 );
        outgoingLight += reflectedLight.indirectSpecular * windowFresnel * 1.15;
        #ifdef USE_CLEARCOAT
          outgoingLight += clearcoatSpecularIndirect * windowFresnel * 0.55;
        #endif
        #include <opaque_fragment>
      `,
    );
  };
  material.customProgramCacheKey = () => `window-fresnel-v2:${key}:${room?.depth ?? 'flat'}`;

  cache.set(key, material);
  return material;
}

export function windowSurfaceMaterial(surface: WindowSurface): THREE.MeshPhysicalMaterial {
  return windowAppearanceMaterial(`surface/${surface}`);
}

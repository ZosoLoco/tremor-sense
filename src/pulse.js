import * as THREE from 'three';
import { PULSE_SPEED, PULSE_LIFE, MAX_PULSES, ACID } from './data.js?v=14';
import { thump } from './audio.js?v=14';
import { S, L } from './state.js?v=14';
import { now } from './renderer.js?v=14';

// ---------- the pulse material, shared by every room surface ----------
export const pulseUniforms = {
  uTime: { value: 0 },
  uBase: { value: 0.1 },
  uBias: { value: 0 },                              // metres the room drawing is pulled toward you, so live depth does not fight it
  uAmbient: { value: new THREE.Color(0, 0, 0) },   // a wash over every surface while a sense is running
  uLights: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 0)) },      // xyz + strength
  uLightCols: { value: Array.from({ length: 4 }, () => new THREE.Vector3(0, 0, 0)) },
  uColor: { value: ACID },
  uPulses: { value: Array.from({ length: MAX_PULSES }, () => new THREE.Vector4(0, 0, 0, -999)) },
};
export const roomMat = new THREE.ShaderMaterial({
  uniforms: pulseUniforms,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  vertexShader: /* glsl */`
    uniform float uBias;
    varying vec3 vWorld;
    varying vec3 vNormalW;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      vNormalW = normalize(mat3(modelMatrix) * normal);
      vec4 v = viewMatrix * w;
      v.xyz *= 1.0 - uBias / max(length(v.xyz), 0.2);
      gl_Position = projectionMatrix * v;
    }`,
  fragmentShader: /* glsl */`
    uniform float uTime;
    uniform float uBase;
    uniform vec3 uAmbient;
    uniform vec4 uLights[4];
    uniform vec3 uLightCols[4];
    uniform vec3 uColor;
    uniform vec4 uPulses[${MAX_PULSES}];
    varying vec3 vWorld;
    varying vec3 vNormalW;
    void main() {
      // No grid. Surfaces are a faint fill; where the shape bends, it brightens into a contour.
      // (The hard edges of the room are drawn as real lines, further down.)
      float grid = clamp(length(fwidth(normalize(vNormalW))) * 3.0, 0.0, 1.0);
      float a = uBase * (0.10 + grid * 0.6);
      for (int i = 0; i < ${MAX_PULSES}; i++) {
        float age = uTime - uPulses[i].w;
        if (age > 0.0 && age < ${PULSE_LIFE.toFixed(1)}) {
          float r = age * ${PULSE_SPEED.toFixed(1)};
          float d = distance(vWorld, uPulses[i].xyz);
          float fade = 1.0 - age / ${PULSE_LIFE.toFixed(1)};
          float ring = exp(-pow((d - r) / 0.10, 2.0));
          float echo = exp(-pow((d - r * 0.72) / 0.07, 2.0)) * 0.45;
          // Behind the front, the surface it has passed over stays lit for a moment, with ripples still running across it.
          float passed = smoothstep(r - 2.2, r, d) * step(d, r);
          float ripple = pow(0.5 + 0.5 * cos((d - r) * 15.0), 14.0);
          a += (ring + echo + passed * (0.07 + ripple * 0.35 + grid * 0.6)) * fade;
        }
      }
      float wash = max(uAmbient.r, max(uAmbient.g, uAmbient.b)) * (0.35 + grid);
      // Fire, lava and lightning light the real room: a soft pool on whatever is near them.
      vec3 lit = vec3(0.0);
      vec3 nn = normalize(vNormalW);
      for (int i = 0; i < 4; i++) {
        vec3 toL = uLights[i].xyz - vWorld;
        float d2 = dot(toL, toL);
        float facing = 0.35 + 0.65 * abs(dot(nn, toL * inversesqrt(d2 + 0.0001)));
        lit += uLightCols[i] * (uLights[i].w * facing / (1.0 + d2 * 2.2));
      }
      float glow = max(lit.r, max(lit.g, lit.b));
      gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.35) * a + uAmbient * (0.35 + grid) + lit, a + wash + glow);
    }`,
});

// Lights: lasting ones (an explosion, a bolt of lightning) and ones re-declared every frame by whatever is burning.
export const lights = [], frameLights = [];
export const FIRE_LIGHT = new THREE.Vector3(1.0, 0.5, 0.14), LAVA_LIGHT = new THREE.Vector3(1.0, 0.36, 0.08), VOLT_LIGHT = new THREE.Vector3(0.75, 0.85, 1.0);
export function addLight(pos, colour, strength, life) { lights.push({ pos: pos.clone(), colour, strength, born: now(), life }); }
export function lightNow(pos, colour, strength) { frameLights.push({ pos: pos.clone(), colour, strength }); }
export function updateLights(t) {
  for (let i = lights.length - 1; i >= 0; i--) if (t - lights[i].born > lights[i].life) lights.splice(i, 1);
  const all = lights.map(l => ({ pos: l.pos, colour: l.colour, strength: l.strength * (1 - (t - l.born) / l.life) })).concat(frameLights);
  all.sort((p, q) => q.strength - p.strength);
  for (let i = 0; i < 4; i++) {
    const l = all[i];
    if (l) {
      const flicker = 0.85 + 0.15 * Math.sin(t * 23 + i * 2.1);
      pulseUniforms.uLights.value[i].set(l.pos.x, l.pos.y, l.pos.z, l.strength * flicker);
      pulseUniforms.uLightCols.value[i].copy(l.colour);
    } else pulseUniforms.uLights.value[i].w = 0;
  }
  frameLights.length = 0;
}

let pulseIndex = 0;
// The hard edges of the room, as lines: the outline of every wall, table and shelf. They carry most of the picture.
const lineMat = new THREE.ShaderMaterial({
  uniforms: pulseUniforms,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */`
    varying vec3 vWorld;
    uniform float uBias;
    void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vec4 v = viewMatrix * w; v.xyz *= 1.0 - uBias / max(length(v.xyz), 0.2); gl_Position = projectionMatrix * v; }`,
  fragmentShader: /* glsl */`
    uniform float uTime; uniform float uBase; uniform vec3 uAmbient; uniform vec3 uColor;
    uniform vec4 uPulses[${MAX_PULSES}];
    varying vec3 vWorld;
    void main() {
      float a = uBase * 0.9;
      for (int i = 0; i < ${MAX_PULSES}; i++) {
        float age = uTime - uPulses[i].w;
        if (age > 0.0 && age < ${PULSE_LIFE.toFixed(1)}) {
          float r = age * ${PULSE_SPEED.toFixed(1)};
          float d = distance(vWorld, uPulses[i].xyz);
          float fade = 1.0 - age / ${PULSE_LIFE.toFixed(1)};
          a += (exp(-pow((d - r) / 0.16, 2.0)) * 1.6 + smoothstep(r - 3.0, r, d) * step(d, r) * 0.9) * fade;
        }
      }
      a += max(uAmbient.r, max(uAmbient.g, uAmbient.b)) * 4.0;
      gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.6) * a + uAmbient * 2.0, min(a, 1.0));
    }`,
});
// Occlusion. Every room surface is also drawn into the depth buffer, without colour, before anything else:
// what is behind the couch is hidden by the couch, and the far wall does not show through the near one.
const occluderMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
const noDrawMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
const ROOM_DRAWN = [occluderMat, roomMat], ROOM_HIDDEN = [noDrawMat, noDrawMat];
export const edgeGroup = new THREE.Group();
export const dressed = new Set();
S.occlusion = true; S.depthSeen = false;
export function dress(entry, drawn) {
  const mesh = entry.mesh, geo = mesh.geometry;
  if (entry.dressed !== geo) {
    entry.dressed = geo;
    const n = geo.index ? geo.index.count : geo.attributes.position.count;
    geo.clearGroups(); geo.addGroup(0, n, 0); geo.addGroup(0, n, 1);
    if (entry.edges) entry.edges.geometry.dispose();
    else {
      entry.edges = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat);
      entry.edges.matrixAutoUpdate = false; entry.edges.frustumCulled = false; entry.edges.renderOrder = 2;
      edgeGroup.add(entry.edges);
    }
    entry.edges.geometry = new THREE.EdgesGeometry(geo, 28);
    dressed.add(entry);
  }
  mesh.material = drawn ? ROOM_DRAWN : ROOM_HIDDEN;
  occluderMat.visible = S.occlusion;
  entry.edges.visible = drawn && mesh.visible && (!mesh.parent || mesh.parent.visible);
  entry.edges.matrix.copy(mesh.matrixWorld); entry.edges.matrixWorld.copy(mesh.matrixWorld);
  entry.live = true;
}
export function firePulse(point) {
  const v = pulseUniforms.uPulses.value[pulseIndex];
  v.set(point.x, point.y, point.z, now());
  pulseIndex = (pulseIndex + 1) % MAX_PULSES;
  thump();
}

// Reached from modules that load before this one.
Object.assign(L, { pulseUniforms });

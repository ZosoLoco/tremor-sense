// Tremor Sense: a mixed reality prototype for Resonance.
//
// Pick a discipline (look at an open palm, poke an orb with the other index finger),
// then use the same six hand verbs. Each discipline answers them differently.
//
//            SENSE (fills the room)      PUNCH        SHOVE        LIFT     SWEEP      SLAM (fist on surface)  POINT (index finger jab)
//   TERRA    Tremor: palm on a surface   Stone Shot   Boulder      Spire    Rampart    Fault Line              Ferro Disc
//   PYRO     Chi: raised fist, held      Ember        Flame Burst  Pyre     Fire Arc   Eruption                Volt
//   AQUA     Tide: raised palm, held     Globe        Breaker      Geyser   Whip       Surge                   Frost Needle
//   AERO     Draft: clap                 Air Bullet   Gust         Updraft  Air Blade  Shockwave               Void
//
// Spire, Fault Line and Rampart come out of whatever surface is there: floor, wall, ceiling, table.
// Spire stays as cover. Rampart stands until you hit it, then charges. Terra has four forms: rock, sand, metal, lava.
// Aqua: an open palm on any surface starts a water source; water from a source gathers at your hand and powers the next move.
// Matter changes state: frost turns standing water to ice, fire turns it to steam, fire makes stone molten, crushing stone makes sand.
//
// GRIP (close an open hand while reaching at something, open it to let go):
//   AERO  Wind Grip    wind winds round any object (or cloud) you can see: carry it, throw it, crush it with the other fist
//   AQUA  Water Grip   water closes over an object, or takes hold of a creature by the water in it, through walls
//   TERRA Unearth      hold stone and steel, or reach at the floor to tear out a fresh boulder
//   PYRO  Fireball     keep a raised fist closed to grow a fireball, then punch to throw it
//
// Both hands making the same move together cast a stronger "twin" version.
//
// Echoes take two hits, and the disciplines leave different marks on them:
//   Pyro burns (a second hit lands by itself 1.5 s later). Aqua soaks. Frost freezes in place.
//   Terra hits twice as hard. Aero shoves things around. Lifts and Surge toss echoes into the air.
// Marks combine: Volt on a soaked echo conducts and chains. Terra on a frozen one shatters it and
// hurts its neighbours. Aero on an airborne one finishes it. Fire on water just makes steam.
//
// Projectiles collide with the real room. Columns, rings and Terra's ripple do not.

import * as THREE from 'three';

import { PULSE_SPEED, PULSE_LIFE, MAX_PULSES, ECHO_COUNT, KINDS, KIND_NAMES, REVEAL_TIME, HOLD_REVEAL, TOUCH_ON, SLAM_ON, TOUCH_OFF, CURL_OPEN, CURL_FIST, PUNCH_SPEED, PUSH_SPEED, LIFT_SPEED, SWEEP_SPEED, REARM_SPEED, CAST_COOLDOWN, HOLD_STILL, HOLD_TIME, POINT_SPEED, CLAP_ON, CLAP_OFF, TIDE_SENSE, DRAFT_SENSE, ACID, ELEMENTS, ELEMENT_ORDER, GRABS, HOLD_AS, holdKey, FIST_SENSE, PALM_SENSE, TOUCH_SENSE, TERRA_FORMS, FORM_LOOK, FORMS, forms, lookOf, GESTURES, MOVES } from './data.js?v=14';
import { ensureAudio, master, noise, play, SFX, FAMILIAR_NOTE, FORM_SFX, moveSound, tone, thump, blip, tick, thud, hitSound, castSound, getAudio } from './audio.js?v=14';
const statusEl = document.getElementById('status');
const hintEl = document.getElementById('hint');
const enterBtn = document.getElementById('enter');
const uiEl = document.getElementById('ui');
const chipEls = Array.from(document.querySelectorAll('[data-el]'));
const moveEls = Array.from(document.querySelectorAll('[data-g]'));
let terraForm = 'rock';
const formOf = (key) => key === 'terra' ? terraForm : forms[key];
// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const PREVIEW_BG = new THREE.Color(0x050705);
scene.background = PREVIEW_BG;
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 50);
camera.position.set(0.4, 1.55, 2.9);
camera.lookAt(0, 0.9, 0);

window.addEventListener('resize', () => {
  if (renderer.xr.isPresenting) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const UP = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Vector3();
const now = () => pulseUniforms.uTime.value;

// ---------- the pulse material, shared by every room surface ----------
const pulseUniforms = {
  uTime: { value: 0 },
  uBase: { value: 0.1 },
  uBias: { value: 0 },                              // metres the room drawing is pulled toward you, so live depth does not fight it
  uAmbient: { value: new THREE.Color(0, 0, 0) },   // a wash over every surface while a sense is running
  uLights: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 0)) },      // xyz + strength
  uLightCols: { value: Array.from({ length: 4 }, () => new THREE.Vector3(0, 0, 0)) },
  uColor: { value: ACID },
  uPulses: { value: Array.from({ length: MAX_PULSES }, () => new THREE.Vector4(0, 0, 0, -999)) },
};
const roomMat = new THREE.ShaderMaterial({
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
const lights = [], frameLights = [];
const FIRE_LIGHT = new THREE.Vector3(1.0, 0.5, 0.14), LAVA_LIGHT = new THREE.Vector3(1.0, 0.36, 0.08), VOLT_LIGHT = new THREE.Vector3(0.75, 0.85, 1.0);
function addLight(pos, colour, strength, life) { lights.push({ pos: pos.clone(), colour, strength, born: now(), life }); }
function lightNow(pos, colour, strength) { frameLights.push({ pos: pos.clone(), colour, strength }); }
function updateLights(t) {
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
const edgeGroup = new THREE.Group();
const dressed = new Set();
let occlusion = true, depthSeen = false;
function dress(entry, drawn) {
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
  occluderMat.visible = occlusion;
  entry.edges.visible = drawn && mesh.visible && (!mesh.parent || mesh.parent.visible);
  entry.edges.matrix.copy(mesh.matrixWorld); entry.edges.matrixWorld.copy(mesh.matrixWorld);
  entry.live = true;
}
function firePulse(point) {
  const v = pulseUniforms.uPulses.value[pulseIndex];
  v.set(point.x, point.y, point.z, now());
  pulseIndex = (pulseIndex + 1) % MAX_PULSES;
  thump();
}

// ---------- room surfaces ----------
const roomGroup = new THREE.Group();     // real surfaces from the headset
const previewGroup = new THREE.Group();  // stand-in room for a flat screen
scene.add(roomGroup, previewGroup, edgeGroup);

// Fallback floor, used in the headset until real planes show up.
const fallbackFloor = new THREE.Mesh(new THREE.CircleGeometry(4, 48).rotateX(-Math.PI / 2), roomMat);
const staticRoom = [{ mesh: fallbackFloor }];
fallbackFloor.visible = false;
scene.add(fallbackFloor);

function buildPreviewRoom() {
  const add = (geo, x, y, z) => {
    const m = new THREE.Mesh(geo, roomMat);
    m.position.set(x, y, z);
    previewGroup.add(m);
    m.updateMatrixWorld(true);
    staticRoom.push({ mesh: m });
    return m;
  };
  add(new THREE.PlaneGeometry(5, 5).rotateX(-Math.PI / 2), 0, 0, 0);          // floor
  add(new THREE.PlaneGeometry(5, 2.6), 0, 1.3, -2.5);                          // back wall
  add(new THREE.PlaneGeometry(5, 2.6).rotateY(Math.PI / 2), -2.5, 1.3, 0);     // left wall
  add(new THREE.PlaneGeometry(5, 2.6).rotateY(-Math.PI / 2), 2.5, 1.3, 0);     // right wall
  add(new THREE.BoxGeometry(1.2, 0.74, 0.7), -0.9, 0.37, -0.6);                // table
  add(new THREE.BoxGeometry(0.9, 0.45, 1.8), 1.7, 0.225, -0.9);                // couch
}
buildPreviewRoom();

const planes = new Map();   // XRPlane -> { mesh, changed, pts, inverse }
const meshes = new Map();   // XRMesh  -> { mesh, changed }

function planeGeometry(polygon) {
  const pts = polygon.map(p => [p.x, p.z]);
  if (pts.length > 3) {
    const a = pts[0], b = pts[pts.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-5 && Math.abs(a[1] - b[1]) < 1e-5) pts.pop();
  }
  const pos = [], nor = [], idx = [];
  for (const [x, z] of pts) { pos.push(x, 0, z); nor.push(0, 1, 0); }
  for (let i = 1; i < pts.length - 1; i++) idx.push(0, i, i + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return { geometry: g, pts };
}

// Which of the room's surfaces get drawn. The headset can report the same room three ways at once (flat planes,
// a box per piece of furniture, and one scanned mesh of everything); drawn together they overlap and fight.
// So: the scanned mesh if there is one, otherwise the boxes, otherwise the planes. Collision still uses all of it.
function dressRoom() {
  for (const e of dressed) e.live = false;
  let scan = null;
  for (const [xm, e] of meshes) if (xm.semanticLabel === 'global mesh') scan = e;
  for (const [, e] of meshes) dress(e, scan ? e === scan : true);
  for (const [, e] of planes) dress(e, meshes.size === 0);
  for (const e of staticRoom) { e.mesh.updateMatrixWorld(); dress(e, true); if (!e.mesh.visible) e.edges.visible = false; }
  for (const e of dressed) if (!e.live) { edgeGroup.remove(e.edges); e.edges.geometry.dispose(); dressed.delete(e); }
}
function syncRoom(frame, refSpace) {
  const detectedPlanes = frame.detectedPlanes;
  if (detectedPlanes) {
    for (const [plane, entry] of planes) {
      if (!detectedPlanes.has(plane)) {
        roomGroup.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        planes.delete(plane);
      }
    }
    detectedPlanes.forEach(plane => {
      let entry = planes.get(plane);
      if (!entry || entry.changed !== plane.lastChangedTime) {
        const { geometry, pts } = planeGeometry(Array.from(plane.polygon));
        if (!entry) {
          const mesh = new THREE.Mesh(geometry, roomMat);
          mesh.matrixAutoUpdate = false;
          mesh.frustumCulled = false;
          roomGroup.add(mesh);
          entry = { mesh, inverse: new THREE.Matrix4() };
          planes.set(plane, entry);
        } else {
          entry.mesh.geometry.dispose();
          entry.mesh.geometry = geometry;
        }
        entry.pts = pts;
        entry.changed = plane.lastChangedTime;
      }
      const pose = frame.getPose(plane.planeSpace, refSpace);
      if (pose) {
        entry.mesh.visible = true;
        entry.mesh.matrix.fromArray(pose.transform.matrix);
        entry.mesh.matrixWorld.copy(entry.mesh.matrix);
        entry.inverse.copy(entry.mesh.matrix).invert();
      } else {
        entry.mesh.visible = false;
      }
    });
  }

  const detectedMeshes = frame.detectedMeshes;
  if (detectedMeshes) {
    for (const [xrMesh, entry] of meshes) {
      if (!detectedMeshes.has(xrMesh)) {
        roomGroup.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        meshes.delete(xrMesh);
      }
    }
    detectedMeshes.forEach(xrMesh => {
      let entry = meshes.get(xrMesh);
      if (!entry || entry.changed !== xrMesh.lastChangedTime) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(xrMesh.vertices), 3));
        g.setIndex(new THREE.BufferAttribute(new Uint32Array(xrMesh.indices), 1));
        g.computeVertexNormals();
        if (!entry) {
          const mesh = new THREE.Mesh(g, roomMat);
          mesh.matrixAutoUpdate = false;
          mesh.frustumCulled = false;
          roomGroup.add(mesh);
          entry = { mesh };
          meshes.set(xrMesh, entry);
        } else {
          entry.mesh.geometry.dispose();
          entry.mesh.geometry = g;
        }
        entry.changed = xrMesh.lastChangedTime;
      }
      const pose = frame.getPose(xrMesh.meshSpace, refSpace);
      if (pose) {
        entry.mesh.visible = true;
        entry.mesh.matrix.fromArray(pose.transform.matrix);
        entry.mesh.matrixWorld.copy(entry.mesh.matrix);
      } else {
        entry.mesh.visible = false;
      }
    });
  }

  // When the headset has a scanned room, planes cover the floor; until then use the stand-in.
  fallbackFloor.visible = planes.size === 0 && meshes.size === 0;
}

function clearRoom() {
  for (const { mesh } of planes.values()) { roomGroup.remove(mesh); mesh.geometry.dispose(); }
  for (const { mesh } of meshes.values()) { roomGroup.remove(mesh); mesh.geometry.dispose(); }
  planes.clear();
  meshes.clear();
}

function pointInPolygon(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// Nearest real surface to a world point. Returns { dist, point }.
const _local = new THREE.Vector3();
function nearestSurface(world) {
  let best = null;
  for (const entry of planes.values()) {
    if (!entry.mesh.visible) continue;
    _local.copy(world).applyMatrix4(entry.inverse);
    const d = Math.abs(_local.y);
    if (d > 0.3 || (best && d >= best.dist)) continue;
    if (!pointInPolygon(_local.x, _local.z, entry.pts)) continue;
    const point = new THREE.Vector3(_local.x, 0, _local.z).applyMatrix4(entry.mesh.matrix);
    best = { dist: d, point };
  }
  // The floor always counts, scanned room or not.
  const dFloor = Math.abs(world.y);
  if (!best || dFloor < best.dist) best = { dist: dFloor, point: new THREE.Vector3(world.x, 0, world.z) };
  return best;
}

// ---------- collision with the room ----------
// Planes are cheap to test, so they are the colliders whenever the headset provides them.
// The dense room mesh is only used when there are no planes at all.
const colliderList = [];
// Things you built that stand in the room and block like the room does.
//   struck(dir, key, t): called when one of your own moves hits it.  damage(t): called when something hostile does.
const barriers = [];
const barrierMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
let barrierKey = null;                             // the discipline raising whatever is being raised right now
function addBarrier(geometry, like, handlers) {
  const collider = new THREE.Mesh(geometry, barrierMat);
  collider.position.copy(like.position); collider.quaternion.copy(like.quaternion);
  collider.updateMatrixWorld(true);
  const b = { collider, alive: true, hp: 3, like, key: barrierKey, ...handlers };
  collider.userData.barrier = b;
  barriers.push(b);
  return b;
}
function clearBarriers() { for (const b of [...barriers]) b.crumble(now()); }
function removeBarrier(b) {
  if (!b.alive) return;
  b.alive = false;
  b.collider.geometry.dispose();
  const i = barriers.indexOf(b);
  if (i >= 0) barriers.splice(i, 1);
}
function colliders() {
  colliderList.length = 0;
  if (renderer.xr.isPresenting) {
    if (planes.size) { for (const e of planes.values()) if (e.mesh.visible) colliderList.push(e.mesh); }
    else for (const e of meshes.values()) if (e.mesh.visible) colliderList.push(e.mesh);
    if (fallbackFloor.visible) colliderList.push(fallbackFloor);
  } else {
    for (const m of previewGroup.children) colliderList.push(m);
  }
  for (const b of barriers) if (b.alive) colliderList.push(b.collider);     // walls and spires you raised
  return colliderList;
}
const rayC = new THREE.Raycaster();
const _cd = new THREE.Vector3();
const _nm = new THREE.Matrix3();
// First room surface between a and b. Returns { point, normal } with the normal facing back toward a, or null.
function collide(a, b) {
  _cd.subVectors(b, a);
  const dist = _cd.length();
  if (dist < 1e-5) return null;
  rayC.set(a, _cd.divideScalar(dist));
  rayC.far = dist;
  const hit = rayC.intersectObjects(colliders(), false)[0];
  if (!hit) return null;
  const normal = new THREE.Vector3(0, 1, 0);
  if (hit.face) normal.copy(hit.face.normal).applyMatrix3(_nm.getNormalMatrix(hit.object.matrixWorld)).normalize();
  if (normal.dot(_cd) > 0) normal.negate();
  return { point: hit.point.clone(), normal, object: hit.object };
}
// The closest piece of the room to a point, whatever it is: floor, wall, ceiling, table, something you built.
const PROBE_DIRS = [];
for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) if (x || y || z) PROBE_DIRS.push(new THREE.Vector3(x, y, z).normalize());
const _pr = new THREE.Vector3();
function nearestRoomSurface(p, maxDist) {
  let best = p.y >= 0 && p.y < maxDist ? { point: new THREE.Vector3(p.x, 0, p.z), normal: new THREE.Vector3(0, 1, 0), dist: p.y } : null;
  for (const d of PROBE_DIRS) {
    const h = collide(p, _pr.copy(p).addScaledVector(d, maxDist));
    if (!h) continue;
    const dist = h.point.distanceTo(p);
    if (!best || dist < best.dist) best = { point: h.point, normal: h.normal, dist };
  }
  return best;
}
const _eyeToEcho = new THREE.Vector3();
function lineOfSight(from, to) {
  // Stop a little short so an echo floating right at a surface still counts as visible.
  _eyeToEcho.subVectors(to, from);
  const len = _eyeToEcho.length();
  if (len < 0.15) return true;
  _eyeToEcho.multiplyScalar((len - 0.12) / len).add(from);
  return !collide(from, _eyeToEcho);
}

// ---------- echoes: the hidden things a sense reveals ----------
const echoes = [];
const echoGroup = new THREE.Group();
scene.add(echoGroup);
let downCount = 0;
let respawnAt = -1;

function glowMat(color, opacity = 0) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthTest: false, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

const ICE = new THREE.Color(0xbfeeff), STEEL_TINT = new THREE.Color(0x9fb0c4);
function makeEcho() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), glowMat(ACID));
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.085, 0), glowMat(ACID));
  shell.material.wireframe = true;
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.11, 0.118, 40), glowMat(ACID));
  const ice = new THREE.Mesh(new THREE.IcosahedronGeometry(0.125, 0), glowMat(ICE, 0.32));
  ice.visible = false;
  // A face, so it reads as a creature: a soft body with two eyes that watch you, and a tail that trails behind it.
  const face = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.07, 18, 14).scale(1, 0.85, 1.1), glowMat(ACID));
  const eyes = [-1, 1].map((side) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.013, 10, 8), glowMat(new THREE.Color(0xffffff)));
    eye.position.set(side * 0.03, 0.018, 0.068);
    face.add(eye);
    return eye;
  });
  face.add(body);
  const tail = [0.045, 0.036, 0.028, 0.02, 0.013].map((r) => {
    const bead = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), glowMat(ACID));
    bead.visible = false; bead.renderOrder = 10;
    echoGroup.add(bead);
    return bead;
  });
  g.add(core, shell, halo, ice, face);
  g.renderOrder = 10;
  g.visible = false;
  echoGroup.add(g);
  return {
    group: g, core, shell, halo, ice, face, body, eyes, tail, parts: [core, shell, halo, body, ...tail],
    goal: new THREE.Vector3(), goalUntil: 0, windup: -1, puppet: false, moving: 0, last: new THREE.Vector3(),
    home: new THREE.Vector3(), phase: Math.random() * 6.28,
    revealedUntil: -1, level: 0, down: false, downT: -1, push: new THREE.Vector3(),
    hp: 2, restY: 0, vel: new THREE.Vector3(), airborne: false, flashT: -1,
    burnAt: -1, soakedUntil: -1, frozenUntil: -1, metalUntil: -1, blindUntil: -1, drainAt: -1, exposedUntil: -1, rootedUntil: -1, seedAt: -1, venom: 0, baseColor: new THREE.Color(ACID),
  };
}
for (let i = 0; i < ECHO_COUNT; i++) echoes.push(makeEcho());

function roomBounds() {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  let any = false;
  for (const entry of planes.values()) {
    for (const [x, z] of entry.pts) {
      box.expandByPoint(v.set(x, 0, z).applyMatrix4(entry.mesh.matrix));
      any = true;
    }
  }
  if (!any) box.set(new THREE.Vector3(-2.2, 0, -2.2), new THREE.Vector3(2.2, 2.2, 2.2));
  // Keep echoes inside the walls and at heights you can aim at.
  box.min.addScalar(0.25); box.max.addScalar(-0.25);
  box.min.y = 0.12; box.max.y = Math.min(Math.max(box.max.y, 0.8), 1.7);
  if (box.max.x - box.min.x < 0.5) { box.min.x -= 1; box.max.x += 1; }
  if (box.max.z - box.min.z < 0.5) { box.min.z -= 1; box.max.z += 1; }
  return box;
}

// Where the player is standing when a round is laid out.
function spawnEye() {
  return renderer.xr.isPresenting ? viewerPos.clone() : new THREE.Vector3(0.4, 1.5, 2.2);
}
const _sa = new THREE.Vector3(), _sb = new THREE.Vector3();
const SIDE_RAYS = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]].map(v => new THREE.Vector3(...v));
// Is a ball of this radius at p in open air: not inside a wall, not inside or under furniture, and in plain view from eye?
function isOpen(p, radius, eye, needFloorGap = true) {
  for (const d of SIDE_RAYS) {
    if (!needFloorGap && d.y < 0) continue;
    if (collide(p, _sa.copy(p).addScaledVector(d, radius))) return false;
  }
  if (needFloorGap && p.y < radius) return false;
  const above = collide(p, _sa.copy(p).setY(p.y + 1.2));           // a table top or couch seat overhead means we are inside it
  if (above && above.point.y < 1.5) return false;
  const below = collide(_sb.copy(p).setY(2.6), p);                   // anything between the ceiling and here means the same
  if (below && below.point.y < 2.05 && below.point.y > p.y + radius) return false;
  return lineOfSight(eye, p);
}
function openSpot(box, yMin, yMax, radius, eye, others = [], gap = 0) {
  const p = new THREE.Vector3();
  for (let i = 0; i < 60; i++) {
    p.set(THREE.MathUtils.lerp(box.min.x, box.max.x, Math.random()), THREE.MathUtils.lerp(yMin, yMax, Math.random()), THREE.MathUtils.lerp(box.min.z, box.max.z, Math.random()));
    if (others.some(q => q.distanceTo(p) < gap)) continue;
    if (isOpen(p, radius, eye)) return p;
  }
  // Nowhere clean: fall back to open air in front of the player.
  return p.copy(eye).add(new THREE.Vector3((Math.random() - 0.5) * 1.6, -0.3 + Math.random() * 0.4, -1.2 - Math.random()));
}

// Waves: each one fields one more creature (three to start, eight at most) and they attack a little more often.
// Clear a wave and the next begins with the room as you left it. Go down and it is back to wave one, room reset.
let wave = 1, activeCount = 3;
function scatterEchoes(keepWorld = false) {
  if (!keepWorld) { clearBarriers(); clearShaping(); }
  const box = roomBounds();
  const eye = spawnEye(), taken = [];
  activeCount = Math.min(2 + wave, ECHO_COUNT);
  echoes.forEach((e, i) => {
    if (i >= activeCount) {                          // not in this wave: parked out of the way
      e.down = true; e.downT = -1; e.group.visible = false; e.home.set(0, -50, 0); e.windup = -1;
      for (const bead of e.tail) bead.visible = false;
      return;
    }
    e.kind = AI.kinds ? KIND_NAMES[(Math.random() * KIND_NAMES.length) | 0] : 'plain';
    if (KINDS[e.kind].minWave > wave) e.kind = 'pebble';
    const KK = KINDS[e.kind];
    e.home.copy(KK.alt ? openSpot(box, Math.min(KK.alt, box.max.y - 0.4), Math.min(KK.alt + 0.25, box.max.y - 0.3), 0.3, eye, taken, 0.7) : openSpot(box, 0.5, 1.7, 0.3, eye, taken, 0.7));
    e.group.scale.setScalar(KK.scale || 1);
    dressEcho(e);
    taken.push(e.home.clone());
    e.down = false; e.downT = -1; e.revealedUntil = -1; e.level = 0;
    e.hp = KINDS[e.kind].hp; e.restY = e.home.y; e.vel.set(0, 0, 0); e.airborne = false; e.flashT = -1;
    e.burnAt = e.soakedUntil = e.frozenUntil = e.metalUntil = e.blindUntil = e.drainAt = e.exposedUntil = e.rootedUntil = e.seedAt = e.dropAt = -1; e.venom = 0;
    e.baseColor.copy(ACID); e.ice.visible = false; e.shell.scale.setScalar(1);
    e.goal.copy(e.home); e.goalUntil = 0; e.windup = -1; e.puppet = false; e.last.copy(e.home);
    for (const bead of e.tail) { bead.position.copy(e.home); bead.visible = false; }
    for (const m of e.parts) m.material.color.copy(ACID);
    e.group.scale.setScalar(1);
    e.group.position.copy(e.home);
    e.group.visible = false;
  });
  downCount = 0;
  draftUntil = -1;
  nextAttackAt = now() + CREATURE.firstAttack;
  if (!keepWorld) {
    playerHP = MAX_HP;
    clearSources(); water.amount = 0;
    scatterObjects();
  } else if (objects.filter(o => !o.dead && !o.def.cloud && !o.hostile).length < 6) scatterObjects();   // running low: restock
  hudNote = `wave ${wave}`;
  drawHud();
}

const isLive = (e, t) => !e.down && e.revealedUntil > t;

// Mark an echo as sensed. The colour tells you which sense found it.
function reveal(e, t, duration, color) {
  if (e.down) return;
  if (e.revealedUntil < t) { blip(); e.baseColor.copy(AI.kinds && e.kind !== 'plain' ? KINDS[e.kind].colour : color); }
  e.revealedUntil = Math.max(e.revealedUntil, t + duration);
}

function defeat(e, elementKey, t, pushDir) {
  if (e.down) return;
  e.down = true;
  e.downT = t;
  e.push.copy(pushDir || ZERO);
  for (const m of e.parts) { m.material.color.copy(ELEMENTS[elementKey].color); m.material.opacity = 1; }
  e.group.visible = true;
  e.ice.visible = false;
  e.windup = -1;
  for (const bead of e.tail) bead.visible = false;
  downCount++;
  puff(elementKey, e.group.position, 26, 2.4, pushDir && pushDir.lengthSq() ? { dir: pushDir, spread: 1.1 } : {});
  hitSound();
  drawHud();
  if (AI.kinds) deathEffect(e, t);
  if (downCount === activeCount) { respawnAt = t + 3.5; hudNote = 'wave clear'; drawHud(); }
}
// What each kind leaves behind.
function deathEffect(e, t) {
  const p = e.group.position.clone();
  if (e.kind === 'drip') {
    const under = nearestRoomSurface(p, 3);
    addSource(under ? under.point : p.clone().setY(0), under ? under.normal : UP, t, 20);
  } else if (e.kind === 'ember') explode(p, 'pyro', 0.9, t, 1);
  else if (e.kind === 'pebble') spawnObject('stone', p);
  else if (e.kind === 'wisp') {
    puff('aero', p, 40, 4, { life: 0.4 });
    for (const o of objects) {
      if (o.dead || o.held || o.pos.distanceTo(p) > 2) continue;
      const away = o.pos.clone().sub(p).normalize();
      kick(o, away.x * 4, 2, away.z * 4);
    }
  }
}

// Land an attack on an echo. m is the move (or a bare { damage } for knock-on effects).
// Works out damage, the mark the discipline leaves, and any combination with marks already there.
const _hd = new THREE.Vector3(), _hp = new THREE.Vector3();
function hit(e, key, t, dir, m = {}) {
  if (e.down) return;
  _hd.copy(dir || ZERO);
  const pos = _hp.copy(e.group.position);
  const K = KINDS[e.kind] || KINDS.plain;
  const frozen = e.frozenUntil > t, soaked = e.soakedUntil > t || !!K.wet;
  let dmg = m.damage ?? (key === 'terra' ? 2 : 1);
  if (K.weak === key && !m.noBurn) dmg += 1;         // the thing it cannot stand
  let note = null, shatter = false;

  if (frozen && key === 'terra') { dmg = 9; shatter = true; note = 'shatter'; }
  else if (key === 'aero' && e.airborne) { dmg = 9; note = 'air finish'; }
  else if (m.volt && (soaked || e.metalUntil > t)) { dmg = 9; note = 'conduct'; }
  if (m.form === 'sand') { e.blindUntil = t + 3; note = note || 'blinded'; }
  if (m.form === 'metal') e.metalUntil = t + 8;      // steel in it: lightning will find it
  if (m.form === 'lava' && !frozen) e.burnAt = t + 1.5;
  if (e.exposedUntil > t && key !== 'lumen') { dmg += 1; e.exposedUntil = -1; note = note || 'exposed'; }
  const rooted = e.rootedUntil > t;
  if (rooted && key === 'pyro' && !m.noBurn) { dmg += 1; e.rootedUntil = -1; note = 'kindling'; }        // roots burn
  if (rooted && key === 'aqua' && !m.freeze) { e.rootedUntil = t + 8; note = note || 'overgrown'; }      // watered, they hold twice as long
  if (e.blindUntil > t && key === 'lumen' && !m.shadow) { dmg += 2; note = 'light in the dark'; }         // light on the blinded
  if (frozen && key === 'morph') { dmg = 9; shatter = true; note = 'shatter'; }                           // a fist breaks ice as well as a stone does
  if (key === 'flora') {
    if (m.spore) { e.blindUntil = t + 3; note = note || 'spores'; }
    else if (m.bleed) e.drainAt = t + 1.2;
    else if (!frozen) { e.rootedUntil = t + (soaked ? 8 : 4); e.vel.set(0, e.vel.y, 0); note = note || (soaked ? 'overgrown' : 'rooted'); }
    if (m.seed) e.seedAt = t + 2;                    // it sprouts inside what it hit
    if (e.burnAt > 0) { dmg += 1; note = 'fed the fire'; }
  }
  if (key === 'astra') {
    if (m.shadow) { e.blindUntil = t + 3; e.drainAt = t + 1.5; }
    else if (m.rain) e.soakedUntil = t + 6;
    else if (!frozen && !soaked) e.burnAt = t + 1.5;
    if (m.volt && (soaked || e.metalUntil > t)) { dmg = 9; note = 'conduct'; }
  }
  if ((key === 'morph' || key === 'necro') && m.venom) { e.drainAt = t + 1.2; e.venom = 1; note = note || 'poisoned'; }
  if (key === 'necro') {
    if (m.doom) { e.drainAt = t + 1.2; e.venom = 2; note = note || 'doomed'; }
    if (m.root && !frozen) { e.rootedUntil = t + m.root; e.vel.set(0, e.vel.y, 0); note = note || 'held by the dead'; }
    if (m.fear) { e.blindUntil = t + 4; note = note || 'terror'; }
  }
  if (key === 'umbra') {
    if (m.fear) { e.blindUntil = t + 5; _hd.copy(pos).sub(viewerPos).setY(0).normalize(); e.vel.x += _hd.x * 5; e.vel.z += _hd.z * 5; note = note || 'terror'; }
    else if (!m.hollow) { e.blindUntil = t + 4; e.drainAt = t + 1.5; }
    if (e.exposedUntil > t) { e.exposedUntil = -1; }
  }
  if (key === 'lumen') {
    if (m.shadow) { e.blindUntil = t + 4; e.drainAt = t + 1.5; note = note || 'lost in the dark'; }
    else { e.blindUntil = Math.max(e.blindUntil || -1, t + 1.5); e.exposedUntil = t + 8; }
  }
  if (key === 'gravis') {
    if (m.drop) e.dropAt = t + m.drop;
    if (e.airborne && (m.kind === 'ring' || m.crush)) { dmg = 9; note = 'brought down'; }
    else if (m.crush) { e.blindUntil = t + 3; e.vel.set(0, e.vel.y, 0); note = note || 'pinned'; }
  }

  if (key === 'pyro') {
    if (frozen) { e.frozenUntil = -1; e.soakedUntil = t + 4; note = note || 'thaw'; }
    else if (soaked && !m.volt) { e.soakedUntil = -1; note = 'steam'; spawnCloud('steam', pos.clone(), t, 5); }
    else if (!m.volt && !m.noBurn) e.burnAt = t + 1.5;
  } else if (key === 'aqua') {
    e.burnAt = -1;                                  // water puts fire out
    if (m.freeze) { e.frozenUntil = t + 6; e.vel.set(0, e.vel.y, 0); }
    else if (m.steam) { e.blindUntil = t + 2; note = note || 'scalded blind'; }
    else e.soakedUntil = t + 6;
  }
  if (!(e.frozenUntil > t)) {
    if (m.launch && !(K.heavy && K.scale > 1.5)) { e.airborne = true; e.vel.y = 2.2; }       // a slow toss (the heavy ones stay put): about a metre up, nearly two seconds of hang
    if (m.from) {                                   // vacuum: dragged toward whoever cast it
      _hd.copy(m.from).sub(pos).setY(0).normalize();
      e.vel.x += _hd.x * 3; e.vel.z += _hd.z * 3;
      e.drainAt = t + 1.5;
    } else if (!m.sonic && ((key === 'aero' && m.kind !== 'void') || m.kind === 'wall' || m.roll || m.push)) {   // shoved along the floor
      const push = m.push || (key === 'aero' ? 3.5 : 2.5);
      e.vel.x += _hd.x * push; e.vel.z += _hd.z * push;
    }
  }
  if (m.sonic) { e.blindUntil = t + 2.5; note = note || 'stunned'; }
  e.revealedUntil = Math.max(e.revealedUntil, t + 5);          // once you have hit it, you can keep track of it
  e.hp -= dmg;
  if (m.form === 'lightning' && !m.arc) {           // jumps to the nearest other creature
    let near = null, nearDist = 2.4;
    for (const o of echoes) { if (o === e || o.down) continue; const dd = o.group.position.distanceTo(pos); if (dd < nearDist) { nearDist = dd; near = o; } }
    if (near) { zap(pos.clone(), near.group.position.clone(), t); hit(near, 'pyro', t, near.group.position.clone().sub(pos).normalize(), { damage: 1, volt: true, arc: true }); _hp.copy(e.group.position); }
  }
  if (m.form === 'blast' && m.kind && m.kind !== 'bolt') explode(e.group.position.clone(), 'pyro', 0.7, t, 1, true);
  if (note) { hudNote = note; drawHud(); }
  if (e.hp > 0 && m.blood) puff('morph', pos, 20, 2.5, { up: 1 });
  if (e.hp <= 0 && key === 'necro') raiseThrall(pos.clone(), t);        // what Necro kills gets back up, on your side
  if (e.hp <= 0 && ((key === 'umbra' && m.hollow) || key === 'morph') && playerHP < 5) { playerHP++; hudNote = 'fed'; drawHud(); }   // the body, and the hollow dark, take back what they kill
  if (e.hp > 0) { e.flashT = t; tick(); puff(key, pos, 8, 1.6); return; }

  const centre = pos.clone(), away = _hd.clone();
  defeat(e, key, t, away);
  if (shatter) {                                    // the ice goes everywhere and cuts what is close
    puff('aqua', centre, 46, 3.6, { grav: 5, life: 0.8, size: 0.04 });
    for (const o of echoes) {
      if (o === e || !isLive(o, t) || o.group.position.distanceTo(centre) > 1.1) continue;
      hit(o, 'terra', t, o.group.position.clone().sub(centre).normalize(), { damage: 1 });
    }
  }
}

// ---------- creature behaviour ----------
// They drift around the room out of sight, and every few seconds one of them stops, swells, and spits a shard at you.
// The shard is a real object: block it with a wall, knock it away, blow it back, or catch it and return it.
const CREATURE = { speed: 0.7, firstAttack: 7, attackEvery: 4.2, windup: 0.9, shotSpeed: 3.2, sight: 11, maxShots: 2 };
const AI = { on: true, attacks: true, kinds: true };   // attacks off = calm mode; kinds off = every creature the same
const HOSTILE = new THREE.Color(0xff2bd6);
const MAX_HP = 5;
let playerHP = MAX_HP, hurtT = -9, nextAttackAt = 0;

function pickGoal(e, t) {
  const box = roomBounds();
  const p = new THREE.Vector3();
  e.goal.copy(e.home);
  for (let i = 0; i < 8; i++) {
    const alt = (KINDS[e.kind] || KINDS.plain).alt;
    p.set(THREE.MathUtils.lerp(box.min.x, box.max.x, Math.random()), alt ? Math.min(alt + Math.random() * 0.25, box.max.y - 0.3) : THREE.MathUtils.lerp(0.5, 1.7, Math.random()), THREE.MathUtils.lerp(box.min.z, box.max.z, Math.random()));
    if (isOpen(p, 0.25, e.home)) { e.goal.copy(p); break; }      // only somewhere it can fly to in a straight line
  }
  e.goalUntil = t + 3 + Math.random() * 4;
}
const _cdir = new THREE.Vector3(), _cprobe = new THREE.Vector3();
function creatureAI(e, t, dt, eye) {
  if (e.frozenUntil > t || e.airborne || e.puppet || e.blindUntil > t) { e.windup = -1; return; }
  const held_ = e.rootedUntil > t;                  // rooted: it can still spit, but it is not going anywhere
  if (e.windup > 0) {                              // winding up: holds still, pulls light into itself
    if (t >= e.windup) { e.windup = -1; spit(e, eye, t); }
    else {
      _cdir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.3);
      _cprobe.copy(e.home).add(_cdir);
      particles.emit(_cprobe, _cdir.multiplyScalar(-3), HOSTILE, 0.02, 0.1, 0, 0);
    }
    return;
  }
  if (held_) return;
  if (t > e.goalUntil || e.home.distanceTo(e.goal) < 0.08) pickGoal(e, t);
  _cdir.copy(e.goal).sub(e.home);
  const dist = _cdir.length();
  if (dist < 1e-3) return;
  _cdir.divideScalar(dist);
  const move = Math.min((KINDS[e.kind] || KINDS.plain).speed * dt, dist);
  if (collide(e.home, _cprobe.copy(e.home).addScaledVector(_cdir, move + 0.2))) { e.goalUntil = 0; return; }   // something new in the way
  e.home.addScaledVector(_cdir, move);
  e.restY = e.home.y;
}
function spit(e, eye, t) {
  const dir = eye.clone().sub(e.home).normalize();
  const o = spawnObject('shard', e.home.clone().addScaledVector(dir, 0.3));
  o.hostile = true; o.owner = e; o.born = t;
  const K = KINDS[e.kind] || KINDS.plain;
  o.heavy = !!K.heavy;
  o.vel.copy(dir).multiplyScalar(K.shot * (1 + 0.05 * (wave - 1)));
  tone(700, 240, 0.25, 0.14, 'sawtooth');
}
// Each frame: choose who attacks next.
function directAttacks(t, eye) {
  if (!AI.on || !AI.attacks || t < nextAttackAt) return;
  if (objects.filter(o => o.hostile && !o.dead).length >= (wave >= 4 ? 3 : CREATURE.maxShots)) return;
  const able = echoes.filter(e => !e.down && e.windup < 0 && !(e.frozenUntil > t) && !(e.blindUntil > t) && !e.airborne && !e.puppet
    && e.home.distanceTo(eye) < CREATURE.sight && lineOfSight(e.home, eye));
  nextAttackAt = t + Math.max(CREATURE.attackEvery - 0.3 * (wave - 1), 2) * (0.7 + Math.random() * 0.6);
  if (!able.length) return;
  const e = able[(Math.random() * able.length) | 0];
  e.windup = t + CREATURE.windup;
  reveal(e, t, 3, HOSTILE);                         // attacking gives its position away
}
function playerHurt(t) {
  if (t - hurtT < 0.6) return;
  if (guard.on || t < armourUntil) { hurtT = t; play(SFX.guardHit); hudNote = guard.on ? 'guarded' : 'armour held'; drawHud(); return; }
  hurtT = t;
  playerHP--;
  tone(110, 50, 0.4, 0.5, 'square');
  hudNote = playerHP > 0 ? 'you were hit' : 'down. new round';
  if (playerHP <= 0) respawnAt = t + 1.8;
  drawHud();
}
// A red flash around your head when something lands.
const hurtShell = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 14), new THREE.MeshBasicMaterial({
  color: 0xff1a2a, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
hurtShell.renderOrder = 30;
scene.add(hurtShell);

const _step = new THREE.Vector3(), _next = new THREE.Vector3();
function moveEcho(e, t, dt) {
  if (e.airborne) {                                 // tossed: rise, hang, come back down to where it floats
    e.vel.y -= 2.4 * dt;
    e.home.y += e.vel.y * dt;
    if (e.vel.y < 0 && e.home.y <= e.restY) { e.home.y = e.restY; e.vel.y = 0; e.airborne = false; }
  }
  if (e.vel.x || e.vel.z) {                         // shoved: slide until the room or drag stops it
    _step.set(e.vel.x * dt, 0, e.vel.z * dt);
    _next.copy(e.home).add(_step).addScaledVector(_step.normalize(), 0.1);
    if (collide(e.home, _next)) {
      const fast = Math.hypot(e.vel.x, e.vel.z) > 2.5;
      e.vel.x = e.vel.z = 0;
      if (fast) { hudNote = 'wall slam'; hit(e, 'terra', t, ZERO, { damage: 1 }); }    // thrown into the room itself
    }
    else {
      e.home.x += e.vel.x * dt; e.home.z += e.vel.z * dt;
      const k = Math.max(1 - 4 * dt, 0);
      e.vel.x *= k; e.vel.z *= k;
      if (Math.abs(e.vel.x) + Math.abs(e.vel.z) < 0.05) e.vel.x = e.vel.z = 0;
    }
  }
}

function updateEchoes(t, dt, viewerPos) {
  // Terra: reveal anything the shell of an active ripple is passing through. Walls do not stop it.
  for (const p of pulseUniforms.uPulses.value) {
    const age = t - p.w;
    if (age <= 0 || age >= PULSE_LIFE) continue;
    const r = age * PULSE_SPEED;
    for (const e of echoes) {
      if (e.down) continue;
      const d = Math.hypot(e.home.x - p.x, e.home.y - p.y, e.home.z - p.z);
      if (Math.abs(d - r) < 0.22) reveal(e, t, REVEAL_TIME, ACID);
    }
  }
  for (const e of echoes) {
    if (e.downT >= 0) {                        // struck: burst in the attack's colour
      const k = Math.min((t - e.downT) / 0.45, 1);
      e.group.position.addScaledVector(e.push, dt * 3.5 * (1 - k));
      e.group.scale.setScalar(1 + 1.8 * k);
      for (const m of e.parts) m.material.opacity = 1 - k;
      e.shell.rotation.x += dt * 9;
      if (k >= 1) { e.downT = -1; e.group.visible = false; }
      continue;
    }
    if (e.down) continue;
    if (e.burnAt > 0 && t >= e.burnAt) { e.burnAt = -1; hit(e, 'pyro', t, UP, { damage: 1, noBurn: true }); if (e.down) continue; }
    if (e.drainAt > 0 && t >= e.drainAt) { e.drainAt = e.venom > 0 ? (e.venom--, t + 1.2) : -1; hit(e, 'aero', t, ZERO, { damage: 1, kind: 'void' }); if (e.down) continue; }
    if (e.dropAt > 0 && t >= e.dropAt) { e.dropAt = -1; thump(); puff('gravis', e.group.position, 20, 2.5, {}); hit(e, 'gravis', t, UP, { damage: 2, kind: 'void' }); if (e.down) continue; }
    if (e.seedAt > 0 && t >= e.seedAt) {             // the seed comes up: it and everything beside it are rooted
      e.seedAt = -1;
      const at = e.group.position.clone();
      puff('flora', at, 40, 2.4, { up: 1.5 });
      for (const o of echoes) if (!o.down && o.group.position.distanceTo(at) < 1.4) hit(o, 'flora', t, UP, { damage: 1 });
      if (e.down) continue;
    }
    if (e.rootedUntil > t && Math.random() < 0.3) puff('flora', e.group.position, 1, 0.4, { up: 0.5 });
    if (AI.on) creatureAI(e, t, dt, viewerPos);
    moveEcho(e, t, dt);
    e.moving = dt > 0 ? e.home.distanceTo(e.last) / dt : 0;
    e.last.copy(e.home);
    const frozen = e.frozenUntil > t, soaked = e.soakedUntil > t, burning = e.burnAt > 0;
    // A marked or airborne echo stays in view until the mark wears off.
    const markEnd = Math.max(e.frozenUntil, e.soakedUntil, e.burnAt, e.airborne ? t + 0.5 : -1);
    if (markEnd > t) e.revealedUntil = Math.max(e.revealedUntil, markEnd);
    const winding = e.windup > 0;
    const tint = winding ? HOSTILE : e.metalUntil > t && !frozen && !burning ? STEEL_TINT : frozen ? ICE : burning ? ELEMENTS.pyro.color : soaked ? ELEMENTS.aqua.color : e.baseColor;
    for (const m of e.parts) m.material.color.copy(tint);
    e.ice.visible = frozen;
    e.shell.scale.setScalar(e.hp < 2 ? 0.7 : 1);                // cracked down to its core
    e.core.scale.setScalar(t - e.flashT < 0.15 ? 2.2 : 1);
    if (e.group.visible) {
      if (burning && Math.random() < 0.7) puff('pyro', e.group.position, 1, 0.5, { up: 1.2, jitter: 0.08 });
      if (soaked && !frozen && Math.random() < 0.3) puff('aqua', e.group.position, 1, 0.25, { jitter: 0.1 });
    }
    const target = e.revealedUntil > t ? 1 : 0;
    e.level += (target - e.level) * Math.min(dt * 5, 1);
    const flicker = e.revealedUntil - t < 1 ? 0.6 + 0.4 * Math.sin(t * 22) : 1;
    const o = e.level * flicker;
    e.group.visible = o > 0.01;
    e.core.material.opacity = o;
    if (e.extraMat) { e.extraMat.opacity = o * 0.9; if (e.wings) { e.wings[0].rotation.z = 0.3 + 0.6 * Math.sin(t * 16); e.wings[1].rotation.z = -0.3 - 0.6 * Math.sin(t * 16); } if (e.spin) e.spin.rotation.y = t * 2; }
    e.shell.material.opacity = o * 0.8;
    e.halo.material.opacity = e.hp < 2 ? 0 : o * 0.5;                // the outer ring is its second life: chi reads it at a glance
    e.ice.material.opacity = 0.32 * o;
    e.group.position.copy(e.home);
    if (!frozen) {
      e.group.position.y += Math.sin(t * 1.6 + e.phase) * 0.03;
      e.shell.rotation.set(t * 0.7 + e.phase, t * 0.9, 0);
    }
    e.halo.lookAt(viewerPos);
    e.face.lookAt(viewerPos);
    e.body.material.opacity = o * 0.3;
    for (const eye of e.eyes) eye.material.opacity = o;
    e.group.scale.setScalar(winding ? 1 + 0.5 * (1 - (e.windup - t) / CREATURE.windup) : 1);
    let lead = e.group.position;                    // the tail: each bead chases the one in front of it
    e.tail.forEach((bead, i) => {
      bead.position.lerp(lead, Math.min(dt * (14 - i * 1.5), 1));
      bead.visible = e.group.visible && !frozen;
      bead.material.opacity = o * 0.5 * (1 - i / 6);
      lead = bead.position;
    });
  }
  directAttacks(t, viewerPos);
  hurtShell.position.copy(viewerPos);
  hurtShell.material.opacity = Math.max(0.55 * (1 - (t - hurtT) / 0.5), 0);
  if (respawnAt > 0 && t > respawnAt) {
    respawnAt = -1;
    if (playerHP <= 0) { wave = 1; scatterEchoes(); }           // down: start over
    else { wave++; scatterEchoes(true); }                         // cleared: next wave, same room
  }
}

// Revealed echo closest to a direction, within maxAngle radians. Null if none.
const _to = new THREE.Vector3();
function aimAssist(origin, dir, maxAngle, t) {
  let best = null, bestAngle = maxAngle;
  for (const e of echoes) {
    if (!isLive(e, t)) continue;
    const angle = _to.copy(e.group.position).sub(origin).angleTo(dir);
    if (angle < bestAngle) { bestAngle = angle; best = e; }
  }
  return best;
}

// Shortest distance from point p to the segment a-b.
const _ab = new THREE.Vector3(), _ap = new THREE.Vector3();
function segmentDistance(p, a, b) {
  _ab.subVectors(b, a); _ap.subVectors(p, a);
  const len2 = _ab.lengthSq();
  const k = len2 > 0 ? THREE.MathUtils.clamp(_ap.dot(_ab) / len2, 0, 1) : 0;
  return _ap.addScaledVector(_ab, -k).length();
}

function flat(v, fallback) {
  const out = new THREE.Vector3(v.x, 0, v.z);
  if (out.lengthSq() < 1e-4) out.copy(fallback || new THREE.Vector3(0, 0, -1));
  return out.normalize();
}

// ---------- visual kit: what each discipline is made of ----------
// Pyro, Aqua and Aero are flowing noise in their own colours. Terra is solid, faceted stone.
// A shared particle pool supplies embers, spray, dust and wind streaks.
const NOISE_GLSL = /* glsl */`
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { return 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.03) + 0.15 * vnoise(p * 4.01); }`;

const ENERGY = {
  // a: hot core colour, b: body colour, scale: noise frequency per axis, speed: how fast it flows,
  // cut/soft: how much of the surface is filled in (low cut = dense, high cut = wispy)
  pyro: { a: 0xfff0b8, b: 0xff5a0c, c: 0x7a0c02, scale: [9, 7, 9], speed: 2.6, cut: 0.38, soft: 0.26 },
  aqua: { a: 0xe6fbff, b: 0x1487ff, scale: [5, 4, 5],     speed: 1.6, cut: 0.2,  soft: 0.5 },
  aero: { a: 0xffffff, b: 0xbfeeff, scale: [16, 1.6, 16], speed: 4.5, cut: 0.56, soft: 0.16 },
  volt: { a: 0xffffff, b: 0x9fc0ff, c: 0x3a55d6, scale: [14, 14, 14], speed: 7, cut: 0.46, soft: 0.14 },
  lumen:  { a: 0xffffff, b: 0xffe9a0, c: 0xc98a1c, scale: [6, 6, 6], speed: 1.2, cut: 0.2, soft: 0.5 },
  gravis: { a: 0xe9dcff, b: 0x8a4dff, c: 0x1a0540, scale: [7, 7, 7], speed: 3.2, cut: 0.4, soft: 0.3 },
  flora:  { a: 0xe4ffb0, b: 0x4fae2a, c: 0x1d4a12, scale: [8, 3, 8], speed: 1.4, cut: 0.3, soft: 0.3 },
  astra:  { a: 0xffffff, b: 0x8fa8ff, c: 0x1a2a7a, scale: [12, 12, 12], speed: 2.2, cut: 0.42, soft: 0.2 },
  morph:  { a: 0xffe0d8, b: 0xd8485c, c: 0x4a0a18, scale: [6, 6, 6], speed: 2, cut: 0.3, soft: 0.35 },
  umbra:  { a: 0x000000, b: 0x0a0312, c: 0x3a1460, scale: [5, 5, 5], speed: 1.8, cut: 0.3, soft: 0.4 },      // black at the heart, a violet fringe; drawn dark, not glowing
  necro:  { a: 0xeafff4, b: 0x3fd69e, c: 0x06301f, scale: [9, 4, 9], speed: 1.0, cut: 0.36, soft: 0.3 },
};
// flow is the direction the pattern travels, in the mesh's own space. fadeY (0 to 1) thins it out toward the top of the mesh.
// Water: mostly clear. You see it by its edges, its highlights and the light moving inside it, not by a colour.
function waterMat(o = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: pulseUniforms.uTime,
      uScale: { value: new THREE.Vector3(...(o.scale || [5, 4, 5])) },
      uFlow: { value: new THREE.Vector3(...(o.flow || [0, 1, 0])).multiplyScalar(1.6) },
      uAmp: { value: o.amp ?? 0 }, uBody: { value: o.body ?? 0.14 }, uOpacity: { value: 1 },
    },
    transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      uniform float uTime, uAmp; uniform vec3 uScale, uFlow;
      varying vec3 vObj, vN, vV;
      ${NOISE_GLSL}
      void main() {
        vec3 p = position + normal * (fbm(position * 2.2 + vec3(0.0, uTime * 1.3, uTime * 0.7)) - 0.5) * uAmp * 2.0;   // a slow wobble
        vObj = position;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalMatrix * normal; vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uBody, uOpacity; uniform vec3 uScale, uFlow;
      varying vec3 vObj, vN, vV;
      ${NOISE_GLSL}
      void main() {
        vec3 q = vObj * uScale - uFlow * uTime;
        float f = fbm(q);
        vec3 n = normalize(vN + (vec3(fbm(q + 3.1), fbm(q + 7.7), f) - 0.5) * 0.9);      // the surface is never still
        vec3 v = normalize(vV);
        float ndv = abs(dot(n, v));
        float rim = pow(1.0 - ndv, 2.6);                                                    // edges bend the most light
        vec3 l = normalize(vec3(0.3, 0.9, 0.45));
        float glint = pow(max(dot(reflect(-l, n), v), 0.0), 60.0) + 0.5 * pow(max(dot(reflect(-l, -n), v), 0.0), 40.0);
        float caustic = smoothstep(0.6, 0.78, f) * 0.22;
        vec3 col = mix(vec3(0.70, 0.84, 0.86), vec3(0.96, 0.99, 1.0), clamp(rim + caustic, 0.0, 1.0)) + glint;
        float a = clamp(uBody + 0.7 * rim + caustic * 0.45 + glint, 0.0, 0.95) * uOpacity;
        gl_FragColor = vec4(col, a);
      }`,
  });
  mat.opacity = o.opacity ?? 1;
  mat.onBeforeRender = () => { mat.uniforms.uOpacity.value = mat.opacity; };
  return mat;
}
function energyMat(key, o = {}) {
  if (key === 'aqua') return waterMat({ flow: o.flow, scale: o.scale, opacity: o.opacity, body: 0.07 });
  const P = ENERGY[key];
  const dark = key === 'umbra';                    // shadow covers what is behind it instead of adding light to it
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: pulseUniforms.uTime,
      uA: { value: new THREE.Color(P.a) }, uB: { value: new THREE.Color(P.b) }, uC: { value: new THREE.Color(P.c ?? P.b) },
      uScale: { value: new THREE.Vector3(...(o.scale || P.scale)) },
      uFlow: { value: new THREE.Vector3(...(o.flow || [0, 1, 0])).multiplyScalar(P.speed) },
      uCut: { value: o.cut ?? P.cut }, uSoft: { value: P.soft },
      uFade: { value: o.fadeY === true ? 1 : (o.fadeY || 0) }, uOpacity: { value: 1 },
    },
    transparent: true, depthWrite: false, depthTest: false, blending: dark ? THREE.NormalBlending : THREE.AdditiveBlending, premultipliedAlpha: dark, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec3 vObj; varying vec2 vUv;
      void main() { vObj = position; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uCut, uSoft, uFade, uOpacity;
      uniform vec3 uA, uB, uC, uScale, uFlow;
      varying vec3 vObj; varying vec2 vUv;
      ${NOISE_GLSL}
      void main() {
        float n = fbm(vObj * uScale - uFlow * uTime);
        float lift = uFade * (0.3 - vUv.y * 0.75);
        float body = smoothstep(uCut, uCut + uSoft, n + lift);
        float core = smoothstep(uCut + uSoft * 0.6, uCut + uSoft * 1.8, n + lift);
        float a = body * uOpacity;
        vec3 col = mix(mix(uC, uB, smoothstep(0.0, 0.6, body)), uA, core);       // thin edges run to the cooler colour
        gl_FragColor = vec4(col * a, a);
      }`,
  });
  mat.opacity = o.opacity ?? 1;
  mat.onBeforeRender = () => { mat.uniforms.uOpacity.value = mat.opacity; };   // lets effects fade it like any other material
  return mat;
}

// Solid rock: opaque, flat shaded from the surface itself, with faint amber seams.
// pal swaps the rock colours for something else (wood, painted metal): { dark, light, seam, amt, grain }
function stoneMat(metal = false, pal = null) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMetal: { value: metal ? 1 : 0 },
      uDark: { value: new THREE.Color(pal ? pal.dark : 0x332b21) }, uLight: { value: new THREE.Color(pal ? pal.light : 0x8f7a5c) },
      uSeam: { value: new THREE.Color(pal ? pal.seam : 0xe09e29) }, uSeamAmt: { value: pal ? pal.amt : 0.55 }, uHeat: { value: 0 },
      uGrain: { value: new THREE.Vector3(...(pal ? pal.grain : [7, 7, 7])) },
    },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec3 vW; varying vec3 vObj;
      void main() { vObj = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      varying vec3 vW; varying vec3 vObj;
      uniform float uMetal, uSeamAmt, uHeat; uniform vec3 uDark, uLight, uSeam, uGrain;
      ${NOISE_GLSL}
      void main() {
        vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
        if (dot(n, cameraPosition - vW) < 0.0) n = -n;
        float light = 0.32 + 0.68 * max(dot(n, normalize(vec3(0.35, 1.0, 0.45))), 0.0);
        float grain = fbm(vObj * uGrain);
        vec3 g22 = vec3(0.4545);                       // uniforms arrive in linear light; this shader writes display values
        vec3 rock = mix(pow(uDark, g22), pow(uLight, g22), grain) * light;
        float seam = 1.0 - smoothstep(0.0, 0.035, abs(vnoise(vObj * 5.0) - 0.5));
        vec3 L = normalize(vec3(0.35, 1.0, 0.45)), V = normalize(cameraPosition - vW);
        float spec = pow(max(dot(reflect(-L, n), V), 0.0), 18.0) + 0.35 * pow(1.0 - max(dot(n, V), 0.0), 3.0);
        vec3 steel = vec3(0.42, 0.45, 0.5) * (0.35 + 0.65 * light) * (0.85 + 0.3 * grain) + vec3(0.95, 0.97, 1.0) * spec;
        vec3 cold = mix(mix(rock, pow(uSeam, g22), seam * uSeamAmt), steel, uMetal);
        // Heated: the cracks go first, then the whole face starts to glow. Lava is rock with this turned all the way up.
        float crack = 1.0 - smoothstep(0.0, 0.22, abs(vnoise(vObj * 4.0 + 9.0) - 0.5));
        vec3 glow = mix(vec3(0.95, 0.18, 0.02), vec3(1.0, 0.82, 0.3), crack) * (0.25 + 0.75 * crack);
        gl_FragColor = vec4(mix(cold, cold * 0.35 + glow, uHeat), 1.0);
      }`,
  });
}
// The material for anything Terra raises, in the form it was cast in.
// Ice: water that has stopped moving. Cloudy, hard edged, still lets light through.
function iceMat() { return waterMat({ flow: [0, 0, 0], scale: [10, 10, 10], amp: 0, body: 0.42 }); }
function earthMat(form) {
  const look = FORM_LOOK[form || 'rock'];
  const mat = stoneMat(!!look.metal, look.pal || null);
  if (look.heat) mat.uniforms.uHeat.value = look.heat;
  return mat;
}
// Knock a smooth primitive into a craggy one. Vertices that share a position move together, so it stays sealed.
function craggy(geo, amount) {
  const p = geo.attributes.position;
  const r = (x, y, z, k) => { const s = Math.sin(Math.round(x * 60) * 12.9898 * k + Math.round(y * 60) * 78.233 + Math.round(z * 60) * 37.719) * 43758.5453; return s - Math.floor(s) - 0.5; };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setXYZ(i, x + r(x, y, z, 1) * amount, y + r(x, y, z, 2.3) * amount * 0.6, z + r(x, y, z, 3.7) * amount);
  }
  p.needsUpdate = true;
  return geo;
}

// --- particles ---
// additive: glowing motes that add light. Otherwise: soft opaque puffs that sit in the air like smoke.
function makePool(P_MAX, additive) {
  const pos = new Float32Array(P_MAX * 3), vel = new Float32Array(P_MAX * 3), col = new Float32Array(P_MAX * 3);
  const size = new Float32Array(P_MAX), alpha = new Float32Array(P_MAX);
  const life = new Float32Array(P_MAX), span = new Float32Array(P_MAX), grav = new Float32Array(P_MAX), drag = new Float32Array(P_MAX);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uHalfH: { value: 400 } },
    transparent: true, depthWrite: false, depthTest: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: /* glsl */`
      attribute float aSize; attribute float aAlpha; attribute vec3 color;
      uniform float uHalfH; varying vec3 vCol; varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aAlpha > 0.0 ? aSize * projectionMatrix[1][1] * uHalfH / max(-mv.z, 0.05) : 0.0;
        vCol = color; vA = aAlpha;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = pow(smoothstep(0.5, 0.0, d), 1.6) * vA;
        gl_FragColor = ${additive ? 'vec4(vCol * a, a)' : 'vec4(vCol, a * 0.42)'};
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = additive ? 18 : 13;
  scene.add(points);
  let cursor = 0, liveCount = 0;
  return {
    material: mat,
    get live() { return liveCount; },
    // size in metres, life in seconds, gravity in m/s² (positive falls), drag per second
    emit(p, v, color, s, l, g = 0, d = 0) {
      const i = cursor; cursor = (cursor + 1) % P_MAX;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      vel[i * 3] = v.x; vel[i * 3 + 1] = v.y; vel[i * 3 + 2] = v.z;
      col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b;
      size[i] = s; life[i] = l; span[i] = l; grav[i] = g; drag[i] = d;
    },
    update(dt) {
      liveCount = 0;
      for (let i = 0; i < P_MAX; i++) {
        if (life[i] <= 0) { alpha[i] = 0; continue; }
        life[i] -= dt;
        const k = Math.max(1 - drag[i] * dt, 0);
        vel[i * 3] *= k; vel[i * 3 + 1] = vel[i * 3 + 1] * k - grav[i] * dt; vel[i * 3 + 2] *= k;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const f = Math.max(life[i] / span[i], 0);
        alpha[i] = additive ? Math.min(f * 2.2, 1) : Math.min(f * 2.2, (1 - f) * 6, 1);   // glow holds then fades; smoke also swells in
        if (!additive) size[i] += dt * 0.12;        // and spreads as it hangs
        liveCount++;
      }
      for (const name of ['position', 'color', 'aSize', 'aAlpha']) geo.attributes[name].needsUpdate = true;
    },
  };
}
const particles = makePool(2000, true);
const smoke = makePool(600, false);
const SMOKE = new THREE.Color(0x26221f), STEAM = new THREE.Color(0xe6ecee), DUST = new THREE.Color(0x9c8763), SAND = new THREE.Color(0xc9ad74);
const _fv = new THREE.Vector3(), _fp = new THREE.Vector3();
// How much loose matter to draw: 1 is everything. Drops when frames run long, climbs back when they do not.
let detail = 1, frameAvg = 0.012, detailCheck = 0;
function tuneDetail(t, dt) {
  frameAvg += (dt - frameAvg) * 0.05;
  if (t - detailCheck < 1) return;
  detailCheck = t;
  if (frameAvg > 0.0165) detail = Math.max(0.35, detail - 0.15);
  else if (frameAvg < 0.0145) detail = Math.min(1, detail + 0.05);
}
const thinned = (n) => { const k = n * detail; return Math.floor(k) + (Math.random() < k % 1 ? 1 : 0); };
// Soft puffs: smoke off a fire, dust off broken stone, steam, sand.
function fume(color, point, n, o = {}) {
  n = thinned(n);
  for (let i = 0; i < n; i++) {
    _fv.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(o.speed ?? 0.5);
    _fv.y += o.rise ?? 0.4;
    const j = o.jitter ?? 0.15;
    _fp.set(point.x + (Math.random() - 0.5) * j, point.y + (Math.random() - 0.5) * j, point.z + (Math.random() - 0.5) * j);
    smoke.emit(_fp, _fv, color, (o.size ?? 0.22) * (0.7 + Math.random() * 0.6), (o.life ?? 1.4) * (0.7 + Math.random() * 0.6), o.grav ?? 0, o.drag ?? 1.2);
  }
}

const PCOL = {
  pyro: [0xffe08a, 0xff8a1f, 0xff3b0a].map(c => new THREE.Color(c)),
  aqua: [0xf4fcff, 0xcfe7ec, 0x9cc6cf].map(c => new THREE.Color(c)),      // clear water catches light; it is not blue paint
  terra: [0xcdb78c, 0x8a7655, 0xe0b64a].map(c => new THREE.Color(c)),
  aero: [0xffffff, 0xdff9ff, 0xbfeeff].map(c => new THREE.Color(c)),
  lumen: [0xffffff, 0xfff1b0, 0xffd76a].map(c => new THREE.Color(c)),
  gravis: [0xe9dcff, 0xb48cff, 0x6a2cff].map(c => new THREE.Color(c)),
  flora: [0xe4ffb0, 0x7fd65a, 0x3d8a22].map(c => new THREE.Color(c)),
  astra: [0xffffff, 0xc9d6ff, 0x7f9cff].map(c => new THREE.Color(c)),
  morph: [0xffd0c8, 0xff7a8a, 0xb02a44].map(c => new THREE.Color(c)),
  umbra: [0xd9a8ff, 0x9a3cff, 0x4a0a8a].map(c => new THREE.Color(c)),
  necro: [0xeafff4, 0x6cf0c2, 0x1f8a60].map(c => new THREE.Color(c)),
};
// How each discipline's loose matter behaves once it is in the air.
PCOL.volt = [0xffffff, 0xcfe0ff, 0x7f9cff].map(c => new THREE.Color(c));
const PSTYLE = {
  volt:  { size: 0.022, life: 0.22, grav: 0,    drag: 2 },     // sparks
  pyro:  { size: 0.035, life: 0.5,  grav: -1.6, drag: 1.5 },   // embers rise
  aqua:  { size: 0.028, life: 0.6,  grav: 6,    drag: 0.4 },   // droplets fall
  terra: { size: 0.04,  life: 0.7,  grav: 7,    drag: 0.8 },   // chips drop fast
  aero:  { size: 0.018, life: 0.28, grav: 0,    drag: 3 },     // streaks vanish
  lumen: { size: 0.02,  life: 0.4,  grav: 0,    drag: 2.5 },   // motes hang
  gravis: { size: 0.026, life: 0.6, grav: 9,    drag: 0.2 },   // everything falls hard
  flora: { size: 0.03,  life: 0.9,  grav: 1.5,  drag: 2 },     // leaves drift down
  astra: { size: 0.02,  life: 0.5,  grav: 3,    drag: 0.5 },   // sparks fall
  morph: { size: 0.03,  life: 0.35, grav: 5,    drag: 1 },
  umbra: { size: 0.034, life: 0.7,  grav: -0.6, drag: 2 },     // smoke lifts
  necro: { size: 0.026, life: 0.9,  grav: -0.3, drag: 3 },     // wisps hang and rise
};
const _pv = new THREE.Vector3(), _pp = new THREE.Vector3();
// n particles from a point. dir + spread aims them; without dir they go every way.
const SHADOW = new THREE.Color(0x040108);
function puff(key, point, n, speed, o = {}) {
  if (key === 'umbra') { fume(SHADOW, point, Math.max(1, Math.round(thinned(n) / 3)), { size: 0.1 + speed * 0.02, life: 0.8, jitter: 0.06 + speed * 0.03, rise: 0.12 }); return; }
  const S = PSTYLE[key], C = PCOL[key];
  n = thinned(n);
  for (let i = 0; i < n; i++) {
    _pv.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    if (o.dir) _pv.multiplyScalar(o.spread ?? 0.5).add(o.dir).normalize();
    _pv.multiplyScalar(speed * (0.35 + Math.random() * 0.65));
    if (o.up) _pv.y = Math.abs(_pv.y) + o.up * Math.random();
    _pp.copy(point);
    if (o.jitter) _pp.x += (Math.random() - 0.5) * o.jitter, _pp.y += (Math.random() - 0.5) * o.jitter, _pp.z += (Math.random() - 0.5) * o.jitter;
    particles.emit(_pp, _pv, C[(Math.random() * C.length) | 0], (o.size || S.size) * (0.6 + Math.random() * 0.8),
      (o.life || S.life) * (0.6 + Math.random() * 0.8), o.grav ?? S.grav, o.drag ?? S.drag);
  }
}

// ---------- effects ----------
const fxGroup = new THREE.Group();
scene.add(fxGroup);
const effects = [];   // each: { update(t, dt) -> false when finished, dispose() }

function addEffect(objects, update) {
  for (const o of objects) { o.renderOrder = 15; fxGroup.add(o); }
  effects.push({
    update,
    dispose() {
      for (const o of objects) {
        fxGroup.remove(o);
        o.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
      }
    },
  });
}
function updateEffects(t, dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    if (effects[i].update(t, dt) === false) { effects[i].dispose(); effects.splice(i, 1); }
  }
}

// A flash and a spray of the discipline's own matter where something hits the room.
function impact(point, normal, key, t, size = 0.22) {
  const color = ELEMENTS[key].color;
  puff(key, point, key === 'terra' ? 22 : 16, key === 'aero' ? 3 : 2.2, { dir: normal, spread: 0.9 });
  if (key === 'terra') fume(DUST, point, 4, { size: 0.28, rise: 0.3 });
  if (key === 'pyro') fume(SMOKE, point, 3, { size: 0.26, rise: 0.8 });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 28), glowMat(color, 0.9));
  ring.position.copy(point).addScaledVector(normal, 0.01);
  ring.lookAt(ring.position.clone().add(normal));
  addEffect([ring], (n) => {
    const k = (n - t) / 0.28;
    ring.scale.setScalar(0.04 + size * k);
    ring.material.opacity = 0.9 * (1 - k);
    return k < 1;
  });
  thud();
}

// --- bolt: anything that flies. Stops at the room unless it has bounces left. ---
function boltMesh(key, m, color) {
  const g = new THREE.Group();
  const size = m.size;
  if (m.shape === 'crescent') {
    // A curved blade of the element itself, bow leading, pattern streaming off the back edge.
    const s = size || 0.16;
    const blade = () => new THREE.RingGeometry(s * 0.66, s, 40, 3, Math.PI + 0.35, Math.PI - 0.7).rotateX(-Math.PI / 2).translate(0, 0, -s * 0.55);
    const matOpts = { flow: [0, 0, -1.4], scale: key === 'aero' ? [9, 9, 9] : [11, 11, 11], cut: key === 'aero' ? 0.4 : key === 'aqua' ? 0.12 : 0.28 };
    for (const tilt of [-0.4, 0.4]) {             // two crossed leaves, so it never goes edge-on and vanishes
      const leaf = new THREE.Mesh(blade(), energyMat(lookOf(key, m), matOpts));
      leaf.rotation.z = tilt;
      g.add(leaf);
    }
    const edge = new THREE.Mesh(new THREE.TorusGeometry(s, Math.max(s * 0.035, 0.007), 6, 40, Math.PI - 0.7), glowMat(color, 0.9));
    edge.geometry.rotateZ(0.35).rotateX(Math.PI / 2).translate(0, 0, -s * 0.55);   // the bright leading rim
    g.add(edge);
  } else if (m.shape === 'rock') {
    const s = size || 0.075;
    g.add(new THREE.Mesh(craggy(new THREE.IcosahedronGeometry(s, 1), s * 0.45), earthMat(m.form)));
  } else if (m.shape === 'shard') {
    // Ice: a long hard splinter with a cold glow around it.
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0).scale(1, 1, 5.5), glowMat(ICE, 0.95));
    const frost = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0).scale(1, 1, 4.2), glowMat(ELEMENTS.aqua.color, 0.3));
    g.add(shard, frost);
  } else if (m.shape === 'disc') {
    // Metal pulled out of the ground: a toothed steel disc that keeps its edge off every wall.
    const disc = new THREE.Mesh(craggy(new THREE.CylinderGeometry(0.12, 0.12, 0.022, 10, 1), 0.03), stoneMat(true));
    disc.name = 'spin';
    g.add(disc);
  } else if (m.shape === 'blob') {
    // A fistful of water holding together in the air, pulled long by its own speed.
    const s = size || 0.085;
    const blob = new THREE.Mesh(new THREE.SphereGeometry(s, 24, 18), waterMat({ flow: [0, 0, -1.2], scale: [9, 9, 9], amp: s * 0.5, body: 0.08 }));
    blob.geometry.scale(1, 1, 1.5);
    g.add(blob);
  } else if (m.shape === 'bone') {
    g.add(new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.28, 4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xeafff4 })));
  } else if (m.shape === 'fist') {
    const bone = new THREE.Mesh(craggy(new THREE.BoxGeometry(0.2, 0.18, 0.24, 2, 2, 2), 0.025), new THREE.MeshBasicMaterial({ color: 0xead2c4 }));
    const flesh = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), energyMat('morph', { scale: [8, 8, 8], cut: 0.35 }));
    g.add(bone, flesh);
  } else if (m.shape === 'needle') {
    g.add(new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.3, 6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xc8102a })));
  } else if (m.shape === 'vortex') {
    // A ball of spinning air: three bands of wind turning inside each other.
    for (let i = 0; i < 3; i++) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 10, 40), energyMat('aero', { flow: [1.4, 0, 0], scale: [5, 12, 5], cut: 0.36 }));
      band.rotation.set(i * 1.05, i * 0.7, 0);
      band.userData.spin = (i % 2 ? -1 : 1) * (9 + i * 3);
      g.add(band);
    }
  } else if (m.shape === 'jet') {
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.075, 1.3, 16, 8, true), energyMat(lookOf(key, m), { flow: [0, 0, -2.5], scale: [12, 12, 3], cut: 0.1 }));
    jet.geometry.rotateX(Math.PI / 2).translate(0, 0, -0.6);
    g.add(jet, new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), glowMat(new THREE.Color(ENERGY.aqua.a), 0.9)));
  } else if (key === 'lumen') {
    // Light: a hard white point with rays, no flame, no tail.
    const s = (size || 0.04) * 2.4;
    g.add(new THREE.Mesh(new THREE.OctahedronGeometry(s * 0.35), new THREE.MeshBasicMaterial({ color: 0xffffff })));
    for (const r of [[1, 0, 0], [0, 1, 0], [0.7, 0.7, 0], [0.7, -0.7, 0]]) {
      const ray = new THREE.Mesh(new THREE.BoxGeometry(s * 2.6, s * 0.06, s * 0.06), glowMat(new THREE.Color(0xfff1b0), 0.85));
      ray.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(...r).normalize());
      g.add(ray);
    }
    const streak = new THREE.Mesh(new THREE.BoxGeometry(s * 0.08, s * 0.08, s * 5).translate(0, 0, -s * 2.5), glowMat(new THREE.Color(0xffffff), 0.7));
    g.add(streak);
  } else if (key === 'astra') {
    // A comet: a small bright head and a long cold tail.
    const s = size || 0.05;
    g.add(new THREE.Mesh(new THREE.SphereGeometry(s * 0.7, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff })));
    const tail = new THREE.Mesh(new THREE.ConeGeometry(s * 1.1, s * 18, 12, 8, true), energyMat('astra', { flow: [0, 0, -3], scale: [20, 20, 3], cut: 0.3 }));
    tail.geometry.rotateX(-Math.PI / 2).translate(0, 0, -s * 9);
    g.add(tail);
  } else if (key === 'flora') {
    if (m.seed || m.entangle) {                     // a seed pod: brown, ridged, turning over as it flies
      const pod = new THREE.Mesh(new THREE.SphereGeometry(size || 0.05, 8, 6).scale(0.8, 0.8, 1.4), new THREE.MeshBasicMaterial({ color: 0x7a5230 }));
      const sprout = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.06, 5).rotateX(-Math.PI / 2).translate(0, 0, -(size || 0.05) * 1.6), new THREE.MeshBasicMaterial({ color: 0x7fd65a }));
      g.add(pod, sprout);
    } else {                                        // a thorn with two leaves for fletching
      g.add(new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.2, 5).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2f6e1a })));
      for (const side of [1, -1]) g.add(new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 3).scale(1, 1, 0.15).rotateZ(side * 1.1).translate(side * 0.03, 0, -0.08), new THREE.MeshBasicMaterial({ color: 0x7fd65a, side: THREE.DoubleSide })));
    }
  } else if (key === 'gravis') {
    // A black marble with a ring of light being pulled round it.
    const s = (size || 0.06) * 1.2;
    g.add(new THREE.Mesh(new THREE.SphereGeometry(s, 16, 12), new THREE.MeshBasicMaterial({ color: 0x05020c })));
    const disc = new THREE.Mesh(new THREE.TorusGeometry(s * 1.9, s * 0.16, 6, 40).scale(1, 1, 0.3), glowMat(new THREE.Color(0xb48cff), 0.9));
    disc.rotation.x = 1.2; disc.userData.spin = 9;
    const disc2 = new THREE.Mesh(new THREE.TorusGeometry(s * 2.6, s * 0.07, 6, 40).scale(1, 1, 0.3), glowMat(new THREE.Color(0xe9dcff), 0.6));
    disc2.rotation.x = 1.2; disc2.userData.spin = -5;
    g.add(disc, disc2);
  } else if (key === 'umbra') {
    // Not a thing so much as a patch of dark with a ragged edge.
    const s = size || 0.06;
    g.add(new THREE.Mesh(new THREE.SphereGeometry(s, 14, 10), new THREE.MeshBasicMaterial({ color: 0x000000, depthTest: false })));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(s * 2, 18, 14), energyMat('umbra', { scale: [10, 10, 10], flow: [0, 0, -1.5], cut: 0.36 })));
  } else if (key === 'aero') {
    // Air is mostly seen by what it drags along: a hard little core and a thin wake.
    const s = size || 0.03;
    g.add(new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), glowMat(color, 0.9)));
    const wake = new THREE.Mesh(new THREE.ConeGeometry(s * 2.2, 0.7, 14, 4, true), energyMat(lookOf(key, m), { flow: [0, 0, -3], scale: [30, 30, 3], opacity: 0.7 }));
    wake.geometry.rotateX(-Math.PI / 2).translate(0, 0, -0.38);
    g.add(wake);
  } else {
    // Fire: a white-hot core inside a ragged shell of flame, with a tail that tears off behind it.
    const s = size || 0.055;
    g.add(new THREE.Mesh(new THREE.SphereGeometry(s * 0.55, 12, 10), glowMat(new THREE.Color(ENERGY.pyro.a), 1)));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(s * 1.5, 18, 14), energyMat(lookOf(key, m), { flow: [0, 0, -1.2], scale: [16, 16, 12] })));
    const tail = new THREE.Mesh(new THREE.ConeGeometry(s * 1.4, s * 9, 14, 6, true), energyMat(lookOf(key, m), { flow: [0, 0, -2.2], scale: [14, 14, 6], cut: 0.44 }));
    tail.geometry.rotateX(-Math.PI / 2).translate(0, 0, -s * 5);   // narrows behind +Z travel
    g.add(tail);
  }
  return g;
}
// What a moving bolt leaves behind it each frame.
const _trail = new THREE.Vector3(), _side = new THREE.Vector3(), _back = new THREE.Vector3();
const _sw = new THREE.Vector3(), _su = new THREE.Vector3();
function boltTrail(key, m, pos, dirN, dt) {
  if (key === 'aero') {                             // two streaks winding round the line of travel
    const ang = pulseUniforms.uTime.value * 34, r = m.shape === 'crescent' ? 0.2 : m.shape === 'vortex' ? 0.3 : 0.07;
    _side.set(-dirN.z, 0, dirN.x).normalize(); _su.crossVectors(dirN, _side);
    for (const ph of [0, Math.PI]) {
      _sw.copy(_side).multiplyScalar(Math.cos(ang + ph)).addScaledVector(_su, Math.sin(ang + ph));
      _trail.copy(pos).addScaledVector(_sw, r);
      particles.emit(_trail, _sw.multiplyScalar(0.5).addScaledVector(dirN, -1.2), PCOL.aero[ph ? 0 : 2], 0.016, 0.22, 0, 2);
    }
  }
  const wide = m.shape === 'crescent' ? (m.size || 0.16) : m.roll ? 0.18 : 0.02;
  const rate = m.shape === 'disc' ? 0 : m.shape === 'shard' ? 40 : ({ pyro: 110, volt: 90, aqua: 80, terra: m.roll ? 60 : 30, aero: 70 }[key] || 70);
  let n = rate * dt; n = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
  _side.set(-dirN.z, 0, dirN.x);
  for (let i = 0; i < n; i++) {
    _trail.copy(pos).addScaledVector(_side, (Math.random() * 2 - 1) * wide);
    if (m.roll) _trail.y = 0.03;
    puff(key, _trail, 1, key === 'aero' ? 1.2 : 0.5, { dir: _back.copy(dirN).negate(), spread: key === 'volt' ? 2 : 0.8, jitter: 0.03 });
  }
}
function castBolt(key, m, c) {
  const color = ELEMENTS[key].color;
  const vel = c.dir.clone().normalize();
  const pos = c.hand.clone();
  if (m.roll) {                                   // rolls along the floor from in front of you
    vel.copy(flat(vel, c.fwd));
    pos.copy(c.eye).addScaledVector(vel, 0.6).setY(m.size || 0.2);
  } else if (!m.homing) {
    const target = aimAssist(pos, vel, 0.3, c.t);
    if (target) vel.copy(target.group.position).sub(pos).normalize();
  }
  vel.multiplyScalar(m.speed);
  const vk = lookOf(key, m);
  const mesh = boltMesh(vk, m, color);
  mesh.scale.setScalar((m.power || 1) * (c.scale || 1));
  mesh.position.copy(pos);
  puff(key, pos, 10, 1.6, { dir: vel.clone().normalize(), spread: 0.7 });      // muzzle
  const prev = pos.clone();
  const dirN = new THREE.Vector3();
  const look = new THREE.Vector3();
  const struck = new Set(), knocked = new Set();
  const stop = (point, t) => {
    if (m.blast) explode(point, key, m.blast, t, 1, !!m.noBurn);
    if (m.form === 'sand') spawnCloud('sand', point.clone().setY(Math.max(point.y, 0.5)), t, 4);
    if (m.form === 'steam') spawnCloud('steam', point.clone().setY(Math.max(point.y, 0.5)), t, 4);
    if (m.splash) splash(point, t, m.splash);
    if (m.implode) implode(point, m.implode, t, m.damage || 1, key);
    if (m.boomerang) castBolt(key, { ...m, boomerang: false, life: 1.2 }, { ...c, t, hand: point.clone(), dir: c.eye.clone().setY(c.eye.y - 0.3).sub(point).normalize(), scale: 1 });
    if (m.turret) { plantTurret(point, stopNormal || UP, t); }
    if (m.summon) raiseThrall(point.clone().setY(point.y + 0.4), t);
    stopNormal = null;
    if (m.entangle) for (const e of echoes) if (isLive(e, t) && e.group.position.distanceTo(point) < m.entangle) hit(e, 'flora', t, UP, { damage: 1 });
    if (key === 'aqua') quench(point, m.freeze ? 1.2 : 0.8, t);
    if (m.quake) quake(point, t, m.quake);
    if (m.form === 'lava') heatAt(point, 0.6, t);
    return false;
  };
  let bounces = m.bounces || 0;
  const born = c.t, life = m.life || 2.6;
  addEffect([mesh], (t, dt) => {
    if (m.homing) {                               // bend toward the nearest revealed echo ahead
      dirN.copy(vel).normalize();
      let near = null, nearDist = Infinity;
      for (const e of echoes) {
        if (!isLive(e, t) || struck.has(e)) continue;
        _to.copy(e.group.position).sub(mesh.position);
        const dist = _to.length();
        if (dist < nearDist && _to.angleTo(dirN) < 1.3) { nearDist = dist; near = e; }
      }
      if (near) {
        _to.copy(near.group.position).sub(mesh.position).normalize();
        dirN.lerp(_to, Math.min(dt * m.homing, 1)).normalize();
        vel.copy(dirN).multiplyScalar(m.speed);
      }
    }
    if (m.gravity) vel.y -= m.gravity * dt;
    prev.copy(mesh.position);
    mesh.position.addScaledVector(vel, dt);

    const wall = m.sonic ? null : collide(prev, mesh.position);          // sound goes through walls
    let end = null;                               // where this step's travel stops, if it hits the room
    if (wall && wall.object.userData.barrier && !c.hostile) {
      wall.object.userData.barrier.struck(dirN.copy(vel).normalize(), key, t);
      impact(wall.point, wall.normal, key, t, 0.3);
      stopNormal = wall.normal.clone(); return stop(wall.point.clone(), t);
    }
    if (wall) {
      end = wall.point;
      if (bounces > 0) {
        bounces--;
        vel.reflect(wall.normal);
        mesh.position.copy(wall.point).addScaledVector(wall.normal, 0.03);
        impact(wall.point, wall.normal, key, t, 0.14);
        end = null;
      }
    }
    for (const e of echoes) {
      if (!isLive(e, t) || struck.has(e)) continue;
      if (segmentDistance(e.group.position, prev, end || mesh.position) < m.radius) {
        struck.add(e);
        hit(e, key, t, dirN.copy(vel).normalize(), m);
        if (!m.pierce) return stop(e.group.position.clone(), t);
      }
    }
    if (m.freeze || key === 'pyro' || m.form === 'lava') {   // standing water in the path changes state
      for (const src of [...sources]) {
        if (segmentDistance(src.pos, prev, end || mesh.position) > 0.45) continue;
        if (m.freeze) freezeSource(src, t); else evaporate(src, t);
        return stop(src.pos.clone(), t);
      }
    }
    for (const o of objects) {                      // loose objects get knocked, lit, or broken
      if (o.dead || o.held || knocked.has(o) || o.def.cloud) continue;
      if (segmentDistance(o.pos, prev, end || mesh.position) > o.def.r + 0.06) continue;
      knocked.add(o);
      dirN.copy(vel).normalize();
      const push = Math.min(m.speed * 0.6, 7);
      kick(o, dirN.x * push, 1.2, dirN.z * push);
      if (key === 'pyro' || m.form === 'lava') ignite(o, t);
      if (m.freeze && o.def.water) {                // a barrel frozen solid splits into blocks of ice
        o.dead = true; puff('aqua', o.pos, 30, 2, {});
        for (let k = 0; k < 3; k++) spawnObject('ice', o.pos.clone().add(new THREE.Vector3((k - 1) * 0.25, 0.1, 0)));
        hudNote = 'water to ice'; drawHud();
      }
      if ((m.shape === 'rock' || m.shape === 'disc') && (o.def.burns || o.def.water)) destroyObject(o, t);
      if (!m.pierce) { impact(o.pos, dirN.clone().negate(), key, t, 0.25); return stop(o.pos.clone(), t); }
    }
    if (end) { impact(wall.point, wall.normal, key, t, m.shape === 'rock' ? 0.4 : 0.25); stopNormal = wall.normal.clone(); return stop(wall.point.clone(), t); }

    dirN.copy(vel).normalize();
    mesh.lookAt(look.copy(mesh.position).add(dirN));
    if (m.shape === 'rock') mesh.rotateX(m.roll ? (t - born) * m.speed / (m.size || 0.2) : t * 9);   // a boulder turns as far as it travels
    if (m.shape === 'disc') mesh.children[0].rotation.y = t * 40;
    if (m.shape === 'vortex') for (const band of mesh.children) band.rotation.z += dt * band.userData.spin;
    if (key === 'gravis') for (const ch of mesh.children) if (ch.userData.spin) ch.rotation.z += dt * ch.userData.spin;
    if (key === 'flora' && m.seed) mesh.children[0].rotation.x += dt * 9;
    boltTrail(vk, m, mesh.position, dirN, dt);
    if (m.form === 'steam' && Math.random() < 0.4) fume(STEAM, mesh.position, 1, { size: 0.16, life: 0.6, rise: 0.2 });
    if (key === 'pyro') lightNow(mesh.position, FIRE_LIGHT, m.blast ? 1.8 : 1.0);
    else if (m.form === 'lava') lightNow(mesh.position, LAVA_LIGHT, 0.8);
    const age = t - born;
    const fade = Math.min(1, (life - age) / 0.3);
    mesh.traverse(o => { if (o.material) o.material.opacity = Math.min(o.material.opacity, Math.max(fade, 0)); });
    return age < life;
  });
}

// --- cone: instant, hits every revealed echo inside it that you have a clear line to. ---
function castCone(key, m, c) {
  const color = ELEMENTS[key].color;
  const d = c.dir.clone().normalize();
  const origin = c.hand.clone();
  coneFlourish(key, m, origin, d, c.t);
  for (const e of echoes) {
    if (!isLive(e, c.t)) continue;
    _to.copy(e.group.position).sub(origin);
    if (_to.length() < m.range && _to.angleTo(d) < m.angle && (m.sonic || lineOfSight(origin, e.group.position))) hit(e, key, c.t, d, m);
  }
  if (key === 'pyro') {
    for (const src of [...sources]) { _to.copy(src.pos).sub(origin); if (_to.length() < m.range && _to.angleTo(d) < m.angle + 0.15) evaporate(src, c.t); }
  }
  for (const b of [...barriers]) {                // a shove sends a standing wall on its way
    _to.copy(b.collider.position).setY(origin.y).sub(origin);
    if (_to.length() < 2.6 && _to.angleTo(d) < m.angle + 0.4) b.struck(d, key, c.t);
  }
  for (const o of objects) {
    if (o.dead || o.held) continue;
    _to.copy(o.pos).sub(origin);
    if (_to.length() < m.range && _to.angleTo(d) < m.angle && lineOfSight(origin, o.pos)) {
      const push = (key === 'aero' ? 8 : 3) * (m.from ? -0.8 : 1);     // vacuum drags it toward you
      const wasHostile = o.hostile;
      kick(o, d.x * push, 1.5, d.z * push);
      if (wasHostile && o.owner && !o.owner.down) {  // blown straight back at whoever sent it
        sendBack(o, 9);
        hudNote = 'deflect'; drawHud();
      }
      if (key === 'pyro' || m.form === 'lava') ignite(o, c.t);
    }
  }
  // The blast itself: a cone of the element that rushes out and thins, plus loose matter thrown with it.
  const spread = Math.tan(m.angle);
  const body = new THREE.Mesh(
    new THREE.ConeGeometry(spread * m.range, m.range, 32, 10, true).translate(0, -m.range / 2, 0).rotateX(-Math.PI / 2),
    energyMat(lookOf(key, m), { flow: [0, 0, key === 'aero' ? 2.2 : 1.6], scale: key === 'aero' ? [3, 3, 14] : [5, 5, 3.5], cut: key === 'aero' ? 0.5 : 0.3 }),
  );
  body.position.copy(origin);
  body.lookAt(origin.clone().add(d));
  puff(key, origin, key === 'aero' ? 70 : 90, m.range / 0.4, { dir: d, spread: spread * 1.1, life: 0.45, drag: 1.2, grav: key === 'pyro' ? -1 : 0 });
  if (key === 'pyro') addLight(origin.clone().addScaledVector(d, m.range * 0.45), FIRE_LIGHT, 2.4, 0.5);
  if (key === 'aero') {                             // air has no colour of its own: you see the dust and mist it carries off
    for (let i = 1; i <= 5; i++) {
      _to.copy(origin).addScaledVector(d, m.range * i / 6);
      smoke.emit(_to, _fv.copy(d).multiplyScalar(3.5 + i * 0.4), STEAM, 0.16 + i * 0.05, 0.55, 0, 1.5);
    }
    const floor = origin.clone().addScaledVector(d, 1.4).setY(0.08);
    for (let i = 0; i < 5; i++) smoke.emit(_to.copy(floor).addScaledVector(d, i * 0.5), _fv.copy(d).multiplyScalar(2.5).setY(0.6), DUST, 0.22, 0.9, 0, 1.2);
  }
  const rings = [];
  for (let i = 0; i < (key === 'aero' ? 3 : 0); i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 48), glowMat(color, 0));
    ring.lookAt(d);
    rings.push(ring);
  }
  const born = c.t;
  addEffect([body, ...rings], (t) => {
    const age = t - born;
    const grow = Math.min(age / 0.14, 1);
    body.scale.set(0.5 + 0.5 * grow, 0.5 + 0.5 * grow, 0.15 + 0.85 * grow);
    body.material.opacity = 0.7 * Math.max(1 - age / 0.6, 0);     // kept thin: it starts at your own hand
    rings.forEach((ring, i) => {
      const k = (age - i * 0.07) / 0.5;
      if (k < 0 || k > 1) { ring.material.opacity = 0; return; }
      const reach = 0.15 + k * (m.range - 0.3);
      ring.position.copy(origin).addScaledVector(d, reach);
      ring.scale.setScalar(0.08 + reach * spread);
      ring.material.opacity = (1 - k) * 0.5;
    });
    return age < 0.65;
  });
}

// --- column: erupts from the floor under whatever you are facing. Ignores furniture. ---
function castColumn(key, m, c) {
  const color = ELEMENTS[key].color;
  const d = c.dir.clone().normalize();
  const target = aimAssist(c.eye, d, 0.6, c.t);
  const base = new THREE.Vector3(), axis = new THREE.Vector3(0, 1, 0);
  let height = 1.0;
  if (key !== 'astra') {
    // Every discipline answers from whatever is closest: the floor, a wall beside the target, the ceiling over it, a table.
    const near = target ? nearestRoomSurface(target.group.position, 2.4) : null;
    const seen = !target ? collide(c.eye, c.eye.clone().addScaledVector(d, 12)) : null;
    if (near) { base.copy(near.point); axis.copy(near.normal); height = near.dist + 0.2; }
    else if (target) { base.set(target.group.position.x, 0, target.group.position.z); height = target.group.position.y + 0.18; }
    else if (seen) { base.copy(seen.point); axis.copy(seen.normal); height = 1.1; }
    else base.copy(c.eye).addScaledVector(flat(d, c.fwd), 1.5).setY(0);
  } else if (target) {
    base.set(target.group.position.x, 0, target.group.position.z);
    height = target.group.position.y + 0.18;
  } else {
    base.copy(c.eye).addScaledVector(flat(d, c.fwd), 1.5).setY(0);
  }
  const column = new THREE.Group();
  let body, core = null;
  const spike = key === 'terra' || m.form === 'ice';
  if (spike) {
    // A real spike of rock: wide at the root, sharp at the tip, never the same twice.
    body = new THREE.Mesh(craggy(new THREE.ConeGeometry(Math.max(m.bottom, 0.17), 1, 7, 5).translate(0, 0.5, 0), 0.05), key === 'terra' ? earthMat(m.form) : iceMat());
    column.add(body);
    for (let i = 0; i < 3; i++) {                 // shards crowding the base
      const shard = new THREE.Mesh(craggy(new THREE.ConeGeometry(0.07, 0.4 + Math.random() * 0.25, 5, 2).translate(0, 0.2, 0), 0.03), key === 'terra' ? earthMat(m.form) : iceMat());
      const ang = Math.random() * 6.28;
      shard.position.set(Math.cos(ang) * 0.16, 0, Math.sin(ang) * 0.16);
      shard.rotation.set(Math.sin(ang) * 0.5, 0, -Math.cos(ang) * 0.5);
      shard.scale.y = 1 / Math.max(height, 0.3);  // keep their own height while the spire stretches
      column.add(shard);
    }
  } else {
    const wide = key === 'aero' ? 1 : 1.5;
    body = new THREE.Mesh(
      new THREE.CylinderGeometry(m.top * wide, m.bottom * wide, 1, 28, 12, true).translate(0, 0.5, 0),
      energyMat(lookOf(key, m), { flow: [0, key === 'aero' ? 2.2 : 1.8, 0], fadeY: key === 'aqua' ? 0 : 0.5, cut: key === 'aqua' ? 0.1 : undefined, scale: key === 'aero' ? [5, 1.4, 5] : key === 'aqua' ? [10, 2.2, 10] : [8, 2.6, 8] }),
    );
    column.add(body);
    if (key !== 'aero') {
      core = new THREE.Mesh(new THREE.CylinderGeometry(m.top * 0.3, m.bottom * 0.6, 1, 12, 1, true).translate(0, 0.5, 0), glowMat(new THREE.Color(ENERGY[key].b), 0.22));
      column.add(core);
    }
  }
  const solid = body, wire = core || body;       // faded together below
  column.position.copy(base);
  column.quaternion.setFromUnitVectors(UP, axis);
  column.rotateY(Math.random() * Math.PI);
  const pw = m.power || 1;
  const upright = axis.y > 0.7;
  // A stone spire stays where it grew, as cover, until it is broken or its time runs out.
  let barrier = null, endAt = c.t + 0.75;
  const crumble = (when) => {
    if (!barrier) return;
    removeBarrier(barrier); barrier = null;
    endAt = when;
    puff('terra', base.clone().addScaledVector(axis, height * 0.5), 30, 2.4, { jitter: 0.3 });
  };
  const _rel = new THREE.Vector3();
  const inside = (p, pad) => {                   // is a point within the column, measured along its own axis?
    _rel.copy(p).sub(base);
    const along = _rel.dot(axis);
    return along > -0.2 && along < height + 0.1 && _rel.addScaledVector(axis, -along).length() < m.radius * pw + pad;
  };
  column.scale.set(pw, 0.001, pw);
  if (m.pulse) firePulse(base);                  // Terra's eruption also ripples the room
  if (key === 'aqua' && !m.form) addSource(base, axis, c.t, 20);     // where water came up, it keeps coming for a while
  puff(key, base, key === 'terra' ? 40 : 24, 2.4, { up: 2.5, jitter: 0.2 });
  if (key === 'terra') fume(DUST, base, 7, { size: 0.35, jitter: 0.5, rise: 0.5, life: 1.8 });
  const born = c.t;
  const top = new THREE.Vector3();
  let struck = false, spin = Math.random() * 6.28;
  addEffect([column], (t, dt) => {
    const age = t - born;
    const rise = Math.min(age / 0.16, 1);
    if (barrier && t > endAt) crumble(t);
    if (m.form === 'lava') lightNow(top.copy(base).addScaledVector(axis, height * 0.5), LAVA_LIGHT, 1);
    const sink = barrier ? 0 : THREE.MathUtils.clamp((t - endAt) / 0.35, 0, 1);
    column.scale.y = Math.max(height * rise * (1 - sink), 0.001);
    if (m.flicker) { const f = 1 + 0.18 * Math.sin(t * 31); column.scale.x = f * pw; column.scale.z = (2 - f) * pw; }
    solid.material.opacity = 1 - sink;
    if (core) core.material.opacity = 0.22 * (1 - sink);
    if (key === 'pyro' && sink < 1) lightNow(top.copy(base).setY(height * 0.4), FIRE_LIGHT, 1.6 * (1 - sink));
    // Loose matter while it stands: embers climb off fire, a geyser's crown rains down, wind winds upward.
    const tall = column.scale.y;
    if (sink < 1 && rise >= 1) {
      if (key === 'pyro') { top.copy(base).setY(Math.random() * tall); puff(key, top, 3, 0.7, { up: 1.8, jitter: 0.22 }); if (Math.random() < 0.25) fume(SMOKE, top.setY(tall), 1, { rise: 1.1, size: 0.3, life: 1.8 }); }
      else if (key === 'aqua') { top.copy(base).setY(tall); puff(key, top, 4, 1.6, { up: 1.2, jitter: 0.1 }); }
      else if (key === 'aero') {
        spin += dt * 14;
        for (let arm = 0; arm < 3; arm++) {
          const h = ((t * 1.8 + arm / 3) % 1) * tall, ang = spin + arm * 2.094 + h * 5;
          top.set(base.x + Math.cos(ang) * m.radius * 0.55, h, base.z + Math.sin(ang) * m.radius * 0.55);
          puff(key, top, 2, 0.5, { up: 2.5, life: 0.4, size: 0.022 });
        }
      }
    }
    if (!struck && rise >= 1) {
      struck = true;
      const mm = upright ? m : { ...m, launch: false };      // only a spire from below tosses things into the air
      for (const e of echoes) if (isLive(e, t) && inside(e.group.position, 0)) hit(e, key, t, axis, mm);
      for (const o of objects) {
        if (o.dead || o.held || !inside(o.pos, o.def.r)) continue;
        kick(o, axis.x * 6, axis.y * 6, axis.z * 6);
        if (key === 'pyro' || m.form === 'lava') ignite(o, t);
      }
      if (key === 'pyro' || m.form === 'lava') heatAt(base, m.radius + 0.6, t);
      if (m.stand) {
        endAt = t + m.stand;
        barrier = addBarrier(new THREE.CylinderGeometry(Math.max(m.bottom, 0.17) * 0.5 * pw, Math.max(m.bottom, 0.17) * pw, height, 8).translate(0, height / 2, 0), column, {
          struck: (dv, k, tt) => crumble(tt),
          crumble: (tt) => crumble(tt),
          reflect: m.form === 'metal',
          damage: (tt) => { if (barrier && --barrier.hp <= 0) crumble(tt); },
        });
        if (m.form === 'metal') barrier.hp = 6;
      }
    }
    return barrier || t < endAt + 0.35;
  });
}

// --- ring: spreads across the floor from where the fist landed. ---
function castRing(key, m, c) {
  const color = ELEMENTS[key].color;
  const centre = c.ground.clone();
  ringFlourish(key, m, centre, c.t);
  const mk = (inner) => {
    const r = new THREE.Mesh(new THREE.RingGeometry(inner, 1, 72).rotateX(-Math.PI / 2), glowMat(color, 0.9));
    r.position.copy(centre).setY(centre.y + 0.02);
    return r;
  };
  const outer = mk(0.95), inner = mk(0.98);
  // The crest riding the ring: flame licking up, a low rolling swell, or a thin wall of air.
  const crest = key === 'pyro' ? 0.55 : key === 'aqua' ? 0.3 : 0.4;
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, crest, 72, 6, true).translate(0, crest / 2, 0),
    energyMat(lookOf(key, m), { flow: [0, key === 'aqua' ? 0.6 : 1.6, 0], fadeY: true, scale: key === 'aero' ? [3, 9, 3] : [2.2, 5, 2.2], cut: key === 'aqua' ? 0.12 : undefined }),
  );
  rim.position.copy(centre);
  puff(key, centre, 30, 3, { up: 2, jitter: 0.1 });
  if (key === 'aqua') addSource(centre, UP, c.t, 20);
  const edge = new THREE.Vector3();
  const struck = new Set();
  const born = c.t;
  addEffect([outer, inner, rim], (t) => {
    const r = Math.max((t - born) * 5, 0.01);
    const k = r / m.maxR;
    outer.scale.set(r, 1, r);
    inner.scale.set(r * 0.7, 1, r * 0.7);
    rim.scale.set(r, 1 + 0.6 * (1 - k), r);
    outer.material.opacity = 0.9 * (1 - k);
    inner.material.opacity = 0.5 * (1 - k);
    rim.material.opacity = 1 - k * k;
    if (key === 'pyro') lightNow(centre, FIRE_LIGHT, 2 * (1 - k));
    for (let i = 0; i < 5; i++) {                 // matter kicked up along the travelling edge
      const ang = Math.random() * 6.28;
      edge.set(centre.x + Math.cos(ang) * r, centre.y + 0.05, centre.z + Math.sin(ang) * r);
      puff(key, edge, 1, 0.8, { up: key === 'aqua' ? 1.6 : 1.1 });
    }
    for (const e of echoes) {
      if (!isLive(e, t) || struck.has(e)) continue;
      const p = e.group.position;
      const horiz = Math.hypot(p.x - centre.x, p.z - centre.z);
      if (horiz < r && Math.abs(p.y - centre.y) < m.height + 0.1) {
        struck.add(e);
        hit(e, key, t, _to.set(p.x - centre.x, 0.6, p.z - centre.z).normalize(), m);
      }
    }
    if (key === 'pyro') for (const src of [...sources]) if (Math.hypot(src.pos.x - centre.x, src.pos.z - centre.z) < r && Math.abs(src.pos.y - centre.y) < 0.6) evaporate(src, t);
    for (const o of objects) {
      if (o.dead || o.held || struck.has(o) || Math.hypot(o.pos.x - centre.x, o.pos.z - centre.z) > r) continue;
      struck.add(o);
      _to.set(o.pos.x - centre.x, 0, o.pos.z - centre.z).normalize();
      kick(o, _to.x * 2.5, 3.5, _to.z * 2.5);
      if (key === 'pyro' || m.form === 'lava') ignite(o, t);
    }
    return k < 1;
  });
}

// --- wall: rises in front of you and rams forward. Stone stops at the room; water rolls through. ---
function castWall(key, m, c) {
  const color = ELEMENTS[key].color;
  const aim = c.dir.clone().normalize();
  // The wall grows along n, out of whatever surface you are looking at, and faces along d.
  // Floor or table top: an ordinary wall where you looked. A wall of the room: a partition jutting out of it.
  const n = new THREE.Vector3(0, 1, 0), d = flat(aim, c.fwd), centre = new THREE.Vector3();
  const seen = m.passThrough ? null : collide(c.eye, c.eye.clone().addScaledVector(aim, 7));
  if (seen && seen.normal.y < 0.6 && Math.abs(aim.dot(seen.normal)) < 0.9) {
    n.copy(seen.normal); centre.copy(seen.point);
    d.copy(aim).addScaledVector(n, -aim.dot(n)).normalize();
  } else if (seen && seen.normal.y >= 0.6 && seen.point.distanceTo(c.eye) > 1.2) centre.copy(seen.point);
  else centre.copy(c.eye).addScaledVector(d, m.passThrough ? 1.0 : 1.3).setY(0);
  const right = new THREE.Vector3().crossVectors(d, n).normalize();
  const wall = new THREE.Group();
  const basis = new THREE.Matrix4();
  const xAxis = new THREE.Vector3();
  const face = () => wall.quaternion.setFromRotationMatrix(basis.makeBasis(xAxis.crossVectors(n, d).normalize(), n, d));   // a proper right-handed frame
  if (m.passThrough) {
    // A breaking wave: a sheet that leans forward and curls over at the lip.
    const sheet = new THREE.PlaneGeometry(m.width, m.height, 18, 12).translate(0, m.height / 2, 0);
    const sp = sheet.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const u = sp.getY(i) / m.height, x = sp.getX(i) / (m.width / 2);
      const lean = u * u * 0.38 + Math.max(u - 0.7, 0) * 0.9;                 // curl
      const taper = 1 - 0.35 * x * x;                                           // lower at the ends
      sp.setXYZ(i, sp.getX(i), sp.getY(i) * taper - Math.max(u - 0.85, 0) * 0.7, lean);
    }
    sheet.computeVertexNormals();
    wall.add(new THREE.Mesh(sheet, energyMat(lookOf(key, m), { flow: [0, 1.1, 0.4], scale: [5, 7, 5], cut: 0.05 })));
  } else {
    // A slab heaved out of the surface, rough along the top.
    const slab = craggy(new THREE.BoxGeometry(m.width, m.height, 0.22, 9, 6, 2).translate(0, m.height / 2, 0), 0.07);
    if (key !== 'terra') slab.computeVertexNormals();
    wall.add(new THREE.Mesh(slab, key === 'terra' ? earthMat(m.form) : iceMat()));
  }
  puff(key, centre, 36, 2.2, { dir: n, spread: 1, jitter: m.width * 0.8 });
  if (key === 'terra') fume(m.form === 'sand' ? SAND : DUST, centre, 10, { size: 0.4, jitter: m.width, rise: 0.5, life: 2 });
  const foam = new THREE.Vector3(), mid = new THREE.Vector3();
  wall.position.copy(centre);
  face();
  wall.scale.set(1, 0.001, 1);
  const struck = new Set();
  const born = c.t;
  const probeA = new THREE.Vector3(), probeB = new THREE.Vector3();
  let travelled = 0, stoppedAt = -1;
  // Is a point inside the slab, with some slack along the way it faces?
  const within = (p, slack, pad) => {
    _to.copy(p).sub(wall.position);
    const h = _to.dot(n);
    return Math.abs(_to.dot(d)) < slack && Math.abs(_to.dot(right)) < m.width / 2 + pad && h > -0.15 && h < m.height + 0.1 + pad;
  };
  // Stone stands where it rose and blocks like the room does. Hit it with one of your own moves and it charges.
  // Water never stands: a wave rolls out straight away.
  let phase = 'rise', barrier = null, standUntil = 0;
  const launch = (toward, t) => {
    if (phase !== 'stand') return;
    phase = 'ram';
    _to.copy(toward).addScaledVector(n, -toward.dot(n));             // it can only slide across the surface it grew from
    if (_to.lengthSq() > 0.01) { d.copy(_to).normalize(); right.crossVectors(d, n).normalize(); face(); }
    removeBarrier(barrier); barrier = null;
    struck.clear();
    thump(); hudNote = 'rampart away'; drawHud();
  };
  const crumble = (t) => {
    if (phase !== 'stand') return;
    phase = 'done'; stoppedAt = t;
    removeBarrier(barrier); barrier = null;
    puff(key, mid.copy(wall.position).addScaledVector(n, m.height * 0.5), 40, 2.6, { jitter: m.width * 0.6 });
  };
  addEffect([wall], (t, dt) => {
    const age = t - born;
    const rise = Math.min(age / 0.18, 1);
    let step = 0;
    if (m.form === 'lava') lightNow(mid.copy(wall.position).addScaledVector(n, m.height * 0.5), LAVA_LIGHT, 1.1);
    if (phase === 'rise' && rise >= 1) {
      if (m.stand) {
        phase = 'stand'; standUntil = t + m.stand;
        barrier = addBarrier(new THREE.BoxGeometry(m.width, m.height, 0.24).translate(0, m.height / 2, 0), wall, {
          struck: (dv, k, tt) => launch(dv, tt),
          crumble: (tt) => crumble(tt),
          reflect: m.form === 'metal',
          damage: (tt) => { puff(key, mid.copy(wall.position).addScaledVector(n, m.height * 0.6), 14, 2, { jitter: m.width * 0.5 }); if (barrier && --barrier.hp <= 0) crumble(tt); },
        });
        if (m.form === 'metal') barrier.hp = 6;
        // Whatever was standing where it came up gets thrown.
        for (const e of echoes) if (isLive(e, t) && within(e.group.position, 0.3, 0)) hit(e, key, t, n, { ...m, kind: 'column', launch: n.y > 0.7 });
      } else phase = 'ram';
    }
    if (phase === 'stand' && t > standUntil) crumble(t);
    if (phase === 'ram' && stoppedAt < 0) {
      step = 5 * dt;
      if (!m.passThrough) {
        probeA.copy(wall.position).addScaledVector(n, 0.4);
        probeB.copy(probeA).addScaledVector(d, step + 0.15);
        const blocked = collide(probeA, probeB);
        if (blocked) { step = 0; stoppedAt = t; impact(blocked.point, blocked.normal, key, t, 0.5); }
      }
      wall.position.addScaledVector(d, step);
      travelled += step;
      for (let i = 0; i < 4; i++) {               // dust ground out along the foot, or spray off the lip
        foam.copy(wall.position).addScaledVector(right, (Math.random() - 0.5) * m.width);
        if (m.passThrough) foam.addScaledVector(n, m.height * 0.85).addScaledVector(d, 0.45);
        puff(key, foam, m.passThrough ? 2 : 1, 1, { up: m.passThrough ? 0.9 : 1.2 });
      }
      if (travelled >= m.ram && stoppedAt < 0) stoppedAt = t;
      for (const e of echoes) {
        if (!isLive(e, t) || struck.has(e) || !within(e.group.position, 0.3 + step, 0)) continue;
        struck.add(e);
        hit(e, key, t, d, m);
      }
      for (const o of objects) {
        if (o.dead || o.held || !within(o.pos, 0.35 + step, o.def.r)) continue;
        o.vel.copy(d).multiplyScalar(5.5); o.vel.y = Math.max(o.vel.y, 0.8); o.rest = false; turn(o);
        if (m.form === 'lava') ignite(o, t);
      }
    }
    const sink = stoppedAt < 0 ? 0 : Math.min((t - stoppedAt) / 0.3, 1);
    wall.scale.y = Math.max(rise * (1 - sink), 0.001);
    if (m.passThrough) wall.scale.y *= 1 + 0.12 * Math.sin(t * 14);     // water wobbles
    return sink < 1;
  });
}

// --- fault line: spikes march across a surface from where the fist landed, toward your target, and stop at the room. ---
function castFault(key, m, c) {
  const start = c.ground.clone();
  const n = (c.normal || UP).clone().normalize();                   // the surface that was struck: floor, wall, table
  const onSurface = (v) => v.clone().addScaledVector(n, -v.dot(n));
  const target = aimAssist(c.eye, c.dir, 0.7, c.t);
  let d = onSurface(c.dir), length = m.length;
  if (d.lengthSq() < 0.01) d = onSurface(c.fwd);
  if (d.lengthSq() < 0.01) d = onSurface(new THREE.Vector3(1, 0, 0));
  d.normalize();
  let reach = 0;                                                     // how far off the surface the target floats
  if (target) {
    _to.copy(target.group.position).sub(start);
    reach = _to.dot(n);
    const across = onSurface(_to);
    if (across.lengthSq() > 0.01) { length = Math.min(m.length + 1.5, across.length() + 0.35); d.copy(across).normalize(); }
  }
  const probe = start.clone().addScaledVector(n, 0.3);
  const blocked = collide(probe, probe.clone().addScaledVector(d, length));
  if (blocked) length = Math.max(blocked.point.distanceTo(probe) - 0.15, 0.4);
  const count = Math.max(2, Math.ceil(length / 0.38));
  const spikes = [];
  const tiltQ = new THREE.Quaternion(), tilt = new THREE.Euler();
  for (let i = 0; i < count; i++) {
    const at = start.clone().addScaledVector(d, 0.3 + (i / count) * length);
    let h = 0.5 + Math.random() * 0.45;
    if (target && onSurface(_to.copy(target.group.position).sub(at)).length() < 0.45) h = Math.max(h, Math.min(reach + 0.2, 2.6));
    const solid = new THREE.Mesh(craggy(new THREE.ConeGeometry(0.1 + Math.random() * 0.06, 1, 6, 4).translate(0, 0.5, 0), 0.04), earthMat(m.form));
    const g = new THREE.Group();
    g.add(solid);
    g.position.copy(at);
    g.quaternion.setFromUnitVectors(UP, n).multiply(tiltQ.setFromEuler(tilt.set((Math.random() - 0.5) * 0.5, Math.random() * 3, (Math.random() - 0.5) * 0.5)));
    g.scale.set(1, 0.001, 1);
    spikes.push({ g, at, h, struck: false, dusted: false });
  }
  firePulse(start);
  const born = c.t;
  const total = count * 0.05 + 1.2;
  const rel = new THREE.Vector3();
  const reached = (p, s, pad) => {                                  // within a spike, measured along the way it points
    rel.copy(p).sub(s.at);
    const along = rel.dot(n);
    return along > -0.2 && along < s.h + 0.15 && rel.addScaledVector(n, -along).length() < 0.35 + pad;
  };
  addEffect(spikes.map(s => s.g), (t) => {
    spikes.forEach((s, i) => {
      const age = t - born - i * 0.05;
      const rise = THREE.MathUtils.clamp(age / 0.1, 0, 1);
      const sink = THREE.MathUtils.clamp((age - 0.8) / 0.3, 0, 1);
      s.g.scale.y = Math.max(s.h * rise * (1 - sink), 0.001);
      if (!s.dusted && age > 0) { s.dusted = true; puff(key, s.at, 12, 2, { dir: n, spread: 0.9, jitter: 0.12 }); fume(m.form === 'sand' ? SAND : DUST, s.at, 2, { size: 0.3, rise: 0.5 }); }
      if (m.form === 'lava' && i % 3 === 0 && rise > 0 && sink < 1) lightNow(s.at, LAVA_LIGHT, 0.7);
      if (!s.struck && rise >= 1) {
        s.struck = true;
        for (const e of echoes) if (isLive(e, t) && reached(e.group.position, s, 0)) hit(e, key, t, n, m);
        for (const o of objects) {
          if (o.dead || o.held || !reached(o.pos, s, o.def.r)) continue;
          kick(o, n.x * 7, n.y * 7, n.z * 7);
          if (m.form === 'lava') ignite(o, t);
        }
      }
    });
    return t - born < total;
  });
}

// A flat strip through a list of points, turned to face the viewer. Used for lightning.
function ribbonGeo(points, width, eye) {
  const pos = [], idx = [];
  const tan = new THREE.Vector3(), side = new THREE.Vector3(), toEye = new THREE.Vector3();
  points.forEach((p, i) => {
    tan.subVectors(points[Math.min(i + 1, points.length - 1)], points[Math.max(i - 1, 0)]).normalize();
    side.crossVectors(tan, toEye.subVectors(eye, p)).normalize().multiplyScalar(width / 2);
    pos.push(p.x + side.x, p.y + side.y, p.z + side.z, p.x - side.x, p.y - side.y, p.z - side.z);
    if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}
function jagged(a, b, wobble) {
  const n = Math.max(3, Math.ceil(a.distanceTo(b) / 0.22));
  const out = [a.clone()];
  for (let i = 1; i < n; i++) {
    out.push(a.clone().lerp(b, i / n).add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(wobble)));
  }
  out.push(b.clone());
  return out;
}

function zap(a, b, t) {
  const eye = viewerPos.clone();
  const arc = new THREE.Mesh(ribbonGeo(jagged(a, b, 0.08), 0.02, eye), glowMat(new THREE.Color(0xffffff), 1));
  addLight(b, VOLT_LIGHT, 2, 0.2);
  puff('volt', b, 10, 2.5, {});
  addEffect([arc], (n) => { arc.material.opacity = Math.max(1 - (n - t) / 0.18, 0); return n - t < 0.18; });
}
// --- beam: instant. Lightning takes the straight path, then jumps between echoes that are close together. ---
function castBeam(key, m, c) {
  const origin = c.hand.clone();
  const d = c.dir.clone().normalize();
  const target = aimAssist(origin, d, 0.25, c.t);
  if (target) d.copy(target.group.position).sub(origin).normalize();
  const far = origin.clone().addScaledVector(d, m.range);
  const wall = collide(origin, far);
  const end = wall ? wall.point : far;
  let first = null, firstDist = Infinity;
  for (const e of echoes) {
    if (!isLive(e, c.t) || segmentDistance(e.group.position, origin, end) > 0.25) continue;
    const dist = e.group.position.distanceTo(origin);
    if (dist < firstDist) { firstDist = dist; first = e; }
  }
  const stops = [origin];
  const struck = [];
  if (first) {
    let cur = first, jumps = m.chain || 0;
    struck.push(first); stops.push(first.group.position.clone());
    for (;;) {                                      // soaked echoes pass it on for free
      let next = null, nextDist = Infinity;
      for (const e of echoes) {
        if (!isLive(e, c.t) || struck.includes(e)) continue;
        const wet = e.soakedUntil > c.t || e.metalUntil > c.t;
        if (!wet && jumps <= 0) continue;
        const dist = e.group.position.distanceTo(cur.group.position);
        if (dist < (wet ? 4 : 2.6) && dist < nextDist && lineOfSight(cur.group.position, e.group.position)) { next = e; nextDist = dist; }
      }
      if (!next) break;
      if (!(next.soakedUntil > c.t || next.metalUntil > c.t)) jumps--;
      struck.push(next); stops.push(next.group.position.clone());
      cur = next;
    }
  } else {
    stops.push(end.clone());
    if (wall) impact(wall.point, wall.normal, key, c.t, 0.3);
  }
  const white = new THREE.Color(0xffffff), glow = new THREE.Color(key === 'lumen' ? 0xffe9a0 : 0xffa63d);
  for (let i = 1; i < stops.length; i++) puff(key, stops[i], 18, 3, { life: 0.3, size: 0.03, grav: 3 });
  struck.forEach((e, i) => hit(e, key, c.t, stops[i + 1].clone().sub(stops[i]).normalize(), m));
  tone(2600, 90, 0.16, 0.22, 'square'); tone(140, 40, 0.5, 0.3);
  for (let i = 0; i < stops.length; i++) addLight(stops[i], VOLT_LIGHT, i ? 3 : 1.6, 0.22);

  const core = new THREE.Mesh(new THREE.BufferGeometry(), glowMat(white, 1));
  const halo = new THREE.Mesh(new THREE.BufferGeometry(), glowMat(glow, 0.35));
  const eye = c.eye.clone();
  const born = c.t;
  let redraw = -1;
  addEffect([core, halo], (t) => {
    const age = t - born;
    if (t - redraw > 0.05) {                        // re-fork a few times so it crackles
      redraw = t;
      const pts = [];
      for (let i = 1; i < stops.length; i++) pts.push(...jagged(stops[i - 1], stops[i], m.straight ? 0 : 0.09).slice(i > 1 ? 1 : 0));
      core.geometry.dispose(); halo.geometry.dispose();
      core.geometry = ribbonGeo(pts, 0.022 * (m.power || 1), eye);
      halo.geometry = ribbonGeo(pts, 0.055 * (m.power || 1), eye);
    }
    core.material.opacity = Math.max(1 - age / 0.28, 0);
    halo.material.opacity = 0.35 * Math.max(1 - age / 0.28, 0);
    return age < 0.28;
  });
}

// --- void: the air is pulled out of one spot. Everything near it is dragged together, then it snaps back. ---
function castVoid(key, m, c) {
  const color = ELEMENTS[key].color;
  const origin = c.hand.clone();
  const d = c.dir.clone().normalize();
  const target = aimAssist(origin, d, 0.3, c.t);
  const centre = new THREE.Vector3();
  if (target && lineOfSight(origin, target.group.position)) centre.copy(target.group.position);
  else {
    const far = origin.clone().addScaledVector(d, target ? origin.distanceTo(target.group.position) : 3);
    const wall = collide(origin, far);
    centre.copy(wall ? wall.point.addScaledVector(wall.normal, 0.25) : far);
  }
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), glowMat(color, 0.4));
  shell.material.wireframe = true;
  shell.position.copy(centre);
  const born = c.t, PULL = 0.55;
  const from = new THREE.Vector3(), inward = new THREE.Vector3();
  let popped = false;
  addEffect([shell], (t, dt) => {
    const age = t - born;
    const k = Math.min(age / PULL, 1);
    if (!popped) {
      shell.scale.setScalar(Math.max(m.radius * (1 - k * 0.92), 0.05));
      shell.rotation.y += dt * 6;
      shell.material.opacity = 0.25 + 0.4 * k;
      for (let i = 0; i < 6; i++) {                 // air rushing in from all sides
        from.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(m.radius * (1 - k * 0.5));
        inward.copy(from).multiplyScalar(-3.2 / Math.max(1 - k * 0.5, 0.3));
        particles.emit(from.add(centre), inward, PCOL.aero[i % 3], 0.022, 0.25, 0, 0);
      }
      for (const e of echoes) {
        if (!isLive(e, t) || e.frozenUntil > t) continue;
        if (e.home.distanceTo(centre) < m.radius) {
          e.home.lerp(centre, Math.min(dt * 6, 1));
          e.restY = e.home.y; e.airborne = false; e.vel.set(0, 0, 0);
        }
      }
      for (const o of objects) {
        if (o.dead || o.held || o.pos.distanceTo(centre) > m.radius) continue;
        o.rest = false; turn(o);
        o.vel.copy(centre).sub(o.pos).multiplyScalar(7);
      }
      if (k >= 1) {
        popped = true;
        puff(key, centre, 50, 4.5, { life: 0.35 });
        thump();
        for (const e of echoes) {
          if (isLive(e, t) && e.group.position.distanceTo(centre) < 0.5) {
            hit(e, key, t, inward.copy(e.group.position).sub(centre).setY(0).normalize(), m);
          }
        }
      }
      return true;
    }
    const out = (age - PULL) / 0.2;
    shell.scale.setScalar(0.05 + out * m.radius * 0.8);
    shell.material.opacity = 0.6 * (1 - out);
    return out < 1;
  });
}

let stopNormal = null;
// --- lance: not a projectile. The limb extends, runs everything in line through, and retracts.
function castLance(key, m, c) {
  const d = c.dir.clone().normalize(), t = c.t;
  play(SFX.lance);
  const wall = collide(c.hand, c.hand.clone().addScaledVector(d, m.range));
  const reach = wall ? wall.point.distanceTo(c.hand) : m.range;
  const tip = c.hand.clone().addScaledVector(d, reach);
  const spear = new THREE.Group();
  const bone = new THREE.Mesh(new THREE.ConeGeometry(0.035, 1, 6).rotateX(Math.PI / 2).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color: 0xf0dccf }));
  const sinew = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 1, 8, 6).rotateX(Math.PI / 2).translate(0, 0, 0.5), energyMat('morph', { scale: [14, 14, 3], flow: [0, 0, 2], cut: 0.3 }));
  sinew.scale.set(1, 1, 0.55);
  spear.add(bone, sinew);
  spear.position.copy(c.hand); spear.lookAt(tip);
  for (const e of echoes) if (isLive(e, t) && segmentDistance(e.group.position, c.hand, tip) < 0.32) hit(e, key, t, d, m);
  for (const o of objects) if (!o.dead && !o.held && !o.def.cloud && segmentDistance(o.pos, c.hand, tip) < o.def.r + 0.1) kick(o, d.x * 5, 1.5, d.z * 5);
  if (wall) impact(wall.point, wall.normal, key, t, 0.25);
  addEffect([spear], (n) => {
    const a = n - t, k = a < 0.07 ? a / 0.07 : a < 0.2 ? 1 : Math.max(1 - (a - 0.2) / 0.16, 0);
    spear.scale.set(1, 1, Math.max(reach * k, 0.01));
    return a < 0.36;
  });
}
// --- Necro: thralls. The dead, raised. They hunt the nearest creature, bite it, and throw themselves in front of shards.
const thralls = [];
function raiseThrall(pos, t) {
  if (thralls.length >= 4) thralls[0].until = 0;
  const g = new THREE.Group();
  const bone = new THREE.MeshBasicMaterial({ color: 0xeafff4 }), dark = new THREE.MeshBasicMaterial({ color: 0x06301f });
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8).scale(1, 1.1, 1.15), bone));                      // skull
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.08).translate(0, -0.085, 0.03), bone));               // jaw
  for (const x of [-0.035, 0.035]) {
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6).translate(x, 0.01, 0.085), dark));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 5).translate(x, 0.01, 0.1), glowMat(new THREE.Color(0x6cf0c2), 1)));
  }
  g.position.copy(pos); g.scale.setScalar(0.01);
  const self = { g, pos: g.position, vel: new THREE.Vector3(), until: t + (forms.necro === 'plague' ? 36 : 18), biteAt: 0 };
  thralls.push(self);
  play(SFX.necro.rise); puff('necro', pos, 30, 1.8, { up: 1.5 });
  const epoch = shapeEpoch, to = new THREE.Vector3();
  let then = t;
  addEffect([g], (n) => {
    const dt = Math.min(n - then, 0.08); then = n;
    if (epoch !== shapeEpoch || n > self.until) { thralls.splice(thralls.indexOf(self), 1); puff('necro', self.pos, 24, 1.6, {}); return false; }
    g.scale.setScalar(Math.min((n - t) / 0.4, 1) * 1.2);
    let prey = null, near = 9;
    for (const e of echoes) { if (e.down) continue; const d = e.group.position.distanceTo(self.pos); if (d < near) { near = d; prey = e; } }
    for (const o of objects) if (!o.dead && o.hostile && o.pos.distanceTo(self.pos) < 0.5) { o.dead = true; play(SFX.necro.bite); puff('necro', o.pos, 12, 1.6, {}); self.until -= 3; }   // it takes the hit for you
    if (prey) {
      to.copy(prey.group.position).sub(self.pos);
      self.vel.lerp(to.clone().setLength(near > 0.4 ? 1.7 : 0), Math.min(dt * 4, 1));
      g.lookAt(prey.group.position);
      reveal(prey, n, 1, ELEMENTS.necro.color);
      if (near < 0.5 && n > self.biteAt) { self.biteAt = n + 1; play(SFX.necro.bite); hit(prey, 'necro', n, to.normalize(), { damage: 1, venom: forms.necro === 'plague' }); }
    } else {                                         // nothing to hunt: it comes back and waits by your shoulder
      to.copy(viewerPos).add(_np.set(Math.sin(thralls.indexOf(self) * 2.1) * 0.6, 0.15, Math.cos(thralls.indexOf(self) * 2.1) * 0.6)).sub(self.pos);
      self.vel.lerp(to.multiplyScalar(1.5).clampLength(0, 1.5), Math.min(dt * 3, 1));
    }
    self.pos.addScaledVector(self.vel, dt);
    self.pos.y += Math.sin(n * 3 + self.until) * 0.002;
    if (Math.random() < 0.2) puff('necro', self.pos, 1, 0.2, {});
    return true;
  });
  hudNote = 'it rises'; drawHud();
  return self;
}
function castLegion(key, m, c) {
  for (let i = 0; i < m.count; i++) raiseThrall(c.hand.clone().add(new THREE.Vector3(Math.cos(i * 2.1) * 0.5, 0.1, Math.sin(i * 2.1) * 0.5 - 0.4)), c.t + i * 0.001);
}
// ---------- what each discipline's blast and shockwave are actually made of ----------
// Things that come up, stand a moment and go: roots, claws, spikes, shafts of light.
function popUps(list, t) {
  addEffect(list.map(p => p.mesh), (n) => {
    let any = false;
    for (const p of list) {
      const a = n - t - p.at;
      const k = a < 0 ? 0 : a < p.grow ? a / p.grow : a < p.grow + p.life ? 1 : Math.max(1 - (a - p.grow - p.life) / 0.25, 0);
      p.mesh.visible = k > 0;
      if (p.axis) p.mesh.scale.set(p.axis[0] ? Math.max(k, 0.01) : 1, p.axis[1] ? Math.max(k, 0.01) : 1, p.axis[2] ? Math.max(k, 0.01) : 1); else p.mesh.scale.setScalar(Math.max(k, 0.01));
      if (p.mesh.material.transparent && p.fade) p.mesh.material.opacity = k * p.fade;
      if (a < p.grow + p.life + 0.25) any = true;
    }
    return any;
  });
}
const basic = (hex) => new THREE.MeshBasicMaterial({ color: hex });
function ringFlourish(key, m, centre, t) {
  const R = m.maxR, list = [], rnd = (i) => { const a = i * 2.399, r = R * Math.sqrt((i + 0.5) / 26); return [Math.cos(a) * r, Math.sin(a) * r, r]; };
  if (key === 'flora') {                            // roots breaking the floor, outward
    for (let i = 0; i < 26; i++) { const [x, z, r] = rnd(i); const root = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.3 + (i % 4) * 0.08, 5).translate(0, 0.17, 0), basic(i % 3 ? 0x3d8a22 : 0x7a5230)); root.position.set(centre.x + x, centre.y, centre.z + z); root.rotation.set((i % 5 - 2) * 0.2, i, (i % 3 - 1) * 0.3); list.push({ mesh: root, at: r / 5, grow: 0.12, life: 1.1, axis: [0, 1, 0] }); }
  } else if (key === 'necro') {                     // hands
    for (let i = 0; i < 14; i++) { const [x, z, r] = rnd(i * 2); const hand = new THREE.Group(); for (let f = -1; f <= 1; f++) hand.add(new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.16, 4).translate(f * 0.03, 0.3, 0).rotateZ(f * -0.25), basic(0xeafff4))); hand.add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.24, 5).translate(0, 0.12, 0), basic(0xeafff4))); hand.material = { transparent: false, dispose() {} }; hand.position.set(centre.x + x, centre.y, centre.z + z); hand.rotation.y = i; list.push({ mesh: hand, at: r / 5, grow: 0.18, life: 0.9, axis: [0, 1, 0] }); }
  } else if (key === 'morph') {                     // a crown of bone thrown up round the foot
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.5, 4).translate(0, 0.25, 0), basic(0xf0dccf)); spike.position.set(centre.x + Math.cos(a) * 0.8, centre.y, centre.z + Math.sin(a) * 0.8); spike.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); list.push({ mesh: spike, at: 0.02 * (i % 3), grow: 0.07, life: 0.5, axis: [0, 1, 0] }); }
  } else if (key === 'lumen') {                     // shafts of light standing on the wave front
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = R * (0.35 + 0.65 * ((i * 7) % 16) / 16); const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 2.2, 6).translate(0, 1.1, 0), glowMat(new THREE.Color(0xfff6d0), 0.8)); shaft.position.set(centre.x + Math.cos(a) * r, centre.y, centre.z + Math.sin(a) * r); list.push({ mesh: shaft, at: r / 5, grow: 0.05, life: 0.25, axis: [0, 1, 0], fade: 0.8 }); }
  } else if (key === 'astra') {                     // it rains stars
    for (let i = 0; i < 18; i++) { const [x, z, r] = rnd(i * 1.4); const streak = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.02, 2.4, 5).translate(0, 1.2, 0), glowMat(new THREE.Color(i % 3 ? 0xc9d6ff : 0xffffff), 0.9)); streak.position.set(centre.x + x, centre.y, centre.z + z); streak.rotation.z = 0.25; list.push({ mesh: streak, at: r / 5 + (i % 4) * 0.05, grow: 0.06, life: 0.08, axis: [0, 1, 0], fade: 0.9 }); }
  } else if (key === 'gravis') {                    // a plate of weight coming down on everything
    const press = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.04, 48, 1, true), glowMat(new THREE.Color(0xb48cff), 0.7));
    const lid = new THREE.Mesh(new THREE.RingGeometry(0, R, 48).rotateX(Math.PI / 2), energyMat('gravis', { scale: [1.5, 1.5, 1.5], cut: 0.35 }));
    press.add(lid);
    addEffect([press], (n) => { const k = Math.min((n - t) / 0.3, 1); press.position.copy(centre).setY(centre.y + 1.8 * (1 - k * k)); press.material.opacity = lid.material.opacity = k < 1 ? 0.7 : Math.max(0.7 - (n - t - 0.3) * 2.5, 0); return n - t < 0.6; });
  } else if (key === 'umbra') {                     // night, as a dome
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), energyMat('umbra', { scale: [2, 2, 2], flow: [0, 0.4, 0], cut: 0.1 }));
    dome.position.copy(centre);
    addEffect([dome], (n) => { const r = Math.min((n - t) * 5, R); dome.scale.setScalar(Math.max(r, 0.01)); dome.material.opacity = r < R ? 1 : Math.max(1 - (n - t - R / 5) * 1.6, 0); return n - t < R / 5 + 0.65; });
  }
  if (list.length) popUps(list, t);
}
// Rings that travel down the blast: a voice, a pressure wave, a gust.
function waves(origin, d, count, range, radius, mat, t, gap = 0.09, speed = 9) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
  const rings = Array.from({ length: count }, (_, i) => { const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 40), mat()); r.quaternion.copy(q); r.userData.at = i * gap; return r; });
  addEffect(rings, (n) => {
    let any = false;
    for (const r of rings) { const a = n - t - r.userData.at, dist = a * speed; r.visible = a > 0 && dist < range; if (a * speed < range) any = true; if (!r.visible) continue; const k = dist / range; r.position.copy(origin).addScaledVector(d, dist); r.scale.setScalar(radius * (0.15 + k)); r.material.opacity = 1 - k; }
    return any;
  });
}
function coneFlourish(key, m, origin, d, t) {
  const spread = Math.tan(m.angle) * m.range;
  if (key === 'necro') waves(origin, d, 5, m.range, spread, () => glowMat(new THREE.Color(0x6cf0c2), 0.8), t, 0.11, 7);
  else if (key === 'gravis') waves(origin, d, 3, m.range, spread, () => energyMat('gravis', { cut: 0.2 }), t, 0.05, 14);
  else if (key === 'aero') {                        // wind: long curved streaks, not a cloud
    const side = new THREE.Vector3(-d.z, 0, d.x).normalize(), list = [];
    for (let i = 0; i < 9; i++) {
      const off = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), 0).multiplyScalar(spread * 0.9);
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(off.x * 0.2, off.y * 0.2 + 0.25, m.range * 0.5), new THREE.Vector3(off.x, off.y, m.range * (0.7 + Math.random() * 0.3)));
      const streak = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.008, 4, false), glowMat(new THREE.Color(0xffffff), 0.7));
      streak.position.copy(origin); streak.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
      list.push({ mesh: streak, at: i * 0.02, grow: 0.14, life: 0.1, axis: [0, 0, 1], fade: 0.7 });
    }
    popUps(list, t);
  } else if (key === 'lumen') {                     // a fan of hard rays
    const list = [];
    for (let i = 0; i < 9; i++) { const a = (i / 8 - 0.5) * 2 * m.angle; const ray = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, m.range).translate(0, 0, m.range / 2), glowMat(new THREE.Color(0xfff6d0), 0.9)); ray.position.copy(origin); ray.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.clone().applyAxisAngle(UP, a).normalize()); list.push({ mesh: ray, at: 0, grow: 0.04, life: 0.12, axis: [0, 0, 1], fade: 0.9 }); }
    popUps(list, t);
  } else if (key === 'morph' && m.armour) {         // plates of shell closing in front of you
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d), list = [];
    for (let i = 0; i < 7; i++) { const a = (i / 6) * Math.PI * 2, r = i === 6 ? 0 : 0.2; const plate = new THREE.Mesh(new THREE.CircleGeometry(0.115, 6), new THREE.MeshBasicMaterial({ color: i === 6 ? 0xf0dccf : 0xd8a898, side: THREE.DoubleSide })); plate.quaternion.copy(q); plate.position.copy(origin).addScaledVector(d, 0.25).add(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0).applyQuaternion(q)); list.push({ mesh: plate, at: i * 0.03, grow: 0.08, life: 0.7 }); }
    popUps(list, t);
  } else if (key === 'astra') {                     // rain, straight down through the whole blast
    const list = [];
    for (let i = 0; i < 14; i++) { const p = origin.clone().addScaledVector(d, Math.random() * m.range).add(new THREE.Vector3((Math.random() - 0.5) * spread, 0, (Math.random() - 0.5) * spread)); const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.012, 0.9, 4), glowMat(new THREE.Color(0xc9d6ff), 0.8)); drop.position.copy(p); list.push({ mesh: drop, at: i * 0.015, grow: 0.05, life: 0.1, axis: [0, 1, 0], fade: 0.8 }); }
    popUps(list, t);
  }
}
// --- zone: a volume that stays where you put it and works on whatever is inside.
function castZone(key, m, c) {
  const d = c.dir.clone().normalize(), t = c.t;
  const mark = aimAssist(c.hand, d, 0.4, t);
  const wall = collide(c.hand, c.hand.clone().addScaledVector(d, 4));
  const centre = mark ? mark.group.position.clone() : wall ? wall.point.clone().addScaledVector(wall.normal, m.radius * 0.6) : c.hand.clone().addScaledVector(d, 3);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), energyMat(key, { scale: [2.5, 2.5, 2.5], flow: [0.3, 0.5, 0.2], cut: 0.12 }));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 6, 60), glowMat(ELEMENTS[key].color.clone(), 0.6));
  ball.position.copy(centre); rim.position.copy(centre);
  play(SFX.zone);
  const until = t + m.seconds, last = new Map(), epoch = shapeEpoch;
  addEffect([ball, rim], (n) => {
    if (epoch !== shapeEpoch) return false;
    const k = Math.min((n - t) / 0.3, 1) * Math.min((until - n) / 0.5, 1);
    ball.scale.setScalar(Math.max(m.radius * k, 0.01)); rim.scale.setScalar(Math.max(m.radius * k, 0.01));
    rim.lookAt(viewerPos);
    if (Math.random() < 0.5) puff(key, _np.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(m.radius * 1.6).add(centre), 1, 0.3, {});
    for (const e of echoes) {
      if (e.down || e.group.position.distanceTo(centre) > m.radius) continue;
      e.blindUntil = Math.max(e.blindUntil, n + 0.5);
      if (n - (last.get(e) || -9) > 1.1) { last.set(e, n); hit(e, key, n, ZERO, { ...m, damage: 1, kind: 'void' }); }
    }
    for (const o of objects) if (!o.dead && o.hostile && o.pos.distanceTo(centre) < m.radius) { o.dead = true; puff(key, o.pos, 8, 1, {}); }   // what is thrown into the dark does not come out
    return n < until;
  });
}
const KIND = { zone: castZone, legion: castLegion, lance: castLance, bolt: castBolt, cone: castCone, column: castColumn, ring: castRing, wall: castWall, fault: castFault, beam: castBeam, void: castVoid, whip: castWhip };

// Both hands together: the same move, bigger and one point harder.
function empowered(key, m, power) {
  const out = { ...m, power, damage: (m.damage ?? (key === 'terra' ? 2 : 1)) + 1 };
  for (const k of ['radius', 'range', 'width', 'height', 'maxR', 'length']) if (out[k]) out[k] *= 1.5;
  if (out.angle) out.angle *= 1.2;
  if (out.chain) out.chain += 2;
  return out;
}

let lastCast = null;
let selected = 'terra';
let hudNote = 'open palm toward you: pick';

// c: { hand, dir, eye, fwd, ground, t, power }. ground is only needed for slam; power above 1 is a two-handed cast.
// What a creature looks like beyond its core: legs, wings, horns, crystals. Built when its kind is decided.
function dressEcho(e) {
  if (e.extra) { e.group.remove(e.extra); e.extra.traverse(c => { if (c.geometry) c.geometry.dispose(); }); }
  e.extra = null; e.wings = null; e.spin = null;
  const K = KINDS[e.kind];
  if (!K || e.kind === 'plain') return;
  if (!e.extraMat) e.extraMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, side: THREE.DoubleSide });
  e.extraMat.color.set(K.colour);
  const g = e.extra = new THREE.Group(), M = e.extraMat;
  const add = (geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, parent = g) => { const m = new THREE.Mesh(geo, M); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.renderOrder = 6; parent.add(m); return m; };
  const R = 0.16;
  if (e.kind === 'crawler') {                       // six legs, low and wide
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const hip = new THREE.Group(); hip.rotation.y = a; g.add(hip); add(new THREE.CylinderGeometry(0.008, 0.012, 0.22, 4).translate(0, -0.11, 0), R, 0, 0, 0, 0, -0.9, hip); }
    add(new THREE.SphereGeometry(R * 0.9, 10, 6).scale(1.2, 0.35, 1.2));
  } else if (e.kind === 'flyer') {                  // two wings that beat
    e.wings = [1, -1].map(side => { const w = new THREE.Group(); g.add(w); add(new THREE.ConeGeometry(0.11, 0.34, 3).scale(1, 1, 0.06).rotateZ(-side * Math.PI / 2).translate(side * 0.22, 0, 0), 0, 0, 0, 0, 0, 0, w); return w; });
    add(new THREE.ConeGeometry(0.03, 0.2, 4).rotateX(-Math.PI / 2), 0, 0, -0.2);
  } else if (e.kind === 'brute') {                  // horns and a belt of plates
    for (const side of [1, -1]) add(new THREE.ConeGeometry(0.035, 0.16, 5), side * 0.11, 0.17, 0.03, 0, 0, -side * 0.6);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; add(new THREE.BoxGeometry(0.09, 0.11, 0.02), Math.cos(a) * 0.2, -0.03, Math.sin(a) * 0.2, 0, -a + Math.PI / 2, 0); }
  } else if (e.kind === 'frost') {                  // crystal growing out of it
    e.spin = new THREE.Group(); g.add(e.spin);
    for (let i = 0; i < 7; i++) { const d = new THREE.Vector3(Math.sin(i * 2.4) * Math.cos(i), Math.cos(i * 2.4), Math.sin(i * 2.4) * Math.sin(i)).normalize(); const sp = add(new THREE.OctahedronGeometry(0.035).scale(1, 3.2, 1), d.x * 0.19, d.y * 0.19, d.z * 0.19, 0, 0, 0, e.spin); sp.quaternion.setFromUnitVectors(UP, d); }
  } else if (e.kind === 'shade') {                  // a hood, and tatters underneath
    add(new THREE.ConeGeometry(0.2, 0.3, 7, 1, true), 0, 0.1, 0);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; add(new THREE.ConeGeometry(0.03, 0.22, 3).rotateX(Math.PI), Math.cos(a) * 0.12, -0.24, Math.sin(a) * 0.12); }
  } else if (e.kind === 'ember') {                  // tongues of flame standing off it
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; add(new THREE.ConeGeometry(0.035, 0.18 + (i % 2) * 0.08, 4), Math.cos(a) * 0.11, 0.2, Math.sin(a) * 0.11, Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4); }
  } else if (e.kind === 'drip') {                   // a drop: a tail that points up, a skirt of drips
    add(new THREE.ConeGeometry(0.1, 0.28, 10), 0, 0.24, 0);
    for (let i = 0; i < 3; i++) add(new THREE.SphereGeometry(0.025, 6, 5), Math.cos(i * 2.1) * 0.1, -0.24 - i * 0.03, Math.sin(i * 2.1) * 0.1);
  } else if (e.kind === 'pebble') {                 // lumps of rock stuck to it
    for (let i = 0; i < 6; i++) add(new THREE.DodecahedronGeometry(0.05 + (i % 3) * 0.015), Math.cos(i * 1.9) * 0.17, Math.sin(i * 1.3) * 0.14, Math.sin(i * 1.9) * 0.17, i, i * 2, 0);
  } else if (e.kind === 'wisp') {                   // nothing but two rings turning
    e.spin = new THREE.Group(); g.add(e.spin);
    add(new THREE.TorusGeometry(0.2, 0.008, 5, 30), 0, 0, 0, 1.1, 0, 0, e.spin); add(new THREE.TorusGeometry(0.24, 0.006, 5, 30), 0, 0, 0, -0.7, 0.5, 0, e.spin);
  }
  e.group.add(g);
}
// Armour: for a few seconds, what is thrown at you breaks on you.
let armourUntil = -1;
function armour(t, seconds) { armourUntil = Math.max(armourUntil, t + seconds); play(SFX.guard); hudNote = 'armoured'; }
// Anything standing that you made, you can move: an open-palm shove at your own wall slides it where you push.
// It stays a wall. It hits what it passes through. (A punch still breaks it loose, the way it always did.)
function shoveBarrier(key, c) {
  const d = flat(c.dir, c.fwd);
  const seen = collide(c.hand, c.hand.clone().addScaledVector(c.dir.clone().normalize(), 2.6));
  const b = seen && seen.object.userData.barrier;
  if (!b || !b.alive || b.key !== key || !b.like) return false;
  const from = b.like.position.clone(), to = from.clone().addScaledVector(d, 1.6), t0 = c.t, struck = new Set();
  thump(); play(SFX[key].shove);
  addEffect([], (n) => {
    if (!b.alive) return false;
    const k = Math.min((n - t0) / 0.35, 1);
    b.like.position.lerpVectors(from, to, k * (2 - k));
    b.collider.position.copy(b.like.position); b.collider.updateMatrixWorld(true);
    for (const e of echoes) if (!e.down && !struck.has(e) && Math.hypot(e.group.position.x - b.like.position.x, e.group.position.z - b.like.position.z) < 0.8) { struck.add(e); hit(e, key, n, d, { damage: 1, kind: 'wall' }); }
    return k < 1;
  });
  hudNote = 'moved it'; lastCast = key; drawHud();
  return true;
}
function cast(key, gesture, c) {
  let m = MOVES[key][gesture];
  if (!m) return;
  if (gesture === 'shove' && c.hand && !c.quiet && shoveBarrier(key, c)) return;
  barrierKey = key;
  if (m.kind === 'ring' && m.summon) raiseThrall((c.ground || c.hand).clone().setY((c.ground || c.hand).y + 0.5), c.t);
  if (c.st && key === 'lumen' && gesture === 'sweep') summonBlade(c.st, c.t);
  if (!c.quiet) noteGesture(`${gesture} > ${m.name}`);
  if (m.kind === 'grip') return;                    // holds are driven by beginHold / updateHold, not cast here
  if (key === 'terra' && terraForm !== 'rock') {      // the same move, made of something else
    m = { ...m, form: terraForm };
    if (terraForm === 'sand') { m.damage = 1; if (m.kind === 'bolt') m.pierce = true; }
    if (terraForm === 'metal' && m.kind === 'bolt') m.bounces = (m.bounces || 0) + 2;
  }
  const form = key === 'terra' ? null : forms[key];
  if (form && form !== FORMS[key][0]) {
    m = { ...m, form };
    if (form === 'ice') {
      m.freeze = true;
      if (m.shape === 'blob') m.shape = 'shard';
      if (m.kind === 'wall') { m.passThrough = false; m.stand = 20; }     // a wall of ice stays where you raise it
      if (m.kind === 'column') m.stand = 12;
    }
    if (form === 'steam') m.steam = true;
    if (form === 'lightning') { m.volt = true; if (m.kind === 'bolt') m.speed *= 1.6; }
    if (form === 'blast') { m.noBurn = true; if (m.kind === 'bolt' && !m.blast) m.blast = 0.8; }
    if (form === 'vacuum') m.from = c.eye.clone();
    if (form === 'sound') m.sonic = true;
    if (form === 'prism') { if (m.kind === 'bolt') m.bounces = (m.bounces || 0) + 3; if (m.kind === 'beam') m.chain = (m.chain || 0) + 2; if (m.kind === 'cone') m.angle *= 1.3; }
    if (form === 'shadow') m.shadow = true;
    if (form === 'float') m.launch = true;
    if (form === 'crush') m.crush = true;
    if (form === 'thorn') { m.damage = (m.damage || 1) + 1; m.bleed = true; }
    if (form === 'spore') m.spore = true;
    if (form === 'night') m.shadow = true;
    if (form === 'storm') { m.volt = true; m.rain = true; }
    if (form === 'shell') m.armour = Math.max(m.armour || 0, 2);
    if (form === 'venom') m.venom = true;
    if (form === 'fear') m.fear = true;
    if (form === 'hollow') m.hollow = true;
    if (form === 'plague') m.venom = true;
    if (form === 'spirit') m.sonic = true;
  }
  if (m.armour) armour(c.t, m.armour);
  if (m.sky) {                                     // it comes down on what you are aiming at, not out of your hand
    const mark = aimAssist(c.hand, c.dir.clone().normalize(), 0.3, c.t);
    const wall = collide(c.hand, c.hand.clone().addScaledVector(c.dir.clone().normalize(), 9));
    const at = mark ? mark.group.position.clone() : wall ? wall.point.clone() : c.hand.clone().addScaledVector(c.dir.clone().normalize(), 4);
    const roof = collide(at.clone().setY(at.y + 0.2), at.clone().setY(at.y + 3.2));
    const top = at.clone().setY(roof ? roof.point.y - 0.15 : at.y + 3);
    if (m.shower && !c.one) {                       // several, scattered round the mark, one after another
      for (let i = 1; i < m.shower; i++) {
        const off = new THREE.Vector3((Math.random() - 0.5) * 1.6, 0, (Math.random() - 0.5) * 1.6), when = c.t + i * 0.16;
        let done = false;
        addEffect([], (n) => { if (!done && n >= when) { done = true; castBolt(key, { ...m, shower: 0, sky: false }, { ...c, one: true, t: n, hand: top.clone().add(off), dir: at.clone().add(off).sub(top.clone().add(off)).normalize(), scale: 1 }); } return !done; });
      }
    }
    c.hand = top; c.dir = at.clone().sub(top).normalize();
    if (m.kind === 'beam') zap(top, at, c.t);
    m = { ...m, sky: false };
  }
  if (key === 'aqua' && gesture === 'charge') {      // everything you gathered goes in one throw
    m = { ...m, damage: 1 + Math.floor(water.amount / 2), splash: 1 + water.amount * 0.25 };
    c.scale = 1 + water.amount * 0.3;
    if (water.amount > 0.3) c.hand = water.pos.clone();
    water.amount = 0;
  }
  if (key === 'aqua' && gesture !== 'charge' && water.amount < 1 && sources.length && (m.kind === 'bolt' || m.kind === 'cone' || m.kind === 'whip')) {
    // Nothing carried, but there is water in the room: the move comes straight out of the nearest source you can see.
    let best = null, bestScore = 1.0;
    for (const sc of sources) {
      const to = sc.pos.clone().sub(c.eye);
      const score = to.angleTo(c.fwd) + to.length() * 0.05;
      if (to.length() < 9 && score < bestScore && lineOfSight(c.eye, sc.pos.clone().addScaledVector(sc.normal, 0.15))) { bestScore = score; best = sc; }
    }
    if (best) {
      const from = best.pos.clone().addScaledVector(best.normal, 0.25);
      const mark = aimAssist(c.hand, c.dir.clone().normalize(), 0.3, c.t);
      const at = mark ? mark.group.position.clone() : c.hand.clone().addScaledVector(c.dir.clone().normalize(), 5);
      c.hand = from; c.dir = at.sub(from).normalize();
      c.power = Math.max(c.power || 1, 1.5); c.wet = true;
      puff('aqua', from, 30, 2.2, { dir: best.normal, spread: 0.8 });
      best.until -= 4;                               // it costs the source some of its life
    }
  }
  if (key === 'aqua' && water.amount >= 1) {         // carried water: the move leaves from it, and is the stronger for it
    water.amount -= 1;
    c.power = Math.max(c.power || 1, 1.5);
    if (m.kind === 'bolt' || m.kind === 'whip' || m.kind === 'cone') c.hand = water.pos.clone();
    c.wet = true;
  }
  if (c.power > 1) m = empowered(key, m, c.power);
  if (c.quiet) { const f = FAMILIAR_NOTE[key] || 500; tone(f, f * 0.6, 0.1, 0.07, key === 'terra' || key === 'gravis' ? 'sine' : 'triangle'); KIND[m.kind](key, m, c); return; }
  lastCast = key;
  moveSound(key, gesture, m.form);
  hudNote = (c.wet ? 'full ' : c.power > 1 ? 'twin ' : '') + (m.form ? m.form + ' ' : '') + m.name.toLowerCase();
  drawHud();
  KIND[m.kind](key, m, c);
}

// ---------- objects: loose things in the room ----------
// Simple bodies: a sphere each for collision, gravity, bounce off the real room.
// Anything moving fast hurts the echo it runs into, so every shove and toss matters.
const OBJ = {
  crate: { r: 0.2,  mass: 1,   bounce: 0.3,  key: 'aero',  burns: true },                // wood: light, catches fire
  keg:   { r: 0.2,  mass: 1.2, bounce: 0.3,  key: 'pyro',  explodes: true },             // goes off when lit or hit hard
  stone: { r: 0.2,  mass: 2.5, bounce: 0.2,  key: 'terra', earth: true },                // heavy
  ball:  { r: 0.13, mass: 2,   bounce: 0.6,  key: 'terra', earth: true },                // steel: heavy and lively
  bigcrate: { r: 0.36, mass: 3, bounce: 0.25, key: 'aero',  burns: true },               // a shipping crate
  boulder:  { r: 0.42, mass: 6, bounce: 0.15, key: 'terra', earth: true },               // takes real effort to move
  anvil:    { r: 0.22, mass: 5, bounce: 0.25, key: 'terra', earth: true },               // a block of iron
  shard:    { r: 0.09, mass: 0.5, bounce: 0.3, key: 'terra', earth: true },              // what the creatures spit
  barrel:   { r: 0.26, mass: 2, bounce: 0.25, key: 'aqua', water: true },                // full of water: break it and you have a source
  ice:      { r: 0.17, mass: 1.5, bounce: 0.2, key: 'aqua', ice: true },                 // frozen water: slides, freezes what it hits, melts back
  steam:    { r: 0.6, mass: 0.4, bounce: 0, key: 'aero', cloud: true },                  // boiled water: scalds, drifts, can be blown or held
  sand:     { r: 0.6, mass: 0.7, bounce: 0, key: 'terra', earth: true, cloud: true },    // ground stone: blinds what is inside it
};
const HEAT_TIME = 10;                               // seconds stone and steel stay hot
const ROUND_OBJECTS = ['crate', 'crate', 'bigcrate', 'keg', 'keg', 'barrel', 'barrel', 'stone', 'stone', 'boulder', 'ball', 'anvil'];
const MAX_OBJECTS = 24;
const GRIP = { aero: 'Wind Grip', aqua: 'Water Grip', terra: 'Unearth', pyro: 'Fireball', lumen: 'Sunburst', gravis: 'Gravity Grip', flora: 'Vine Grip', astra: 'Meteor Shower', morph: 'Grapple', umbra: 'Black Sun', necro: 'Legion' };
const objects = [];
const objGroup = new THREE.Group();
scene.add(objGroup);

function objectMesh(kind) {
  if (kind === 'crate') return new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32, 3, 3, 3), stoneMat(false, { dark: 0x2b1708, light: 0x8f5c2a, seam: 0x1a0d04, amt: 0.9, grain: [1.5, 22, 1.5] }));
  if (kind === 'ice') {
    const g = craggy(new THREE.IcosahedronGeometry(0.17, 1), 0.07); g.computeVertexNormals();
    return new THREE.Mesh(g, waterMat({ flow: [0, 0, 0], scale: [10, 10, 10], amp: 0, body: 0.45 }));
  }
  if (OBJ[kind].cloud) return new THREE.Mesh(new THREE.SphereGeometry(0.01, 4, 3), glowMat(STEAM, 0));
  if (kind === 'barrel') return new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 14, 4), stoneMat(false, { dark: 0x1c2a30, light: 0x5f7f88, seam: 0x10181c, amt: 0.9, grain: [2, 14, 2] }));
  if (kind === 'keg') return new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.36, 12, 3), stoneMat(false, { dark: 0x3a0a06, light: 0xc22d18, seam: 0xffc21a, amt: 0.9, grain: [3, 9, 3] }));
  if (kind === 'ball') return new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 2), stoneMat(true));
  if (kind === 'shard') {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0).scale(0.7, 0.7, 1.6), glowMat(HOSTILE, 0.95));
    m.renderOrder = 14;
    return m;
  }
  if (kind === 'bigcrate') return new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.58, 0.58, 4, 4, 4), stoneMat(false, { dark: 0x24140a, light: 0x7a5228, seam: 0x140a03, amt: 0.9, grain: [1.2, 16, 1.2] }));
  if (kind === 'boulder') return new THREE.Mesh(craggy(new THREE.IcosahedronGeometry(0.42, 2), 0.13), stoneMat());
  if (kind === 'anvil') return new THREE.Mesh(craggy(new THREE.BoxGeometry(0.36, 0.26, 0.26, 3, 2, 2), 0.02), stoneMat(true));
  return new THREE.Mesh(craggy(new THREE.DodecahedronGeometry(0.2, 1), 0.07), stoneMat());
}
function spawnObject(kind, pos) {
  if (objects.filter(o => !o.dead).length >= MAX_OBJECTS) {         // keep the room from filling up: retire the oldest loose one
    const old = objects.find(o => !o.dead && !o.held && !o.hostile);
    if (old) old.dead = true;
  }
  const mesh = objectMesh(kind);
  mesh.position.copy(pos);
  mesh.rotation.y = Math.random() * 6.28;
  objGroup.add(mesh);
  const o = { kind, def: OBJ[kind], mesh, pos: pos.clone(), vel: new THREE.Vector3(), rest: false, held: false, dead: false,
    burnUntil: -1, fuse: -1, hitT: -9 };
  objects.push(o);
  return o;
}
function destroyObject(o, t) {
  if (o.dead) return;
  o.dead = true;
  puff(o.def.key === 'pyro' ? 'pyro' : 'terra', o.pos, 34, 3.2, { up: 1.5 });
  fume(DUST, o.pos, 5, { size: 0.3, jitter: 0.4 });
  thud();
  if (o.def.water) {                                // it spills, and what it spills on stays wet
    puff('aqua', o.pos, 60, 3, { up: 2 });
    const under = nearestRoomSurface(o.pos, 2.5);
    addSource(under ? under.point : o.pos.clone().setY(0), under ? under.normal : UP, t);
  }
}
function scatterObjects() {
  for (const o of objects) { objGroup.remove(o.mesh); o.mesh.geometry.dispose(); o.mesh.material.dispose(); }
  objects.length = 0;
  const box = roomBounds();
  const eye = spawnEye(), taken = [];
  const top = new THREE.Vector3(), bottom = new THREE.Vector3(), at = new THREE.Vector3();
  for (const kind of ROUND_OBJECTS) {
    const r = OBJ[kind].r;
    let placed = false;
    for (let i = 0; i < 40 && !placed; i++) {
      // Drop a line from head height: the object starts on whatever it lands on, table, couch or floor,
      // but only where it has room, is not jammed into a wall or another object, and can be seen.
      top.set(THREE.MathUtils.lerp(box.min.x, box.max.x, Math.random()), 1.9, THREE.MathUtils.lerp(box.min.z, box.max.z, Math.random()));
      const under = collide(top, bottom.copy(top).setY(-0.05));
      const y = under && under.normal.y > 0.7 ? under.point.y : 0;
      at.set(top.x, y + r + 0.01, top.z);
      if (taken.some(q => q.distanceTo(at) < r + 0.5)) continue;
      if (!isOpen(at, r + 0.08, eye, false)) continue;
      spawnObject(kind, at.clone()).rest = true;
      taken.push(at.clone());
      placed = true;
    }
  }
}
function spawnCloud(kind, pos, t, life = 9) {
  const o = spawnObject(kind, pos);
  o.until = t + life;
  fume(kind === 'steam' ? STEAM : SAND, pos, 16, { size: 0.4, jitter: 0.7, life: 1.6 });
  return o;
}
// Phase changes of water.
function freezeSource(src, t) {
  const i = sources.indexOf(src);
  if (i < 0) return;
  sources.splice(i, 1); scene.remove(src.mesh); src.mesh.geometry.dispose(); src.mesh.material.dispose();
  for (let k = 0; k < 2; k++) spawnObject('ice', src.pos.clone().addScaledVector(src.normal, 0.2).add(new THREE.Vector3((k - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.2)));
  puff('aqua', src.pos, 30, 1.6, { dir: src.normal, spread: 0.9 });
  tone(1900, 2600, 0.2, 0.08, 'triangle');
  hudNote = 'water to ice'; drawHud();
}
function evaporate(src, t) {
  const i = sources.indexOf(src);
  if (i < 0) return;
  sources.splice(i, 1); scene.remove(src.mesh); src.mesh.geometry.dispose(); src.mesh.material.dispose();
  spawnCloud('steam', src.pos.clone().addScaledVector(src.normal, 0.55), t);
  tone(1400, 400, 0.6, 0.06, 'sawtooth');
  hudNote = 'water to steam'; drawHud();
}
// Fire reaching a place: boils any water standing there.
function heatAt(point, radius, t) {
  for (const src of [...sources]) if (src.pos.distanceTo(point) < radius) evaporate(src, t);
}
function ignite(o, t) {
  if (o.dead) return;
  if (o.def.ice) {                                  // ice melts back to standing water
    o.dead = true;
    const under = nearestRoomSurface(o.pos, 2.5);
    addSource(under ? under.point : o.pos.clone().setY(0), under ? under.normal : UP, t, 20);
    hudNote = 'ice to water'; drawHud();
    return;
  }
  if (o.def.earth && !o.def.cloud && o.kind !== 'shard') {                // stone and steel take the heat and keep it
    if (!(o.heat > t)) { hudNote = o.kind === 'ball' || o.kind === 'anvil' ? 'red hot' : 'molten'; drawHud(); }
    o.heat = t + HEAT_TIME;
    return;
  }
  if (o.def.explodes) { if (o.fuse < 0) o.fuse = t + 0.35; }
  else if (o.def.burns && o.burnUntil < 0) o.burnUntil = t + 2.5;
}
// Push on an object. Wakes it if it was resting.
function kick(o, x, y, z) { o.vel.x += x / o.def.mass; o.vel.y += y / o.def.mass; o.vel.z += z / o.def.mass; o.rest = false; turn(o); }
// Aim a turned shard at the creature that fired it, with enough lift to cancel the drop on the way.
function sendBack(o, speed) {
  const to = o.owner.group.position;
  const flight = to.distanceTo(o.pos) / speed;
  o.vel.copy(to).sub(o.pos).normalize().multiplyScalar(speed);
  o.vel.y += 4.9 * flight;
  o.rest = false;
}
// A hostile shard that you have touched with anything is yours now, and hits harder going back.
function turn(o) { if (o.hostile) { o.hostile = false; o.turned = true; } }

// A lot of water landing at once: soaks and knocks what is near, and leaves the place wet.
function splash(point, t, radius) {
  const centre = point.clone();
  puff('aqua', centre, 90, radius * 3.5, { up: 2.5 });
  thump();
  const under = nearestRoomSurface(centre, 2.5);
  addSource(under ? under.point : centre.clone().setY(0), under ? under.normal : UP, t, 25);
  quench(centre, radius, t);
  for (const e of echoes) if (isLive(e, t) && e.group.position.distanceTo(centre) < radius) hit(e, 'aqua', t, e.group.position.clone().sub(centre).normalize(), { damage: 1, kind: 'wall' });
  for (const o of objects) {
    if (o.dead || o.held || o.def.cloud || o.pos.distanceTo(centre) > radius * 1.2) continue;
    const away = o.pos.clone().sub(centre).normalize();
    kick(o, away.x * 4, 2, away.z * 4);
    if (o.burnUntil > 0) o.burnUntil = -1;         // and puts out what was burning
  }
}
// A boulder coming down: the ground jumps, loose things with it.
function quake(point, t, radius) {
  const centre = point.clone();
  firePulse(centre);
  puff('terra', centre, 60, 3.2, { up: 2.5 });
  fume(DUST, centre, 12, { size: 0.45, jitter: radius, rise: 0.6, life: 2.2 });
  for (const e of echoes) if (isLive(e, t) && e.group.position.distanceTo(centre) < radius) hit(e, 'terra', t, UP, { damage: 1, launch: true });
  for (const o of objects) if (!o.dead && !o.held && !o.def.cloud && o.pos.distanceTo(centre) < radius * 1.3) kick(o, 0, 5, 0);
  spawnObject('stone', centre.clone().setY(Math.max(centre.y, 0.2)));
}
// Gravity folding in on a point: everything near is dragged to it, and hurt when it gets there.
function implode(point, radius, t, dmg = 1, key = 'gravis') {
  const centre = point.clone();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), energyMat(key, { scale: [5, 5, 5], flow: [0, -1.2, 0], cut: 0.3 }));
  ball.position.copy(centre);
  thump(); tone(60, 220, 0.4, 0.4, 'sine');
  for (let i = 0; i < thinned(40); i++) {           // motes falling inward
    _np.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(radius);
    particles.emit(_nt.copy(centre).add(_np), _np.multiplyScalar(-3), PCOL.gravis[i % 3], 0.022, 0.32, 0, 0);
  }
  addEffect([ball], (n) => {
    const k = (n - t) / 0.35;
    ball.scale.setScalar(Math.max(radius * (1 - k), 0.01));
    ball.material.opacity = Math.min(k * 3, 1);
    return k < 1;
  });
  for (const e of echoes) {
    if (!isLive(e, t)) continue;
    const away = e.group.position.clone().sub(centre), d = away.length();
    if (d > radius) continue;
    away.normalize();
    e.vel.x -= away.x * 4; e.vel.z -= away.z * 4;
    if (key === 'umbra') hit(e, 'umbra', t, away.negate(), { damage: dmg, kind: 'void', fear: forms.umbra === 'fear', hollow: forms.umbra === 'hollow' });
    else hit(e, 'gravis', t, away.negate(), { damage: dmg, kind: 'void', launch: forms.gravis === 'float', crush: forms.gravis === 'crush' });
  }
  for (const o of objects) {
    if (o.dead || o.held || o.pos.distanceTo(centre) > radius * 1.3) continue;
    const to = centre.clone().sub(o.pos).normalize();
    kick(o, to.x * 6, forms.gravis === 'float' ? 6 : 2, to.z * 6);
  }
}
// A blast: hurts echoes, throws objects, lights what can burn.
function explode(point, key, radius, t, dmg, noBurn = false) {
  const centre = point.clone();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), energyMat('pyro', { scale: [4, 4, 4], flow: [0, 0.6, 0], cut: 0.22 }));
  ball.position.copy(centre);
  puff('pyro', centre, 80, radius * 4, { life: 0.5 });
  addLight(centre, FIRE_LIGHT, 3.2, 0.6);
  fume(SMOKE, centre, 10, { size: 0.5, jitter: radius, rise: 0.9, life: 2.2 });
  if (key === 'pyro') heatAt(centre, radius, t);
  thump(); tone(260, 40, 0.5, 0.35, 'sawtooth');
  addEffect([ball], (n) => {
    const k = (n - t) / 0.32;
    ball.scale.setScalar(0.1 + radius * Math.min(k, 1));
    ball.material.opacity = Math.max(1 - k, 0);
    return k < 1;
  });
  for (const e of echoes) {
    if (isLive(e, t) && e.group.position.distanceTo(centre) < radius) hit(e, key, t, e.group.position.clone().sub(centre).normalize(), { damage: dmg, noBurn });
  }
  for (const o of objects) {
    if (o.dead || o.held) continue;
    const away = o.pos.clone().sub(centre), dist = away.length();
    if (dist > radius * 1.3) continue;
    away.normalize();
    kick(o, away.x * 6, 3.5, away.z * 6);
    if (key === 'pyro') ignite(o, t);
    if (o.def.water && dist < radius * 0.7) destroyObject(o, t);
  }
}

// Air closing around something until it gives.
function crushObject(o, t) {
  const p = o.pos.clone();
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), glowMat(ELEMENTS.aero.color, 0.6));
  shell.material.wireframe = true;
  shell.position.copy(p);
  addEffect([shell], (n) => { const k = (n - t) / 0.18; shell.scale.setScalar(Math.max(0.45 * (1 - k), 0.02)); shell.rotation.y += 0.4; return k < 1; });
  if (o.def.explodes) { o.dead = true; explode(p, 'pyro', 1.7, t, 2); return; }
  destroyObject(o, t);
  if (o.kind === 'stone' || o.kind === 'boulder') { spawnCloud('sand', p, t, o.kind === 'boulder' ? 12 : 8); hudNote = 'stone to sand'; }
  const heavy = o.def.mass >= 2;
  for (const e of echoes) {                                // the pieces go everywhere
    if (isLive(e, t) && e.group.position.distanceTo(p) < 1.2) hit(e, heavy ? 'terra' : 'aero', t, e.group.position.clone().sub(p).normalize(), { damage: heavy ? 2 : 1 });
  }
}

const _on = new THREE.Vector3(), _op = new THREE.Vector3(), _od = new THREE.Vector3(), _oprev = new THREE.Vector3();
function updateObjects(t, dt) {
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    if (o.dead) { objGroup.remove(o.mesh); o.mesh.geometry.dispose(); o.mesh.material.dispose(); objects.splice(i, 1); continue; }
    const r = o.def.r;
    if (o.def.cloud) {                              // a cloud: no weight, drifts, slowly thins, does its work on what is inside
      if (t > o.until) { o.dead = true; continue; }
      if (!o.held) o.vel.multiplyScalar(Math.max(1 - 1.3 * dt, 0));
      o.vel.clampLength(0, 3.5);                    // it drifts; it does not fly
      o.pos.addScaledVector(o.vel, dt);
      const cbox = roomBounds();                    // and it stays in the room
      o.pos.set(THREE.MathUtils.clamp(o.pos.x, cbox.min.x, cbox.max.x), THREE.MathUtils.clamp(o.pos.y, 0.45, 2.1), THREE.MathUtils.clamp(o.pos.z, cbox.min.z, cbox.max.z));
      const thin = Math.min((o.until - t) / 2, 1);
      if (Math.random() < 0.55 * thin) fume(o.kind === 'steam' ? STEAM : SAND, o.pos, 1, { size: 0.42, jitter: r * 1.5, life: 1.3, rise: o.kind === 'steam' ? 0.25 : 0, speed: 0.3 });
      for (const e of echoes) {
        if (e.down || e.home.distanceTo(o.pos) > r + 0.15) continue;
        if (o.kind === 'sand') { e.blindUntil = t + 0.7; reveal(e, t, 1.2, SAND); }
        else if (t - (e.scaldT || -9) > 0.9) { e.scaldT = t; reveal(e, t, 2, STEAM); hudNote = 'scald'; hit(e, 'pyro', t, ZERO, { damage: 1, noBurn: true }); }
      }
      o.mesh.position.copy(o.pos);
      continue;
    }
    const hot = o.heat > t;
    if (o.mesh.material.uniforms && o.mesh.material.uniforms.uHeat) o.mesh.material.uniforms.uHeat.value = hot ? Math.min((o.heat - t) / 2.5, 1) : 0;
    if (hot && Math.random() < 0.4) puff('pyro', o.pos, 1, 0.5, { up: 1, jitter: r });
    if (hot) lightNow(o.pos, LAVA_LIGHT, Math.min((o.heat - t) / 2.5, 1) * (0.5 + r));
    if (o.fuse > 0) {
      puff('pyro', o.pos, 2, 1.5, { up: 2, life: 0.25 });
      if (t >= o.fuse) { const p = o.pos.clone(); o.dead = true; explode(p, 'pyro', 1.7, t, 2); continue; }
    }
    if (o.burnUntil > 0) {
      lightNow(o.pos, FIRE_LIGHT, 1.1);
      puff('pyro', o.pos, 2, 0.6, { up: 1.6, jitter: 0.25 });
      if (Math.random() < 0.3) fume(SMOKE, _op.copy(o.pos).setY(o.pos.y + 0.3), 1, { rise: 1.1, size: 0.32, life: 2 });
      if (t >= o.burnUntil) {
        destroyObject(o, t);
        for (const e of echoes) if (isLive(e, t) && e.group.position.distanceTo(o.pos) < 0.9) hit(e, 'pyro', t, UP, { damage: 1 });
        continue;
      }
    }
    if (o.hostile) {                                // still theirs: flies straight at where you were standing
      o.pos.addScaledVector(o.vel, dt);
      o.mesh.lookAt(_op.copy(o.pos).add(o.vel));
      o.mesh.position.copy(o.pos);
      if (Math.random() < 0.6) particles.emit(o.pos, _od.set(0, 0, 0), HOSTILE, 0.03, 0.25, 0, 0);
      const wall = collide(_on.copy(o.pos).addScaledVector(o.vel, -dt), o.pos);
      if (wall || o.pos.y < r || t - o.born > 9) {
        const hitB = wall && wall.object.userData.barrier;
        if (hitB && hitB.reflect && o.owner && !o.owner.down) {     // rings off steel and goes back where it came from
          turn(o);
          o.pos.copy(wall.point).addScaledVector(wall.normal, 0.12);
          sendBack(o, 8);
          tone(1800, 1200, 0.2, 0.15, 'triangle'); hudNote = 'rang off steel'; drawHud();
          continue;
        }
        if (hitB) { hitB.damage(t); if (o.heavy) hitB.damage(t); }
        o.dead = true; tick();
        for (let k = 0; k < 14; k++) particles.emit(o.pos, _od.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(3), HOSTILE, 0.03, 0.3, 4, 1);
      } else if (o.pos.distanceTo(viewerPos) < 0.3) { o.dead = true; playerHurt(t); }
      continue;
    }
    if (!o.rest) {
      _oprev.copy(o.pos);
      if (!o.held) o.vel.y -= 9.8 * dt;
      const speed = o.vel.length();
      if (speed > 1e-4) {
        _od.copy(o.vel).divideScalar(speed);
        _on.copy(o.pos).addScaledVector(o.vel, dt);
        const wall = collide(o.pos, _op.copy(_on).addScaledVector(_od, r));
        if (wall) {
          o.pos.copy(wall.point).addScaledVector(wall.normal, r);
          const vn = o.vel.dot(wall.normal);
          o.vel.addScaledVector(wall.normal, -(1 + o.def.bounce) * vn).multiplyScalar(0.85);
          if (speed > 1.5) thud();
          if (o.def.explodes && speed > 7) ignite(o, t);
          if (!o.held && wall.normal.y > 0.7 && o.vel.length() < 0.6) { o.vel.set(0, 0, 0); o.rest = true; }
        } else o.pos.copy(_on);
      }
      // What is it standing on? Look straight down for a table top, a couch, the scanned floor.
      // The floor at height zero is always there, scanned or not.
      let groundY = 0;
      if (o.pos.y > r + 0.02) {
        const under = collide(_op.copy(o.pos).setY(o.pos.y + r * 0.5), _on.copy(o.pos).setY(o.pos.y - r - 0.03));
        groundY = under && under.normal.y > 0.5 ? under.point.y : -Infinity;
      }
      if (o.pos.y - r <= groundY + 0.001) {
        o.pos.y = groundY + r;
        if (o.vel.y < 0) { o.vel.y = o.vel.y < -1.2 ? -o.vel.y * o.def.bounce : 0; }
        if (!o.held) {
          const grip = Math.max(1 - (o.kind === 'ball' ? 0.8 : o.def.ice ? 0.5 : 3) * dt, 0);      // boxes scrape to a stop; the ball rolls and ice slides
          o.vel.x *= grip; o.vel.z *= grip;
          if (o.vel.length() < 0.25) { o.vel.set(0, 0, 0); o.rest = true; }
        }
      }
      o.mesh.rotation.x += o.vel.z * dt / r;
      o.mesh.rotation.z -= o.vel.x * dt / r;
      // Moving fast enough to hurt.
      if (speed > 2 && t - o.hitT > 0.3) {
        for (const e of echoes) {
          if (!isLive(e, t) || segmentDistance(e.group.position, _oprev, o.pos) > r + 0.14) continue;   // swept, so a fast throw cannot skip past
          o.hitT = t;
          if (o.def.ice) {                         // a thrown block of ice freezes what it hits, and breaks
            hit(e, 'aqua', t, _od, { damage: 1, freeze: true });
            o.dead = true; puff('aqua', o.pos, 30, 2.6, {});
            break;
          }
          hit(e, o.def.earth ? 'terra' : 'aero', t, _od, { damage: o.def.mass >= 2 || o.turned ? 2 : 1 });
          if (hot && !e.down) e.burnAt = t + 1.5;  // molten rock leaves it burning
          if (o.kind === 'shard') { o.dead = true; break; }
          if (o.def.explodes && speed > 4) ignite(o, t);
          o.vel.multiplyScalar(-0.35);
          break;
        }
      }
    }
    o.mesh.position.copy(o.pos);
  }
  // Objects against each other: push apart, trade speed along the line between them.
  for (let i = 0; i < objects.length; i++) {
    const a = objects[i];
    if (a.dead) continue;
    for (let j = i + 1; j < objects.length; j++) {
      const b = objects[j];
      if (b.dead || (a.rest && b.rest) || a.def.cloud || b.def.cloud) continue;
      if (a.hostile || b.hostile) {                 // a shard breaks on anything you put in its way
        if (a.pos.distanceTo(b.pos) < a.def.r + b.def.r) { (a.hostile ? a : b).dead = true; tick(); }
        continue;
      }
      _od.copy(b.pos).sub(a.pos);
      const gap = _od.length(), min = a.def.r + b.def.r;
      if (gap >= min || gap < 1e-4) continue;
      _od.divideScalar(gap);
      const wa = a.held ? 0 : 1 / a.def.mass, wb = b.held ? 0 : 1 / b.def.mass;
      if (wa + wb === 0) continue;
      const overlap = min - gap;
      a.pos.addScaledVector(_od, -overlap * wa / (wa + wb));
      b.pos.addScaledVector(_od, overlap * wb / (wa + wb));
      const closing = _on.copy(b.vel).sub(a.vel).dot(_od);
      if (closing < 0) {
        const jImp = -(1.3) * closing / (wa + wb);
        a.vel.addScaledVector(_od, -jImp * wa);
        b.vel.addScaledVector(_od, jImp * wb);
        if (closing < -1.5) thud();
        if (closing < -6) { if (a.def.explodes) ignite(a, t); if (b.def.explodes) ignite(b, t); }
      }
      a.rest = b.rest = false;
      if (a.heat > t && !b.def.earth) ignite(b, t);       // hot stone sets light to what it touches, and melts ice
      if (b.heat > t && !a.def.earth) ignite(a, t);
      a.mesh.position.copy(a.pos); b.mesh.position.copy(b.pos);
    }
  }
}

// ---------- water: sources, and the water you carry ----------
// Aqua works best with water to hand. Put an open palm on any surface and water wells up there for a while.
// While a source is running, water streams across the room to you and gathers at your hand, up to three measures.
// Each Aqua move spends one and comes out bigger and harder. With none, the moves still work, at half strength.
const sources = [];
const SOURCE_LIFE = 35, WATER_MAX = 4, WATER_FILL = 1.3;      // seconds a source runs; measures you can carry; seconds per measure
function addSource(point, normal, t, life = SOURCE_LIFE) {
  if (sources.length >= 4) { const old = sources.shift(); scene.remove(old.mesh); old.mesh.geometry.dispose(); old.mesh.material.dispose(); }
  const n = (normal || UP).clone().normalize();
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.42, 40, 0, Math.PI * 2), waterMat({ flow: [0.25, 0.2, 0], scale: [7, 7, 7], amp: 0, body: 0.12 }));
  mesh.position.copy(point).addScaledVector(n, 0.015);
  mesh.lookAt(mesh.position.clone().add(n));
  mesh.scale.setScalar(0.05);
  mesh.renderOrder = 11;
  scene.add(mesh);
  const src = { pos: point.clone().addScaledVector(n, 0.05), normal: n, born: t, until: t + life, mesh };
  sources.push(src);
  puff('aqua', src.pos, 26, 1.8, { dir: n, spread: 0.8 });
  castSound.aqua();
  return src;
}
function clearSources() {
  for (const s of sources) { scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); }
  sources.length = 0;
}
const water = { amount: 0, pos: new THREE.Vector3(), has: false };
const waterBlob = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), waterMat({ flow: [0, 0.4, 0], scale: [3, 3, 3], amp: 0.16, body: 0.07 }));
waterBlob.visible = false; waterBlob.renderOrder = 17;
scene.add(waterBlob);
const _ws = new THREE.Vector3(), _wv = new THREE.Vector3();
// anchor: where the carried water wants to float (beside the leading hand). Null when Aqua is not in use.
function updateWater(t, dt, anchor, boost = false) {
  for (let i = sources.length - 1; i >= 0; i--) {
    const s = sources[i];
    const left = s.until - t;
    if (left <= 0) { scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); sources.splice(i, 1); continue; }
    s.mesh.scale.setScalar(Math.min((t - s.born) / 0.8, 1) * Math.min(left / 2, 1));
    s.mesh.material.opacity = Math.min(left / 2, 1);
    if (Math.random() < 0.35) puff('aqua', s.pos, 1, 0.5, { dir: s.normal, spread: 0.6, life: 0.45, size: 0.018 });   // it keeps bubbling up
  }
  if (!anchor) {                                    // not bending water: what you carried falls
    if (water.amount > 0) { puff('aqua', water.pos, 30, 1.6, {}); water.amount = 0; }
    waterBlob.visible = false;
    return;
  }
  let near = null, nearDist = 14;
  for (const s of sources) { const d = s.pos.distanceTo(anchor); if (d < nearDist) { nearDist = d; near = s; } }
  const cap = boost ? WATER_MAX * 2 : WATER_MAX;
  if (!near && boost && water.amount < 2) water.amount = Math.min(water.amount + dt * 0.6, 2);   // wrung out of the air: slow, and not much
  if (near && water.amount < cap) {
    water.amount = Math.min(water.amount + dt / WATER_FILL * (boost ? 2.5 : 1), cap);
    for (let i = 0; i < 3; i++) {                   // the stream: drops leaving the source and arcing to you
      _wv.copy(water.pos).sub(near.pos);
      const flight = 0.55;
      _wv.divideScalar(flight); _wv.y += 0.5 * 5 * flight;         // cancels the fall over the flight
      _ws.copy(near.pos).add(_to.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.12));
      particles.emit(_ws, _wv, PCOL.aqua[i % 3], 0.026, flight, 5, 0);
    }
  }
  if (!water.has) water.pos.copy(anchor);
  water.has = true;
  water.pos.lerp(anchor, Math.min(dt * 5, 1));      // it lags and swings behind the hand like something with weight
  waterBlob.visible = water.amount > 0.05 && !stream.on;        // drawn out into a stream, it is not a ball any more
  waterBlob.position.copy(water.pos);
  waterBlob.scale.setScalar(0.028 + 0.022 * Math.min(water.amount, 3) + 0.012 * Math.max(water.amount - 3, 0));
}

// A whip of water: one long lash that sweeps across in front of you.
function castWhip(key, m, c) {
  const origin = c.hand.clone();
  const aim = flat(c.dir, c.fwd);
  const side = new THREE.Vector3(-aim.z, 0, aim.x);
  const reach = m.range, half = m.arc;
  const tilt = c.dir.clone().normalize().y;         // lash a little up or down, the way you were facing
  const tipAt = (k, out) => {                       // k runs 0..1 across the sweep
    const ang = (k * 2 - 1) * half;
    return out.copy(origin).addScaledVector(aim, Math.cos(ang) * reach).addScaledVector(side, Math.sin(ang) * reach).setY(origin.y + tilt * reach * Math.cos(ang));
  };
  const struck = new Set();
  const tip = new THREE.Vector3(), prevTip = tipAt(0, new THREE.Vector3()), mid = new THREE.Vector3();
  const whip = new THREE.Mesh(new THREE.BufferGeometry(), waterMat({ flow: [0, 3, 0], scale: [8, 3, 8], amp: 0, body: 0.35 }));
  const born = c.t, DUR = 0.3;
  let angPrev = -half;
  addEffect([whip], (t) => {
    const k = Math.min((t - born) / DUR, 1);
    tipAt(k, tip);
    // The cord: hand, a belly that lags behind the swing, the tip.
    mid.copy(origin).lerp(tip, 0.55).addScaledVector(side, -Math.cos(k * Math.PI) * reach * 0.22).setY((origin.y + tip.y) / 2 - 0.12);
    whip.geometry.dispose();
    whip.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([origin, origin.clone().lerp(mid, 0.5), mid, mid.clone().lerp(tip, 0.6), tip.clone()]), 22, 0.028 * (m.power || 1), 8, false);
    puff(key, tip, 3, 1.4, {});
    // Anything between the last tip position and this one, out to the reach, has been lashed.
    // Everything in the wedge the cord has swept since last frame, out to its reach, has been lashed.
    const angNow = (k * 2 - 1) * half;
    for (const e of echoes) {
      if (!isLive(e, t) || struck.has(e)) continue;
      const p = e.group.position;
      _to.copy(p).sub(origin);
      const ang = Math.atan2(_to.dot(side), _to.dot(aim));
      if (ang < angPrev - 0.12 || ang > angNow + 0.12 || Math.hypot(_to.dot(side), _to.dot(aim)) > reach + 0.25 || Math.abs(_to.y - tilt * reach) > 0.75) continue;
      if (!lineOfSight(origin, p)) continue;
      struck.add(e);
      hit(e, key, t, _to.copy(tip).sub(prevTip).normalize(), m);
    }
    angPrev = angNow;
    for (const o of objects) {
      if (o.dead || o.held || struck.has(o) || segmentDistance(o.pos, origin, tip) > o.def.r + 0.15) continue;
      struck.add(o);
      _to.copy(tip).sub(prevTip).normalize();
      kick(o, _to.x * 5, 1.5, _to.z * 5);
    }
    prevTip.copy(tip);
    whip.material.opacity = k < 1 ? 1 : Math.max(1 - (t - born - DUR) / 0.15, 0);
    return t - born < DUR + 0.15;
  });
}

// What a hold looks like: air wound round the thing, or water closed over it.
function makeWrap(key) {
  const g = new THREE.Group();
  if (key === 'aero') {
    // Three bands of wind at different tilts, each turning its own way.
    for (let i = 0; i < 3; i++) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.2, 10, 48), energyMat('aero', { flow: [1.2, 0, 0], scale: [2.2, 9, 2.2], cut: 0.38, opacity: 0.85 }));
      band.geometry.scale(1, 1, 0.5);
      band.rotation.set(i * 1.05, i * 0.7, 0);
      g.add(band);
    }
  } else {
    g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), waterMat({ flow: [0, 0.6, 0], scale: [3, 3, 3], amp: 0.1, body: 0.05 })));
  }
  g.renderOrder = 17;
  scene.add(g);
  return g;
}
const _orb = new THREE.Vector3(), _orbV = new THREE.Vector3();
function updateWrap(h, at, radius, t, dt) {
  if (!h.wrap) return;
  h.wrap.position.copy(at);
  if (h.key === 'aero') {
    h.wrap.scale.setScalar(radius * 1.45);
    h.wrap.children.forEach((band, i) => { band.rotation.z += dt * (5 + i * 1.7) * (i % 2 ? -1 : 1); band.rotation.x += dt * 0.6; });
    for (let i = 0; i < 3; i++) {                   // streaks racing round it
      const a = t * 11 + i * 2.094, tiltA = i * 1.05 + t * 0.6;
      _orb.set(Math.cos(a), Math.sin(a) * Math.sin(tiltA), Math.sin(a) * Math.cos(tiltA)).multiplyScalar(radius * 1.5);
      _orbV.set(-Math.sin(a), Math.cos(a) * Math.sin(tiltA), Math.cos(a) * Math.cos(tiltA)).multiplyScalar(2.2);
      particles.emit(_orb.add(at), _orbV, PCOL.aero[i], 0.02, 0.22, 0, 0);
    }
  } else {
    h.wrap.scale.setScalar(radius * 1.35 * (1 + 0.05 * Math.sin(t * 6)));
    if (Math.random() < 0.5) puff('aqua', at, 1, 0.3, { jitter: radius, life: 0.4, size: 0.016 });
  }
}
function dropHold(g) {
  const h = g.hold;
  if (h && h.wrap) { scene.remove(h.wrap); h.wrap.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); }
  if (h && h.e) h.e.puppet = false;
  g.hold = null;
}

// ---------- grip: holding on to something ----------
// Aero holds objects (and can crush them with the other fist). Aqua holds echoes, the water in them.
// Terra holds stone and steel, or tears a fresh boulder out of the floor. Pyro's version is a charged fireball.
const _ga = new THREE.Vector3();
function findGrabTarget(key, eye, dir, t) {
  let best = null, bestAngle = 0.28;
  if (key === 'aero' || key === 'terra') {      // (gravity holds through holdKey: it takes what wind takes)
    for (const o of objects) {
      if (o.dead || o.held || (key === 'terra' && !o.def.earth)) continue;
      const a = _ga.copy(o.pos).sub(eye).angleTo(dir);
      if (a < bestAngle && (key === 'terra' || lineOfSight(eye, o.pos))) { bestAngle = a; best = { type: 'object', obj: o, pos: o.pos }; }
    }
  }
  if (key === 'aqua') {
    for (const o of objects) {                               // water closes over things as readily as wind does
      if (o.dead || o.held) continue;
      const a = _ga.copy(o.pos).sub(eye).angleTo(dir);
      if (a < bestAngle && lineOfSight(eye, o.pos)) { bestAngle = a; best = { type: 'object', obj: o, pos: o.pos }; }
    }
    for (const e of echoes) {                                // and it finds the water inside the living, walls or not
      if (!isLive(e, t)) continue;
      const a = _ga.copy(e.group.position).sub(eye).angleTo(dir);
      if (a < bestAngle) { bestAngle = a; best = { type: 'echo', e, pos: e.group.position }; }
    }
  }
  if (!best && key === 'terra') {                            // nothing to hold: pull a boulder out of whatever you are reaching at
    const wall = collide(eye, eye.clone().addScaledVector(dir, 9));
    if (wall && wall.point.distanceTo(eye) > 0.6) best = { type: 'ground', pos: wall.point, normal: wall.normal };
    else if (dir.y < -0.15) {
      const k = -eye.y / dir.y;
      if (k > 0.6 && k < 9) best = { type: 'ground', pos: eye.clone().addScaledVector(dir, k), normal: UP.clone() };
    }
  }
  return best;
}
// g is whatever is doing the holding: a tracked hand, or the pointer in preview.
function beginHold(g, key, target, eye, t) {
  let type = target.type, obj = target.obj || null;
  if (type === 'ground') {
    const out = target.pos.clone().addScaledVector(target.normal || UP, 0.24);
    if (terraForm === 'sand') obj = spawnCloud('sand', out.addScaledVector(target.normal || UP, 0.4), t, 14);    // a cloud of it, to carry
    else obj = spawnObject(terraForm === 'metal' ? 'anvil' : 'stone', out);
    if (terraForm === 'lava') obj.heat = t + HEAT_TIME;
    puff('terra', target.pos, 40, 2.6, { dir: target.normal || UP, spread: 0.9, jitter: 0.25 });
    firePulse(target.pos);
    type = 'object';
  }
  if (obj) { obj.held = true; obj.rest = false; turn(obj); }
  if (target.e) target.e.puppet = true;
  g.hold = { key, type, obj, e: target.e || null, dist: (obj ? obj.pos : target.pos).distanceTo(eye),
    pv: new THREE.Vector3(), lastSlam: -9, lastWring: -9, reach0: 1,
    wrap: key === 'aero' || key === 'aqua' ? makeWrap(key) : null };
  lastCast = key; moveSound(key, 'grip');
  noteGesture(`grip > ${GRIP[key]}`);
  hudNote = GRIP[key].toLowerCase(); drawHud();
}
const _want = new THREE.Vector3(), _hstep = new THREE.Vector3(), _hnext = new THREE.Vector3(), _thread = new THREE.Vector3();
// eye + dir is where the hand points from; reach is how far the arm is out compared with when it grabbed.
// input: { hand: Vector3, squeeze: other fist held, squeezeEdge: other fist just closed }
function updateHold(g, eye, dir, reach, input, t, dt) {
  const h = g.hold;
  if (!h) return;
  if ((h.obj && h.obj.dead) || (h.e && h.e.down)) { dropHold(g); return; }
  const dist = THREE.MathUtils.clamp(h.dist * reach * reach, 0.5, 12);    // push your arm out and it goes further away
  _want.copy(eye).addScaledVector(dir, dist);
  _want.y = Math.max(_want.y, 0.15);
  const at = h.obj ? h.obj.pos : h.e.group.position;
  updateWrap(h, at, h.obj ? h.obj.def.r : 0.13, t, dt);
  for (let i = 0; i < 2; i++) {                             // a visible line from hand to what it holds
    _thread.copy(input.hand).lerp(at, Math.random());
    puff(h.key, _thread, 1, 0.2, { life: 0.18, size: h.key === 'aqua' ? 0.02 : 0.016, grav: 0, jitter: 0.03 });
  }
  if (h.obj) {
    const o = h.obj;
    o.rest = false;
    o.vel.copy(_want).sub(o.pos).multiplyScalar((h.key === 'terra' ? 7 : 10) / Math.sqrt(o.def.mass)).clampLength(0, 12);   // heavy things lag behind the hand
    if (h.key === 'aero') {
      if (input.squeezeEdge) { crushObject(o, t); dropHold(g); hudNote = 'crush'; drawHud(); }
    }
    return;
  }
  // Puppetry: the echo goes where the hand says. Slam it into the room or into another echo.
  const e = h.e;
  h.pv.copy(_want).sub(e.home).multiplyScalar(8).clampLength(0, 9);
  _hstep.copy(h.pv).multiplyScalar(dt);
  const speed = h.pv.length();
  _hnext.copy(e.home).add(_hstep).addScaledVector(_hstep.clone().normalize(), 0.1);
  const wall = speed > 0.01 ? collide(e.home, _hnext) : null;
  if (wall) {
    if (speed > 2.5 && t - h.lastSlam > 0.5) {
      h.lastSlam = t;
      impact(wall.point, wall.normal, 'aqua', t, 0.35);
      hudNote = 'slam'; hit(e, 'aqua', t, ZERO, { damage: 1 });
    }
  } else e.home.add(_hstep);
  e.restY = e.home.y; e.airborne = false; e.vel.set(0, 0, 0);
  if (speed > 2 && t - h.lastSlam > 0.5) {
    for (const o2 of echoes) {
      if (o2 === e || !isLive(o2, t) || o2.group.position.distanceTo(e.home) > 0.24) continue;
      h.lastSlam = t;
      hudNote = 'slam';
      hit(o2, 'aqua', t, h.pv.clone().normalize(), { damage: 1 });
      hit(e, 'aqua', t, ZERO, { damage: 1 });
      break;
    }
  }
  if (!e.down && input.squeeze && t - h.lastWring > 0.6) {  // the other fist closes: wring it out
    h.lastWring = t;
    hit(e, 'aqua', t, ZERO, { damage: 1 });
    hudNote = 'wring'; drawHud();
  }
  if (e.down) dropHold(g);
}
function endHold(g) {
  const h = g.hold;
  if (!h) return;
  if (h.obj) {                                                             // let go while it is moving and it flies
    const o = h.obj, t = now();
    o.held = false;
    o.vel.multiplyScalar(1.25);
    const speed = o.vel.length();
    if (speed > 3) {                                // a real throw: lean it toward an echo it is roughly headed for
      let best = null, bestAngle = 0.4;
      for (const e of echoes) {
        if (!isLive(e, t)) continue;
        const a = _ga.copy(e.group.position).sub(o.pos).angleTo(o.vel);
        if (a < bestAngle) { bestAngle = a; best = e; }
      }
      if (best) {
        const flight = best.group.position.distanceTo(o.pos) / speed;
        o.vel.copy(best.group.position).sub(o.pos).normalize().multiplyScalar(speed);
        o.vel.y += 4.9 * flight;                    // enough loft to cancel the drop on the way
      }
    }
  }
  else if (h.e && !h.e.down) { h.e.vel.x = h.pv.x * 0.6; h.e.vel.z = h.pv.z * 0.6; }
  dropHold(g);
}

// Rings that show what a hand would take hold of.
const reticles = [0, 1].map(() => {
  const r = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.255, 44), glowMat(ACID, 0.8));
  r.visible = false; r.renderOrder = 22;
  scene.add(r);
  return r;
});
function showReticle(i, target, key, eye) {
  const r = reticles[i];
  r.visible = !!target;
  if (!target) return;
  r.position.copy(target.pos);
  r.material.color.copy(ELEMENTS[key].color);
  r.lookAt(eye);
}
// Pyro's charge, one per hand: a ball of fire that grows in a held fist.
const chargeOrbs = [0, 1].map(() => {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), glowMat(new THREE.Color(ENERGY.pyro.a), 0.9)));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), energyMat('pyro', { scale: [14, 14, 14], flow: [0, 1, 0] })));
  g.visible = false; g.renderOrder = 16;
  scene.add(g);
  return g;
});
// Terra gathers rock into the fist; Aero winds air into a ball. (Aqua's charge is the carried water itself.)
const rockOrbs = [0, 1].map(() => {
  const m = new THREE.Mesh(craggy(new THREE.IcosahedronGeometry(1, 1), 0.3), stoneMat());
  m.visible = false; scene.add(m);
  return m;
});
const windOrbs = [0, 1].map(() => {
  const g = new THREE.Group();
  for (let k = 0; k < 2; k++) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.22, 8, 36), energyMat('aero', { flow: [1.4, 0, 0], scale: [3, 9, 3], cut: 0.36 }));
    band.rotation.set(k * 1.4, k * 0.8, 0);
    g.add(band);
  }
  g.visible = false; g.renderOrder = 16; scene.add(g);
  return g;
});
const orbsOf = (key) => [0, 1].map(() => {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), glowMat(new THREE.Color(ENERGY[key].a), 0.9)));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), energyMat(key, { scale: [10, 10, 10], flow: key === 'gravis' ? [0, -1, 0] : [0, 0.3, 0] })));
  g.visible = false; g.renderOrder = 16; scene.add(g);
  return g;
});
const extraOrbs = {};
for (const k of ['lumen', 'gravis', 'flora', 'astra', 'morph', 'umbra', 'necro']) extraOrbs[k] = orbsOf(k);
const hideOrbs = (i) => { chargeOrbs[i].visible = rockOrbs[i].visible = windOrbs[i].visible = false; for (const k in extraOrbs) extraOrbs[k][i].visible = false; };
const CHARGE_MIN = 0.6, CHARGE_MAX = 1.6, CHARGE_REACH = 0.45;   // a fist closer to you than this charges; further out, it grabs
let waterBoost = null;                            // where a charging Aqua fist is, while it is charging
function showCharge(i, pos, charge, key = 'pyro') {
  const k = Math.min(charge / CHARGE_MAX, 1);
  rockOrbs[i].visible = key === 'terra' && charge > 0.2;
  windOrbs[i].visible = key === 'aero' && charge > 0.2;
  if (rockOrbs[i].visible) {
    rockOrbs[i].position.copy(pos); rockOrbs[i].scale.setScalar(0.03 + 0.07 * k); rockOrbs[i].rotation.y += 0.05;
    if (Math.random() < 0.3) puff('terra', pos, 1, 0.6, { jitter: 0.2 });
  }
  if (windOrbs[i].visible) {
    windOrbs[i].position.copy(pos); windOrbs[i].scale.setScalar(0.03 + 0.08 * k);
    windOrbs[i].children.forEach((b, n) => { b.rotation.z += (n ? -0.5 : 0.4); });
  }
  if (key === 'aqua' && charge > 0.1) waterBoost = pos;
  chargeOrbs[i].visible = false; for (const k in extraOrbs) extraOrbs[k][i].visible = false;
  const g = extraOrbs[key] ? extraOrbs[key][i] : chargeOrbs[i];
  g.visible = (key === 'pyro' || !!extraOrbs[key]) && charge > 0.2;
  if (!g.visible) return;
  g.position.copy(pos);
  g.scale.setScalar(0.03 + 0.06 * Math.min(charge / CHARGE_MAX, 1));
  if (charge > CHARGE_MIN && Math.random() < 0.5) puff(key, pos, 1, 0.6, { up: 1 });
  if (key === 'pyro' || key === 'lumen' || key === 'astra') lightNow(pos, key === 'pyro' ? FIRE_LIGHT : VOLT_LIGHT, 0.5 * Math.min(charge / CHARGE_MAX, 1));
}
function throwCharged(key, hand, dir, eye, fwd, charge, t) {
  cast(key, 'charge', { hand, dir, eye, fwd, t, scale: 1 + Math.min(charge, CHARGE_MAX) * (key === 'pyro' ? 1 : 0.6) });
}
const throwFireball = (hand, dir, eye, fwd, charge, t) => throwCharged('pyro', hand, dir, eye, fwd, charge, t);

// ---------- hand constructs ----------
// Lumen's sweep leaves a blade of light in the hand that made it, for ten seconds. Swing it and it cuts; swing it fast
// and it still throws its crescent; hold it in the way of a shard and the shard goes back.
const blades = [];
function summonBlade(st, t) {
  let b = blades.find(x => x.st === st);
  if (b) { b.until = t + 10; return b; }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.012, 1, 6).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0xffffff })));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 1, 8, 8).translate(0, 0.5, 0), energyMat('lumen', { scale: [20, 4, 20], flow: [0, 2.5, 0], cut: 0.15 })));
  g.renderOrder = 16; scene.add(g);
  b = { st, g, until: t + 10, born: t, tip: new THREE.Vector3(), prev: new THREE.Vector3(), struck: new Map(), first: true };
  blades.push(b);
  play(SFX.blade); hudNote = 'blade of light'; lastCast = 'lumen';
  return b;
}
const _bd = new THREE.Vector3();
function updateBlades(t, dt) {
  for (let i = blades.length - 1; i >= 0; i--) {
    const b = blades[i], st = b.st;
    if (t > b.until || selected !== 'lumen') { scene.remove(b.g); b.g.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); blades.splice(i, 1); continue; }
    b.g.visible = !!st.valid;
    if (!st.valid) continue;
    _bd.copy(st.across).negate().normalize();          // out of the thumb side of the fist, the way a sword is held
    const len = 0.95 * Math.min((t - b.born) / 0.15, 1) * Math.min((b.until - t) / 0.4, 1);
    b.g.position.copy(st.palm);
    b.g.quaternion.setFromUnitVectors(UP, _bd);
    b.g.scale.set(1, Math.max(len, 0.01), 1);
    b.tip.copy(st.palm).addScaledVector(_bd, len);
    if (b.first) { b.prev.copy(b.tip); b.first = false; }
    const speed = b.tip.distanceTo(b.prev) / Math.max(dt, 1e-3);
    lightNow(b.tip, VOLT_LIGHT, 0.5);
    if (speed > 1.6) {
      _bd.subVectors(b.tip, b.prev).normalize();
      for (const e of echoes) {
        if (!isLive(e, t) || t - (b.struck.get(e) || -9) < 0.5) continue;
        if (segmentDistance(e.group.position, st.palm, b.tip) > 0.3 && segmentDistance(e.group.position, b.prev, b.tip) > 0.3) continue;
        b.struck.set(e, t);
        tone(2093, 1568, 0.12, 0.12, 'triangle');
        hit(e, 'lumen', t, _bd, { damage: 2, kind: 'whip', shadow: forms.lumen === 'shadow' });
      }
    }
    for (const o of objects) if (!o.dead && o.hostile && segmentDistance(o.pos, st.palm, b.tip) < 0.3) { turn(o); sendBack(o, 11); tone(2637, 2637, 0.1, 0.1, 'triangle'); hudNote = 'parried'; lastCast = 'lumen'; drawHud(); }
    b.prev.copy(b.tip);
  }
}
// Umbra does not see things. It sees where things are not: every creature is a hole in the room, always, through anything.
// No colour, no kind, no health. Just the absence.
const voids = [];
function updateVoids(t) {
  const on = selected === 'umbra';
  echoes.forEach((e, i) => {
    let v = voids[i];
    if (!on || e.down) { if (v) v.visible = false; return; }
    if (!v) {
      v = voids[i] = new THREE.Group();
      const hole = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14), new THREE.MeshBasicMaterial({ color: 0x000000, depthTest: false, depthWrite: false }));
      const rim = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.235, 28), glowMat(new THREE.Color(0x9a3cff), 0.5));
      hole.renderOrder = 18; rim.renderOrder = 19;
      v.add(hole, rim); scene.add(v);
    }
    v.visible = true;
    v.position.copy(e.group.position);
    v.scale.setScalar((e.group.scale.x || 1) * (1 + 0.06 * Math.sin(t * 3 + i)));
    v.children[1].lookAt(viewerPos);
  });
}
// Water you have put on a ceiling rains: what stands under it is soaked.
function rain(t) {
  for (const sc of sources) {                       // every puddle keeps rippling, on whatever surface it lies
    if (t - (sc.rippleT || 0) < 0.9) continue;
    sc.rippleT = t;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 40), glowMat(new THREE.Color(0xdff6ff), 0.5));
    ring.position.copy(sc.pos).addScaledVector(sc.normal, -0.02);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), sc.normal);
    const from = 0.04 + Math.random() * 0.1;
    addEffect([ring], (n) => { const k = (n - t) / 1.3; ring.scale.setScalar(from + k * 0.4); ring.material.opacity = 0.5 * (1 - k); return k < 1; });
  }
  for (const sc of sources) {
    if (sc.normal.y > -0.5) continue;
    if (Math.random() < 0.6) particles.emit(_bd.copy(sc.pos).add(_np.set((Math.random() - 0.5) * 0.7, 0, (Math.random() - 0.5) * 0.7)), _nt.set(0, -2.5, 0), PCOL.aqua[1], 0.014, 0.9, 6, 0);
    if (t - (sc.rainT || 0) < 0.7) continue;
    sc.rainT = t;
    for (const e of echoes) if (!e.down && e.group.position.y < sc.pos.y && Math.hypot(e.group.position.x - sc.pos.x, e.group.position.z - sc.pos.z) < 0.6) { e.soakedUntil = Math.max(e.soakedUntil, t + 4); reveal(e, t, 2, ELEMENTS.aqua.color); }
    quench(sc.pos.clone().setY(0.2), 0.6, t);
  }
}

// ---------- the seal ----------
// Two fingers up (index and middle, the others folded), held still for a moment. Not an attack with a shape: each
// discipline does the one thing only it can do, to the whole room at once. Ten seconds between uses.
const SEAL_COOLDOWN = 10;
let sealAt = -99;
const liveEchoes = () => echoes.filter(e => !e.down);
const SEALS = {
  pyro:   { name: 'Wildfire',   go: (t) => { let n = 0; for (const e of liveEchoes()) if (e.burnAt > 0) { n++; for (const o of liveEchoes()) if (o !== e && !(o.burnAt > 0) && o.group.position.distanceTo(e.group.position) < 2) o.burnAt = t + 1.5; e.burnAt = -1; hit(e, 'pyro', t, UP, { damage: 1, noBurn: true }); } return n ? 'every fire spreads and bursts' : 'nothing is burning'; } },
  aqua:   { name: 'Tide Call',  go: (t) => { for (const sc of sources) cast('aqua', 'lift', { hand: sc.pos.clone(), dir: sc.normal.clone(), eye: sc.pos.clone().addScaledVector(sc.normal, -0.5), fwd: new THREE.Vector3(0, 0, -1), t, quiet: true }); water.amount = WATER_MAX; return sources.length ? 'every source erupts' : 'filled from the air'; } },
  terra:  { name: 'Upheaval',   go: (t) => { let n = 0; const prey = liveEchoes(); for (const o of objects) { if (o.dead || o.held || o.def.cloud || !prey.length) continue; const e = prey[n++ % prey.length]; const d = e.group.position.clone().sub(o.pos); turn(o); kick(o, d.x * 2.2, 3 + d.y * 2, d.z * 2.2); } thump(); return n ? 'everything loose takes off' : 'nothing loose'; } },
  aero:   { name: 'Eye of the Storm', go: (t) => { stormUntil = t + 6; return 'nothing thrown can reach you'; } },
  lumen:  { name: 'Flashbang',  go: (t) => { pulseUniforms.uAmbient.value.setRGB(0.9, 0.85, 0.7); let n = 0; for (const e of liveEchoes()) if (lineOfSight(viewerPos, e.group.position)) { n++; e.blindUntil = t + 3.5; e.exposedUntil = t + 8; reveal(e, t, 8, ELEMENTS.lumen.color); } return n + ' blinded'; } },
  gravis: { name: 'Reverse',    go: (t) => { for (const e of liveEchoes()) { if (!(KINDS[e.kind] || {}).heavy) { e.airborne = true; e.vel.y = 2.6; } e.dropAt = t + 1.4; reveal(e, t, 3, ELEMENTS.gravis.color); } for (const o of objects) if (!o.dead && !o.held && !o.def.cloud) kick(o, 0, 5, 0); return 'everything falls up'; } },
  flora:  { name: 'Bloom',      go: (t) => { let n = 0; for (const e of liveEchoes()) if (e.rootedUntil > t) { n++; puff('flora', e.group.position, 40, 2.6, { up: 1 }); hit(e, 'flora', t, UP, { damage: 2, bleed: true }); } for (const tu of turrets) { tu.until += 10; tu.spitAt = 0; } return n ? n + ' rooted things burst' : turrets.length ? 'the snappers wake' : 'nothing rooted'; } },
  astra:  { name: 'Alignment',  go: (t) => { let n = 0; for (const e of liveEchoes()) if (e.revealedUntil > t) { n++; const at = e.group.position.clone(), top = at.clone().setY(Math.min(at.y + 2.6, roomBounds().max.y - 0.2)); castBolt('astra', { ...MOVES.astra.punch, sky: false }, { hand: top, dir: at.sub(top).normalize(), eye: viewerPos.clone(), fwd: new THREE.Vector3(0, 0, -1), t, scale: 1 }); } return n ? 'a comet for each one you can see' : 'reveal something first'; } },
  morph:  { name: 'Second Skin', go: (t) => { if (playerHP < 5) playerHP++; armour(t, 6); return 'healed, armoured'; } },
  umbra:  { name: 'Lights Out', go: (t) => { for (const e of liveEchoes()) { e.blindUntil = t + 6; e.drainAt = t + 1.5; } pulseUniforms.uAmbient.value.setRGB(0, 0, 0); return 'nothing can see'; } },
  necro:  { name: 'Detonate',   go: (t) => { if (!thralls.length) { raiseThrall(viewerPos.clone().add(new THREE.Vector3(0, -0.2, -0.8)), t); return 'one rises'; } for (const th of thralls) { explode(th.pos.clone(), 'necro', 1.3, t, 2, true); th.until = 0; } return 'the dead go off'; } },
};
let stormUntil = -1;
function resonate(key, t) {
  if (t - sealAt < SEAL_COOLDOWN) { hudNote = `seal in ${Math.ceil(SEAL_COOLDOWN - (t - sealAt))}s`; lastCast = key; drawHud(); return false; }
  sealAt = t;
  play(SFX.seal); castSound[key]();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 64), glowMat(ELEMENTS[key].color.clone(), 0.9));
  ring.position.copy(viewerPos).setY(viewerPos.y - 0.5); ring.rotation.x = -Math.PI / 2;
  addEffect([ring], (n) => { const k = (n - t) / 0.8; ring.scale.setScalar(0.2 + k * 6); ring.material.opacity = 0.9 * (1 - k); return k < 1; });
  const said = SEALS[key].go(t);
  hudNote = `${SEALS[key].name.toLowerCase()}: ${said}`; lastCast = key; drawHud();
  return true;
}
function updateStorm(t) {                           // Aero's seal: for six seconds a wall of wind turns everything back
  if (t > stormUntil) return;
  if (Math.random() < 0.8) { const a = Math.random() * 6.28; particles.emit(_np.set(Math.cos(a) * 1.1, (Math.random() - 0.6) * 1.2, Math.sin(a) * 1.1).add(viewerPos), _nt.set(-Math.sin(a) * 4, 0.3, Math.cos(a) * 4), PCOL.aero[1], 0.02, 0.35, 0, 0); }
  for (const o of objects) if (!o.dead && o.hostile && o.pos.distanceTo(viewerPos) < 1.5) { turn(o); sendBack(o, 11); tick(); }
}

// ---------- guard ----------
// Forearms crossed in front of you: a shield in the colour of whatever you are bending. While it is up, nothing thrown
// at you lands, and you cannot attack. What it does with a shard depends on the discipline.
const guard = { on: false, force: false, since: -1, pos: new THREE.Vector3(), mesh: null, key: null };
function guardMesh(key) {
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.42, 6), key === 'terra' ? earthMat(terraForm) : key === 'aqua' ? waterMat({ flow: [0, -1, 0], scale: [6, 6, 6], amp: 0, body: 0.2 }) : energyMat(key, { scale: [5, 5, 5], flow: [0, 0, 0.6], cut: 0.25 }));
  face.material.side = THREE.DoubleSide;
  const rim = new THREE.Mesh(new THREE.RingGeometry(0.41, 0.44, 6), glowMat(ELEMENTS[key].color.clone(), 0.9));
  g.add(face, rim); g.renderOrder = 17;
  return g;
}
function updateGuard(t, dt) {
  const want = guard.on || guard.force;
  if (guard.mesh && (!want || guard.key !== selected)) { scene.remove(guard.mesh); guard.mesh.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); guard.mesh = null; }
  if (guard.force) { guard.on = true; guard.pos.copy(viewerPos).addScaledVector(_fwd.set(0, 0, -1).applyQuaternion(camera.quaternion), 0.45).setY(viewerPos.y - 0.25); }
  if (!guard.on) { guard.since = -1; return; }
  if (guard.since < 0) { guard.since = t; play(SFX.guard); hudNote = 'guard'; lastCast = selected; drawHud(); }
  if (!guard.mesh) { guard.mesh = guardMesh(selected); guard.key = selected; scene.add(guard.mesh); }
  guard.mesh.position.copy(guard.pos);
  guard.mesh.lookAt(viewerPos.x, guard.pos.y, viewerPos.z);
  guard.mesh.scale.setScalar(Math.min((t - guard.since) / 0.12, 1));
  for (const o of objects) {
    if (o.dead || !o.hostile || o.pos.distanceTo(guard.pos) > 0.7) continue;
    play(SFX.guardHit); puff(selected, o.pos, 18, 2.2, {});
    if (selected === 'aero' || selected === 'lumen' || selected === 'gravis' || (selected === 'terra' && terraForm === 'metal')) { turn(o); sendBack(o, 10); hudNote = 'thrown back'; }
    else {
      o.dead = true;
      if (selected === 'aqua') { water.amount = Math.min(water.amount + 0.5, WATER_MAX * 2); hudNote = 'swallowed'; }
      else if (selected === 'umbra' || selected === 'morph') { hudNote = 'eaten'; }
      else hudNote = 'guarded';
      if (selected === 'pyro' && o.owner && !o.owner.down) o.owner.burnAt = t + 0.6;        // the fire runs back along the throw
      if (selected === 'flora' && o.owner && !o.owner.down) o.owner.rootedUntil = t + 3;
    }
    drawHud();
  }
}

// ---------- shaping: pinch ----------
// A pinch (thumb and index together, the other fingers out) is the hands-on verb. What it does depends on the discipline.
//   Aqua  draws the water you carry out into a stream that hangs from your fingers and moves like a rope.
//         Swing it and it lashes. Close the fist and the tip takes hold of what you are reaching at. Pinch it with the
//         other hand and it stretches into a curtain between your hands; let go of that hand and it stays as a wall.
//   Aero  traces a current through the air that keeps blowing along the line you drew.
//   Pyro  traces a line of fire.     Terra  traces a ridge that comes up out of the floor under the line.
const PINCH_ON = 0.022, PINCH_OFF = 0.05;
const _np = new THREE.Vector3(), _nt = new THREE.Vector3();
function nearestOnPath(p, pts, out) {
  out.dist = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    _nt.subVectors(pts[i + 1], a);
    const l2 = _nt.lengthSq();
    const k = l2 ? Math.min(Math.max(_np.subVectors(p, a).dot(_nt) / l2, 0), 1) : 0;
    _np.copy(a).addScaledVector(_nt, k);
    const d = _np.distanceTo(p);
    if (d < out.dist) { out.dist = d; out.i = i; out.point.copy(_np); out.tan.copy(_nt).normalize(); }
  }
  return out;
}
const _near = { dist: 0, i: 0, point: new THREE.Vector3(), tan: new THREE.Vector3() };

// --- Aqua: the stream ---
const STREAM_N = 16, LASH_SPEED = 3.5;
const streamMats = {
  water: waterMat({ flow: [0, 3, 0], scale: [8, 3, 8], amp: 0.006, body: 0.3 }),
  ice: iceMat(),
  steam: waterMat({ flow: [0, 2, 0], scale: [5, 5, 5], amp: 0, body: 0.05 }),
  flesh: energyMat('morph', { scale: [18, 18, 18], flow: [0, 0.6, 0], cut: 0.08 }),
};
const stream = {
  on: false, len: 1, latch: null, twoHand: false, span: 0, lastGrip: false, lastSqueeze: false, struck: new Map(),
  seenT: -9, lastCtl: null, owner: null, endOwner: null,
  nodes: Array.from({ length: STREAM_N }, () => ({ p: new THREE.Vector3(), prev: new THREE.Vector3(), last: new THREE.Vector3() })),
  mesh: new THREE.Mesh(new THREE.BufferGeometry(), streamMats.water),
  sheet: new THREE.Mesh(new THREE.BufferGeometry(), waterMat({ flow: [0, -1.4, 0], scale: [6, 3, 6], amp: 0, body: 0.12 })),
};
stream.sheet.material.side = THREE.DoubleSide;
// The bone glaive on the end of Morph's tendril.
stream.blade = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.34, 4).rotateX(Math.PI / 2).scale(0.35, 1, 1), new THREE.MeshBasicMaterial({ color: 0xf0dccf }));
stream.blade.visible = false; scene.add(stream.blade);
stream.beads = [0, 1, 2, 3, 4, 5, 6].map(() => { const bd = new THREE.Mesh(new THREE.OctahedronGeometry(0.024), new THREE.MeshBasicMaterial({ color: 0xf0dccf })); bd.visible = false; scene.add(bd); return bd; });
stream.key = 'aqua';
for (const m of [stream.mesh, stream.sheet]) { m.visible = false; m.frustumCulled = false; m.renderOrder = 15; scene.add(m); }
// What drives the stream this frame: { root, dir, vel, eye, grip, squeeze, end }. Hands fill it in; so does the preview.
let streamCtl = null;
const streamLength = () => stream.key === 'morph' ? 1.9 : Math.min(0.5 + 0.45 * water.amount, 2.6);
function startStream(ctl, t, key = 'aqua') {
  if (stream.on) return true;
  stream.key = key;
  if (key === 'aqua' && water.amount < 0.5) { hudNote = 'no water to draw out'; lastCast = 'aqua'; drawHud(); return false; }
  stream.on = true; stream.latch = null; stream.twoHand = false; stream.lastGrip = !!ctl.grip; stream.lastSqueeze = false;
  stream.struck.clear(); stream.seenT = t; stream.lastCtl = ctl;
  const from = key === 'aqua' && water.has ? water.pos : ctl.root;
  // It starts bunched at the fingers and runs out to its length over the next half second.
  _sd.subVectors(from, ctl.root);
  if (_sd.lengthSq() < 1e-4) _sd.set(0, -1, 0);
  _sd.normalize();
  stream.nodes.forEach((n, i) => {
    n.p.copy(ctl.root).addScaledVector(_sd, i * 0.02).add(_sv.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.01));
    n.prev.copy(n.p); n.last.copy(n.p);
  });
  stream.born = t;
  play(SFX[key].draw); hudNote = key === 'morph' ? 'glaive' : 'stream'; lastCast = key; drawHud();
  return true;
}
function endStream(t, ctl) {
  if (!stream.on) return;
  if (stream.latch && ctl) flingLatched(ctl);
  stream.on = false; stream.latch = null; stream.twoHand = false; stream.owner = stream.endOwner = null;
  stream.mesh.visible = stream.sheet.visible = stream.blade.visible = false; stream.beads.forEach(bd => { bd.visible = false; });
  if (stream.key === 'aqua') water.pos.copy(stream.nodes[0].p);
}
const latchPos = () => stream.latch.e ? stream.latch.e.group.position : stream.latch.o.pos;
function flingLatched(ctl) {
  const l = stream.latch;
  if (l.o) { l.o.vel.addScaledVector(ctl.vel, 1.2); l.o.rest = false; }
  else if (ctl.vel.length() > 1.2) {
    l.e.vel.x += ctl.vel.x * 2; l.e.vel.z += ctl.vel.z * 2;
    if (ctl.vel.y > 1 && !l.e.airborne) { l.e.airborne = true; l.e.vel.y = 2.2; }
  }
  stream.latch = null;
  hudNote = 'let go'; drawHud();
}
const _sv = new THREE.Vector3(), _sd = new THREE.Vector3(), _sline = new THREE.Vector3(), _sa2 = new THREE.Vector3();
function updateStream(t, dt) {
  if (!stream.on) return;
  let ctl = streamCtl;
  if (ctl) { stream.seenT = t; stream.lastCtl = ctl; }
  else if (t - stream.seenT < 0.3) ctl = stream.lastCtl;           // a dropped frame of tracking does not spill it
  const flesh = stream.key === 'morph', SK = stream.key;
  if (!ctl || selected !== SK || (!flesh && water.amount < 0.3)) { endStream(t, ctl); return; }
  const form = flesh ? 'flesh' : forms.aqua, N = STREAM_N, nodes = stream.nodes, root = ctl.root;
  const base = streamLength() * Math.min(0.15 + (t - stream.born) / 0.5, 1);
  if (stream.latch && (stream.latch.e ? stream.latch.e.down : (stream.latch.o.dead || stream.latch.o.held))) stream.latch = null;

  // The far end: free, in the other hand, or wrapped round something.
  const wasTwo = stream.twoHand;
  stream.twoHand = !!ctl.end && !stream.latch && !flesh;
  if (wasTwo && !stream.twoHand && !stream.latch && stream.span > 0.5) { plantWall(nodes[0].p.clone(), nodes[N - 1].p.clone(), t); endStream(t, null); return; }
  const tipTarget = stream.latch ? latchPos() : stream.twoHand ? ctl.end : null;
  let len = base;
  if (tipTarget) len = Math.min(Math.max(root.distanceTo(tipTarget) * 1.03, 0.2), streamLength() * 2.2);
  if (form === 'ice' && !tipTarget) len = Math.min(len, 1.3);
  stream.len = len; stream.span = stream.twoHand ? root.distanceTo(ctl.end) : 0;
  const seg = len / (N - 1);

  // Verlet rope: every node keeps its momentum, then the links pull it back into line.
  // Stepped at a fixed small interval so it swings the same at any frame rate.
  const grav = form === 'ice' ? 0 : form === 'steam' ? -0.8 : flesh ? 2.5 : 6;
  const subs = Math.min(Math.max(Math.ceil(dt / 0.012), 1), 6), step = Math.min(dt, 0.08) / subs;
  for (const n of nodes) n.last.copy(n.p);
  const rootFrom = _sline.copy(nodes[0].p);
  for (let sub = 1; sub <= subs; sub++) {
    for (let i = 1; i < N; i++) {
      const n = nodes[i];
      _sv.subVectors(n.p, n.prev).multiplyScalar(0.985).clampLength(0, 0.25);   // capped, so a hand that jumps cannot fling it across the room
      n.prev.copy(n.p);
      n.p.add(_sv); n.p.y -= grav * step * step;
    }
    for (let it = 0; it < 6; it++) {
      nodes[0].p.copy(rootFrom).lerp(root, sub / subs);
      if (tipTarget) nodes[N - 1].p.copy(tipTarget);
      for (let i = 0; i < N - 1; i++) {
        const a = nodes[i].p, b = nodes[i + 1].p;
        _sd.subVectors(b, a);
        const dist = _sd.length() || 1e-5, diff = (dist - seg) / dist;
        if (i === 0) b.addScaledVector(_sd, -diff);
        else if (i === N - 2 && tipTarget) a.addScaledVector(_sd, diff);
        else { a.addScaledVector(_sd, diff * 0.5); b.addScaledVector(_sd, -diff * 0.5); }
      }
    }
  }
  if (!tipTarget) for (let i = 1; i < N; i++) {      // whatever else happens, no link is ever stretched far
    _sd.subVectors(nodes[i].p, nodes[i - 1].p);
    if (_sd.length() > seg * 1.4) nodes[i].p.copy(nodes[i - 1].p).addScaledVector(_sd.setLength(seg * 1.4), 1);
  }
  if (flesh && !tipTarget) for (let i = 1; i < N; i++) nodes[i].p.lerp(_sa2.copy(root).addScaledVector(ctl.dir, seg * i).setY(root.y + ctl.dir.y * seg * i + Math.sin(t * 5 + i * 0.6) * 0.03 * i / N), 0.1);   // muscle: it reaches where you reach, and it never hangs still
  if (form === 'ice' && !tipTarget) for (let i = 1; i < N; i++) nodes[i].p.lerp(_sa2.copy(root).addScaledVector(ctl.dir, seg * i), 0.6);   // frozen: a blade
  for (let i = 1; i < N; i++) if (nodes[i].p.y < 0.03) nodes[i].p.y = 0.03;

  // Lash: the outer part of the stream, moving fast, hits what it crosses.
  const m = flesh ? { name: 'Glaive', kind: 'whip', damage: 2, venom: forms.morph === 'venom' }
    : { name: 'Stream', kind: 'whip', damage: (water.amount >= 2 ? 2 : 1) + (form === 'ice' ? 1 : 0), freeze: form === 'ice', steam: form === 'steam', form: form === 'water' ? undefined : form };
  const lash = form === 'water' ? LASH_SPEED : 2;
  if (!stream.twoHand) for (let i = Math.floor(N / 3); i < N; i++) {
    const n = nodes[i];
    const speed = _sv.subVectors(n.p, n.last).length() / Math.max(dt, 1e-3);
    if (speed < lash) continue;
    _sv.normalize();
    for (const e of echoes) {
      if (!isLive(e, t) || (stream.latch && stream.latch.e === e) || t - (stream.struck.get(e) || -9) < 0.6) continue;
      if (segmentDistance(e.group.position, n.last, n.p) > 0.32 && segmentDistance(e.group.position, nodes[i - 1].p, n.p) > 0.3) continue;   // swept, so a fast tip cannot skip past
      stream.struck.set(e, t);
      puff(SK, n.p, 16, 2.2, {});
      hit(e, SK, t, _sv, m);
    }
    for (const o of objects) {
      if (o.dead || o.held || o.def.cloud || (stream.latch && stream.latch.o === o) || t - (stream.struck.get(o) || -9) < 0.4) continue;
      if (segmentDistance(o.pos, nodes[i - 1].p, n.p) > o.def.r + 0.12) continue;
      stream.struck.set(o, t);
      kick(o, _sv.x * 4, 1.2, _sv.z * 4);
    }
  }

  // Take hold: the fist closes and the tip goes to what you are reaching at.
  if (ctl.grip && !stream.lastGrip && !stream.latch && !stream.twoHand) {
    let best = null, bestScore = 0.45;
    const reach = streamLength() * 1.6 + 0.4, tip = nodes[N - 1].p;
    const consider = (pos, ref) => {
      if (pos.distanceTo(root) > reach) return;
      const score = Math.min(_sv.subVectors(pos, ctl.eye).angleTo(ctl.dir), pos.distanceTo(tip) * 0.6);
      if (score < bestScore) { bestScore = score; best = ref; }
    };
    for (const e of echoes) if (isLive(e, t)) consider(e.group.position, { e });
    for (const o of objects) if (!o.dead && !o.held && !o.def.cloud) consider(o.pos, { o });
    if (best) {
      stream.latch = best;
      stream.tether = Math.max(latchPos().distanceTo(root) * 0.9, 0.4);     // it goes taut at the distance you caught it
      play(SFX.aqua.latch); hudNote = flesh ? 'hooked' : 'took hold'; lastCast = SK; drawHud();
      puff(SK, latchPos(), 24, 1.8, {});
      if (best.e) {
        if (flesh) { /* a hook, not a soaking */ } else if (form === 'ice') { best.e.frozenUntil = t + 6; best.e.vel.set(0, best.e.vel.y, 0); }
        else if (form === 'steam') best.e.blindUntil = t + 2;
        else best.e.soakedUntil = t + 6;
      } else turn(best.o);
    }
  } else if (!ctl.grip && stream.lastGrip && stream.latch) flingLatched(ctl);
  stream.lastGrip = !!ctl.grip;

  if (stream.latch) {
    const tp = latchPos();
    _sd.subVectors(root, tp);
    const dist = _sd.length() || 1e-5;
    _sd.divideScalar(dist);
    const over = Math.max(dist - stream.tether, 0);
    if (stream.latch.e) {                          // a creature: dragged where your hand goes, and it cannot fight back
      const e = stream.latch.e;
      e.vel.x += (_sd.x * over * 14 + ctl.vel.x * 3.5) * dt; e.vel.z += (_sd.z * over * 14 + ctl.vel.z * 3.5) * dt;
      if (ctl.vel.y > 1.6 && !e.airborne && !(e.frozenUntil > t)) { e.airborne = true; e.vel.y = 2.2; }
      e.blindUntil = Math.max(e.blindUntil, t + 0.3);
      e.revealedUntil = Math.max(e.revealedUntil, t + 1);
      if (ctl.squeeze && !stream.lastSqueeze) { hudNote = 'constrict'; hit(e, SK, t, ZERO, { damage: 1, kind: 'grip', freeze: form === 'ice' }); }
    } else {                                       // an object: a weight on the end of a rope
      const o = stream.latch.o;
      o.vel.addScaledVector(_sd, over * 60 * dt);
      o.vel.multiplyScalar(Math.max(1 - 1.2 * dt, 0));
      o.rest = false;
      if (ctl.squeeze && !stream.lastSqueeze) { crushObject(o, t); stream.latch = null; hudNote = 'crush'; drawHud(); }
    }
  }
  stream.lastSqueeze = !!ctl.squeeze;

  // Between two hands it spreads into a curtain that takes what is thrown at you.
  const curtain = stream.twoHand && stream.span > 0.3;
  stream.sheet.visible = curtain;
  if (curtain) {
    const pos = [], idx = [];
    nodes.forEach((n, i) => {
      const drop = Math.min(0.6, n.p.y - 0.03);
      pos.push(n.p.x, n.p.y, n.p.z, n.p.x, n.p.y - drop, n.p.z);
      if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    });
    const g = stream.sheet.geometry;
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    stream.sheet.material = form === 'ice' ? streamMats.ice : stream.sheetWater || (stream.sheetWater = stream.sheet.material);
    for (const o of objects) {
      if (o.dead || !o.hostile) continue;
      let hitNode = null;
      for (const n of nodes) if (Math.hypot(n.p.x - o.pos.x, n.p.z - o.pos.z) < 0.3 && o.pos.y < n.p.y + 0.15 && o.pos.y > n.p.y - 0.7) { hitNode = n; break; }
      if (!hitNode) continue;
      if (form === 'ice') { turn(o); sendBack(o, 9); tick(); hudNote = 'turned on the ice'; }
      else { o.dead = true; puff('aqua', o.pos, 26, 2.2, {}); water.amount = Math.min(water.amount + 0.5, WATER_MAX * 2); tick(); hudNote = 'swallowed'; }
      lastCast = 'aqua'; drawHud();
    }
  }

  // Draw it.
  const mesh = stream.mesh;
  mesh.visible = true;
  mesh.material = streamMats[form];
  stream.blade.visible = flesh;
  stream.beads.forEach((bd, i) => { bd.visible = flesh; if (flesh) bd.position.copy(nodes[1 + i * 2].p); });
  if (flesh) { stream.blade.position.copy(nodes[N - 1].p); stream.blade.lookAt(_sa2.copy(nodes[N - 1].p).multiplyScalar(2).sub(nodes[N - 3].p)); }
  mesh.geometry.dispose();
  const radius = form === 'ice' ? 0.02 : flesh ? 0.016 : 0.012 + 0.006 * Math.min(water.amount, 4);
  mesh.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(nodes.map(n => n.p)), 34, radius, 7, false);
  if (form === 'steam') { if (Math.random() < 0.6) fume(STEAM, nodes[Math.floor(Math.random() * N)].p, 1, { size: 0.14, life: 0.7, rise: 0.3 }); }
  else if (form === 'water' && Math.random() < 0.3) particles.emit(nodes[1 + Math.floor(Math.random() * (N - 1))].p, _sv.set(0, -0.2, 0), PCOL.aqua[1], 0.014, 0.5, 5, 0);
}
// The curtain left standing where you held it.
function plantWall(a, b, t) {
  const form = forms.aqua;
  water.amount = Math.max(water.amount - 1, 0);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const under = collide(mid, mid.clone().setY(-0.3));
  const baseY = under ? under.point.y : 0;
  const along = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
  const width = Math.max(along.length(), 0.6);
  along.normalize();
  const height = Math.min(Math.max(Math.max(a.y, b.y) - baseY, 0.7), 1.8);
  tick(); lastCast = 'aqua';
  if (form === 'steam') {                          // steam will not stand: it hangs there as a bank of cloud
    for (let i = 0; i < 3; i++) spawnCloud('steam', a.clone().lerp(b, i / 2).setY(baseY + 0.7), t, 7);
    hudNote = 'steam bank'; drawHud();
    return null;
  }
  const wall = new THREE.Group();
  wall.position.set(mid.x, baseY, mid.z);
  wall.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), along);
  if (form === 'ice') {
    const slab = craggy(new THREE.BoxGeometry(width, height, 0.14, 8, 6, 1).translate(0, height / 2, 0), 0.04);
    slab.computeVertexNormals();
    wall.add(new THREE.Mesh(slab, iceMat()));
  } else {
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.1, 10, 8, 1).translate(0, height / 2, 0), waterMat({ flow: [0, -1.4, 0], scale: [6, 3, 6], amp: 0.02, body: 0.16 }));
    wall.add(sheet);
  }
  wall.scale.set(1, 0.01, 1);
  const centre = () => wall.position.clone().setY(baseY + height * 0.5);
  let alive = true;
  const fall = (tt, quiet) => {
    if (!alive) return;
    alive = false;
    removeBarrier(barrier);
    puff('aqua', centre(), 50, 2.6, { jitter: width * 0.5 });
    if (!quiet && form !== 'ice') addSource(wall.position.clone(), UP, tt, 20);     // it falls, and the floor stays wet
  };
  const barrier = addBarrier(new THREE.BoxGeometry(width, height, 0.2).translate(0, height / 2, 0), wall, {
    // Hit it with one of your own moves and it goes: water rolls out as a wave, ice breaks into shards.
    struck: (dv, k, tt) => {
      const c = centre(), d = flat(dv, along);
      if (k === 'pyro' && form === 'ice') {            // fire on an ice wall: it melts where it stands, and the melt is water you can use
        fall(tt, true); addSource(wall.position.clone(), UP, tt, 25); spawnCloud('steam', c, tt, 4); play(SFX.quench); hudNote = 'melted'; drawHud();
        return;
      }
      fall(tt, true);
      if (form === 'ice') for (let i = 0; i < 3; i++) { const o = spawnObject('ice', c.clone().addScaledVector(along, (i - 1) * width * 0.3)); if (o) kick(o, d.x * 9, 2, d.z * 9); }
      else cast('aqua', 'shove', { hand: c, dir: d.clone(), eye: c.clone().addScaledVector(d, -1), fwd: d.clone(), t: tt });
    },
    crumble: (tt) => fall(tt),
    reflect: form === 'ice',
    damage: (tt) => { puff('aqua', centre(), 14, 2, { jitter: width * 0.4 }); if (--barrier.hp <= 0) fall(tt); },
  });
  barrier.hp = form === 'ice' ? 4 : 2;
  barrier.key = 'aqua';
  const until = t + (form === 'ice' ? 20 : 12);
  addEffect([wall], (n) => {
    wall.scale.y = Math.min((n - t) / 0.2, 1);
    if (alive && n > until) fall(n);
    return alive;
  });
  play(SFX.aqua.wall); if (form === 'ice') play(FORM_SFX.ice);
  hudNote = form === 'ice' ? 'ice wall' : 'water wall'; drawHud();
  return barrier;
}

// --- drawn lines ---
const DRAW_STEP = 0.12, DRAW_MAX = 28;
const DRAWN = { terra: 'Ridge', pyro: 'Fire Line', aqua: 'Stream', aero: 'Current', lumen: 'Mirror Line', gravis: 'Rift', flora: 'Snare', astra: 'Constellation', morph: 'Glaive', umbra: 'Veil', necro: 'Bone Fence' };   // what a pinch makes
let drawing = null;                                 // { key, pts, owner }
function drawBegin(key, p, owner = null) { drawing = { key, pts: [p.clone()], owner }; noteGesture('pinch'); }
function drawAdd(p) {
  if (!drawing) return;
  const last = drawing.pts[drawing.pts.length - 1];
  if (p.distanceTo(last) < DRAW_STEP || drawing.pts.length >= DRAW_MAX) return;
  drawing.pts.push(p.clone());
  puff(drawing.key, p, 3, 0.4, {});
}
function drawEnd(t) {
  const d = drawing;
  drawing = null;
  if (!d || d.pts.length < 3) return null;
  // A sigil. If the line closes on itself it is a circle, and a circle summons: the discipline's own familiar appears in it.
  let len = 0; for (let i = 1; i < d.pts.length; i++) len += d.pts[i].distanceTo(d.pts[i - 1]);
  if (len > 0.7 && d.pts[0].distanceTo(d.pts[d.pts.length - 1]) < 0.22) {
    const centre = new THREE.Vector3(); for (const q of d.pts) centre.add(q); centre.divideScalar(d.pts.length);
    lastCast = d.key; play(SFX.summon);
    const made = summonFamiliar(d.key, centre, t);
    drawHud();
    return made;
  }
  moveSound(d.key, 'draw', formOf(d.key) === FORMS[d.key][0] ? null : formOf(d.key)); lastCast = d.key;
  const made = d.key === 'aero' ? makeCurrent(d.pts, t) : d.key === 'pyro' ? fireLine(d.pts, t) : d.key === 'terra' ? raiseRidge(d.pts, t) : d.key === 'lumen' ? mirrorLine(d.pts, t) : d.key === 'gravis' ? rift(d.pts, t) : d.key === 'flora' ? snare(d.pts, t) : d.key === 'astra' ? constellation(d.pts, t) : d.key === 'morph' ? raiseRidge(d.pts, t, 'bone') : d.key === 'umbra' ? mirrorLine(d.pts, t, 'shadow') : d.key === 'necro' ? raiseRidge(d.pts, t, 'bone') : null;
  drawHud();
  return made;
}

// --- familiars ---
// One per discipline, each with its own body and its own habit. Two at a time. They use the discipline's own basic
// attack, in whatever sub-element you are in when they fire, so everything that attack does, theirs does.
const FAMILIAR = {
  pyro:   { name: 'Ember Wisp',  geo: () => new THREE.OctahedronGeometry(0.09),            rate: 1.3, range: 6, habit: 'post' },
  terra:  { name: 'Stone Sentry', geo: () => craggy(new THREE.DodecahedronGeometry(0.14), 0.03), rate: 2.2, range: 7, habit: 'post' },
  aero:   { name: 'Cyclone',     geo: () => new THREE.TorusGeometry(0.11, 0.035, 8, 20),   rate: 1.6, range: 5, habit: 'roam' },
  lumen:  { name: 'Sun Mote',    geo: () => new THREE.IcosahedronGeometry(0.06),           rate: 1.8, range: 8, habit: 'follow' },
  gravis: { name: 'Moon',        geo: () => new THREE.SphereGeometry(0.1, 16, 12),         rate: 2.6, range: 6, habit: 'orbit' },
  astra:  { name: 'Guide Star',  geo: () => new THREE.TetrahedronGeometry(0.1),            rate: 2.0, range: 9, habit: 'high' },
  umbra:  { name: 'Shade',       geo: () => new THREE.ConeGeometry(0.09, 0.26, 5),         rate: 1.7, range: 6, habit: 'follow' },
};
const familiars = [];
function summonFamiliar(key, centre, t) {
  if (key === 'flora') {                             // Flora's familiar is the snapper: it grows on the nearest surface to the circle
    const s = nearestRoomSurface(centre, 3);
    hudNote = 'snapper';
    return plantTurret(s ? s.point.clone() : centre.clone().setY(0), s ? s.normal.clone() : UP.clone(), t);
  }
  if (key === 'necro') { raiseThrall(centre.clone(), t); return raiseThrall(centre.clone().add(new THREE.Vector3(0.3, 0, 0)), t); }
  const F = FAMILIAR[key];
  if (!F) return null;
  if (familiars.length >= 2) familiars[0].until = 0;
  const g = new THREE.Group();
  const body = new THREE.Mesh(F.geo(), key === 'terra' ? earthMat(terraForm) : key === 'umbra' ? new THREE.MeshBasicMaterial({ color: 0x08020f }) : energyMat(key, { scale: [9, 9, 9], cut: 0.25 }));
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.006, 6, 40), glowMat(ELEMENTS[key].color.clone(), 0.8));
  g.add(body, halo);
  g.position.copy(centre); g.scale.setScalar(0.01);
  const self = { key, g, pos: g.position, until: t + 22, fireAt: t + 0.8, home: centre.clone(), phase: Math.random() * 6 };
  familiars.push(self);
  puff(key, centre, 30, 2, {});
  const epoch = shapeEpoch, to = new THREE.Vector3();
  let then = t;
  addEffect([g], (n) => {
    const dt = Math.min(n - then, 0.08); then = n;
    if (epoch !== shapeEpoch || n > self.until) { familiars.splice(familiars.indexOf(self), 1); puff(key, self.pos, 20, 1.6, {}); return false; }
    g.scale.setScalar(Math.min((n - t) / 0.4, 1));
    body.rotation.y += dt * (key === 'aero' ? 14 : 1.5); body.rotation.x += dt * 0.7;
    halo.rotation.x = Math.PI / 2 + Math.sin(n * 2 + self.phase) * 0.5; halo.rotation.y += dt * 2;
    // where it likes to be
    if (F.habit === 'follow') to.copy(viewerPos).add(_np.set(0.45, 0.25, -0.2));
    else if (F.habit === 'orbit') to.copy(viewerPos).add(_np.set(Math.cos(n * 1.4) * 0.8, 0.2, Math.sin(n * 1.4) * 0.8));
    else if (F.habit === 'roam') to.copy(self.home).add(_np.set(Math.cos(n * 0.7 + self.phase) * 1.2, Math.sin(n * 1.1) * 0.2, Math.sin(n * 0.7 + self.phase) * 1.2));
    else if (F.habit === 'high') to.copy(self.home).setY(Math.min(self.home.y + 0.9, roomBounds().max.y - 0.25));
    else to.copy(self.home);
    self.pos.lerp(to, Math.min(dt * 3, 1));
    if (key === 'pyro' || key === 'lumen' || key === 'astra') lightNow(self.pos, key === 'pyro' ? FIRE_LIGHT : VOLT_LIGHT, 0.5);
    if (Math.random() < 0.25) puff(key, self.pos, 1, 0.3, {});
    if (n < self.fireAt) return true;
    let prey = null, near = F.range;
    for (const e of echoes) { if (e.down) continue; const d = e.group.position.distanceTo(self.pos); if (d < near && (key === 'gravis' || key === 'umbra' || lineOfSight(self.pos, e.group.position))) { near = d; prey = e; } }
    if (prey) {
      self.fireAt = n + F.rate;
      const dir = prey.group.position.clone().sub(self.pos).normalize();
      reveal(prey, n, 1.5, ELEMENTS[key].color);
      cast(key, 'punch', { hand: self.pos.clone().addScaledVector(dir, 0.2), dir, eye: self.pos.clone(), fwd: dir.clone().setY(0).normalize(), t: n, quiet: true });
    }
    return true;
  });
  hudNote = F.name.toLowerCase();
  return self;
}

// --- Aero: currents ---
const currents = [];
const CURRENT_LIFE = 12, CURRENT_R = 0.5, CURRENT_SPEED = 6;
function endCurrent(c) {
  const i = currents.indexOf(c);
  if (i < 0) return;
  currents.splice(i, 1);
  scene.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh.material.dispose();
}
let shapeEpoch = 0;                                 // a new game ends every drawn line still standing
function clearShaping() {
  shapeEpoch++;
  for (const f of fireLines) f.alive = false;
  fireLines.length = 0;
  while (currents.length) endCurrent(currents[0]);
  endStream(now(), null);
  drawing = null; streamCtl = null;
}
function makeCurrent(pts, t) {
  if (currents.length >= 3) endCurrent(currents[0]);
  const form = forms.aero;
  const c = {
    pts: pts.map(p => p.clone()), born: t, until: t + CURRENT_LIFE, form, dir: form === 'vacuum' ? -1 : 1, builtAt: -9,
    mesh: new THREE.Mesh(new THREE.BufferGeometry(), energyMat('aero', { flow: [1.2, 0.4, 1.2], scale: [4, 4, 4], cut: 0.5, opacity: 0.55 })),
  };
  c.mesh.frustumCulled = false; c.mesh.renderOrder = 14;
  scene.add(c.mesh);
  currents.push(c);
  thump();
  hudNote = form === 'vacuum' ? 'undertow' : form === 'sound' ? 'drone' : 'current';
  return c;
}
const _cv = new THREE.Vector3(), _cp = new THREE.Vector3();
function updateCurrents(t, dt, eye) {
  for (let ci = currents.length - 1; ci >= 0; ci--) {
    const c = currents[ci];
    if (t > c.until) { endCurrent(c); continue; }
    if (t - c.builtAt > 0.12) {                     // the ribbon turns to keep facing you
      c.builtAt = t;
      c.mesh.geometry.dispose();
      c.mesh.geometry = ribbonGeo(c.pts, 0.3, eye);
    }
    c.mesh.material.opacity = Math.min((t - c.born) / 0.3, 1, (c.until - t) / 1.5) * 0.55;
    for (let k = 0; k < 3; k++) {                   // streaks running along it show which way it blows
      const i = Math.floor(Math.random() * (c.pts.length - 1));
      _cp.copy(c.pts[i]).lerp(c.pts[i + 1], Math.random()).add(_cv.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.3));
      _cv.subVectors(c.pts[i + 1], c.pts[i]).normalize().multiplyScalar(CURRENT_SPEED * 0.8 * c.dir);
      particles.emit(_cp, _cv, PCOL.aero[k % 3], 0.02, 0.3, 0, 0);
    }
    for (const o of objects) {
      if (o.dead || o.held) continue;
      nearestOnPath(o.pos, c.pts, _near);
      if (_near.dist > CURRENT_R + o.def.r) continue;
      if (c.form === 'sound') continue;             // a drone moves nothing
      turn(o);                                      // what they threw is yours once the wind has it
      const speed = o.def.cloud ? 2.5 : CURRENT_SPEED / Math.sqrt(o.def.mass);
      o.vel.lerp(_cv.copy(_near.tan).multiplyScalar(speed * c.dir).addScaledVector(_cp.copy(_near.point).sub(o.pos), 3), Math.min(dt * 6, 1));
      o.vel.y += 9.8 * dt;                          // carried: the wind holds its weight
      o.rest = false;
    }
    for (const e of echoes) {
      if (e.down) continue;
      nearestOnPath(e.group.position, c.pts, _near);
      if (_near.dist > CURRENT_R + 0.2) continue;
      reveal(e, t, 1, ELEMENTS.aero.color);         // you can see what the wind is pushing against
      if (c.form === 'sound') { e.blindUntil = Math.max(e.blindUntil, t + 1); continue; }
      if (e.frozenUntil > t) continue;
      e.vel.x += _near.tan.x * c.dir * 14 * dt; e.vel.z += _near.tan.z * c.dir * 14 * dt;
      if (_near.tan.y * c.dir > 0.5 && !e.airborne) { e.airborne = true; e.vel.y = 2.2; }
      if (c.form === 'vacuum' && !(e.drainAt > 0)) e.drainAt = t + 1.5;
    }
  }
}
// An open hand moving through a current drags it along.
function bendCurrents(handPos, handVel, dt) {
  let bent = false;
  for (const c of currents) for (const pt of c.pts) {
    const d = pt.distanceTo(handPos);
    if (d < 0.4) { pt.addScaledVector(handVel, dt * (1 - d / 0.4)); c.builtAt = -9; bent = true; }
  }
  return bent;
}

// Fire lines and snares, so other disciplines can find them.
const fireLines = [];
// Water (and better, ice) on something hot: burning things go out, molten stone sets, a fire line dies in steam.
function quench(point, radius, t) {
  let any = false;
  for (const o of objects) {
    if (o.dead || o.pos.distanceTo(point) > radius + o.def.r) continue;
    if (o.burnUntil > 0) { o.burnUntil = -1; any = true; }
    if (o.fuse > 0) { o.fuse = 0; any = true; }
    if (o.heat > t) { o.heat = -1; any = true; }
  }
  for (const f of fireLines) {
    if (!f.alive || nearestOnPath(point, f.pts, _near).dist > radius) continue;
    if (f.flora) { f.until += 6; hudNote = 'watered: it holds longer'; drawHud(); continue; }     // water feeds roots
    f.alive = false; any = true;
    spawnCloud('steam', _near.point.clone().setY(Math.max(_near.point.y, 0.5)), t, 5);
  }
  for (let i = fireLines.length - 1; i >= 0; i--) if (!fireLines[i].alive) fireLines.splice(i, 1);
  if (any) { play(SFX.quench); fume(STEAM, point, 6, { size: 0.3, rise: 0.8, life: 1.4 }); hudNote = 'quenched'; drawHud(); }
  return any;
}
// --- Pyro: a line of fire ---
function fireLine(pts, t) {
  const form = forms.pyro;
  pts = pts.map(p => p.clone());
  if (form === 'lightning') {                       // it does not burn: it goes off once, along the whole line
    for (let i = 0; i < pts.length - 1; i++) zap(pts[i], pts[i + 1], t);
    thump();
    for (const e of echoes) if (!e.down && nearestOnPath(e.group.position, pts, _near).dist < 0.5) hit(e, 'pyro', t, UP, { damage: 2, volt: true, arc: true });
    for (const o of objects) if (!o.dead && o.hostile && nearestOnPath(o.pos, pts, _near).dist < 0.5) { o.dead = true; puff('volt', o.pos, 14, 2, {}); }
    hudNote = 'live wire';
    return { form };
  }
  if (form === 'blast') {                           // a fuse: it goes off point by point
    let next = 0;
    addEffect([], (n) => {
      while (next < pts.length && n - t > next * 0.07) { explode(pts[next], 'pyro', 0.6, n, 1, true); next += 2; }
      return next < pts.length;
    });
    hudNote = 'fuse';
    return { form };
  }
  const until = t + 7, last = new Map(), epoch = shapeEpoch;
  const self = { pts, until, alive: true };
  fireLines.push(self);
  addEffect([], (n) => {
    if (epoch !== shapeEpoch || !self.alive) { self.alive = false; return false; }
    for (const f of fireLines) if (f.flora && f.alive && nearestOnPath(pts[pts.length >> 1], f.pts, _near).dist < 0.6) { f.alive = false; hudNote = 'the snare burns'; drawHud(); }   // fire takes roots
    for (let k = 0; k < thinned(5); k++) {
      const i = Math.floor(Math.random() * (pts.length - 1));
      puff('pyro', _cp.copy(pts[i]).lerp(pts[i + 1], Math.random()), 1, 0.7, { up: 1.6 });
    }
    lightNow(pts[pts.length >> 1], FIRE_LIGHT, 0.9);
    for (const e of echoes) {
      if (e.down || n - (last.get(e) || -9) < 1 || nearestOnPath(e.group.position, pts, _near).dist > 0.4) continue;
      last.set(e, n);
      hit(e, 'pyro', n, UP, { damage: 1 });
    }
    for (const o of objects) {
      if (o.dead || o.held || nearestOnPath(o.pos, pts, _near).dist > 0.35 + o.def.r) continue;
      if (o.hostile) { o.dead = true; puff('pyro', o.pos, 16, 2, {}); tick(); }   // what they throw burns up in it
      else ignite(o, n);
    }
    return n < until;
  });
  hudNote = 'fire line';
  return { form, until };
}

// --- Lumen: a line of light that turns back what is thrown at it ---
function mirrorLine(pts, t, as = null) {
  const form = as || forms.lumen;
  pts = pts.map(p => p.clone());
  const band = new THREE.Mesh(new THREE.BufferGeometry(), glowMat(new THREE.Color(form === 'shadow' ? 0x6a5a9c : 0xfff1b0), 0.5));
  const until = t + 8, last = new Map(), epoch = shapeEpoch;
  let built = -9;
  addEffect([band], (n) => {
    if (epoch !== shapeEpoch) return false;
    if (n - built > 0.12) { built = n; band.geometry.dispose(); band.geometry = ribbonGeo(pts, 0.5, viewerPos); }
    band.material.opacity = 0.32 * Math.min((until - n) / 1.2, 1) * (0.8 + 0.2 * Math.sin(n * 14));
    if (form !== 'shadow') lightNow(pts[pts.length >> 1], VOLT_LIGHT, 0.5);
    if (Math.random() < 0.5) { const i = Math.floor(Math.random() * (pts.length - 1)); puff('lumen', _cp.copy(pts[i]).lerp(pts[i + 1], Math.random()), 1, 0.3, {}); }
    for (const o of objects) {
      if (o.dead || !o.hostile || nearestOnPath(o.pos, pts, _near).dist > 0.4) continue;
      turn(o); sendBack(o, form === 'prism' ? 14 : 10); tick();
      hudNote = 'mirrored'; lastCast = 'lumen'; drawHud();
    }
    for (const e of echoes) {
      if (e.down || n - (last.get(e) || -9) < 2 || nearestOnPath(e.group.position, pts, _near).dist > 0.45) continue;
      last.set(e, n);
      if (as) hit(e, 'umbra', n, UP, { damage: 1, fear: forms.umbra === 'fear', hollow: forms.umbra === 'hollow' });
      else hit(e, 'lumen', n, UP, { damage: form === 'shadow' ? 1 : 0, shadow: form === 'shadow' });
    }
    return n < until;
  });
  hudNote = form === 'shadow' ? 'veil' : 'mirror line';
  return { form, until };
}
// --- Gravis: a tear that everything near falls toward ---
function rift(pts, t) {
  const form = forms.gravis;
  pts = pts.map(p => p.clone());
  const band = new THREE.Mesh(new THREE.BufferGeometry(), energyMat('gravis', { scale: [6, 6, 6], flow: [0, -1.5, 0], cut: 0.3 }));
  const until = t + 8, last = new Map(), R = 1.1;
  let built = -9, then = t;
  const epoch = shapeEpoch;
  addEffect([band], (n) => {
    if (epoch !== shapeEpoch) return false;
    const dt = Math.min(n - then, 0.08); then = n;
    if (n - built > 0.12) { built = n; band.geometry.dispose(); band.geometry = ribbonGeo(pts, 0.16, viewerPos); }
    band.material.opacity = Math.min((until - n) / 1.2, 1);
    for (let k = 0; k < thinned(3); k++) {          // motes falling into it (or, floating, rising off it)
      const i = Math.floor(Math.random() * (pts.length - 1));
      _cp.copy(pts[i]).lerp(pts[i + 1], Math.random());
      _cv.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      if (form === 'float') particles.emit(_cp, _cv.set(_cv.x * 0.3, 1.6, _cv.z * 0.3), PCOL.gravis[k % 3], 0.02, 0.6, 0, 0);
      else particles.emit(_np.copy(_cp).addScaledVector(_cv, 0.8), _cv.multiplyScalar(-2.6), PCOL.gravis[k % 3], 0.02, 0.3, 0, 0);
    }
    for (const o of objects) {
      if (o.dead || o.held || nearestOnPath(o.pos, pts, _near).dist > R) continue;
      turn(o); o.rest = false;
      if (form === 'float') { o.vel.y += 13 * dt; o.vel.multiplyScalar(Math.max(1 - 1.5 * dt, 0)); }
      else { o.vel.addScaledVector(_cv.copy(_near.point).sub(o.pos), (form === 'crush' ? 16 : 10) * dt); o.vel.multiplyScalar(Math.max(1 - 2.5 * dt, 0)); o.vel.y += 9.8 * dt * 0.8; }
    }
    for (const e of echoes) {
      if (e.down) continue;
      nearestOnPath(e.group.position, pts, _near);
      if (_near.dist > R) continue;
      reveal(e, n, 1, ELEMENTS.gravis.color);
      if (form === 'float') { if (!e.airborne) { e.airborne = true; e.vel.y = 2.2; } continue; }
      e.vel.x += (_near.point.x - e.group.position.x) * 9 * dt; e.vel.z += (_near.point.z - e.group.position.z) * 9 * dt;
      if (_near.dist < 0.45 && n - (last.get(e) || -9) > 1.5) { last.set(e, n); hit(e, 'gravis', n, ZERO, { damage: form === 'crush' ? 2 : 1, kind: 'void', crush: form === 'crush' }); }
    }
    return n < until;
  });
  thump();
  hudNote = form === 'float' ? 'lift' : 'rift';
  return { form, until };
}

// --- Flora: snappers. A plant with a mouth, rooted to whatever surface the seed hit: floor, wall or ceiling.
// It bites what comes close, spits thorns at what does not, and eats what is thrown past it. Three at a time.
const turrets = [];
function plantTurret(point, normal, t) {
  if (turrets.length >= 3) turrets[0].until = 0;
  const g = new THREE.Group();
  g.position.copy(point);
  g.quaternion.setFromUnitVectors(UP, normal.clone().normalize());
  const green = new THREE.MeshBasicMaterial({ color: 0x3d8a22 }), lip = new THREE.MeshBasicMaterial({ color: 0x7fd65a }), maw = new THREE.MeshBasicMaterial({ color: 0xc8204a, side: THREE.DoubleSide });
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.34, 6).translate(0, 0.17, 0), green);
  for (let i = 0; i < 4; i++) { const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4).rotateZ(Math.PI / 2).translate(0.09, 0.02, 0), lip); leaf.rotation.y = i * Math.PI / 2; g.add(leaf); }
  const head = new THREE.Group();
  head.position.set(0, 0.36, 0);
  const jaws = [1, -1].map((side) => {
    const jaw = new THREE.Group();
    jaw.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1.5).rotateX(side > 0 ? 0 : Math.PI), lip));
    jaw.add(new THREE.Mesh(new THREE.CircleGeometry(0.085, 10).rotateX(Math.PI / 2).scale(1, 1, 1.5), maw));
    for (let k = 0; k < 5; k++) { const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, 4).rotateX(side > 0 ? Math.PI : 0), new THREE.MeshBasicMaterial({ color: 0xfff6d8 })); tooth.position.set((k - 2) * 0.03, -side * 0.012, 0.1 - Math.abs(k - 2) * 0.02); jaw.add(tooth); }
    head.add(jaw);
    return jaw;
  });
  g.add(stalk, head);
  g.scale.setScalar(0.01);
  const self = { g, head, pos: point.clone().addScaledVector(normal, 0.36), until: t + 25, biteAt: 0, spitAt: t + 0.8, snap: -9 };
  turrets.push(self);
  const epoch = shapeEpoch, look = new THREE.Vector3();
  play(SFX.flora.lift); puff('flora', point, 24, 1.8, { dir: normal, spread: 0.7 });
  hudNote = 'snapper'; lastCast = 'flora'; drawHud();
  addEffect([g], (n) => {
    if (epoch !== shapeEpoch || n > self.until) { turrets.splice(turrets.indexOf(self), 1); puff('flora', self.pos, 20, 1.6, {}); return false; }
    g.scale.setScalar(Math.min((n - t) / 0.4, 1) * 1.4);
    let prey = null, near = 5;
    for (const e of echoes) { if (e.down) continue; const d = e.group.position.distanceTo(self.pos); if (d < near && lineOfSight(self.pos, e.group.position)) { near = d; prey = e; } }
    const open = n - self.snap < 0.25 ? 0.05 : prey ? 0.5 + 0.2 * Math.sin(n * 9) : 0.12 + 0.08 * Math.sin(n * 2);
    jaws[0].rotation.x = -open; jaws[1].rotation.x = open;
    if (prey) {
      head.lookAt(look.copy(prey.group.position));
      reveal(prey, n, 1.5, ELEMENTS.flora.color);
      look.copy(prey.group.position).sub(self.pos).normalize();
      if (near < 1.1 && n > self.biteAt) { self.biteAt = n + 1.2; self.snap = n; play(SFX.snap); hit(prey, 'flora', n, look, { damage: 1 }); }
      else if (near >= 1.1 && n > self.spitAt) {
        self.spitAt = n + 1.6; self.snap = n;
        play(SFX.spit);
        castBolt('flora', { name: 'Thorn', kind: 'bolt', speed: 12, radius: 0.2, shape: 'orb', size: 0.02, bleed: forms.flora === 'thorn', spore: forms.flora === 'spore', life: 1 }, { hand: self.pos.clone().addScaledVector(look, 0.15), dir: look.clone(), eye: viewerPos.clone(), fwd: look.clone(), t: n, scale: 1 });
      }
    }
    for (const o of objects) if (!o.dead && o.hostile && o.pos.distanceTo(self.pos) < 0.7) { o.dead = true; self.snap = n; play(SFX.snap); puff('flora', o.pos, 12, 1.6, {}); }   // it eats what flies past
    return true;
  });
  return self;
}
// --- Flora: a line of roots that catches what crosses it ---
function snare(pts, t) {
  pts = pts.map(p => p.clone());
  const band = new THREE.Mesh(new THREE.BufferGeometry(), energyMat('flora', { scale: [10, 3, 10], flow: [0.4, 0, 0.4], cut: 0.25 }));
  const until = t + 10, last = new Map(), epoch = shapeEpoch;
  let built = -9;
  fireLines.push({ pts, until, flora: true, alive: true });
  const self = fireLines[fireLines.length - 1];
  addEffect([band], (n) => {
    if (epoch !== shapeEpoch || !self.alive) { self.alive = false; return false; }
    if (n - built > 0.15) { built = n; band.geometry.dispose(); band.geometry = ribbonGeo(pts, 0.22, viewerPos); }
    for (const e of echoes) {
      if (e.down || n - (last.get(e) || -9) < 5 || nearestOnPath(e.group.position, pts, _near).dist > 0.5) continue;
      last.set(e, n);
      hit(e, 'flora', n, UP, { damage: 1, bleed: forms.flora === 'thorn', spore: forms.flora === 'spore' });
    }
    if (n >= until) self.alive = false;
    return n < until;
  });
  hudNote = 'snare';
  return self;
}
// --- Astra: every point you mark gets a comet, in the order you drew them ---
function constellation(pts, t) {
  pts = pts.filter((p, i) => i % 2 === 0).map(p => p.clone());
  let next = 0;
  const epoch = shapeEpoch;
  addEffect([], (n) => {
    if (epoch !== shapeEpoch) return false;
    for (const p of pts.slice(next)) if (Math.random() < 0.2) puff('astra', p, 1, 0.2, {});
    while (next < pts.length && n - t > 0.7 + next * 0.22) {
      const at = pts[next++];
      const under = collide(at, at.clone().setY(-0.3));
      const land = under ? under.point : at.clone().setY(0);
      let m = { ...MOVES.astra.punch, sky: false };
      if (forms.astra === 'night') m.shadow = true;
      if (forms.astra === 'storm') { m.volt = true; m.rain = true; m.form = 'storm'; }
      castBolt('astra', m, { hand: at.clone().setY(at.y + 2.2), dir: land.clone().sub(at.clone().setY(at.y + 2.2)).normalize(), eye: viewerPos.clone(), fwd: new THREE.Vector3(0, 0, -1), t: n, scale: 1 });
      play(SFX.astra.punch);
    }
    return next < pts.length;
  });
  hudNote = 'constellation';
  return { pts };
}

// --- Terra: a ridge ---
function raiseRidge(pts, t, as = null) {
  const form = as ? 'rock' : terraForm;
  // Drop the line onto whatever is under it.
  const ground = [];
  for (const p of pts) {
    const under = collide(p, p.clone().setY(-0.3));
    const q = new THREE.Vector3(p.x, under ? under.point.y : 0, p.z);
    if (!ground.length || Math.hypot(q.x - ground[ground.length - 1].x, q.z - ground[ground.length - 1].z) > 0.4) ground.push(q);
  }
  if (ground.length < 2) { hudNote = 'draw it along the ground'; return null; }
  if (form === 'sand') {
    ground.forEach((q, i) => { if (i % 2 === 0) spawnCloud('sand', q.clone().setY(q.y + 0.5), t, 6); });
    hudNote = 'sand screen';
    return { form };
  }
  const height = 0.75, parts = [], groups = [];
  const mid = new THREE.Vector3();
  for (let i = 0; i < ground.length - 1 && i < 7; i++) {
    const a = ground[i], b = ground[i + 1];
    const along = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
    const len = along.length();
    along.normalize();
    const g = new THREE.Group();
    g.position.set((a.x + b.x) / 2, Math.min(a.y, b.y), (a.z + b.z) / 2);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), along);
    g.add(new THREE.Mesh(craggy(new THREE.BoxGeometry(len + 0.12, height, 0.24, 4, 4, 2).translate(0, height / 2, 0), 0.06), earthMat(form)));
    g.scale.set(1, 0.01, 1);
    const part = { g, alive: true, barrier: null, a, b };
    const crumble = () => {
      if (!part.alive) return;
      part.alive = false; g.visible = false;
      removeBarrier(part.barrier);
      puff('terra', mid.copy(g.position).setY(g.position.y + height * 0.5), 26, 2.4, { jitter: len * 0.4 });
    };
    part.barrier = addBarrier(new THREE.BoxGeometry(len + 0.12, height, 0.26).translate(0, height / 2, 0), g, {
      struck: () => {},                             // your own shots stop on it: it is cover, both ways
      crumble,
      reflect: form === 'metal',
      damage: () => { puff('terra', mid.copy(g.position).setY(g.position.y + height * 0.6), 10, 2, {}); if (--part.barrier.hp <= 0) crumble(); },
    });
    part.barrier.hp = form === 'metal' ? 6 : 3; part.barrier.key = as ? 'morph' : 'terra';
    part.crumble = crumble;
    parts.push(part); groups.push(g);
    puff('terra', g.position, 16, 2, { up: 2, jitter: len * 0.4 });
    for (const e of echoes) if (!e.down && segmentDistance(e.group.position, a, b) < 0.45) hit(e, 'terra', t, UP, { damage: 1, launch: true, form });
  }
  firePulse(ground[ground.length >> 1]);
  thump();
  const until = t + 20, last = new Map(), epoch = shapeEpoch;
  addEffect(groups, (n) => {
    if (epoch !== shapeEpoch) { for (const part of parts) if (part.alive) { part.alive = false; removeBarrier(part.barrier); } return false; }
    const rise = Math.min((n - t) / 0.2, 1);
    let any = false;
    for (const part of parts) {
      if (!part.alive) continue;
      any = true;
      part.g.scale.y = rise;
      if (n > until) part.crumble();
      else if (form === 'lava') {
        lightNow(part.g.position, LAVA_LIGHT, 0.7);
        for (const e of echoes) if (!e.down && n - (last.get(e) || -9) > 1.2 && segmentDistance(e.group.position, part.a, part.b) < 0.45) { last.set(e, n); hit(e, 'pyro', n, UP, { damage: 1 }); }
      }
    }
    return any;
  });
  hudNote = 'ridge';
  return { form, parts };
}

// ---------- senses ----------
// Each one fills the whole room and tells you something different.
//   Tremor (Terra): a ripple through every surface from where you touched. Shows where things are, once.
//   Draft  (Aero):  the room's air, for several seconds. Shows whatever is moving, and the trail it leaves.
//   Chi    (Pyro):  heat and life, through walls, for as long as you hold it. Shows health, and which objects are hot.
//   Tide   (Aqua):  water across the whole floor, for as long as you hold it. Shows where everything stands, by its ripples.
let draftUntil = -1;
// Flora feels through what grows along every surface: anything close to a wall, the floor or furniture shows, and holds still a moment.
function rootSense(point, t) {
  for (const e of echoes) {
    if (e.down || e.airborne) continue;
    const s = nearestRoomSurface(e.group.position, 0.9);
    if (s || e.group.position.y < 0.9) { reveal(e, t, 7, ELEMENTS.flora.color); }
  }
}
function senseAero(centre, t) {
  play(SFX.aero.sense);
  hudNote = ELEMENTS.aero.sense.toLowerCase(); lastCast = 'aero'; drawHud();
  castSound.aero();
  draftUntil = t + DRAFT_SENSE.lasts;
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), glowMat(ELEMENTS.aero.color, 0.35));
  shell.material.wireframe = true;
  shell.position.copy(centre);
  addEffect([shell], (n) => {                      // the clap itself, racing out to the walls
    const r = Math.max((n - t) * DRAFT_SENSE.speed, 0.01);
    shell.scale.setScalar(r);
    shell.material.opacity = 0.35 * Math.max(1 - r / 12, 0);
    return r < 12;
  });
}
const _wind = new THREE.Vector3(), _wp = new THREE.Vector3();
function updateDraft(t) {
  if (t > draftUntil) return;
  const fade = Math.min((draftUntil - t) / 1.5, 1);
  const box = roomBounds();
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  for (let i = 0; i < Math.round(9 * fade); i++) {  // the room's air made visible: a slow turning current
    _wp.set(THREE.MathUtils.lerp(box.min.x - 0.2, box.max.x + 0.2, Math.random()), 0.1 + Math.random() * 2.1, THREE.MathUtils.lerp(box.min.z - 0.2, box.max.z + 0.2, Math.random()));
    _wind.set(-(_wp.z - cz), Math.sin(t + _wp.x * 2) * 0.25, _wp.x - cx).normalize().multiplyScalar(1.1);
    particles.emit(_wp, _wind, PCOL.aero[i % 3], 0.014, 0.7, 0, 0);
  }
  for (const e of echoes) {                        // anything pushing through that air leaves a wake
    if (e.down || !(e.moving > 0.12 || e.airborne)) continue;
    reveal(e, t, 0.9, ELEMENTS.aero.color);
    for (let i = 0; i < 2; i++) {
      _wind.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.25);
      particles.emit(_wp.copy(e.home).add(_wind), _wind, PCOL.aero[0], 0.03, 0.9, 0, 0.5);
    }
  }
  for (const o of objects) {
    if (o.dead || o.rest || o.vel.lengthSq() < 0.04) continue;
    particles.emit(o.pos, _wind.set(0, 0, 0), o.hostile ? HOSTILE : PCOL.aero[1], 0.035, 0.8, 0, 0);
  }
}

// Tide: a sheet of water over the floor. The moving front finds things; their ripples keep them found.
const TIDE_PTS = 10;
const tideUniforms = {
  uTime: pulseUniforms.uTime, uOrigin: { value: new THREE.Vector2() }, uFront: { value: 0 }, uOpacity: { value: 0 },
  uPts: { value: Array.from({ length: TIDE_PTS }, () => new THREE.Vector3(0, 0, 0)) },
};
const tideSheet = new THREE.Mesh(new THREE.CircleGeometry(TIDE_SENSE.reach, 64).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
  uniforms: tideUniforms, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
  vertexShader: /* glsl */`varying vec2 vP; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: /* glsl */`
    uniform float uTime, uFront, uOpacity; uniform vec2 uOrigin; uniform vec3 uPts[${TIDE_PTS}];
    varying vec2 vP;
    void main() {
      float d = distance(vP, uOrigin);
      if (d > uFront) discard;
      float swell = 0.5 + 0.5 * sin(d * 7.0 - uTime * 3.0);
      float edge = smoothstep(0.5, 0.0, uFront - d);                  // the leading lip of the water
      float rings = 0.0;
      for (int i = 0; i < ${TIDE_PTS}; i++) {
        float dd = distance(vP, uPts[i].xy);
        rings += uPts[i].z * (0.5 + 0.5 * sin(dd * 30.0 - uTime * 9.0)) * exp(-dd * 2.6);
      }
      float a = (0.05 + 0.05 * pow(swell, 6.0) + 0.5 * edge + 0.75 * rings) * uOpacity;
      vec3 col = mix(vec3(0.62, 0.78, 0.82), vec3(1.0), clamp(edge + rings, 0.0, 1.0));
      gl_FragColor = vec4(col, a);
    }`,
}));
tideSheet.position.y = 0.012;
tideSheet.visible = false;
tideSheet.renderOrder = 11;
scene.add(tideSheet);
let tideFrom = -1;

// Chi: heat ghosts for objects, seen through anything.
const chiGhosts = Array.from({ length: MAX_OBJECTS }, () => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), glowMat(new THREE.Color(0xff3a0a), 0));
  m.visible = false; m.renderOrder = 9;
  scene.add(m);
  return m;
});
const CHI_COOL = new THREE.Color(0x8a1a05), CHI_HOT = new THREE.Color(0xffc24a);

const held = { aqua: null, pyro: null, lumen: null };   // set each frame by whoever is holding a sense
const _amb = new THREE.Color();

const SENSE_TINT = { necro: [0.02, 0.1, 0.07], pyro: [0.16, 0.045, 0.01], gravis: [0.06, 0.03, 0.15], morph: [0.16, 0.02, 0.04], umbra: [0.05, 0.0, 0.1], lumen: [0.15, 0.14, 0.1], astra: [0.05, 0.07, 0.16] };
let senseWas = null;
function updateHeldSenses(t, heldDt = 0.016) {
  const sensing = held.pyro || held.aqua || held.lumen ? selected : null;      // the note a held sense opens on
  if (sensing && sensing !== senseWas) play(SFX[sensing].sense);
  senseWas = sensing;
  // Tide
  const a = held.aqua;
  if (a) {
    if (tideFrom < 0) { tideFrom = t; tideUniforms.uOrigin.value.set(a.origin.x, a.origin.z); castSound.aqua(); }
    tideUniforms.uOpacity.value = Math.min(tideUniforms.uOpacity.value + 0.08, 1);
  } else {
    tideUniforms.uOpacity.value = Math.max(tideUniforms.uOpacity.value - 0.03, 0);
    if (tideUniforms.uOpacity.value === 0) tideFrom = -1;
  }
  tideSheet.visible = tideUniforms.uOpacity.value > 0;
  if (tideSheet.visible && tideFrom >= 0) {
    const front = Math.min((t - tideFrom) * TIDE_SENSE.speed, TIDE_SENSE.reach);
    tideUniforms.uFront.value = front;
    const o2 = tideUniforms.uOrigin.value;
    let n = 0;
    for (const e of echoes) {
      if (e.down || Math.hypot(e.home.x - o2.x, e.home.z - o2.y) > front) continue;
      if (a) reveal(e, t, HOLD_REVEAL, ELEMENTS.aqua.color);
      if (n < TIDE_PTS) tideUniforms.uPts.value[n++].set(e.home.x, e.home.z, 1);
    }
    for (const o of objects) {                     // loose things disturb the water too, more faintly
      if (n >= TIDE_PTS) break;
      if (!o.dead && Math.hypot(o.pos.x - o2.x, o.pos.z - o2.y) < front) tideUniforms.uPts.value[n++].set(o.pos.x, o.pos.z, o.hostile ? 1 : 0.35);
    }
    for (; n < TIDE_PTS; n++) tideUniforms.uPts.value[n].z = 0;
  }
  // Chi
  const p = held.pyro;
  _amb.setRGB(0, 0, 0);
  if (p) {
    const tint = SENSE_TINT[selected] || SENSE_TINT.pyro;
    _amb.setRGB(tint[0], tint[1], tint[2]);
    for (const e of echoes) {
      if (e.down) continue;
      if (selected === 'pyro' && (e.frozenUntil > t || (AI.kinds && KINDS[e.kind] && KINDS[e.kind].cold))) continue;          // ice gives off no heat: Chi cannot find what is frozen
      reveal(e, t, HOLD_REVEAL, ELEMENTS[FIST_SENSE[selected] ? selected : 'pyro'].color);
      if (selected === 'umbra') e.blindUntil = Math.max(e.blindUntil, t + 0.4);   // while you hold the dark, nothing can see you
    }
  }
  // Glint: light shows everything it can reach, in full, and nothing it cannot.
  if (held.lumen) {
    const tint = SENSE_TINT[selected] || SENSE_TINT.lumen;
    _amb.setRGB(tint[0], tint[1], tint[2]);
    if (selected === 'astra') {                      // from straight overhead: whatever has open sky above it
      for (const e of echoes) if (!e.down && !collide(e.group.position, _cp.copy(e.group.position).setY(e.group.position.y + 1.2))) reveal(e, t, HOLD_REVEAL * 2, ELEMENTS.astra.color);
    } else for (const e of echoes) if (!e.down && lineOfSight(held.lumen.origin, e.group.position)) { reveal(e, t, HOLD_REVEAL * 2, ELEMENTS.lumen.color); e.exposedUntil = Math.max(e.exposedUntil, t + 2); }
  }
  pulseUniforms.uAmbient.value.lerp(_amb, Math.min(heldDt * 9, 1));   // by the clock, so it fades the same at any frame rate
  let g = 0;
  if (p && (selected === 'pyro' || selected === 'gravis')) {
    for (const o of objects) {
      if (o.dead || g >= chiGhosts.length || (selected === 'pyro' && o.def.ice)) continue;
      const hot = o.burnUntil > 0 || o.fuse > 0 || o.heat > t || o.def.explodes || o.kind === 'steam';
      const ghost = chiGhosts[g++];
      ghost.visible = true;
      ghost.position.copy(o.pos);
      ghost.scale.setScalar(o.def.r * (hot ? 1.9 + 0.25 * Math.sin(t * 9) : 1.35));
      ghost.material.color.copy(hot ? CHI_HOT : CHI_COOL);
      ghost.material.opacity = o.hostile ? 0.7 : hot ? 0.5 : 0.2;
    }
  }
  for (; g < chiGhosts.length; g++) chiGhosts[g].visible = false;
  updateDraft(t);
  if ((a || p) && hudNote !== ELEMENTS[selected].sense.toLowerCase()) {
    hudNote = ELEMENTS[selected].sense.toLowerCase(); lastCast = selected; drawHud();
  }
  held.aqua = held.pyro = held.lumen = null;
}

// ---------- discipline selection ----------
function setForm(key, form) {
  if (key === 'terra') terraForm = form; else forms[key] = form;
  const name = ELEMENTS[key].label[0] + ELEMENTS[key].label.slice(1).toLowerCase();
  for (const el of chipEls) if (el.dataset.el === key) el.textContent = form === FORMS[key][0] ? name : `${name} · ${form}`;
}
function cycleForm(key = 'terra') {
  const list = FORMS[key];
  setForm(key, list[(list.indexOf(formOf(key)) + 1) % list.length]);
  tick();
  hudNote = `${ELEMENTS[key].label.toLowerCase()} as ${formOf(key)}`; lastCast = key;
  drawHud();
}
let prevSelected = 'pyro';                         // the one before this one: a middle-finger pinch goes back to it
function selectElement(key, quiet) {
  if (selected === key && !quiet) { cycleForm(key); return; }
  if (selected === key && quiet) return;
  prevSelected = selected;
  selected = key;
  lastCast = key;
  for (const el of chipEls) el.classList.toggle('on', el.dataset.el === key);
  for (const el of moveEls) {
    const g = el.dataset.g;
    el.textContent = g === 'sense' ? ELEMENTS[key].sense : g === 'draw' ? DRAWN[key] : g === 'seal' ? SEALS[key].name : MOVES[key][g].name;
    el.style.setProperty('--c', `#${ELEMENTS[key].color.getHexString()}`);
  }
  if (!quiet) { tick(); hudNote = `${ELEMENTS[key].label.toLowerCase()} ready`; }
  drawHud();
}

// Palm menu: four orbs that float over an open palm turned toward your face.
const menuGroup = new THREE.Group();
// The power wheel. An open palm turned toward you puts every discipline in a ring round it, each a coloured bead.
// Hover the other hand's fingertip near a bead and the plate in the middle names it; touch the bead to take it.
// Under the plate, the three sub-elements of the discipline you are in: touch one to switch straight to it.
const menuOrbs = ELEMENT_ORDER.map((key) => {
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 16, 12),
    new THREE.MeshBasicMaterial({ color: ELEMENTS[key].color, depthTest: false, transparent: true }),
  );
  orb.renderOrder = 25;
  menuGroup.add(orb);
  return orb;
});
function makePlate(w, h, px = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = px; canvas.height = Math.round(px * h / w);
  const tex = new THREE.CanvasTexture(canvas);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false }));
  mesh.renderOrder = 26;
  menuGroup.add(mesh);
  let shown = null;
  return { mesh, draw(text, colour, on = false, sub = '') {
    const id = text + colour + on + sub;
    if (id === shown) return;
    shown = id;
    const c = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    c.clearRect(0, 0, W, H);
    c.fillStyle = on ? colour : 'rgba(8,10,14,0.82)';
    c.strokeStyle = colour; c.lineWidth = 6;
    c.beginPath(); c.roundRect(4, 4, W - 8, H - 8, H * 0.3); c.fill(); c.stroke();
    c.fillStyle = on ? '#06080c' : colour; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `600 ${Math.round(H * (sub ? 0.4 : 0.5))}px system-ui, sans-serif`;
    c.fillText(text, W / 2, sub ? H * 0.36 : H / 2);
    if (sub) { c.font = `${Math.round(H * 0.24)}px system-ui, sans-serif`; c.fillStyle = '#c8d0dc'; c.fillText(sub, W / 2, H * 0.74); }
    tex.needsUpdate = true;
  } };
}
const menuPlate = makePlate(0.1, 0.042, 384);
const formPlates = [0, 1, 2, 3].map(() => makePlate(0.046, 0.02, 160));
const WHEEL_R = 0.115;
menuGroup.visible = false;
scene.add(menuGroup);
// Under the orbs: three switches.
//   CALM  creatures still move, but stop attacking. For practising moves.
//   READ  shows what the tracker thinks each hand is doing. For working out why a move will not fire.
//   NEW   back to wave one with a fresh room.
const options = { calm: false, read: false };
const SWITCHES = ['CALM', 'READ', 'NEW', 'OCCL'];
const switchMeshes = SWITCHES.map((label, i) => {
  const canvas = document.createElement('canvas');
  canvas.width = 160; canvas.height = 80;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.036, 0.018), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  mesh.renderOrder = 25;
  mesh.userData = { canvas, tex, label, i };
  menuGroup.add(mesh);
  return mesh;
});
function drawSwitch(mesh) {
  const { canvas, tex, label, i } = mesh.userData;
  const on = i === 0 ? options.calm : i === 1 ? options.read : i === 3 ? occlusion : false;
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, 160, 80);
  c.fillStyle = on ? '#b6ff3c' : 'rgba(5,7,5,0.85)';
  c.strokeStyle = '#b6ff3c'; c.lineWidth = 4;
  c.beginPath(); c.roundRect(4, 4, 152, 72, 22); c.fill(); c.stroke();
  c.fillStyle = on ? '#050705' : '#b6ff3c';
  c.font = '600 34px ui-monospace, Menlo, Consolas, monospace';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(label, 80, 42);
  tex.needsUpdate = true;
}
switchMeshes.forEach(drawSwitch);
function flipSwitch(i) {
  tick();
  if (i === 0) { options.calm = !options.calm; AI.attacks = !options.calm; hudNote = options.calm ? 'calm: no attacks' : 'attacks on'; }
  else if (i === 1) { options.read = !options.read; hudNote = options.read ? 'hand readout on' : 'hand readout off'; }
  else if (i === 3) { occlusion = !occlusion; hudNote = occlusion ? 'room hides what is behind it' : 'occlusion off'; }
  else { wave = 1; scatterEchoes(); }
  switchMeshes.forEach(drawSwitch);
  for (const el of optionEls) el.classList.toggle('on', el.dataset.opt === 'calm' && options.calm);
  drawHud();
}
// The readout: a small panel over the right wrist.
const readCanvas = document.createElement('canvas');
readCanvas.width = 640; readCanvas.height = 200;
const readTex = new THREE.CanvasTexture(readCanvas);
readTex.colorSpace = THREE.SRGBColorSpace;
const readout = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.0625), new THREE.MeshBasicMaterial({ map: readTex, transparent: true, depthTest: false, depthWrite: false }));
readout.renderOrder = 21; readout.visible = false;
scene.add(readout);
const gestureLog = { name: 'none', t: -99 };
let readDrawn = -1;
function noteGesture(name) { gestureLog.name = name; gestureLog.t = now(); }
function drawReadout(L, R, t) {
  if (t - readDrawn < 0.12) return;
  readDrawn = t;
  const c = readCanvas.getContext('2d');
  c.clearRect(0, 0, 640, 200);
  c.fillStyle = 'rgba(5,7,5,0.85)'; c.strokeStyle = '#cfd6d2'; c.lineWidth = 3;
  c.beginPath(); c.roundRect(3, 3, 634, 194, 26); c.fill(); c.stroke();
  c.font = '34px ui-monospace, Menlo, Consolas, monospace'; c.textBaseline = 'middle';
  const line = (tag, st, y) => {
    c.fillStyle = st.valid ? '#cfd6d2' : '#6f7a74';
    c.fillText(st.valid ? `${tag} ${handShape(st).padEnd(5)} curl ${st.curl.toFixed(2)}  ${st.speed.toFixed(1)} m/s` : `${tag} not tracked`, 24, y);
  };
  line('L', L, 46); line('R', R, 100);
  c.fillStyle = '#b6ff3c';
  const age = t - gestureLog.t;
  c.fillText(`last: ${gestureLog.name}${age < 60 ? `  ${age.toFixed(1)}s ago` : ''}`, 24, 156);
  readTex.needsUpdate = true;
}

// ---------- wrist HUD ----------
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 512; hudCanvas.height = 192;
const hudTex = new THREE.CanvasTexture(hudCanvas);
hudTex.colorSpace = THREE.SRGBColorSpace;
const hud = new THREE.Mesh(
  new THREE.PlaneGeometry(0.16, 0.06),
  new THREE.MeshBasicMaterial({ map: hudTex, transparent: true, depthTest: false, depthWrite: false }),
);
hud.renderOrder = 20;
hud.visible = false;
scene.add(hud);

function drawHud() {
  const accent = `#${ELEMENTS[selected].color.getHexString()}`;
  const c = hudCanvas.getContext('2d');
  c.clearRect(0, 0, 512, 192);
  c.fillStyle = 'rgba(5,7,5,0.82)';
  c.strokeStyle = accent;
  c.lineWidth = 4;
  c.beginPath(); c.roundRect(4, 4, 504, 184, 36); c.fill(); c.stroke();
  c.textBaseline = 'middle';
  c.fillStyle = accent;
  c.font = '600 58px ui-monospace, Menlo, Consolas, monospace';
  c.fillText(ELEMENTS[selected].label, 34, 68);
  if (formOf(selected) !== FORMS[selected][0]) {      // which sub-element
    const w = c.measureText(ELEMENTS[selected].label).width;
    c.font = '30px ui-monospace, Menlo, Consolas, monospace';
    c.fillText(formOf(selected), 46 + w, 74);
    c.font = '600 58px ui-monospace, Menlo, Consolas, monospace';
  }
  c.fillStyle = '#b6ff3c';
  c.textAlign = 'right';
  c.font = '600 40px ui-monospace, Menlo, Consolas, monospace';
  c.fillText(`w${wave} ${downCount}/${activeCount}`, 478, 66);
  for (let i = 0; i < MAX_HP; i++) {                // health pips
    c.beginPath(); c.arc(470 - i * 24, 138, 8, 0, Math.PI * 2);
    c.fillStyle = i < playerHP ? '#ff4d6a' : 'rgba(255,77,106,0.18)';
    c.fill();
  }
  c.textAlign = 'left';
  c.fillStyle = '#cfd6d2';
  c.font = '30px ui-monospace, Menlo, Consolas, monospace';
  c.fillText(hudNote, 36, 138);
  hudTex.needsUpdate = true;
  if (!renderer.xr.isPresenting) {
    statusEl.textContent = `Wave ${wave} · ${downCount}/${activeCount} down · health ${playerHP}/${MAX_HP}` + (xrSupported ? '' : ' · preview mode');
  }
}

// ---------- hands ----------
const waterAnchor = new THREE.Vector3();
let waterAnchorOn = false;
function newHand() {
  return {
    valid: false, seen: false, armed: false, ready: true, clapBlock: -1,
    lastTouch: -1, lastCast: -1, stillT: 0, curl: 1.4, speed: 0,
    hold: null, aim: null, aimT: -9, charge: 0, prevOtherFist: false,
    palm: new THREE.Vector3(), normal: new THREE.Vector3(), across: new THREE.Vector3(),
    wrist: new THREE.Vector3(), knuckle: new THREE.Vector3(), indexBase: new THREE.Vector3(),
    pinkyBase: new THREE.Vector3(), indexTip: new THREE.Vector3(), hasTip: false,
    point: false, pointDir: new THREE.Vector3(),
    thumbTip: new THREE.Vector3(), pinchPos: new THREE.Vector3(), pinch: false, wasPinch: false,
    midTip: new THREE.Vector3(), ringTip: new THREE.Vector3(), pinkyTip: new THREE.Vector3(), midPinch: false, ringPinch: false, quickT: -9, seal: false, sealT: 0, sealArmed: true,
    prev: new THREE.Vector3(), vel: new THREE.Vector3(),
  };
}
const handState = { left: newHand(), right: newHand() };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _tip = new THREE.Vector3();
const _vhat = new THREE.Vector3(), _fwd = new THREE.Vector3(), _raw = new THREE.Vector3(), _off = new THREE.Vector3();
const TIPS = ['index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip'];
let sawHands = false;
let clapArmed = true;
let lastMenuPick = -1, menuArmed = true;

function jointPos(frame, hand, name, refSpace, out) {
  const joint = hand.get(name);
  if (!joint) return false;
  const pose = frame.getJointPose(joint, refSpace);
  if (!pose) return false;
  const p = pose.transform.position;
  out.set(p.x, p.y, p.z);
  return true;
}

// Which verb, if any, a hand motion is. Pure, so it can be tested without a headset.
//   curl: fingertip reach / knuckle reach.  normal: unit vector out of the palm.
//   vel: palm velocity (m/s).  fwd: unit vector the head is facing.
//   pointDir: unit vector along the index finger when the hand is pointing, otherwise null.
function classifyGesture(curl, normal, vel, fwd, pointDir = null) {
  const speed = vel.length();
  if (speed < 0.3) return null;
  _vhat.copy(vel).divideScalar(speed);
  if (pointDir) return speed > POINT_SPEED && _vhat.dot(pointDir) > 0.5 ? 'point' : null;
  if (curl < CURL_FIST) {
    // Straight-down punches are left for slams.
    return speed > PUNCH_SPEED && _vhat.dot(fwd) > 0.35 && _vhat.y > -0.7 ? 'punch' : null;
  }
  if (curl > CURL_OPEN) {
    const along = _vhat.dot(normal);
    if (normal.y > 0.55 && vel.y > LIFT_SPEED) return 'lift';
    if (along > 0.65 && Math.abs(normal.y) < 0.6 && speed > PUSH_SPEED && normal.dot(fwd) > 0.2) return 'shove';
    if (Math.abs(along) < 0.45 && speed > SWEEP_SPEED && Math.abs(_vhat.y) < 0.6) return 'sweep';
  }
  return null;
}

const handShape = (st) => st.point ? 'point' : st.curl < CURL_FIST ? 'fist' : st.curl > CURL_OPEN ? 'open' : 'loose';
// Pure: do two tracked hands count as one two-handed move?
function isTwin(a, b) {
  if (!b.valid || !b.ready || b.speed < 0.8 || handShape(a) !== handShape(b)) return false;
  return a.vel.dot(b.vel) > 0.7 * a.speed * b.speed;
}

function readHand(frame, source, refSpace, st, dt) {
  const hand = source.hand;
  if (!jointPos(frame, hand, 'wrist', refSpace, st.wrist) ||
      !jointPos(frame, hand, 'middle-finger-phalanx-proximal', refSpace, st.knuckle) ||
      !jointPos(frame, hand, 'index-finger-metacarpal', refSpace, st.indexBase) ||
      !jointPos(frame, hand, 'pinky-finger-metacarpal', refSpace, st.pinkyBase)) {
    st.valid = false; st.seen = false; st.pinch = false;            // tracking dropped: forget the velocity
    return;
  }
  st.valid = true;
  st.palm.addVectors(st.wrist, st.knuckle).multiplyScalar(0.5);
  _a.subVectors(st.indexBase, st.wrist); _b.subVectors(st.pinkyBase, st.wrist);
  st.normal.crossVectors(_a, _b).normalize();
  if (source.handedness === 'left') st.normal.negate();
  st.across.subVectors(st.pinkyBase, st.indexBase).normalize();
  const reach = st.knuckle.distanceTo(st.wrist) || 0.09;
  let tipSum = 0, tipN = 0, indexReach = 0, restSum = 0, restN = 0;
  for (const name of TIPS) {
    if (jointPos(frame, hand, name, refSpace, _tip)) {
      const r = _tip.distanceTo(st.wrist);
      tipSum += r; tipN++;
      if (name === 'index-finger-tip') { st.indexTip.copy(_tip); indexReach = r / reach; }
      else { restSum += r; restN++; }
    }
  }
  st.hasTip = indexReach > 0;
  st.curl = tipN ? tipSum / tipN / reach : 1.4;
  // Pointing: index out, the other three fingers tucked in.
  st.point = indexReach > CURL_OPEN && restN > 0 && restSum / restN / reach < CURL_FIST + 0.1;
  if (st.point) st.pointDir.subVectors(st.indexTip, st.indexBase).normalize();
  // Pinching: thumb and index tips together while the other fingers stay out. Let go a little further apart than it took to start.
  if (st.hasTip && jointPos(frame, hand, 'thumb-tip', refSpace, st.thumbTip)) {
    const gap = st.thumbTip.distanceTo(st.indexTip);
    st.pinchPos.addVectors(st.thumbTip, st.indexTip).multiplyScalar(0.5);
    if (gap > PINCH_OFF) st.pinch = false;
    else if (gap < PINCH_ON && restN > 0 && restSum / restN / reach > 1.4) st.pinch = true;
    // The other two pinches are shortcuts, not moves. They only count on an otherwise open hand, so a fist cannot set them off.
    const openHand = gap > 0.045 && st.curl > 1.35;
    const mid = jointPos(frame, hand, 'middle-finger-tip', refSpace, st.midTip) ? st.thumbTip.distanceTo(st.midTip) : 9;
    const ring = jointPos(frame, hand, 'ring-finger-tip', refSpace, st.ringTip) ? st.thumbTip.distanceTo(st.ringTip) : 9;
    st.midEdge = false; st.ringEdge = false;
    // The seal: index and middle straight, ring and little finger folded.
    const far = (v) => v.distanceTo(st.wrist) / reach;
    st.seal = jointPos(frame, hand, 'pinky-finger-tip', refSpace, st.pinkyTip) && mid < 9 && ring < 9
      && far(st.indexTip) > 1.55 && far(st.midTip) > 1.55 && far(st.ringTip) < 1.25 && far(st.pinkyTip) < 1.25 && gap > 0.03;
    if (mid > 0.045) st.midPinch = false; else if (mid < 0.018 && openHand && !st.midPinch && ring > 0.03) { st.midPinch = true; st.midEdge = true; }
    if (ring > 0.045) st.ringPinch = false; else if (ring < 0.018 && openHand && !st.ringPinch && mid > 0.03) { st.ringPinch = true; st.ringEdge = true; }
  } else st.pinch = false;
  if (st.seen && dt > 0) {
    _raw.subVectors(st.palm, st.prev).divideScalar(dt);
    st.vel.lerp(_raw, 0.5);
  } else {
    st.vel.set(0, 0, 0);
  }
  st.prev.copy(st.palm);
  st.seen = true;
  st.speed = st.vel.length();
  if (st.speed < REARM_SPEED) st.ready = true;
  st.stillT = st.speed < HOLD_STILL ? st.stillT + dt : 0;
}

function updateHands(frame, refSpace, t, dt, viewerPos) {
  _fwd.set(0, 0, -1).applyQuaternion(viewerQuat);
  handState.left.valid = handState.right.valid = false;
  streamCtl = null;                                // the hand that owns the stream says so again every frame
  for (const source of frame.session.inputSources) {
    if (source.hand && handState[source.handedness]) readHand(frame, source, refSpace, handState[source.handedness], dt);
  }
  const L = handState.left, R = handState.right;
  if (!sawHands && (L.valid || R.valid)) { sawHands = true; hudNote = 'build 13. open palm toward you: pick'; drawHud(); }

  // Palm menu: an open, slow palm turned toward your face. The other index finger picks.
  let menuHand = null;
  for (const st of [L, R]) {
    if (!st.valid || st.curl < CURL_OPEN || st.speed > 0.6) continue;
    _off.subVectors(viewerPos, st.palm).normalize();
    if (st.normal.dot(_off) > 0.6) { menuHand = st; break; }
  }
  menuGroup.visible = !!menuHand;
  reticles[0].visible = reticles[1].visible = false;
  hideOrbs(0); hideOrbs(1);
  if (menuHand) {
    const pointer = menuHand === L ? R : L;
    let touching = -1;
    const fing = _cp.subVectors(menuHand.knuckle, menuHand.wrist).normalize();
    const hub = _cv.copy(menuHand.palm).addScaledVector(menuHand.normal, 0.07);
    const tip = pointer.valid && pointer.hasTip ? pointer.indexTip : null;
    let hover = -1, hoverDist = 0.05;
    menuOrbs.forEach((orb, i) => {
      const ang = (i / menuOrbs.length) * Math.PI * 2;
      orb.position.copy(hub).addScaledVector(fing, Math.cos(ang) * WHEEL_R).addScaledVector(menuHand.across, Math.sin(ang) * WHEEL_R);
      const d = tip ? tip.distanceTo(orb.position) : 9;
      if (d < hoverDist) { hoverDist = d; hover = i; }
    });
    menuOrbs.forEach((orb, i) => orb.scale.setScalar(ELEMENT_ORDER[i] === selected ? 1.7 : i === hover ? 1.4 : 1));
    if (hover >= 0 && hoverDist < 0.027) touching = hover;
    const shownKey = hover >= 0 ? ELEMENT_ORDER[hover] : selected;
    menuPlate.mesh.position.copy(hub).addScaledVector(fing, 0.02);
    menuPlate.mesh.lookAt(viewerPos);
    menuPlate.draw(ELEMENTS[shownKey].label, `#${ELEMENTS[shownKey].color.getHexString()}`, false, hover >= 0 && shownKey !== selected ? MOVES[shownKey].punch.name + ' · ' + MOVES[shownKey].slam.name + ' · ' + DRAWN[shownKey] : formOf(selected));
    const list = FORMS[selected];
    formPlates.forEach((pl, j) => {
      pl.mesh.visible = j < list.length;
      if (j >= list.length) return;
      pl.mesh.position.copy(hub).addScaledVector(fing, -0.022 - (j >> 1) * 0.024).addScaledVector(menuHand.across, ((j & 1) - 0.5) * 0.05);
      pl.mesh.lookAt(viewerPos);
      pl.draw(list[j], `#${ELEMENTS[selected].color.getHexString()}`, formOf(selected) === list[j]);
      if (tip && tip.distanceTo(pl.mesh.position) < 0.02) touching = 200 + j;
    });
    _off.subVectors(menuHand.wrist, menuHand.knuckle).normalize();          // toward the wrist: the second row sits below the orbs
    switchMeshes.forEach((sw, i) => {
      sw.position.copy(menuHand.palm).addScaledVector(menuHand.normal, 0.07).addScaledVector(_off, WHEEL_R + 0.045).addScaledVector(menuHand.across, (i - 1.5) * 0.042);
      sw.lookAt(viewerPos);
      if (pointer.valid && pointer.hasTip && pointer.indexTip.distanceTo(sw.position) < 0.022) touching = 100 + i;
    });
    // A poke counts once: the finger has to come off the orbs before it can pick again.
    // Poking the discipline you are already in steps it to its next sub-element.
    if (touching < 0) menuArmed = true;
    else if (menuArmed && t - lastMenuPick > 0.25) {
      menuArmed = false; lastMenuPick = t;
      if (touching >= 200) { setForm(selected, FORMS[selected][touching - 200]); tick(); hudNote = `${ELEMENTS[selected].label.toLowerCase()} as ${formOf(selected)}`; lastCast = selected; drawHud(); }
      else if (touching >= 100) flipSwitch(touching - 100);
      else if (ELEMENT_ORDER[touching] !== selected) selectElement(ELEMENT_ORDER[touching]);
    }
  }

  // Aero's sense: a clap.
  if (L.valid && R.valid) {
    const gap = L.palm.distanceTo(R.palm);
    if (gap > CLAP_OFF) clapArmed = true;
    else if (clapArmed && gap < CLAP_ON && !menuHand) {
      clapArmed = false;
      L.clapBlock = R.clapBlock = t;
      noteGesture('clap');
      if (selected === 'aero') senseAero(_off.addVectors(L.palm, R.palm).multiplyScalar(0.5).clone(), t);
    }
  }

  // Guard: wrists crossed and held up in front of the chest.
  guard.on = false;
  if (L.valid && R.valid && !menuHand && !L.hold && !R.hold && L.wrist.distanceTo(R.wrist) < 0.16 && L.palm.distanceTo(R.palm) > 0.07) {
    _off.addVectors(L.wrist, R.wrist).multiplyScalar(0.5);
    _cp.set(_fwd.z, 0, -_fwd.x).normalize();                         // your left
    const crossed = _cv.subVectors(L.palm, R.palm).dot(_cp) < 0.02;   // the left hand has come across to the right side
    if (crossed && _off.y > viewerPos.y - 0.6 && _off.y < viewerPos.y + 0.1 && _off.distanceTo(viewerPos) < 0.6) {
      guard.on = true; guard.pos.copy(_off).addScaledVector(_fwd, 0.12);
      L.ready = R.ready = false; L.charge = R.charge = 0; L.clapBlock = R.clapBlock = t;
      noteGesture('guard');
    }
  }
  for (const st of [L, R]) {
    if (!st.valid || st === menuHand || guard.on) continue;
    if (st.seal && st.speed < 0.7 && st.palm.y > viewerPos.y - 0.55 && !st.hold) {
      st.sealT += dt; st.ready = false; st.charge = 0;
      if (st.sealT > 0.35 && st.sealArmed) { st.sealArmed = false; noteGesture('seal'); resonate(selected, t); }
      continue;
    }
    st.sealT = 0; if (!st.seal) st.sealArmed = true;
    if ((st.midEdge || st.ringEdge) && t - st.quickT > 0.5 && !st.hold && !(stream.on && stream.owner === st)) {
      st.quickT = t; st.ready = false;
      if (st.midEdge) { noteGesture('middle pinch'); const back = prevSelected; selectElement(back, true); play(SFX.swap); hudNote = `${ELEMENTS[selected].label.toLowerCase()} ready`; lastCast = selected; drawHud(); }
      else { noteGesture('ring pinch'); cycleForm(selected); }
      st.midEdge = st.ringEdge = false;
      continue;
    }
    const isFist = st.curl < CURL_FIST && !st.point, isOpen = st.curl > CURL_OPEN;
    const other = st === L ? R : L;

    // Surfaces: an open palm touches (Terra's sense), a fist slams (every discipline).
    const hitPalm = nearestSurface(st.palm);
    const hitFist = nearestSurface(st.knuckle);
    const near = Math.min(hitPalm.dist, hitFist.dist) < TOUCH_OFF;
    if (!near) st.armed = true;
    else if (st.armed && !st.hold && t - st.lastTouch > 0.35) {
      if (isFist && hitFist.dist < SLAM_ON) {
        st.armed = false; st.lastTouch = t; st.ready = false;
        const struckSurface = nearestRoomSurface(st.knuckle, 0.35);
        cast(selected, 'slam', { hand: st.knuckle.clone(), dir: _fwd.clone(), eye: viewerPos.clone(), fwd: _fwd.clone(), ground: hitFist.point, normal: struckSurface ? struckSurface.normal : UP.clone(), t });
      } else if (!isFist && hitPalm.dist < TOUCH_ON) {
        st.armed = false; st.lastTouch = t; st.ready = false;
        noteGesture('palm on surface');
        if (TOUCH_SENSE[selected]) {
          firePulse(hitPalm.point);
          if (selected === 'flora') rootSense(hitPalm.point, t);
          play(SFX[selected].sense); hudNote = ELEMENTS[selected].sense.toLowerCase(); lastCast = selected; drawHud();
        } else {
          if (selected === 'aqua') {
            const surf = nearestRoomSurface(st.palm, 0.4);
            addSource(hitPalm.point, surf ? surf.normal : UP, t);
            hudNote = 'wellspring'; lastCast = 'aqua'; drawHud();
          } else { hudNote = `${ELEMENTS[selected].label.toLowerCase()} senses differently`; drawHud(); }
        }
      }
    }
    // Grip. A hand that is holding something does nothing else until it opens.
    const idx = st === L ? 0 : 1;
    _off.subVectors(st.palm, viewerPos);
    const reachNow = _off.length();
    const reachDir = _off.clone().divideScalar(reachNow || 1);
    const otherFist = other.valid && !other.hold && other.curl < CURL_FIST && !other.point;
    if (st.hold) {
      if (st.curl > 1.45) endHold(st);
      else updateHold(st, viewerPos, reachDir, reachNow / st.hold.reach0, { hand: st.palm, squeeze: otherFist, squeezeEdge: otherFist && !st.prevOtherFist }, t, dt);
      st.prevOtherFist = otherFist;
      st.ready = false; st.armed = false;
      continue;
    }
    st.prevOtherFist = otherFist;
    if (near || t - st.clapBlock < 0.4) continue;
    // Shaping. Aqua: a pinch draws the carried water out into a stream. Morph: a bladed tendril. The others trace a line.
    if (selected === 'aqua' || selected === 'morph') {
      if (stream.on && stream.endOwner === st) {     // this hand has the far end
        if (!st.pinch) stream.endOwner = null;
        st.ready = false; st.charge = 0;
        continue;
      }
      if (stream.on && stream.owner === st) {
        if (st.pinch || st.curl < 1.45) {            // it stays out until the hand opens
          if (!stream.endOwner && other.valid && other.pinch && !other.wasPinch && stream.nodes.some(n => n.p.distanceTo(other.pinchPos) < 0.25)) stream.endOwner = other;
          streamCtl = { root: st.pinch ? st.pinchPos : st.knuckle, dir: reachDir, vel: st.vel, eye: viewerPos, grip: isFist, squeeze: otherFist && !stream.endOwner, end: stream.endOwner ? stream.endOwner.pinchPos : null };
        }
        st.ready = false; st.charge = 0; st.wasPinch = st.pinch;
        continue;
      }
      if (!stream.on && st.pinch && !st.wasPinch) {
        noteGesture('pinch');
        streamCtl = { root: st.pinchPos, dir: reachDir, vel: st.vel, eye: viewerPos, grip: false, squeeze: false, end: null };
        if (startStream(streamCtl, t, selected)) { stream.owner = st; st.ready = false; st.wasPinch = true; continue; }
      }
    } else if (st.pinch) {
      if (!drawing) drawBegin(selected, st.pinchPos, st);
      else if (drawing.owner === st) drawAdd(st.pinchPos);
      st.ready = false; st.charge = 0; st.wasPinch = true;
      continue;
    } else if (drawing && drawing.owner === st) drawEnd(t);
    st.wasPinch = st.pinch;
    if (selected === 'aero' && isOpen && st.speed > 0.4 && currents.length && bendCurrents(st.palm, st.vel, dt)) { st.ready = false; continue; }
    if (GRABS[selected]) {
      if (isOpen && st.speed < 0.9) {                // an open hand reaching: show what it would take
        st.aim = findGrabTarget(holdKey(selected), viewerPos, reachDir, t);
        st.aimT = t;
        showReticle(idx, st.aim, holdKey(selected), viewerPos);
      } else if (isFist && st.aim && t - st.aimT < 0.35 && st.speed < 0.9 && reachNow >= CHARGE_REACH) {
        beginHold(st, holdKey(selected), st.aim, viewerPos, t);
        st.hold.reach0 = reachNow || 1;
        st.aim = null; st.ready = false;
        continue;
      }
    }
    // Charging: a raised fist that stays closed builds the discipline's big throw; the next punch lets it go.
    // Pyro charges at any reach. The others charge with the fist drawn in toward you, so it cannot be mistaken for a grab.
    if (isFist && st.palm.y > viewerPos.y - 0.5 && (!GRABS[selected] || reachNow < CHARGE_REACH)) st.charge = Math.min(st.charge + dt, CHARGE_MAX);
    else if (!isFist) st.charge = 0;
    showCharge(idx, st.knuckle, st.charge, selected);

    // Held senses: Aqua reads through a raised open palm, Pyro through a raised fist.
    const raised = st.palm.y > viewerPos.y - 0.5;
    if (raised && st.stillT > HOLD_TIME) {
      if (selected === 'aqua' && isOpen && st.normal.dot(_fwd) > 0.5) held.aqua = { origin: viewerPos, dir: st.normal };
      if (FIST_SENSE[selected] && isFist) held.pyro = { centre: viewerPos };
      if (PALM_SENSE[selected] && isOpen && st.normal.dot(_fwd) > 0.5) held.lumen = { origin: viewerPos };
    }

    // Attacks.
    if (st.ready && t - st.lastCast > CAST_COOLDOWN && t - st.lastTouch > 0.3) {
      const gesture = classifyGesture(st.curl, st.normal, st.vel, _fwd, st.point ? st.pointDir : null);
      if (gesture) {
        st.ready = false;
        st.lastCast = t;
        const c = { eye: viewerPos.clone(), fwd: _fwd.clone(), t, st };
        if (gesture === 'punch') { c.hand = st.knuckle.clone(); c.dir = st.vel.clone(); }
        else if (gesture === 'shove') { c.hand = st.palm.clone(); c.dir = st.normal.clone(); }
        else if (gesture === 'point') { c.hand = st.indexTip.clone(); c.dir = st.pointDir.clone(); }
        else { c.hand = st.palm.clone(); c.dir = _fwd.clone(); }   // lift and sweep aim where you look
        if (gesture === 'punch' && st.charge > CHARGE_MIN) {
          throwCharged(selected, c.hand, c.dir, c.eye, c.fwd, st.charge, t);
          st.charge = 0;
          continue;
        }
        // Twin cast: the other hand is doing the same thing, the same way, right now.
        if (isTwin(st, other) && other !== menuHand && !other.hold) {
          other.ready = false; other.lastCast = t;
          c.power = 1.6;
          if (gesture !== 'lift' && gesture !== 'sweep') c.hand.lerp(gesture === 'punch' ? other.knuckle : gesture === 'point' ? other.indexTip : other.palm, 0.5);
        }
        cast(selected, gesture, c);
      }
    }
  }

  // Carried water floats just above and outside whichever hand is free to lead.
  const lead = R.valid && R !== menuHand ? R : L.valid && L !== menuHand ? L : null;
  // Carried water floats in front of your chest, where either hand can reach it. (A charging fist still calls it over.)
  waterAnchor.copy(viewerPos).addScaledVector(_off.copy(_fwd).setY(0).normalize(), 0.42).setY(viewerPos.y - 0.38);
  waterAnchorOn = selected === 'aqua';

  readout.visible = options.read;
  if (options.read) {
    drawReadout(L, R, t);
    if (R.valid) readout.position.copy(R.wrist).add(_off.set(0, 0.11, 0));
    else { _off.set(0.22, -0.2, -0.55).applyQuaternion(viewerQuat); readout.position.copy(viewerPos).add(_off); }
    readout.lookAt(viewerPos);
  }

  // HUD rides the left wrist; it steps aside while the menu is up.
  hud.visible = !menuHand;
  if (L.valid) {
    hud.position.copy(L.wrist).add(_off.set(0, 0.09, 0));
  } else {
    _off.set(0, -0.28, -0.55).applyQuaternion(viewerQuat);
    hud.position.copy(viewerPos).add(_off);
  }
  hud.lookAt(viewerPos);
}

// Controller fallback: trigger punches at what you point at (or senses), grip changes discipline.
const raycaster = new THREE.Raycaster();
const _origin = new THREE.Vector3(), _rayDir = new THREE.Vector3();
function controllerRay(event) {
  const source = event.inputSource;
  if (source.hand) return false;                     // hands use gestures instead
  const pose = event.frame.getPose(source.targetRaySpace, renderer.xr.getReferenceSpace());
  if (!pose) return false;
  const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
  _origin.setFromMatrixPosition(m);
  _rayDir.set(0, 0, -1).transformDirection(m);
  return true;
}
function onSelectStart(event) {
  if (!controllerRay(event)) return;
  const t = now();
  if (aimAssist(_origin, _rayDir, 0.3, t)) {
    cast(selected, 'punch', { hand: _origin.clone(), dir: _rayDir.clone(), eye: viewerPos.clone(), fwd: _rayDir.clone(), t });
    return;
  }
  if (selected === 'aero') { senseAero(_origin.clone(), t); return; }
  raycaster.set(_origin, _rayDir);
  raycaster.far = Infinity;
  const hit = raycaster.intersectObjects(colliders(), false)[0];
  firePulse(hit ? hit.point : _origin);
}
function onSqueezeStart(event) {
  if (event.inputSource.hand) return;
  selectElement(ELEMENT_ORDER[(ELEMENT_ORDER.indexOf(selected) + 1) % ELEMENT_ORDER.length]);
}

// ---------- flat screen preview ----------
let previewGesture = 'sense';
let previewHold = null;      // { kind, until, origin, dir }
function selectGesture(g) {
  previewGesture = g;
  if (squeezeBtn) squeezeBtn.style.display = g === 'grip' || g === 'draw' ? '' : 'none';
  for (const el of moveEls) el.classList.toggle('on', el.dataset.g === g);
}
const pointer = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', (ev) => {
  if (renderer.xr.isPresenting) return;
  ensureAudio();
  pointer.set((ev.clientX / window.innerWidth) * 2 - 1, -(ev.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  raycaster.far = Infinity;
  const t = now();
  const eye = raycaster.ray.origin.clone();
  const aim = raycaster.ray.direction.clone();
  const hit = raycaster.intersectObjects(previewGroup.children, false)[0];
  const target = aimAssist(eye, aim, 0.14, t);
  const aimPoint = target ? target.group.position.clone() : hit ? hit.point.clone() : eye.clone().addScaledVector(aim, 4);
  // Where a right hand would be.
  const hand = eye.clone().add(new THREE.Vector3(0.25, -0.3, -0.35).applyQuaternion(camera.quaternion));
  const dir = aimPoint.clone().sub(hand).normalize();
  const fwd = flat(aim);

  if (previewGesture === 'seal') { resonate(selected, t); return; }
  if (previewGesture === 'draw') {                 // press and drag: the pointer is the pinch
    previewAim.copy(aim);
    previewDraw.down = true;
    if (selected === 'aqua' || selected === 'morph') {
      previewDraw.ctl = { root: previewPinch(new THREE.Vector3()), dir: aim.clone(), vel: new THREE.Vector3(), eye: eye.clone(), grip: false, squeeze: false, end: null };
      streamCtl = previewDraw.ctl;
      if (!startStream(streamCtl, t, selected)) { streamCtl = previewDraw.ctl = null; }
    } else drawBegin(selected, previewPinch(new THREE.Vector3()));
    return;
  }
  if (previewGesture === 'charge') { previewAim.copy(aim); previewGrip.chargeFrom = t; return; }
  if (previewGesture === 'grip') {
    previewAim.copy(aim);
    if (!GRABS[selected]) { previewGrip.chargeFrom = t; return; }
    const tgt = findGrabTarget(holdKey(selected), eye, aim, t);
    if (tgt) beginHold(previewGrip, holdKey(selected), tgt, eye, t);
    return;
  }
  if (previewGesture === 'sense') {
    if (TOUCH_SENSE[selected]) { if (hit) { firePulse(hit.point); if (selected === 'flora') rootSense(hit.point, t); } }
    else if (selected === 'aero') senseAero(hand, t);
    else if (selected === 'aqua') { previewHold = { kind: 'aqua', until: t + 2.2, origin: hand, dir }; if (hit) addSource(hit.point, hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : UP, t); }
    else previewHold = { kind: PALM_SENSE[selected] ? 'lumen' : 'pyro', until: t + 2.2, origin: eye };
    if (selected !== 'aero') { hudNote = ELEMENTS[selected].sense.toLowerCase(); drawHud(); }
    return;
  }
  const c = { hand, dir, eye, fwd, t, power: ev.shiftKey ? 1.6 : 1, st: previewHand };
  if (previewGesture === 'lift' || previewGesture === 'sweep') c.dir = aimPoint.clone().sub(eye).normalize();
  if (previewGesture === 'slam') {
    c.ground = eye.clone().addScaledVector(fwd, 1.1).setY(0);
    c.normal = UP.clone();
    c.dir = aimPoint.clone().sub(eye).normalize();
  }
  cast(selected, previewGesture, c);
});
// Preview grip: press and drag to hold, release to throw. C (or the Squeeze button) is the other fist.
const previewGrip = { hold: null, chargeFrom: -1, squeeze: false, prevSqueeze: false };
const previewAim = new THREE.Vector3(0, 0, -1);
const previewDraw = { down: false, ctl: null };
const previewHand = { valid: true, palm: new THREE.Vector3(), across: new THREE.Vector3(1, 0, 0) };
// Where the pinch is in the preview: on the surface under the pointer for fire and stone, out in the air for wind and water.
function previewPinch(out) {
  if (selected === 'aqua' || selected === 'morph') return out.copy(camera.position).addScaledVector(previewAim, 0.9);
  if (selected === 'aero') return out.copy(camera.position).addScaledVector(previewAim, 2.2);
  const far = collide(camera.position, _cp.copy(camera.position).addScaledVector(previewAim, 8));
  return far ? out.copy(far.point).addScaledVector(far.normal, 0.2) : out.copy(camera.position).addScaledVector(previewAim, 3);
}
const squeezeBtn = document.getElementById('squeeze');
renderer.domElement.addEventListener('pointermove', (ev) => {
  if (renderer.xr.isPresenting) return;
  pointer.set((ev.clientX / window.innerWidth) * 2 - 1, -(ev.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  previewAim.copy(raycaster.ray.direction);
});
const releasePreview = () => {
  if (renderer.xr.isPresenting) return;
  if (previewDraw.down) {
    previewDraw.down = false;
    if (previewDraw.ctl) { previewDraw.ctl = null; streamCtl = null; stream.seenT = -9; }
    else drawEnd(now());
  }
  if (previewGrip.hold) endHold(previewGrip);
  if (previewGrip.chargeFrom >= 0) {
    const t = now(), charge = t - previewGrip.chargeFrom;
    previewGrip.chargeFrom = -1;
    if (charge > 0.3) {
      const hand = camera.position.clone().add(new THREE.Vector3(0.25, -0.3, -0.35).applyQuaternion(camera.quaternion));
      const tgt = camera.position.clone().addScaledVector(previewAim, 4);
      throwCharged(selected, hand, tgt.sub(hand).normalize(), camera.position.clone(), flat(previewAim), charge, t);
    }
  }
};
renderer.domElement.addEventListener('pointerup', releasePreview);
renderer.domElement.addEventListener('pointercancel', releasePreview);
window.addEventListener('keydown', (ev) => { if (ev.key.toLowerCase() === 'c') previewGrip.squeeze = true; if (ev.key.toLowerCase() === 'g') guard.force = true; });
window.addEventListener('keyup', (ev) => { if (ev.key.toLowerCase() === 'g') { guard.force = false; guard.on = false; } });
window.addEventListener('keyup', (ev) => { if (ev.key.toLowerCase() === 'c') previewGrip.squeeze = false; });
if (squeezeBtn) {
  squeezeBtn.addEventListener('pointerdown', () => { previewGrip.squeeze = true; });
  for (const name of ['pointerup', 'pointerleave', 'pointercancel']) squeezeBtn.addEventListener(name, () => { previewGrip.squeeze = false; });
}
const optionEls = Array.from(document.querySelectorAll('[data-opt]'));
for (const el of optionEls) el.addEventListener('click', () => { ensureAudio(); flipSwitch(el.dataset.opt === 'calm' ? 0 : 2); });
for (const el of chipEls) el.addEventListener('click', () => { ensureAudio(); selectElement(el.dataset.el); });
for (const el of moveEls) el.addEventListener('click', () => { ensureAudio(); selectGesture(el.dataset.g); });
window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Tab') { ev.preventDefault(); selectElement(prevSelected, true); return; }
  const i = '1234567890-'.indexOf(ev.key);
  if (i >= 0) selectElement(ELEMENT_ORDER[i]);
  const g = 'qwertyuiop['.indexOf(ev.key.toLowerCase());
  if (g >= 0) selectGesture(GESTURES[g]);
});

// ---------- session ----------
let xrSupported = false;
let sessionStart = 0;
let askedForRoom = false;
let placed = false;

async function enterXR() {
  ensureAudio();
  enterBtn.disabled = true;
  try {
    const session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['hand-tracking', 'plane-detection', 'mesh-detection', 'anchors', 'depth-sensing'],
      // The headset's own depth camera: with it, your hands, your body and anything else real hide what is behind them.
      depthSensing: { usagePreference: ['gpu-optimized'], dataFormatPreference: ['unsigned-short', 'float32', 'luminance-alpha'] },
    });
    renderer.xr.setReferenceSpaceType('local-floor');
    await renderer.xr.setSession(session);
    session.addEventListener('selectstart', onSelectStart);
    session.addEventListener('squeezestart', onSqueezeStart);
    session.addEventListener('end', onSessionEnd);
    scene.background = null;
    previewGroup.visible = false;
    pulseUniforms.uBase.value = 0;
    uiEl.style.display = 'none';
    hud.visible = true;
    sawHands = false; askedForRoom = false; placed = false; previewHold = null;
    handState.left = newHand(); handState.right = newHand();
    hudNote = 'show your hands';
    sessionStart = performance.now() / 1000;
    for (const v of pulseUniforms.uPulses.value) v.w = -999;
    drawHud();
  } catch (err) {
    statusEl.textContent = `Could not start mixed reality: ${err.message}`;
    enterBtn.disabled = false;
  }
}

function onSessionEnd() {
  clearRoom();
  fallbackFloor.visible = false;
  menuGroup.visible = false;
  scene.background = PREVIEW_BG;
  previewGroup.visible = true;
  pulseUniforms.uBase.value = 0.1;
  uiEl.style.display = '';
  hud.visible = false;
  readout.visible = false;
  enterBtn.disabled = false;
  scatterEchoes();
}

if (navigator.xr && navigator.xr.isSessionSupported) {
  navigator.xr.isSessionSupported('immersive-ar').then((ok) => {
    xrSupported = ok;
    if (ok) {
      enterBtn.disabled = false;
      statusEl.textContent = 'Headset ready.';
      hintEl.textContent = 'In the headset: turn an open palm toward your face and poke an orb to pick a discipline. Sense first (Terra: palm on a surface. Aero: clap. Aqua: hold a raised palm out. Pyro: hold a raised fist), then punch, shove, lift, sweep, jab with a pointed finger, or slam a fist on a surface. Both hands together cast a twin. To hold something, reach an open hand at it and close your fist; open to let go. Creatures shoot back: block with a Rampart, blow shards back with Gust, or catch them. Under the palm menu orbs: CALM stops them attacking, READ shows what the tracker sees your hands doing, NEW restarts.';
    } else {
      statusEl.textContent = 'No mixed reality here. Open this page in the Quest browser to play for real.';
    }
  }).catch(() => { statusEl.textContent = 'Preview mode.'; });
} else {
  statusEl.textContent = 'Preview mode. Open this page in the Quest browser to play for real.';
}
enterBtn.addEventListener('click', enterXR);

// ---------- loop ----------
const viewerPos = new THREE.Vector3();
const viewerQuat = new THREE.Quaternion();
let last = 0;
let demoFired = false;

selectElement('terra', true);
selectGesture('sense');
scatterEchoes();

renderer.setAnimationLoop((ms, frame) => {
  const t = ms / 1000;
  const dt = Math.min(t - last, 0.1);
  last = t;
  pulseUniforms.uTime.value = t;

  if (frame && renderer.xr.isPresenting) {
    const refSpace = renderer.xr.getReferenceSpace();
    const viewer = refSpace && frame.getViewerPose(refSpace);
    if (viewer) {
      const p = viewer.transform.position, q = viewer.transform.orientation;
      viewerPos.set(p.x, p.y, p.z);
      viewerQuat.set(q.x, q.y, q.z, q.w);
      syncRoom(frame, refSpace);
      updateHands(frame, refSpace, t, dt, viewerPos);

      const elapsed = t - sessionStart;
      // No scanned room after a few seconds: ask the headset to run room setup once.
      if (!askedForRoom && elapsed > 5 && planes.size === 0 && meshes.size === 0) {
        askedForRoom = true;
        if (typeof frame.session.initiateRoomCapture === 'function') {
          frame.session.initiateRoomCapture().catch(() => {});
        }
      }
      // Hide the echoes once we know the room's size (or after a short wait).
      if (!placed && (planes.size >= 3 || elapsed > 6)) { placed = true; scatterEchoes(); }
    }
  } else {
    // Gentle camera sway so the preview reads as a 3D room.
    camera.position.x = 0.4 + Math.sin(t * 0.25) * 0.5;
    camera.lookAt(0, 0.9, 0);
    viewerPos.copy(camera.position);
    if (!demoFired && t > 1.2) { demoFired = true; firePulse(new THREE.Vector3(-0.9, 0.74, -0.6)); }
    previewHand.palm.copy(camera.position).add(_off.set(0.25, -0.2, -0.5).applyQuaternion(camera.quaternion)).addScaledVector(previewAim, 0.25);
    previewHand.across.set(-previewAim.x * 0.6, -1, -previewAim.z * 0.6).normalize();
    if (previewDraw.down) {
      if (previewDraw.ctl) {
        const c = previewDraw.ctl;
        const was = c.root.clone();
        previewPinch(c.root);
        c.vel.copy(c.root).sub(was).divideScalar(Math.max(dt, 1e-3));
        c.dir.copy(previewAim); c.eye.copy(camera.position);
        c.grip = previewGrip.squeeze;
        streamCtl = c;
      } else drawAdd(previewPinch(_cp));
    }
    if (previewGesture === 'grip' || previewGesture === 'charge') {
      const hand = camera.position.clone().add(new THREE.Vector3(0.25, -0.3, -0.35).applyQuaternion(camera.quaternion));
      reticles[1].visible = false; hideOrbs(1);
      if (previewGrip.hold) {
        reticles[0].visible = false;
        updateHold(previewGrip, camera.position, previewAim, 1, { hand, squeeze: previewGrip.squeeze, squeezeEdge: previewGrip.squeeze && !previewGrip.prevSqueeze }, t, dt);
      } else if (GRABS[selected] && previewGesture === 'grip') showReticle(0, findGrabTarget(holdKey(selected), camera.position, previewAim, t), holdKey(selected), camera.position);
      else reticles[0].visible = false;
      showCharge(0, hand, previewGrip.chargeFrom >= 0 ? t - previewGrip.chargeFrom : 0, selected);
      previewGrip.prevSqueeze = previewGrip.squeeze;
    } else { reticles[0].visible = false; hideOrbs(0); }
    if (previewHold) {
      if (t > previewHold.until) previewHold = null;
      else if (previewHold.kind === 'aqua') held.aqua = { origin: camera.position, dir: previewHold.dir };
      else if (previewHold.kind === 'lumen') held.lumen = { origin: camera.position };
      else held.pyro = { centre: previewHold.origin };
    }
  }

  if (!renderer.xr.isPresenting) {
    waterAnchorOn = selected === 'aqua';
    waterAnchor.copy(camera.position).add(_off.set(0.3, -0.18, -0.45).applyQuaternion(camera.quaternion));
  }
  dressRoom();
  {                                                 // live depth, when the headset gives it
    const live = renderer.xr.isPresenting && renderer.xr.hasDepthSensing();
    const dm = live ? renderer.xr.getDepthSensingMesh() : null;
    if (dm) dm.visible = occlusion;
    pulseUniforms.uBias.value = live && occlusion ? 0.04 : 0;
    if (live && !depthSeen) { depthSeen = true; hudNote = 'live depth on: hands hide things'; drawHud(); }
  }
  updateGuard(t, dt);
  updateBlades(t, dt);
  updateStorm(t);
  updateVoids(t);
  rain(t);
  updateStream(t, dt);
  updateCurrents(t, dt, viewerPos);
  if (waterBoost && selected === 'aqua') { waterAnchorOn = true; waterAnchor.copy(waterBoost).add(_off.set(0, 0.1, 0)); }
  updateWater(t, dt, waterAnchorOn ? waterAnchor : null, !!waterBoost && selected === 'aqua');
  waterBoost = null;
  updateHeldSenses(t, dt);
  updateObjects(t, dt);
  updateEchoes(t, dt, viewerPos);
  tuneDetail(t, dt);
  updateEffects(t, dt);
  updateLights(t);
  const layer = frame && renderer.xr.isPresenting ? frame.session.renderState.baseLayer : null;
  particles.material.uniforms.uHalfH.value = layer ? (layer.framebufferHeight || 1800) / 2 : renderer.domElement.height / 2;
  particles.update(dt);
  smoke.material.uniforms.uHalfH.value = particles.material.uniforms.uHalfH.value;
  smoke.update(dt);
  renderer.render(scene, camera);
});

// Small hook for automated checks.
window.__tremor = {
  THREE, firePulse, echoes, pulseUniforms, MOVES, ELEMENTS, cast, classifyGesture, scatterEchoes, effects,
  collide, lineOfSight, senseAero, selectElement, held, reveal, particles, hit, isTwin, tideUniforms, chiGhosts,
  get draftOn() { return now() < draftUntil; },
  mirrorLine, rift, implode, ELEMENT_ORDER, ringFlourish, coneFlourish, SEALS, resonate, dressEcho, set sealAt(v) { sealAt = v; }, thralls, raiseThrall, familiars, summonFamiliar, get prevSelected() { return prevSelected; }, turrets, plantTurret, blades, summonBlade, voids, shoveBarrier, previewHand, guard, snare, constellation, quench, fireLines, KINDS, get armourUntil() { return armourUntil; }, get playerHP() { return playerHP; }, set playerHP(v) { playerHP = v; }, get occlusion() { return occlusion; }, SFX, FORM_SFX, play, ensureAudio, get audio() { return getAudio(); },
  stream, startStream, endStream, plantWall, currents, makeCurrent, bendCurrents, fireLine, raiseRidge, drawBegin, drawAdd, drawEnd,
  get streamCtl() { return streamCtl; }, set streamCtl(v) { streamCtl = v; if (!v) stream.seenT = -9; },
  objects, spawnObject, scatterObjects, findGrabTarget, beginHold, updateHold, endHold, explode, throwFireball, throwCharged, kick,
  barriers, isOpen, nearestRoomSurface, roomBounds, clearBarriers, AI, CREATURE, playerHurt, spit, sources, addSource, water,
  cycleForm, get form() { return terraForm; }, setForm(f) { setForm('terra', f); }, forms, setFormOf: setForm, formOf, lights, KINDS, options, flipSwitch,
  get wave() { return wave; }, set wave(n) { wave = n; }, get active() { return activeCount; }, get detail() { return detail; },
  spawnCloud, smoke, ignite,
  get hp() { return playerHP; }, attackSoon() { nextAttackAt = 0; },
  setHold(h) { previewHold = h; },
  get down() { return downCount; },
  get selected() { return selected; },
};

// Tremor Sense: a mixed reality prototype for Resonance.
//
// Pick a discipline (look at an open palm, poke an orb with the other index finger),
// then use the same six hand verbs. Each discipline answers them differently.
//
//            SENSE                  PUNCH        SHOVE        LIFT     SWEEP      SLAM (fist on surface)  POINT (index finger jab)
//   TERRA    palm on a surface      Stone Shot   Boulder      Spire    Rampart    Fault Line              Ferro Disc
//   PYRO     raised fist, held      Ember        Flame Burst  Pyre     Fire Arc   Eruption                Volt
//   AQUA     raised palm, held      Jet          Breaker      Geyser   Riptide    Surge                   Frost Needle
//   AERO     clap                   Air Bullet   Gust         Updraft  Air Blade  Shockwave               Void
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

// ---------- tuning ----------
const PULSE_SPEED = 2.4;    // metres per second
const PULSE_LIFE = 4.5;     // seconds
const MAX_PULSES = 4;
const ECHO_COUNT = 6;
const REVEAL_TIME = 6;      // seconds an echo stays visible after a Terra or Aero sense
const HOLD_REVEAL = 1.5;    // seconds an echo lingers after leaving an Aqua or Pyro sense
const TOUCH_ON = 0.045;     // palm closer than this to a surface counts as a touch
const SLAM_ON = 0.055;      // knuckles closer than this to a surface counts as a slam
const TOUCH_OFF = 0.09;     // hand must lift past this before it can touch again
const CURL_OPEN = 1.55;     // fingertip reach / knuckle reach above this = open hand
const CURL_FIST = 1.2;      // below this = fist
const PUNCH_SPEED = 1.3;    // metres per second, fist moving forward
const PUSH_SPEED = 1.1;     // open palm moving the way it faces
const LIFT_SPEED = 0.9;     // open palm facing up, moving up
const SWEEP_SPEED = 1.4;    // open hand moving edge-on, sideways
const REARM_SPEED = 0.5;    // hand must slow below this between attacks
const CAST_COOLDOWN = 0.45; // seconds
const HOLD_STILL = 0.25;    // a held sense needs the hand slower than this (m/s)
const HOLD_TIME = 0.4;      // ...for this long (s)
const POINT_SPEED = 1.0;    // index finger jab, moving the way it points
const CLAP_ON = 0.09;       // palms closer than this = clap
const CLAP_OFF = 0.18;
const AQUA_SENSE = { range: 8, angle: 0.3 };   // a narrow beam you sweep around, passes through walls
const PYRO_SENSE = { radius: 2.8 };            // everything close to you, in every direction
const AERO_SENSE = { range: 7, speed: 6 };     // a burst from the clap, line of sight only

const ACID = new THREE.Color(0xb6ff3c);
const ELEMENTS = {
  pyro:  { label: 'PYRO',  sense: 'Chi Sense',    color: new THREE.Color(0xff6a1a) },
  aqua:  { label: 'AQUA',  sense: 'Tide Sense',   color: new THREE.Color(0x2bb8ff) },
  terra: { label: 'TERRA', sense: 'Tremor Sense', color: new THREE.Color(0xe0b64a) },
  aero:  { label: 'AERO',  sense: 'Draft Sense',  color: new THREE.Color(0xdff9ff) },
};
const ELEMENT_ORDER = ['pyro', 'aqua', 'terra', 'aero'];
const GESTURES = ['sense', 'punch', 'shove', 'lift', 'sweep', 'slam', 'point'];

// What each verb does per discipline. kind picks the behaviour, the rest are its numbers.
const MOVES = {
  pyro: {
    punch: { name: 'Ember',       kind: 'bolt',   speed: 9,  radius: 0.22, shape: 'orb' },
    shove: { name: 'Flame Burst', kind: 'cone',   range: 2.6, angle: 0.75 },
    lift:  { name: 'Pyre',        kind: 'column', launch: true, radius: 0.35, top: 0.16, bottom: 0.2, sides: 12, flicker: true },
    sweep: { name: 'Fire Arc',    kind: 'bolt',   speed: 6,  radius: 0.5, shape: 'crescent', size: 0.5, pierce: true, life: 1.2 },
    slam:  { name: 'Eruption',    kind: 'ring',   maxR: 2.2, height: 1.2 },
    point: { name: 'Volt',        kind: 'beam',   range: 8, chain: 2, volt: true },
  },
  aqua: {
    punch: { name: 'Jet',         kind: 'bolt',   speed: 12, radius: 0.18, shape: 'jet', pierce: true },
    shove: { name: 'Breaker',     kind: 'wall',   ram: 3.5, width: 1.8, height: 1.1, passThrough: true },
    lift:  { name: 'Geyser',      kind: 'column', launch: true, radius: 0.32, top: 0.1, bottom: 0.1, sides: 16 },
    sweep: { name: 'Riptide',     kind: 'bolt',   speed: 5,  radius: 0.22, shape: 'crescent', size: 0.16, pierce: true, homing: 7, life: 2.6 },
    slam:  { name: 'Surge',       kind: 'ring',   maxR: 2.6, height: 0.9, launch: true },
    point: { name: 'Frost Needle', kind: 'bolt',  speed: 14, radius: 0.2, shape: 'shard', freeze: true },
  },
  terra: {
    punch: { name: 'Stone Shot',  kind: 'bolt',   speed: 8,  radius: 0.28, shape: 'rock', gravity: 2.5 },
    shove: { name: 'Boulder',     kind: 'bolt',   speed: 3.5, radius: 0.5, shape: 'rock', size: 0.28, roll: true, pierce: true, life: 3 },
    lift:  { name: 'Spire',       kind: 'column', launch: true, radius: 0.3, top: 0.03, bottom: 0.17, sides: 6, pulse: true },
    sweep: { name: 'Rampart',     kind: 'wall',   ram: 2.5, width: 1.6, height: 1.4 },
    slam:  { name: 'Fault Line',  kind: 'fault',  length: 4.5 },
    point: { name: 'Ferro Disc',  kind: 'bolt',   speed: 10, radius: 0.25, shape: 'disc', bounces: 3, pierce: true, life: 2.5 },
  },
  aero: {
    punch: { name: 'Air Bullet',  kind: 'bolt',   speed: 16, radius: 0.2, shape: 'orb', size: 0.03, bounces: 2 },
    shove: { name: 'Gust',        kind: 'cone',   range: 4.5, angle: 0.5 },
    lift:  { name: 'Updraft',     kind: 'column', launch: true, radius: 0.5, top: 0.3, bottom: 0.22, sides: 20 },
    sweep: { name: 'Air Blade',   kind: 'bolt',   speed: 11, radius: 0.4, shape: 'crescent', size: 0.4, pierce: true },
    slam:  { name: 'Shockwave',   kind: 'ring',   maxR: 3, height: 2 },
    point: { name: 'Void',        kind: 'void',   radius: 1.3, range: 6 },
  },
};

const statusEl = document.getElementById('status');
const hintEl = document.getElementById('hint');
const enterBtn = document.getElementById('enter');
const uiEl = document.getElementById('ui');
const chipEls = Array.from(document.querySelectorAll('[data-el]'));
const moveEls = Array.from(document.querySelectorAll('[data-g]'));

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
    varying vec3 vWorld;
    varying vec3 vNormalW;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      vNormalW = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */`
    uniform float uTime;
    uniform float uBase;
    uniform vec3 uColor;
    uniform vec4 uPulses[${MAX_PULSES}];
    varying vec3 vWorld;
    varying vec3 vNormalW;
    float gridLines(vec3 p, vec3 n) {
      vec3 g = abs(fract(p * 4.0) - 0.5);
      vec3 l = 1.0 - smoothstep(0.0, 0.035, g);
      vec3 w = 1.0 - abs(n);            // ignore the axis the surface faces
      return max(max(l.x * w.x, l.y * w.y), l.z * w.z);
    }
    void main() {
      float grid = gridLines(vWorld, normalize(vNormalW));
      float a = uBase * (0.25 + grid);
      for (int i = 0; i < ${MAX_PULSES}; i++) {
        float age = uTime - uPulses[i].w;
        if (age > 0.0 && age < ${PULSE_LIFE.toFixed(1)}) {
          float r = age * ${PULSE_SPEED.toFixed(1)};
          float d = distance(vWorld, uPulses[i].xyz);
          float fade = 1.0 - age / ${PULSE_LIFE.toFixed(1)};
          float ring = exp(-pow((d - r) / 0.10, 2.0));
          float echo = exp(-pow((d - r * 0.72) / 0.07, 2.0)) * 0.45;
          float wake = smoothstep(r - 1.6, r, d) * step(d, r) * grid * 0.7;
          a += (ring + echo + wake) * fade;
        }
      }
      gl_FragColor = vec4(uColor * a, a);
    }`,
});

let pulseIndex = 0;
function firePulse(point) {
  const v = pulseUniforms.uPulses.value[pulseIndex];
  v.set(point.x, point.y, point.z, now());
  pulseIndex = (pulseIndex + 1) % MAX_PULSES;
  thump();
}

// ---------- sound ----------
let audio = null;
function ensureAudio() {
  if (!audio) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audio = new Ctx();
  }
  if (audio && audio.state === 'suspended') audio.resume();
}
function tone(freqFrom, freqTo, dur, gain, type = 'sine', delay = 0) {
  if (!audio) return;
  const t0 = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqFrom, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(freqTo, 1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(audio.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}
const thump = () => { tone(90, 32, 0.7, 0.6); tone(180, 60, 0.25, 0.2, 'triangle'); };
const blip = () => tone(1250, 1700, 0.12, 0.08, 'triangle');
const tick = () => tone(900, 1300, 0.08, 0.1, 'square');
const thud = () => tone(160, 70, 0.12, 0.18, 'triangle');
const hitSound = () => { tone(660, 660, 0.18, 0.12, 'triangle'); tone(990, 990, 0.25, 0.12, 'triangle', 0.09); };
const castSound = {
  pyro: () => tone(520, 110, 0.32, 0.22, 'sawtooth'),
  aqua: () => { tone(300, 720, 0.4, 0.14, 'sine'); tone(450, 1080, 0.4, 0.07, 'sine', 0.05); },
  terra: () => tone(140, 45, 0.5, 0.4, 'square'),
  aero: () => tone(1800, 240, 0.45, 0.07, 'sawtooth'),
};

// ---------- room surfaces ----------
const roomGroup = new THREE.Group();     // real surfaces from the headset
const previewGroup = new THREE.Group();  // stand-in room for a flat screen
scene.add(roomGroup, previewGroup);

// Fallback floor, used in the headset until real planes show up.
const fallbackFloor = new THREE.Mesh(new THREE.CircleGeometry(4, 48).rotateX(-Math.PI / 2), roomMat);
fallbackFloor.visible = false;
scene.add(fallbackFloor);

function buildPreviewRoom() {
  const add = (geo, x, y, z) => {
    const m = new THREE.Mesh(geo, roomMat);
    m.position.set(x, y, z);
    previewGroup.add(m);
    m.updateMatrixWorld(true);
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
function colliders() {
  colliderList.length = 0;
  if (renderer.xr.isPresenting) {
    if (planes.size) { for (const e of planes.values()) if (e.mesh.visible) colliderList.push(e.mesh); }
    else for (const e of meshes.values()) if (e.mesh.visible) colliderList.push(e.mesh);
    if (fallbackFloor.visible) colliderList.push(fallbackFloor);
  } else {
    for (const m of previewGroup.children) colliderList.push(m);
  }
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
  return { point: hit.point.clone(), normal };
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

const ICE = new THREE.Color(0xbfeeff);
function makeEcho() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), glowMat(ACID));
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.085, 0), glowMat(ACID));
  shell.material.wireframe = true;
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.11, 0.118, 40), glowMat(ACID));
  const ice = new THREE.Mesh(new THREE.IcosahedronGeometry(0.125, 0), glowMat(ICE, 0.32));
  ice.visible = false;
  g.add(core, shell, halo, ice);
  g.renderOrder = 10;
  g.visible = false;
  echoGroup.add(g);
  return {
    group: g, core, shell, halo, ice, parts: [core, shell, halo],
    home: new THREE.Vector3(), phase: Math.random() * 6.28,
    revealedUntil: -1, level: 0, down: false, downT: -1, push: new THREE.Vector3(),
    hp: 2, restY: 0, vel: new THREE.Vector3(), airborne: false, flashT: -1,
    burnAt: -1, soakedUntil: -1, frozenUntil: -1, baseColor: new THREE.Color(ACID),
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

function scatterEchoes() {
  const box = roomBounds();
  for (const e of echoes) {
    e.home.set(
      THREE.MathUtils.lerp(box.min.x, box.max.x, Math.random()),
      THREE.MathUtils.lerp(box.min.y, box.max.y, Math.random() * Math.random()),  // bias low: under and behind things
      THREE.MathUtils.lerp(box.min.z, box.max.z, Math.random()),
    );
    e.down = false; e.downT = -1; e.revealedUntil = -1; e.level = 0;
    e.hp = 2; e.restY = e.home.y; e.vel.set(0, 0, 0); e.airborne = false; e.flashT = -1;
    e.burnAt = e.soakedUntil = e.frozenUntil = -1;
    e.baseColor.copy(ACID); e.ice.visible = false; e.shell.scale.setScalar(1);
    for (const m of e.parts) m.material.color.copy(ACID);
    e.group.scale.setScalar(1);
    e.group.position.copy(e.home);
    e.group.visible = false;
  }
  downCount = 0;
  drawHud();
}

const isLive = (e, t) => !e.down && e.revealedUntil > t;

// Mark an echo as sensed. The colour tells you which sense found it.
function reveal(e, t, duration, color) {
  if (e.down) return;
  if (e.revealedUntil < t) { blip(); e.baseColor.copy(color); }
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
  downCount++;
  puff(elementKey, e.group.position, 26, 2.4, pushDir && pushDir.lengthSq() ? { dir: pushDir, spread: 1.1 } : {});
  hitSound();
  drawHud();
  if (downCount === ECHO_COUNT) respawnAt = t + 3.5;
}

// Land an attack on an echo. m is the move (or a bare { damage } for knock-on effects).
// Works out damage, the mark the discipline leaves, and any combination with marks already there.
const _hd = new THREE.Vector3(), _hp = new THREE.Vector3();
function hit(e, key, t, dir, m = {}) {
  if (e.down) return;
  _hd.copy(dir || ZERO);
  const pos = _hp.copy(e.group.position);
  const frozen = e.frozenUntil > t, soaked = e.soakedUntil > t;
  let dmg = m.damage ?? (key === 'terra' ? 2 : 1);
  let note = null, shatter = false;

  if (frozen && key === 'terra') { dmg = 9; shatter = true; note = 'shatter'; }
  else if (key === 'aero' && e.airborne) { dmg = 9; note = 'air finish'; }
  else if (m.volt && soaked) { dmg = 9; note = 'conduct'; }

  if (key === 'pyro') {
    if (frozen) { e.frozenUntil = -1; e.soakedUntil = t + 4; note = note || 'thaw'; }
    else if (soaked && !m.volt) { e.soakedUntil = -1; note = 'steam'; puff('aero', pos, 22, 1.4, { up: 1.6, life: 0.7, size: 0.06 }); }
    else if (!m.volt && !m.noBurn) e.burnAt = t + 1.5;
  } else if (key === 'aqua') {
    e.burnAt = -1;                                  // water puts fire out
    if (m.freeze) { e.frozenUntil = t + 6; e.vel.set(0, e.vel.y, 0); }
    else e.soakedUntil = t + 6;
  }
  if (!(e.frozenUntil > t)) {
    if (m.launch) { e.airborne = true; e.vel.y = 2.2; }       // a slow toss: about a metre up, nearly two seconds of hang
    if ((key === 'aero' && m.kind !== 'void') || m.kind === 'wall' || m.roll) {   // shoved along the floor
      const push = key === 'aero' ? 3.5 : 2.5;
      e.vel.x += _hd.x * push; e.vel.z += _hd.z * push;
    }
  }
  e.revealedUntil = Math.max(e.revealedUntil, t + 5);          // once you have hit it, you can keep track of it
  e.hp -= dmg;
  if (note) { hudNote = note; drawHud(); }
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
    if (collide(e.home, _next)) { e.vel.x = e.vel.z = 0; }
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
    moveEcho(e, t, dt);
    const frozen = e.frozenUntil > t, soaked = e.soakedUntil > t, burning = e.burnAt > 0;
    // A marked or airborne echo stays in view until the mark wears off.
    const markEnd = Math.max(e.frozenUntil, e.soakedUntil, e.burnAt, e.airborne ? t + 0.5 : -1);
    if (markEnd > t) e.revealedUntil = Math.max(e.revealedUntil, markEnd);
    const tint = frozen ? ICE : burning ? ELEMENTS.pyro.color : soaked ? ELEMENTS.aqua.color : e.baseColor;
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
    e.shell.material.opacity = o * 0.8;
    e.halo.material.opacity = e.hp < 2 ? 0 : o * 0.5;
    e.ice.material.opacity = 0.32 * o;
    e.group.position.copy(e.home);
    if (!frozen) {
      e.group.position.y += Math.sin(t * 1.6 + e.phase) * 0.03;
      e.shell.rotation.set(t * 0.7 + e.phase, t * 0.9, 0);
    }
    e.halo.lookAt(viewerPos);
  }
  if (respawnAt > 0 && t > respawnAt) { respawnAt = -1; scatterEchoes(); }
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
  pyro: { a: 0xfff3b0, b: 0xff4a0a, scale: [9, 7, 9],     speed: 2.6, cut: 0.36, soft: 0.22 },
  aqua: { a: 0xe6fbff, b: 0x1487ff, scale: [5, 4, 5],     speed: 1.6, cut: 0.2,  soft: 0.5 },
  aero: { a: 0xffffff, b: 0xbfeeff, scale: [16, 1.6, 16], speed: 4.5, cut: 0.56, soft: 0.16 },
};
// flow is the direction the pattern travels, in the mesh's own space. fadeY (0 to 1) thins it out toward the top of the mesh.
function energyMat(key, o = {}) {
  const P = ENERGY[key];
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: pulseUniforms.uTime,
      uA: { value: new THREE.Color(P.a) }, uB: { value: new THREE.Color(P.b) },
      uScale: { value: new THREE.Vector3(...(o.scale || P.scale)) },
      uFlow: { value: new THREE.Vector3(...(o.flow || [0, 1, 0])).multiplyScalar(P.speed) },
      uCut: { value: o.cut ?? P.cut }, uSoft: { value: P.soft },
      uFade: { value: o.fadeY === true ? 1 : (o.fadeY || 0) }, uOpacity: { value: 1 },
    },
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec3 vObj; varying vec2 vUv;
      void main() { vObj = position; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uCut, uSoft, uFade, uOpacity;
      uniform vec3 uA, uB, uScale, uFlow;
      varying vec3 vObj; varying vec2 vUv;
      ${NOISE_GLSL}
      void main() {
        float n = fbm(vObj * uScale - uFlow * uTime);
        float lift = uFade * (0.3 - vUv.y * 0.75);
        float body = smoothstep(uCut, uCut + uSoft, n + lift);
        float core = smoothstep(uCut + uSoft * 0.6, uCut + uSoft * 1.8, n + lift);
        float a = body * uOpacity;
        gl_FragColor = vec4(mix(uB, uA, core) * a, a);
      }`,
  });
  mat.opacity = o.opacity ?? 1;
  mat.onBeforeRender = () => { mat.uniforms.uOpacity.value = mat.opacity; };   // lets effects fade it like any other material
  return mat;
}

// Solid rock: opaque, flat shaded from the surface itself, with faint amber seams.
function stoneMat(metal = false) {
  return new THREE.ShaderMaterial({
    uniforms: { uMetal: { value: metal ? 1 : 0 } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec3 vW; varying vec3 vObj;
      void main() { vObj = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      varying vec3 vW; varying vec3 vObj;
      uniform float uMetal;
      ${NOISE_GLSL}
      void main() {
        vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
        if (dot(n, cameraPosition - vW) < 0.0) n = -n;
        float light = 0.32 + 0.68 * max(dot(n, normalize(vec3(0.35, 1.0, 0.45))), 0.0);
        float grain = fbm(vObj * 7.0);
        vec3 rock = mix(vec3(0.20, 0.17, 0.13), vec3(0.56, 0.48, 0.36), grain) * light;
        float seam = 1.0 - smoothstep(0.0, 0.035, abs(vnoise(vObj * 5.0) - 0.5));
        vec3 L = normalize(vec3(0.35, 1.0, 0.45)), V = normalize(cameraPosition - vW);
        float spec = pow(max(dot(reflect(-L, n), V), 0.0), 18.0) + 0.35 * pow(1.0 - max(dot(n, V), 0.0), 3.0);
        vec3 steel = vec3(0.42, 0.45, 0.5) * (0.35 + 0.65 * light) * (0.85 + 0.3 * grain) + vec3(0.95, 0.97, 1.0) * spec;
        gl_FragColor = vec4(mix(rock + vec3(0.88, 0.62, 0.16) * seam * 0.55, steel, uMetal), 1.0);
      }`,
  });
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
const P_MAX = 2000;
const particles = (() => {
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
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
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
        gl_FragColor = vec4(vCol * a, a);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 18;
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
        alpha[i] = Math.min(f * 2.2, 1);          // hold, then fade out over the last half
        liveCount++;
      }
      for (const name of ['position', 'color', 'aSize', 'aAlpha']) geo.attributes[name].needsUpdate = true;
    },
  };
})();

const PCOL = {
  pyro: [0xffe08a, 0xff8a1f, 0xff3b0a].map(c => new THREE.Color(c)),
  aqua: [0xe6fbff, 0x63ccff, 0x1487ff].map(c => new THREE.Color(c)),
  terra: [0xcdb78c, 0x8a7655, 0xe0b64a].map(c => new THREE.Color(c)),
  aero: [0xffffff, 0xdff9ff, 0xbfeeff].map(c => new THREE.Color(c)),
};
// How each discipline's loose matter behaves once it is in the air.
const PSTYLE = {
  pyro:  { size: 0.035, life: 0.5,  grav: -1.6, drag: 1.5 },   // embers rise
  aqua:  { size: 0.028, life: 0.6,  grav: 6,    drag: 0.4 },   // droplets fall
  terra: { size: 0.04,  life: 0.7,  grav: 7,    drag: 0.8 },   // chips drop fast
  aero:  { size: 0.018, life: 0.28, grav: 0,    drag: 3 },     // streaks vanish
};
const _pv = new THREE.Vector3(), _pp = new THREE.Vector3();
// n particles from a point. dir + spread aims them; without dir they go every way.
function puff(key, point, n, speed, o = {}) {
  const S = PSTYLE[key], C = PCOL[key];
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
      const leaf = new THREE.Mesh(blade(), energyMat(key, matOpts));
      leaf.rotation.z = tilt;
      g.add(leaf);
    }
    const edge = new THREE.Mesh(new THREE.TorusGeometry(s, Math.max(s * 0.035, 0.007), 6, 40, Math.PI - 0.7), glowMat(color, 0.9));
    edge.geometry.rotateZ(0.35).rotateX(Math.PI / 2).translate(0, 0, -s * 0.55);   // the bright leading rim
    g.add(edge);
  } else if (m.shape === 'rock') {
    const s = size || 0.075;
    g.add(new THREE.Mesh(craggy(new THREE.IcosahedronGeometry(s, 1), s * 0.45), stoneMat()));
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
  } else if (m.shape === 'jet') {
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.075, 1.3, 16, 8, true), energyMat(key, { flow: [0, 0, -2.5], scale: [12, 12, 3], cut: 0.1 }));
    jet.geometry.rotateX(Math.PI / 2).translate(0, 0, -0.6);
    g.add(jet, new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), glowMat(new THREE.Color(ENERGY.aqua.a), 0.9)));
  } else if (key === 'aero') {
    // Air is mostly seen by what it drags along: a hard little core and a thin wake.
    const s = size || 0.03;
    g.add(new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), glowMat(color, 0.9)));
    const wake = new THREE.Mesh(new THREE.ConeGeometry(s * 2.2, 0.7, 14, 4, true), energyMat(key, { flow: [0, 0, -3], scale: [30, 30, 3], opacity: 0.7 }));
    wake.geometry.rotateX(-Math.PI / 2).translate(0, 0, -0.38);
    g.add(wake);
  } else {
    // Fire: a white-hot core inside a ragged shell of flame, with a tail that tears off behind it.
    const s = size || 0.055;
    g.add(new THREE.Mesh(new THREE.SphereGeometry(s * 0.55, 12, 10), glowMat(new THREE.Color(ENERGY.pyro.a), 1)));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(s * 1.5, 18, 14), energyMat(key, { flow: [0, 0, -1.2], scale: [16, 16, 12] })));
    const tail = new THREE.Mesh(new THREE.ConeGeometry(s * 1.4, s * 9, 14, 6, true), energyMat(key, { flow: [0, 0, -2.2], scale: [14, 14, 6], cut: 0.44 }));
    tail.geometry.rotateX(-Math.PI / 2).translate(0, 0, -s * 5);   // narrows behind +Z travel
    g.add(tail);
  }
  return g;
}
// What a moving bolt leaves behind it each frame.
const _trail = new THREE.Vector3(), _side = new THREE.Vector3(), _back = new THREE.Vector3();
function boltTrail(key, m, pos, dirN, dt) {
  const wide = m.shape === 'crescent' ? (m.size || 0.16) : m.roll ? 0.18 : 0.02;
  const rate = m.shape === 'disc' ? 0 : m.shape === 'shard' ? 40 : { pyro: 110, aqua: 80, terra: m.roll ? 60 : 30, aero: 70 }[key];
  let n = rate * dt; n = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
  _side.set(-dirN.z, 0, dirN.x);
  for (let i = 0; i < n; i++) {
    _trail.copy(pos).addScaledVector(_side, (Math.random() * 2 - 1) * wide);
    if (m.roll) _trail.y = 0.03;
    puff(key, _trail, 1, key === 'aero' ? 1.2 : 0.5, { dir: _back.copy(dirN).negate(), spread: 0.8, jitter: 0.03 });
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
  const mesh = boltMesh(key, m, color);
  mesh.scale.setScalar(m.power || 1);
  mesh.position.copy(pos);
  puff(key, pos, 10, 1.6, { dir: vel.clone().normalize(), spread: 0.7 });      // muzzle
  const prev = pos.clone();
  const dirN = new THREE.Vector3();
  const look = new THREE.Vector3();
  const struck = new Set();
  let bounces = m.bounces || 0;
  const born = c.t, life = m.life || 1.8;
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

    const wall = collide(prev, mesh.position);
    let end = null;                               // where this step's travel stops, if it hits the room
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
        if (!m.pierce) return false;
      }
    }
    if (end) { impact(wall.point, wall.normal, key, t, m.shape === 'rock' ? 0.4 : 0.25); return false; }

    dirN.copy(vel).normalize();
    mesh.lookAt(look.copy(mesh.position).add(dirN));
    if (m.shape === 'rock') mesh.rotateX(m.roll ? (t - born) * m.speed / (m.size || 0.2) : t * 9);   // a boulder turns as far as it travels
    if (m.shape === 'disc') mesh.children[0].rotation.y = t * 40;
    boltTrail(key, m, mesh.position, dirN, dt);
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
  for (const e of echoes) {
    if (!isLive(e, c.t)) continue;
    _to.copy(e.group.position).sub(origin);
    if (_to.length() < m.range && _to.angleTo(d) < m.angle && lineOfSight(origin, e.group.position)) hit(e, key, c.t, d, m);
  }
  // The blast itself: a cone of the element that rushes out and thins, plus loose matter thrown with it.
  const spread = Math.tan(m.angle);
  const body = new THREE.Mesh(
    new THREE.ConeGeometry(spread * m.range, m.range, 32, 10, true).translate(0, -m.range / 2, 0).rotateX(-Math.PI / 2),
    energyMat(key, { flow: [0, 0, key === 'aero' ? 2.2 : 1.6], scale: key === 'aero' ? [3, 3, 14] : [5, 5, 3.5], cut: key === 'aero' ? 0.5 : 0.3 }),
  );
  body.position.copy(origin);
  body.lookAt(origin.clone().add(d));
  puff(key, origin, key === 'aero' ? 70 : 90, m.range / 0.4, { dir: d, spread: spread * 1.1, life: 0.45, drag: 1.2, grav: key === 'pyro' ? -1 : 0 });
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
  const base = new THREE.Vector3();
  let height = 1.0;
  if (target) {
    base.set(target.group.position.x, 0, target.group.position.z);
    height = target.group.position.y + 0.18;
  } else {
    base.copy(c.eye).addScaledVector(flat(d, c.fwd), 1.5).setY(0);
  }
  const column = new THREE.Group();
  let body, core = null;
  if (key === 'terra') {
    // A real spike of rock: wide at the root, sharp at the tip, never the same twice.
    body = new THREE.Mesh(craggy(new THREE.ConeGeometry(m.bottom, 1, 7, 5).translate(0, 0.5, 0), 0.05), stoneMat());
    column.add(body);
    for (let i = 0; i < 3; i++) {                 // shards crowding the base
      const shard = new THREE.Mesh(craggy(new THREE.ConeGeometry(0.07, 0.4 + Math.random() * 0.25, 5, 2).translate(0, 0.2, 0), 0.03), stoneMat());
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
      energyMat(key, { flow: [0, key === 'aero' ? 2.2 : 1.8, 0], fadeY: key === 'aqua' ? 0 : 0.5, cut: key === 'aqua' ? 0.1 : undefined, scale: key === 'aero' ? [5, 1.4, 5] : key === 'aqua' ? [10, 2.2, 10] : [8, 2.6, 8] }),
    );
    column.add(body);
    if (key !== 'aero') {
      core = new THREE.Mesh(new THREE.CylinderGeometry(m.top * 0.3, m.bottom * 0.6, 1, 12, 1, true).translate(0, 0.5, 0), glowMat(new THREE.Color(ENERGY[key].b), 0.22));
      column.add(core);
    }
  }
  const solid = body, wire = core || body;       // faded together below
  column.position.copy(base);
  column.rotation.y = Math.random() * Math.PI;
  const pw = m.power || 1;
  column.scale.set(pw, 0.001, pw);
  if (m.pulse) firePulse(base);                  // Terra's eruption also ripples the room
  puff(key, base, key === 'terra' ? 40 : 24, 2.4, { up: 2.5, jitter: 0.2 });
  const born = c.t;
  const top = new THREE.Vector3();
  let struck = false, spin = Math.random() * 6.28;
  addEffect([column], (t, dt) => {
    const age = t - born;
    const rise = Math.min(age / 0.16, 1);
    const sink = THREE.MathUtils.clamp((age - 0.75) / 0.35, 0, 1);
    column.scale.y = Math.max(height * rise * (1 - sink), 0.001);
    if (m.flicker) { const f = 1 + 0.18 * Math.sin(t * 31); column.scale.x = f * pw; column.scale.z = (2 - f) * pw; }
    solid.material.opacity = 1 - sink;
    if (core) core.material.opacity = 0.22 * (1 - sink);
    // Loose matter while it stands: embers climb off fire, a geyser's crown rains down, wind winds upward.
    const tall = column.scale.y;
    if (sink < 1 && rise >= 1) {
      if (key === 'pyro') { top.copy(base).setY(Math.random() * tall); puff(key, top, 3, 0.7, { up: 1.8, jitter: 0.22 }); }
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
      for (const e of echoes) {
        if (!isLive(e, t)) continue;
        const p = e.group.position;
        if (Math.hypot(p.x - base.x, p.z - base.z) < m.radius && p.y < height + 0.1) hit(e, key, t, UP, m);
      }
    }
    return age < 1.1;
  });
}

// --- ring: spreads across the floor from where the fist landed. ---
function castRing(key, m, c) {
  const color = ELEMENTS[key].color;
  const centre = c.ground.clone();
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
    energyMat(key, { flow: [0, key === 'aqua' ? 0.6 : 1.6, 0], fadeY: true, scale: key === 'aero' ? [3, 9, 3] : [2.2, 5, 2.2], cut: key === 'aqua' ? 0.12 : undefined }),
  );
  rim.position.copy(centre);
  puff(key, centre, 30, 3, { up: 2, jitter: 0.1 });
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
    return k < 1;
  });
}

// --- wall: rises in front of you and rams forward. Stone stops at the room; water rolls through. ---
function castWall(key, m, c) {
  const color = ELEMENTS[key].color;
  const d = flat(c.dir, c.fwd);
  const right = new THREE.Vector3(-d.z, 0, d.x);
  const centre = c.eye.clone().addScaledVector(d, 1.0).setY(0);
  const wall = new THREE.Group();
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
    wall.add(new THREE.Mesh(sheet, energyMat(key, { flow: [0, 1.1, 0.4], scale: [5, 7, 5], cut: 0.05 })));
  } else {
    // A slab heaved out of the floor, rough along the top.
    wall.add(new THREE.Mesh(craggy(new THREE.BoxGeometry(m.width, m.height, 0.22, 9, 6, 2).translate(0, m.height / 2, 0), 0.07), stoneMat()));
  }
  puff(key, centre, 36, 2.2, { up: 2, jitter: m.width * 0.8 });
  const foam = new THREE.Vector3();
  wall.position.copy(centre);
  wall.rotation.y = Math.atan2(d.x, d.z);
  wall.scale.set(1, 0.001, 1);
  const struck = new Set();
  const born = c.t;
  const probeA = new THREE.Vector3(), probeB = new THREE.Vector3();
  let travelled = 0, stoppedAt = -1;
  addEffect([wall], (t, dt) => {
    const age = t - born;
    const rise = Math.min(age / 0.18, 1);
    let step = 0;
    if (rise >= 1 && stoppedAt < 0) {
      step = 4 * dt;
      if (!m.passThrough) {
        probeA.copy(wall.position).setY(0.4);
        probeB.copy(probeA).addScaledVector(d, step + 0.1);
        const blocked = collide(probeA, probeB);
        if (blocked) { step = 0; stoppedAt = t; impact(blocked.point, blocked.normal, key, t, 0.5); }
      }
      wall.position.addScaledVector(d, step);
      travelled += step;
      for (let i = 0; i < 4; i++) {               // dust ground out along the foot, or spray off the lip
        foam.copy(wall.position).addScaledVector(right, (Math.random() - 0.5) * m.width);
        if (m.passThrough) { foam.y = m.height * 0.85; foam.addScaledVector(d, 0.45); }
        puff(key, foam, m.passThrough ? 2 : 1, 1, { up: m.passThrough ? 0.9 : 1.2 });
      }
      if (travelled >= m.ram && stoppedAt < 0) stoppedAt = t;
    }
    if (rise >= 1) {
      for (const e of echoes) {
        if (!isLive(e, t) || struck.has(e)) continue;
        _to.copy(e.group.position).sub(wall.position);
        if (Math.abs(_to.dot(d)) < 0.3 + step && Math.abs(_to.dot(right)) < m.width / 2 && e.group.position.y < m.height + 0.1) {
          struck.add(e);
          hit(e, key, t, d, m);
        }
      }
    }
    const sink = stoppedAt < 0 ? 0 : Math.min((t - stoppedAt) / 0.3, 1);
    wall.scale.y = Math.max(rise * (1 - sink), 0.001);
    if (m.passThrough) wall.scale.y *= 1 + 0.12 * Math.sin(t * 14);     // water wobbles
    return sink < 1;
  });
}

// --- fault line: spikes march from the impact toward your target and stop at the room. ---
function castFault(key, m, c) {
  const color = ELEMENTS[key].color;
  const start = c.ground.clone();
  const target = aimAssist(c.eye, c.dir, 0.7, c.t);
  let d = flat(c.dir, c.fwd), length = m.length;
  if (target) {
    _to.copy(target.group.position).sub(start);
    d = flat(_to, d);
    length = Math.min(m.length + 1.5, Math.hypot(_to.x, _to.z) + 0.35);
  }
  const probe = start.clone().setY(start.y + 0.3);
  const blocked = collide(probe, probe.clone().addScaledVector(d, length));
  if (blocked) length = Math.max(blocked.point.distanceTo(probe) - 0.15, 0.4);
  const n = Math.max(2, Math.ceil(length / 0.38));
  const spikes = [];
  for (let i = 0; i < n; i++) {
    const at = start.clone().addScaledVector(d, 0.3 + (i / n) * length);
    let h = 0.5 + Math.random() * 0.45;
    if (target && Math.hypot(target.group.position.x - at.x, target.group.position.z - at.z) < 0.45) {
      h = Math.max(h, target.group.position.y - start.y + 0.2);
    }
    const solid = new THREE.Mesh(craggy(new THREE.ConeGeometry(0.1 + Math.random() * 0.06, 1, 6, 4).translate(0, 0.5, 0), 0.04), stoneMat());
    const wire = solid;
    const g = new THREE.Group();
    g.add(solid);
    g.position.copy(at);
    g.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * 3, (Math.random() - 0.5) * 0.5);
    g.scale.set(1, 0.001, 1);
    spikes.push({ g, at, h, solid, wire, struck: false, dusted: false });
  }
  firePulse(start);
  const born = c.t;
  const total = n * 0.05 + 1.2;
  addEffect(spikes.map(s => s.g), (t) => {
    spikes.forEach((s, i) => {
      const age = t - born - i * 0.05;
      const rise = THREE.MathUtils.clamp(age / 0.1, 0, 1);
      const sink = THREE.MathUtils.clamp((age - 0.8) / 0.3, 0, 1);
      s.g.scale.y = Math.max(s.h * rise * (1 - sink), 0.001);
      if (!s.dusted && age > 0) { s.dusted = true; puff(key, s.at, 12, 2, { up: 2.2, jitter: 0.12 }); }
      if (!s.struck && rise >= 1) {
        s.struck = true;
        for (const e of echoes) {
          if (!isLive(e, t)) continue;
          const p = e.group.position;
          if (Math.hypot(p.x - s.at.x, p.z - s.at.z) < 0.35 && p.y < s.at.y + s.h + 0.15) hit(e, key, t, UP, m);
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
        const wet = e.soakedUntil > c.t;
        if (!wet && jumps <= 0) continue;
        const dist = e.group.position.distanceTo(cur.group.position);
        if (dist < (wet ? 4 : 2.6) && dist < nextDist && lineOfSight(cur.group.position, e.group.position)) { next = e; nextDist = dist; }
      }
      if (!next) break;
      if (!(next.soakedUntil > c.t)) jumps--;
      struck.push(next); stops.push(next.group.position.clone());
      cur = next;
    }
  } else {
    stops.push(end.clone());
    if (wall) impact(wall.point, wall.normal, key, c.t, 0.3);
  }
  const white = new THREE.Color(0xffffff), glow = new THREE.Color(0xffa63d);
  for (let i = 1; i < stops.length; i++) puff(key, stops[i], 18, 3, { life: 0.3, size: 0.03, grav: 3 });
  struck.forEach((e, i) => hit(e, key, c.t, stops[i + 1].clone().sub(stops[i]).normalize(), m));
  tone(2600, 90, 0.16, 0.22, 'square'); tone(140, 40, 0.5, 0.3);

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
      for (let i = 1; i < stops.length; i++) pts.push(...jagged(stops[i - 1], stops[i], 0.09).slice(i > 1 ? 1 : 0));
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

const KIND = { bolt: castBolt, cone: castCone, column: castColumn, ring: castRing, wall: castWall, fault: castFault, beam: castBeam, void: castVoid };

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
function cast(key, gesture, c) {
  let m = MOVES[key][gesture];
  if (!m) return;
  if (c.power > 1) m = empowered(key, m, c.power);
  lastCast = key;
  castSound[key]();
  hudNote = (c.power > 1 ? 'twin ' : '') + m.name.toLowerCase();
  drawHud();
  KIND[m.kind](key, m, c);
}

// ---------- senses ----------
// Terra: firePulse. A ripple through surfaces, passes through everything, needs a touch.
// Aero: a burst of air from a clap. Long range, but only finds what it has a clear line to.
function senseAero(centre, t) {
  hudNote = ELEMENTS.aero.sense.toLowerCase(); lastCast = 'aero'; drawHud();
  castSound.aero();
  const color = ELEMENTS.aero.color;
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), glowMat(color, 0.5));
  shell.material.wireframe = true;
  shell.position.copy(centre);
  const origin = centre.clone();
  const seen = new Set();
  addEffect([shell], (n) => {
    const r = Math.max((n - t) * AERO_SENSE.speed, 0.01);
    shell.scale.setScalar(r);
    shell.material.opacity = 0.5 * (1 - r / AERO_SENSE.range);
    for (const e of echoes) {
      if (e.down || seen.has(e)) continue;
      if (e.home.distanceTo(origin) < r) {
        seen.add(e);
        if (lineOfSight(origin, e.home)) reveal(e, n, REVEAL_TIME, color);
      }
    }
    return r < AERO_SENSE.range;
  });
}

// Aqua: a narrow beam from a held palm. Reads the water in living things straight through walls.
const aquaBeam = new THREE.Mesh(
  new THREE.ConeGeometry(Math.tan(AQUA_SENSE.angle) * 6, 6, 28, 1, true).translate(0, -3, 0).rotateX(-Math.PI / 2),
  glowMat(ELEMENTS.aqua.color, 0.07),
);
// Pyro: chi as body heat. Everything close to you glows, whichever way it is, walls or not.
const pyroAura = new THREE.Mesh(
  new THREE.RingGeometry(PYRO_SENSE.radius - 0.05, PYRO_SENSE.radius, 72).rotateX(-Math.PI / 2),
  glowMat(ELEMENTS.pyro.color, 0.5),
);
aquaBeam.visible = pyroAura.visible = false;
aquaBeam.renderOrder = pyroAura.renderOrder = 12;
scene.add(aquaBeam, pyroAura);
const held = { aqua: null, pyro: null };   // set each frame by whoever is holding a sense
const _look = new THREE.Vector3();

function updateHeldSenses(t) {
  const a = held.aqua;
  aquaBeam.visible = !!a;
  if (a) {
    aquaBeam.position.copy(a.origin);
    aquaBeam.lookAt(_look.copy(a.origin).add(a.dir));
    aquaBeam.material.opacity = 0.06 + 0.03 * Math.sin(t * 5);
    for (const e of echoes) {
      if (e.down) continue;
      _to.copy(e.home).sub(a.origin);
      if (_to.length() < AQUA_SENSE.range && _to.angleTo(a.dir) < AQUA_SENSE.angle) reveal(e, t, HOLD_REVEAL, ELEMENTS.aqua.color);
    }
  }
  const p = held.pyro;
  pyroAura.visible = !!p;
  if (p) {
    pyroAura.position.set(p.centre.x, 0.02, p.centre.z);
    pyroAura.material.opacity = 0.35 + 0.2 * Math.sin(t * 7);
    for (const e of echoes) {
      if (!e.down && e.home.distanceTo(p.centre) < PYRO_SENSE.radius) reveal(e, t, HOLD_REVEAL, ELEMENTS.pyro.color);
    }
  }
  if ((a || p) && hudNote !== ELEMENTS[selected].sense.toLowerCase()) {
    hudNote = ELEMENTS[selected].sense.toLowerCase(); lastCast = selected; drawHud();
  }
  held.aqua = held.pyro = null;
}

// ---------- discipline selection ----------
function selectElement(key, quiet) {
  if (selected === key && quiet) return;
  selected = key;
  lastCast = key;
  for (const el of chipEls) el.classList.toggle('on', el.dataset.el === key);
  for (const el of moveEls) {
    const g = el.dataset.g;
    el.textContent = g === 'sense' ? ELEMENTS[key].sense : MOVES[key][g].name;
    el.style.setProperty('--c', `#${ELEMENTS[key].color.getHexString()}`);
  }
  menuOrbs.forEach((orb, i) => orb.scale.setScalar(ELEMENT_ORDER[i] === key ? 1.6 : 1));
  if (!quiet) { tick(); hudNote = `${ELEMENTS[key].label.toLowerCase()} ready`; }
  drawHud();
}

// Palm menu: four orbs that float over an open palm turned toward your face.
const menuGroup = new THREE.Group();
const menuOrbs = ELEMENT_ORDER.map((key) => {
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.013, 16, 12),
    new THREE.MeshBasicMaterial({ color: ELEMENTS[key].color, depthTest: false, transparent: true }),
  );
  orb.renderOrder = 25;
  menuGroup.add(orb);
  return orb;
});
menuGroup.visible = false;
scene.add(menuGroup);

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
  c.fillStyle = '#b6ff3c';
  c.textAlign = 'right';
  c.fillText(`${downCount}/${ECHO_COUNT}`, 478, 68);
  c.textAlign = 'left';
  c.fillStyle = '#cfd6d2';
  c.font = '30px ui-monospace, Menlo, Consolas, monospace';
  c.fillText(downCount === ECHO_COUNT ? 'room clear. resetting…' : hudNote, 36, 138);
  hudTex.needsUpdate = true;
  if (!renderer.xr.isPresenting) {
    statusEl.textContent = `Echoes struck: ${downCount}/${ECHO_COUNT}` + (xrSupported ? '' : ' · preview mode');
  }
}

// ---------- hands ----------
function newHand() {
  return {
    valid: false, seen: false, armed: false, ready: true, clapBlock: -1,
    lastTouch: -1, lastCast: -1, stillT: 0, curl: 1.4, speed: 0,
    palm: new THREE.Vector3(), normal: new THREE.Vector3(), across: new THREE.Vector3(),
    wrist: new THREE.Vector3(), knuckle: new THREE.Vector3(), indexBase: new THREE.Vector3(),
    pinkyBase: new THREE.Vector3(), indexTip: new THREE.Vector3(), hasTip: false,
    point: false, pointDir: new THREE.Vector3(),
    prev: new THREE.Vector3(), vel: new THREE.Vector3(),
  };
}
const handState = { left: newHand(), right: newHand() };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _tip = new THREE.Vector3();
const _vhat = new THREE.Vector3(), _fwd = new THREE.Vector3(), _raw = new THREE.Vector3(), _off = new THREE.Vector3();
const TIPS = ['index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip'];
let sawHands = false;
let clapArmed = true;
let lastMenuPick = -1;

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
    st.valid = false; st.seen = false;            // tracking dropped: forget the velocity
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
  for (const source of frame.session.inputSources) {
    if (source.hand && handState[source.handedness]) readHand(frame, source, refSpace, handState[source.handedness], dt);
  }
  const L = handState.left, R = handState.right;
  if (!sawHands && (L.valid || R.valid)) { sawHands = true; hudNote = 'open palm toward you: pick'; drawHud(); }

  // Palm menu: an open, slow palm turned toward your face. The other index finger picks.
  let menuHand = null;
  for (const st of [L, R]) {
    if (!st.valid || st.curl < CURL_OPEN || st.speed > 0.6) continue;
    _off.subVectors(viewerPos, st.palm).normalize();
    if (st.normal.dot(_off) > 0.6) { menuHand = st; break; }
  }
  menuGroup.visible = !!menuHand;
  if (menuHand) {
    const pointer = menuHand === L ? R : L;
    menuOrbs.forEach((orb, i) => {
      orb.position.copy(menuHand.palm)
        .addScaledVector(menuHand.normal, 0.06)
        .addScaledVector(menuHand.across, (i - 1.5) * 0.042);
      if (pointer.valid && pointer.hasTip && t - lastMenuPick > 0.4 &&
          pointer.indexTip.distanceTo(orb.position) < 0.03 && ELEMENT_ORDER[i] !== selected) {
        lastMenuPick = t;
        selectElement(ELEMENT_ORDER[i]);
      }
    });
  }

  // Aero's sense: a clap.
  if (L.valid && R.valid) {
    const gap = L.palm.distanceTo(R.palm);
    if (gap > CLAP_OFF) clapArmed = true;
    else if (clapArmed && gap < CLAP_ON && !menuHand) {
      clapArmed = false;
      L.clapBlock = R.clapBlock = t;
      if (selected === 'aero') senseAero(_off.addVectors(L.palm, R.palm).multiplyScalar(0.5).clone(), t);
    }
  }

  for (const st of [L, R]) {
    if (!st.valid || st === menuHand) continue;
    const isFist = st.curl < CURL_FIST && !st.point, isOpen = st.curl > CURL_OPEN;
    const other = st === L ? R : L;

    // Surfaces: an open palm touches (Terra's sense), a fist slams (every discipline).
    const hitPalm = nearestSurface(st.palm);
    const hitFist = nearestSurface(st.knuckle);
    const near = Math.min(hitPalm.dist, hitFist.dist) < TOUCH_OFF;
    if (!near) st.armed = true;
    else if (st.armed && t - st.lastTouch > 0.35) {
      if (isFist && hitFist.dist < SLAM_ON) {
        st.armed = false; st.lastTouch = t; st.ready = false;
        cast(selected, 'slam', { hand: st.knuckle.clone(), dir: _fwd.clone(), eye: viewerPos.clone(), fwd: _fwd.clone(), ground: hitFist.point, t });
      } else if (!isFist && hitPalm.dist < TOUCH_ON) {
        st.armed = false; st.lastTouch = t; st.ready = false;
        if (selected === 'terra') {
          firePulse(hitPalm.point);
          hudNote = ELEMENTS.terra.sense.toLowerCase(); lastCast = 'terra'; drawHud();
        } else {
          hudNote = `${ELEMENTS[selected].label.toLowerCase()} senses differently`; drawHud();
        }
      }
    }
    if (near || t - st.clapBlock < 0.4) continue;

    // Held senses: Aqua reads through a raised open palm, Pyro through a raised fist.
    const raised = st.palm.y > viewerPos.y - 0.5;
    if (raised && st.stillT > HOLD_TIME) {
      if (selected === 'aqua' && isOpen && st.normal.dot(_fwd) > 0.5) held.aqua = { origin: st.palm, dir: st.normal };
      if (selected === 'pyro' && isFist) held.pyro = { centre: viewerPos };
    }

    // Attacks.
    if (st.ready && t - st.lastCast > CAST_COOLDOWN && t - st.lastTouch > 0.3) {
      const gesture = classifyGesture(st.curl, st.normal, st.vel, _fwd, st.point ? st.pointDir : null);
      if (gesture) {
        st.ready = false;
        st.lastCast = t;
        const c = { eye: viewerPos.clone(), fwd: _fwd.clone(), t };
        if (gesture === 'punch') { c.hand = st.knuckle.clone(); c.dir = st.vel.clone(); }
        else if (gesture === 'shove') { c.hand = st.palm.clone(); c.dir = st.normal.clone(); }
        else if (gesture === 'point') { c.hand = st.indexTip.clone(); c.dir = st.pointDir.clone(); }
        else { c.hand = st.palm.clone(); c.dir = _fwd.clone(); }   // lift and sweep aim where you look
        // Twin cast: the other hand is doing the same thing, the same way, right now.
        if (isTwin(st, other) && other !== menuHand) {
          other.ready = false; other.lastCast = t;
          c.power = 1.6;
          if (gesture !== 'lift' && gesture !== 'sweep') c.hand.lerp(gesture === 'punch' ? other.knuckle : gesture === 'point' ? other.indexTip : other.palm, 0.5);
        }
        cast(selected, gesture, c);
      }
    }
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

  if (previewGesture === 'sense') {
    if (selected === 'terra') { if (hit) firePulse(hit.point); }
    else if (selected === 'aero') senseAero(hand, t);
    else if (selected === 'aqua') previewHold = { kind: 'aqua', until: t + 2.2, origin: hand, dir };
    else previewHold = { kind: 'pyro', until: t + 2.2, origin: eye };
    if (selected !== 'aero') { hudNote = ELEMENTS[selected].sense.toLowerCase(); drawHud(); }
    return;
  }
  const c = { hand, dir, eye, fwd, t, power: ev.shiftKey ? 1.6 : 1 };
  if (previewGesture === 'lift' || previewGesture === 'sweep') c.dir = aimPoint.clone().sub(eye).normalize();
  if (previewGesture === 'slam') {
    c.ground = eye.clone().addScaledVector(fwd, 1.1).setY(0);
    c.dir = aimPoint.clone().sub(eye).normalize();
  }
  cast(selected, previewGesture, c);
});
for (const el of chipEls) el.addEventListener('click', () => { ensureAudio(); selectElement(el.dataset.el); });
for (const el of moveEls) el.addEventListener('click', () => { ensureAudio(); selectGesture(el.dataset.g); });
window.addEventListener('keydown', (ev) => {
  const i = '1234'.indexOf(ev.key);
  if (i >= 0) selectElement(ELEMENT_ORDER[i]);
  const g = 'qwertyu'.indexOf(ev.key.toLowerCase());
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
      optionalFeatures: ['hand-tracking', 'plane-detection', 'mesh-detection', 'anchors'],
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
  enterBtn.disabled = false;
  scatterEchoes();
}

if (navigator.xr && navigator.xr.isSessionSupported) {
  navigator.xr.isSessionSupported('immersive-ar').then((ok) => {
    xrSupported = ok;
    if (ok) {
      enterBtn.disabled = false;
      statusEl.textContent = 'Headset ready.';
      hintEl.textContent = 'In the headset: turn an open palm toward your face and poke an orb to pick a discipline. Sense first (Terra: palm on a surface. Aero: clap. Aqua: hold a raised palm out. Pyro: hold a raised fist), then punch, shove, lift, sweep, jab with a pointed finger, or slam a fist on a surface. Do a move with both hands for a twin version.';
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
    if (previewHold) {
      if (t > previewHold.until) previewHold = null;
      else if (previewHold.kind === 'aqua') held.aqua = { origin: previewHold.origin, dir: previewHold.dir };
      else held.pyro = { centre: previewHold.origin };
    }
  }

  updateHeldSenses(t);
  updateEchoes(t, dt, viewerPos);
  updateEffects(t, dt);
  const layer = frame && renderer.xr.isPresenting ? frame.session.renderState.baseLayer : null;
  particles.material.uniforms.uHalfH.value = layer ? (layer.framebufferHeight || 1800) / 2 : renderer.domElement.height / 2;
  particles.update(dt);
  renderer.render(scene, camera);
});

// Small hook for automated checks.
window.__tremor = {
  THREE, firePulse, echoes, pulseUniforms, MOVES, ELEMENTS, cast, classifyGesture, scatterEchoes, effects,
  collide, lineOfSight, senseAero, selectElement, held, reveal, particles, hit, isTwin,
  setHold(h) { previewHold = h; },
  get down() { return downCount; },
  get selected() { return selected; },
};

// Tremor Sense: a mixed reality prototype for Resonance.
// Palm on a real surface sends a pulse through the room and reveals hidden echoes.
// Then strike them with a basic attack from any of the four disciplines:
//   PYRO  Ember    closed fist, punch forward     fast single bolt
//   AERO  Gust     open palm, shove forward       wide cone, hits everything in it
//   TERRA Spire    open palm facing up, lift      stone column erupts under the target
//   AQUA  Riptide  open hand, sideways sweep      homing arc that passes through targets

import * as THREE from 'three';

// ---------- tuning ----------
const PULSE_SPEED = 2.4;    // metres per second
const PULSE_LIFE = 4.5;     // seconds
const MAX_PULSES = 4;
const ECHO_COUNT = 6;
const REVEAL_TIME = 6;      // seconds an echo stays visible after a pulse passes
const TOUCH_ON = 0.045;     // palm closer than this to a surface fires a pulse
const TOUCH_OFF = 0.09;     // palm must lift past this before it can fire again
const CURL_OPEN = 1.55;     // fingertip reach / knuckle reach above this = open hand
const CURL_FIST = 1.2;      // below this = fist
const PUNCH_SPEED = 1.3;    // metres per second, fist moving forward
const PUSH_SPEED = 1.1;     // open palm moving the way it faces
const LIFT_SPEED = 0.9;     // open palm facing up, moving up
const SWEEP_SPEED = 1.4;    // open hand moving edge-on, sideways
const REARM_SPEED = 0.5;    // hand must slow below this between attacks
const CAST_COOLDOWN = 0.45; // seconds

const ACID = new THREE.Color(0xb6ff3c);
const ELEMENTS = {
  pyro:  { label: 'PYRO',  move: 'Ember',   color: new THREE.Color(0xff6a1a) },
  aqua:  { label: 'AQUA',  move: 'Riptide', color: new THREE.Color(0x2bb8ff) },
  terra: { label: 'TERRA', move: 'Spire',   color: new THREE.Color(0xe0b64a) },
  aero:  { label: 'AERO',  move: 'Gust',    color: new THREE.Color(0xdff9ff) },
};
const ELEMENT_ORDER = ['pyro', 'aqua', 'terra', 'aero'];

const statusEl = document.getElementById('status');
const hintEl = document.getElementById('hint');
const enterBtn = document.getElementById('enter');
const uiEl = document.getElementById('ui');
const chipEls = Array.from(document.querySelectorAll('[data-el]'));

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
  v.set(point.x, point.y, point.z, pulseUniforms.uTime.value);
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

// ---------- echoes: the hidden things a pulse reveals ----------
const echoes = [];
const echoGroup = new THREE.Group();
scene.add(echoGroup);
let downCount = 0;
let respawnAt = -1;

function glowMat(color, opacity = 0) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthTest: false, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function makeEcho() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), glowMat(ACID));
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.085, 0), glowMat(ACID));
  shell.material.wireframe = true;
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.11, 0.118, 40), glowMat(ACID));
  halo.material.side = THREE.DoubleSide;
  g.add(core, shell, halo);
  g.renderOrder = 10;
  g.visible = false;
  echoGroup.add(g);
  return {
    group: g, core, shell, halo, parts: [core, shell, halo],
    home: new THREE.Vector3(), phase: Math.random() * 6.28,
    revealedUntil: -1, level: 0, down: false, downT: -1, push: new THREE.Vector3(),
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
    for (const m of e.parts) m.material.color.copy(ACID);
    e.group.scale.setScalar(1);
    e.group.position.copy(e.home);
    e.group.visible = false;
  }
  downCount = 0;
  drawHud();
}

const isLive = (e, t) => !e.down && e.revealedUntil > t;

function defeat(e, elementKey, t, pushDir) {
  if (e.down) return;
  e.down = true;
  e.downT = t;
  e.push.copy(pushDir || _zero);
  for (const m of e.parts) { m.material.color.copy(ELEMENTS[elementKey].color); m.material.opacity = 1; }
  e.group.visible = true;
  downCount++;
  hitSound();
  drawHud();
  if (downCount === ECHO_COUNT) respawnAt = t + 3.5;
}
const _zero = new THREE.Vector3();

function updateEchoes(t, dt, viewerPos) {
  // Reveal anything the shell of an active pulse is passing through.
  for (const p of pulseUniforms.uPulses.value) {
    const age = t - p.w;
    if (age <= 0 || age >= PULSE_LIFE) continue;
    const r = age * PULSE_SPEED;
    for (const e of echoes) {
      if (e.down) continue;
      const d = Math.hypot(e.home.x - p.x, e.home.y - p.y, e.home.z - p.z);
      if (Math.abs(d - r) < 0.22) {
        if (e.revealedUntil < t) blip();
        e.revealedUntil = t + REVEAL_TIME;
      }
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
    const target = e.revealedUntil > t ? 1 : 0;
    e.level += (target - e.level) * Math.min(dt * 5, 1);
    const flicker = e.revealedUntil - t < 1 ? 0.6 + 0.4 * Math.sin(t * 22) : 1;
    const o = e.level * flicker;
    e.group.visible = o > 0.01;
    e.core.material.opacity = o;
    e.shell.material.opacity = o * 0.8;
    e.halo.material.opacity = o * 0.5;
    e.group.position.copy(e.home);
    e.group.position.y += Math.sin(t * 1.6 + e.phase) * 0.03;
    e.shell.rotation.set(t * 0.7 + e.phase, t * 0.9, 0);
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

// ---------- attacks ----------
const fxGroup = new THREE.Group();
scene.add(fxGroup);
const effects = [];   // each: { update(t, dt) -> false when finished, dispose() }
let lastCast = null;

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
function noteCast(key) {
  lastCast = key;
  castSound[key]();
  hudNote = `${ELEMENTS[key].label} · ${ELEMENTS[key].move.toLowerCase()}`;
  drawHud();
}
const UP = new THREE.Vector3(0, 1, 0);
const FWD_Z = new THREE.Vector3(0, 0, 1);

// PYRO Ember: one fast bolt. Light aim assist, stops at the first thing it hits.
function castPyro(origin, dir, t) {
  noteCast('pyro');
  const d = dir.clone().normalize();
  const target = aimAssist(origin, d, 0.3, t);
  if (target) d.copy(target.group.position).sub(origin).normalize();
  const color = ELEMENTS.pyro.color;
  const bolt = new THREE.Group();
  bolt.add(new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), glowMat(color, 1)));
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 12, 1, true), glowMat(color, 0.6));
  tail.geometry.rotateX(-Math.PI / 2).translate(0, 0, -0.22);   // cone trails behind +Z travel
  bolt.add(tail);
  bolt.position.copy(origin);
  bolt.quaternion.setFromUnitVectors(FWD_Z, d);
  const prev = origin.clone();
  const born = t;
  addEffect([bolt], (now, dt) => {
    prev.copy(bolt.position);
    bolt.position.addScaledVector(d, 9 * dt);
    bolt.scale.setScalar(1 + 0.15 * Math.sin(now * 40));
    for (const e of echoes) {
      if (isLive(e, now) && segmentDistance(e.group.position, prev, bolt.position) < 0.22) {
        defeat(e, 'pyro', now, d);
        return false;
      }
    }
    return now - born < 1.6;
  });
}

// AERO Gust: instant cone from the palm. Hits every revealed echo inside it and shoves them back.
function castAero(origin, dir, t) {
  noteCast('aero');
  const d = dir.clone().normalize();
  for (const e of echoes) {
    if (!isLive(e, t)) continue;
    _to.copy(e.group.position).sub(origin);
    if (_to.length() < 4.5 && _to.angleTo(d) < 0.5) defeat(e, 'aero', t, d);
  }
  const rings = [];
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), glowMat(ELEMENTS.aero.color, 0));
    ring.material.side = THREE.DoubleSide;
    ring.quaternion.setFromUnitVectors(FWD_Z, d);
    rings.push(ring);
  }
  const born = t;
  addEffect(rings, (now) => {
    let alive = false;
    rings.forEach((ring, i) => {
      const k = (now - born - i * 0.07) / 0.55;
      if (k < 0 || k > 1) { ring.material.opacity = 0; if (k < 0) alive = true; return; }
      alive = true;
      ring.position.copy(origin).addScaledVector(d, 0.15 + k * 3.8);
      ring.scale.setScalar(0.12 + k * 1.6);
      ring.material.opacity = (1 - k) * 0.8;
    });
    return alive;
  });
}

// TERRA Spire: a column erupts from the floor under whatever you are facing. Works through furniture.
function castTerra(origin, dir, t) {
  noteCast('terra');
  const d = dir.clone().normalize();
  const target = aimAssist(origin, d, 0.6, t);
  const base = new THREE.Vector3();
  let height = 1.0;
  if (target) {
    base.set(target.group.position.x, 0, target.group.position.z);
    height = target.group.position.y + 0.18;
  } else {
    _to.set(d.x, 0, d.z);
    if (_to.lengthSq() < 1e-4) _to.set(0, 0, -1);
    base.copy(origin).addScaledVector(_to.normalize(), 1.5).setY(0);
  }
  const color = ELEMENTS.terra.color;
  const geo = new THREE.CylinderGeometry(0.1, 0.17, 1, 6, 4).translate(0, 0.5, 0);
  const solid = new THREE.Mesh(geo, glowMat(color, 0.25));
  const wire = new THREE.Mesh(geo.clone(), glowMat(color, 0.9));
  wire.material.wireframe = true;
  const spire = new THREE.Group();
  spire.add(solid, wire);
  spire.position.copy(base);
  spire.rotation.y = Math.random() * Math.PI;
  spire.scale.set(1, 0.001, 1);
  firePulse(base);                       // the eruption also ripples the room
  const born = t;
  let struck = false;
  addEffect([spire], (now) => {
    const age = now - born;
    const rise = Math.min(age / 0.16, 1);
    const sink = THREE.MathUtils.clamp((age - 0.75) / 0.35, 0, 1);
    spire.scale.y = Math.max(height * rise * (1 - sink), 0.001);
    solid.material.opacity = 0.25 * (1 - sink);
    wire.material.opacity = 0.9 * (1 - sink);
    if (!struck && rise >= 1) {
      struck = true;
      for (const e of echoes) {
        if (!isLive(e, now)) continue;
        const p = e.group.position;
        if (Math.hypot(p.x - base.x, p.z - base.z) < 0.3 && p.y < height + 0.1) defeat(e, 'terra', now, UP);
      }
    }
    return age < 1.1;
  });
}

// AQUA Riptide: a slower arc that bends toward revealed echoes and keeps going through them.
function castAqua(origin, dir, t) {
  noteCast('aqua');
  const d = dir.clone().normalize();
  const color = ELEMENTS.aqua.color;
  const arc = new THREE.Group();
  const crescent = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 8, 28, Math.PI), glowMat(color, 0.95));
  crescent.geometry.rotateX(Math.PI / 2).rotateY(Math.PI);     // bow of the arc leads along +Z
  const drop = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), glowMat(color, 0.9));
  arc.add(crescent, drop);
  arc.position.copy(origin);
  const prev = origin.clone();
  const born = t;
  const struck = new Set();
  addEffect([arc], (now, dt) => {
    // Steer toward the nearest revealed echo ahead of the arc.
    let near = null, nearDist = Infinity;
    for (const e of echoes) {
      if (!isLive(e, now)) continue;
      _to.copy(e.group.position).sub(arc.position);
      const dist = _to.length();
      if (dist < nearDist && _to.angleTo(d) < 1.3) { nearDist = dist; near = e; }
    }
    if (near) {
      _to.copy(near.group.position).sub(arc.position).normalize();
      d.lerp(_to, Math.min(dt * 7, 1)).normalize();
    }
    prev.copy(arc.position);
    arc.position.addScaledVector(d, 5 * dt);
    arc.quaternion.setFromUnitVectors(FWD_Z, d);
    crescent.rotation.z = Math.sin(now * 9) * 0.5;
    for (const e of echoes) {
      if (isLive(e, now) && !struck.has(e) && segmentDistance(e.group.position, prev, arc.position) < 0.22) {
        struck.add(e);
        defeat(e, 'aqua', now, d);
      }
    }
    const age = now - born;
    crescent.material.opacity = 0.95 * Math.min(1, (2.6 - age) / 0.4);
    drop.material.opacity = crescent.material.opacity;
    return age < 2.6;
  });
}

const CAST = { pyro: castPyro, aqua: castAqua, terra: castTerra, aero: castAero };

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
let hudNote = 'palm on a surface';

function drawHud() {
  const accent = lastCast ? `#${ELEMENTS[lastCast].color.getHexString()}` : '#b6ff3c';
  const c = hudCanvas.getContext('2d');
  c.clearRect(0, 0, 512, 192);
  c.fillStyle = 'rgba(5,7,5,0.82)';
  c.strokeStyle = accent;
  c.lineWidth = 4;
  c.beginPath(); c.roundRect(4, 4, 504, 184, 36); c.fill(); c.stroke();
  c.fillStyle = '#b6ff3c';
  c.font = '600 64px ui-monospace, Menlo, Consolas, monospace';
  c.textBaseline = 'middle';
  c.fillText(`ECHOES ${downCount}/${ECHO_COUNT}`, 34, 70);
  c.fillStyle = downCount === ECHO_COUNT ? '#cfd6d2' : accent;
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
    armed: false, lastPulse: -1, lastCast: -1, ready: true, seen: false,
    prev: new THREE.Vector3(), vel: new THREE.Vector3(),
  };
}
const handState = { left: newHand(), right: newHand() };
const J = {
  wrist: new THREE.Vector3(), knuckle: new THREE.Vector3(), indexBase: new THREE.Vector3(),
  pinkyBase: new THREE.Vector3(), tip: new THREE.Vector3(),
};
const _palm = new THREE.Vector3(), _normal = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _vhat = new THREE.Vector3(), _fwd = new THREE.Vector3(), _raw = new THREE.Vector3(), _off = new THREE.Vector3();
const TIPS = ['index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip'];
let sawHands = false;

function jointPos(frame, hand, name, refSpace, out) {
  const joint = hand.get(name);
  if (!joint) return false;
  const pose = frame.getJointPose(joint, refSpace);
  if (!pose) return false;
  const p = pose.transform.position;
  out.set(p.x, p.y, p.z);
  return true;
}

// Decide which attack, if any, a hand motion is. Pure function so it can be tested without a headset.
//   curl: fingertip reach / knuckle reach.  normal: unit vector out of the palm.
//   vel: palm velocity (m/s).  fwd: unit vector the head is facing.
function classifyGesture(curl, normal, vel, fwd) {
  const speed = vel.length();
  if (speed < 0.3) return null;
  _vhat.copy(vel).divideScalar(speed);
  if (curl < CURL_FIST) {
    return speed > PUNCH_SPEED && _vhat.dot(fwd) > 0.35 ? 'pyro' : null;
  }
  if (curl > CURL_OPEN) {
    const along = _vhat.dot(normal);
    if (normal.y > 0.55 && vel.y > LIFT_SPEED) return 'terra';
    if (along > 0.65 && Math.abs(normal.y) < 0.6 && speed > PUSH_SPEED && normal.dot(fwd) > 0.2) return 'aero';
    if (Math.abs(along) < 0.45 && speed > SWEEP_SPEED && Math.abs(_vhat.y) < 0.6) return 'aqua';
  }
  return null;
}

function updateHands(frame, refSpace, t, dt, viewerPos) {
  let wristSeen = false;
  _fwd.set(0, 0, -1).applyQuaternion(viewerQuat);
  for (const source of frame.session.inputSources) {
    if (!source.hand) continue;
    const st = handState[source.handedness];
    if (!st) continue;
    const hand = source.hand;
    if (!jointPos(frame, hand, 'wrist', refSpace, J.wrist) ||
        !jointPos(frame, hand, 'middle-finger-phalanx-proximal', refSpace, J.knuckle) ||
        !jointPos(frame, hand, 'index-finger-metacarpal', refSpace, J.indexBase) ||
        !jointPos(frame, hand, 'pinky-finger-metacarpal', refSpace, J.pinkyBase)) {
      st.seen = false;                               // tracking dropped: forget the velocity
      continue;
    }
    if (!sawHands) { sawHands = true; hudNote = 'palm on a surface'; drawHud(); }

    // Palm centre, the way the palm faces, and how curled the fingers are.
    _palm.addVectors(J.wrist, J.knuckle).multiplyScalar(0.5);
    _a.subVectors(J.indexBase, J.wrist); _b.subVectors(J.pinkyBase, J.wrist);
    _normal.crossVectors(_a, _b).normalize();
    if (source.handedness === 'left') _normal.negate();
    const reach = J.knuckle.distanceTo(J.wrist) || 0.09;
    let tipSum = 0, tipN = 0;
    for (const name of TIPS) if (jointPos(frame, hand, name, refSpace, J.tip)) { tipSum += J.tip.distanceTo(J.wrist); tipN++; }
    const curl = tipN ? tipSum / tipN / reach : 1.4;

    // Smoothed palm velocity.
    if (st.seen && dt > 0) {
      _raw.subVectors(_palm, st.prev).divideScalar(dt);
      st.vel.lerp(_raw, 0.5);
    } else {
      st.vel.set(0, 0, 0);
    }
    st.prev.copy(_palm);
    st.seen = true;
    const speed = st.vel.length();
    if (speed < REARM_SPEED) st.ready = true;

    // Palm touch: fire a pulse where an open palm meets a real surface.
    const hit = nearestSurface(_palm);
    let touching = false;
    if (hit) {
      touching = hit.dist < TOUCH_OFF;
      if (!touching) st.armed = true;
      else if (st.armed && hit.dist < TOUCH_ON && curl > CURL_FIST && t - st.lastPulse > 0.35) {
        st.armed = false;
        st.lastPulse = t;
        st.ready = false;
        firePulse(hit.point);
        if (hudNote === 'palm on a surface') { hudNote = 'now strike them'; drawHud(); }
      }
    }

    // Attacks: only away from surfaces, so a palm slap never doubles as one.
    if (!touching && st.ready && t - st.lastCast > CAST_COOLDOWN && t - st.lastPulse > 0.3) {
      const key = classifyGesture(curl, _normal, st.vel, _fwd);
      if (key) {
        st.ready = false;
        st.lastCast = t;
        if (key === 'pyro') castPyro(J.knuckle.clone(), st.vel.clone(), t);
        else if (key === 'aero') castAero(_palm.clone(), _normal.clone(), t);
        else if (key === 'terra') castTerra(viewerPos.clone(), _fwd.clone(), t);
        else castAqua(_palm.clone(), _fwd.clone(), t);
      }
    }

    // HUD rides the left wrist.
    if (source.handedness === 'left') {
      hud.position.copy(J.wrist).add(_off.set(0, 0.09, 0));
      hud.lookAt(viewerPos);
      wristSeen = true;
    }
  }
  if (!wristSeen) {       // no left hand in view: park the HUD low in front of you
    _off.set(0, -0.28, -0.55).applyQuaternion(viewerQuat);
    hud.position.copy(viewerPos).add(_off);
    hud.lookAt(viewerPos);
  }
}

// Controller fallback: trigger attacks what you point at (or pulses the surface), grip changes discipline.
const raycaster = new THREE.Raycaster();
const _origin = new THREE.Vector3(), _rayDir = new THREE.Vector3();
let selected = 'pyro';
function selectElement(key) {
  selected = key;
  for (const el of chipEls) el.classList.toggle('on', el.dataset.el === key);
}
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
  const t = pulseUniforms.uTime.value;
  if (aimAssist(_origin, _rayDir, 0.3, t)) { CAST[selected](_origin.clone(), _rayDir.clone(), t); return; }
  raycaster.set(_origin, _rayDir);
  const targets = [...roomGroup.children, fallbackFloor].filter(o => o.visible);
  const hit = raycaster.intersectObjects(targets, false)[0];
  firePulse(hit ? hit.point : _origin);
}
function onSqueezeStart(event) {
  if (event.inputSource.hand) return;
  selectElement(ELEMENT_ORDER[(ELEMENT_ORDER.indexOf(selected) + 1) % ELEMENT_ORDER.length]);
  hudNote = `${ELEMENTS[selected].label} ready`;
  lastCast = selected;
  drawHud();
}

// ---------- flat screen preview ----------
const pointer = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', (ev) => {
  if (renderer.xr.isPresenting) return;
  ensureAudio();
  pointer.set((ev.clientX / window.innerWidth) * 2 - 1, -(ev.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const t = pulseUniforms.uTime.value;
  const eye = raycaster.ray.origin.clone();
  const aim = raycaster.ray.direction.clone();
  const target = aimAssist(eye, aim, 0.14, t);
  if (target) {
    // Launch from where a right hand would be, toward the echo that was tapped.
    const handPos = eye.clone().add(new THREE.Vector3(0.25, -0.3, -0.35).applyQuaternion(camera.quaternion));
    const dir = target.group.position.clone().sub(handPos).normalize();
    if (selected === 'terra') castTerra(eye, aim, t); else CAST[selected](handPos, dir, t);
    return;
  }
  const hit = raycaster.intersectObjects(previewGroup.children, false)[0];
  if (hit) firePulse(hit.point);
});
for (const el of chipEls) el.addEventListener('click', () => { ensureAudio(); selectElement(el.dataset.el); });
window.addEventListener('keydown', (ev) => {
  const i = '1234'.indexOf(ev.key);
  if (i >= 0) selectElement(ELEMENT_ORDER[i]);
});
selectElement('pyro');

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
    sawHands = false; askedForRoom = false; placed = false; lastCast = null;
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
      hintEl.textContent = 'In the headset: bare palm on the floor, a wall or a table sends a pulse. Then strike what it reveals. Punch = Pyro. Open palm shove = Aero. Palm up, lift = Terra. Sideways sweep = Aqua.';
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
  }

  updateEchoes(t, dt, viewerPos);
  updateEffects(t, dt);
  renderer.render(scene, camera);
});

// Small hook for automated checks.
window.__tremor = {
  THREE, firePulse, echoes, pulseUniforms, CAST, classifyGesture, scatterEchoes, effects,
  get down() { return downCount; },
};

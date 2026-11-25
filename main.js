// Tremor Sense: a mixed reality prototype for the Terra discipline.
// Put a bare palm on a real surface to send a pulse through the room.
// The pulse reveals hidden echoes; pinch toward one to pull it in.

import * as THREE from 'three';

const ACID = new THREE.Color(0xb6ff3c);
const PULSE_SPEED = 2.4;   // metres per second
const PULSE_LIFE = 4.5;    // seconds
const MAX_PULSES = 4;
const ECHO_COUNT = 6;
const REVEAL_TIME = 4.5;   // seconds an echo stays visible after a pulse passes
const TOUCH_ON = 0.045;    // palm closer than this to a surface fires a pulse
const TOUCH_OFF = 0.09;    // palm must lift past this before it can fire again
const PINCH_ON = 0.02;
const PINCH_OFF = 0.04;
const CATCH_ANGLE = 0.14;  // radians between your pinch direction and the echo

const statusEl = document.getElementById('status');
const hintEl = document.getElementById('hint');
const enterBtn = document.getElementById('enter');
const uiEl = document.getElementById('ui');

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
const chime = () => { tone(660, 660, 0.18, 0.12, 'triangle'); tone(990, 990, 0.25, 0.12, 'triangle', 0.09); };

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

const planes = new Map();   // XRPlane -> { mesh, changed, polygon, inverse }
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

// Nearest real surface to a world point. Returns { dist, point } or null.
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
let caughtCount = 0;
let respawnAt = -1;

function makeEcho() {
  const g = new THREE.Group();
  const mat = () => new THREE.MeshBasicMaterial({
    color: ACID, transparent: true, opacity: 0, depthTest: false, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), mat());
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.085, 0), mat());
  shell.material.wireframe = true;
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.11, 0.118, 40), mat());
  halo.material.side = THREE.DoubleSide;
  g.add(core, shell, halo);
  g.renderOrder = 10;
  g.visible = false;
  echoGroup.add(g);
  return {
    group: g, core, shell, halo,
    home: new THREE.Vector3(), phase: Math.random() * 6.28,
    revealedUntil: -1, level: 0, caught: false, catchT: -1, catchFrom: new THREE.Vector3(),
    catchTo: new THREE.Vector3(),
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
  // Keep echoes inside the walls and at heights you can point at.
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
    e.caught = false; e.catchT = -1; e.revealedUntil = -1; e.level = 0;
    e.group.scale.setScalar(1);
    e.group.visible = false;
  }
  caughtCount = 0;
  drawHud();
}

function updateEchoes(t, dt, viewerPos) {
  // Reveal anything the shell of an active pulse is passing through.
  for (const p of pulseUniforms.uPulses.value) {
    const age = t - p.w;
    if (age <= 0 || age >= PULSE_LIFE) continue;
    const r = age * PULSE_SPEED;
    for (const e of echoes) {
      if (e.caught) continue;
      const d = Math.hypot(e.home.x - p.x, e.home.y - p.y, e.home.z - p.z);
      if (Math.abs(d - r) < 0.22) {
        if (e.revealedUntil < t) blip();
        e.revealedUntil = t + REVEAL_TIME;
      }
    }
  }
  for (const e of echoes) {
    if (e.catchT >= 0) {                       // being pulled toward the hand
      const k = Math.min((t - e.catchT) / 0.45, 1);
      const ease = k * k * (3 - 2 * k);
      e.group.position.lerpVectors(e.catchFrom, e.catchTo, ease);
      e.group.scale.setScalar(1 - 0.85 * ease);
      if (k >= 1) { e.catchT = -1; e.group.visible = false; }
      continue;
    }
    if (e.caught) continue;
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

// Try to catch a revealed echo along a ray. Returns true if one was caught.
const _toEcho = new THREE.Vector3();
function tryCatch(origin, dir, pullTo, t) {
  let best = null, bestAngle = CATCH_ANGLE;
  for (const e of echoes) {
    if (e.caught || e.revealedUntil < t) continue;
    _toEcho.copy(e.group.position).sub(origin);
    const angle = _toEcho.angleTo(dir);
    if (angle < bestAngle) { bestAngle = angle; best = e; }
  }
  if (!best) return false;
  best.caught = true;
  best.catchT = t;
  best.catchFrom.copy(best.group.position);
  best.catchTo.copy(pullTo);
  best.core.material.opacity = 1; best.shell.material.opacity = 1; best.halo.material.opacity = 0;
  caughtCount++;
  chime();
  drawHud();
  if (caughtCount === ECHO_COUNT) respawnAt = t + 3.5;
  return true;
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
let hudNote = 'palm on a surface';

function drawHud() {
  const c = hudCanvas.getContext('2d');
  c.clearRect(0, 0, 512, 192);
  c.fillStyle = 'rgba(5,7,5,0.82)';
  c.strokeStyle = '#b6ff3c';
  c.lineWidth = 4;
  c.beginPath(); c.roundRect(4, 4, 504, 184, 36); c.fill(); c.stroke();
  c.fillStyle = '#b6ff3c';
  c.font = '600 64px ui-monospace, Menlo, Consolas, monospace';
  c.textBaseline = 'middle';
  c.fillText(`ECHOES ${caughtCount}/${ECHO_COUNT}`, 34, 70);
  c.fillStyle = '#cfd6d2';
  c.font = '30px ui-monospace, Menlo, Consolas, monospace';
  c.fillText(caughtCount === ECHO_COUNT ? 'room clear. resetting…' : hudNote, 36, 138);
  hudTex.needsUpdate = true;
  if (!renderer.xr.isPresenting) {
    statusEl.textContent = `Echoes caught: ${caughtCount}/${ECHO_COUNT}` + (xrSupported ? '' : ' · preview mode');
  }
}

// ---------- hands ----------
const handState = {
  left: { armed: false, pinching: false, lastFire: -1 },
  right: { armed: false, pinching: false, lastFire: -1 },
};
const _palm = new THREE.Vector3(), _thumb = new THREE.Vector3(), _index = new THREE.Vector3();
const _wrist = new THREE.Vector3(), _dir = new THREE.Vector3(), _mid = new THREE.Vector3();
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

function updateHands(frame, refSpace, t, viewerPos) {
  let wristSeen = false;
  for (const source of frame.session.inputSources) {
    if (!source.hand) continue;
    const st = handState[source.handedness];
    if (!st) continue;
    if (!sawHands) { sawHands = true; hudNote = 'palm on a surface'; drawHud(); }

    // Palm touch: fire a pulse where the palm meets a real surface.
    if (jointPos(frame, source.hand, 'middle-finger-metacarpal', refSpace, _palm)) {
      const hit = nearestSurface(_palm);
      if (hit) {
        if (hit.dist > TOUCH_OFF) st.armed = true;
        else if (st.armed && hit.dist < TOUCH_ON && t - st.lastFire > 0.35) {
          st.armed = false;
          st.lastFire = t;
          firePulse(hit.point);
          if (hudNote !== 'pinch at an echo') { hudNote = 'pinch at an echo'; drawHud(); }
        }
      }
    }

    // Pinch: pull in whichever revealed echo you are pinching toward.
    if (jointPos(frame, source.hand, 'thumb-tip', refSpace, _thumb) &&
        jointPos(frame, source.hand, 'index-finger-tip', refSpace, _index)) {
      const gap = _thumb.distanceTo(_index);
      if (!st.pinching && gap < PINCH_ON) {
        st.pinching = true;
        _mid.addVectors(_thumb, _index).multiplyScalar(0.5);
        _dir.subVectors(_mid, viewerPos).normalize();
        tryCatch(viewerPos, _dir, _mid, t);
      } else if (st.pinching && gap > PINCH_OFF) {
        st.pinching = false;
      }
    }

    // HUD rides the left wrist.
    if (source.handedness === 'left' && jointPos(frame, source.hand, 'wrist', refSpace, _wrist)) {
      hud.position.copy(_wrist).add(_dir.set(0, 0.09, 0));
      hud.lookAt(viewerPos);
      wristSeen = true;
    }
  }
  if (!wristSeen) {       // no left hand in view: park the HUD low in front of you
    _dir.set(0, -0.28, -0.55).applyQuaternion(viewerQuat);
    hud.position.copy(viewerPos).add(_dir);
    hud.lookAt(viewerPos);
  }
}

// Controller fallback: trigger sends a pulse from wherever the controller points.
const raycaster = new THREE.Raycaster();
const _origin = new THREE.Vector3(), _rayDir = new THREE.Vector3();
function onSelectStart(event) {
  const source = event.inputSource;
  if (source.hand) return;                           // hands use palm and pinch instead
  const refSpace = renderer.xr.getReferenceSpace();
  const pose = event.frame.getPose(source.targetRaySpace, refSpace);
  if (!pose) return;
  const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
  _origin.setFromMatrixPosition(m);
  _rayDir.set(0, 0, -1).transformDirection(m);
  const t = pulseUniforms.uTime.value;
  if (tryCatch(_origin, _rayDir, _origin, t)) return;
  raycaster.set(_origin, _rayDir);
  const targets = [...roomGroup.children, fallbackFloor].filter(o => o.visible);
  const hit = raycaster.intersectObjects(targets, false)[0];
  firePulse(hit ? hit.point : _origin);
}

// ---------- flat screen preview ----------
const pointer = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', (ev) => {
  if (renderer.xr.isPresenting) return;
  ensureAudio();
  pointer.set((ev.clientX / window.innerWidth) * 2 - 1, -(ev.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const t = pulseUniforms.uTime.value;
  const from = raycaster.ray.origin.clone();
  const pullTo = from.clone().add(raycaster.ray.direction.clone().multiplyScalar(0.4));
  if (tryCatch(from, raycaster.ray.direction, pullTo, t)) return;
  const hit = raycaster.intersectObjects(previewGroup.children, false)[0];
  if (hit) firePulse(hit.point);
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
    session.addEventListener('end', onSessionEnd);
    scene.background = null;
    previewGroup.visible = false;
    pulseUniforms.uBase.value = 0;
    uiEl.style.display = 'none';
    hud.visible = true;
    sawHands = false; askedForRoom = false; placed = false;
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
      hintEl.textContent = 'In the headset: set your controllers down, press a bare palm onto the floor, a wall or a table to send a pulse, then pinch toward anything it reveals.';
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
      updateHands(frame, refSpace, t, viewerPos);

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
  renderer.render(scene, camera);
});

// Small hook for automated checks.
window.__tremor = { firePulse, echoes, pulseUniforms, planes, tryCatch, get caught() { return caughtCount; } };

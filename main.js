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

// ---------- tuning ----------
const PULSE_SPEED = 2.4;    // metres per second
const PULSE_LIFE = 4.5;     // seconds
const MAX_PULSES = 4;
const ECHO_COUNT = 8;        // the most creatures a wave can field
// Four kinds of creature, one leaning toward each discipline. Colour tells you which once you have sensed it.
//   ember:  quick shots. Water hurts it double. Bursts into flame when it dies.
//   drip:   always counts as soaked, so Volt goes straight through it and fire only makes steam. Leaves a water source.
//   pebble: slow, three hits to kill, and its shards chew through walls twice as fast. Drops a stone.
//   wisp:   fast and fragile: one hit, but hard to pin down. Dies in a gust that scatters loose objects.
const KINDS = {
  plain:  { hp: 2, speed: 0.7,  shot: 3.2, colour: 0xb6ff3c },
  ember:  { hp: 2, speed: 0.8,  shot: 4.0, colour: 0xff7a2a, weak: 'aqua' },
  drip:   { hp: 2, speed: 0.6,  shot: 2.8, colour: 0x8fd3e6, wet: true },
  pebble: { hp: 3, speed: 0.45, shot: 3.0, colour: 0xd9b25a, heavy: true },
  wisp:   { hp: 1, speed: 1.3,  shot: 4.4, colour: 0xeaf7ff },
};
for (const k of Object.values(KINDS)) k.colour = new THREE.Color(k.colour);
const KIND_NAMES = ['ember', 'drip', 'pebble', 'wisp'];
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
const TIDE_SENSE = { speed: 3.2, reach: 14 };  // water spreads across the whole floor; anything above it shows where it stands
const DRAFT_SENSE = { speed: 9, lasts: 9 };    // the air of the whole room, for a while: anything that moves gives itself away

const ACID = new THREE.Color(0xb6ff3c);
const ELEMENTS = {
  pyro:  { label: 'PYRO',  sense: 'Chi Sense',    color: new THREE.Color(0xff6a1a) },
  aqua:  { label: 'AQUA',  sense: 'Tide Sense',   color: new THREE.Color(0xa9dbe6) },
  terra: { label: 'TERRA', sense: 'Tremor Sense', color: new THREE.Color(0xe0b64a) },
  aero:  { label: 'AERO',  sense: 'Draft Sense',  color: new THREE.Color(0xdff9ff) },
};
const ELEMENT_ORDER = ['pyro', 'aqua', 'terra', 'aero'];
// Terra works four kinds of earth. Pick Terra again while it is already selected to step to the next.
//   rock:  the default. Hits twice as hard as anything else.
//   sand:  light hits that blind for 3 s, shots that pass through, and a sand cloud wherever one lands.
//   metal: shots ricochet, what they hit conducts lightning like a soaked target, and walls throw shards back.
//   lava:  everything it touches burns, catches light, and boils water.
const TERRA_FORMS = ['rock', 'sand', 'metal', 'lava'];
const FORM_LOOK = {
  rock: {},
  sand: { pal: { dark: 0x7a6844, light: 0xdcc48e, seam: 0xefe0b4, amt: 0.2, grain: [22, 22, 22] } },
  metal: { metal: true },
  lava: { heat: 1 },
};
let terraForm = 'rock';
// The other three disciplines have sub-elements too. Same rule: pick the discipline again to step to the next.
//   Pyro  flame      burns: a second hit lands by itself.
//         lightning  no burn. Every hit arcs to one more creature nearby, and conducts through anything soaked or steel-struck.
//         blast      no burn. Every hit goes off as a small explosion that throws objects and hurts what is close.
//   Aqua  water      soaks.
//         ice        freezes instead. Breaker becomes a standing wall of ice, Geyser a standing spike. Globe becomes a shard.
//         steam      no soak. Blinds for 2 s, and shots leave a scalding cloud where they land.
//   Aero  wind       shoves away.
//         vacuum     pulls toward you instead, and leaves the target short of air: a second hit lands by itself.
//         sound      goes through walls and cover, and stuns for 2.5 s. No shove.
const FORMS = { terra: TERRA_FORMS, pyro: ['flame', 'lightning', 'blast'], aqua: ['water', 'ice', 'steam'], aero: ['wind', 'vacuum', 'sound'] };
const forms = { pyro: 'flame', aqua: 'water', aero: 'wind' };
const formOf = (key) => key === 'terra' ? terraForm : forms[key];
// Which set of colours a move is drawn in.
const lookOf = (key, m) => m && m.form === 'lightning' ? 'volt' : key;
const GESTURES = ['sense', 'punch', 'shove', 'lift', 'sweep', 'slam', 'point', 'grip', 'charge'];

// What each verb does per discipline. kind picks the behaviour, the rest are its numbers.
const MOVES = {
  pyro: {
    punch: { name: 'Ember',       kind: 'bolt',   speed: 9,  radius: 0.22, shape: 'orb' },
    shove: { name: 'Flame Burst', kind: 'cone',   range: 4, angle: 0.7 },
    lift:  { name: 'Pyre',        kind: 'column', launch: true, radius: 0.35, top: 0.16, bottom: 0.2, sides: 12, flicker: true },
    sweep: { name: 'Fire Arc',    kind: 'bolt',   speed: 6,  radius: 0.5, shape: 'crescent', size: 0.5, pierce: true, life: 1.2 },
    slam:  { name: 'Eruption',    kind: 'ring',   maxR: 3.6, height: 1.4 },
    point: { name: 'Volt',        kind: 'beam',   range: 14, chain: 3, volt: true },
    grip:  { name: 'Fireball',    kind: 'bolt',   speed: 8, radius: 0.3, shape: 'orb', size: 0.07, blast: 1.3, damage: 2, life: 2.2 },
    charge: { name: 'Fireball',   kind: 'bolt',   speed: 8, radius: 0.3, shape: 'orb', size: 0.07, blast: 1.3, damage: 2, life: 2.2 },
  },
  aqua: {
    punch: { name: 'Globe',       kind: 'bolt',   speed: 9, radius: 0.24, shape: 'blob', size: 0.085 },
    shove: { name: 'Breaker',     kind: 'wall',   ram: 6, width: 2.2, height: 1.2, passThrough: true },
    lift:  { name: 'Geyser',      kind: 'column', launch: true, radius: 0.32, top: 0.1, bottom: 0.1, sides: 16 },
    sweep: { name: 'Whip',        kind: 'whip',   range: 3.4, arc: 1.05 },
    slam:  { name: 'Surge',       kind: 'ring',   maxR: 4.2, height: 1.1, launch: true },
    point: { name: 'Frost Needle', kind: 'bolt',  speed: 14, radius: 0.2, shape: 'shard', freeze: true },
    grip:  { name: 'Water Grip',  kind: 'grip' },
    charge: { name: 'Deluge',     kind: 'bolt',   speed: 8, radius: 0.35, shape: 'blob', size: 0.1, splash: 1.3, damage: 2, life: 2.2 },
  },
  terra: {
    punch: { name: 'Stone Shot',  kind: 'bolt',   speed: 8,  radius: 0.28, shape: 'rock', gravity: 2.5 },
    shove: { name: 'Boulder',     kind: 'bolt',   speed: 4.5, radius: 0.55, shape: 'rock', size: 0.32, roll: true, pierce: true, life: 4 },
    lift:  { name: 'Spire',       kind: 'column', launch: true, radius: 0.32, top: 0.03, bottom: 0.19, sides: 6, pulse: true, stand: 18 },
    sweep: { name: 'Rampart',     kind: 'wall',   ram: 5, width: 1.8, height: 1.5, stand: 30 },
    slam:  { name: 'Fault Line',  kind: 'fault',  length: 8 },
    point: { name: 'Ferro Disc',  kind: 'bolt',   speed: 10, radius: 0.25, shape: 'disc', bounces: 3, pierce: true, life: 2.5 },
    grip:  { name: 'Unearth',     kind: 'grip' },
    charge: { name: 'Meteor',     kind: 'bolt',   speed: 9, radius: 0.4, shape: 'rock', size: 0.18, gravity: 3, quake: 1.2, damage: 3, life: 3 },
  },
  aero: {
    punch: { name: 'Air Bullet',  kind: 'bolt',   speed: 16, radius: 0.2, shape: 'orb', size: 0.03, bounces: 2 },
    shove: { name: 'Gust',        kind: 'cone',   range: 7, angle: 0.5 },
    lift:  { name: 'Updraft',     kind: 'column', launch: true, radius: 0.5, top: 0.3, bottom: 0.22, sides: 20 },
    sweep: { name: 'Air Blade',   kind: 'bolt',   speed: 11, radius: 0.4, shape: 'crescent', size: 0.4, pierce: true },
    slam:  { name: 'Shockwave',   kind: 'ring',   maxR: 4.5, height: 2.2 },
    point: { name: 'Void',        kind: 'void',   radius: 1.5, range: 10 },
    grip:  { name: 'Wind Grip',   kind: 'grip' },
    charge: { name: 'Air Cannon', kind: 'bolt',   speed: 15, radius: 0.5, shape: 'vortex', pierce: true, damage: 2, life: 1.6 },
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
    uniform vec3 uAmbient;
    uniform vec4 uLights[4];
    uniform vec3 uLightCols[4];
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
      gl_FragColor = vec4(uColor * a + uAmbient * (0.35 + grid) + lit, a + wash + glow);
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
// Things you built that stand in the room and block like the room does.
//   struck(dir, key, t): called when one of your own moves hits it.  damage(t): called when something hostile does.
const barriers = [];
const barrierMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
function addBarrier(geometry, like, handlers) {
  const collider = new THREE.Mesh(geometry, barrierMat);
  collider.position.copy(like.position); collider.quaternion.copy(like.quaternion);
  collider.updateMatrixWorld(true);
  const b = { collider, alive: true, hp: 3, ...handlers };
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
  if (!keepWorld) clearBarriers();
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
    e.home.copy(openSpot(box, 0.5, 1.7, 0.3, eye, taken, 0.7));
    taken.push(e.home.clone());
    e.down = false; e.downT = -1; e.revealedUntil = -1; e.level = 0;
    e.hp = KINDS[e.kind].hp; e.restY = e.home.y; e.vel.set(0, 0, 0); e.airborne = false; e.flashT = -1;
    e.burnAt = e.soakedUntil = e.frozenUntil = e.metalUntil = e.blindUntil = e.drainAt = -1;
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
    if (m.launch) { e.airborne = true; e.vel.y = 2.2; }       // a slow toss: about a metre up, nearly two seconds of hang
    if (m.from) {                                   // vacuum: dragged toward whoever cast it
      _hd.copy(m.from).sub(pos).setY(0).normalize();
      e.vel.x += _hd.x * 3; e.vel.z += _hd.z * 3;
      e.drainAt = t + 1.5;
    } else if (!m.sonic && ((key === 'aero' && m.kind !== 'void') || m.kind === 'wall' || m.roll)) {   // shoved along the floor
      const push = key === 'aero' ? 3.5 : 2.5;
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
    p.set(THREE.MathUtils.lerp(box.min.x, box.max.x, Math.random()), THREE.MathUtils.lerp(0.5, 1.7, Math.random()), THREE.MathUtils.lerp(box.min.z, box.max.z, Math.random()));
    if (isOpen(p, 0.25, e.home)) { e.goal.copy(p); break; }      // only somewhere it can fly to in a straight line
  }
  e.goalUntil = t + 3 + Math.random() * 4;
}
const _cdir = new THREE.Vector3(), _cprobe = new THREE.Vector3();
function creatureAI(e, t, dt, eye) {
  if (e.frozenUntil > t || e.airborne || e.puppet || e.blindUntil > t) { e.windup = -1; return; }
  if (e.windup > 0) {                              // winding up: holds still, pulls light into itself
    if (t >= e.windup) { e.windup = -1; spit(e, eye, t); }
    else {
      _cdir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.3);
      _cprobe.copy(e.home).add(_cdir);
      particles.emit(_cprobe, _cdir.multiplyScalar(-3), HOSTILE, 0.02, 0.1, 0, 0);
    }
    return;
  }
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
    if (e.drainAt > 0 && t >= e.drainAt) { e.drainAt = -1; hit(e, 'aero', t, ZERO, { damage: 1, kind: 'void' }); if (e.down) continue; }
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
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: pulseUniforms.uTime,
      uA: { value: new THREE.Color(P.a) }, uB: { value: new THREE.Color(P.b) }, uC: { value: new THREE.Color(P.c ?? P.b) },
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
};
// How each discipline's loose matter behaves once it is in the air.
PCOL.volt = [0xffffff, 0xcfe0ff, 0x7f9cff].map(c => new THREE.Color(c));
const PSTYLE = {
  volt:  { size: 0.022, life: 0.22, grav: 0,    drag: 2 },     // sparks
  pyro:  { size: 0.035, life: 0.5,  grav: -1.6, drag: 1.5 },   // embers rise
  aqua:  { size: 0.028, life: 0.6,  grav: 6,    drag: 0.4 },   // droplets fall
  terra: { size: 0.04,  life: 0.7,  grav: 7,    drag: 0.8 },   // chips drop fast
  aero:  { size: 0.018, life: 0.28, grav: 0,    drag: 3 },     // streaks vanish
};
const _pv = new THREE.Vector3(), _pp = new THREE.Vector3();
// n particles from a point. dir + spread aims them; without dir they go every way.
function puff(key, point, n, speed, o = {}) {
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
function boltTrail(key, m, pos, dirN, dt) {
  const wide = m.shape === 'crescent' ? (m.size || 0.16) : m.roll ? 0.18 : 0.02;
  const rate = m.shape === 'disc' ? 0 : m.shape === 'shard' ? 40 : { pyro: 110, volt: 90, aqua: 80, terra: m.roll ? 60 : 30, aero: 70 }[key];
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
      return stop(wall.point.clone(), t);
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
    if (end) { impact(wall.point, wall.normal, key, t, m.shape === 'rock' ? 0.4 : 0.25); return stop(wall.point.clone(), t); }

    dirN.copy(vel).normalize();
    mesh.lookAt(look.copy(mesh.position).add(dirN));
    if (m.shape === 'rock') mesh.rotateX(m.roll ? (t - born) * m.speed / (m.size || 0.2) : t * 9);   // a boulder turns as far as it travels
    if (m.shape === 'disc') mesh.children[0].rotation.y = t * 40;
    if (m.shape === 'vortex') for (const band of mesh.children) band.rotation.z += dt * band.userData.spin;
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
  if (key === 'terra') {
    // Stone answers from whatever is closest: the floor, a wall beside the target, the ceiling over it, a table.
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
  const white = new THREE.Color(0xffffff), glow = new THREE.Color(0xffa63d);
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

const KIND = { bolt: castBolt, cone: castCone, column: castColumn, ring: castRing, wall: castWall, fault: castFault, beam: castBeam, void: castVoid, whip: castWhip };

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
  noteGesture(`${gesture} > ${m.name}`);
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
  }
  if (key === 'aqua' && gesture === 'charge') {      // everything you gathered goes in one throw
    m = { ...m, damage: 1 + Math.floor(water.amount / 2), splash: 1 + water.amount * 0.25 };
    c.scale = 1 + water.amount * 0.3;
    if (water.amount > 0.3) c.hand = water.pos.clone();
    water.amount = 0;
  }
  if (key === 'aqua' && water.amount >= 1) {         // carried water: the move leaves from it, and is the stronger for it
    water.amount -= 1;
    c.power = Math.max(c.power || 1, 1.5);
    if (m.kind === 'bolt' || m.kind === 'whip' || m.kind === 'cone') c.hand = water.pos.clone();
    c.wet = true;
  }
  if (c.power > 1) m = empowered(key, m, c.power);
  lastCast = key;
  castSound[key]();
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
const GRIP = { aero: 'Wind Grip', aqua: 'Water Grip', terra: 'Unearth', pyro: 'Fireball' };
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
const SOURCE_LIFE = 35, WATER_MAX = 3, WATER_FILL = 1.3;      // seconds a source runs; measures you can carry; seconds per measure
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
  waterBlob.visible = water.amount > 0.05;
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
  if (key === 'aero' || key === 'terra') {
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
  lastCast = key; castSound[key]();
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
  const g = chargeOrbs[i];
  g.visible = key === 'pyro' && charge > 0.2;
  if (!g.visible) return;
  g.position.copy(pos);
  g.scale.setScalar(0.03 + 0.06 * Math.min(charge / CHARGE_MAX, 1));
  if (charge > CHARGE_MIN && Math.random() < 0.5) puff('pyro', pos, 1, 0.6, { up: 1 });
  lightNow(pos, FIRE_LIGHT, 0.5 * Math.min(charge / CHARGE_MAX, 1));
}
function throwCharged(key, hand, dir, eye, fwd, charge, t) {
  cast(key, 'charge', { hand, dir, eye, fwd, t, scale: 1 + Math.min(charge, CHARGE_MAX) * (key === 'pyro' ? 1 : 0.6) });
}
const throwFireball = (hand, dir, eye, fwd, charge, t) => throwCharged('pyro', hand, dir, eye, fwd, charge, t);

// ---------- senses ----------
// Each one fills the whole room and tells you something different.
//   Tremor (Terra): a ripple through every surface from where you touched. Shows where things are, once.
//   Draft  (Aero):  the room's air, for several seconds. Shows whatever is moving, and the trail it leaves.
//   Chi    (Pyro):  heat and life, through walls, for as long as you hold it. Shows health, and which objects are hot.
//   Tide   (Aqua):  water across the whole floor, for as long as you hold it. Shows where everything stands, by its ripples.
let draftUntil = -1;
function senseAero(centre, t) {
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

const held = { aqua: null, pyro: null };   // set each frame by whoever is holding a sense
const _amb = new THREE.Color();

function updateHeldSenses(t, heldDt = 0.016) {
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
    _amb.setRGB(0.16, 0.045, 0.01);
    for (const e of echoes) if (!e.down) reveal(e, t, HOLD_REVEAL, ELEMENTS.pyro.color);
  }
  pulseUniforms.uAmbient.value.lerp(_amb, Math.min(heldDt * 9, 1));   // by the clock, so it fades the same at any frame rate
  let g = 0;
  if (p) {
    for (const o of objects) {
      if (o.dead || g >= chiGhosts.length) continue;
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
  held.aqua = held.pyro = null;
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
function selectElement(key, quiet) {
  if (selected === key && !quiet) { cycleForm(key); return; }
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
// Under the orbs: three switches.
//   CALM  creatures still move, but stop attacking. For practising moves.
//   READ  shows what the tracker thinks each hand is doing. For working out why a move will not fire.
//   NEW   back to wave one with a fresh room.
const options = { calm: false, read: false };
const SWITCHES = ['CALM', 'READ', 'NEW'];
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
  const on = i === 0 ? options.calm : i === 1 ? options.read : false;
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
  reticles[0].visible = reticles[1].visible = false;
  for (const set of [chargeOrbs, rockOrbs, windOrbs]) set[0].visible = set[1].visible = false;
  if (menuHand) {
    const pointer = menuHand === L ? R : L;
    let touching = -1;
    menuOrbs.forEach((orb, i) => {
      orb.position.copy(menuHand.palm)
        .addScaledVector(menuHand.normal, 0.06)
        .addScaledVector(menuHand.across, (i - 1.5) * 0.042);
      if (pointer.valid && pointer.hasTip && pointer.indexTip.distanceTo(orb.position) < 0.03) touching = i;
    });
    _off.subVectors(menuHand.wrist, menuHand.knuckle).normalize();          // toward the wrist: the second row sits below the orbs
    switchMeshes.forEach((sw, i) => {
      sw.position.copy(menuHand.palm).addScaledVector(menuHand.normal, 0.06).addScaledVector(_off, 0.042).addScaledVector(menuHand.across, (i - 1) * 0.046);
      sw.lookAt(viewerPos);
      if (pointer.valid && pointer.hasTip && pointer.indexTip.distanceTo(sw.position) < 0.022) touching = 4 + i;
    });
    // A poke counts once: the finger has to come off the orbs before it can pick again.
    // Poking the discipline you are already in steps it to its next sub-element.
    if (touching < 0) menuArmed = true;
    else if (menuArmed && t - lastMenuPick > 0.25) {
      menuArmed = false; lastMenuPick = t;
      if (touching >= 4) flipSwitch(touching - 4);
      else selectElement(ELEMENT_ORDER[touching]);        // picking the one you are in steps to its next sub-element
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

  for (const st of [L, R]) {
    if (!st.valid || st === menuHand) continue;
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
        if (selected === 'terra') {
          firePulse(hitPalm.point);
          hudNote = ELEMENTS.terra.sense.toLowerCase(); lastCast = 'terra'; drawHud();
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
    if (selected !== 'pyro') {
      if (isOpen && st.speed < 0.9) {                // an open hand reaching: show what it would take
        st.aim = findGrabTarget(selected, viewerPos, reachDir, t);
        st.aimT = t;
        showReticle(idx, st.aim, selected, viewerPos);
      } else if (isFist && st.aim && t - st.aimT < 0.35 && st.speed < 0.9 && reachNow >= CHARGE_REACH) {
        beginHold(st, selected, st.aim, viewerPos, t);
        st.hold.reach0 = reachNow || 1;
        st.aim = null; st.ready = false;
        continue;
      }
    }
    // Charging: a raised fist that stays closed builds the discipline's big throw; the next punch lets it go.
    // Pyro charges at any reach. The others charge with the fist drawn in toward you, so it cannot be mistaken for a grab.
    if (isFist && st.palm.y > viewerPos.y - 0.5 && (selected === 'pyro' || reachNow < CHARGE_REACH)) st.charge = Math.min(st.charge + dt, CHARGE_MAX);
    else if (!isFist) st.charge = 0;
    showCharge(idx, st.knuckle, st.charge, selected);

    // Held senses: Aqua reads through a raised open palm, Pyro through a raised fist.
    const raised = st.palm.y > viewerPos.y - 0.5;
    if (raised && st.stillT > HOLD_TIME) {
      if (selected === 'aqua' && isOpen && st.normal.dot(_fwd) > 0.5) held.aqua = { origin: viewerPos, dir: st.normal };
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
  if (selected === 'aqua' && lead) waterAnchor.copy(lead.palm).addScaledVector(lead.normal, -0.06).add(_off.set(0, 0.16, 0));
  waterAnchorOn = selected === 'aqua' && !!lead;

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
  if (squeezeBtn) squeezeBtn.style.display = g === 'grip' ? '' : 'none';
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

  if (previewGesture === 'charge') { previewAim.copy(aim); previewGrip.chargeFrom = t; return; }
  if (previewGesture === 'grip') {
    previewAim.copy(aim);
    if (selected === 'pyro') { previewGrip.chargeFrom = t; return; }
    const tgt = findGrabTarget(selected, eye, aim, t);
    if (tgt) beginHold(previewGrip, selected, tgt, eye, t);
    return;
  }
  if (previewGesture === 'sense') {
    if (selected === 'terra') { if (hit) firePulse(hit.point); }
    else if (selected === 'aero') senseAero(hand, t);
    else if (selected === 'aqua') { previewHold = { kind: 'aqua', until: t + 2.2, origin: hand, dir }; if (hit) addSource(hit.point, hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : UP, t); }
    else previewHold = { kind: 'pyro', until: t + 2.2, origin: eye };
    if (selected !== 'aero') { hudNote = ELEMENTS[selected].sense.toLowerCase(); drawHud(); }
    return;
  }
  const c = { hand, dir, eye, fwd, t, power: ev.shiftKey ? 1.6 : 1 };
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
const squeezeBtn = document.getElementById('squeeze');
renderer.domElement.addEventListener('pointermove', (ev) => {
  if (renderer.xr.isPresenting) return;
  pointer.set((ev.clientX / window.innerWidth) * 2 - 1, -(ev.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  previewAim.copy(raycaster.ray.direction);
});
const releasePreview = () => {
  if (renderer.xr.isPresenting) return;
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
window.addEventListener('keydown', (ev) => { if (ev.key.toLowerCase() === 'c') previewGrip.squeeze = true; });
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
  const i = '1234'.indexOf(ev.key);
  if (i >= 0) selectElement(ELEMENT_ORDER[i]);
  const g = 'qwertyuio'.indexOf(ev.key.toLowerCase());
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
    if (previewGesture === 'grip' || previewGesture === 'charge') {
      const hand = camera.position.clone().add(new THREE.Vector3(0.25, -0.3, -0.35).applyQuaternion(camera.quaternion));
      reticles[1].visible = chargeOrbs[1].visible = false;
      if (previewGrip.hold) {
        reticles[0].visible = false;
        updateHold(previewGrip, camera.position, previewAim, 1, { hand, squeeze: previewGrip.squeeze, squeezeEdge: previewGrip.squeeze && !previewGrip.prevSqueeze }, t, dt);
      } else if (selected !== 'pyro' && previewGesture === 'grip') showReticle(0, findGrabTarget(selected, camera.position, previewAim, t), selected, camera.position);
      else reticles[0].visible = false;
      showCharge(0, hand, previewGrip.chargeFrom >= 0 ? t - previewGrip.chargeFrom : 0, selected);
      previewGrip.prevSqueeze = previewGrip.squeeze;
    } else { reticles[0].visible = false; chargeOrbs[0].visible = rockOrbs[0].visible = windOrbs[0].visible = false; }
    if (previewHold) {
      if (t > previewHold.until) previewHold = null;
      else if (previewHold.kind === 'aqua') held.aqua = { origin: camera.position, dir: previewHold.dir };
      else held.pyro = { centre: previewHold.origin };
    }
  }

  if (!renderer.xr.isPresenting) {
    waterAnchorOn = selected === 'aqua';
    waterAnchor.copy(camera.position).add(_off.set(0.3, -0.18, -0.45).applyQuaternion(camera.quaternion));
  }
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

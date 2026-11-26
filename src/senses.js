import * as THREE from 'three';
import { KINDS, HOLD_REVEAL, TIDE_SENSE, DRAFT_SENSE, ELEMENTS, FIST_SENSE } from './data.js?v=15';
import { play, SFX, castSound } from './audio.js?v=15';
import { ST, LATE } from './state.js?v=15';
import { scene } from './renderer.js?v=15';
import { pulseUniforms } from './pulse.js?v=15';
import { collide, nearestRoomSurface, lineOfSight } from './collision.js?v=15';
import { echoes, glowMat, roomBounds, reveal } from './echoes.js?v=15';
import { AI, HOSTILE } from './creatures.js?v=15';
import { particles, PCOL } from './visuals.js?v=15';
import { addEffect } from './effects.js?v=15';
import { MAX_OBJECTS, objects } from './objects.js?v=15';
import { _cp } from './shaping.js?v=15';

// ---------- senses ----------
// Each one fills the whole room and tells you something different.
//   Tremor (Terra): a ripple through every surface from where you touched. Shows where things are, once.
//   Draft  (Aero):  the room's air, for several seconds. Shows whatever is moving, and the trail it leaves.
//   Chi    (Pyro):  heat and life, through walls, for as long as you hold it. Shows health, and which objects are hot.
//   Tide   (Aqua):  water across the whole floor, for as long as you hold it. Shows where everything stands, by its ripples.
ST.draftUntil = -1;
// Flora feels through what grows along every surface: anything close to a wall, the floor or furniture shows, and holds still a moment.
export function rootSense(point, t) {
  for (const e of echoes) {
    if (e.down || e.airborne) continue;
    const s = nearestRoomSurface(e.group.position, 0.9);
    if (s || e.group.position.y < 0.9) { reveal(e, t, 7, ELEMENTS.flora.color); }
  }
}
export function senseAero(centre, t) {
  play(SFX.aero.sense);
  ST.hudNote = ELEMENTS.aero.sense.toLowerCase(); ST.lastCast = 'aero'; LATE.drawHud();
  castSound.aero();
  ST.draftUntil = t + DRAFT_SENSE.lasts;
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
  if (t > ST.draftUntil) return;
  const fade = Math.min((ST.draftUntil - t) / 1.5, 1);
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
export const tideUniforms = {
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
export const chiGhosts = Array.from({ length: MAX_OBJECTS }, () => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), glowMat(new THREE.Color(0xff3a0a), 0));
  m.visible = false; m.renderOrder = 9;
  scene.add(m);
  return m;
});
const CHI_COOL = new THREE.Color(0x8a1a05), CHI_HOT = new THREE.Color(0xffc24a);

export const held = { aqua: null, pyro: null, lumen: null };   // set each frame by whoever is holding a sense
const _amb = new THREE.Color();

const SENSE_TINT = { necro: [0.02, 0.1, 0.07], pyro: [0.16, 0.045, 0.01], gravis: [0.06, 0.03, 0.15], morph: [0.16, 0.02, 0.04], umbra: [0.05, 0.0, 0.1], lumen: [0.15, 0.14, 0.1], astra: [0.05, 0.07, 0.16] };
let senseWas = null;
export function updateHeldSenses(t, heldDt = 0.016) {
  const sensing = held.pyro || held.aqua || held.lumen ? ST.selected : null;      // the note a held sense opens on
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
    const tint = SENSE_TINT[ST.selected] || SENSE_TINT.pyro;
    _amb.setRGB(tint[0], tint[1], tint[2]);
    for (const e of echoes) {
      if (e.down) continue;
      if (ST.selected === 'pyro' && (e.frozenUntil > t || (AI.kinds && KINDS[e.kind] && KINDS[e.kind].cold))) continue;          // ice gives off no heat: Chi cannot find what is frozen
      reveal(e, t, HOLD_REVEAL, ELEMENTS[FIST_SENSE[ST.selected] ? ST.selected : 'pyro'].color);
      if (ST.selected === 'umbra') e.blindUntil = Math.max(e.blindUntil, t + 0.4);   // while you hold the dark, nothing can see you
    }
  }
  // Glint: light shows everything it can reach, in full, and nothing it cannot.
  if (held.lumen) {
    const tint = SENSE_TINT[ST.selected] || SENSE_TINT.lumen;
    _amb.setRGB(tint[0], tint[1], tint[2]);
    if (ST.selected === 'astra') {                      // from straight overhead: whatever has open sky above it
      for (const e of echoes) if (!e.down && !collide(e.group.position, _cp.copy(e.group.position).setY(e.group.position.y + 1.2))) reveal(e, t, HOLD_REVEAL * 2, ELEMENTS.astra.color);
    } else for (const e of echoes) if (!e.down && lineOfSight(held.lumen.origin, e.group.position)) { reveal(e, t, HOLD_REVEAL * 2, ELEMENTS.lumen.color); e.exposedUntil = Math.max(e.exposedUntil, t + 2); }
  }
  pulseUniforms.uAmbient.value.lerp(_amb, Math.min(heldDt * 9, 1));   // by the clock, so it fades the same at any frame rate
  let g = 0;
  if (p && (ST.selected === 'pyro' || ST.selected === 'gravis')) {
    for (const o of objects) {
      if (o.dead || g >= chiGhosts.length || (ST.selected === 'pyro' && o.def.ice)) continue;
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
  if ((a || p) && ST.hudNote !== ELEMENTS[ST.selected].sense.toLowerCase()) {
    ST.hudNote = ELEMENTS[ST.selected].sense.toLowerCase(); ST.lastCast = ST.selected; LATE.drawHud();
  }
  held.aqua = held.pyro = held.lumen = null;
}


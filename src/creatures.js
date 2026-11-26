import * as THREE from 'three';
import { PULSE_SPEED, PULSE_LIFE, KINDS, REVEAL_TIME, ACID, ELEMENTS } from './data.js?v=17';
import { play, SFX, tone, thump } from './audio.js?v=17';
import { ST, LATE } from './state.js?v=17';
import { scene, UP, ZERO } from './renderer.js?v=17';
import { pulseUniforms } from './pulse.js?v=17';
import { collide, lineOfSight } from './collision.js?v=17';
import { echoes, ICE, STEEL_TINT, roomBounds, isOpen, scatterEchoes, isLive, reveal, hit } from './echoes.js?v=17';

// ---------- creature behaviour ----------
// They drift around the room out of sight, and every few seconds one of them stops, swells, and spits a shard at you.
// The shard is a real object: block it with a wall, knock it away, blow it back, or catch it and return it.
export const CREATURE = { speed: 0.7, firstAttack: 7, attackEvery: 4.2, windup: 0.9, shotSpeed: 3.2, sight: 11, maxShots: 2 };
export const AI = { on: true, attacks: true, kinds: true };   // attacks off = calm mode; kinds off = every creature the same
export const HOSTILE = new THREE.Color(0xff2bd6);
export const MAX_HP = 5;
ST.playerHP = MAX_HP; let hurtT = -9; ST.nextAttackAt = 0;

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
      LATE.particles.emit(_cprobe, _cdir.multiplyScalar(-3), HOSTILE, 0.02, 0.1, 0, 0);
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
export function spit(e, eye, t) {
  if (LATE.decoy && LATE.decoy.until > t) eye = LATE.decoy.pos;      // it thinks the shadow is you
  const dir = eye.clone().sub(e.home).normalize();
  const o = LATE.spawnObject('shard', e.home.clone().addScaledVector(dir, 0.3));
  o.hostile = true; o.owner = e; o.born = t;
  const K = KINDS[e.kind] || KINDS.plain;
  o.heavy = !!K.heavy;
  o.vel.copy(dir).multiplyScalar(K.shot * (1 + 0.05 * (ST.wave - 1)));
  tone(700, 240, 0.25, 0.14, 'sawtooth');
}
// Each frame: choose who attacks next.
function directAttacks(t, eye) {
  if (!AI.on || !AI.attacks || t < ST.nextAttackAt) return;
  if (LATE.objects.filter(o => o.hostile && !o.dead).length >= (ST.wave >= 4 ? 3 : CREATURE.maxShots)) return;
  const able = echoes.filter(e => !e.down && e.windup < 0 && !(e.frozenUntil > t) && !(e.blindUntil > t) && !e.airborne && !e.puppet
    && e.home.distanceTo(eye) < CREATURE.sight && lineOfSight(e.home, eye));
  ST.nextAttackAt = t + Math.max(CREATURE.attackEvery - 0.3 * (ST.wave - 1), 2) * (0.7 + Math.random() * 0.6);
  if (!able.length) return;
  const e = able[(Math.random() * able.length) | 0];
  e.windup = t + CREATURE.windup;
  reveal(e, t, 3, HOSTILE);                         // attacking gives its position away
}
export function playerHurt(t) {
  if (t - hurtT < 0.6) return;
  if (LATE.guard.on || t < ST.armourUntil) { hurtT = t; play(SFX.guardHit); ST.hudNote = LATE.guard.on ? 'guarded' : 'armour held'; LATE.drawHud(); return; }
  hurtT = t;
  ST.playerHP--;
  tone(110, 50, 0.4, 0.5, 'square');
  ST.hudNote = ST.playerHP > 0 ? 'you were hit' : 'down. new round';
  if (ST.playerHP <= 0) ST.respawnAt = t + 1.8;
  LATE.drawHud();
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
      if (fast) { ST.hudNote = 'wall slam'; hit(e, 'terra', t, ZERO, { damage: 1 }); }    // thrown into the room itself
    }
    else {
      e.home.x += e.vel.x * dt; e.home.z += e.vel.z * dt;
      const k = Math.max(1 - 4 * dt, 0);
      e.vel.x *= k; e.vel.z *= k;
      if (Math.abs(e.vel.x) + Math.abs(e.vel.z) < 0.05) e.vel.x = e.vel.z = 0;
    }
  }
}

export function updateEchoes(t, dt, viewerPos) {
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
    if (e.dropAt > 0 && t >= e.dropAt) { e.dropAt = -1; thump(); LATE.puff('gravis', e.group.position, 20, 2.5, {}); hit(e, 'gravis', t, UP, { damage: 2, kind: 'void' }); if (e.down) continue; }
    if (e.seedAt > 0 && t >= e.seedAt) {             // the seed comes up: it and everything beside it are rooted
      e.seedAt = -1;
      const at = e.group.position.clone();
      LATE.puff('flora', at, 40, 2.4, { up: 1.5 });
      for (const o of echoes) if (!o.down && o.group.position.distanceTo(at) < 1.4) hit(o, 'flora', t, UP, { damage: 1 });
      if (e.down) continue;
    }
    if (e.rootedUntil > t && Math.random() < 0.3) LATE.puff('flora', e.group.position, 1, 0.4, { up: 0.5 });
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
      if (burning && Math.random() < 0.7) LATE.puff('pyro', e.group.position, 1, 0.5, { up: 1.2, jitter: 0.08 });
      if (soaked && !frozen && Math.random() < 0.3) LATE.puff('aqua', e.group.position, 1, 0.25, { jitter: 0.1 });
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
  if (ST.respawnAt > 0 && t > ST.respawnAt) {
    ST.respawnAt = -1;
    if (ST.playerHP <= 0) { ST.wave = 1; scatterEchoes(); }           // down: start over
    else { ST.wave++; scatterEchoes(true); }                         // cleared: next wave, same room
  }
}

// Revealed echo closest to a direction, within maxAngle radians. Null if none.
export const _to = new THREE.Vector3();
export function aimAssist(origin, dir, maxAngle, t) {
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
export function segmentDistance(p, a, b) {
  _ab.subVectors(b, a); _ap.subVectors(p, a);
  const len2 = _ab.lengthSq();
  const k = len2 > 0 ? THREE.MathUtils.clamp(_ap.dot(_ab) / len2, 0, 1) : 0;
  return _ap.addScaledVector(_ab, -k).length();
}

export function flat(v, fallback) {
  const out = new THREE.Vector3(v.x, 0, v.z);
  if (out.lengthSq() < 1e-4) out.copy(fallback || new THREE.Vector3(0, 0, -1));
  return out.normalize();
}

// Reached from modules that load before this one.
Object.assign(LATE, { CREATURE, AI, MAX_HP });

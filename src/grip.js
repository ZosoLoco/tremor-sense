import * as THREE from 'three';
import { ACID, ELEMENTS } from './data.js?v=17';
import { moveSound } from './audio.js?v=17';
import { ST, LATE } from './state.js?v=17';
import { scene, UP, ZERO, now } from './renderer.js?v=17';
import { FIRE_LIGHT, VOLT_LIGHT, lightNow, firePulse } from './pulse.js?v=17';
import { collide, lineOfSight } from './collision.js?v=17';
import { echoes, glowMat, isLive, hit } from './echoes.js?v=17';
import { ENERGY, energyMat, stoneMat, craggy, puff } from './visuals.js?v=17';
import { impact } from './effects.js?v=17';
import { cast } from './flourish.js?v=17';
import { HEAT_TIME, GRIP, objects, spawnObject, spawnCloud, turn, crushObject } from './objects.js?v=17';
import { makeWrap, updateWrap, dropHold } from './water.js?v=17';

// ---------- grip: holding on to something ----------
// Aero holds objects (and can crush them with the other fist). Aqua holds echoes, the water in them.
// Terra holds stone and steel, or tears a fresh boulder out of the floor. Pyro's version is a charged fireball.
const _ga = new THREE.Vector3();
export function findGrabTarget(key, eye, dir, t) {
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
export function beginHold(g, key, target, eye, t) {
  let type = target.type, obj = target.obj || null;
  if (type === 'ground') {
    const out = target.pos.clone().addScaledVector(target.normal || UP, 0.24);
    if (ST.terraForm === 'sand') obj = spawnCloud('sand', out.addScaledVector(target.normal || UP, 0.4), t, 14);    // a cloud of it, to carry
    else obj = spawnObject(ST.terraForm === 'metal' ? 'anvil' : 'stone', out);
    if (ST.terraForm === 'lava') obj.heat = t + HEAT_TIME;
    puff('terra', target.pos, 40, 2.6, { dir: target.normal || UP, spread: 0.9, jitter: 0.25 });
    firePulse(target.pos);
    type = 'object';
  }
  if (obj) { obj.held = true; obj.rest = false; turn(obj); }
  if (target.e) target.e.puppet = true;
  g.hold = { key, type, obj, e: target.e || null, dist: (obj ? obj.pos : target.pos).distanceTo(eye),
    pv: new THREE.Vector3(), lastSlam: -9, lastWring: -9, reach0: 1,
    wrap: key === 'aero' || key === 'aqua' ? makeWrap(key) : null };
  ST.lastCast = key; moveSound(key, 'grip');
  LATE.noteGesture(`grip > ${GRIP[key]}`);
  ST.hudNote = GRIP[key].toLowerCase(); LATE.drawHud();
}
const _want = new THREE.Vector3(), _hstep = new THREE.Vector3(), _hnext = new THREE.Vector3(), _thread = new THREE.Vector3();
// eye + dir is where the hand points from; reach is how far the arm is out compared with when it grabbed.
// input: { hand: Vector3, squeeze: other fist held, squeezeEdge: other fist just closed }
export function updateHold(g, eye, dir, reach, input, t, dt) {
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
      if (input.squeezeEdge) { crushObject(o, t); dropHold(g); ST.hudNote = 'crush'; LATE.drawHud(); }
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
      ST.hudNote = 'slam'; hit(e, 'aqua', t, ZERO, { damage: 1 });
    }
  } else e.home.add(_hstep);
  e.restY = e.home.y; e.airborne = false; e.vel.set(0, 0, 0);
  if (speed > 2 && t - h.lastSlam > 0.5) {
    for (const o2 of echoes) {
      if (o2 === e || !isLive(o2, t) || o2.group.position.distanceTo(e.home) > 0.24) continue;
      h.lastSlam = t;
      ST.hudNote = 'slam';
      hit(o2, 'aqua', t, h.pv.clone().normalize(), { damage: 1 });
      hit(e, 'aqua', t, ZERO, { damage: 1 });
      break;
    }
  }
  if (!e.down && input.squeeze && t - h.lastWring > 0.6) {  // the other fist closes: wring it out
    h.lastWring = t;
    hit(e, 'aqua', t, ZERO, { damage: 1 });
    ST.hudNote = 'wring'; LATE.drawHud();
  }
  if (e.down) dropHold(g);
}
export function endHold(g) {
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
export const reticles = [0, 1].map(() => {
  const r = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.255, 44), glowMat(ACID, 0.8));
  r.visible = false; r.renderOrder = 22;
  scene.add(r);
  return r;
});
export function showReticle(i, target, key, eye) {
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
export const hideOrbs = (i) => { chargeOrbs[i].visible = rockOrbs[i].visible = windOrbs[i].visible = false; for (const k in extraOrbs) extraOrbs[k][i].visible = false; };
export const CHARGE_MIN = 0.6, CHARGE_MAX = 1.6, CHARGE_REACH = 0.45;   // a fist closer to you than this charges; further out, it grabs
ST.waterBoost = null;                            // where a charging Aqua fist is, while it is charging
export function showCharge(i, pos, charge, key = 'pyro') {
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
  if (key === 'aqua' && charge > 0.1) ST.waterBoost = pos;
  chargeOrbs[i].visible = false; for (const k in extraOrbs) extraOrbs[k][i].visible = false;
  const g = extraOrbs[key] ? extraOrbs[key][i] : chargeOrbs[i];
  g.visible = (key === 'pyro' || !!extraOrbs[key]) && charge > 0.2;
  if (!g.visible) return;
  g.position.copy(pos);
  g.scale.setScalar(0.03 + 0.06 * Math.min(charge / CHARGE_MAX, 1));
  if (charge > CHARGE_MIN && Math.random() < 0.5) puff(key, pos, 1, 0.6, { up: 1 });
  if (key === 'pyro' || key === 'lumen' || key === 'astra') lightNow(pos, key === 'pyro' ? FIRE_LIGHT : VOLT_LIGHT, 0.5 * Math.min(charge / CHARGE_MAX, 1));
}
export function throwCharged(key, hand, dir, eye, fwd, charge, t) {
  cast(key, 'charge', { hand, dir, eye, fwd, t, scale: 1 + Math.min(charge, CHARGE_MAX) * (key === 'pyro' ? 1 : 0.6) });
}
export const throwFireball = (hand, dir, eye, fwd, charge, t) => throwCharged('pyro', hand, dir, eye, fwd, charge, t);


import * as THREE from 'three';
import { ELEMENTS, forms, CURL_OPEN } from './data.js?v=17';
import { play, SFX, tone, castSound, thump } from './audio.js?v=17';
import { ST, LATE } from './state.js?v=17';
import { formOf } from './core.js?v=17';
import { scene, UP, camera, renderer } from './renderer.js?v=17';
import { VOLT_LIGHT, lightNow, FIRE_LIGHT } from './pulse.js?v=17';
import { echoes, glowMat, isLive, reveal, hit } from './echoes.js?v=17';
import { segmentDistance } from './creatures.js?v=17';
import { energyMat, particles, PCOL, puff, earthMat } from './visuals.js?v=17';
import { addEffect, castBolt, zap } from './effects.js?v=17';
import { cast } from './flourish.js?v=17';
import { nearestRoomSurface, lineOfSight } from './collision.js?v=17';
import { objects, sendBack, turn } from './objects.js?v=17';
import { sources } from './water.js?v=17';

// ---------- hand constructs ----------
// Lumen's sweep leaves a blade of light in the hand that made it, for ten seconds. Swing it and it cuts; swing it fast
// and it still throws its crescent; hold it in the way of a shard and the shard goes back.
export const blades = [];
// Every discipline has a weapon it can put in your hand, and no two are the same kind of thing.
// Lumen's is its sweep; for the rest, draw a V with a pinch. What each one is, and how it is used:
//   pyro   sword     cuts, and a hard swing throws an arc of fire off the edge
//   lumen  blade     cuts, and turns back anything thrown that touches it
//   terra  hammer    slow and heavy: sends what it hits flying; bring the head down on any surface and the surface answers
//   aero   chakram   you do not hit with it: swing and it leaves your hand, cuts a line through the room, and comes back
//   gravis mace      everything near the head is dragged toward it while you swing; when it lands, it lands hard
//   flora  whip      long, and the tip lags behind your hand: it cracks where your hand was pointing a moment ago, and roots
//   astra  staff     never touches anything: hold it pointed at a creature and it calls a star down the line, again and again
//   umbra  scythe    a wide reaping stroke: one swing takes everything round you, and drains it
//   necro  spear     only a thrust counts: drive it forward and it runs through everything in a line twice its length
export const WEAPON = { pyro: 'fire sword', terra: 'hammer', aero: 'chakram', lumen: 'blade of light', gravis: 'mace', flora: 'thorn whip', astra: 'star staff', umbra: 'scythe', necro: 'bone spear' };
const KINDOF = { pyro: 'sword', lumen: 'sword', terra: 'hammer', aero: 'chakram', gravis: 'mace', flora: 'whip', astra: 'staff', umbra: 'scythe', necro: 'spear' };
const REACH = { sword: 0.95, hammer: 0.7, chakram: 0.3, mace: 0.8, whip: 2.2, staff: 1.3, scythe: 1.25, spear: 1.6 };
function buildWeapon(key, kind) {
  const g = new THREE.Group(), basic = (hex, o = {}) => new THREE.MeshBasicMaterial({ color: hex, ...o }), L = REACH[kind];
  const rod = (r0, r1, len, mat, y = 0, seg = 6) => new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, seg, 6).translate(0, y + len / 2, 0), mat);
  if (kind === 'sword' && key === 'lumen') g.add(rod(0.006, 0.012, L, basic(0xffffff)), rod(0.012, 0.03, L, energyMat('lumen', { scale: [20, 4, 20], flow: [0, 2.5, 0], cut: 0.15 }), 0, 8));
  else if (kind === 'sword') {                      // a real sword: guard, a flat blade, fire running up it
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.03).translate(0, 0.02, 0), basic(0x3a2a20)));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.045, L - 0.12, 0.008).translate(0, 0.02 + (L - 0.12) / 2, 0), basic(0xffe9c0)));
    g.add(new THREE.Mesh(new THREE.ConeGeometry(0.0225, 0.1, 4).scale(1, 1, 0.2).translate(0, L - 0.05, 0), basic(0xffe9c0)));
    g.add(rod(0.03, 0.06, L, energyMat('pyro', { scale: [12, 4, 12], flow: [0, 3.5, 0], cut: 0.42 }), 0.03, 10));
  } else if (kind === 'hammer') {
    const form = formOf('terra');
    g.add(rod(0.016, 0.02, L, basic(0x4a3b2c)));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.17, 0.17, 3, 2, 2).translate(0, L, 0), earthMat(form)));
    for (const side of [1, -1]) g.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.2).translate(side * 0.15, L, 0), basic(0x2c2622)));
  } else if (kind === 'chakram') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 40), basic(0xeaf7ff));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; ring.add(new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 3).rotateZ(-a - Math.PI / 2).translate(Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0), basic(0xffffff))); }
    ring.add(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 40), energyMat('aero', { scale: [20, 20, 6], flow: [3, 0, 0], cut: 0.45 })));
    ring.position.y = 0.2; ring.userData.spin = 14; g.add(ring);
  } else if (kind === 'mace') {
    g.add(rod(0.014, 0.018, L, basic(0x1a1024)));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12).translate(0, L, 0), basic(0x05020c)));
    for (let i = 0; i < 3; i++) { const band = new THREE.Mesh(new THREE.TorusGeometry(0.14 + i * 0.03, 0.006, 5, 36), glowMat(new THREE.Color(0xb48cff), 0.9)); band.position.y = L; band.rotation.set(i * 1.1, i * 0.7, 0); band.userData.spin = 5 - i * 3; g.add(band); }
  } else if (kind === 'whip') {                     // the handle only: the lash is drawn separately, because it bends
    g.add(rod(0.016, 0.02, 0.16, basic(0x7a5230)));
  } else if (kind === 'staff') {
    g.add(rod(0.012, 0.012, L + 0.5, basic(0xdfe6ff), -0.5));
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), basic(0xffffff)); star.position.y = L; star.userData.spin = 3;
    for (let i = 0; i < 4; i++) star.add(new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.13, 4).translate(0, 0.11, 0).rotateZ(i * Math.PI / 2), glowMat(new THREE.Color(0xc9d6ff), 0.9)));
    g.add(star, new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.005, 5, 30).rotateX(Math.PI / 2).translate(0, L - 0.12, 0), glowMat(new THREE.Color(0x9fb8ff), 0.8)));
  } else if (kind === 'scythe') {
    g.add(rod(0.013, 0.016, L + 0.3, basic(0x0a0610), -0.3));
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, L, 0), new THREE.Vector3(0.38, L + 0.16, 0), new THREE.Vector3(0.62, L - 0.22, 0));
    const edge = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.022, 4, false).scale(1, 1, 0.2), basic(0x000000));
    g.add(edge, new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.05, 6, false).scale(1, 1, 0.5), energyMat('umbra', { scale: [10, 10, 10], cut: 0.3 })));
  } else {                                          // spear
    g.add(rod(0.011, 0.013, L - 0.2, basic(0xeafff4)));
    g.add(new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.26, 4).scale(1, 1, 0.3).translate(0, L - 0.08, 0), basic(0xffffff)));
    for (const side of [1, -1]) g.add(new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.1, 3).rotateZ(side * 2.2).translate(side * 0.035, L - 0.24, 0), basic(0xeafff4)));
  }
  return g;
}
export function summonBlade(st, t, key = 'lumen') {
  let b = blades.find(x => x.st === st);
  if (b && b.key === key) { b.until = t + 14; return b; }
  if (b) b.until = 0;
  const kind = KINDOF[key] || 'sword';
  const g = buildWeapon(key, kind);
  g.renderOrder = 16; scene.add(g);
  b = { st, g, key, kind, until: t + 14, born: t, len: REACH[kind], tip: new THREE.Vector3(), prev: new THREE.Vector3(), lag: new THREE.Vector3(), hand0: new THREE.Vector3(), struck: new Map(), first: true, cool: 0, away: -1, lash: null };
  if (kind === 'whip') { b.lash = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0x3d8a22 })); b.lash.frustumCulled = false; scene.add(b.lash); }
  blades.push(b);
  if (key === 'lumen') play(SFX.blade); else { castSound[key](); tone(300, 900, 0.18, 0.1, 'triangle'); }
  ST.hudNote = WEAPON[key] || 'blade'; ST.lastCast = key;
  return b;
}
const _bd = new THREE.Vector3(), _bs = new THREE.Vector3(), _bh = new THREE.Vector3();
const strike = (b, e, t, dir, m, gap = 0.5) => { if (!isLive(e, t) || t - (b.struck.get(e) || -9) < gap) return false; b.struck.set(e, t); hit(e, b.key, t, dir, m); return true; };
export function updateBlades(t, dt) {
  for (let i = blades.length - 1; i >= 0; i--) {
    const b = blades[i], st = b.st, kind = b.kind;
    if (t > b.until || ST.selected !== b.key) { scene.remove(b.g); if (b.lash) { scene.remove(b.lash); b.lash.geometry.dispose(); } b.g.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); blades.splice(i, 1); continue; }
    b.g.visible = !!st.valid && !(b.away > t);
    if (b.lash) b.lash.visible = !!st.valid;
    if (!st.valid) continue;
    _bd.copy(st.across).negate().normalize();          // out of the thumb side of the fist, the way anything with a handle is held
    const grow = Math.min((t - b.born) / 0.15, 1) * Math.min((b.until - t) / 0.4, 1), len = b.len * grow;
    b.g.position.copy(st.palm);
    b.g.quaternion.setFromUnitVectors(UP, _bd);
    b.g.scale.setScalar(Math.max(grow, 0.01));
    b.g.traverse(c => { if (c.userData.spin) c.rotation.z += dt * c.userData.spin; });
    b.tip.copy(st.palm).addScaledVector(_bd, len);
    if (b.first) { b.prev.copy(b.tip); b.lag.copy(b.tip); b.hand0.copy(st.palm); b.first = false; }
    const speed = b.tip.distanceTo(b.prev) / Math.max(dt, 1e-3);
    _bs.subVectors(b.tip, b.prev).normalize();        // which way the business end is moving
    _bh.subVectors(st.palm, b.hand0).divideScalar(Math.max(dt, 1e-3));   // and the hand itself
    if (kind === 'sword') {
      if (b.key === 'pyro') lightNow(b.tip, FIRE_LIGHT, 0.6); else lightNow(b.tip, VOLT_LIGHT, 0.5);
      if (speed > 1.6) for (const e of echoes) if ((segmentDistance(e.group.position, st.palm, b.tip) < 0.3 || segmentDistance(e.group.position, b.prev, b.tip) < 0.3) && strike(b, e, t, _bs, { damage: 2, kind: 'whip', shadow: b.key === 'lumen' && forms.lumen === 'shadow' })) tone(2093, 1568, 0.12, 0.12, 'triangle');
      if (b.key === 'pyro' && speed > 4.2 && t > b.cool) {                 // the arc comes off the edge
        b.cool = t + 0.7;
        castBolt('pyro', { name: 'Fire Arc', kind: 'bolt', speed: 10, radius: 0.4, shape: 'crescent', size: 0.35, pierce: true, life: 0.7 }, { hand: b.tip.clone(), dir: _bs.clone(), eye: LATE.viewerPos.clone(), fwd: _bs.clone().setY(0).normalize(), t, scale: 1 });
        play(SFX.pyro.sweep);
      }
      for (const o of objects) if (!o.dead && o.hostile && segmentDistance(o.pos, st.palm, b.tip) < 0.3) { turn(o); sendBack(o, 11); tone(2637, 2637, 0.1, 0.1, 'triangle'); ST.hudNote = 'parried'; ST.lastCast = b.key; LATE.drawHud(); }
    } else if (kind === 'hammer') {
      const form = formOf('terra');
      if (speed > 1.4) for (const e of echoes) if (e.group.position.distanceTo(b.tip) < 0.38 && strike(b, e, t, _bs, { damage: 3, kind: 'whip', launch: true, form: form !== 'rock' ? form : undefined }, 0.8)) { thump(); e.vel.x += _bs.x * 4; e.vel.z += _bs.z * 4; }
      const s = speed > 2.2 && t > b.cool ? nearestRoomSurface(b.tip, 0.16) : null;
      if (s && _bs.dot(s.normal) < -0.3) {            // the head came down on something
        b.cool = t + 1.2;
        cast('terra', 'slam', { hand: b.tip.clone(), dir: _bs.clone(), eye: LATE.viewerPos.clone(), fwd: LATE._fwd.clone(), ground: s.point.clone(), normal: s.normal.clone(), t });
      }
    } else if (kind === 'chakram') {
      if (speed > 3.4 && t > b.cool && !(b.away > t)) {
        b.cool = t + 1.9; b.away = t + 1.7;
        castBolt('aero', { name: 'Chakram', kind: 'bolt', speed: 12, radius: 0.35, shape: 'vortex', pierce: true, boomerang: true, damage: 2, life: 0.75 }, { hand: b.tip.clone(), dir: _bs.clone(), eye: LATE.viewerPos.clone(), fwd: _bs.clone().setY(0).normalize(), t, scale: 0.6 });
        play(SFX.aero.sweep); ST.hudNote = 'chakram out'; LATE.drawHud();
      }
    } else if (kind === 'mace') {
      if (speed > 0.6) for (const e of echoes) {       // the head is heavy enough to have its own pull
        if (e.down) continue;
        const d = e.group.position.distanceTo(b.tip);
        if (d < 1.4 && d > 0.25) { e.vel.x += (b.tip.x - e.group.position.x) / d * 7 * dt; e.vel.z += (b.tip.z - e.group.position.z) / d * 7 * dt; reveal(e, t, 0.6, ELEMENTS.gravis.color); }
      }
      if (speed > 1.4) for (const e of echoes) if (e.group.position.distanceTo(b.tip) < 0.36 && strike(b, e, t, _bs, { damage: 3, kind: 'whip', crush: true }, 1.0)) thump();
    } else if (kind === 'whip') {
      b.lag.lerp(b.tip, Math.min(dt * 7, 1));         // the tip is always catching up
      const lagSpeed = b.lag.distanceTo(b.prevLag || b.lag) / Math.max(dt, 1e-3);
      const mid = st.palm.clone().lerp(b.tip, 0.45).lerp(b.lag, 0.35);
      b.lash.geometry.dispose();
      b.lash.geometry = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(st.palm.clone().addScaledVector(_bd, 0.14), mid, b.lag.clone()), 18, 0.009, 4, false);
      if (lagSpeed > 2.6) for (const e of echoes) if ((e.group.position.distanceTo(b.lag) < 0.4 || segmentDistance(e.group.position, mid, b.lag) < 0.3) && strike(b, e, t, _bs, { damage: 1, kind: 'whip', bleed: forms.flora === 'thorn', spore: forms.flora === 'spore' })) { tone(1500, 300, 0.07, 0.2, 'triangle'); puff('flora', b.lag, 10, 2, {}); }
      (b.prevLag || (b.prevLag = new THREE.Vector3())).copy(b.lag);
    } else if (kind === 'staff') {
      lightNow(b.tip, VOLT_LIGHT, 0.4);
      if (t > b.cool) {
        let prey = null, best = 0.22;
        for (const e of echoes) { if (!isLive(e, t)) continue; const a = _bs.copy(e.group.position).sub(b.tip).angleTo(_bd); if (a < best && lineOfSight(b.tip, e.group.position)) { best = a; prey = e; } }
        if (prey) {
          b.cool = t + 0.75;
          const at = prey.group.position.clone(), top = at.clone().setY(at.y + 2.2);
          zap(b.tip.clone(), top, t);
          castBolt('astra', { name: 'Star', kind: 'bolt', speed: 12, radius: 0.3, shape: 'orb', size: 0.05, blast: 0.5, life: 1.2, shadow: forms.astra === 'night', volt: forms.astra === 'storm', rain: forms.astra === 'storm' }, { hand: top, dir: at.sub(top).normalize(), eye: LATE.viewerPos.clone(), fwd: _bd.clone().setY(0).normalize(), t, scale: 1 });
          tone(1760, 2640, 0.12, 0.08, 'triangle');
        }
      }
    } else if (kind === 'scythe') {
      if (speed > 3 && t > b.cool) {                  // one stroke, everything in reach
        b.cool = t + 0.6; let n = 0;
        for (const e of echoes) if (e.group.position.distanceTo(st.palm) < 1.6 && Math.abs(e.group.position.y - b.tip.y) < 0.7 && strike(b, e, t, _bs, { damage: 2, kind: 'whip', fear: forms.umbra === 'fear', hollow: forms.umbra === 'hollow' }, 0.4)) n++;
        const arc = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.05, 4, 40, Math.PI * 1.4).rotateX(Math.PI / 2), energyMat('umbra', { scale: [3, 3, 3], cut: 0.2 }));
        arc.position.copy(st.palm).setY(b.tip.y); arc.rotation.y = Math.atan2(-_bs.z, _bs.x) - 2.2;
        addEffect([arc], (n2) => { arc.material.opacity = Math.max(1 - (n2 - t) / 0.3, 0); arc.rotation.y += 0.25; return n2 - t < 0.3; });
        play(SFX.umbra.sweep); if (n) { ST.hudNote = `reaped ${n}`; ST.lastCast = 'umbra'; LATE.drawHud(); }
      }
    } else {                                          // spear: the hand has to drive along the shaft
      if (_bh.dot(_bd) > 1.7 && t > b.cool) {
        b.cool = t + 0.5;
        const far = st.palm.clone().addScaledVector(_bd, b.len * 2);
        let n = 0;
        for (const e of echoes) if (segmentDistance(e.group.position, st.palm, far) < 0.3 && strike(b, e, t, _bd, { damage: 3, kind: 'whip', venom: forms.necro === 'plague' }, 0.3)) n++;
        const flash = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.03, b.len * 2, 5).translate(0, b.len, 0), glowMat(new THREE.Color(0x6cf0c2), 0.8));
        flash.position.copy(st.palm); flash.quaternion.setFromUnitVectors(UP, _bd);
        addEffect([flash], (n2) => { flash.material.opacity = Math.max(0.8 - (n2 - t) * 4, 0); return n2 - t < 0.2; });
        play(SFX.lance);
      }
    }
    if (kind !== 'sword') for (const o of objects) if (!o.dead && o.hostile && (kind === 'staff' || kind === 'chakram' ? false : segmentDistance(o.pos, st.palm, b.tip) < 0.3)) { turn(o); sendBack(o, 10); tone(900, 700, 0.08, 0.1, 'triangle'); }
    if (Math.random() < 0.25) puff(b.key, b.tip, 1, 0.3, {});
    b.prev.copy(b.tip); b.hand0.copy(st.palm);
  }
}
// Umbra does not see things. It sees where things are not: every creature is a hole in the room, always, through anything.
// No colour, no kind, no health. Just the absence.
export const voids = [];
export function updateVoids(t) {
  const on = ST.selected === 'umbra';
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
    v.children[1].lookAt(LATE.viewerPos);
  });
}
// Water you have put on a ceiling rains: what stands under it is soaked.
export function rain(t) {
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
    if (Math.random() < 0.6) particles.emit(_bd.copy(sc.pos).add(LATE._np.set((Math.random() - 0.5) * 0.7, 0, (Math.random() - 0.5) * 0.7)), LATE._nt.set(0, -2.5, 0), PCOL.aqua[1], 0.014, 0.9, 6, 0);
    if (t - (sc.rainT || 0) < 0.7) continue;
    sc.rainT = t;
    for (const e of echoes) if (!e.down && e.group.position.y < sc.pos.y && Math.hypot(e.group.position.x - sc.pos.x, e.group.position.z - sc.pos.z) < 0.6) { e.soakedUntil = Math.max(e.soakedUntil, t + 4); reveal(e, t, 2, ELEMENTS.aqua.color); }
    LATE.quench(sc.pos.clone().setY(0.2), 0.6, t);
  }
}

// Reached from modules that load before this one.
Object.assign(LATE, { summonBlade });

// Umbra's hands. While you are in the dark discipline, each of your hands wears a larger one made of shadow, reaching
// well past your fingers. Rake an open hand through the air and the claws cut whatever is within their reach.
const claws = [];
export function updateClaws(t, dt) {
  const hands = LATE.handState ? [LATE.handState.left, LATE.handState.right] : [];
  hands.forEach((st, i) => {
    let cl = claws[i];
    const on = ST.selected === 'umbra' && st.valid && st.curl > 1.25;
    if (!on) { if (cl) cl.g.visible = false; return; }
    if (!cl) {
      const g = new THREE.Group();
      for (let f = 0; f < 4; f++) {
        const talon = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.75, 5).translate(0, 0.375, 0), energyMat('umbra', { scale: [9, 4, 9], flow: [0, 1.5, 0], cut: 0.22 }));
        talon.position.set((f - 1.5) * 0.07, 0.05, 0); talon.rotation.z = -(f - 1.5) * 0.16;
        const core = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.7, 4).translate(0, 0.35, 0), new THREE.MeshBasicMaterial({ color: 0x000000 }));
        talon.add(core); g.add(talon);
      }
      g.renderOrder = 16; scene.add(g);
      cl = claws[i] = { g, struck: new Map(), fwd: new THREE.Vector3(), tip: new THREE.Vector3() };
    }
    cl.fwd.subVectors(st.knuckle, st.wrist).normalize();
    cl.g.visible = true;
    cl.g.position.copy(st.palm);
    cl.g.quaternion.setFromUnitVectors(UP, cl.fwd);
    cl.tip.copy(st.palm).addScaledVector(cl.fwd, 0.85);
    if (st.speed < 1.5) return;
    for (const e of echoes) {
      if (!isLive(e, t) || t - (cl.struck.get(e) || -9) < 0.5 || segmentDistance(e.group.position, st.palm, cl.tip) > 0.38) continue;
      cl.struck.set(e, t);
      tone(180, 90, 0.15, 0.2, 'sawtooth');
      hit(e, 'umbra', t, cl.fwd, { damage: 1, kind: 'whip', fear: forms.umbra === 'fear', hollow: forms.umbra === 'hollow' });
    }
    for (const o of objects) if (!o.dead && o.hostile && segmentDistance(o.pos, st.palm, cl.tip) < 0.3) { o.dead = true; puff('umbra', o.pos, 9, 1, {}); }
  });
}

// Where the danger is when you are not looking at it. A creature winding up, or something already in the air toward
// you, outside your view: an arrow at the edge of your sight points to it, and a low note sounds once.
const arrows = [0, 1, 2, 3].map(() => { const a = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.04, 3), new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, depthTest: false })); a.renderOrder = 30; a.visible = false; scene.add(a); return a; });
const _th = new THREE.Vector3(), _tq = new THREE.Quaternion();
let warnedAt = -9;
export function updateThreats(t) {
  const q = renderer.xr.isPresenting && LATE.viewerQuat ? LATE.viewerQuat : camera.quaternion;
  _tq.copy(q).invert();
  let n = 0, fresh = false;
  const consider = (pos, urgent) => {
    if (n >= arrows.length) return;
    _th.copy(pos).sub(LATE.viewerPos).applyQuaternion(_tq);         // into head space: -z is where you are looking
    const flatLen = Math.hypot(_th.x, _th.y);
    if (_th.z < 0 && flatLen < -_th.z * 0.9) return;           // you can see it
    const a = arrows[n++];
    const dx = flatLen > 0.05 ? _th.x / flatLen : 0, dy = flatLen > 0.05 ? _th.y / flatLen : -1;
    a.position.set(dx * 0.2, dy * 0.14, -0.6).applyQuaternion(q).add(LATE.viewerPos);
    a.quaternion.copy(q).multiply(_tq.clone().setFromAxisAngle(_th.set(0, 0, 1), Math.atan2(dy, dx) - Math.PI / 2));
    _tq.copy(q).invert();
    a.material.opacity = urgent ? 0.6 + 0.4 * Math.sin(t * 20) : 0.55;
    a.scale.setScalar(urgent ? 1.5 : 1);
    a.visible = true;
    if (urgent) fresh = true;
  };
  for (const o of objects) if (!o.dead && o.hostile) consider(o.pos, true);
  for (const e of echoes) if (!e.down && e.windup > 0) consider(e.group.position, false);
  for (let i = n; i < arrows.length; i++) arrows[i].visible = false;
  if (fresh && t - warnedAt > 1.2) { warnedAt = t; tone(196, 147, 0.18, 0.16, 'square'); }
}

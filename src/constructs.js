import * as THREE from 'three';
import { ELEMENTS, forms, CURL_OPEN } from './data.js?v=14';
import { play, SFX, tone, castSound } from './audio.js?v=14';
import { S, L } from './state.js?v=14';
import { formOf } from './core.js?v=14';
import { scene, UP, camera, renderer } from './renderer.js?v=14';
import { VOLT_LIGHT, lightNow, FIRE_LIGHT } from './pulse.js?v=14';
import { echoes, glowMat, isLive, reveal, hit } from './echoes.js?v=14';
import { segmentDistance } from './creatures.js?v=14';
import { energyMat, particles, PCOL, puff, earthMat } from './visuals.js?v=14';
import { addEffect } from './effects.js?v=14';
import { objects, sendBack, turn } from './objects.js?v=14';
import { sources } from './water.js?v=14';

// ---------- hand constructs ----------
// Lumen's sweep leaves a blade of light in the hand that made it, for ten seconds. Swing it and it cuts; swing it fast
// and it still throws its crescent; hold it in the way of a shard and the shard goes back.
export const blades = [];
// Every discipline has a weapon it can put in your hand. Lumen's is its sweep; for the rest, draw a V with a pinch.
// Each is built differently, and each hits as its discipline does: the fire sword burns, the thorn whip roots, and so on.
export const WEAPON = { pyro: 'fire sword', terra: 'stone blade', aero: 'wind edge', lumen: 'blade of light', gravis: 'heavy blade', flora: 'thorn lash', astra: 'star blade', umbra: 'shadow blade', necro: 'bone sword' };
export function summonBlade(st, t, key = 'lumen') {
  let b = blades.find(x => x.st === st);
  if (b && b.key === key) { b.until = t + 12; return b; }
  if (b) b.until = 0;
  const g = new THREE.Group(), basic = (hex) => new THREE.MeshBasicMaterial({ color: hex });
  const shaft = (r0, r1, mat, seg = 8) => new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, 1, seg, 8).translate(0, 0.5, 0), mat);
  if (key === 'lumen') { g.add(shaft(0.006, 0.012, basic(0xffffff), 6), shaft(0.012, 0.03, energyMat('lumen', { scale: [20, 4, 20], flow: [0, 2.5, 0], cut: 0.15 }))); }
  else if (key === 'pyro') { g.add(shaft(0.004, 0.014, basic(0xfff0c0), 6), shaft(0.02, 0.05, energyMat('pyro', { scale: [14, 5, 14], flow: [0, 3, 0], cut: 0.3 })), shaft(0.03, 0.07, energyMat('pyro', { scale: [9, 3, 9], flow: [0, 4, 0], cut: 0.5 }))); }
  else if (key === 'terra') { const form = formOf('terra'); g.add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 1, 0.022, 2, 8, 1).translate(0, 0.5, 0), earthMat(form))); for (let i = 0; i < 5; i++) g.add(new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 4).rotateZ(-Math.PI / 2).translate(0.07, 0.15 + i * 0.17, 0), earthMat(form))); }
  else if (key === 'aero') { for (let i = 0; i < 3; i++) { const band = new THREE.Mesh(new THREE.TorusGeometry(0.035 + i * 0.008, 0.006, 5, 20).rotateX(Math.PI / 2).translate(0, 0.2 + i * 0.3, 0), glowMat(new THREE.Color(0xffffff), 0.7)); g.add(band); } g.add(shaft(0.002, 0.02, energyMat('aero', { scale: [30, 3, 30], flow: [0, 5, 0], cut: 0.4 }))); }
  else if (key === 'gravis') { g.add(shaft(0.02, 0.028, basic(0x05020c), 6)); for (let i = 0; i < 4; i++) g.add(new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.006, 5, 24).rotateX(Math.PI / 2).translate(0, 0.15 + i * 0.25, 0), glowMat(new THREE.Color(0xb48cff), 0.9))); }
  else if (key === 'flora') { g.add(shaft(0.008, 0.02, basic(0x3d8a22), 5)); for (let i = 0; i < 9; i++) { const th = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.07, 4).rotateZ(i % 2 ? Math.PI / 2 : -Math.PI / 2).translate(i % 2 ? -0.04 : 0.04, 0.1 + i * 0.1, 0), basic(0x7fd65a)); th.rotation.y = i * 1.3; g.add(th); } }
  else if (key === 'astra') { g.add(shaft(0.003, 0.01, basic(0xffffff), 5)); for (let i = 0; i < 6; i++) g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.022).translate(Math.sin(i * 2) * 0.03, 0.12 + i * 0.16, Math.cos(i * 2) * 0.03), glowMat(new THREE.Color(0xc9d6ff), 0.9))); }
  else if (key === 'umbra') { g.add(shaft(0.01, 0.03, basic(0x000000), 5), shaft(0.03, 0.06, energyMat('umbra', { scale: [12, 4, 12], flow: [0, 2, 0], cut: 0.3 }))); }
  else { g.add(shaft(0.012, 0.02, basic(0xeafff4), 5)); for (let i = 0; i < 6; i++) g.add(new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 5).translate(0, 0.08 + i * 0.17, 0), basic(0xeafff4))); g.add(new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 4).scale(1, 1, 0.3).translate(0, 1.0, 0), basic(0xeafff4))); }
  g.renderOrder = 16; scene.add(g);
  b = { st, g, key, until: t + 12, born: t, tip: new THREE.Vector3(), prev: new THREE.Vector3(), struck: new Map(), first: true, len: key === 'flora' ? 1.3 : key === 'terra' ? 0.8 : 0.95 };
  blades.push(b);
  if (key === 'lumen') play(SFX.blade); else { castSound[key](); tone(300, 900, 0.18, 0.1, 'triangle'); }
  S.hudNote = WEAPON[key] || 'blade'; S.lastCast = key;
  return b;
}
const _bd = new THREE.Vector3();
export function updateBlades(t, dt) {
  for (let i = blades.length - 1; i >= 0; i--) {
    const b = blades[i], st = b.st;
    if (t > b.until || S.selected !== b.key) { scene.remove(b.g); b.g.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); blades.splice(i, 1); continue; }
    b.g.visible = !!st.valid;
    if (!st.valid) continue;
    _bd.copy(st.across).negate().normalize();          // out of the thumb side of the fist, the way a sword is held
    const len = b.len * Math.min((t - b.born) / 0.15, 1) * Math.min((b.until - t) / 0.4, 1);
    b.g.position.copy(st.palm);
    b.g.quaternion.setFromUnitVectors(UP, _bd);
    b.g.scale.set(1, Math.max(len, 0.01), 1);
    b.tip.copy(st.palm).addScaledVector(_bd, len);
    if (b.first) { b.prev.copy(b.tip); b.first = false; }
    const speed = b.tip.distanceTo(b.prev) / Math.max(dt, 1e-3);
    if (b.key === 'lumen' || b.key === 'astra') lightNow(b.tip, VOLT_LIGHT, 0.5); else if (b.key === 'pyro') lightNow(b.tip, FIRE_LIGHT, 0.6);
    if (Math.random() < 0.3) puff(b.key, b.tip, 1, 0.3, {});
    if (speed > 1.6) {
      _bd.subVectors(b.tip, b.prev).normalize();
      for (const e of echoes) {
        if (!isLive(e, t) || t - (b.struck.get(e) || -9) < 0.5) continue;
        if (segmentDistance(e.group.position, st.palm, b.tip) > 0.3 && segmentDistance(e.group.position, b.prev, b.tip) > 0.3) continue;
        b.struck.set(e, t);
        tone(2093, 1568, 0.12, 0.12, 'triangle');
        hit(e, b.key, t, _bd, { damage: 2, kind: 'whip', shadow: b.key === 'lumen' && forms.lumen === 'shadow', form: b.key === 'terra' && formOf('terra') !== 'rock' ? formOf('terra') : undefined });
      }
    }
    for (const o of objects) if (!o.dead && o.hostile && segmentDistance(o.pos, st.palm, b.tip) < 0.3) { turn(o); sendBack(o, 11); tone(2637, 2637, 0.1, 0.1, 'triangle'); S.hudNote = 'parried'; S.lastCast = b.key; L.drawHud(); }
    b.prev.copy(b.tip);
  }
}
// Umbra does not see things. It sees where things are not: every creature is a hole in the room, always, through anything.
// No colour, no kind, no health. Just the absence.
export const voids = [];
export function updateVoids(t) {
  const on = S.selected === 'umbra';
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
    v.children[1].lookAt(L.viewerPos);
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
    if (Math.random() < 0.6) particles.emit(_bd.copy(sc.pos).add(L._np.set((Math.random() - 0.5) * 0.7, 0, (Math.random() - 0.5) * 0.7)), L._nt.set(0, -2.5, 0), PCOL.aqua[1], 0.014, 0.9, 6, 0);
    if (t - (sc.rainT || 0) < 0.7) continue;
    sc.rainT = t;
    for (const e of echoes) if (!e.down && e.group.position.y < sc.pos.y && Math.hypot(e.group.position.x - sc.pos.x, e.group.position.z - sc.pos.z) < 0.6) { e.soakedUntil = Math.max(e.soakedUntil, t + 4); reveal(e, t, 2, ELEMENTS.aqua.color); }
    L.quench(sc.pos.clone().setY(0.2), 0.6, t);
  }
}

// Reached from modules that load before this one.
Object.assign(L, { summonBlade });

// Umbra's hands. While you are in the dark discipline, each of your hands wears a larger one made of shadow, reaching
// well past your fingers. Rake an open hand through the air and the claws cut whatever is within their reach.
const claws = [];
export function updateClaws(t, dt) {
  const hands = L.handState ? [L.handState.left, L.handState.right] : [];
  hands.forEach((st, i) => {
    let cl = claws[i];
    const on = S.selected === 'umbra' && st.valid && st.curl > 1.25;
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
  const q = renderer.xr.isPresenting && L.viewerQuat ? L.viewerQuat : camera.quaternion;
  _tq.copy(q).invert();
  let n = 0, fresh = false;
  const consider = (pos, urgent) => {
    if (n >= arrows.length) return;
    _th.copy(pos).sub(L.viewerPos).applyQuaternion(_tq);         // into head space: -z is where you are looking
    const flatLen = Math.hypot(_th.x, _th.y);
    if (_th.z < 0 && flatLen < -_th.z * 0.9) return;           // you can see it
    const a = arrows[n++];
    const dx = flatLen > 0.05 ? _th.x / flatLen : 0, dy = flatLen > 0.05 ? _th.y / flatLen : -1;
    a.position.set(dx * 0.2, dy * 0.14, -0.6).applyQuaternion(q).add(L.viewerPos);
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

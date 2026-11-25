import * as THREE from 'three';
import { ELEMENTS, forms } from './data.js?v=14';
import { play, SFX, tone } from './audio.js?v=14';
import { S, L } from './state.js?v=14';
import { scene, UP } from './renderer.js?v=14';
import { VOLT_LIGHT, lightNow } from './pulse.js?v=14';
import { echoes, glowMat, isLive, reveal, hit } from './echoes.js?v=14';
import { segmentDistance } from './creatures.js?v=14';
import { energyMat, particles, PCOL } from './visuals.js?v=14';
import { addEffect } from './effects.js?v=14';
import { objects, sendBack, turn } from './objects.js?v=14';
import { sources } from './water.js?v=14';

// ---------- hand constructs ----------
// Lumen's sweep leaves a blade of light in the hand that made it, for ten seconds. Swing it and it cuts; swing it fast
// and it still throws its crescent; hold it in the way of a shard and the shard goes back.
export const blades = [];
export function summonBlade(st, t) {
  let b = blades.find(x => x.st === st);
  if (b) { b.until = t + 10; return b; }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.012, 1, 6).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0xffffff })));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 1, 8, 8).translate(0, 0.5, 0), energyMat('lumen', { scale: [20, 4, 20], flow: [0, 2.5, 0], cut: 0.15 })));
  g.renderOrder = 16; scene.add(g);
  b = { st, g, until: t + 10, born: t, tip: new THREE.Vector3(), prev: new THREE.Vector3(), struck: new Map(), first: true };
  blades.push(b);
  play(SFX.blade); S.hudNote = 'blade of light'; S.lastCast = 'lumen';
  return b;
}
const _bd = new THREE.Vector3();
export function updateBlades(t, dt) {
  for (let i = blades.length - 1; i >= 0; i--) {
    const b = blades[i], st = b.st;
    if (t > b.until || S.selected !== 'lumen') { scene.remove(b.g); b.g.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); blades.splice(i, 1); continue; }
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
    for (const o of objects) if (!o.dead && o.hostile && segmentDistance(o.pos, st.palm, b.tip) < 0.3) { turn(o); sendBack(o, 11); tone(2637, 2637, 0.1, 0.1, 'triangle'); S.hudNote = 'parried'; S.lastCast = 'lumen'; L.drawHud(); }
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

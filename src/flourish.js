import * as THREE from 'three';
import { KINDS, ELEMENTS, FORMS, forms, MOVES } from './data.js?v=17';
import { play, SFX, FAMILIAR_NOTE, moveSound, tone, thump } from './audio.js?v=17';
import { ST, LATE } from './state.js?v=17';
import { UP, ZERO } from './renderer.js?v=17';
import { collide, lineOfSight } from './collision.js?v=17';
import { echoes, glowMat, hit } from './echoes.js?v=17';
import { aimAssist, flat } from './creatures.js?v=17';
import { energyMat, puff } from './visuals.js?v=17';
import { addEffect, castBolt, castCone, castColumn, castRing, castWall, castFault, zap, castBeam, castVoid, castLance, raiseThrall, castLegion } from './effects.js?v=17';

// ---------- what each discipline's blast and shockwave are actually made of ----------
// Things that come up, stand a moment and go: roots, claws, spikes, shafts of light.
function popUps(list, t) {
  addEffect(list.map(p => p.mesh), (n) => {
    let any = false;
    for (const p of list) {
      const a = n - t - p.at;
      const k = a < 0 ? 0 : a < p.grow ? a / p.grow : a < p.grow + p.life ? 1 : Math.max(1 - (a - p.grow - p.life) / 0.25, 0);
      p.mesh.visible = k > 0;
      if (p.axis) p.mesh.scale.set(p.axis[0] ? Math.max(k, 0.01) : 1, p.axis[1] ? Math.max(k, 0.01) : 1, p.axis[2] ? Math.max(k, 0.01) : 1); else p.mesh.scale.setScalar(Math.max(k, 0.01));
      if (p.mesh.material.transparent && p.fade) p.mesh.material.opacity = k * p.fade;
      if (a < p.grow + p.life + 0.25) any = true;
    }
    return any;
  });
}
const basic = (hex) => new THREE.MeshBasicMaterial({ color: hex });
export function ringFlourish(key, m, centre, t) {
  const R = m.maxR, list = [], rnd = (i) => { const a = i * 2.399, r = R * Math.sqrt((i + 0.5) / 26); return [Math.cos(a) * r, Math.sin(a) * r, r]; };
  if (key === 'flora') {                            // roots breaking the floor, outward
    for (let i = 0; i < 26; i++) { const [x, z, r] = rnd(i); const root = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.3 + (i % 4) * 0.08, 5).translate(0, 0.17, 0), basic(i % 3 ? 0x3d8a22 : 0x7a5230)); root.position.set(centre.x + x, centre.y, centre.z + z); root.rotation.set((i % 5 - 2) * 0.2, i, (i % 3 - 1) * 0.3); list.push({ mesh: root, at: r / 5, grow: 0.12, life: 1.1, axis: [0, 1, 0] }); }
  } else if (key === 'necro') {                     // hands
    for (let i = 0; i < 14; i++) { const [x, z, r] = rnd(i * 2); const hand = new THREE.Group(); for (let f = -1; f <= 1; f++) hand.add(new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.16, 4).translate(f * 0.03, 0.3, 0).rotateZ(f * -0.25), basic(0xeafff4))); hand.add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.24, 5).translate(0, 0.12, 0), basic(0xeafff4))); hand.material = { transparent: false, dispose() {} }; hand.position.set(centre.x + x, centre.y, centre.z + z); hand.rotation.y = i; list.push({ mesh: hand, at: r / 5, grow: 0.18, life: 0.9, axis: [0, 1, 0] }); }
    for (let i = 0; i < 3; i++) {                    // and three of them come up to the waist with a blade, and swing it
      const a = i * 2.1 + 0.4, r = Math.min(R * 0.5, 1.2), sk = new THREE.Group(), bone = basic(0xeafff4);
      sk.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6).translate(0, 0.62, 0), bone), new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.08).translate(0, 0.42, 0), bone), new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 5).translate(0, 0.17, 0), bone));
      const arm = new THREE.Group(); arm.position.set(0.1, 0.5, 0);
      arm.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.26).translate(0, 0, 0.13), bone), new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.5).translate(0, 0, 0.5), basic(0xbfd8d0)));
      sk.add(arm); sk.material = { transparent: false, dispose() {} };
      sk.position.set(centre.x + Math.cos(a) * r, centre.y, centre.z + Math.sin(a) * r); sk.rotation.y = -a + Math.PI / 2;
      list.push({ mesh: sk, at: 0.15 + i * 0.08, grow: 0.2, life: 0.9, axis: [0, 1, 0] });
      addEffect([], (n) => { arm.rotation.x = -1.2 + Math.min(Math.max((n - t - 0.4 - i * 0.08) / 0.18, 0), 1) * 2.2; return n - t < 1.6; });
    }
  } else if (key === 'morph') {                     // a crown of bone thrown up round the foot
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.5, 4).translate(0, 0.25, 0), basic(0xf0dccf)); spike.position.set(centre.x + Math.cos(a) * 0.8, centre.y, centre.z + Math.sin(a) * 0.8); spike.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); list.push({ mesh: spike, at: 0.02 * (i % 3), grow: 0.07, life: 0.5, axis: [0, 1, 0] }); }
  } else if (key === 'lumen') {                     // shafts of light standing on the wave front
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = R * (0.35 + 0.65 * ((i * 7) % 16) / 16); const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 2.2, 6).translate(0, 1.1, 0), glowMat(new THREE.Color(0xfff6d0), 0.8)); shaft.position.set(centre.x + Math.cos(a) * r, centre.y, centre.z + Math.sin(a) * r); list.push({ mesh: shaft, at: r / 5, grow: 0.05, life: 0.25, axis: [0, 1, 0], fade: 0.8 }); }
  } else if (key === 'astra') {                     // it rains stars
    for (let i = 0; i < 18; i++) { const [x, z, r] = rnd(i * 1.4); const streak = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.02, 2.4, 5).translate(0, 1.2, 0), glowMat(new THREE.Color(i % 3 ? 0xc9d6ff : 0xffffff), 0.9)); streak.position.set(centre.x + x, centre.y, centre.z + z); streak.rotation.z = 0.25; list.push({ mesh: streak, at: r / 5 + (i % 4) * 0.05, grow: 0.06, life: 0.08, axis: [0, 1, 0], fade: 0.9 }); }
  } else if (key === 'gravis') {                    // a plate of weight coming down on everything
    const press = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.04, 48, 1, true), glowMat(new THREE.Color(0xb48cff), 0.7));
    const lid = new THREE.Mesh(new THREE.RingGeometry(0, R, 48).rotateX(Math.PI / 2), energyMat('gravis', { scale: [1.5, 1.5, 1.5], cut: 0.35 }));
    press.add(lid);
    addEffect([press], (n) => { const k = Math.min((n - t) / 0.3, 1); press.position.copy(centre).setY(centre.y + 1.8 * (1 - k * k)); press.material.opacity = lid.material.opacity = k < 1 ? 0.7 : Math.max(0.7 - (n - t - 0.3) * 2.5, 0); return n - t < 0.6; });
  } else if (key === 'umbra') {                     // night, as a dome
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), energyMat('umbra', { scale: [2, 2, 2], flow: [0, 0.4, 0], cut: 0.1 }));
    dome.position.copy(centre);
    addEffect([dome], (n) => { const r = Math.min((n - t) * 5, R); dome.scale.setScalar(Math.max(r, 0.01)); dome.material.opacity = r < R ? 1 : Math.max(1 - (n - t - R / 5) * 1.6, 0); return n - t < R / 5 + 0.65; });
  }
  if (list.length) popUps(list, t);
}
// Rings that travel down the blast: a voice, a pressure wave, a gust.
function waves(origin, d, count, range, radius, mat, t, gap = 0.09, speed = 9) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
  const rings = Array.from({ length: count }, (_, i) => { const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 40), mat()); r.quaternion.copy(q); r.userData.at = i * gap; return r; });
  addEffect(rings, (n) => {
    let any = false;
    for (const r of rings) { const a = n - t - r.userData.at, dist = a * speed; r.visible = a > 0 && dist < range; if (a * speed < range) any = true; if (!r.visible) continue; const k = dist / range; r.position.copy(origin).addScaledVector(d, dist); r.scale.setScalar(radius * (0.15 + k)); r.material.opacity = 1 - k; }
    return any;
  });
}
export function coneFlourish(key, m, origin, d, t) {
  const spread = Math.tan(m.angle) * m.range;
  if (key === 'necro') waves(origin, d, 5, m.range, spread, () => glowMat(new THREE.Color(0x6cf0c2), 0.8), t, 0.11, 7);
  else if (key === 'gravis') waves(origin, d, 3, m.range, spread, () => energyMat('gravis', { cut: 0.2 }), t, 0.05, 14);
  else if (key === 'aero') {                        // wind: long curved streaks, not a cloud
    const side = new THREE.Vector3(-d.z, 0, d.x).normalize(), list = [];
    for (let i = 0; i < 9; i++) {
      const off = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), 0).multiplyScalar(spread * 0.9);
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(off.x * 0.2, off.y * 0.2 + 0.25, m.range * 0.5), new THREE.Vector3(off.x, off.y, m.range * (0.7 + Math.random() * 0.3)));
      const streak = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.008, 4, false), glowMat(new THREE.Color(0xffffff), 0.7));
      streak.position.copy(origin); streak.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
      list.push({ mesh: streak, at: i * 0.02, grow: 0.14, life: 0.1, axis: [0, 0, 1], fade: 0.7 });
    }
    popUps(list, t);
  } else if (key === 'lumen') {                     // a fan of hard rays
    const list = [];
    for (let i = 0; i < 9; i++) { const a = (i / 8 - 0.5) * 2 * m.angle; const ray = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, m.range).translate(0, 0, m.range / 2), glowMat(new THREE.Color(0xfff6d0), 0.9)); ray.position.copy(origin); ray.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.clone().applyAxisAngle(UP, a).normalize()); list.push({ mesh: ray, at: 0, grow: 0.04, life: 0.12, axis: [0, 0, 1], fade: 0.9 }); }
    popUps(list, t);
  } else if (key === 'morph' && m.armour) {         // plates of shell closing in front of you
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d), list = [];
    for (let i = 0; i < 7; i++) { const a = (i / 6) * Math.PI * 2, r = i === 6 ? 0 : 0.2; const plate = new THREE.Mesh(new THREE.CircleGeometry(0.115, 6), new THREE.MeshBasicMaterial({ color: i === 6 ? 0xf0dccf : 0xd8a898, side: THREE.DoubleSide })); plate.quaternion.copy(q); plate.position.copy(origin).addScaledVector(d, 0.25).add(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0).applyQuaternion(q)); list.push({ mesh: plate, at: i * 0.03, grow: 0.08, life: 0.7 }); }
    popUps(list, t);
  } else if (key === 'astra') {                     // rain, straight down through the whole blast
    const list = [];
    for (let i = 0; i < 14; i++) { const p = origin.clone().addScaledVector(d, Math.random() * m.range).add(new THREE.Vector3((Math.random() - 0.5) * spread, 0, (Math.random() - 0.5) * spread)); const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.012, 0.9, 4), glowMat(new THREE.Color(0xc9d6ff), 0.8)); drop.position.copy(p); list.push({ mesh: drop, at: i * 0.015, grow: 0.05, life: 0.1, axis: [0, 1, 0], fade: 0.8 }); }
    popUps(list, t);
  }
}
// --- zone: a volume that stays where you put it and works on whatever is inside.
function castZone(key, m, c) {
  const d = c.dir.clone().normalize(), t = c.t;
  const mark = aimAssist(c.hand, d, 0.4, t);
  const wall = collide(c.hand, c.hand.clone().addScaledVector(d, 4));
  const centre = mark ? mark.group.position.clone() : wall ? wall.point.clone().addScaledVector(wall.normal, m.radius * 0.6) : c.hand.clone().addScaledVector(d, 3);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), energyMat(key, { scale: [2.5, 2.5, 2.5], flow: [0.3, 0.5, 0.2], cut: 0.12 }));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 6, 60), glowMat(ELEMENTS[key].color.clone(), 0.6));
  ball.position.copy(centre); rim.position.copy(centre);
  play(SFX.zone);
  const until = t + m.seconds, last = new Map(), epoch = ST.shapeEpoch;
  addEffect([ball, rim], (n) => {
    if (epoch !== ST.shapeEpoch) return false;
    const k = Math.min((n - t) / 0.3, 1) * Math.min((until - n) / 0.5, 1);
    ball.scale.setScalar(Math.max(m.radius * k, 0.01)); rim.scale.setScalar(Math.max(m.radius * k, 0.01));
    rim.lookAt(LATE.viewerPos);
    if (Math.random() < 0.5) puff(key, LATE._np.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(m.radius * 1.6).add(centre), 1, 0.3, {});
    for (const e of echoes) {
      if (e.down || e.group.position.distanceTo(centre) > m.radius) continue;
      e.blindUntil = Math.max(e.blindUntil, n + 0.5);
      if (n - (last.get(e) || -9) > 1.1) { last.set(e, n); hit(e, key, n, ZERO, { ...m, damage: 1, kind: 'void' }); }
    }
    for (const o of LATE.objects) if (!o.dead && o.hostile && o.pos.distanceTo(centre) < m.radius) { o.dead = true; puff(key, o.pos, 8, 1, {}); }   // what is thrown into the dark does not come out
    return n < until;
  });
}
// ---------- kinds of move that are not a thing thrown, a blast or a wave ----------
// orbit: lights or moons that circle you for a while and act on their own.
function castOrbit(key, m, c) {
  const t0 = c.t, epoch = ST.shapeEpoch;
  const orbs = Array.from({ length: m.count }, (_, i) => {
    const g = new THREE.Group();
    if (m.mode === 'zap') { g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.035), new THREE.MeshBasicMaterial({ color: 0xffffff })), new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), energyMat(key, { scale: [14, 14, 14], cut: 0.3 }))); }
    else { g.add(new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), new THREE.MeshBasicMaterial({ color: i ? 0xc9d6ff : 0xe8ecf8 })), new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5).translate(0.03, 0.03, 0.06), new THREE.MeshBasicMaterial({ color: 0x8a94b8 })), new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.004, 4, 30), glowMat(ELEMENTS[key].color.clone(), 0.7))); }
    g.userData.cool = t0 + 0.6 + i * 0.3;
    return g;
  });
  play(SFX.orbit);
  const eye = () => LATE.viewerPos;
  addEffect(orbs, (n) => {
    if (epoch !== ST.shapeEpoch) return false;
    const fade = Math.min((n - t0) / 0.3, 1) * Math.min((t0 + m.seconds - n) / 0.5, 1);
    orbs.forEach((g, i) => {
      const ang = n * (m.mode === 'zap' ? 2.4 : 1.5) + (i / m.count) * Math.PI * 2, r = m.mode === 'zap' ? 0.7 : 0.95;
      g.position.set(eye().x + Math.cos(ang) * r, eye().y - 0.25 + Math.sin(n * 1.7 + i * 2) * 0.12, eye().z + Math.sin(ang) * r);
      g.scale.setScalar(Math.max(fade, 0.01)); g.rotation.y += 0.05;
      if (n < g.userData.cool) return;
      if (m.mode === 'zap') {                        // strikes the nearest thing it can see
        let prey = null, near = m.range;
        for (const e of echoes) { if (e.down) continue; const dd = e.group.position.distanceTo(g.position); if (dd < near && lineOfSight(g.position, e.group.position)) { near = dd; prey = e; } }
        if (!prey) return;
        g.userData.cool = n + 1.3;
        zap(g.position.clone(), prey.group.position.clone(), n);
        tone(2093, 1568, 0.08, 0.08, 'triangle');
        hit(prey, key, n, prey.group.position.clone().sub(g.position).normalize(), { damage: 1, shadow: forms.lumen === 'shadow' });
      } else {                                       // takes shards out of the air, rams what comes close
        for (const o of LATE.objects) if (!o.dead && o.hostile && o.pos.distanceTo(g.position) < 0.7) { o.dead = true; puff(key, o.pos, 14, 2, {}); tone(600, 300, 0.1, 0.12, 'triangle'); g.userData.cool = n + 0.4; return; }
        for (const e of echoes) if (!e.down && e.group.position.distanceTo(g.position) < 0.5) { g.userData.cool = n + 1.5; thump(); hit(e, key, n, e.group.position.clone().sub(eye()).normalize(), { damage: 1, push: 5 }); return; }
      }
    });
    return n < t0 + m.seconds;
  });
}
// dome: a shelter that stands where you struck.
function castDome(key, m, c) {
  const under = c.ground ? null : collide(c.hand, c.hand.clone().setY(c.hand.y - 2.6));
  const centre = (c.ground || (under ? under.point : c.hand.clone().setY(0))).clone(), t0 = c.t, epoch = ST.shapeEpoch, R = m.radius * (c.power > 1 ? 1.3 : 1);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), energyMat(key, { scale: [3, 3, 3], flow: [0, 0.3, 0], cut: 0.62 }));
  const ribs = new THREE.Group();
  for (let i = 0; i < 6; i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(1, 0.008, 4, 40, Math.PI), glowMat(new THREE.Color(0xfff6d0), 0.8)); rib.rotation.y = (i / 6) * Math.PI; ribs.add(rib); }
  const foot = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64).rotateX(-Math.PI / 2), glowMat(new THREE.Color(0xffffff), 0.9));
  for (const o of [shell, ribs, foot]) o.position.copy(centre);
  foot.position.y += 0.02;
  play(SFX.dome);
  const seen = new Set();
  addEffect([shell, ribs, foot], (n) => {
    if (epoch !== ST.shapeEpoch) return false;
    const k = Math.min((n - t0) / 0.25, 1), out = Math.min((t0 + m.seconds - n) / 0.5, 1);
    for (const o of [shell, ribs, foot]) o.scale.setScalar(Math.max(R * k, 0.01));
    shell.material.opacity = out; ribs.children.forEach(r => { r.material.opacity = 0.8 * out; }); foot.material.opacity = 0.9 * out;
    for (const o of LATE.objects) if (!o.dead && o.hostile && o.pos.distanceTo(centre) < R + 0.1) { o.dead = true; puff(key, o.pos, 16, 2, {}); tone(1568, 2093, 0.08, 0.1, 'triangle'); }
    for (const e of echoes) {
      if (e.down || e.group.position.distanceTo(centre) > R) continue;
      e.blindUntil = Math.max(e.blindUntil, n + 0.6); e.exposedUntil = Math.max(e.exposedUntil, n + 6);
      if (!seen.has(e)) { seen.add(e); hit(e, key, n, UP, { damage: 1 }); }
    }
    return n < t0 + m.seconds;
  });
}
// fling: the target becomes the projectile. It goes into the nearest other creature if there is one, otherwise the wall.
function castFling(key, m, c) {
  const t0 = c.t, d = c.dir.clone().normalize();
  let e = aimAssist(c.eye, d, 0.7, t0);
  if (!e) { let best = 0.9; for (const o of echoes) { if (o.down || !(o.revealedUntil > t0)) continue; const a = o.group.position.clone().sub(c.eye).angleTo(c.fwd); if (a < best) { best = a; e = o; } } }
  if (!e) { ST.hudNote = 'nothing to sling'; LATE.drawHud(); return; }
  let into = null, near = 6;
  for (const o of echoes) { if (o === e || o.down) continue; const dd = o.group.position.distanceTo(e.group.position); if (dd < near) { near = dd; into = o; } }
  const dir = into ? into.group.position.clone().sub(e.group.position).setY(0).normalize() : new THREE.Vector3(c.fwd.z, 0, -c.fwd.x).multiplyScalar(e.group.position.clone().sub(c.eye).dot(new THREE.Vector3(c.fwd.z, 0, -c.fwd.x)) >= 0 ? 1 : -1);
  play(SFX.sling);
  e.vel.x = dir.x * 9; e.vel.z = dir.z * 9; e.blindUntil = Math.max(e.blindUntil, t0 + 1.5);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.012, 5, 40), glowMat(ELEMENTS[key].color.clone(), 0.9));
  let peak = 0, done = false;
  addEffect([ring], (n) => {
    ring.position.copy(e.group.position); ring.lookAt(ring.position.clone().add(dir)); ring.material.opacity = 0.9 * Math.max(1 - (n - t0) / 1.4, 0);
    if (done || e.down) return n - t0 < 0.3;
    const sp = Math.hypot(e.vel.x, e.vel.z); peak = Math.max(peak, sp);
    if (Math.random() < 0.6) puff(key, e.group.position, 1, 0.4, {});
    for (const o of echoes) if (o !== e && !o.down && o.group.position.distanceTo(e.group.position) < 0.5) { done = true; play(SFX.crash); hit(o, key, n, dir, { damage: 2, push: 4 }); hit(e, key, n, dir, { damage: 2, kind: 'void' }); ST.hudNote = 'into each other'; LATE.drawHud(); return true; }
    if (n - t0 > 0.15 && peak > 4 && sp < peak * 0.35) { done = true; play(SFX.crash); puff(key, e.group.position, 30, 3, {}); hit(e, key, n, dir, { damage: 2, kind: 'void' }); ST.hudNote = 'into the wall'; LATE.drawHud(); }
    return n - t0 < 1.4;
  });
}
// trap: jaws laid open on a surface. They close on the first creature to cross them.
const traps = [];
function castTrap(key, m, c) {
  const t0 = c.t, d = c.dir.clone().normalize(), epoch = ST.shapeEpoch;
  const mark = aimAssist(c.eye, d, 0.5, t0);
  let s = collide(c.eye, c.eye.clone().addScaledVector(d, 7));
  if (mark) { const under = collide(mark.group.position, mark.group.position.clone().setY(-0.3)); if (under) s = under; }
  if (!s) { ST.hudNote = 'aim it at a surface'; LATE.drawHud(); return; }
  if (traps.length >= 3) traps[0].until = 0;
  const g = new THREE.Group();
  g.position.copy(s.point).addScaledVector(s.normal, 0.02);
  g.quaternion.setFromUnitVectors(UP, s.normal);
  const leaf = new THREE.MeshBasicMaterial({ color: 0x3d8a22, side: THREE.DoubleSide }), mouth = new THREE.MeshBasicMaterial({ color: 0xc8204a, side: THREE.DoubleSide }), tooth = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
  const jaws = [1, -1].map(side => {
    const jaw = new THREE.Group();
    jaw.add(new THREE.Mesh(new THREE.CircleGeometry(0.3, 16, 0, Math.PI).rotateX(-Math.PI / 2).translate(0, 0.005, 0), mouth), new THREE.Mesh(new THREE.CircleGeometry(0.32, 16, 0, Math.PI).rotateX(-Math.PI / 2), leaf));
    for (let k = 0; k < 9; k++) { const a = (k + 0.5) / 9 * Math.PI; const th = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.09, 4), tooth); th.position.set(Math.cos(a) * 0.29, 0.045, -Math.sin(a) * 0.29); jaw.add(th); }
    jaw.rotation.y = side > 0 ? 0 : Math.PI;
    const hinge = new THREE.Group(); hinge.add(jaw); g.add(hinge);
    return hinge;
  });
  g.scale.setScalar(0.01);
  const self = { pos: g.position.clone(), until: t0 + 30, shut: -1 };
  traps.push(self);
  play(SFX.trapSet); puff(key, self.pos, 16, 1.4, { dir: s.normal, spread: 0.6 });
  addEffect([g], (n) => {
    if (epoch !== ST.shapeEpoch || n > self.until) { traps.splice(traps.indexOf(self), 1); return false; }
    g.scale.setScalar(Math.min((n - t0) / 0.3, 1));
    const closed = self.shut > 0 ? Math.min((n - self.shut) / 0.07, 1) : 0;
    jaws[0].rotation.x = -closed * 1.45; jaws[1].rotation.x = closed * 1.45;
    if (self.shut < 0 && n - t0 > 0.4) for (const e of echoes) {
      if (e.down || e.group.position.distanceTo(self.pos) > 0.65) continue;
      self.shut = n; self.until = n + 1.2;
      play(SFX.trapSnap);
      hit(e, key, n, UP, { damage: 2, bleed: forms.flora === 'thorn', spore: forms.flora === 'spore' });
      if (!e.down) { e.rootedUntil = n + 5; e.vel.set(0, e.vel.y, 0); }
      ST.hudNote = 'snap'; ST.lastCast = key; LATE.drawHud();
      break;
    }
    return true;
  });
}
// mark: everything you can see is marked; a moment later, each mark is answered.
function castMark(key, m, c) {
  const t0 = c.t, list = [];
  for (const e of echoes) { if (e.down || !(e.revealedUntil > t0)) continue; if (e.group.position.clone().sub(c.eye).angleTo(c.fwd) < 1.0 && lineOfSight(c.eye, e.group.position)) list.push(e); }
  list.sort((a, b) => a.group.position.distanceTo(c.eye) - b.group.position.distanceTo(c.eye)); list.length = Math.min(list.length, m.max);
  if (!list.length) { ST.hudNote = 'nothing in view to mark'; LATE.drawHud(); return; }
  play(SFX.mark);
  const rings = list.map(() => new THREE.Mesh(new THREE.RingGeometry(0.2, 0.225, 5), glowMat(new THREE.Color(0xffffff), 0.9)));
  let fired = false;
  addEffect(rings, (n) => {
    const k = (n - t0) / m.delay;
    rings.forEach((r, i) => { const p = list[i].group.position; r.position.set(p.x, p.y + 0.45 + (1 - Math.min(k, 1)) * 0.5, p.z); r.rotation.x = -Math.PI / 2; r.rotation.z = n * 3; r.scale.setScalar(1.6 - Math.min(k, 1) * 0.6); r.visible = !list[i].down; });
    if (k >= 1 && !fired) {
      fired = true;
      list.forEach((e, i) => { if (e.down) return; const at = e.group.position.clone(), top = at.clone().setY(at.y + 2.4);
        let mv = { ...MOVES.astra.punch, sky: false }; if (forms.astra === 'night') mv.shadow = true; if (forms.astra === 'storm') { mv.volt = true; mv.rain = true; mv.form = 'storm'; }
        castBolt(key, mv, { hand: top, dir: at.sub(top).normalize(), eye: c.eye.clone(), fwd: c.fwd.clone(), t: n + i * 0.001, scale: 1 }); });
      play(SFX.astra.punch);
    }
    return k < 1.15;
  });
}
// decoy: your shadow stays behind. They aim at it. When it is hit, or its time is up, it goes off.
function castDecoy(key, m, c) {
  const t0 = c.t, epoch = ST.shapeEpoch, pos = LATE.viewerPos.clone();
  const g = new THREE.Group(), black = new THREE.MeshBasicMaterial({ color: 0x000000 });
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10).translate(0, 0, 0), black), new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.5, 4, 10).translate(0, -0.55, 0), black));
  g.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.75, 4, 12).translate(0, -0.4, 0), energyMat('umbra', { scale: [5, 5, 5], flow: [0, 0.8, 0], cut: 0.3 })));
  g.position.copy(pos);
  LATE.decoy = { pos, until: t0 + m.seconds };
  play(SFX.decoy);
  ST.hudNote = 'your shadow stays'; LATE.drawHud();
  let burst = false;
  const go = (n) => { burst = true; LATE.decoy = null; play(SFX.umbra.slam); puff(key, pos, 60, 3, {});
    for (const e of echoes) if (!e.down && e.group.position.distanceTo(pos) < 2.2) hit(e, key, n, e.group.position.clone().sub(pos).normalize(), { damage: 1, fear: forms.umbra === 'fear', hollow: forms.umbra === 'hollow' }); };
  addEffect([g], (n) => {
    if (epoch !== ST.shapeEpoch) { LATE.decoy = null; return false; }
    if (burst) return false;
    g.scale.setScalar(1 + 0.03 * Math.sin(n * 5));
    for (const o of LATE.objects) if (!o.dead && o.hostile && o.pos.distanceTo(pos) < 0.5) { o.dead = true; go(n); return false; }
    if (n > t0 + m.seconds) { go(n); return false; }
    return true;
  });
}
const KIND = { orbit: castOrbit, dome: castDome, fling: castFling, trap: castTrap, mark: castMark, decoy: castDecoy, zone: castZone, legion: castLegion, lance: castLance, bolt: castBolt, cone: castCone, column: castColumn, ring: castRing, wall: castWall, fault: castFault, beam: castBeam, void: castVoid, whip: (...a) => LATE.castWhip(...a) };

// Both hands together: the same move, bigger and one point harder.
function empowered(key, m, power) {
  const out = { ...m, power, damage: (m.damage ?? (key === 'terra' ? 2 : 1)) + 1 };
  for (const k of ['radius', 'range', 'width', 'height', 'maxR', 'length']) if (out[k]) out[k] *= 1.5;
  if (out.angle) out.angle *= 1.2;
  if (out.chain) out.chain += 2;
  return out;
}

ST.lastCast = null;
ST.selected = 'terra';
ST.hudNote = 'open palm toward you: pick';

// c: { hand, dir, eye, fwd, ground, t, power }. ground is only needed for slam; power above 1 is a two-handed cast.
// What a creature looks like beyond its core: legs, wings, horns, crystals. Built when its kind is decided.
export function dressEcho(e) {
  if (e.extra) { e.group.remove(e.extra); e.extra.traverse(c => { if (c.geometry) c.geometry.dispose(); }); }
  e.extra = null; e.wings = null; e.spin = null;
  const K = KINDS[e.kind];
  if (!K || e.kind === 'plain') return;
  if (!e.extraMat) e.extraMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, side: THREE.DoubleSide });
  e.extraMat.color.set(K.colour);
  const g = e.extra = new THREE.Group(), M = e.extraMat;
  const add = (geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, parent = g) => { const m = new THREE.Mesh(geo, M); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.renderOrder = 6; parent.add(m); return m; };
  const R = 0.16;
  if (e.kind === 'crawler') {                       // six legs, low and wide
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const hip = new THREE.Group(); hip.rotation.y = a; g.add(hip); add(new THREE.CylinderGeometry(0.008, 0.012, 0.22, 4).translate(0, -0.11, 0), R, 0, 0, 0, 0, -0.9, hip); }
    add(new THREE.SphereGeometry(R * 0.9, 10, 6).scale(1.2, 0.35, 1.2));
  } else if (e.kind === 'flyer') {                  // two wings that beat
    e.wings = [1, -1].map(side => { const w = new THREE.Group(); g.add(w); add(new THREE.ConeGeometry(0.11, 0.34, 3).scale(1, 1, 0.06).rotateZ(-side * Math.PI / 2).translate(side * 0.22, 0, 0), 0, 0, 0, 0, 0, 0, w); return w; });
    add(new THREE.ConeGeometry(0.03, 0.2, 4).rotateX(-Math.PI / 2), 0, 0, -0.2);
  } else if (e.kind === 'brute') {                  // horns and a belt of plates
    for (const side of [1, -1]) add(new THREE.ConeGeometry(0.035, 0.16, 5), side * 0.11, 0.17, 0.03, 0, 0, -side * 0.6);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; add(new THREE.BoxGeometry(0.09, 0.11, 0.02), Math.cos(a) * 0.2, -0.03, Math.sin(a) * 0.2, 0, -a + Math.PI / 2, 0); }
  } else if (e.kind === 'frost') {                  // crystal growing out of it
    e.spin = new THREE.Group(); g.add(e.spin);
    for (let i = 0; i < 7; i++) { const d = new THREE.Vector3(Math.sin(i * 2.4) * Math.cos(i), Math.cos(i * 2.4), Math.sin(i * 2.4) * Math.sin(i)).normalize(); const sp = add(new THREE.OctahedronGeometry(0.035).scale(1, 3.2, 1), d.x * 0.19, d.y * 0.19, d.z * 0.19, 0, 0, 0, e.spin); sp.quaternion.setFromUnitVectors(UP, d); }
  } else if (e.kind === 'shade') {                  // a hood, and tatters underneath
    add(new THREE.ConeGeometry(0.2, 0.3, 7, 1, true), 0, 0.1, 0);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; add(new THREE.ConeGeometry(0.03, 0.22, 3).rotateX(Math.PI), Math.cos(a) * 0.12, -0.24, Math.sin(a) * 0.12); }
  } else if (e.kind === 'ember') {                  // tongues of flame standing off it
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; add(new THREE.ConeGeometry(0.035, 0.18 + (i % 2) * 0.08, 4), Math.cos(a) * 0.11, 0.2, Math.sin(a) * 0.11, Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4); }
  } else if (e.kind === 'drip') {                   // a drop: a tail that points up, a skirt of drips
    add(new THREE.ConeGeometry(0.1, 0.28, 10), 0, 0.24, 0);
    for (let i = 0; i < 3; i++) add(new THREE.SphereGeometry(0.025, 6, 5), Math.cos(i * 2.1) * 0.1, -0.24 - i * 0.03, Math.sin(i * 2.1) * 0.1);
  } else if (e.kind === 'pebble') {                 // lumps of rock stuck to it
    for (let i = 0; i < 6; i++) add(new THREE.DodecahedronGeometry(0.05 + (i % 3) * 0.015), Math.cos(i * 1.9) * 0.17, Math.sin(i * 1.3) * 0.14, Math.sin(i * 1.9) * 0.17, i, i * 2, 0);
  } else if (e.kind === 'wisp') {                   // nothing but two rings turning
    e.spin = new THREE.Group(); g.add(e.spin);
    add(new THREE.TorusGeometry(0.2, 0.008, 5, 30), 0, 0, 0, 1.1, 0, 0, e.spin); add(new THREE.TorusGeometry(0.24, 0.006, 5, 30), 0, 0, 0, -0.7, 0.5, 0, e.spin);
  }
  e.group.add(g);
}
// Armour: for a few seconds, what is thrown at you breaks on you.
ST.armourUntil = -1;
export function armour(t, seconds) { ST.armourUntil = Math.max(ST.armourUntil, t + seconds); play(SFX.guard); ST.hudNote = 'armoured'; }
// Anything standing that you made, you can move: an open-palm shove at your own wall slides it where you push.
// It stays a wall. It hits what it passes through. (A punch still breaks it loose, the way it always did.)
export function shoveBarrier(key, c) {
  const d = flat(c.dir, c.fwd);
  const seen = collide(c.hand, c.hand.clone().addScaledVector(c.dir.clone().normalize(), 2.6));
  const b = seen && seen.object.userData.barrier;
  if (!b || !b.alive || b.key !== key || !b.like) return false;
  const from = b.like.position.clone(), to = from.clone().addScaledVector(d, 1.6), t0 = c.t, struck = new Set();
  thump(); play(SFX[key].shove);
  addEffect([], (n) => {
    if (!b.alive) return false;
    const k = Math.min((n - t0) / 0.35, 1);
    b.like.position.lerpVectors(from, to, k * (2 - k));
    b.collider.position.copy(b.like.position); b.collider.updateMatrixWorld(true);
    for (const e of echoes) if (!e.down && !struck.has(e) && Math.hypot(e.group.position.x - b.like.position.x, e.group.position.z - b.like.position.z) < 0.8) { struck.add(e); hit(e, key, n, d, { damage: 1, kind: 'wall' }); }
    return k < 1;
  });
  ST.hudNote = 'moved it'; ST.lastCast = key; LATE.drawHud();
  return true;
}
export function cast(key, gesture, c) {
  let m = MOVES[key][gesture];
  if (!m) return;
  if (gesture === 'shove' && c.hand && !c.quiet && shoveBarrier(key, c)) return;
  ST.barrierKey = key;
  if (m.kind === 'ring' && m.summon) raiseThrall((c.ground || c.hand).clone().setY((c.ground || c.hand).y + 0.5), c.t);
  if (c.st && key === 'lumen' && gesture === 'sweep') LATE.summonBlade(c.st, c.t);
  if (!c.quiet) LATE.noteGesture(`${gesture} > ${m.name}`);
  if (m.kind === 'grip') return;                    // holds are driven by beginHold / updateHold, not cast here
  if (key === 'terra' && ST.terraForm !== 'rock') {      // the same move, made of something else
    m = { ...m, form: ST.terraForm };
    if (ST.terraForm === 'sand') { m.damage = 1; if (m.kind === 'bolt') m.pierce = true; }
    if (ST.terraForm === 'metal' && m.kind === 'bolt') m.bounces = (m.bounces || 0) + 2;
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
    if (form === 'prism') { if (m.kind === 'bolt') m.bounces = (m.bounces || 0) + 3; if (m.kind === 'beam') m.chain = (m.chain || 0) + 2; if (m.kind === 'cone') m.angle *= 1.3; }
    if (form === 'shadow') m.shadow = true;
    if (form === 'float') m.launch = true;
    if (form === 'crush') m.crush = true;
    if (form === 'thorn') { m.damage = (m.damage || 1) + 1; m.bleed = true; }
    if (form === 'spore') m.spore = true;
    if (form === 'night') m.shadow = true;
    if (form === 'storm') { m.volt = true; m.rain = true; }
    if (form === 'shell') m.armour = Math.max(m.armour || 0, 2);
    if (form === 'venom') m.venom = true;
    if (form === 'fear') m.fear = true;
    if (form === 'hollow') m.hollow = true;
    if (form === 'plague') m.venom = true;
    if (form === 'spirit') m.sonic = true;
  }
  if (m.armour) armour(c.t, m.armour);
  if (m.sky) {                                     // it comes down on what you are aiming at, not out of your hand
    const mark = aimAssist(c.hand, c.dir.clone().normalize(), 0.3, c.t);
    const wall = collide(c.hand, c.hand.clone().addScaledVector(c.dir.clone().normalize(), 9));
    const at = mark ? mark.group.position.clone() : wall ? wall.point.clone() : c.hand.clone().addScaledVector(c.dir.clone().normalize(), 4);
    const roof = collide(at.clone().setY(at.y + 0.2), at.clone().setY(at.y + 3.2));
    const top = at.clone().setY(roof ? roof.point.y - 0.15 : at.y + 3);
    if (m.shower && !c.one) {                       // several, scattered round the mark, one after another
      for (let i = 1; i < m.shower; i++) {
        const off = new THREE.Vector3((Math.random() - 0.5) * 1.6, 0, (Math.random() - 0.5) * 1.6), when = c.t + i * 0.16;
        let done = false;
        addEffect([], (n) => { if (!done && n >= when) { done = true; castBolt(key, { ...m, shower: 0, sky: false }, { ...c, one: true, t: n, hand: top.clone().add(off), dir: at.clone().add(off).sub(top.clone().add(off)).normalize(), scale: 1 }); } return !done; });
      }
    }
    c.hand = top; c.dir = at.clone().sub(top).normalize();
    if (m.kind === 'beam') zap(top, at, c.t);
    m = { ...m, sky: false };
  }
  if (key === 'aqua' && gesture === 'charge') {      // everything you gathered goes in one throw
    m = { ...m, damage: 1 + Math.floor(LATE.water.amount / 2), splash: 1 + LATE.water.amount * 0.25 };
    c.scale = 1 + LATE.water.amount * 0.3;
    if (LATE.water.amount > 0.3) c.hand = LATE.water.pos.clone();
    LATE.water.amount = 0;
  }
  if (key === 'aqua' && gesture !== 'charge' && LATE.water.amount < 1 && LATE.sources.length && (m.kind === 'bolt' || m.kind === 'cone' || m.kind === 'whip')) {
    // Nothing carried, but there is water in the room: the move comes straight out of the nearest source you can see.
    let best = null, bestScore = 1.0;
    for (const sc of LATE.sources) {
      const to = sc.pos.clone().sub(c.eye);
      const score = to.angleTo(c.fwd) + to.length() * 0.05;
      if (to.length() < 9 && score < bestScore && lineOfSight(c.eye, sc.pos.clone().addScaledVector(sc.normal, 0.15))) { bestScore = score; best = sc; }
    }
    if (best) {
      const from = best.pos.clone().addScaledVector(best.normal, 0.25);
      const mark = aimAssist(c.hand, c.dir.clone().normalize(), 0.3, c.t);
      const at = mark ? mark.group.position.clone() : c.hand.clone().addScaledVector(c.dir.clone().normalize(), 5);
      c.hand = from; c.dir = at.sub(from).normalize();
      c.power = Math.max(c.power || 1, 1.5); c.wet = true;
      puff('aqua', from, 30, 2.2, { dir: best.normal, spread: 0.8 });
      best.until -= 4;                               // it costs the source some of its life
    }
  }
  if (key === 'aqua' && LATE.water.amount >= 1) {         // carried water: the move leaves from it, and is the stronger for it
    LATE.water.amount -= 1;
    c.power = Math.max(c.power || 1, 1.5);
    if (m.kind === 'bolt' || m.kind === 'whip' || m.kind === 'cone') c.hand = LATE.water.pos.clone();
    c.wet = true;
  }
  if (c.power > 1) m = empowered(key, m, c.power);
  if (c.quiet) { const f = FAMILIAR_NOTE[key] || 500; tone(f, f * 0.6, 0.1, 0.07, key === 'terra' || key === 'gravis' ? 'sine' : 'triangle'); KIND[m.kind](key, m, c); return; }
  ST.lastCast = key;
  moveSound(key, gesture, m.form);
  ST.hudNote = (c.wet ? 'full ' : c.power > 1 ? 'twin ' : '') + (m.form ? m.form + ' ' : '') + m.name.toLowerCase();
  LATE.drawHud();
  KIND[m.kind](key, m, c);
}

// Reached from modules that load before this one.
Object.assign(LATE, { ringFlourish, coneFlourish, dressEcho });

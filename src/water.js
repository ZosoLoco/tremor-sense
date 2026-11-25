import * as THREE from 'three';
import { castSound } from './audio.js?v=14';
import { S, L } from './state.js?v=14';
import { scene, UP } from './renderer.js?v=14';
import { lineOfSight } from './collision.js?v=14';
import { echoes, isLive, hit } from './echoes.js?v=14';
import { _to, segmentDistance, flat } from './creatures.js?v=14';
import { waterMat, energyMat, particles, PCOL, puff } from './visuals.js?v=14';
import { addEffect } from './effects.js?v=14';
import { objects, kick } from './objects.js?v=14';

// ---------- water: sources, and the water you carry ----------
// Aqua works best with water to hand. Put an open palm on any surface and water wells up there for a while.
// While a source is running, water streams across the room to you and gathers at your hand, up to three measures.
// Each Aqua move spends one and comes out bigger and harder. With none, the moves still work, at half strength.
export const sources = [];
export const SOURCE_LIFE = 35, WATER_MAX = 4, WATER_FILL = 1.3;      // seconds a source runs; measures you can carry; seconds per measure
export function addSource(point, normal, t, life = SOURCE_LIFE) {
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
export const water = { amount: 0, pos: new THREE.Vector3(), has: false };
const waterBlob = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), waterMat({ flow: [0, 0.4, 0], scale: [3, 3, 3], amp: 0.16, body: 0.07 }));
waterBlob.visible = false; waterBlob.renderOrder = 17;
scene.add(waterBlob);
const _ws = new THREE.Vector3(), _wv = new THREE.Vector3();
// anchor: where the carried water wants to float (beside the leading hand). Null when Aqua is not in use.
export function updateWater(t, dt, anchor, boost = false) {
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
  waterBlob.visible = water.amount > 0.05 && !L.stream.on;        // drawn out into a stream, it is not a ball any more
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
export function makeWrap(key) {
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
export function updateWrap(h, at, radius, t, dt) {
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
export function dropHold(g) {
  const h = g.hold;
  if (h && h.wrap) { scene.remove(h.wrap); h.wrap.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); }
  if (h && h.e) h.e.puppet = false;
  g.hold = null;
}

// Reached from modules that load before this one.
Object.assign(L, { sources, addSource, clearSources, water, castWhip });

import * as THREE from 'three';
import { ELEMENTS, forms } from './data.js?v=17';
import { tone, thump, tick, thud } from './audio.js?v=17';
import { ST, LATE } from './state.js?v=17';
import { scene, UP, ZERO, now } from './renderer.js?v=17';
import { FIRE_LIGHT, LAVA_LIGHT, addLight, lightNow, firePulse } from './pulse.js?v=17';
import { collide, nearestRoomSurface } from './collision.js?v=17';
import { echoes, glowMat, roomBounds, spawnEye, isOpen, isLive, reveal, hit } from './echoes.js?v=17';
import { HOSTILE, playerHurt, segmentDistance } from './creatures.js?v=17';
import { waterMat, energyMat, stoneMat, craggy, particles, SMOKE, STEAM, DUST, SAND, thinned, fume, PCOL, puff } from './visuals.js?v=17';
import { addEffect } from './effects.js?v=17';

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
export const HEAT_TIME = 10;                               // seconds stone and steel stay hot
const ROUND_OBJECTS = ['crate', 'crate', 'bigcrate', 'keg', 'keg', 'barrel', 'barrel', 'stone', 'stone', 'boulder', 'ball', 'anvil'];
export const MAX_OBJECTS = 10;        // the room was getting crowded: half as many loose things, at most
export const GRIP = { aero: 'Wind Grip', aqua: 'Water Grip', terra: 'Unearth', pyro: 'Fireball', lumen: 'Sunburst', gravis: 'Gravity Grip', flora: 'Vine Grip', astra: 'Meteor Shower', morph: 'Grapple', umbra: 'Black Sun', necro: 'Legion' };
export const objects = [];
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
export function spawnObject(kind, pos) {
  if (objects.filter(o => !o.dead).length >= MAX_OBJECTS) {         // keep the room from filling up: retire the oldest loose one
    const old = objects.find(o => !o.dead && !o.held && !o.hostile);
    if (old) old.dead = true;
  }
  const mesh = objectMesh(kind);
  mesh.position.copy(pos);
  mesh.rotation.y = Math.random() * 6.28;
  objGroup.add(mesh);
  const o = { kind, def: OBJ[kind], mesh, pos: pos.clone(), vel: new THREE.Vector3(), rest: false, held: false, dead: false,
    burnUntil: -1, fuse: -1, hitT: -9, born: now(), base: null };
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
    LATE.addSource(under ? under.point : o.pos.clone().setY(0), under ? under.normal : UP, t);
  }
}
// The room starts with a few things in it, each with a place. Everything else (rubble, shards of ice, stones a move
// left behind) is litter: it lasts a short while and goes. If one of the room's own things is destroyed, or is knocked
// away and left lying, a new one comes back to its place after a while. So the room drifts back to how it began.
const LITTER_LIFE = 12, STRAY_LIFE = 25, RESPAWN_AFTER = 20;
const baseSlots = [];
function tidy(t) {
  for (const o of objects) {
    if (o.dead || o.held || o.hostile || o.def.cloud) continue;
    if (!o.base) { if (t - o.born > LITTER_LIFE && o.rest) { o.dead = true; puff('terra', o.pos, 6, 0.8, {}); } else if (t - o.born > LITTER_LIFE * 2) o.dead = true; }
    else if (o.pos.distanceTo(o.base.pos) > 1.2 && o.rest) { if (!(o.strayT > 0)) o.strayT = t; else if (t - o.strayT > STRAY_LIFE) { o.dead = true; puff('terra', o.pos, 6, 0.8, {}); } }
    else o.strayT = -1;
  }
  for (const slot of baseSlots) {
    if (slot.obj && !slot.obj.dead && objects.includes(slot.obj)) continue;
    if (slot.gone < 0) { slot.gone = t; continue; }
    if (t - slot.gone < RESPAWN_AFTER || !isOpen(slot.pos, OBJ[slot.kind].r + 0.05, spawnEye(), false)) continue;
    const made = spawnObject(slot.kind, slot.pos.clone().setY(slot.pos.y + 0.3));
    made.base = slot; slot.obj = made; slot.gone = -1;
    puff('aero', slot.pos, 14, 1.2, {});
  }
}
export function scatterObjects() {
  baseSlots.length = 0;
  for (const o of objects) { objGroup.remove(o.mesh); o.mesh.geometry.dispose(); o.mesh.material.dispose(); }
  objects.length = 0;
  const box = roomBounds();
  const eye = spawnEye(), taken = [];
  const top = new THREE.Vector3(), bottom = new THREE.Vector3(), at = new THREE.Vector3();
  for (const kind of ROUND_OBJECTS.filter((_, i) => i % 2 === 0)) {     // every other one: a few things to throw, not a storeroom
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
      const made = spawnObject(kind, at.clone()); made.rest = true;
      made.base = { kind, pos: at.clone(), gone: -1 }; baseSlots.push(made.base); made.base.obj = made;
      taken.push(at.clone());
      placed = true;
    }
  }
}
export function spawnCloud(kind, pos, t, life = 9) {
  const o = spawnObject(kind, pos);
  o.until = t + life;
  fume(kind === 'steam' ? STEAM : SAND, pos, 16, { size: 0.4, jitter: 0.7, life: 1.6 });
  return o;
}
// Phase changes of water.
function freezeSource(src, t) {
  const i = LATE.sources.indexOf(src);
  if (i < 0) return;
  LATE.sources.splice(i, 1); scene.remove(src.mesh); src.mesh.geometry.dispose(); src.mesh.material.dispose();
  for (let k = 0; k < 2; k++) spawnObject('ice', src.pos.clone().addScaledVector(src.normal, 0.2).add(new THREE.Vector3((k - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.2)));
  puff('aqua', src.pos, 30, 1.6, { dir: src.normal, spread: 0.9 });
  tone(1900, 2600, 0.2, 0.08, 'triangle');
  ST.hudNote = 'water to ice'; LATE.drawHud();
}
function evaporate(src, t) {
  const i = LATE.sources.indexOf(src);
  if (i < 0) return;
  LATE.sources.splice(i, 1); scene.remove(src.mesh); src.mesh.geometry.dispose(); src.mesh.material.dispose();
  spawnCloud('steam', src.pos.clone().addScaledVector(src.normal, 0.55), t);
  tone(1400, 400, 0.6, 0.06, 'sawtooth');
  ST.hudNote = 'water to steam'; LATE.drawHud();
}
// Fire reaching a place: boils any water standing there.
function heatAt(point, radius, t) {
  for (const src of [...LATE.sources]) if (src.pos.distanceTo(point) < radius) evaporate(src, t);
}
export function ignite(o, t) {
  if (o.dead) return;
  if (o.def.ice) {                                  // ice melts back to standing water
    o.dead = true;
    const under = nearestRoomSurface(o.pos, 2.5);
    LATE.addSource(under ? under.point : o.pos.clone().setY(0), under ? under.normal : UP, t, 20);
    ST.hudNote = 'ice to water'; LATE.drawHud();
    return;
  }
  if (o.def.earth && !o.def.cloud && o.kind !== 'shard') {                // stone and steel take the heat and keep it
    if (!(o.heat > t)) { ST.hudNote = o.kind === 'ball' || o.kind === 'anvil' ? 'red hot' : 'molten'; LATE.drawHud(); }
    o.heat = t + HEAT_TIME;
    return;
  }
  if (o.def.explodes) { if (o.fuse < 0) o.fuse = t + 0.35; }
  else if (o.def.burns && o.burnUntil < 0) o.burnUntil = t + 2.5;
}
// Push on an object. Wakes it if it was resting.
export function kick(o, x, y, z) { o.vel.x += x / o.def.mass; o.vel.y += y / o.def.mass; o.vel.z += z / o.def.mass; o.rest = false; turn(o); }
// Aim a turned shard at the creature that fired it, with enough lift to cancel the drop on the way.
export function sendBack(o, speed) {
  const to = o.owner.group.position;
  const flight = to.distanceTo(o.pos) / speed;
  o.vel.copy(to).sub(o.pos).normalize().multiplyScalar(speed);
  o.vel.y += 4.9 * flight;
  o.rest = false;
}
// A hostile shard that you have touched with anything is yours now, and hits harder going back.
export function turn(o) { if (o.hostile) { o.hostile = false; o.turned = true; } }

// A lot of water landing at once: soaks and knocks what is near, and leaves the place wet.
function splash(point, t, radius) {
  const centre = point.clone();
  puff('aqua', centre, 90, radius * 3.5, { up: 2.5 });
  thump();
  const under = nearestRoomSurface(centre, 2.5);
  LATE.addSource(under ? under.point : centre.clone().setY(0), under ? under.normal : UP, t, 25);
  LATE.quench(centre, radius, t);
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
// Gravity folding in on a point: everything near is dragged to it, and hurt when it gets there.
export function implode(point, radius, t, dmg = 1, key = 'gravis') {
  const centre = point.clone();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), energyMat(key, { scale: [5, 5, 5], flow: [0, -1.2, 0], cut: 0.3 }));
  ball.position.copy(centre);
  thump(); tone(60, 220, 0.4, 0.4, 'sine');
  for (let i = 0; i < thinned(40); i++) {           // motes falling inward
    LATE._np.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(radius);
    particles.emit(LATE._nt.copy(centre).add(LATE._np), LATE._np.multiplyScalar(-3), PCOL.gravis[i % 3], 0.022, 0.32, 0, 0);
  }
  addEffect([ball], (n) => {
    const k = (n - t) / 0.35;
    ball.scale.setScalar(Math.max(radius * (1 - k), 0.01));
    ball.material.opacity = Math.min(k * 3, 1);
    return k < 1;
  });
  for (const e of echoes) {
    if (!isLive(e, t)) continue;
    const away = e.group.position.clone().sub(centre), d = away.length();
    if (d > radius) continue;
    away.normalize();
    e.vel.x -= away.x * 4; e.vel.z -= away.z * 4;
    if (key === 'umbra') hit(e, 'umbra', t, away.negate(), { damage: dmg, kind: 'void', fear: forms.umbra === 'fear', hollow: forms.umbra === 'hollow' });
    else hit(e, 'gravis', t, away.negate(), { damage: dmg, kind: 'void', launch: forms.gravis === 'float', crush: forms.gravis === 'crush' });
  }
  for (const o of objects) {
    if (o.dead || o.held || o.pos.distanceTo(centre) > radius * 1.3) continue;
    const to = centre.clone().sub(o.pos).normalize();
    kick(o, to.x * 6, forms.gravis === 'float' ? 6 : 2, to.z * 6);
  }
}
// A blast: hurts echoes, throws objects, lights what can burn.
export function explode(point, key, radius, t, dmg, noBurn = false) {
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
export function crushObject(o, t) {
  const p = o.pos.clone();
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), glowMat(ELEMENTS.aero.color, 0.6));
  shell.material.wireframe = true;
  shell.position.copy(p);
  addEffect([shell], (n) => { const k = (n - t) / 0.18; shell.scale.setScalar(Math.max(0.45 * (1 - k), 0.02)); shell.rotation.y += 0.4; return k < 1; });
  if (o.def.explodes) { o.dead = true; explode(p, 'pyro', 1.7, t, 2); return; }
  destroyObject(o, t);
  if (o.kind === 'stone' || o.kind === 'boulder') { spawnCloud('sand', p, t, o.kind === 'boulder' ? 12 : 8); ST.hudNote = 'stone to sand'; }
  const heavy = o.def.mass >= 2;
  for (const e of echoes) {                                // the pieces go everywhere
    if (isLive(e, t) && e.group.position.distanceTo(p) < 1.2) hit(e, heavy ? 'terra' : 'aero', t, e.group.position.clone().sub(p).normalize(), { damage: heavy ? 2 : 1 });
  }
}

const _on = new THREE.Vector3(), _op = new THREE.Vector3(), _od = new THREE.Vector3(), _oprev = new THREE.Vector3();
let tidyAt = 0;
export function updateObjects(t, dt) {
  if (t > tidyAt) { tidyAt = t + 1; tidy(t); }
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
        else if (t - (e.scaldT || -9) > 0.9) { e.scaldT = t; reveal(e, t, 2, STEAM); ST.hudNote = 'scald'; hit(e, 'pyro', t, ZERO, { damage: 1, noBurn: true }); }
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
          tone(1800, 1200, 0.2, 0.15, 'triangle'); ST.hudNote = 'rang off steel'; LATE.drawHud();
          continue;
        }
        if (hitB) { hitB.damage(t); if (o.heavy) hitB.damage(t); }
        o.dead = true; tick();
        for (let k = 0; k < 14; k++) particles.emit(o.pos, _od.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(3), HOSTILE, 0.03, 0.3, 4, 1);
      } else if (o.pos.distanceTo(LATE.viewerPos) < 0.3) { o.dead = true; playerHurt(t); }
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

// Reached from modules that load before this one.
Object.assign(LATE, { objects, spawnObject, destroyObject, scatterObjects, spawnCloud, freezeSource, evaporate, heatAt, ignite, kick, sendBack, turn, splash, quake, implode, explode });

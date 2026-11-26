import * as THREE from 'three';
import { ELEMENTS, FORMS, forms, MOVES } from './data.js?v=16';
import { play, SFX, FORM_SFX, moveSound, thump, tick } from './audio.js?v=16';
import { ST, LATE } from './state.js?v=16';
import { summonBlade, WEAPON } from './constructs.js?v=16';
import { formOf } from './core.js?v=16';
import { scene, UP, ZERO, now } from './renderer.js?v=16';
import { FIRE_LIGHT, LAVA_LIGHT, VOLT_LIGHT, lightNow, firePulse } from './pulse.js?v=16';
import { addBarrier, removeBarrier, collide, nearestRoomSurface, lineOfSight } from './collision.js?v=16';
import { echoes, glowMat, roomBounds, isLive, reveal, hit } from './echoes.js?v=16';
import { segmentDistance, flat } from './creatures.js?v=16';
import { waterMat, energyMat, iceMat, earthMat, craggy, particles, STEAM, thinned, fume, PCOL, puff } from './visuals.js?v=16';
import { addEffect, castBolt, ribbonGeo, zap, raiseThrall } from './effects.js?v=16';
import { cast } from './flourish.js?v=16';
import { objects, spawnObject, spawnCloud, ignite, kick, sendBack, turn, explode, crushObject } from './objects.js?v=16';
import { WATER_MAX, addSource, water } from './water.js?v=16';

// ---------- shaping: pinch ----------
// A pinch (thumb and index together, the other fingers out) is the hands-on verb. What it does depends on the discipline.
//   Aqua  draws the water you carry out into a stream that hangs from your fingers and moves like a rope.
//         Swing it and it lashes. Close the fist and the tip takes hold of what you are reaching at. Pinch it with the
//         other hand and it stretches into a curtain between your hands; let go of that hand and it stays as a wall.
//   Aero  traces a current through the air that keeps blowing along the line you drew.
//   Pyro  traces a line of fire.     Terra  traces a ridge that comes up out of the floor under the line.
export const PINCH_ON = 0.022, PINCH_OFF = 0.05;
const _np = new THREE.Vector3(), _nt = new THREE.Vector3();
function nearestOnPath(p, pts, out) {
  out.dist = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    _nt.subVectors(pts[i + 1], a);
    const l2 = _nt.lengthSq();
    const k = l2 ? Math.min(Math.max(_np.subVectors(p, a).dot(_nt) / l2, 0), 1) : 0;
    _np.copy(a).addScaledVector(_nt, k);
    const d = _np.distanceTo(p);
    if (d < out.dist) { out.dist = d; out.i = i; out.point.copy(_np); out.tan.copy(_nt).normalize(); }
  }
  return out;
}
const _near = { dist: 0, i: 0, point: new THREE.Vector3(), tan: new THREE.Vector3() };

// --- Aqua: the stream ---
const STREAM_N = 16, LASH_SPEED = 3.5;
const streamMats = {
  water: waterMat({ flow: [0, 3, 0], scale: [8, 3, 8], amp: 0.006, body: 0.3 }),
  ice: iceMat(),
  steam: waterMat({ flow: [0, 2, 0], scale: [5, 5, 5], amp: 0, body: 0.05 }),
  flesh: energyMat('morph', { scale: [18, 18, 18], flow: [0, 0.6, 0], cut: 0.08 }),
};
export const stream = {
  on: false, len: 1, latch: null, twoHand: false, span: 0, lastGrip: false, lastSqueeze: false, struck: new Map(),
  seenT: -9, lastCtl: null, owner: null, endOwner: null,
  nodes: Array.from({ length: STREAM_N }, () => ({ p: new THREE.Vector3(), prev: new THREE.Vector3(), last: new THREE.Vector3() })),
  mesh: new THREE.Mesh(new THREE.BufferGeometry(), streamMats.water),
  sheet: new THREE.Mesh(new THREE.BufferGeometry(), waterMat({ flow: [0, -1.4, 0], scale: [6, 3, 6], amp: 0, body: 0.12 })),
};
stream.sheet.material.side = THREE.DoubleSide;
// The bone glaive on the end of Morph's tendril.
stream.blade = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.34, 4).rotateX(Math.PI / 2).scale(0.35, 1, 1), new THREE.MeshBasicMaterial({ color: 0xf0dccf }));
stream.blade.visible = false; scene.add(stream.blade);
stream.beads = [0, 1, 2, 3, 4, 5, 6].map(() => { const bd = new THREE.Mesh(new THREE.OctahedronGeometry(0.024), new THREE.MeshBasicMaterial({ color: 0xf0dccf })); bd.visible = false; scene.add(bd); return bd; });
stream.key = 'aqua';
for (const m of [stream.mesh, stream.sheet]) { m.visible = false; m.frustumCulled = false; m.renderOrder = 15; scene.add(m); }
// What drives the stream this frame: { root, dir, vel, eye, grip, squeeze, end }. Hands fill it in; so does the preview.
ST.streamCtl = null;
const streamLength = () => stream.key === 'morph' ? 1.9 : Math.min(0.5 + 0.45 * water.amount, 2.6);
export function startStream(ctl, t, key = 'aqua') {
  if (stream.on) return true;
  stream.key = key;
  if (key === 'aqua' && water.amount < 0.5) { ST.hudNote = 'no water to draw out'; ST.lastCast = 'aqua'; LATE.drawHud(); return false; }
  stream.on = true; stream.latch = null; stream.twoHand = false; stream.lastGrip = !!ctl.grip; stream.lastSqueeze = false;
  stream.struck.clear(); stream.seenT = t; stream.lastCtl = ctl;
  const from = key === 'aqua' && water.has ? water.pos : ctl.root;
  // It starts bunched at the fingers and runs out to its length over the next half second.
  _sd.subVectors(from, ctl.root);
  if (_sd.lengthSq() < 1e-4) _sd.set(0, -1, 0);
  _sd.normalize();
  stream.nodes.forEach((n, i) => {
    n.p.copy(ctl.root).addScaledVector(_sd, i * 0.02).add(_sv.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.01));
    n.prev.copy(n.p); n.last.copy(n.p);
  });
  stream.born = t;
  play(SFX[key].draw); ST.hudNote = key === 'morph' ? 'glaive' : 'stream'; ST.lastCast = key; LATE.drawHud();
  return true;
}
export function endStream(t, ctl) {
  if (!stream.on) return;
  if (stream.latch && ctl) flingLatched(ctl);
  stream.on = false; stream.latch = null; stream.twoHand = false; stream.owner = stream.endOwner = null;
  stream.mesh.visible = stream.sheet.visible = stream.blade.visible = false; stream.beads.forEach(bd => { bd.visible = false; });
  if (stream.key === 'aqua') water.pos.copy(stream.nodes[0].p);
}
const latchPos = () => stream.latch.e ? stream.latch.e.group.position : stream.latch.o.pos;
function flingLatched(ctl) {
  const l = stream.latch;
  if (l.o) { l.o.vel.addScaledVector(ctl.vel, 1.2); l.o.rest = false; }
  else if (ctl.vel.length() > 1.2) {
    l.e.vel.x += ctl.vel.x * 2; l.e.vel.z += ctl.vel.z * 2;
    if (ctl.vel.y > 1 && !l.e.airborne) { l.e.airborne = true; l.e.vel.y = 2.2; }
  }
  stream.latch = null;
  ST.hudNote = 'let go'; LATE.drawHud();
}
const _sv = new THREE.Vector3(), _sd = new THREE.Vector3(), _sline = new THREE.Vector3(), _sa2 = new THREE.Vector3();
export function updateStream(t, dt) {
  if (!stream.on) return;
  let ctl = ST.streamCtl;
  if (ctl) { stream.seenT = t; stream.lastCtl = ctl; }
  else if (t - stream.seenT < 0.3) ctl = stream.lastCtl;           // a dropped frame of tracking does not spill it
  const flesh = stream.key === 'morph', SK = stream.key;
  if (!ctl || ST.selected !== SK || (!flesh && water.amount < 0.3)) { endStream(t, ctl); return; }
  const form = flesh ? 'flesh' : forms.aqua, N = STREAM_N, nodes = stream.nodes, root = ctl.root;
  const base = streamLength() * Math.min(0.15 + (t - stream.born) / 0.5, 1);
  if (stream.latch && (stream.latch.e ? stream.latch.e.down : (stream.latch.o.dead || stream.latch.o.held))) stream.latch = null;

  // The far end: free, in the other hand, or wrapped round something.
  const wasTwo = stream.twoHand;
  stream.twoHand = !!ctl.end && !stream.latch && !flesh;
  if (wasTwo && !stream.twoHand && !stream.latch && stream.span > 0.5) { plantWall(nodes[0].p.clone(), nodes[N - 1].p.clone(), t); endStream(t, null); return; }
  const tipTarget = stream.latch ? latchPos() : stream.twoHand ? ctl.end : null;
  let len = base;
  if (tipTarget) len = Math.min(Math.max(root.distanceTo(tipTarget) * 1.03, 0.2), streamLength() * 2.2);
  if (form === 'ice' && !tipTarget) len = Math.min(len, 1.3);
  stream.len = len; stream.span = stream.twoHand ? root.distanceTo(ctl.end) : 0;
  const seg = len / (N - 1);

  // Verlet rope: every node keeps its momentum, then the links pull it back into line.
  // Stepped at a fixed small interval so it swings the same at any frame rate.
  const grav = form === 'ice' ? 0 : form === 'steam' ? -0.8 : flesh ? 2.5 : 6;
  const subs = Math.min(Math.max(Math.ceil(dt / 0.012), 1), 6), step = Math.min(dt, 0.08) / subs;
  for (const n of nodes) n.last.copy(n.p);
  const rootFrom = _sline.copy(nodes[0].p);
  for (let sub = 1; sub <= subs; sub++) {
    for (let i = 1; i < N; i++) {
      const n = nodes[i];
      _sv.subVectors(n.p, n.prev).multiplyScalar(0.985).clampLength(0, 0.25);   // capped, so a hand that jumps cannot fling it across the room
      n.prev.copy(n.p);
      n.p.add(_sv); n.p.y -= grav * step * step;
    }
    for (let it = 0; it < 6; it++) {
      nodes[0].p.copy(rootFrom).lerp(root, sub / subs);
      if (tipTarget) nodes[N - 1].p.copy(tipTarget);
      for (let i = 0; i < N - 1; i++) {
        const a = nodes[i].p, b = nodes[i + 1].p;
        _sd.subVectors(b, a);
        const dist = _sd.length() || 1e-5, diff = (dist - seg) / dist;
        if (i === 0) b.addScaledVector(_sd, -diff);
        else if (i === N - 2 && tipTarget) a.addScaledVector(_sd, diff);
        else { a.addScaledVector(_sd, diff * 0.5); b.addScaledVector(_sd, -diff * 0.5); }
      }
    }
  }
  if (!tipTarget) for (let i = 1; i < N; i++) {      // whatever else happens, no link is ever stretched far
    _sd.subVectors(nodes[i].p, nodes[i - 1].p);
    if (_sd.length() > seg * 1.4) nodes[i].p.copy(nodes[i - 1].p).addScaledVector(_sd.setLength(seg * 1.4), 1);
  }
  if (flesh && !tipTarget) for (let i = 1; i < N; i++) nodes[i].p.lerp(_sa2.copy(root).addScaledVector(ctl.dir, seg * i).setY(root.y + ctl.dir.y * seg * i + Math.sin(t * 5 + i * 0.6) * 0.03 * i / N), 0.1);   // muscle: it reaches where you reach, and it never hangs still
  if (form === 'ice' && !tipTarget) for (let i = 1; i < N; i++) nodes[i].p.lerp(_sa2.copy(root).addScaledVector(ctl.dir, seg * i), 0.6);   // frozen: a blade
  for (let i = 1; i < N; i++) if (nodes[i].p.y < 0.03) nodes[i].p.y = 0.03;

  // Lash: the outer part of the stream, moving fast, hits what it crosses.
  const m = flesh ? { name: 'Glaive', kind: 'whip', damage: 2, venom: forms.morph === 'venom' }
    : { name: 'Stream', kind: 'whip', damage: (water.amount >= 2 ? 2 : 1) + (form === 'ice' ? 1 : 0), freeze: form === 'ice', steam: form === 'steam', form: form === 'water' ? undefined : form };
  const lash = form === 'water' ? LASH_SPEED : 2;
  if (!stream.twoHand) for (let i = Math.floor(N / 3); i < N; i++) {
    const n = nodes[i];
    const speed = _sv.subVectors(n.p, n.last).length() / Math.max(dt, 1e-3);
    if (speed < lash) continue;
    _sv.normalize();
    for (const e of echoes) {
      if (!isLive(e, t) || (stream.latch && stream.latch.e === e) || t - (stream.struck.get(e) || -9) < 0.6) continue;
      if (segmentDistance(e.group.position, n.last, n.p) > 0.32 && segmentDistance(e.group.position, nodes[i - 1].p, n.p) > 0.3) continue;   // swept, so a fast tip cannot skip past
      stream.struck.set(e, t);
      puff(SK, n.p, 16, 2.2, {});
      hit(e, SK, t, _sv, m);
    }
    for (const o of objects) {
      if (o.dead || o.held || o.def.cloud || (stream.latch && stream.latch.o === o) || t - (stream.struck.get(o) || -9) < 0.4) continue;
      if (segmentDistance(o.pos, nodes[i - 1].p, n.p) > o.def.r + 0.12) continue;
      stream.struck.set(o, t);
      kick(o, _sv.x * 4, 1.2, _sv.z * 4);
    }
  }

  // Take hold: the fist closes and the tip goes to what you are reaching at.
  if (ctl.grip && !stream.lastGrip && !stream.latch && !stream.twoHand) {
    let best = null, bestScore = 0.45;
    const reach = streamLength() * 1.6 + 0.4, tip = nodes[N - 1].p;
    const consider = (pos, ref) => {
      if (pos.distanceTo(root) > reach) return;
      const score = Math.min(_sv.subVectors(pos, ctl.eye).angleTo(ctl.dir), pos.distanceTo(tip) * 0.6);
      if (score < bestScore) { bestScore = score; best = ref; }
    };
    for (const e of echoes) if (isLive(e, t)) consider(e.group.position, { e });
    for (const o of objects) if (!o.dead && !o.held && !o.def.cloud) consider(o.pos, { o });
    if (best) {
      stream.latch = best;
      stream.tether = Math.max(latchPos().distanceTo(root) * 0.9, 0.4);     // it goes taut at the distance you caught it
      play(SFX.aqua.latch); ST.hudNote = flesh ? 'hooked' : 'took hold'; ST.lastCast = SK; LATE.drawHud();
      puff(SK, latchPos(), 24, 1.8, {});
      if (best.e) {
        if (flesh) { /* a hook, not a soaking */ } else if (form === 'ice') { best.e.frozenUntil = t + 6; best.e.vel.set(0, best.e.vel.y, 0); }
        else if (form === 'steam') best.e.blindUntil = t + 2;
        else best.e.soakedUntil = t + 6;
      } else turn(best.o);
    }
  } else if (!ctl.grip && stream.lastGrip && stream.latch) flingLatched(ctl);
  stream.lastGrip = !!ctl.grip;

  if (stream.latch) {
    const tp = latchPos();
    _sd.subVectors(root, tp);
    const dist = _sd.length() || 1e-5;
    _sd.divideScalar(dist);
    const over = Math.max(dist - stream.tether, 0);
    if (stream.latch.e) {                          // a creature: dragged where your hand goes, and it cannot fight back
      const e = stream.latch.e;
      e.vel.x += (_sd.x * over * 14 + ctl.vel.x * 3.5) * dt; e.vel.z += (_sd.z * over * 14 + ctl.vel.z * 3.5) * dt;
      if (ctl.vel.y > 1.6 && !e.airborne && !(e.frozenUntil > t)) { e.airborne = true; e.vel.y = 2.2; }
      e.blindUntil = Math.max(e.blindUntil, t + 0.3);
      e.revealedUntil = Math.max(e.revealedUntil, t + 1);
      if (ctl.squeeze && !stream.lastSqueeze) { ST.hudNote = 'constrict'; hit(e, SK, t, ZERO, { damage: 1, kind: 'grip', freeze: form === 'ice' }); }
    } else {                                       // an object: a weight on the end of a rope
      const o = stream.latch.o;
      o.vel.addScaledVector(_sd, over * 60 * dt);
      o.vel.multiplyScalar(Math.max(1 - 1.2 * dt, 0));
      o.rest = false;
      if (ctl.squeeze && !stream.lastSqueeze) { crushObject(o, t); stream.latch = null; ST.hudNote = 'crush'; LATE.drawHud(); }
    }
  }
  stream.lastSqueeze = !!ctl.squeeze;

  // Between two hands it spreads into a curtain that takes what is thrown at you.
  const curtain = stream.twoHand && stream.span > 0.3;
  stream.sheet.visible = curtain;
  if (curtain) {
    const pos = [], idx = [];
    nodes.forEach((n, i) => {
      const drop = Math.min(0.6, n.p.y - 0.03);
      pos.push(n.p.x, n.p.y, n.p.z, n.p.x, n.p.y - drop, n.p.z);
      if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    });
    const g = stream.sheet.geometry;
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    stream.sheet.material = form === 'ice' ? streamMats.ice : stream.sheetWater || (stream.sheetWater = stream.sheet.material);
    for (const o of objects) {
      if (o.dead || !o.hostile) continue;
      let hitNode = null;
      for (const n of nodes) if (Math.hypot(n.p.x - o.pos.x, n.p.z - o.pos.z) < 0.3 && o.pos.y < n.p.y + 0.15 && o.pos.y > n.p.y - 0.7) { hitNode = n; break; }
      if (!hitNode) continue;
      if (form === 'ice') { turn(o); sendBack(o, 9); tick(); ST.hudNote = 'turned on the ice'; }
      else { o.dead = true; puff('aqua', o.pos, 26, 2.2, {}); water.amount = Math.min(water.amount + 0.5, WATER_MAX * 2); tick(); ST.hudNote = 'swallowed'; }
      ST.lastCast = 'aqua'; LATE.drawHud();
    }
  }

  // Draw it.
  const mesh = stream.mesh;
  mesh.visible = true;
  mesh.material = streamMats[form];
  stream.blade.visible = flesh;
  stream.beads.forEach((bd, i) => { bd.visible = flesh; if (flesh) bd.position.copy(nodes[1 + i * 2].p); });
  if (flesh) { stream.blade.position.copy(nodes[N - 1].p); stream.blade.lookAt(_sa2.copy(nodes[N - 1].p).multiplyScalar(2).sub(nodes[N - 3].p)); }
  mesh.geometry.dispose();
  const radius = form === 'ice' ? 0.02 : flesh ? 0.016 : 0.012 + 0.006 * Math.min(water.amount, 4);
  mesh.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(nodes.map(n => n.p)), 34, radius, 7, false);
  if (form === 'steam') { if (Math.random() < 0.6) fume(STEAM, nodes[Math.floor(Math.random() * N)].p, 1, { size: 0.14, life: 0.7, rise: 0.3 }); }
  else if (form === 'water' && Math.random() < 0.3) particles.emit(nodes[1 + Math.floor(Math.random() * (N - 1))].p, _sv.set(0, -0.2, 0), PCOL.aqua[1], 0.014, 0.5, 5, 0);
}
// The curtain left standing where you held it.
export function plantWall(a, b, t) {
  const form = forms.aqua;
  water.amount = Math.max(water.amount - 1, 0);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const under = collide(mid, mid.clone().setY(-0.3));
  const baseY = under ? under.point.y : 0;
  const along = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
  const width = Math.max(along.length(), 0.6);
  along.normalize();
  const height = Math.min(Math.max(Math.max(a.y, b.y) - baseY, 0.7), 1.8);
  tick(); ST.lastCast = 'aqua';
  if (form === 'steam') {                          // steam will not stand: it hangs there as a bank of cloud
    for (let i = 0; i < 3; i++) spawnCloud('steam', a.clone().lerp(b, i / 2).setY(baseY + 0.7), t, 7);
    ST.hudNote = 'steam bank'; LATE.drawHud();
    return null;
  }
  const wall = new THREE.Group();
  wall.position.set(mid.x, baseY, mid.z);
  wall.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), along);
  if (form === 'ice') {
    const slab = craggy(new THREE.BoxGeometry(width, height, 0.14, 8, 6, 1).translate(0, height / 2, 0), 0.04);
    slab.computeVertexNormals();
    wall.add(new THREE.Mesh(slab, iceMat()));
  } else {
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.1, 10, 8, 1).translate(0, height / 2, 0), waterMat({ flow: [0, -1.4, 0], scale: [6, 3, 6], amp: 0.02, body: 0.16 }));
    wall.add(sheet);
  }
  wall.scale.set(1, 0.01, 1);
  const centre = () => wall.position.clone().setY(baseY + height * 0.5);
  let alive = true;
  const fall = (tt, quiet) => {
    if (!alive) return;
    alive = false;
    removeBarrier(barrier);
    puff('aqua', centre(), 50, 2.6, { jitter: width * 0.5 });
    if (!quiet && form !== 'ice') addSource(wall.position.clone(), UP, tt, 20);     // it falls, and the floor stays wet
  };
  const barrier = addBarrier(new THREE.BoxGeometry(width, height, 0.2).translate(0, height / 2, 0), wall, {
    // Hit it with one of your own moves and it goes: water rolls out as a wave, ice breaks into shards.
    struck: (dv, k, tt) => {
      const c = centre(), d = flat(dv, along);
      if (k === 'pyro' && form === 'ice') {            // fire on an ice wall: it melts where it stands, and the melt is water you can use
        fall(tt, true); addSource(wall.position.clone(), UP, tt, 25); spawnCloud('steam', c, tt, 4); play(SFX.quench); ST.hudNote = 'melted'; LATE.drawHud();
        return;
      }
      fall(tt, true);
      if (form === 'ice') for (let i = 0; i < 3; i++) { const o = spawnObject('ice', c.clone().addScaledVector(along, (i - 1) * width * 0.3)); if (o) kick(o, d.x * 9, 2, d.z * 9); }
      else cast('aqua', 'shove', { hand: c, dir: d.clone(), eye: c.clone().addScaledVector(d, -1), fwd: d.clone(), t: tt });
    },
    crumble: (tt) => fall(tt),
    reflect: form === 'ice',
    damage: (tt) => { puff('aqua', centre(), 14, 2, { jitter: width * 0.4 }); if (--barrier.hp <= 0) fall(tt); },
  });
  barrier.hp = form === 'ice' ? 4 : 2;
  barrier.key = 'aqua';
  const until = t + (form === 'ice' ? 20 : 12);
  addEffect([wall], (n) => {
    wall.scale.y = Math.min((n - t) / 0.2, 1);
    if (alive && n > until) fall(n);
    return alive;
  });
  play(SFX.aqua.wall); if (form === 'ice') play(FORM_SFX.ice);
  ST.hudNote = form === 'ice' ? 'ice wall' : 'water wall'; LATE.drawHud();
  return barrier;
}

// --- drawn lines ---
const DRAW_STEP = 0.12, DRAW_MAX = 28;
export const DRAWN = { terra: 'Ridge', pyro: 'Fire Line', aqua: 'Stream', aero: 'Current', lumen: 'Mirror Line', gravis: 'Rift', flora: 'Snare', astra: 'Constellation', morph: 'Glaive', umbra: 'Veil', necro: 'Bone Fence' };   // what a pinch makes
ST.drawing = null;                                 // { key, pts, owner }
export function drawBegin(key, p, owner = null) { ST.drawing = { key, pts: [p.clone()], owner }; LATE.noteGesture('pinch'); }
export function drawAdd(p) {
  if (!ST.drawing) return;
  const last = ST.drawing.pts[ST.drawing.pts.length - 1];
  if (p.distanceTo(last) < DRAW_STEP || ST.drawing.pts.length >= DRAW_MAX) return;
  ST.drawing.pts.push(p.clone());
  puff(ST.drawing.key, p, 3, 0.4, {});
}
export function drawEnd(t) {
  const d = ST.drawing;
  ST.drawing = null;
  if (!d || d.pts.length < 3) return null;
  // A sigil. If the line closes on itself it is a circle, and a circle summons: the discipline's own familiar appears in it.
  let len = 0; for (let i = 1; i < d.pts.length; i++) len += d.pts[i].distanceTo(d.pts[i - 1]);
  if (len > 0.7 && d.pts[0].distanceTo(d.pts[d.pts.length - 1]) < 0.22) {
    const centre = new THREE.Vector3(); for (const q of d.pts) centre.add(q); centre.divideScalar(d.pts.length);
    ST.lastCast = d.key; play(SFX.summon);
    const made = summonFamiliar(d.key, centre, t);
    LATE.drawHud();
    return made;
  }
  // A V (any line with a hard corner in it) is a weapon: the discipline's own, in the hand that drew it.
  if (WEAPON[d.key]) {
    let corner = false;
    for (let i = 2; i < d.pts.length - 1 && !corner; i++) { const a = d.pts[i].clone().sub(d.pts[i - 2]).normalize(), b = d.pts[Math.min(i + 2, d.pts.length - 1)].clone().sub(d.pts[i]).normalize(); if (a.dot(b) < -0.15) corner = true; }
    const hand = d.owner || LATE.previewHand;
    if (corner && hand) { const made = summonBlade(hand, t, d.key); LATE.drawHud(); return made; }
  }
  moveSound(d.key, 'draw', formOf(d.key) === FORMS[d.key][0] ? null : formOf(d.key)); ST.lastCast = d.key;
  const made = d.key === 'aero' ? makeCurrent(d.pts, t) : d.key === 'pyro' ? fireLine(d.pts, t) : d.key === 'terra' ? raiseRidge(d.pts, t) : d.key === 'lumen' ? mirrorLine(d.pts, t) : d.key === 'gravis' ? rift(d.pts, t) : d.key === 'flora' ? snare(d.pts, t) : d.key === 'astra' ? constellation(d.pts, t) : d.key === 'morph' ? raiseRidge(d.pts, t, 'bone') : d.key === 'umbra' ? mirrorLine(d.pts, t, 'shadow') : d.key === 'necro' ? raiseRidge(d.pts, t, 'bone') : null;
  LATE.drawHud();
  return made;
}

// --- familiars ---
// One per discipline, each with its own body and its own habit. Two at a time. They use the discipline's own basic
// attack, in whatever sub-element you are in when they fire, so everything that attack does, theirs does.
const FAMILIAR = {
  pyro:   { name: 'Ember Wisp',  geo: () => new THREE.OctahedronGeometry(0.09),            rate: 1.3, range: 6, habit: 'post' },
  terra:  { name: 'Stone Sentry', geo: () => craggy(new THREE.DodecahedronGeometry(0.14), 0.03), rate: 2.2, range: 7, habit: 'post' },
  aero:   { name: 'Cyclone',     geo: () => new THREE.TorusGeometry(0.11, 0.035, 8, 20),   rate: 1.6, range: 5, habit: 'roam' },
  lumen:  { name: 'Sun Mote',    geo: () => new THREE.IcosahedronGeometry(0.06),           rate: 1.8, range: 8, habit: 'follow' },
  gravis: { name: 'Moon',        geo: () => new THREE.SphereGeometry(0.1, 16, 12),         rate: 2.6, range: 6, habit: 'orbit' },
  astra:  { name: 'Guide Star',  geo: () => new THREE.TetrahedronGeometry(0.1),            rate: 2.0, range: 9, habit: 'high' },
  umbra:  { name: 'Shade',       geo: () => new THREE.ConeGeometry(0.09, 0.26, 5),         rate: 1.7, range: 6, habit: 'follow' },
};
export const familiars = [];
export function summonFamiliar(key, centre, t) {
  if (key === 'flora') {                             // Flora's familiar is the snapper: it grows on the nearest surface to the circle
    const s = nearestRoomSurface(centre, 3);
    ST.hudNote = 'snapper';
    return plantTurret(s ? s.point.clone() : centre.clone().setY(0), s ? s.normal.clone() : UP.clone(), t);
  }
  if (key === 'necro') { raiseThrall(centre.clone(), t); return raiseThrall(centre.clone().add(new THREE.Vector3(0.3, 0, 0)), t); }
  const F = FAMILIAR[key];
  if (!F) return null;
  if (familiars.length >= 2) familiars[0].until = 0;
  const g = new THREE.Group();
  const body = new THREE.Mesh(F.geo(), key === 'terra' ? earthMat(ST.terraForm) : key === 'umbra' ? new THREE.MeshBasicMaterial({ color: 0x08020f }) : energyMat(key, { scale: [9, 9, 9], cut: 0.25 }));
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.006, 6, 40), glowMat(ELEMENTS[key].color.clone(), 0.8));
  g.add(body, halo);
  g.position.copy(centre); g.scale.setScalar(0.01);
  const self = { key, g, pos: g.position, until: t + 22, fireAt: t + 0.8, home: centre.clone(), phase: Math.random() * 6 };
  familiars.push(self);
  puff(key, centre, 30, 2, {});
  const epoch = ST.shapeEpoch, to = new THREE.Vector3();
  let then = t;
  addEffect([g], (n) => {
    const dt = Math.min(n - then, 0.08); then = n;
    if (epoch !== ST.shapeEpoch || n > self.until) { familiars.splice(familiars.indexOf(self), 1); puff(key, self.pos, 20, 1.6, {}); return false; }
    g.scale.setScalar(Math.min((n - t) / 0.4, 1));
    body.rotation.y += dt * (key === 'aero' ? 14 : 1.5); body.rotation.x += dt * 0.7;
    halo.rotation.x = Math.PI / 2 + Math.sin(n * 2 + self.phase) * 0.5; halo.rotation.y += dt * 2;
    // where it likes to be
    if (F.habit === 'follow') to.copy(LATE.viewerPos).add(_np.set(0.45, 0.25, -0.2));
    else if (F.habit === 'orbit') to.copy(LATE.viewerPos).add(_np.set(Math.cos(n * 1.4) * 0.8, 0.2, Math.sin(n * 1.4) * 0.8));
    else if (F.habit === 'roam') to.copy(self.home).add(_np.set(Math.cos(n * 0.7 + self.phase) * 1.2, Math.sin(n * 1.1) * 0.2, Math.sin(n * 0.7 + self.phase) * 1.2));
    else if (F.habit === 'high') to.copy(self.home).setY(Math.min(self.home.y + 0.9, roomBounds().max.y - 0.25));
    else to.copy(self.home);
    self.pos.lerp(to, Math.min(dt * 3, 1));
    if (key === 'pyro' || key === 'lumen' || key === 'astra') lightNow(self.pos, key === 'pyro' ? FIRE_LIGHT : VOLT_LIGHT, 0.5);
    if (Math.random() < 0.25) puff(key, self.pos, 1, 0.3, {});
    if (n < self.fireAt) return true;
    let prey = null, near = F.range;
    for (const e of echoes) { if (e.down) continue; const d = e.group.position.distanceTo(self.pos); if (d < near && (key === 'gravis' || key === 'umbra' || lineOfSight(self.pos, e.group.position))) { near = d; prey = e; } }
    if (prey) {
      self.fireAt = n + F.rate;
      const dir = prey.group.position.clone().sub(self.pos).normalize();
      reveal(prey, n, 1.5, ELEMENTS[key].color);
      cast(key, 'punch', { hand: self.pos.clone().addScaledVector(dir, 0.2), dir, eye: self.pos.clone(), fwd: dir.clone().setY(0).normalize(), t: n, quiet: true });
    }
    return true;
  });
  ST.hudNote = F.name.toLowerCase();
  return self;
}

// --- Aero: currents ---
export const currents = [];
const CURRENT_LIFE = 12, CURRENT_R = 0.5, CURRENT_SPEED = 6;
function endCurrent(c) {
  const i = currents.indexOf(c);
  if (i < 0) return;
  currents.splice(i, 1);
  scene.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh.material.dispose();
}
ST.shapeEpoch = 0;                                 // a new game ends every drawn line still standing
function clearShaping() {
  ST.shapeEpoch++;
  for (const f of fireLines) f.alive = false;
  fireLines.length = 0;
  while (currents.length) endCurrent(currents[0]);
  endStream(now(), null);
  ST.drawing = null; ST.streamCtl = null;
}
export function makeCurrent(pts, t) {
  if (currents.length >= 3) endCurrent(currents[0]);
  const form = forms.aero;
  const c = {
    pts: pts.map(p => p.clone()), born: t, until: t + CURRENT_LIFE, form, dir: form === 'vacuum' ? -1 : 1, builtAt: -9,
    mesh: new THREE.Mesh(new THREE.BufferGeometry(), energyMat('aero', { flow: [1.2, 0.4, 1.2], scale: [4, 4, 4], cut: 0.5, opacity: 0.55 })),
  };
  c.mesh.frustumCulled = false; c.mesh.renderOrder = 14;
  scene.add(c.mesh);
  currents.push(c);
  thump();
  ST.hudNote = form === 'vacuum' ? 'undertow' : form === 'sound' ? 'drone' : 'current';
  return c;
}
export const _cv = new THREE.Vector3(), _cp = new THREE.Vector3();
export function updateCurrents(t, dt, eye) {
  for (let ci = currents.length - 1; ci >= 0; ci--) {
    const c = currents[ci];
    if (t > c.until) { endCurrent(c); continue; }
    if (t - c.builtAt > 0.12) {                     // the ribbon turns to keep facing you
      c.builtAt = t;
      c.mesh.geometry.dispose();
      c.mesh.geometry = ribbonGeo(c.pts, 0.3, eye);
    }
    c.mesh.material.opacity = Math.min((t - c.born) / 0.3, 1, (c.until - t) / 1.5) * 0.55;
    for (let k = 0; k < 3; k++) {                   // streaks running along it show which way it blows
      const i = Math.floor(Math.random() * (c.pts.length - 1));
      _cp.copy(c.pts[i]).lerp(c.pts[i + 1], Math.random()).add(_cv.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.3));
      _cv.subVectors(c.pts[i + 1], c.pts[i]).normalize().multiplyScalar(CURRENT_SPEED * 0.8 * c.dir);
      particles.emit(_cp, _cv, PCOL.aero[k % 3], 0.02, 0.3, 0, 0);
    }
    for (const o of objects) {
      if (o.dead || o.held) continue;
      nearestOnPath(o.pos, c.pts, _near);
      if (_near.dist > CURRENT_R + o.def.r) continue;
      if (c.form === 'sound') continue;             // a drone moves nothing
      turn(o);                                      // what they threw is yours once the wind has it
      const speed = o.def.cloud ? 2.5 : CURRENT_SPEED / Math.sqrt(o.def.mass);
      o.vel.lerp(_cv.copy(_near.tan).multiplyScalar(speed * c.dir).addScaledVector(_cp.copy(_near.point).sub(o.pos), 3), Math.min(dt * 6, 1));
      o.vel.y += 9.8 * dt;                          // carried: the wind holds its weight
      o.rest = false;
    }
    for (const e of echoes) {
      if (e.down) continue;
      nearestOnPath(e.group.position, c.pts, _near);
      if (_near.dist > CURRENT_R + 0.2) continue;
      reveal(e, t, 1, ELEMENTS.aero.color);         // you can see what the wind is pushing against
      if (c.form === 'sound') { e.blindUntil = Math.max(e.blindUntil, t + 1); continue; }
      if (e.frozenUntil > t) continue;
      e.vel.x += _near.tan.x * c.dir * 14 * dt; e.vel.z += _near.tan.z * c.dir * 14 * dt;
      if (_near.tan.y * c.dir > 0.5 && !e.airborne) { e.airborne = true; e.vel.y = 2.2; }
      if (c.form === 'vacuum' && !(e.drainAt > 0)) e.drainAt = t + 1.5;
    }
  }
}
// An open hand moving through a current drags it along.
export function bendCurrents(handPos, handVel, dt) {
  let bent = false;
  for (const c of currents) for (const pt of c.pts) {
    const d = pt.distanceTo(handPos);
    if (d < 0.4) { pt.addScaledVector(handVel, dt * (1 - d / 0.4)); c.builtAt = -9; bent = true; }
  }
  return bent;
}

// Fire lines and snares, so other disciplines can find them.
export const fireLines = [];
// Water (and better, ice) on something hot: burning things go out, molten stone sets, a fire line dies in steam.
export function quench(point, radius, t) {
  let any = false;
  for (const o of objects) {
    if (o.dead || o.pos.distanceTo(point) > radius + o.def.r) continue;
    if (o.burnUntil > 0) { o.burnUntil = -1; any = true; }
    if (o.fuse > 0) { o.fuse = 0; any = true; }
    if (o.heat > t) { o.heat = -1; any = true; }
  }
  for (const f of fireLines) {
    if (!f.alive || nearestOnPath(point, f.pts, _near).dist > radius) continue;
    if (f.flora) { f.until += 6; ST.hudNote = 'watered: it holds longer'; LATE.drawHud(); continue; }     // water feeds roots
    f.alive = false; any = true;
    spawnCloud('steam', _near.point.clone().setY(Math.max(_near.point.y, 0.5)), t, 5);
  }
  for (let i = fireLines.length - 1; i >= 0; i--) if (!fireLines[i].alive) fireLines.splice(i, 1);
  if (any) { play(SFX.quench); fume(STEAM, point, 6, { size: 0.3, rise: 0.8, life: 1.4 }); ST.hudNote = 'quenched'; LATE.drawHud(); }
  return any;
}
// --- Pyro: a line of fire ---
export function fireLine(pts, t) {
  const form = forms.pyro;
  pts = pts.map(p => p.clone());
  if (form === 'lightning') {                       // it does not burn: it goes off once, along the whole line
    for (let i = 0; i < pts.length - 1; i++) zap(pts[i], pts[i + 1], t);
    thump();
    for (const e of echoes) if (!e.down && nearestOnPath(e.group.position, pts, _near).dist < 0.5) hit(e, 'pyro', t, UP, { damage: 2, volt: true, arc: true });
    for (const o of objects) if (!o.dead && o.hostile && nearestOnPath(o.pos, pts, _near).dist < 0.5) { o.dead = true; puff('volt', o.pos, 14, 2, {}); }
    ST.hudNote = 'live wire';
    return { form };
  }
  if (form === 'blast') {                           // a fuse: it goes off point by point
    let next = 0;
    addEffect([], (n) => {
      while (next < pts.length && n - t > next * 0.07) { explode(pts[next], 'pyro', 0.6, n, 1, true); next += 2; }
      return next < pts.length;
    });
    ST.hudNote = 'fuse';
    return { form };
  }
  const until = t + 7, last = new Map(), epoch = ST.shapeEpoch;
  const self = { pts, until, alive: true };
  fireLines.push(self);
  addEffect([], (n) => {
    if (epoch !== ST.shapeEpoch || !self.alive) { self.alive = false; return false; }
    for (const f of fireLines) if (f.flora && f.alive && nearestOnPath(pts[pts.length >> 1], f.pts, _near).dist < 0.6) { f.alive = false; ST.hudNote = 'the snare burns'; LATE.drawHud(); }   // fire takes roots
    for (let k = 0; k < thinned(5); k++) {
      const i = Math.floor(Math.random() * (pts.length - 1));
      puff('pyro', _cp.copy(pts[i]).lerp(pts[i + 1], Math.random()), 1, 0.7, { up: 1.6 });
    }
    lightNow(pts[pts.length >> 1], FIRE_LIGHT, 0.9);
    for (const e of echoes) {
      if (e.down || n - (last.get(e) || -9) < 1 || nearestOnPath(e.group.position, pts, _near).dist > 0.4) continue;
      last.set(e, n);
      hit(e, 'pyro', n, UP, { damage: 1 });
    }
    for (const o of objects) {
      if (o.dead || o.held || nearestOnPath(o.pos, pts, _near).dist > 0.35 + o.def.r) continue;
      if (o.hostile) { o.dead = true; puff('pyro', o.pos, 16, 2, {}); tick(); }   // what they throw burns up in it
      else ignite(o, n);
    }
    return n < until;
  });
  ST.hudNote = 'fire line';
  return { form, until };
}

// --- Lumen: a line of light that turns back what is thrown at it ---
export function mirrorLine(pts, t, as = null) {
  const form = as || forms.lumen;
  pts = pts.map(p => p.clone());
  const band = new THREE.Mesh(new THREE.BufferGeometry(), glowMat(new THREE.Color(form === 'shadow' ? 0x6a5a9c : 0xfff1b0), 0.5));
  const until = t + 8, last = new Map(), epoch = ST.shapeEpoch;
  let built = -9;
  addEffect([band], (n) => {
    if (epoch !== ST.shapeEpoch) return false;
    if (n - built > 0.12) { built = n; band.geometry.dispose(); band.geometry = ribbonGeo(pts, 0.5, LATE.viewerPos); }
    band.material.opacity = 0.32 * Math.min((until - n) / 1.2, 1) * (0.8 + 0.2 * Math.sin(n * 14));
    if (form !== 'shadow') lightNow(pts[pts.length >> 1], VOLT_LIGHT, 0.5);
    if (Math.random() < 0.5) { const i = Math.floor(Math.random() * (pts.length - 1)); puff('lumen', _cp.copy(pts[i]).lerp(pts[i + 1], Math.random()), 1, 0.3, {}); }
    for (const o of objects) {
      if (o.dead || !o.hostile || nearestOnPath(o.pos, pts, _near).dist > 0.4) continue;
      turn(o); sendBack(o, form === 'prism' ? 14 : 10); tick();
      ST.hudNote = 'mirrored'; ST.lastCast = 'lumen'; LATE.drawHud();
    }
    for (const e of echoes) {
      if (e.down || n - (last.get(e) || -9) < 2 || nearestOnPath(e.group.position, pts, _near).dist > 0.45) continue;
      last.set(e, n);
      if (as) hit(e, 'umbra', n, UP, { damage: 1, fear: forms.umbra === 'fear', hollow: forms.umbra === 'hollow' });
      else hit(e, 'lumen', n, UP, { damage: form === 'shadow' ? 1 : 0, shadow: form === 'shadow' });
    }
    return n < until;
  });
  ST.hudNote = form === 'shadow' ? 'veil' : 'mirror line';
  return { form, until };
}
// --- Gravis: a tear that everything near falls toward ---
export function rift(pts, t) {
  const form = forms.gravis;
  pts = pts.map(p => p.clone());
  const band = new THREE.Mesh(new THREE.BufferGeometry(), energyMat('gravis', { scale: [6, 6, 6], flow: [0, -1.5, 0], cut: 0.3 }));
  const until = t + 8, last = new Map(), R = 1.1;
  let built = -9, then = t;
  const epoch = ST.shapeEpoch;
  addEffect([band], (n) => {
    if (epoch !== ST.shapeEpoch) return false;
    const dt = Math.min(n - then, 0.08); then = n;
    if (n - built > 0.12) { built = n; band.geometry.dispose(); band.geometry = ribbonGeo(pts, 0.16, LATE.viewerPos); }
    band.material.opacity = Math.min((until - n) / 1.2, 1);
    for (let k = 0; k < thinned(3); k++) {          // motes falling into it (or, floating, rising off it)
      const i = Math.floor(Math.random() * (pts.length - 1));
      _cp.copy(pts[i]).lerp(pts[i + 1], Math.random());
      _cv.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      if (form === 'float') particles.emit(_cp, _cv.set(_cv.x * 0.3, 1.6, _cv.z * 0.3), PCOL.gravis[k % 3], 0.02, 0.6, 0, 0);
      else particles.emit(_np.copy(_cp).addScaledVector(_cv, 0.8), _cv.multiplyScalar(-2.6), PCOL.gravis[k % 3], 0.02, 0.3, 0, 0);
    }
    for (const o of objects) {
      if (o.dead || o.held || nearestOnPath(o.pos, pts, _near).dist > R) continue;
      turn(o); o.rest = false;
      if (form === 'float') { o.vel.y += 13 * dt; o.vel.multiplyScalar(Math.max(1 - 1.5 * dt, 0)); }
      else { o.vel.addScaledVector(_cv.copy(_near.point).sub(o.pos), (form === 'crush' ? 16 : 10) * dt); o.vel.multiplyScalar(Math.max(1 - 2.5 * dt, 0)); o.vel.y += 9.8 * dt * 0.8; }
    }
    for (const e of echoes) {
      if (e.down) continue;
      nearestOnPath(e.group.position, pts, _near);
      if (_near.dist > R) continue;
      reveal(e, n, 1, ELEMENTS.gravis.color);
      if (form === 'float') { if (!e.airborne) { e.airborne = true; e.vel.y = 2.2; } continue; }
      e.vel.x += (_near.point.x - e.group.position.x) * 9 * dt; e.vel.z += (_near.point.z - e.group.position.z) * 9 * dt;
      if (_near.dist < 0.45 && n - (last.get(e) || -9) > 1.5) { last.set(e, n); hit(e, 'gravis', n, ZERO, { damage: form === 'crush' ? 2 : 1, kind: 'void', crush: form === 'crush' }); }
    }
    return n < until;
  });
  thump();
  ST.hudNote = form === 'float' ? 'lift' : 'rift';
  return { form, until };
}

// --- Flora: snappers. A plant with a mouth, rooted to whatever surface the seed hit: floor, wall or ceiling.
// It bites what comes close, spits thorns at what does not, and eats what is thrown past it. Three at a time.
export const turrets = [];
export function plantTurret(point, normal, t) {
  if (turrets.length >= 3) turrets[0].until = 0;
  const g = new THREE.Group();
  g.position.copy(point);
  g.quaternion.setFromUnitVectors(UP, normal.clone().normalize());
  const green = new THREE.MeshBasicMaterial({ color: 0x3d8a22 }), lip = new THREE.MeshBasicMaterial({ color: 0x7fd65a }), maw = new THREE.MeshBasicMaterial({ color: 0xc8204a, side: THREE.DoubleSide });
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.34, 6).translate(0, 0.17, 0), green);
  for (let i = 0; i < 4; i++) { const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4).rotateZ(Math.PI / 2).translate(0.09, 0.02, 0), lip); leaf.rotation.y = i * Math.PI / 2; g.add(leaf); }
  const head = new THREE.Group();
  head.position.set(0, 0.36, 0);
  const jaws = [1, -1].map((side) => {
    const jaw = new THREE.Group();
    jaw.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1.5).rotateX(side > 0 ? 0 : Math.PI), lip));
    jaw.add(new THREE.Mesh(new THREE.CircleGeometry(0.085, 10).rotateX(Math.PI / 2).scale(1, 1, 1.5), maw));
    for (let k = 0; k < 5; k++) { const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, 4).rotateX(side > 0 ? Math.PI : 0), new THREE.MeshBasicMaterial({ color: 0xfff6d8 })); tooth.position.set((k - 2) * 0.03, -side * 0.012, 0.1 - Math.abs(k - 2) * 0.02); jaw.add(tooth); }
    head.add(jaw);
    return jaw;
  });
  g.add(stalk, head);
  g.scale.setScalar(0.01);
  const self = { g, head, pos: point.clone().addScaledVector(normal, 0.36), until: t + 25, biteAt: 0, spitAt: t + 0.8, snap: -9 };
  turrets.push(self);
  const epoch = ST.shapeEpoch, look = new THREE.Vector3();
  play(SFX.flora.lift); puff('flora', point, 24, 1.8, { dir: normal, spread: 0.7 });
  ST.hudNote = 'snapper'; ST.lastCast = 'flora'; LATE.drawHud();
  addEffect([g], (n) => {
    if (epoch !== ST.shapeEpoch || n > self.until) { turrets.splice(turrets.indexOf(self), 1); puff('flora', self.pos, 20, 1.6, {}); return false; }
    g.scale.setScalar(Math.min((n - t) / 0.4, 1) * 1.4);
    let prey = null, near = 5;
    for (const e of echoes) { if (e.down) continue; const d = e.group.position.distanceTo(self.pos); if (d < near && lineOfSight(self.pos, e.group.position)) { near = d; prey = e; } }
    const open = n - self.snap < 0.25 ? 0.05 : prey ? 0.5 + 0.2 * Math.sin(n * 9) : 0.12 + 0.08 * Math.sin(n * 2);
    jaws[0].rotation.x = -open; jaws[1].rotation.x = open;
    if (prey) {
      head.lookAt(look.copy(prey.group.position));
      reveal(prey, n, 1.5, ELEMENTS.flora.color);
      look.copy(prey.group.position).sub(self.pos).normalize();
      if (near < 1.1 && n > self.biteAt) { self.biteAt = n + 1.2; self.snap = n; play(SFX.snap); hit(prey, 'flora', n, look, { damage: 1 }); }
      else if (near >= 1.1 && n > self.spitAt) {
        self.spitAt = n + 1.6; self.snap = n;
        play(SFX.spit);
        castBolt('flora', { name: 'Thorn', kind: 'bolt', speed: 12, radius: 0.2, shape: 'orb', size: 0.02, bleed: forms.flora === 'thorn', spore: forms.flora === 'spore', life: 1 }, { hand: self.pos.clone().addScaledVector(look, 0.15), dir: look.clone(), eye: LATE.viewerPos.clone(), fwd: look.clone(), t: n, scale: 1 });
      }
    }
    for (const o of objects) if (!o.dead && o.hostile && o.pos.distanceTo(self.pos) < 0.7) { o.dead = true; self.snap = n; play(SFX.snap); puff('flora', o.pos, 12, 1.6, {}); }   // it eats what flies past
    return true;
  });
  return self;
}
// --- Flora: a line of roots that catches what crosses it ---
export function snare(pts, t) {
  pts = pts.map(p => p.clone());
  const band = new THREE.Mesh(new THREE.BufferGeometry(), energyMat('flora', { scale: [10, 3, 10], flow: [0.4, 0, 0.4], cut: 0.25 }));
  const until = t + 10, last = new Map(), epoch = ST.shapeEpoch;
  let built = -9;
  fireLines.push({ pts, until, flora: true, alive: true });
  const self = fireLines[fireLines.length - 1];
  addEffect([band], (n) => {
    if (epoch !== ST.shapeEpoch || !self.alive) { self.alive = false; return false; }
    if (n - built > 0.15) { built = n; band.geometry.dispose(); band.geometry = ribbonGeo(pts, 0.22, LATE.viewerPos); }
    for (const e of echoes) {
      if (e.down || n - (last.get(e) || -9) < 5 || nearestOnPath(e.group.position, pts, _near).dist > 0.5) continue;
      last.set(e, n);
      hit(e, 'flora', n, UP, { damage: 1, bleed: forms.flora === 'thorn', spore: forms.flora === 'spore' });
    }
    if (n >= until) self.alive = false;
    return n < until;
  });
  ST.hudNote = 'snare';
  return self;
}
// --- Astra: every point you mark gets a comet, in the order you drew them ---
export function constellation(pts, t) {
  pts = pts.filter((p, i) => i % 2 === 0).map(p => p.clone());
  let next = 0;
  const epoch = ST.shapeEpoch;
  addEffect([], (n) => {
    if (epoch !== ST.shapeEpoch) return false;
    for (const p of pts.slice(next)) if (Math.random() < 0.2) puff('astra', p, 1, 0.2, {});
    while (next < pts.length && n - t > 0.7 + next * 0.22) {
      const at = pts[next++];
      const under = collide(at, at.clone().setY(-0.3));
      const land = under ? under.point : at.clone().setY(0);
      let m = { ...MOVES.astra.punch, sky: false };
      if (forms.astra === 'night') m.shadow = true;
      if (forms.astra === 'storm') { m.volt = true; m.rain = true; m.form = 'storm'; }
      castBolt('astra', m, { hand: at.clone().setY(at.y + 2.2), dir: land.clone().sub(at.clone().setY(at.y + 2.2)).normalize(), eye: LATE.viewerPos.clone(), fwd: new THREE.Vector3(0, 0, -1), t: n, scale: 1 });
      play(SFX.astra.punch);
    }
    return next < pts.length;
  });
  ST.hudNote = 'constellation';
  return { pts };
}

// --- Terra: a ridge ---
export function raiseRidge(pts, t, as = null) {
  const form = as ? 'rock' : ST.terraForm;
  // Drop the line onto whatever is under it.
  const ground = [];
  for (const p of pts) {
    const under = collide(p, p.clone().setY(-0.3));
    const q = new THREE.Vector3(p.x, under ? under.point.y : 0, p.z);
    if (!ground.length || Math.hypot(q.x - ground[ground.length - 1].x, q.z - ground[ground.length - 1].z) > 0.4) ground.push(q);
  }
  if (ground.length < 2) { ST.hudNote = 'draw it along the ground'; return null; }
  if (form === 'sand') {
    ground.forEach((q, i) => { if (i % 2 === 0) spawnCloud('sand', q.clone().setY(q.y + 0.5), t, 6); });
    ST.hudNote = 'sand screen';
    return { form };
  }
  const height = 0.75, parts = [], groups = [];
  const mid = new THREE.Vector3();
  for (let i = 0; i < ground.length - 1 && i < 7; i++) {
    const a = ground[i], b = ground[i + 1];
    const along = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
    const len = along.length();
    along.normalize();
    const g = new THREE.Group();
    g.position.set((a.x + b.x) / 2, Math.min(a.y, b.y), (a.z + b.z) / 2);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), along);
    g.add(new THREE.Mesh(craggy(new THREE.BoxGeometry(len + 0.12, height, 0.24, 4, 4, 2).translate(0, height / 2, 0), 0.06), earthMat(form)));
    g.scale.set(1, 0.01, 1);
    const part = { g, alive: true, barrier: null, a, b };
    const crumble = () => {
      if (!part.alive) return;
      part.alive = false; g.visible = false;
      removeBarrier(part.barrier);
      puff('terra', mid.copy(g.position).setY(g.position.y + height * 0.5), 26, 2.4, { jitter: len * 0.4 });
    };
    part.barrier = addBarrier(new THREE.BoxGeometry(len + 0.12, height, 0.26).translate(0, height / 2, 0), g, {
      struck: () => {},                             // your own shots stop on it: it is cover, both ways
      crumble,
      reflect: form === 'metal',
      damage: () => { puff('terra', mid.copy(g.position).setY(g.position.y + height * 0.6), 10, 2, {}); if (--part.barrier.hp <= 0) crumble(); },
    });
    part.barrier.hp = form === 'metal' ? 6 : 3; part.barrier.key = as ? 'morph' : 'terra';
    part.crumble = crumble;
    parts.push(part); groups.push(g);
    puff('terra', g.position, 16, 2, { up: 2, jitter: len * 0.4 });
    for (const e of echoes) if (!e.down && segmentDistance(e.group.position, a, b) < 0.45) hit(e, 'terra', t, UP, { damage: 1, launch: true, form });
  }
  firePulse(ground[ground.length >> 1]);
  thump();
  const until = t + 20, last = new Map(), epoch = ST.shapeEpoch;
  addEffect(groups, (n) => {
    if (epoch !== ST.shapeEpoch) { for (const part of parts) if (part.alive) { part.alive = false; removeBarrier(part.barrier); } return false; }
    const rise = Math.min((n - t) / 0.2, 1);
    let any = false;
    for (const part of parts) {
      if (!part.alive) continue;
      any = true;
      part.g.scale.y = rise;
      if (n > until) part.crumble();
      else if (form === 'lava') {
        lightNow(part.g.position, LAVA_LIGHT, 0.7);
        for (const e of echoes) if (!e.down && n - (last.get(e) || -9) > 1.2 && segmentDistance(e.group.position, part.a, part.b) < 0.45) { last.set(e, n); hit(e, 'pyro', n, UP, { damage: 1 }); }
      }
    }
    return any;
  });
  ST.hudNote = 'ridge';
  return { form, parts };
}

// Reached from modules that load before this one.
Object.assign(LATE, { _np, _nt, stream, clearShaping, quench, turrets, plantTurret });

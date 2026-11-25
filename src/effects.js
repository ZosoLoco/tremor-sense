import * as THREE from 'three';
import { ELEMENTS, forms, lookOf } from './data.js?v=14';
import { play, SFX, tone, thump, thud } from './audio.js?v=14';
import { S, L } from './state.js?v=14';
import { scene, UP } from './renderer.js?v=14';
import { pulseUniforms, FIRE_LIGHT, LAVA_LIGHT, VOLT_LIGHT, addLight, lightNow, firePulse } from './pulse.js?v=14';
import { barriers, addBarrier, removeBarrier, collide, nearestRoomSurface, lineOfSight } from './collision.js?v=14';
import { echoes, glowMat, ICE, isLive, reveal, hit } from './echoes.js?v=14';
import { _to, aimAssist, segmentDistance, flat } from './creatures.js?v=14';
import { ENERGY, waterMat, energyMat, stoneMat, iceMat, earthMat, craggy, particles, smoke, SMOKE, STEAM, DUST, SAND, _fv, fume, PCOL, puff } from './visuals.js?v=14';

// ---------- effects ----------
const fxGroup = new THREE.Group();
scene.add(fxGroup);
export const effects = [];   // each: { update(t, dt) -> false when finished, dispose() }

export function addEffect(objects, update) {
  for (const o of objects) { o.renderOrder = 15; fxGroup.add(o); }
  effects.push({
    update,
    dispose() {
      for (const o of objects) {
        fxGroup.remove(o);
        o.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
      }
    },
  });
}
export function updateEffects(t, dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    if (effects[i].update(t, dt) === false) { effects[i].dispose(); effects.splice(i, 1); }
  }
}

// A flash and a spray of the discipline's own matter where something hits the room.
export function impact(point, normal, key, t, size = 0.22) {
  const color = ELEMENTS[key].color;
  puff(key, point, key === 'terra' ? 22 : 16, key === 'aero' ? 3 : 2.2, { dir: normal, spread: 0.9 });
  if (key === 'terra') fume(DUST, point, 4, { size: 0.28, rise: 0.3 });
  if (key === 'pyro') fume(SMOKE, point, 3, { size: 0.26, rise: 0.8 });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 28), glowMat(color, 0.9));
  ring.position.copy(point).addScaledVector(normal, 0.01);
  ring.lookAt(ring.position.clone().add(normal));
  addEffect([ring], (n) => {
    const k = (n - t) / 0.28;
    ring.scale.setScalar(0.04 + size * k);
    ring.material.opacity = 0.9 * (1 - k);
    return k < 1;
  });
  thud();
}

// --- bolt: anything that flies. Stops at the room unless it has bounces left. ---
function boltMesh(key, m, color) {
  const g = new THREE.Group();
  const size = m.size;
  if (m.shape === 'crescent') {
    // A curved blade of the element itself, bow leading, pattern streaming off the back edge.
    const s = size || 0.16;
    const blade = () => new THREE.RingGeometry(s * 0.66, s, 40, 3, Math.PI + 0.35, Math.PI - 0.7).rotateX(-Math.PI / 2).translate(0, 0, -s * 0.55);
    const matOpts = { flow: [0, 0, -1.4], scale: key === 'aero' ? [9, 9, 9] : [11, 11, 11], cut: key === 'aero' ? 0.4 : key === 'aqua' ? 0.12 : 0.28 };
    for (const tilt of [-0.4, 0.4]) {             // two crossed leaves, so it never goes edge-on and vanishes
      const leaf = new THREE.Mesh(blade(), energyMat(lookOf(key, m), matOpts));
      leaf.rotation.z = tilt;
      g.add(leaf);
    }
    const edge = new THREE.Mesh(new THREE.TorusGeometry(s, Math.max(s * 0.035, 0.007), 6, 40, Math.PI - 0.7), glowMat(color, 0.9));
    edge.geometry.rotateZ(0.35).rotateX(Math.PI / 2).translate(0, 0, -s * 0.55);   // the bright leading rim
    g.add(edge);
  } else if (m.shape === 'rock') {
    const s = size || 0.075;
    g.add(new THREE.Mesh(craggy(new THREE.IcosahedronGeometry(s, 1), s * 0.45), earthMat(m.form)));
  } else if (m.shape === 'shard') {
    // Ice: a long hard splinter with a cold glow around it.
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0).scale(1, 1, 5.5), glowMat(ICE, 0.95));
    const frost = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0).scale(1, 1, 4.2), glowMat(ELEMENTS.aqua.color, 0.3));
    g.add(shard, frost);
  } else if (m.shape === 'disc') {
    // Metal pulled out of the ground: a toothed steel disc that keeps its edge off every wall.
    const disc = new THREE.Mesh(craggy(new THREE.CylinderGeometry(0.12, 0.12, 0.022, 10, 1), 0.03), stoneMat(true));
    disc.name = 'spin';
    g.add(disc);
  } else if (m.shape === 'blob') {
    // A fistful of water holding together in the air, pulled long by its own speed.
    const s = size || 0.085;
    const blob = new THREE.Mesh(new THREE.SphereGeometry(s, 24, 18), waterMat({ flow: [0, 0, -1.2], scale: [9, 9, 9], amp: s * 0.5, body: 0.08 }));
    blob.geometry.scale(1, 1, 1.5);
    g.add(blob);
  } else if (m.shape === 'bone') {
    g.add(new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.28, 4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xeafff4 })));
  } else if (m.shape === 'fist') {
    const bone = new THREE.Mesh(craggy(new THREE.BoxGeometry(0.2, 0.18, 0.24, 2, 2, 2), 0.025), new THREE.MeshBasicMaterial({ color: 0xead2c4 }));
    const flesh = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), energyMat('morph', { scale: [8, 8, 8], cut: 0.35 }));
    g.add(bone, flesh);
  } else if (m.shape === 'needle') {
    g.add(new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.3, 6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xc8102a })));
  } else if (m.shape === 'vortex') {
    // A ball of spinning air: three bands of wind turning inside each other.
    for (let i = 0; i < 3; i++) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 10, 40), energyMat('aero', { flow: [1.4, 0, 0], scale: [5, 12, 5], cut: 0.36 }));
      band.rotation.set(i * 1.05, i * 0.7, 0);
      band.userData.spin = (i % 2 ? -1 : 1) * (9 + i * 3);
      g.add(band);
    }
  } else if (m.shape === 'jet') {
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.075, 1.3, 16, 8, true), energyMat(lookOf(key, m), { flow: [0, 0, -2.5], scale: [12, 12, 3], cut: 0.1 }));
    jet.geometry.rotateX(Math.PI / 2).translate(0, 0, -0.6);
    g.add(jet, new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), glowMat(new THREE.Color(ENERGY.aqua.a), 0.9)));
  } else if (key === 'lumen') {
    // Light: a hard white point with rays, no flame, no tail.
    const s = (size || 0.04) * 2.4;
    g.add(new THREE.Mesh(new THREE.OctahedronGeometry(s * 0.35), new THREE.MeshBasicMaterial({ color: 0xffffff })));
    for (const r of [[1, 0, 0], [0, 1, 0], [0.7, 0.7, 0], [0.7, -0.7, 0]]) {
      const ray = new THREE.Mesh(new THREE.BoxGeometry(s * 2.6, s * 0.06, s * 0.06), glowMat(new THREE.Color(0xfff1b0), 0.85));
      ray.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(...r).normalize());
      g.add(ray);
    }
    const streak = new THREE.Mesh(new THREE.BoxGeometry(s * 0.08, s * 0.08, s * 5).translate(0, 0, -s * 2.5), glowMat(new THREE.Color(0xffffff), 0.7));
    g.add(streak);
  } else if (key === 'astra') {
    // A comet: a small bright head and a long cold tail.
    const s = size || 0.05;
    g.add(new THREE.Mesh(new THREE.SphereGeometry(s * 0.7, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff })));
    const tail = new THREE.Mesh(new THREE.ConeGeometry(s * 1.1, s * 18, 12, 8, true), energyMat('astra', { flow: [0, 0, -3], scale: [20, 20, 3], cut: 0.3 }));
    tail.geometry.rotateX(-Math.PI / 2).translate(0, 0, -s * 9);
    g.add(tail);
  } else if (key === 'flora') {
    if (m.seed || m.entangle) {                     // a seed pod: brown, ridged, turning over as it flies
      const pod = new THREE.Mesh(new THREE.SphereGeometry(size || 0.05, 8, 6).scale(0.8, 0.8, 1.4), new THREE.MeshBasicMaterial({ color: 0x7a5230 }));
      const sprout = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.06, 5).rotateX(-Math.PI / 2).translate(0, 0, -(size || 0.05) * 1.6), new THREE.MeshBasicMaterial({ color: 0x7fd65a }));
      g.add(pod, sprout);
    } else {                                        // a thorn with two leaves for fletching
      g.add(new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.2, 5).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2f6e1a })));
      for (const side of [1, -1]) g.add(new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 3).scale(1, 1, 0.15).rotateZ(side * 1.1).translate(side * 0.03, 0, -0.08), new THREE.MeshBasicMaterial({ color: 0x7fd65a, side: THREE.DoubleSide })));
    }
  } else if (key === 'gravis') {
    // A black marble with a ring of light being pulled round it.
    const s = (size || 0.06) * 1.2;
    g.add(new THREE.Mesh(new THREE.SphereGeometry(s, 16, 12), new THREE.MeshBasicMaterial({ color: 0x05020c })));
    const disc = new THREE.Mesh(new THREE.TorusGeometry(s * 1.9, s * 0.16, 6, 40).scale(1, 1, 0.3), glowMat(new THREE.Color(0xb48cff), 0.9));
    disc.rotation.x = 1.2; disc.userData.spin = 9;
    const disc2 = new THREE.Mesh(new THREE.TorusGeometry(s * 2.6, s * 0.07, 6, 40).scale(1, 1, 0.3), glowMat(new THREE.Color(0xe9dcff), 0.6));
    disc2.rotation.x = 1.2; disc2.userData.spin = -5;
    g.add(disc, disc2);
  } else if (key === 'umbra') {
    // Not a thing so much as a patch of dark with a ragged edge.
    const s = size || 0.06;
    g.add(new THREE.Mesh(new THREE.SphereGeometry(s, 14, 10), new THREE.MeshBasicMaterial({ color: 0x000000, depthTest: false })));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(s * 2, 18, 14), energyMat('umbra', { scale: [10, 10, 10], flow: [0, 0, -1.5], cut: 0.36 })));
  } else if (key === 'aero') {
    // Air is mostly seen by what it drags along: a hard little core and a thin wake.
    const s = size || 0.03;
    g.add(new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), glowMat(color, 0.9)));
    const wake = new THREE.Mesh(new THREE.ConeGeometry(s * 2.2, 0.7, 14, 4, true), energyMat(lookOf(key, m), { flow: [0, 0, -3], scale: [30, 30, 3], opacity: 0.7 }));
    wake.geometry.rotateX(-Math.PI / 2).translate(0, 0, -0.38);
    g.add(wake);
  } else {
    // Fire: a white-hot core inside a ragged shell of flame, with a tail that tears off behind it.
    const s = size || 0.055;
    g.add(new THREE.Mesh(new THREE.SphereGeometry(s * 0.55, 12, 10), glowMat(new THREE.Color(ENERGY.pyro.a), 1)));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(s * 1.5, 18, 14), energyMat(lookOf(key, m), { flow: [0, 0, -1.2], scale: [16, 16, 12] })));
    const tail = new THREE.Mesh(new THREE.ConeGeometry(s * 1.4, s * 9, 14, 6, true), energyMat(lookOf(key, m), { flow: [0, 0, -2.2], scale: [14, 14, 6], cut: 0.44 }));
    tail.geometry.rotateX(-Math.PI / 2).translate(0, 0, -s * 5);   // narrows behind +Z travel
    g.add(tail);
  }
  return g;
}
// What a moving bolt leaves behind it each frame.
const _trail = new THREE.Vector3(), _side = new THREE.Vector3(), _back = new THREE.Vector3();
const _sw = new THREE.Vector3(), _su = new THREE.Vector3();
function boltTrail(key, m, pos, dirN, dt) {
  if (key === 'aero') {                             // two streaks winding round the line of travel
    const ang = pulseUniforms.uTime.value * 34, r = m.shape === 'crescent' ? 0.2 : m.shape === 'vortex' ? 0.3 : 0.07;
    _side.set(-dirN.z, 0, dirN.x).normalize(); _su.crossVectors(dirN, _side);
    for (const ph of [0, Math.PI]) {
      _sw.copy(_side).multiplyScalar(Math.cos(ang + ph)).addScaledVector(_su, Math.sin(ang + ph));
      _trail.copy(pos).addScaledVector(_sw, r);
      particles.emit(_trail, _sw.multiplyScalar(0.5).addScaledVector(dirN, -1.2), PCOL.aero[ph ? 0 : 2], 0.016, 0.22, 0, 2);
    }
  }
  const wide = m.shape === 'crescent' ? (m.size || 0.16) : m.roll ? 0.18 : 0.02;
  const rate = m.shape === 'disc' ? 0 : m.shape === 'shard' ? 40 : ({ pyro: 110, volt: 90, aqua: 80, terra: m.roll ? 60 : 30, aero: 70 }[key] || 70);
  let n = rate * dt; n = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
  _side.set(-dirN.z, 0, dirN.x);
  for (let i = 0; i < n; i++) {
    _trail.copy(pos).addScaledVector(_side, (Math.random() * 2 - 1) * wide);
    if (m.roll) _trail.y = 0.03;
    puff(key, _trail, 1, key === 'aero' ? 1.2 : 0.5, { dir: _back.copy(dirN).negate(), spread: key === 'volt' ? 2 : 0.8, jitter: 0.03 });
  }
}
export function castBolt(key, m, c) {
  const color = ELEMENTS[key].color;
  const vel = c.dir.clone().normalize();
  const pos = c.hand.clone();
  if (m.roll) {                                   // rolls along the floor from in front of you
    vel.copy(flat(vel, c.fwd));
    pos.copy(c.eye).addScaledVector(vel, 0.6).setY(m.size || 0.2);
  } else if (!m.homing) {
    const target = aimAssist(pos, vel, 0.3, c.t);
    if (target) vel.copy(target.group.position).sub(pos).normalize();
  }
  vel.multiplyScalar(m.speed);
  const vk = lookOf(key, m);
  const mesh = boltMesh(vk, m, color);
  mesh.scale.setScalar((m.power || 1) * (c.scale || 1));
  mesh.position.copy(pos);
  puff(key, pos, 10, 1.6, { dir: vel.clone().normalize(), spread: 0.7 });      // muzzle
  const prev = pos.clone();
  const dirN = new THREE.Vector3();
  const look = new THREE.Vector3();
  const struck = new Set(), knocked = new Set();
  const stop = (point, t) => {
    if (m.blast) L.explode(point, key, m.blast, t, 1, !!m.noBurn);
    if (m.form === 'sand') L.spawnCloud('sand', point.clone().setY(Math.max(point.y, 0.5)), t, 4);
    if (m.form === 'steam') L.spawnCloud('steam', point.clone().setY(Math.max(point.y, 0.5)), t, 4);
    if (m.splash) L.splash(point, t, m.splash);
    if (m.implode) L.implode(point, m.implode, t, m.damage || 1, key);
    if (m.boomerang) castBolt(key, { ...m, boomerang: false, life: 1.2 }, { ...c, t, hand: point.clone(), dir: c.eye.clone().setY(c.eye.y - 0.3).sub(point).normalize(), scale: 1 });
    if (m.turret) { L.plantTurret(point, stopNormal || UP, t); }
    if (m.summon) raiseThrall(point.clone().setY(point.y + 0.4), t);
    stopNormal = null;
    if (m.entangle) for (const e of echoes) if (isLive(e, t) && e.group.position.distanceTo(point) < m.entangle) hit(e, 'flora', t, UP, { damage: 1 });
    if (key === 'aqua') L.quench(point, m.freeze ? 1.2 : 0.8, t);
    if (m.quake) L.quake(point, t, m.quake);
    if (m.form === 'lava') L.heatAt(point, 0.6, t);
    return false;
  };
  let bounces = m.bounces || 0;
  const born = c.t, life = m.life || 2.6;
  addEffect([mesh], (t, dt) => {
    if (m.homing) {                               // bend toward the nearest revealed echo ahead
      dirN.copy(vel).normalize();
      let near = null, nearDist = Infinity;
      for (const e of echoes) {
        if (!isLive(e, t) || struck.has(e)) continue;
        _to.copy(e.group.position).sub(mesh.position);
        const dist = _to.length();
        if (dist < nearDist && _to.angleTo(dirN) < 1.3) { nearDist = dist; near = e; }
      }
      if (near) {
        _to.copy(near.group.position).sub(mesh.position).normalize();
        dirN.lerp(_to, Math.min(dt * m.homing, 1)).normalize();
        vel.copy(dirN).multiplyScalar(m.speed);
      }
    }
    if (m.gravity) vel.y -= m.gravity * dt;
    prev.copy(mesh.position);
    mesh.position.addScaledVector(vel, dt);

    const wall = m.sonic ? null : collide(prev, mesh.position);          // sound goes through walls
    let end = null;                               // where this step's travel stops, if it hits the room
    if (wall && wall.object.userData.barrier && !c.hostile) {
      wall.object.userData.barrier.struck(dirN.copy(vel).normalize(), key, t);
      impact(wall.point, wall.normal, key, t, 0.3);
      stopNormal = wall.normal.clone(); return stop(wall.point.clone(), t);
    }
    if (wall) {
      end = wall.point;
      if (bounces > 0) {
        bounces--;
        vel.reflect(wall.normal);
        mesh.position.copy(wall.point).addScaledVector(wall.normal, 0.03);
        impact(wall.point, wall.normal, key, t, 0.14);
        end = null;
      }
    }
    for (const e of echoes) {
      if (!isLive(e, t) || struck.has(e)) continue;
      if (segmentDistance(e.group.position, prev, end || mesh.position) < m.radius) {
        struck.add(e);
        hit(e, key, t, dirN.copy(vel).normalize(), m);
        if (!m.pierce) return stop(e.group.position.clone(), t);
      }
    }
    if (m.freeze || key === 'pyro' || m.form === 'lava') {   // standing water in the path changes state
      for (const src of [...L.sources]) {
        if (segmentDistance(src.pos, prev, end || mesh.position) > 0.45) continue;
        if (m.freeze) L.freezeSource(src, t); else L.evaporate(src, t);
        return stop(src.pos.clone(), t);
      }
    }
    for (const o of L.objects) {                      // loose objects get knocked, lit, or broken
      if (o.dead || o.held || knocked.has(o) || o.def.cloud) continue;
      if (segmentDistance(o.pos, prev, end || mesh.position) > o.def.r + 0.06) continue;
      knocked.add(o);
      dirN.copy(vel).normalize();
      const push = Math.min(m.speed * 0.6, 7);
      L.kick(o, dirN.x * push, 1.2, dirN.z * push);
      if (key === 'pyro' || m.form === 'lava') L.ignite(o, t);
      if (m.freeze && o.def.water) {                // a barrel frozen solid splits into blocks of ice
        o.dead = true; puff('aqua', o.pos, 30, 2, {});
        for (let k = 0; k < 3; k++) L.spawnObject('ice', o.pos.clone().add(new THREE.Vector3((k - 1) * 0.25, 0.1, 0)));
        S.hudNote = 'water to ice'; L.drawHud();
      }
      if ((m.shape === 'rock' || m.shape === 'disc') && (o.def.burns || o.def.water)) L.destroyObject(o, t);
      if (!m.pierce) { impact(o.pos, dirN.clone().negate(), key, t, 0.25); return stop(o.pos.clone(), t); }
    }
    if (end) { impact(wall.point, wall.normal, key, t, m.shape === 'rock' ? 0.4 : 0.25); stopNormal = wall.normal.clone(); return stop(wall.point.clone(), t); }

    dirN.copy(vel).normalize();
    mesh.lookAt(look.copy(mesh.position).add(dirN));
    if (m.shape === 'rock') mesh.rotateX(m.roll ? (t - born) * m.speed / (m.size || 0.2) : t * 9);   // a boulder turns as far as it travels
    if (m.shape === 'disc') mesh.children[0].rotation.y = t * 40;
    if (m.shape === 'vortex') for (const band of mesh.children) band.rotation.z += dt * band.userData.spin;
    if (key === 'gravis') for (const ch of mesh.children) if (ch.userData.spin) ch.rotation.z += dt * ch.userData.spin;
    if (key === 'flora' && m.seed) mesh.children[0].rotation.x += dt * 9;
    boltTrail(vk, m, mesh.position, dirN, dt);
    if (m.form === 'steam' && Math.random() < 0.4) fume(STEAM, mesh.position, 1, { size: 0.16, life: 0.6, rise: 0.2 });
    if (key === 'pyro') lightNow(mesh.position, FIRE_LIGHT, m.blast ? 1.8 : 1.0);
    else if (m.form === 'lava') lightNow(mesh.position, LAVA_LIGHT, 0.8);
    const age = t - born;
    const fade = Math.min(1, (life - age) / 0.3);
    mesh.traverse(o => { if (o.material) o.material.opacity = Math.min(o.material.opacity, Math.max(fade, 0)); });
    return age < life;
  });
}

// --- cone: instant, hits every revealed echo inside it that you have a clear line to. ---
export function castCone(key, m, c) {
  const color = ELEMENTS[key].color;
  const d = c.dir.clone().normalize();
  const origin = c.hand.clone();
  L.coneFlourish(key, m, origin, d, c.t);
  for (const e of echoes) {
    if (!isLive(e, c.t)) continue;
    _to.copy(e.group.position).sub(origin);
    if (_to.length() < m.range && _to.angleTo(d) < m.angle && (m.sonic || lineOfSight(origin, e.group.position))) hit(e, key, c.t, d, m);
  }
  if (key === 'pyro') {
    for (const src of [...L.sources]) { _to.copy(src.pos).sub(origin); if (_to.length() < m.range && _to.angleTo(d) < m.angle + 0.15) L.evaporate(src, c.t); }
  }
  for (const b of [...barriers]) {                // a shove sends a standing wall on its way
    _to.copy(b.collider.position).setY(origin.y).sub(origin);
    if (_to.length() < 2.6 && _to.angleTo(d) < m.angle + 0.4) b.struck(d, key, c.t);
  }
  for (const o of L.objects) {
    if (o.dead || o.held) continue;
    _to.copy(o.pos).sub(origin);
    if (_to.length() < m.range && _to.angleTo(d) < m.angle && lineOfSight(origin, o.pos)) {
      const push = (key === 'aero' ? 8 : 3) * (m.from ? -0.8 : 1);     // vacuum drags it toward you
      const wasHostile = o.hostile;
      L.kick(o, d.x * push, 1.5, d.z * push);
      if (wasHostile && o.owner && !o.owner.down) {  // blown straight back at whoever sent it
        L.sendBack(o, 9);
        S.hudNote = 'deflect'; L.drawHud();
      }
      if (key === 'pyro' || m.form === 'lava') L.ignite(o, c.t);
    }
  }
  // The blast itself: a cone of the element that rushes out and thins, plus loose matter thrown with it.
  const spread = Math.tan(m.angle);
  const body = new THREE.Mesh(
    new THREE.ConeGeometry(spread * m.range, m.range, 32, 10, true).translate(0, -m.range / 2, 0).rotateX(-Math.PI / 2),
    energyMat(lookOf(key, m), { flow: [0, 0, key === 'aero' ? 2.2 : 1.6], scale: key === 'aero' ? [3, 3, 14] : [5, 5, 3.5], cut: key === 'aero' ? 0.5 : 0.3 }),
  );
  body.position.copy(origin);
  body.lookAt(origin.clone().add(d));
  puff(key, origin, key === 'aero' ? 70 : 90, m.range / 0.4, { dir: d, spread: spread * 1.1, life: 0.45, drag: 1.2, grav: key === 'pyro' ? -1 : 0 });
  if (key === 'pyro') addLight(origin.clone().addScaledVector(d, m.range * 0.45), FIRE_LIGHT, 2.4, 0.5);
  if (key === 'aero') {                             // air has no colour of its own: you see the dust and mist it carries off
    for (let i = 1; i <= 5; i++) {
      _to.copy(origin).addScaledVector(d, m.range * i / 6);
      smoke.emit(_to, _fv.copy(d).multiplyScalar(3.5 + i * 0.4), STEAM, 0.16 + i * 0.05, 0.55, 0, 1.5);
    }
    const floor = origin.clone().addScaledVector(d, 1.4).setY(0.08);
    for (let i = 0; i < 5; i++) smoke.emit(_to.copy(floor).addScaledVector(d, i * 0.5), _fv.copy(d).multiplyScalar(2.5).setY(0.6), DUST, 0.22, 0.9, 0, 1.2);
  }
  const rings = [];
  for (let i = 0; i < (key === 'aero' ? 3 : 0); i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 48), glowMat(color, 0));
    ring.lookAt(d);
    rings.push(ring);
  }
  const born = c.t;
  addEffect([body, ...rings], (t) => {
    const age = t - born;
    const grow = Math.min(age / 0.14, 1);
    body.scale.set(0.5 + 0.5 * grow, 0.5 + 0.5 * grow, 0.15 + 0.85 * grow);
    body.material.opacity = 0.7 * Math.max(1 - age / 0.6, 0);     // kept thin: it starts at your own hand
    rings.forEach((ring, i) => {
      const k = (age - i * 0.07) / 0.5;
      if (k < 0 || k > 1) { ring.material.opacity = 0; return; }
      const reach = 0.15 + k * (m.range - 0.3);
      ring.position.copy(origin).addScaledVector(d, reach);
      ring.scale.setScalar(0.08 + reach * spread);
      ring.material.opacity = (1 - k) * 0.5;
    });
    return age < 0.65;
  });
}

// --- column: erupts from the floor under whatever you are facing. Ignores furniture. ---
export function castColumn(key, m, c) {
  const color = ELEMENTS[key].color;
  const d = c.dir.clone().normalize();
  const target = aimAssist(c.eye, d, 0.6, c.t);
  const base = new THREE.Vector3(), axis = new THREE.Vector3(0, 1, 0);
  let height = 1.0;
  if (key !== 'astra') {
    // Every discipline answers from whatever is closest: the floor, a wall beside the target, the ceiling over it, a table.
    const near = target ? nearestRoomSurface(target.group.position, 2.4) : null;
    const seen = !target ? collide(c.eye, c.eye.clone().addScaledVector(d, 12)) : null;
    if (near) { base.copy(near.point); axis.copy(near.normal); height = near.dist + 0.2; }
    else if (target) { base.set(target.group.position.x, 0, target.group.position.z); height = target.group.position.y + 0.18; }
    else if (seen) { base.copy(seen.point); axis.copy(seen.normal); height = 1.1; }
    else base.copy(c.eye).addScaledVector(flat(d, c.fwd), 1.5).setY(0);
  } else if (target) {
    base.set(target.group.position.x, 0, target.group.position.z);
    height = target.group.position.y + 0.18;
  } else {
    base.copy(c.eye).addScaledVector(flat(d, c.fwd), 1.5).setY(0);
  }
  const column = new THREE.Group();
  let body, core = null;
  const spike = key === 'terra' || m.form === 'ice';
  if (spike) {
    // A real spike of rock: wide at the root, sharp at the tip, never the same twice.
    body = new THREE.Mesh(craggy(new THREE.ConeGeometry(Math.max(m.bottom, 0.17), 1, 7, 5).translate(0, 0.5, 0), 0.05), key === 'terra' ? earthMat(m.form) : iceMat());
    column.add(body);
    for (let i = 0; i < 3; i++) {                 // shards crowding the base
      const shard = new THREE.Mesh(craggy(new THREE.ConeGeometry(0.07, 0.4 + Math.random() * 0.25, 5, 2).translate(0, 0.2, 0), 0.03), key === 'terra' ? earthMat(m.form) : iceMat());
      const ang = Math.random() * 6.28;
      shard.position.set(Math.cos(ang) * 0.16, 0, Math.sin(ang) * 0.16);
      shard.rotation.set(Math.sin(ang) * 0.5, 0, -Math.cos(ang) * 0.5);
      shard.scale.y = 1 / Math.max(height, 0.3);  // keep their own height while the spire stretches
      column.add(shard);
    }
  } else {
    const wide = key === 'aero' ? 1 : 1.5;
    body = new THREE.Mesh(
      new THREE.CylinderGeometry(m.top * wide, m.bottom * wide, 1, 28, 12, true).translate(0, 0.5, 0),
      energyMat(lookOf(key, m), { flow: [0, key === 'aero' ? 2.2 : 1.8, 0], fadeY: key === 'aqua' ? 0 : 0.5, cut: key === 'aqua' ? 0.1 : undefined, scale: key === 'aero' ? [5, 1.4, 5] : key === 'aqua' ? [10, 2.2, 10] : [8, 2.6, 8] }),
    );
    column.add(body);
    if (key !== 'aero') {
      core = new THREE.Mesh(new THREE.CylinderGeometry(m.top * 0.3, m.bottom * 0.6, 1, 12, 1, true).translate(0, 0.5, 0), glowMat(new THREE.Color(ENERGY[key].b), 0.22));
      column.add(core);
    }
  }
  const solid = body, wire = core || body;       // faded together below
  column.position.copy(base);
  column.quaternion.setFromUnitVectors(UP, axis);
  column.rotateY(Math.random() * Math.PI);
  const pw = m.power || 1;
  const upright = axis.y > 0.7;
  // A stone spire stays where it grew, as cover, until it is broken or its time runs out.
  let barrier = null, endAt = c.t + 0.75;
  const crumble = (when) => {
    if (!barrier) return;
    removeBarrier(barrier); barrier = null;
    endAt = when;
    puff('terra', base.clone().addScaledVector(axis, height * 0.5), 30, 2.4, { jitter: 0.3 });
  };
  const _rel = new THREE.Vector3();
  const inside = (p, pad) => {                   // is a point within the column, measured along its own axis?
    _rel.copy(p).sub(base);
    const along = _rel.dot(axis);
    return along > -0.2 && along < height + 0.1 && _rel.addScaledVector(axis, -along).length() < m.radius * pw + pad;
  };
  column.scale.set(pw, 0.001, pw);
  if (m.pulse) firePulse(base);                  // Terra's eruption also ripples the room
  if (key === 'aqua' && !m.form) L.addSource(base, axis, c.t, 20);     // where water came up, it keeps coming for a while
  puff(key, base, key === 'terra' ? 40 : 24, 2.4, { up: 2.5, jitter: 0.2 });
  if (key === 'terra') fume(DUST, base, 7, { size: 0.35, jitter: 0.5, rise: 0.5, life: 1.8 });
  const born = c.t;
  const top = new THREE.Vector3();
  let struck = false, spin = Math.random() * 6.28;
  addEffect([column], (t, dt) => {
    const age = t - born;
    const rise = Math.min(age / 0.16, 1);
    if (barrier && t > endAt) crumble(t);
    if (m.form === 'lava') lightNow(top.copy(base).addScaledVector(axis, height * 0.5), LAVA_LIGHT, 1);
    const sink = barrier ? 0 : THREE.MathUtils.clamp((t - endAt) / 0.35, 0, 1);
    column.scale.y = Math.max(height * rise * (1 - sink), 0.001);
    if (m.flicker) { const f = 1 + 0.18 * Math.sin(t * 31); column.scale.x = f * pw; column.scale.z = (2 - f) * pw; }
    solid.material.opacity = 1 - sink;
    if (core) core.material.opacity = 0.22 * (1 - sink);
    if (key === 'pyro' && sink < 1) lightNow(top.copy(base).setY(height * 0.4), FIRE_LIGHT, 1.6 * (1 - sink));
    // Loose matter while it stands: embers climb off fire, a geyser's crown rains down, wind winds upward.
    const tall = column.scale.y;
    if (sink < 1 && rise >= 1) {
      if (key === 'pyro') { top.copy(base).setY(Math.random() * tall); puff(key, top, 3, 0.7, { up: 1.8, jitter: 0.22 }); if (Math.random() < 0.25) fume(SMOKE, top.setY(tall), 1, { rise: 1.1, size: 0.3, life: 1.8 }); }
      else if (key === 'aqua') { top.copy(base).setY(tall); puff(key, top, 4, 1.6, { up: 1.2, jitter: 0.1 }); }
      else if (key === 'aero') {
        spin += dt * 14;
        for (let arm = 0; arm < 3; arm++) {
          const h = ((t * 1.8 + arm / 3) % 1) * tall, ang = spin + arm * 2.094 + h * 5;
          top.set(base.x + Math.cos(ang) * m.radius * 0.55, h, base.z + Math.sin(ang) * m.radius * 0.55);
          puff(key, top, 2, 0.5, { up: 2.5, life: 0.4, size: 0.022 });
        }
      }
    }
    if (!struck && rise >= 1) {
      struck = true;
      const mm = upright ? m : { ...m, launch: false };      // only a spire from below tosses things into the air
      for (const e of echoes) if (isLive(e, t) && inside(e.group.position, 0)) hit(e, key, t, axis, mm);
      for (const o of L.objects) {
        if (o.dead || o.held || !inside(o.pos, o.def.r)) continue;
        L.kick(o, axis.x * 6, axis.y * 6, axis.z * 6);
        if (key === 'pyro' || m.form === 'lava') L.ignite(o, t);
      }
      if (key === 'pyro' || m.form === 'lava') L.heatAt(base, m.radius + 0.6, t);
      if (m.stand) {
        endAt = t + m.stand;
        barrier = addBarrier(new THREE.CylinderGeometry(Math.max(m.bottom, 0.17) * 0.5 * pw, Math.max(m.bottom, 0.17) * pw, height, 8).translate(0, height / 2, 0), column, {
          struck: (dv, k, tt) => crumble(tt),
          crumble: (tt) => crumble(tt),
          reflect: m.form === 'metal',
          damage: (tt) => { if (barrier && --barrier.hp <= 0) crumble(tt); },
        });
        if (m.form === 'metal') barrier.hp = 6;
      }
    }
    return barrier || t < endAt + 0.35;
  });
}

// --- ring: spreads across the floor from where the fist landed. ---
export function castRing(key, m, c) {
  const color = ELEMENTS[key].color;
  const centre = c.ground.clone();
  L.ringFlourish(key, m, centre, c.t);
  const mk = (inner) => {
    const r = new THREE.Mesh(new THREE.RingGeometry(inner, 1, 72).rotateX(-Math.PI / 2), glowMat(color, 0.9));
    r.position.copy(centre).setY(centre.y + 0.02);
    return r;
  };
  const outer = mk(0.95), inner = mk(0.98);
  // The crest riding the ring: flame licking up, a low rolling swell, or a thin wall of air.
  const crest = key === 'pyro' ? 0.55 : key === 'aqua' ? 0.3 : 0.4;
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, crest, 72, 6, true).translate(0, crest / 2, 0),
    energyMat(lookOf(key, m), { flow: [0, key === 'aqua' ? 0.6 : 1.6, 0], fadeY: true, scale: key === 'aero' ? [3, 9, 3] : [2.2, 5, 2.2], cut: key === 'aqua' ? 0.12 : undefined }),
  );
  rim.position.copy(centre);
  puff(key, centre, 30, 3, { up: 2, jitter: 0.1 });
  if (key === 'aqua') L.addSource(centre, UP, c.t, 20);
  const edge = new THREE.Vector3();
  const struck = new Set();
  const born = c.t;
  addEffect([outer, inner, rim], (t) => {
    const r = Math.max((t - born) * 5, 0.01);
    const k = r / m.maxR;
    outer.scale.set(r, 1, r);
    inner.scale.set(r * 0.7, 1, r * 0.7);
    rim.scale.set(r, 1 + 0.6 * (1 - k), r);
    outer.material.opacity = 0.9 * (1 - k);
    inner.material.opacity = 0.5 * (1 - k);
    rim.material.opacity = 1 - k * k;
    if (key === 'pyro') lightNow(centre, FIRE_LIGHT, 2 * (1 - k));
    for (let i = 0; i < 5; i++) {                 // matter kicked up along the travelling edge
      const ang = Math.random() * 6.28;
      edge.set(centre.x + Math.cos(ang) * r, centre.y + 0.05, centre.z + Math.sin(ang) * r);
      puff(key, edge, 1, 0.8, { up: key === 'aqua' ? 1.6 : 1.1 });
    }
    for (const e of echoes) {
      if (!isLive(e, t) || struck.has(e)) continue;
      const p = e.group.position;
      const horiz = Math.hypot(p.x - centre.x, p.z - centre.z);
      if (horiz < r && Math.abs(p.y - centre.y) < m.height + 0.1) {
        struck.add(e);
        hit(e, key, t, _to.set(p.x - centre.x, 0.6, p.z - centre.z).normalize(), m);
      }
    }
    if (key === 'pyro') for (const src of [...L.sources]) if (Math.hypot(src.pos.x - centre.x, src.pos.z - centre.z) < r && Math.abs(src.pos.y - centre.y) < 0.6) L.evaporate(src, t);
    for (const o of L.objects) {
      if (o.dead || o.held || struck.has(o) || Math.hypot(o.pos.x - centre.x, o.pos.z - centre.z) > r) continue;
      struck.add(o);
      _to.set(o.pos.x - centre.x, 0, o.pos.z - centre.z).normalize();
      L.kick(o, _to.x * 2.5, 3.5, _to.z * 2.5);
      if (key === 'pyro' || m.form === 'lava') L.ignite(o, t);
    }
    return k < 1;
  });
}

// --- wall: rises in front of you and rams forward. Stone stops at the room; water rolls through. ---
export function castWall(key, m, c) {
  const color = ELEMENTS[key].color;
  const aim = c.dir.clone().normalize();
  // The wall grows along n, out of whatever surface you are looking at, and faces along d.
  // Floor or table top: an ordinary wall where you looked. A wall of the room: a partition jutting out of it.
  const n = new THREE.Vector3(0, 1, 0), d = flat(aim, c.fwd), centre = new THREE.Vector3();
  const seen = m.passThrough ? null : collide(c.eye, c.eye.clone().addScaledVector(aim, 7));
  if (seen && seen.normal.y < 0.6 && Math.abs(aim.dot(seen.normal)) < 0.9) {
    n.copy(seen.normal); centre.copy(seen.point);
    d.copy(aim).addScaledVector(n, -aim.dot(n)).normalize();
  } else if (seen && seen.normal.y >= 0.6 && seen.point.distanceTo(c.eye) > 1.2) centre.copy(seen.point);
  else centre.copy(c.eye).addScaledVector(d, m.passThrough ? 1.0 : 1.3).setY(0);
  const right = new THREE.Vector3().crossVectors(d, n).normalize();
  const wall = new THREE.Group();
  const basis = new THREE.Matrix4();
  const xAxis = new THREE.Vector3();
  const face = () => wall.quaternion.setFromRotationMatrix(basis.makeBasis(xAxis.crossVectors(n, d).normalize(), n, d));   // a proper right-handed frame
  if (m.passThrough) {
    // A breaking wave: a sheet that leans forward and curls over at the lip.
    const sheet = new THREE.PlaneGeometry(m.width, m.height, 18, 12).translate(0, m.height / 2, 0);
    const sp = sheet.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const u = sp.getY(i) / m.height, x = sp.getX(i) / (m.width / 2);
      const lean = u * u * 0.38 + Math.max(u - 0.7, 0) * 0.9;                 // curl
      const taper = 1 - 0.35 * x * x;                                           // lower at the ends
      sp.setXYZ(i, sp.getX(i), sp.getY(i) * taper - Math.max(u - 0.85, 0) * 0.7, lean);
    }
    sheet.computeVertexNormals();
    wall.add(new THREE.Mesh(sheet, energyMat(lookOf(key, m), { flow: [0, 1.1, 0.4], scale: [5, 7, 5], cut: 0.05 })));
  } else {
    // A slab heaved out of the surface, rough along the top.
    const slab = craggy(new THREE.BoxGeometry(m.width, m.height, 0.22, 9, 6, 2).translate(0, m.height / 2, 0), 0.07);
    if (key !== 'terra') slab.computeVertexNormals();
    wall.add(new THREE.Mesh(slab, key === 'terra' ? earthMat(m.form) : iceMat()));
  }
  puff(key, centre, 36, 2.2, { dir: n, spread: 1, jitter: m.width * 0.8 });
  if (key === 'terra') fume(m.form === 'sand' ? SAND : DUST, centre, 10, { size: 0.4, jitter: m.width, rise: 0.5, life: 2 });
  const foam = new THREE.Vector3(), mid = new THREE.Vector3();
  wall.position.copy(centre);
  face();
  wall.scale.set(1, 0.001, 1);
  const struck = new Set();
  const born = c.t;
  const probeA = new THREE.Vector3(), probeB = new THREE.Vector3();
  let travelled = 0, stoppedAt = -1;
  // Is a point inside the slab, with some slack along the way it faces?
  const within = (p, slack, pad) => {
    _to.copy(p).sub(wall.position);
    const h = _to.dot(n);
    return Math.abs(_to.dot(d)) < slack && Math.abs(_to.dot(right)) < m.width / 2 + pad && h > -0.15 && h < m.height + 0.1 + pad;
  };
  // Stone stands where it rose and blocks like the room does. Hit it with one of your own moves and it charges.
  // Water never stands: a wave rolls out straight away.
  let phase = 'rise', barrier = null, standUntil = 0;
  const launch = (toward, t) => {
    if (phase !== 'stand') return;
    phase = 'ram';
    _to.copy(toward).addScaledVector(n, -toward.dot(n));             // it can only slide across the surface it grew from
    if (_to.lengthSq() > 0.01) { d.copy(_to).normalize(); right.crossVectors(d, n).normalize(); face(); }
    removeBarrier(barrier); barrier = null;
    struck.clear();
    thump(); S.hudNote = 'rampart away'; L.drawHud();
  };
  const crumble = (t) => {
    if (phase !== 'stand') return;
    phase = 'done'; stoppedAt = t;
    removeBarrier(barrier); barrier = null;
    puff(key, mid.copy(wall.position).addScaledVector(n, m.height * 0.5), 40, 2.6, { jitter: m.width * 0.6 });
  };
  addEffect([wall], (t, dt) => {
    const age = t - born;
    const rise = Math.min(age / 0.18, 1);
    let step = 0;
    if (m.form === 'lava') lightNow(mid.copy(wall.position).addScaledVector(n, m.height * 0.5), LAVA_LIGHT, 1.1);
    if (phase === 'rise' && rise >= 1) {
      if (m.stand) {
        phase = 'stand'; standUntil = t + m.stand;
        barrier = addBarrier(new THREE.BoxGeometry(m.width, m.height, 0.24).translate(0, m.height / 2, 0), wall, {
          struck: (dv, k, tt) => launch(dv, tt),
          crumble: (tt) => crumble(tt),
          reflect: m.form === 'metal',
          damage: (tt) => { puff(key, mid.copy(wall.position).addScaledVector(n, m.height * 0.6), 14, 2, { jitter: m.width * 0.5 }); if (barrier && --barrier.hp <= 0) crumble(tt); },
        });
        if (m.form === 'metal') barrier.hp = 6;
        // Whatever was standing where it came up gets thrown.
        for (const e of echoes) if (isLive(e, t) && within(e.group.position, 0.3, 0)) hit(e, key, t, n, { ...m, kind: 'column', launch: n.y > 0.7 });
      } else phase = 'ram';
    }
    if (phase === 'stand' && t > standUntil) crumble(t);
    if (phase === 'ram' && stoppedAt < 0) {
      step = 5 * dt;
      if (!m.passThrough) {
        probeA.copy(wall.position).addScaledVector(n, 0.4);
        probeB.copy(probeA).addScaledVector(d, step + 0.15);
        const blocked = collide(probeA, probeB);
        if (blocked) { step = 0; stoppedAt = t; impact(blocked.point, blocked.normal, key, t, 0.5); }
      }
      wall.position.addScaledVector(d, step);
      travelled += step;
      for (let i = 0; i < 4; i++) {               // dust ground out along the foot, or spray off the lip
        foam.copy(wall.position).addScaledVector(right, (Math.random() - 0.5) * m.width);
        if (m.passThrough) foam.addScaledVector(n, m.height * 0.85).addScaledVector(d, 0.45);
        puff(key, foam, m.passThrough ? 2 : 1, 1, { up: m.passThrough ? 0.9 : 1.2 });
      }
      if (travelled >= m.ram && stoppedAt < 0) stoppedAt = t;
      for (const e of echoes) {
        if (!isLive(e, t) || struck.has(e) || !within(e.group.position, 0.3 + step, 0)) continue;
        struck.add(e);
        hit(e, key, t, d, m);
      }
      for (const o of L.objects) {
        if (o.dead || o.held || !within(o.pos, 0.35 + step, o.def.r)) continue;
        o.vel.copy(d).multiplyScalar(5.5); o.vel.y = Math.max(o.vel.y, 0.8); o.rest = false; L.turn(o);
        if (m.form === 'lava') L.ignite(o, t);
      }
    }
    const sink = stoppedAt < 0 ? 0 : Math.min((t - stoppedAt) / 0.3, 1);
    wall.scale.y = Math.max(rise * (1 - sink), 0.001);
    if (m.passThrough) wall.scale.y *= 1 + 0.12 * Math.sin(t * 14);     // water wobbles
    return sink < 1;
  });
}

// --- fault line: spikes march across a surface from where the fist landed, toward your target, and stop at the room. ---
export function castFault(key, m, c) {
  const start = c.ground.clone();
  const n = (c.normal || UP).clone().normalize();                   // the surface that was struck: floor, wall, table
  const onSurface = (v) => v.clone().addScaledVector(n, -v.dot(n));
  const target = aimAssist(c.eye, c.dir, 0.7, c.t);
  let d = onSurface(c.dir), length = m.length;
  if (d.lengthSq() < 0.01) d = onSurface(c.fwd);
  if (d.lengthSq() < 0.01) d = onSurface(new THREE.Vector3(1, 0, 0));
  d.normalize();
  let reach = 0;                                                     // how far off the surface the target floats
  if (target) {
    _to.copy(target.group.position).sub(start);
    reach = _to.dot(n);
    const across = onSurface(_to);
    if (across.lengthSq() > 0.01) { length = Math.min(m.length + 1.5, across.length() + 0.35); d.copy(across).normalize(); }
  }
  const probe = start.clone().addScaledVector(n, 0.3);
  const blocked = collide(probe, probe.clone().addScaledVector(d, length));
  if (blocked) length = Math.max(blocked.point.distanceTo(probe) - 0.15, 0.4);
  const count = Math.max(2, Math.ceil(length / 0.38));
  const spikes = [];
  const tiltQ = new THREE.Quaternion(), tilt = new THREE.Euler();
  for (let i = 0; i < count; i++) {
    const at = start.clone().addScaledVector(d, 0.3 + (i / count) * length);
    let h = 0.5 + Math.random() * 0.45;
    if (target && onSurface(_to.copy(target.group.position).sub(at)).length() < 0.45) h = Math.max(h, Math.min(reach + 0.2, 2.6));
    const solid = new THREE.Mesh(craggy(new THREE.ConeGeometry(0.1 + Math.random() * 0.06, 1, 6, 4).translate(0, 0.5, 0), 0.04), earthMat(m.form));
    const g = new THREE.Group();
    g.add(solid);
    g.position.copy(at);
    g.quaternion.setFromUnitVectors(UP, n).multiply(tiltQ.setFromEuler(tilt.set((Math.random() - 0.5) * 0.5, Math.random() * 3, (Math.random() - 0.5) * 0.5)));
    g.scale.set(1, 0.001, 1);
    spikes.push({ g, at, h, struck: false, dusted: false });
  }
  firePulse(start);
  const born = c.t;
  const total = count * 0.05 + 1.2;
  const rel = new THREE.Vector3();
  const reached = (p, s, pad) => {                                  // within a spike, measured along the way it points
    rel.copy(p).sub(s.at);
    const along = rel.dot(n);
    return along > -0.2 && along < s.h + 0.15 && rel.addScaledVector(n, -along).length() < 0.35 + pad;
  };
  addEffect(spikes.map(s => s.g), (t) => {
    spikes.forEach((s, i) => {
      const age = t - born - i * 0.05;
      const rise = THREE.MathUtils.clamp(age / 0.1, 0, 1);
      const sink = THREE.MathUtils.clamp((age - 0.8) / 0.3, 0, 1);
      s.g.scale.y = Math.max(s.h * rise * (1 - sink), 0.001);
      if (!s.dusted && age > 0) { s.dusted = true; puff(key, s.at, 12, 2, { dir: n, spread: 0.9, jitter: 0.12 }); fume(m.form === 'sand' ? SAND : DUST, s.at, 2, { size: 0.3, rise: 0.5 }); }
      if (m.form === 'lava' && i % 3 === 0 && rise > 0 && sink < 1) lightNow(s.at, LAVA_LIGHT, 0.7);
      if (!s.struck && rise >= 1) {
        s.struck = true;
        for (const e of echoes) if (isLive(e, t) && reached(e.group.position, s, 0)) hit(e, key, t, n, m);
        for (const o of L.objects) {
          if (o.dead || o.held || !reached(o.pos, s, o.def.r)) continue;
          L.kick(o, n.x * 7, n.y * 7, n.z * 7);
          if (m.form === 'lava') L.ignite(o, t);
        }
      }
    });
    return t - born < total;
  });
}

// A flat strip through a list of points, turned to face the viewer. Used for lightning.
export function ribbonGeo(points, width, eye) {
  const pos = [], idx = [];
  const tan = new THREE.Vector3(), side = new THREE.Vector3(), toEye = new THREE.Vector3();
  points.forEach((p, i) => {
    tan.subVectors(points[Math.min(i + 1, points.length - 1)], points[Math.max(i - 1, 0)]).normalize();
    side.crossVectors(tan, toEye.subVectors(eye, p)).normalize().multiplyScalar(width / 2);
    pos.push(p.x + side.x, p.y + side.y, p.z + side.z, p.x - side.x, p.y - side.y, p.z - side.z);
    if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}
function jagged(a, b, wobble) {
  const n = Math.max(3, Math.ceil(a.distanceTo(b) / 0.22));
  const out = [a.clone()];
  for (let i = 1; i < n; i++) {
    out.push(a.clone().lerp(b, i / n).add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(wobble)));
  }
  out.push(b.clone());
  return out;
}

export function zap(a, b, t) {
  const eye = L.viewerPos.clone();
  const arc = new THREE.Mesh(ribbonGeo(jagged(a, b, 0.08), 0.02, eye), glowMat(new THREE.Color(0xffffff), 1));
  addLight(b, VOLT_LIGHT, 2, 0.2);
  puff('volt', b, 10, 2.5, {});
  addEffect([arc], (n) => { arc.material.opacity = Math.max(1 - (n - t) / 0.18, 0); return n - t < 0.18; });
}
// --- beam: instant. Lightning takes the straight path, then jumps between echoes that are close together. ---
export function castBeam(key, m, c) {
  const origin = c.hand.clone();
  const d = c.dir.clone().normalize();
  const target = aimAssist(origin, d, 0.25, c.t);
  if (target) d.copy(target.group.position).sub(origin).normalize();
  const far = origin.clone().addScaledVector(d, m.range);
  const wall = collide(origin, far);
  const end = wall ? wall.point : far;
  let first = null, firstDist = Infinity;
  for (const e of echoes) {
    if (!isLive(e, c.t) || segmentDistance(e.group.position, origin, end) > 0.25) continue;
    const dist = e.group.position.distanceTo(origin);
    if (dist < firstDist) { firstDist = dist; first = e; }
  }
  const stops = [origin];
  const struck = [];
  if (first) {
    let cur = first, jumps = m.chain || 0;
    struck.push(first); stops.push(first.group.position.clone());
    for (;;) {                                      // soaked echoes pass it on for free
      let next = null, nextDist = Infinity;
      for (const e of echoes) {
        if (!isLive(e, c.t) || struck.includes(e)) continue;
        const wet = e.soakedUntil > c.t || e.metalUntil > c.t;
        if (!wet && jumps <= 0) continue;
        const dist = e.group.position.distanceTo(cur.group.position);
        if (dist < (wet ? 4 : 2.6) && dist < nextDist && lineOfSight(cur.group.position, e.group.position)) { next = e; nextDist = dist; }
      }
      if (!next) break;
      if (!(next.soakedUntil > c.t || next.metalUntil > c.t)) jumps--;
      struck.push(next); stops.push(next.group.position.clone());
      cur = next;
    }
  } else {
    stops.push(end.clone());
    if (wall) impact(wall.point, wall.normal, key, c.t, 0.3);
  }
  const white = new THREE.Color(0xffffff), glow = new THREE.Color(key === 'lumen' ? 0xffe9a0 : 0xffa63d);
  for (let i = 1; i < stops.length; i++) puff(key, stops[i], 18, 3, { life: 0.3, size: 0.03, grav: 3 });
  struck.forEach((e, i) => hit(e, key, c.t, stops[i + 1].clone().sub(stops[i]).normalize(), m));
  tone(2600, 90, 0.16, 0.22, 'square'); tone(140, 40, 0.5, 0.3);
  for (let i = 0; i < stops.length; i++) addLight(stops[i], VOLT_LIGHT, i ? 3 : 1.6, 0.22);

  const core = new THREE.Mesh(new THREE.BufferGeometry(), glowMat(white, 1));
  const halo = new THREE.Mesh(new THREE.BufferGeometry(), glowMat(glow, 0.35));
  const eye = c.eye.clone();
  const born = c.t;
  let redraw = -1;
  addEffect([core, halo], (t) => {
    const age = t - born;
    if (t - redraw > 0.05) {                        // re-fork a few times so it crackles
      redraw = t;
      const pts = [];
      for (let i = 1; i < stops.length; i++) pts.push(...jagged(stops[i - 1], stops[i], m.straight ? 0 : 0.09).slice(i > 1 ? 1 : 0));
      core.geometry.dispose(); halo.geometry.dispose();
      core.geometry = ribbonGeo(pts, 0.022 * (m.power || 1), eye);
      halo.geometry = ribbonGeo(pts, 0.055 * (m.power || 1), eye);
    }
    core.material.opacity = Math.max(1 - age / 0.28, 0);
    halo.material.opacity = 0.35 * Math.max(1 - age / 0.28, 0);
    return age < 0.28;
  });
}

// --- void: the air is pulled out of one spot. Everything near it is dragged together, then it snaps back. ---
export function castVoid(key, m, c) {
  const color = ELEMENTS[key].color;
  const origin = c.hand.clone();
  const d = c.dir.clone().normalize();
  const target = aimAssist(origin, d, 0.3, c.t);
  const centre = new THREE.Vector3();
  if (target && lineOfSight(origin, target.group.position)) centre.copy(target.group.position);
  else {
    const far = origin.clone().addScaledVector(d, target ? origin.distanceTo(target.group.position) : 3);
    const wall = collide(origin, far);
    centre.copy(wall ? wall.point.addScaledVector(wall.normal, 0.25) : far);
  }
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), glowMat(color, 0.4));
  shell.material.wireframe = true;
  shell.position.copy(centre);
  const born = c.t, PULL = 0.55;
  const from = new THREE.Vector3(), inward = new THREE.Vector3();
  let popped = false;
  addEffect([shell], (t, dt) => {
    const age = t - born;
    const k = Math.min(age / PULL, 1);
    if (!popped) {
      shell.scale.setScalar(Math.max(m.radius * (1 - k * 0.92), 0.05));
      shell.rotation.y += dt * 6;
      shell.material.opacity = 0.25 + 0.4 * k;
      for (let i = 0; i < 6; i++) {                 // air rushing in from all sides
        from.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(m.radius * (1 - k * 0.5));
        inward.copy(from).multiplyScalar(-3.2 / Math.max(1 - k * 0.5, 0.3));
        particles.emit(from.add(centre), inward, PCOL.aero[i % 3], 0.022, 0.25, 0, 0);
      }
      for (const e of echoes) {
        if (!isLive(e, t) || e.frozenUntil > t) continue;
        if (e.home.distanceTo(centre) < m.radius) {
          e.home.lerp(centre, Math.min(dt * 6, 1));
          e.restY = e.home.y; e.airborne = false; e.vel.set(0, 0, 0);
        }
      }
      for (const o of L.objects) {
        if (o.dead || o.held || o.pos.distanceTo(centre) > m.radius) continue;
        o.rest = false; L.turn(o);
        o.vel.copy(centre).sub(o.pos).multiplyScalar(7);
      }
      if (k >= 1) {
        popped = true;
        puff(key, centre, 50, 4.5, { life: 0.35 });
        thump();
        for (const e of echoes) {
          if (isLive(e, t) && e.group.position.distanceTo(centre) < 0.5) {
            hit(e, key, t, inward.copy(e.group.position).sub(centre).setY(0).normalize(), m);
          }
        }
      }
      return true;
    }
    const out = (age - PULL) / 0.2;
    shell.scale.setScalar(0.05 + out * m.radius * 0.8);
    shell.material.opacity = 0.6 * (1 - out);
    return out < 1;
  });
}

let stopNormal = null;
// --- lance: not a projectile. The limb extends, runs everything in line through, and retracts.
export function castLance(key, m, c) {
  const d = c.dir.clone().normalize(), t = c.t;
  play(SFX.lance);
  const wall = collide(c.hand, c.hand.clone().addScaledVector(d, m.range));
  const reach = wall ? wall.point.distanceTo(c.hand) : m.range;
  const tip = c.hand.clone().addScaledVector(d, reach);
  const spear = new THREE.Group();
  const bone = new THREE.Mesh(new THREE.ConeGeometry(0.035, 1, 6).rotateX(Math.PI / 2).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color: 0xf0dccf }));
  const sinew = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 1, 8, 6).rotateX(Math.PI / 2).translate(0, 0, 0.5), energyMat('morph', { scale: [14, 14, 3], flow: [0, 0, 2], cut: 0.3 }));
  sinew.scale.set(1, 1, 0.55);
  spear.add(bone, sinew);
  spear.position.copy(c.hand); spear.lookAt(tip);
  for (const e of echoes) if (isLive(e, t) && segmentDistance(e.group.position, c.hand, tip) < 0.32) hit(e, key, t, d, m);
  for (const o of L.objects) if (!o.dead && !o.held && !o.def.cloud && segmentDistance(o.pos, c.hand, tip) < o.def.r + 0.1) L.kick(o, d.x * 5, 1.5, d.z * 5);
  if (wall) impact(wall.point, wall.normal, key, t, 0.25);
  addEffect([spear], (n) => {
    const a = n - t, k = a < 0.07 ? a / 0.07 : a < 0.2 ? 1 : Math.max(1 - (a - 0.2) / 0.16, 0);
    spear.scale.set(1, 1, Math.max(reach * k, 0.01));
    return a < 0.36;
  });
}
// --- Necro: thralls. The dead, raised. They hunt the nearest creature, bite it, and throw themselves in front of shards.
export const thralls = [];
export function raiseThrall(pos, t) {
  if (thralls.length >= 3) thralls[0].until = 0;
  const g = new THREE.Group();
  const bone = new THREE.MeshBasicMaterial({ color: 0xeafff4 }), dark = new THREE.MeshBasicMaterial({ color: 0x06301f });
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8).scale(1, 1.1, 1.15), bone));                      // skull
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.08).translate(0, -0.085, 0.03), bone));               // jaw
  for (const x of [-0.035, 0.035]) {
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6).translate(x, 0.01, 0.085), dark));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 5).translate(x, 0.01, 0.1), glowMat(new THREE.Color(0x6cf0c2), 1)));
  }
  g.position.copy(pos); g.scale.setScalar(0.01);
  const self = { g, pos: g.position, vel: new THREE.Vector3(), until: t + (forms.necro === 'plague' ? 36 : 18), biteAt: 0 };
  thralls.push(self);
  play(SFX.necro.rise); puff('necro', pos, 30, 1.8, { up: 1.5 });
  const epoch = S.shapeEpoch, to = new THREE.Vector3();
  let then = t;
  addEffect([g], (n) => {
    const dt = Math.min(n - then, 0.08); then = n;
    if (epoch !== S.shapeEpoch || n > self.until) { thralls.splice(thralls.indexOf(self), 1); puff('necro', self.pos, 24, 1.6, {}); return false; }
    g.scale.setScalar(Math.min((n - t) / 0.4, 1) * 1.2);
    let prey = null, near = 9;
    for (const e of echoes) { if (e.down) continue; const d = e.group.position.distanceTo(self.pos); if (d < near) { near = d; prey = e; } }
    for (const o of L.objects) if (!o.dead && o.hostile && o.pos.distanceTo(self.pos) < 0.5) { o.dead = true; play(SFX.necro.bite); puff('necro', o.pos, 12, 1.6, {}); self.until -= 3; }   // it takes the hit for you
    if (prey) {
      to.copy(prey.group.position).sub(self.pos);
      self.vel.lerp(to.clone().setLength(near > 0.4 ? 1.7 : 0), Math.min(dt * 4, 1));
      g.lookAt(prey.group.position);
      reveal(prey, n, 1, ELEMENTS.necro.color);
      if (near < 0.5 && n > self.biteAt) { self.biteAt = n + 1; play(SFX.necro.bite); hit(prey, 'necro', n, to.normalize(), { damage: 1, venom: forms.necro === 'plague' }); }
    } else {                                         // nothing to hunt: it comes back and waits by your shoulder
      to.copy(L.viewerPos).add(L._np.set(Math.sin(thralls.indexOf(self) * 2.1) * 0.6, 0.15, Math.cos(thralls.indexOf(self) * 2.1) * 0.6)).sub(self.pos);
      self.vel.lerp(to.multiplyScalar(1.5).clampLength(0, 1.5), Math.min(dt * 3, 1));
    }
    self.pos.addScaledVector(self.vel, dt);
    self.pos.y += Math.sin(n * 3 + self.until) * 0.002;
    if (Math.random() < 0.2) puff('necro', self.pos, 1, 0.2, {});
    return true;
  });
  S.hudNote = 'it rises'; L.drawHud();
  return self;
}
export function castLegion(key, m, c) {
  for (let i = 0; i < m.count; i++) raiseThrall(c.hand.clone().add(new THREE.Vector3(Math.cos(i * 2.1) * 0.5, 0.1, Math.sin(i * 2.1) * 0.5 - 0.4)), c.t + i * 0.001);
}

// Reached from modules that load before this one.
Object.assign(L, { zap, raiseThrall });

import * as THREE from 'three';
import { ELEMENTS } from './data.js?v=15';
import { play, SFX } from './audio.js?v=15';
import { ST, LATE } from './state.js?v=15';
import { scene, camera } from './renderer.js?v=15';
import { glowMat } from './echoes.js?v=15';
import { waterMat, energyMat, earthMat, puff } from './visuals.js?v=15';
import { objects, sendBack, turn } from './objects.js?v=15';
import { WATER_MAX, water } from './water.js?v=15';

// ---------- guard ----------
// Forearms crossed in front of you: a shield in the colour of whatever you are bending. While it is up, nothing thrown
// at you lands, and you cannot attack. What it does with a shard depends on the discipline.
export const guard = { on: false, force: false, since: -1, pos: new THREE.Vector3(), mesh: null, key: null };
function guardMesh(key) {
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.42, 6), key === 'terra' ? earthMat(ST.terraForm) : key === 'aqua' ? waterMat({ flow: [0, -1, 0], scale: [6, 6, 6], amp: 0, body: 0.2 }) : energyMat(key, { scale: [5, 5, 5], flow: [0, 0, 0.6], cut: 0.25 }));
  face.material.side = THREE.DoubleSide;
  const rim = new THREE.Mesh(new THREE.RingGeometry(0.41, 0.44, 6), glowMat(ELEMENTS[key].color.clone(), 0.9));
  g.add(face, rim); g.renderOrder = 17;
  return g;
}
export function updateGuard(t, dt) {
  const want = guard.on || guard.force;
  if (guard.mesh && (!want || guard.key !== ST.selected)) { scene.remove(guard.mesh); guard.mesh.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); guard.mesh = null; }
  if (guard.force) { guard.on = true; guard.pos.copy(LATE.viewerPos).addScaledVector(LATE._fwd.set(0, 0, -1).applyQuaternion(camera.quaternion), 0.45).setY(LATE.viewerPos.y - 0.25); }
  if (!guard.on) { guard.since = -1; return; }
  if (guard.since < 0) { guard.since = t; play(SFX.guard); ST.hudNote = 'guard'; ST.lastCast = ST.selected; LATE.drawHud(); }
  if (!guard.mesh) { guard.mesh = guardMesh(ST.selected); guard.key = ST.selected; scene.add(guard.mesh); }
  guard.mesh.position.copy(guard.pos);
  guard.mesh.lookAt(LATE.viewerPos.x, guard.pos.y, LATE.viewerPos.z);
  guard.mesh.scale.setScalar(Math.min((t - guard.since) / 0.12, 1));
  for (const o of objects) {
    if (o.dead || !o.hostile || o.pos.distanceTo(guard.pos) > 0.7) continue;
    play(SFX.guardHit); puff(ST.selected, o.pos, 18, 2.2, {});
    if (ST.selected === 'aero' || ST.selected === 'lumen' || ST.selected === 'gravis' || (ST.selected === 'terra' && ST.terraForm === 'metal')) { turn(o); sendBack(o, 10); ST.hudNote = 'thrown back'; }
    else {
      o.dead = true;
      if (ST.selected === 'aqua') { water.amount = Math.min(water.amount + 0.5, WATER_MAX * 2); ST.hudNote = 'swallowed'; }
      else if (ST.selected === 'umbra' || ST.selected === 'morph') { ST.hudNote = 'eaten'; }
      else ST.hudNote = 'guarded';
      if (ST.selected === 'pyro' && o.owner && !o.owner.down) o.owner.burnAt = t + 0.6;        // the fire runs back along the throw
      if (ST.selected === 'flora' && o.owner && !o.owner.down) o.owner.rootedUntil = t + 3;
    }
    LATE.drawHud();
  }
}

// Reached from modules that load before this one.
Object.assign(LATE, { guard });

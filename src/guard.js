import * as THREE from 'three';
import { ELEMENTS } from './data.js?v=14';
import { play, SFX } from './audio.js?v=14';
import { S, L } from './state.js?v=14';
import { scene, camera } from './renderer.js?v=14';
import { glowMat } from './echoes.js?v=14';
import { waterMat, energyMat, earthMat, puff } from './visuals.js?v=14';
import { objects, sendBack, turn } from './objects.js?v=14';
import { WATER_MAX, water } from './water.js?v=14';

// ---------- guard ----------
// Forearms crossed in front of you: a shield in the colour of whatever you are bending. While it is up, nothing thrown
// at you lands, and you cannot attack. What it does with a shard depends on the discipline.
export const guard = { on: false, force: false, since: -1, pos: new THREE.Vector3(), mesh: null, key: null };
function guardMesh(key) {
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.42, 6), key === 'terra' ? earthMat(S.terraForm) : key === 'aqua' ? waterMat({ flow: [0, -1, 0], scale: [6, 6, 6], amp: 0, body: 0.2 }) : energyMat(key, { scale: [5, 5, 5], flow: [0, 0, 0.6], cut: 0.25 }));
  face.material.side = THREE.DoubleSide;
  const rim = new THREE.Mesh(new THREE.RingGeometry(0.41, 0.44, 6), glowMat(ELEMENTS[key].color.clone(), 0.9));
  g.add(face, rim); g.renderOrder = 17;
  return g;
}
export function updateGuard(t, dt) {
  const want = guard.on || guard.force;
  if (guard.mesh && (!want || guard.key !== S.selected)) { scene.remove(guard.mesh); guard.mesh.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); guard.mesh = null; }
  if (guard.force) { guard.on = true; guard.pos.copy(L.viewerPos).addScaledVector(L._fwd.set(0, 0, -1).applyQuaternion(camera.quaternion), 0.45).setY(L.viewerPos.y - 0.25); }
  if (!guard.on) { guard.since = -1; return; }
  if (guard.since < 0) { guard.since = t; play(SFX.guard); S.hudNote = 'guard'; S.lastCast = S.selected; L.drawHud(); }
  if (!guard.mesh) { guard.mesh = guardMesh(S.selected); guard.key = S.selected; scene.add(guard.mesh); }
  guard.mesh.position.copy(guard.pos);
  guard.mesh.lookAt(L.viewerPos.x, guard.pos.y, L.viewerPos.z);
  guard.mesh.scale.setScalar(Math.min((t - guard.since) / 0.12, 1));
  for (const o of objects) {
    if (o.dead || !o.hostile || o.pos.distanceTo(guard.pos) > 0.7) continue;
    play(SFX.guardHit); puff(S.selected, o.pos, 18, 2.2, {});
    if (S.selected === 'aero' || S.selected === 'lumen' || S.selected === 'gravis' || (S.selected === 'terra' && S.terraForm === 'metal')) { turn(o); sendBack(o, 10); S.hudNote = 'thrown back'; }
    else {
      o.dead = true;
      if (S.selected === 'aqua') { water.amount = Math.min(water.amount + 0.5, WATER_MAX * 2); S.hudNote = 'swallowed'; }
      else if (S.selected === 'umbra' || S.selected === 'morph') { S.hudNote = 'eaten'; }
      else S.hudNote = 'guarded';
      if (S.selected === 'pyro' && o.owner && !o.owner.down) o.owner.burnAt = t + 0.6;        // the fire runs back along the throw
      if (S.selected === 'flora' && o.owner && !o.owner.down) o.owner.rootedUntil = t + 3;
    }
    L.drawHud();
  }
}

// Reached from modules that load before this one.
Object.assign(L, { guard });

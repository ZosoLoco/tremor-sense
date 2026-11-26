import * as THREE from 'three';
import { ST, LATE } from './state.js?v=16';
import { renderer, now } from './renderer.js?v=16';
import { previewGroup, fallbackFloor, planes, meshes } from './room.js?v=16';

// ---------- collision with the room ----------
// Planes are cheap to test, so they are the colliders whenever the headset provides them.
// The dense room mesh is only used when there are no planes at all.
const colliderList = [];
// Things you built that stand in the room and block like the room does.
//   struck(dir, key, t): called when one of your own moves hits it.  damage(t): called when something hostile does.
export const barriers = [];
const barrierMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
ST.barrierKey = null;                             // the discipline raising whatever is being raised right now
export function addBarrier(geometry, like, handlers) {
  const collider = new THREE.Mesh(geometry, barrierMat);
  collider.position.copy(like.position); collider.quaternion.copy(like.quaternion);
  collider.updateMatrixWorld(true);
  const b = { collider, alive: true, hp: 3, like, key: ST.barrierKey, ...handlers };
  collider.userData.barrier = b;
  barriers.push(b);
  return b;
}
export function clearBarriers() { for (const b of [...barriers]) b.crumble(now()); }
export function removeBarrier(b) {
  if (!b.alive) return;
  b.alive = false;
  b.collider.geometry.dispose();
  const i = barriers.indexOf(b);
  if (i >= 0) barriers.splice(i, 1);
}
export function colliders() {
  colliderList.length = 0;
  if (renderer.xr.isPresenting) {
    if (planes.size) { for (const e of planes.values()) if (e.mesh.visible) colliderList.push(e.mesh); }
    else for (const e of meshes.values()) if (e.mesh.visible) colliderList.push(e.mesh);
    if (fallbackFloor.visible) colliderList.push(fallbackFloor);
  } else {
    for (const m of previewGroup.children) colliderList.push(m);
  }
  for (const b of barriers) if (b.alive) colliderList.push(b.collider);     // walls and spires you raised
  return colliderList;
}
const rayC = new THREE.Raycaster();
const _cd = new THREE.Vector3();
const _nm = new THREE.Matrix3();
// First room surface between a and b. Returns { point, normal } with the normal facing back toward a, or null.
export function collide(a, b) {
  _cd.subVectors(b, a);
  const dist = _cd.length();
  if (dist < 1e-5) return null;
  rayC.set(a, _cd.divideScalar(dist));
  rayC.far = dist;
  const hit = rayC.intersectObjects(colliders(), false)[0];
  if (!hit) return null;
  const normal = new THREE.Vector3(0, 1, 0);
  if (hit.face) normal.copy(hit.face.normal).applyMatrix3(_nm.getNormalMatrix(hit.object.matrixWorld)).normalize();
  if (normal.dot(_cd) > 0) normal.negate();
  return { point: hit.point.clone(), normal, object: hit.object };
}
// The closest piece of the room to a point, whatever it is: floor, wall, ceiling, table, something you built.
const PROBE_DIRS = [];
for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) if (x || y || z) PROBE_DIRS.push(new THREE.Vector3(x, y, z).normalize());
const _pr = new THREE.Vector3();
export function nearestRoomSurface(p, maxDist) {
  let best = p.y >= 0 && p.y < maxDist ? { point: new THREE.Vector3(p.x, 0, p.z), normal: new THREE.Vector3(0, 1, 0), dist: p.y } : null;
  for (const d of PROBE_DIRS) {
    const h = collide(p, _pr.copy(p).addScaledVector(d, maxDist));
    if (!h) continue;
    const dist = h.point.distanceTo(p);
    if (!best || dist < best.dist) best = { point: h.point, normal: h.normal, dist };
  }
  return best;
}
const _eyeToEcho = new THREE.Vector3();
export function lineOfSight(from, to) {
  // Stop a little short so an echo floating right at a surface still counts as visible.
  _eyeToEcho.subVectors(to, from);
  const len = _eyeToEcho.length();
  if (len < 0.15) return true;
  _eyeToEcho.multiplyScalar((len - 0.12) / len).add(from);
  return !collide(from, _eyeToEcho);
}


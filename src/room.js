import * as THREE from 'three';
import { scene } from './renderer.js?v=15';
import { roomMat, edgeGroup, dressed, dress } from './pulse.js?v=15';

// ---------- room surfaces ----------
const roomGroup = new THREE.Group();     // real surfaces from the headset
export const previewGroup = new THREE.Group();  // stand-in room for a flat screen
scene.add(roomGroup, previewGroup, edgeGroup);

// Fallback floor, used in the headset until real planes show up.
export const fallbackFloor = new THREE.Mesh(new THREE.CircleGeometry(4, 48).rotateX(-Math.PI / 2), roomMat);
const staticRoom = [{ mesh: fallbackFloor }];
fallbackFloor.visible = false;
scene.add(fallbackFloor);

function buildPreviewRoom() {
  const add = (geo, x, y, z) => {
    const m = new THREE.Mesh(geo, roomMat);
    m.position.set(x, y, z);
    previewGroup.add(m);
    m.updateMatrixWorld(true);
    staticRoom.push({ mesh: m });
    return m;
  };
  add(new THREE.PlaneGeometry(5, 5).rotateX(-Math.PI / 2), 0, 0, 0);          // floor
  add(new THREE.PlaneGeometry(5, 2.6), 0, 1.3, -2.5);                          // back wall
  add(new THREE.PlaneGeometry(5, 2.6).rotateY(Math.PI / 2), -2.5, 1.3, 0);     // left wall
  add(new THREE.PlaneGeometry(5, 2.6).rotateY(-Math.PI / 2), 2.5, 1.3, 0);     // right wall
  add(new THREE.BoxGeometry(1.2, 0.74, 0.7), -0.9, 0.37, -0.6);                // table
  add(new THREE.BoxGeometry(0.9, 0.45, 1.8), 1.7, 0.225, -0.9);                // couch
}
buildPreviewRoom();

export const planes = new Map();   // XRPlane -> { mesh, changed, pts, inverse }
export const meshes = new Map();   // XRMesh  -> { mesh, changed }

function planeGeometry(polygon) {
  const pts = polygon.map(p => [p.x, p.z]);
  if (pts.length > 3) {
    const a = pts[0], b = pts[pts.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-5 && Math.abs(a[1] - b[1]) < 1e-5) pts.pop();
  }
  const pos = [], nor = [], idx = [];
  for (const [x, z] of pts) { pos.push(x, 0, z); nor.push(0, 1, 0); }
  for (let i = 1; i < pts.length - 1; i++) idx.push(0, i, i + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return { geometry: g, pts };
}

// Which of the room's surfaces get drawn. The headset can report the same room three ways at once (flat planes,
// a box per piece of furniture, and one scanned mesh of everything); drawn together they overlap and fight.
// So: the scanned mesh if there is one, otherwise the boxes, otherwise the planes. Collision still uses all of it.
export function dressRoom() {
  for (const e of dressed) e.live = false;
  let scan = null;
  for (const [xm, e] of meshes) if (xm.semanticLabel === 'global mesh') scan = e;
  for (const [, e] of meshes) dress(e, scan ? e === scan : true);
  for (const [, e] of planes) dress(e, meshes.size === 0);
  for (const e of staticRoom) { e.mesh.updateMatrixWorld(); dress(e, true); if (!e.mesh.visible) e.edges.visible = false; }
  for (const e of dressed) if (!e.live) { edgeGroup.remove(e.edges); e.edges.geometry.dispose(); dressed.delete(e); }
}
export function syncRoom(frame, refSpace) {
  const detectedPlanes = frame.detectedPlanes;
  if (detectedPlanes) {
    for (const [plane, entry] of planes) {
      if (!detectedPlanes.has(plane)) {
        roomGroup.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        planes.delete(plane);
      }
    }
    detectedPlanes.forEach(plane => {
      let entry = planes.get(plane);
      if (!entry || entry.changed !== plane.lastChangedTime) {
        const { geometry, pts } = planeGeometry(Array.from(plane.polygon));
        if (!entry) {
          const mesh = new THREE.Mesh(geometry, roomMat);
          mesh.matrixAutoUpdate = false;
          mesh.frustumCulled = false;
          roomGroup.add(mesh);
          entry = { mesh, inverse: new THREE.Matrix4() };
          planes.set(plane, entry);
        } else {
          entry.mesh.geometry.dispose();
          entry.mesh.geometry = geometry;
        }
        entry.pts = pts;
        entry.changed = plane.lastChangedTime;
      }
      const pose = frame.getPose(plane.planeSpace, refSpace);
      if (pose) {
        entry.mesh.visible = true;
        entry.mesh.matrix.fromArray(pose.transform.matrix);
        entry.mesh.matrixWorld.copy(entry.mesh.matrix);
        entry.inverse.copy(entry.mesh.matrix).invert();
      } else {
        entry.mesh.visible = false;
      }
    });
  }

  const detectedMeshes = frame.detectedMeshes;
  if (detectedMeshes) {
    for (const [xrMesh, entry] of meshes) {
      if (!detectedMeshes.has(xrMesh)) {
        roomGroup.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        meshes.delete(xrMesh);
      }
    }
    detectedMeshes.forEach(xrMesh => {
      let entry = meshes.get(xrMesh);
      if (!entry || entry.changed !== xrMesh.lastChangedTime) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(xrMesh.vertices), 3));
        g.setIndex(new THREE.BufferAttribute(new Uint32Array(xrMesh.indices), 1));
        g.computeVertexNormals();
        if (!entry) {
          const mesh = new THREE.Mesh(g, roomMat);
          mesh.matrixAutoUpdate = false;
          mesh.frustumCulled = false;
          roomGroup.add(mesh);
          entry = { mesh };
          meshes.set(xrMesh, entry);
        } else {
          entry.mesh.geometry.dispose();
          entry.mesh.geometry = g;
        }
        entry.changed = xrMesh.lastChangedTime;
      }
      const pose = frame.getPose(xrMesh.meshSpace, refSpace);
      if (pose) {
        entry.mesh.visible = true;
        entry.mesh.matrix.fromArray(pose.transform.matrix);
        entry.mesh.matrixWorld.copy(entry.mesh.matrix);
      } else {
        entry.mesh.visible = false;
      }
    });
  }

  // When the headset has a scanned room, planes cover the floor; until then use the stand-in.
  fallbackFloor.visible = planes.size === 0 && meshes.size === 0;
}

export function clearRoom() {
  for (const { mesh } of planes.values()) { roomGroup.remove(mesh); mesh.geometry.dispose(); }
  for (const { mesh } of meshes.values()) { roomGroup.remove(mesh); mesh.geometry.dispose(); }
  planes.clear();
  meshes.clear();
}

function pointInPolygon(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// Nearest real surface to a world point. Returns { dist, point }.
const _local = new THREE.Vector3();
export function nearestSurface(world) {
  let best = null;
  for (const entry of planes.values()) {
    if (!entry.mesh.visible) continue;
    _local.copy(world).applyMatrix4(entry.inverse);
    const d = Math.abs(_local.y);
    if (d > 0.3 || (best && d >= best.dist)) continue;
    if (!pointInPolygon(_local.x, _local.z, entry.pts)) continue;
    const point = new THREE.Vector3(_local.x, 0, _local.z).applyMatrix4(entry.mesh.matrix);
    best = { dist: d, point };
  }
  // The floor always counts, scanned room or not.
  const dFloor = Math.abs(world.y);
  if (!best || dFloor < best.dist) best = { dist: dFloor, point: new THREE.Vector3(world.x, 0, world.z) };
  return best;
}


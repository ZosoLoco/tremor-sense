import * as THREE from 'three';
import { ELEMENTS, ELEMENT_ORDER, GRABS, holdKey, PALM_SENSE, TOUCH_SENSE, GESTURES } from './data.js?v=15';
import { ensureAudio } from './audio.js?v=15';
import { ST, LATE } from './state.js?v=15';
import { chipEls, moveEls } from './core.js?v=15';
import { renderer, camera, UP, now } from './renderer.js?v=15';
import { firePulse } from './pulse.js?v=15';
import { previewGroup } from './room.js?v=15';
import { collide } from './collision.js?v=15';
import { aimAssist, flat } from './creatures.js?v=15';
import { cast } from './flourish.js?v=15';
import { addSource } from './water.js?v=15';
import { findGrabTarget, beginHold, endHold, throwCharged } from './grip.js?v=15';
import { resonate } from './seal.js?v=15';
import { guard } from './guard.js?v=15';
import { stream, startStream, drawBegin, drawEnd, _cp } from './shaping.js?v=15';
import { rootSense, senseAero } from './senses.js?v=15';
import { selectElement, flipSwitch } from './selection.js?v=15';
import { drawHud } from './hud.js?v=15';
import { raycaster } from './hands.js?v=15';

// ---------- flat screen preview ----------
ST.previewGesture = 'sense';
ST.previewHold = null;      // { kind, until, origin, dir }
export function selectGesture(g) {
  ST.previewGesture = g;
  if (squeezeBtn) squeezeBtn.style.display = g === 'grip' || g === 'draw' ? '' : 'none';
  for (const el of moveEls) el.classList.toggle('on', el.dataset.g === g);
}
const pointer = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', (ev) => {
  if (renderer.xr.isPresenting) return;
  ensureAudio();
  pointer.set((ev.clientX / window.innerWidth) * 2 - 1, -(ev.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  raycaster.far = Infinity;
  const t = now();
  const eye = raycaster.ray.origin.clone();
  const aim = raycaster.ray.direction.clone();
  const hit = raycaster.intersectObjects(previewGroup.children, false)[0];
  const target = aimAssist(eye, aim, 0.14, t);
  const aimPoint = target ? target.group.position.clone() : hit ? hit.point.clone() : eye.clone().addScaledVector(aim, 4);
  // Where a right hand would be.
  const hand = eye.clone().add(new THREE.Vector3(0.25, -0.3, -0.35).applyQuaternion(camera.quaternion));
  const dir = aimPoint.clone().sub(hand).normalize();
  const fwd = flat(aim);

  if (ST.previewGesture === 'seal') { resonate(ST.selected, t); return; }
  if (ST.previewGesture === 'draw') {                 // press and drag: the pointer is the pinch
    previewAim.copy(aim);
    previewDraw.down = true;
    if (ST.selected === 'aqua' || ST.selected === 'morph') {
      previewDraw.ctl = { root: previewPinch(new THREE.Vector3()), dir: aim.clone(), vel: new THREE.Vector3(), eye: eye.clone(), grip: false, squeeze: false, end: null };
      ST.streamCtl = previewDraw.ctl;
      if (!startStream(ST.streamCtl, t, ST.selected)) { ST.streamCtl = previewDraw.ctl = null; }
    } else drawBegin(ST.selected, previewPinch(new THREE.Vector3()));
    return;
  }
  if (ST.previewGesture === 'charge') { previewAim.copy(aim); previewGrip.chargeFrom = t; return; }
  if (ST.previewGesture === 'grip') {
    previewAim.copy(aim);
    if (!GRABS[ST.selected]) { previewGrip.chargeFrom = t; return; }
    const tgt = findGrabTarget(holdKey(ST.selected), eye, aim, t);
    if (tgt) beginHold(previewGrip, holdKey(ST.selected), tgt, eye, t);
    return;
  }
  if (ST.previewGesture === 'sense') {
    if (TOUCH_SENSE[ST.selected]) { if (hit) { firePulse(hit.point); if (ST.selected === 'flora') rootSense(hit.point, t); } }
    else if (ST.selected === 'aero') senseAero(hand, t);
    else if (ST.selected === 'aqua') { ST.previewHold = { kind: 'aqua', until: t + 2.2, origin: hand, dir }; if (hit) addSource(hit.point, hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : UP, t); }
    else ST.previewHold = { kind: PALM_SENSE[ST.selected] ? 'lumen' : 'pyro', until: t + 2.2, origin: eye };
    if (ST.selected !== 'aero') { ST.hudNote = ELEMENTS[ST.selected].sense.toLowerCase(); drawHud(); }
    return;
  }
  const c = { hand, dir, eye, fwd, t, power: ev.shiftKey ? 1.6 : 1, st: previewHand };
  if (ST.previewGesture === 'lift' || ST.previewGesture === 'sweep') c.dir = aimPoint.clone().sub(eye).normalize();
  if (ST.previewGesture === 'slam') {
    c.ground = eye.clone().addScaledVector(fwd, 1.1).setY(0);
    c.normal = UP.clone();
    c.dir = aimPoint.clone().sub(eye).normalize();
  }
  cast(ST.selected, ST.previewGesture, c);
});
// Preview grip: press and drag to hold, release to throw. C (or the Squeeze button) is the other fist.
export const previewGrip = { hold: null, chargeFrom: -1, squeeze: false, prevSqueeze: false };
export const previewAim = new THREE.Vector3(0, 0, -1);
export const previewDraw = { down: false, ctl: null };
export const previewHand = { valid: true, palm: new THREE.Vector3(), across: new THREE.Vector3(1, 0, 0) };
// Where the pinch is in the preview: on the surface under the pointer for fire and stone, out in the air for wind and water.
export function previewPinch(out) {
  if (ST.selected === 'aqua' || ST.selected === 'morph') return out.copy(camera.position).addScaledVector(previewAim, 0.9);
  if (ST.selected === 'aero') return out.copy(camera.position).addScaledVector(previewAim, 2.2);
  const far = collide(camera.position, _cp.copy(camera.position).addScaledVector(previewAim, 8));
  return far ? out.copy(far.point).addScaledVector(far.normal, 0.2) : out.copy(camera.position).addScaledVector(previewAim, 3);
}
const squeezeBtn = document.getElementById('squeeze');
renderer.domElement.addEventListener('pointermove', (ev) => {
  if (renderer.xr.isPresenting) return;
  pointer.set((ev.clientX / window.innerWidth) * 2 - 1, -(ev.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  previewAim.copy(raycaster.ray.direction);
});
const releasePreview = () => {
  if (renderer.xr.isPresenting) return;
  if (previewDraw.down) {
    previewDraw.down = false;
    if (previewDraw.ctl) { previewDraw.ctl = null; ST.streamCtl = null; stream.seenT = -9; }
    else drawEnd(now());
  }
  if (previewGrip.hold) endHold(previewGrip);
  if (previewGrip.chargeFrom >= 0) {
    const t = now(), charge = t - previewGrip.chargeFrom;
    previewGrip.chargeFrom = -1;
    if (charge > 0.3) {
      const hand = camera.position.clone().add(new THREE.Vector3(0.25, -0.3, -0.35).applyQuaternion(camera.quaternion));
      const tgt = camera.position.clone().addScaledVector(previewAim, 4);
      throwCharged(ST.selected, hand, tgt.sub(hand).normalize(), camera.position.clone(), flat(previewAim), charge, t);
    }
  }
};
renderer.domElement.addEventListener('pointerup', releasePreview);
renderer.domElement.addEventListener('pointercancel', releasePreview);
window.addEventListener('keydown', (ev) => { if (ev.key.toLowerCase() === 'c') previewGrip.squeeze = true; if (ev.key.toLowerCase() === 'g') guard.force = true; });
window.addEventListener('keyup', (ev) => { if (ev.key.toLowerCase() === 'g') { guard.force = false; guard.on = false; } });
window.addEventListener('keyup', (ev) => { if (ev.key.toLowerCase() === 'c') previewGrip.squeeze = false; });
if (squeezeBtn) {
  squeezeBtn.addEventListener('pointerdown', () => { previewGrip.squeeze = true; });
  for (const name of ['pointerup', 'pointerleave', 'pointercancel']) squeezeBtn.addEventListener(name, () => { previewGrip.squeeze = false; });
}
const optionEls = Array.from(document.querySelectorAll('[data-opt]'));
for (const el of optionEls) el.addEventListener('click', () => { ensureAudio(); flipSwitch(el.dataset.opt === 'calm' ? 0 : 2); });
for (const el of chipEls) el.addEventListener('click', () => { ensureAudio(); selectElement(el.dataset.el); });
for (const el of moveEls) el.addEventListener('click', () => { ensureAudio(); selectGesture(el.dataset.g); });
window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Tab') { ev.preventDefault(); selectElement(ST.prevSelected, true); return; }
  const i = '1234567890-'.indexOf(ev.key);
  if (i >= 0) selectElement(ELEMENT_ORDER[i]);
  const g = 'qwertyuiop['.indexOf(ev.key.toLowerCase());
  if (g >= 0) selectGesture(GESTURES[g]);
});

// Reached from modules that load before this one.
Object.assign(LATE, { optionEls });
LATE.previewHand = previewHand;

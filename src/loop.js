import * as THREE from 'three';
import { KINDS, ELEMENTS, ELEMENT_ORDER, GRABS, holdKey, forms, MOVES } from './data.js?v=14';
import { ensureAudio, play, SFX, FORM_SFX, getAudio } from './audio.js?v=14';
import { S, L } from './state.js?v=14';
import { formOf } from './core.js?v=14';
import { renderer, scene, camera, now } from './renderer.js?v=14';
import { pulseUniforms, lights, updateLights, firePulse } from './pulse.js?v=14';
import { planes, meshes, dressRoom, syncRoom } from './room.js?v=14';
import { barriers, clearBarriers, collide, nearestRoomSurface, lineOfSight } from './collision.js?v=14';
import { echoes, roomBounds, isOpen, scatterEchoes, reveal, hit } from './echoes.js?v=14';
import { CREATURE, AI, spit, playerHurt, updateEchoes } from './creatures.js?v=14';
import { particles, smoke, tuneDetail } from './visuals.js?v=14';
import { effects, updateEffects, thralls, raiseThrall } from './effects.js?v=14';
import { ringFlourish, coneFlourish, dressEcho, shoveBarrier, cast } from './flourish.js?v=14';
import { objects, spawnObject, scatterObjects, spawnCloud, ignite, kick, implode, explode, updateObjects } from './objects.js?v=14';
import { sources, addSource, water, updateWater } from './water.js?v=14';
import { findGrabTarget, beginHold, updateHold, endHold, reticles, showReticle, hideOrbs, showCharge, throwCharged, throwFireball } from './grip.js?v=14';
import { blades, summonBlade, updateBlades, voids, updateVoids, rain, updateClaws, updateThreats } from './constructs.js?v=14';
import { SEALS, resonate, updateStorm } from './seal.js?v=14';
import { guard, updateGuard } from './guard.js?v=14';
import { stream, startStream, endStream, updateStream, plantWall, drawBegin, drawAdd, drawEnd, familiars, summonFamiliar, currents, makeCurrent, _cp, updateCurrents, bendCurrents, fireLines, quench, fireLine, mirrorLine, rift, turrets, plantTurret, snare, constellation, raiseRidge } from './shaping.js?v=14';
import { senseAero, tideUniforms, chiGhosts, held, updateHeldSenses } from './senses.js?v=14';
import { setForm, cycleForm, selectElement, options, flipSwitch } from './selection.js?v=14';
import { drawHud } from './hud.js?v=14';
import { waterAnchor, _off, classifyGesture, isTwin, updateHands } from './hands.js?v=14';
import { selectGesture, previewGrip, previewAim, previewDraw, previewHand, previewPinch } from './preview.js?v=14';

// ---------- loop ----------
const viewerPos = new THREE.Vector3();
const viewerQuat = new THREE.Quaternion();
let last = 0;
let demoFired = false;

selectElement('terra', true);
selectGesture('sense');
scatterEchoes();

renderer.setAnimationLoop((ms, frame) => {
  const t = ms / 1000;
  const dt = Math.min(t - last, 0.1);
  last = t;
  pulseUniforms.uTime.value = t;

  if (frame && renderer.xr.isPresenting) {
    const refSpace = renderer.xr.getReferenceSpace();
    const viewer = refSpace && frame.getViewerPose(refSpace);
    if (viewer) {
      const p = viewer.transform.position, q = viewer.transform.orientation;
      viewerPos.set(p.x, p.y, p.z);
      viewerQuat.set(q.x, q.y, q.z, q.w);
      syncRoom(frame, refSpace);
      updateHands(frame, refSpace, t, dt, viewerPos);

      const elapsed = t - S.sessionStart;
      // No scanned room after a few seconds: ask the headset to run room setup once.
      if (!S.askedForRoom && elapsed > 5 && planes.size === 0 && meshes.size === 0) {
        S.askedForRoom = true;
        if (typeof frame.session.initiateRoomCapture === 'function') {
          frame.session.initiateRoomCapture().catch(() => {});
        }
      }
      // Hide the echoes once we know the room's size (or after a short wait).
      if (!S.placed && (planes.size >= 3 || elapsed > 6)) { S.placed = true; scatterEchoes(); }
    }
  } else {
    // Gentle camera sway so the preview reads as a 3D room.
    camera.position.x = 0.4 + Math.sin(t * 0.25) * 0.5;
    camera.lookAt(0, 0.9, 0);
    viewerPos.copy(camera.position);
    if (!demoFired && t > 1.2) { demoFired = true; firePulse(new THREE.Vector3(-0.9, 0.74, -0.6)); }
    previewHand.palm.copy(camera.position).add(_off.set(0.25, -0.2, -0.5).applyQuaternion(camera.quaternion)).addScaledVector(previewAim, 0.25);
    previewHand.across.set(-previewAim.x * 0.6, -1, -previewAim.z * 0.6).normalize();
    if (previewDraw.down) {
      if (previewDraw.ctl) {
        const c = previewDraw.ctl;
        const was = c.root.clone();
        previewPinch(c.root);
        c.vel.copy(c.root).sub(was).divideScalar(Math.max(dt, 1e-3));
        c.dir.copy(previewAim); c.eye.copy(camera.position);
        c.grip = previewGrip.squeeze;
        S.streamCtl = c;
      } else drawAdd(previewPinch(_cp));
    }
    if (S.previewGesture === 'grip' || S.previewGesture === 'charge') {
      const hand = camera.position.clone().add(new THREE.Vector3(0.25, -0.3, -0.35).applyQuaternion(camera.quaternion));
      reticles[1].visible = false; hideOrbs(1);
      if (previewGrip.hold) {
        reticles[0].visible = false;
        updateHold(previewGrip, camera.position, previewAim, 1, { hand, squeeze: previewGrip.squeeze, squeezeEdge: previewGrip.squeeze && !previewGrip.prevSqueeze }, t, dt);
      } else if (GRABS[S.selected] && S.previewGesture === 'grip') showReticle(0, findGrabTarget(holdKey(S.selected), camera.position, previewAim, t), holdKey(S.selected), camera.position);
      else reticles[0].visible = false;
      showCharge(0, hand, previewGrip.chargeFrom >= 0 ? t - previewGrip.chargeFrom : 0, S.selected);
      previewGrip.prevSqueeze = previewGrip.squeeze;
    } else { reticles[0].visible = false; hideOrbs(0); }
    if (S.previewHold) {
      if (t > S.previewHold.until) S.previewHold = null;
      else if (S.previewHold.kind === 'aqua') held.aqua = { origin: camera.position, dir: S.previewHold.dir };
      else if (S.previewHold.kind === 'lumen') held.lumen = { origin: camera.position };
      else held.pyro = { centre: S.previewHold.origin };
    }
  }

  if (!renderer.xr.isPresenting) {
    S.waterAnchorOn = S.selected === 'aqua';
    waterAnchor.copy(camera.position).add(_off.set(0.3, -0.18, -0.45).applyQuaternion(camera.quaternion));
  }
  dressRoom();
  {                                                 // live depth, when the headset gives it
    const live = renderer.xr.isPresenting && renderer.xr.hasDepthSensing();
    const dm = live ? renderer.xr.getDepthSensingMesh() : null;
    if (dm) dm.visible = S.occlusion;
    pulseUniforms.uBias.value = live && S.occlusion ? 0.04 : 0;
    if (live && !S.depthSeen) { S.depthSeen = true; S.hudNote = 'live depth on: hands hide things'; drawHud(); }
  }
  updateGuard(t, dt);
  updateBlades(t, dt);
  updateClaws(t, dt);
  updateThreats(t);
  updateStorm(t);
  updateVoids(t);
  rain(t);
  updateStream(t, dt);
  updateCurrents(t, dt, viewerPos);
  if (S.waterBoost && S.selected === 'aqua') { S.waterAnchorOn = true; waterAnchor.copy(S.waterBoost).add(_off.set(0, 0.1, 0)); }
  updateWater(t, dt, S.waterAnchorOn ? waterAnchor : null, !!S.waterBoost && S.selected === 'aqua');
  S.waterBoost = null;
  updateHeldSenses(t, dt);
  updateObjects(t, dt);
  updateEchoes(t, dt, viewerPos);
  tuneDetail(t, dt);
  updateEffects(t, dt);
  updateLights(t);
  const layer = frame && renderer.xr.isPresenting ? frame.session.renderState.baseLayer : null;
  particles.material.uniforms.uHalfH.value = layer ? (layer.framebufferHeight || 1800) / 2 : renderer.domElement.height / 2;
  particles.update(dt);
  smoke.material.uniforms.uHalfH.value = particles.material.uniforms.uHalfH.value;
  smoke.update(dt);
  renderer.render(scene, camera);
});

// Small hook for automated checks.
window.__tremor = {
  THREE, firePulse, echoes, pulseUniforms, MOVES, ELEMENTS, cast, classifyGesture, scatterEchoes, effects,
  collide, lineOfSight, senseAero, selectElement, held, reveal, particles, hit, isTwin, tideUniforms, chiGhosts,
  get draftOn() { return now() < S.draftUntil; },
  mirrorLine, rift, implode, ELEMENT_ORDER, ringFlourish, coneFlourish, SEALS, resonate, dressEcho, set sealAt(v) { S.sealAt = v; }, thralls, raiseThrall, familiars, summonFamiliar, get prevSelected() { return S.prevSelected; }, turrets, plantTurret, blades, summonBlade, voids, shoveBarrier, previewHand, guard, snare, constellation, quench, fireLines, KINDS, get armourUntil() { return S.armourUntil; }, get playerHP() { return S.playerHP; }, set playerHP(v) { S.playerHP = v; }, get occlusion() { return S.occlusion; }, SFX, FORM_SFX, play, ensureAudio, get audio() { return getAudio(); },
  stream, startStream, endStream, plantWall, currents, makeCurrent, bendCurrents, fireLine, raiseRidge, drawBegin, drawAdd, drawEnd,
  get streamCtl() { return S.streamCtl; }, set streamCtl(v) { S.streamCtl = v; if (!v) stream.seenT = -9; },
  objects, spawnObject, scatterObjects, findGrabTarget, beginHold, updateHold, endHold, explode, throwFireball, throwCharged, kick,
  barriers, isOpen, nearestRoomSurface, roomBounds, clearBarriers, AI, CREATURE, playerHurt, spit, sources, addSource, water,
  cycleForm, get form() { return S.terraForm; }, setForm(f) { setForm('terra', f); }, forms, setFormOf: setForm, formOf, lights, KINDS, options, flipSwitch,
  get wave() { return S.wave; }, set wave(n) { S.wave = n; }, get active() { return S.activeCount; }, get detail() { return S.detail; },
  spawnCloud, smoke, ignite,
  get hp() { return S.playerHP; }, attackSoon() { S.nextAttackAt = 0; },
  setHold(h) { S.previewHold = h; },
  get down() { return S.downCount; },
  get selected() { return S.selected; },
};

// Reached from modules that load before this one.
Object.assign(L, { viewerPos, viewerQuat });

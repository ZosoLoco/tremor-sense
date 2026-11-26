import * as THREE from 'three';
import { TOUCH_ON, SLAM_ON, TOUCH_OFF, CURL_OPEN, CURL_FIST, PUNCH_SPEED, PUSH_SPEED, LIFT_SPEED, SWEEP_SPEED, REARM_SPEED, CAST_COOLDOWN, HOLD_STILL, HOLD_TIME, POINT_SPEED, CLAP_ON, CLAP_OFF, ELEMENTS, ELEMENT_ORDER, GRABS, holdKey, FIST_SENSE, PALM_SENSE, TOUCH_SENSE, FORMS, MOVES } from './data.js?v=16';
import { play, SFX, tick, thump } from './audio.js?v=16';
import { ST, LATE } from './state.js?v=16';
import { formOf } from './core.js?v=16';
import { renderer, UP, now } from './renderer.js?v=16';
import { firePulse } from './pulse.js?v=16';
import { nearestSurface } from './room.js?v=16';
import { colliders, nearestRoomSurface, collide } from './collision.js?v=16';
import { aimAssist } from './creatures.js?v=16';
import { cast } from './flourish.js?v=16';
import { addSource } from './water.js?v=16';
import { findGrabTarget, beginHold, updateHold, endHold, reticles, showReticle, hideOrbs, CHARGE_MIN, CHARGE_MAX, CHARGE_REACH, showCharge, throwCharged } from './grip.js?v=16';
import { resonate } from './seal.js?v=16';
import { guard } from './guard.js?v=16';
import { PINCH_ON, PINCH_OFF, stream, startStream, DRAWN, drawBegin, drawAdd, drawEnd, currents, _cv, _cp, bendCurrents } from './shaping.js?v=16';
import { rootSense, senseAero, held } from './senses.js?v=16';
import { setForm, cycleForm, selectElement, menuGroup, menuOrbs, menuPlate, formPlates, WHEEL_R, options, switchMeshes, flipSwitch, readout, noteGesture, drawReadout } from './selection.js?v=16';
import { hud, drawHud } from './hud.js?v=16';

// ---------- hands ----------
export const waterAnchor = new THREE.Vector3();
ST.waterAnchorOn = false;
export function newHand() {
  return {
    valid: false, seen: false, armed: false, ready: true, clapBlock: -1,
    lastTouch: -1, lastCast: -1, stillT: 0, curl: 1.4, speed: 0,
    hold: null, aim: null, aimT: -9, charge: 0, prevOtherFist: false,
    palm: new THREE.Vector3(), normal: new THREE.Vector3(), across: new THREE.Vector3(),
    wrist: new THREE.Vector3(), knuckle: new THREE.Vector3(), indexBase: new THREE.Vector3(),
    pinkyBase: new THREE.Vector3(), indexTip: new THREE.Vector3(), hasTip: false,
    point: false, pointDir: new THREE.Vector3(),
    thumbTip: new THREE.Vector3(), pinchPos: new THREE.Vector3(), pinch: false, wasPinch: false,
    midTip: new THREE.Vector3(), ringTip: new THREE.Vector3(), pinkyTip: new THREE.Vector3(), midPinch: false, ringPinch: false, quickT: -9, seal: false, sealT: 0, sealArmed: true,
    prev: new THREE.Vector3(), vel: new THREE.Vector3(),
  };
}
export const handState = { left: newHand(), right: newHand() };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _tip = new THREE.Vector3();
export const _vhat = new THREE.Vector3(), _fwd = new THREE.Vector3(), _raw = new THREE.Vector3(), _off = new THREE.Vector3();
const TIPS = ['index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip'];
ST.sawHands = false;
let clapArmed = true;
let lastMenuPick = -1, menuArmed = true;

function jointPos(frame, hand, name, refSpace, out) {
  const joint = hand.get(name);
  if (!joint) return false;
  const pose = frame.getJointPose(joint, refSpace);
  if (!pose) return false;
  const p = pose.transform.position;
  out.set(p.x, p.y, p.z);
  return true;
}

// Which verb, if any, a hand motion is. Pure, so it can be tested without a headset.
//   curl: fingertip reach / knuckle reach.  normal: unit vector out of the palm.
//   vel: palm velocity (m/s).  fwd: unit vector the head is facing.
//   pointDir: unit vector along the index finger when the hand is pointing, otherwise null.
const haul = { openT: -9, grabT: -9, span: 0.5, from: new THREE.Vector3(), dir: new THREE.Vector3() };
export function classifyGesture(curl, normal, vel, fwd, pointDir = null) {
  const speed = vel.length();
  if (speed < 0.3) return null;
  _vhat.copy(vel).divideScalar(speed);
  if (pointDir) return speed > POINT_SPEED && _vhat.dot(pointDir) > 0.5 ? 'point' : null;
  if (curl < CURL_FIST) {
    // Straight-down punches are left for slams.
    return speed > PUNCH_SPEED && _vhat.dot(fwd) > 0.35 && _vhat.y > -0.7 ? 'punch' : null;
  }
  if (curl > CURL_OPEN) {
    const along = _vhat.dot(normal);
    if (normal.y > 0.55 && vel.y > LIFT_SPEED) return 'lift';
    if (along > 0.65 && Math.abs(normal.y) < 0.6 && speed > PUSH_SPEED && normal.dot(fwd) > 0.2) return 'shove';
    if (Math.abs(along) < 0.45 && speed > SWEEP_SPEED && Math.abs(_vhat.y) < 0.6) return 'sweep';
  }
  return null;
}

const handShape = (st) => st.point ? 'point' : st.curl < CURL_FIST ? 'fist' : st.curl > CURL_OPEN ? 'open' : 'loose';
// Pure: do two tracked hands count as one two-handed move?
export function isTwin(a, b) {
  if (!b.valid || !b.ready || b.speed < 0.8 || handShape(a) !== handShape(b)) return false;
  return a.vel.dot(b.vel) > 0.7 * a.speed * b.speed;
}

function readHand(frame, source, refSpace, st, dt) {
  const hand = source.hand;
  if (!jointPos(frame, hand, 'wrist', refSpace, st.wrist) ||
      !jointPos(frame, hand, 'middle-finger-phalanx-proximal', refSpace, st.knuckle) ||
      !jointPos(frame, hand, 'index-finger-metacarpal', refSpace, st.indexBase) ||
      !jointPos(frame, hand, 'pinky-finger-metacarpal', refSpace, st.pinkyBase)) {
    st.valid = false; st.seen = false; st.pinch = false;            // tracking dropped: forget the velocity
    return;
  }
  st.valid = true;
  st.palm.addVectors(st.wrist, st.knuckle).multiplyScalar(0.5);
  _a.subVectors(st.indexBase, st.wrist); _b.subVectors(st.pinkyBase, st.wrist);
  st.normal.crossVectors(_a, _b).normalize();
  if (source.handedness === 'left') st.normal.negate();
  st.across.subVectors(st.pinkyBase, st.indexBase).normalize();
  const reach = st.knuckle.distanceTo(st.wrist) || 0.09;
  let tipSum = 0, tipN = 0, indexReach = 0, restSum = 0, restN = 0;
  for (const name of TIPS) {
    if (jointPos(frame, hand, name, refSpace, _tip)) {
      const r = _tip.distanceTo(st.wrist);
      tipSum += r; tipN++;
      if (name === 'index-finger-tip') { st.indexTip.copy(_tip); indexReach = r / reach; }
      else { restSum += r; restN++; }
    }
  }
  st.hasTip = indexReach > 0;
  st.curl = tipN ? tipSum / tipN / reach : 1.4;
  // Pointing: index out, the other three fingers tucked in.
  st.point = indexReach > CURL_OPEN && restN > 0 && restSum / restN / reach < CURL_FIST + 0.1;
  if (st.point) st.pointDir.subVectors(st.indexTip, st.indexBase).normalize();
  // Pinching: thumb and index tips together while the other fingers stay out. Let go a little further apart than it took to start.
  if (st.hasTip && jointPos(frame, hand, 'thumb-tip', refSpace, st.thumbTip)) {
    const gap = st.thumbTip.distanceTo(st.indexTip);
    st.pinchPos.addVectors(st.thumbTip, st.indexTip).multiplyScalar(0.5);
    if (gap > PINCH_OFF) st.pinch = false;
    else if (gap < PINCH_ON && restN > 0 && restSum / restN / reach > 1.4) st.pinch = true;
    // The other two pinches are shortcuts, not moves. They only count on an otherwise open hand, so a fist cannot set them off.
    const openHand = gap > 0.045 && st.curl > 1.35;
    const mid = jointPos(frame, hand, 'middle-finger-tip', refSpace, st.midTip) ? st.thumbTip.distanceTo(st.midTip) : 9;
    const ring = jointPos(frame, hand, 'ring-finger-tip', refSpace, st.ringTip) ? st.thumbTip.distanceTo(st.ringTip) : 9;
    st.midEdge = false; st.ringEdge = false;
    // The seal: index and middle straight, ring and little finger folded.
    const far = (v) => v.distanceTo(st.wrist) / reach;
    st.seal = jointPos(frame, hand, 'pinky-finger-tip', refSpace, st.pinkyTip) && mid < 9 && ring < 9
      && far(st.indexTip) > 1.55 && far(st.midTip) > 1.55 && far(st.ringTip) < 1.25 && far(st.pinkyTip) < 1.25 && gap > 0.03;
    if (mid > 0.045) st.midPinch = false; else if (mid < 0.018 && openHand && !st.midPinch && ring > 0.03) { st.midPinch = true; st.midEdge = true; }
    if (ring > 0.045) st.ringPinch = false; else if (ring < 0.018 && openHand && !st.ringPinch && mid > 0.03) { st.ringPinch = true; st.ringEdge = true; }
  } else st.pinch = false;
  if (st.seen && dt > 0) {
    _raw.subVectors(st.palm, st.prev).divideScalar(dt);
    st.vel.lerp(_raw, 0.5);
  } else {
    st.vel.set(0, 0, 0);
  }
  st.prev.copy(st.palm);
  st.seen = true;
  st.speed = st.vel.length();
  if (st.speed < REARM_SPEED) st.ready = true;
  st.stillT = st.speed < HOLD_STILL ? st.stillT + dt : 0;
}

export function updateHands(frame, refSpace, t, dt, viewerPos) {
  _fwd.set(0, 0, -1).applyQuaternion(LATE.viewerQuat);
  handState.left.valid = handState.right.valid = false;
  ST.streamCtl = null;                                // the hand that owns the stream says so again every frame
  for (const source of frame.session.inputSources) {
    if (source.hand && handState[source.handedness]) readHand(frame, source, refSpace, handState[source.handedness], dt);
  }
  const L = handState.left, R = handState.right;
  if (!ST.sawHands && (L.valid || R.valid)) { ST.sawHands = true; ST.hudNote = 'build 16. open palm toward you: pick'; drawHud(); }

  // Palm menu: an open, slow palm turned toward your face. The other index finger picks.
  let menuHand = null;
  for (const st of [L, R]) {
    if (!st.valid || st.curl < CURL_OPEN || st.speed > 0.6) continue;
    _off.subVectors(viewerPos, st.palm).normalize();
    if (st.normal.dot(_off) > 0.6) { menuHand = st; break; }
  }
  menuGroup.visible = !!menuHand;
  reticles[0].visible = reticles[1].visible = false;
  hideOrbs(0); hideOrbs(1);
  if (menuHand) {
    const pointer = menuHand === L ? R : L;
    let touching = -1;
    const fing = _cp.subVectors(menuHand.knuckle, menuHand.wrist).normalize();
    const hub = _cv.copy(menuHand.palm).addScaledVector(menuHand.normal, 0.07);
    const tip = pointer.valid && pointer.hasTip ? pointer.indexTip : null;
    let hover = -1, hoverDist = 0.05;
    menuOrbs.forEach((orb, i) => {
      const ang = (i / menuOrbs.length) * Math.PI * 2;
      orb.position.copy(hub).addScaledVector(fing, Math.cos(ang) * WHEEL_R).addScaledVector(menuHand.across, Math.sin(ang) * WHEEL_R);
      const d = tip ? tip.distanceTo(orb.position) : 9;
      if (d < hoverDist) { hoverDist = d; hover = i; }
    });
    menuOrbs.forEach((orb, i) => orb.scale.setScalar(ELEMENT_ORDER[i] === ST.selected ? 1.7 : i === hover ? 1.4 : 1));
    if (hover >= 0 && hoverDist < 0.027) touching = hover;
    const shownKey = hover >= 0 ? ELEMENT_ORDER[hover] : ST.selected;
    menuPlate.mesh.position.copy(hub).addScaledVector(fing, 0.02);
    menuPlate.mesh.lookAt(viewerPos);
    menuPlate.draw(ELEMENTS[shownKey].label, `#${ELEMENTS[shownKey].color.getHexString()}`, false, hover >= 0 && shownKey !== ST.selected ? MOVES[shownKey].punch.name + ' · ' + MOVES[shownKey].slam.name + ' · ' + DRAWN[shownKey] : formOf(ST.selected));
    const list = FORMS[ST.selected];
    formPlates.forEach((pl, j) => {
      pl.mesh.visible = j < list.length;
      if (j >= list.length) return;
      pl.mesh.position.copy(hub).addScaledVector(fing, -0.022 - (j >> 1) * 0.024).addScaledVector(menuHand.across, ((j & 1) - 0.5) * 0.05);
      pl.mesh.lookAt(viewerPos);
      pl.draw(list[j], `#${ELEMENTS[ST.selected].color.getHexString()}`, formOf(ST.selected) === list[j]);
      if (tip && tip.distanceTo(pl.mesh.position) < 0.02) touching = 200 + j;
    });
    _off.subVectors(menuHand.wrist, menuHand.knuckle).normalize();          // toward the wrist: the second row sits below the orbs
    switchMeshes.forEach((sw, i) => {
      sw.position.copy(menuHand.palm).addScaledVector(menuHand.normal, 0.07).addScaledVector(_off, WHEEL_R + 0.045).addScaledVector(menuHand.across, (i - 1.5) * 0.042);
      sw.lookAt(viewerPos);
      if (pointer.valid && pointer.hasTip && pointer.indexTip.distanceTo(sw.position) < 0.022) touching = 100 + i;
    });
    // A poke counts once: the finger has to come off the orbs before it can pick again.
    // Poking the discipline you are already in steps it to its next sub-element.
    if (touching < 0) menuArmed = true;
    else if (menuArmed && t - lastMenuPick > 0.25) {
      menuArmed = false; lastMenuPick = t;
      if (touching >= 200) { setForm(ST.selected, FORMS[ST.selected][touching - 200]); tick(); ST.hudNote = `${ELEMENTS[ST.selected].label.toLowerCase()} as ${formOf(ST.selected)}`; ST.lastCast = ST.selected; drawHud(); }
      else if (touching >= 100) flipSwitch(touching - 100);
      else if (ELEMENT_ORDER[touching] !== ST.selected) selectElement(ELEMENT_ORDER[touching]);
    }
  }

  // Aero's sense: a clap.
  if (L.valid && R.valid) {
    const gap = L.palm.distanceTo(R.palm);
    if (gap > CLAP_OFF) clapArmed = true;
    else if (clapArmed && gap < CLAP_ON && !menuHand) {
      clapArmed = false;
      L.clapBlock = R.clapBlock = t;
      noteGesture('clap');
      if (ST.selected === 'aero') senseAero(_off.addVectors(L.palm, R.palm).multiplyScalar(0.5).clone(), t);
    }
  }

  // The haul. Both hands open and apart, both close at once, and you pull: a great wall comes out of whatever you
  // were reaching toward (floor, wall or ceiling) and stands there.
  if (L.valid && R.valid && !menuHand && !L.hold && !R.hold && !stream.on) {
    const span = L.palm.distanceTo(R.palm);
    _cv.addVectors(L.palm, R.palm).multiplyScalar(0.5);
    const bothOpen = L.curl > CURL_OPEN && R.curl > CURL_OPEN, bothFist = L.curl < CURL_FIST && R.curl < CURL_FIST;
    if (bothOpen && span > 0.25 && span < 1.1) { haul.openT = t; haul.span = span; haul.grabT = -9; }
    else if (bothFist && haul.grabT < 0 && t - haul.openT < 0.45) { haul.grabT = t; haul.from.copy(_cv); haul.dir.copy(_cv).sub(viewerPos).normalize(); }
    else if (bothFist && haul.grabT > 0 && t - haul.grabT < 1.3 && _cv.distanceTo(haul.from) > 0.2) {
      haul.grabT = -9; haul.openT = -9;
      L.ready = R.ready = false; L.charge = R.charge = 0; L.lastCast = R.lastCast = t;
      noteGesture('haul'); thump();
      MOVES[ST.selected].haul.width = Math.min(Math.max(haul.span * 3.4, 1.6), 3.4);
      cast(ST.selected, 'haul', { hand: haul.from.clone(), dir: haul.dir.clone(), eye: viewerPos.clone(), fwd: _fwd.clone(), t, power: 1.6 });
    } else if (!bothFist && !bothOpen) { if (t - haul.grabT > 1.3) haul.grabT = -9; }
  }
  // Guard: wrists crossed and held up in front of the chest.
  guard.on = false;
  if (L.valid && R.valid && !menuHand && !L.hold && !R.hold && L.wrist.distanceTo(R.wrist) < 0.16 && L.palm.distanceTo(R.palm) > 0.07) {
    _off.addVectors(L.wrist, R.wrist).multiplyScalar(0.5);
    _cp.set(_fwd.z, 0, -_fwd.x).normalize();                         // your left
    const crossed = _cv.subVectors(L.palm, R.palm).dot(_cp) < 0.02;   // the left hand has come across to the right side
    if (crossed && _off.y > viewerPos.y - 0.6 && _off.y < viewerPos.y + 0.1 && _off.distanceTo(viewerPos) < 0.6) {
      guard.on = true; guard.pos.copy(_off).addScaledVector(_fwd, 0.12);
      L.ready = R.ready = false; L.charge = R.charge = 0; L.clapBlock = R.clapBlock = t;
      noteGesture('guard');
    }
  }
  for (const st of [L, R]) {
    if (!st.valid || st === menuHand || guard.on) continue;
    if (st.seal && st.speed < 0.7 && st.palm.y > viewerPos.y - 0.55 && !st.hold) {
      st.sealT += dt; st.ready = false; st.charge = 0;
      if (st.sealT > 0.35 && st.sealArmed) { st.sealArmed = false; noteGesture('seal'); resonate(ST.selected, t); }
      continue;
    }
    st.sealT = 0; if (!st.seal) st.sealArmed = true;
    if ((st.midEdge || st.ringEdge) && t - st.quickT > 0.5 && !st.hold && !(stream.on && stream.owner === st)) {
      st.quickT = t; st.ready = false;
      if (st.midEdge) { noteGesture('middle pinch'); const back = ST.prevSelected; selectElement(back, true); play(SFX.swap); ST.hudNote = `${ELEMENTS[ST.selected].label.toLowerCase()} ready`; ST.lastCast = ST.selected; drawHud(); }
      else { noteGesture('ring pinch'); cycleForm(ST.selected); }
      st.midEdge = st.ringEdge = false;
      continue;
    }
    const isFist = st.curl < CURL_FIST && !st.point, isOpen = st.curl > CURL_OPEN;
    const other = st === L ? R : L;

    // Surfaces: an open palm touches (Terra's sense), a fist slams (every discipline).
    const hitPalm = nearestSurface(st.palm);
    const hitFist = nearestSurface(st.knuckle);
    const near = Math.min(hitPalm.dist, hitFist.dist) < TOUCH_OFF;
    if (!near) st.armed = true;
    else if (st.armed && !st.hold && t - st.lastTouch > 0.35) {
      if (isFist && hitFist.dist < SLAM_ON) {
        st.armed = false; st.lastTouch = t; st.ready = false;
        const struckSurface = nearestRoomSurface(st.knuckle, 0.35);
        cast(ST.selected, 'slam', { hand: st.knuckle.clone(), dir: _fwd.clone(), eye: viewerPos.clone(), fwd: _fwd.clone(), ground: hitFist.point, normal: struckSurface ? struckSurface.normal : UP.clone(), t });
      } else if (!isFist && hitPalm.dist < TOUCH_ON) {
        st.armed = false; st.lastTouch = t; st.ready = false;
        noteGesture('palm on surface');
        if (TOUCH_SENSE[ST.selected]) {
          firePulse(hitPalm.point);
          if (ST.selected === 'flora') rootSense(hitPalm.point, t);
          play(SFX[ST.selected].sense); ST.hudNote = ELEMENTS[ST.selected].sense.toLowerCase(); ST.lastCast = ST.selected; drawHud();
        } else {
          if (ST.selected === 'aqua') {
            const surf = nearestRoomSurface(st.palm, 0.4);
            addSource(hitPalm.point, surf ? surf.normal : UP, t);
            ST.hudNote = 'wellspring'; ST.lastCast = 'aqua'; drawHud();
          } else { ST.hudNote = `${ELEMENTS[ST.selected].label.toLowerCase()} senses differently`; drawHud(); }
        }
      }
    }
    // Grip. A hand that is holding something does nothing else until it opens.
    const idx = st === L ? 0 : 1;
    _off.subVectors(st.palm, viewerPos);
    const reachNow = _off.length();
    const reachDir = _off.clone().divideScalar(reachNow || 1);
    const otherFist = other.valid && !other.hold && other.curl < CURL_FIST && !other.point;
    if (st.hold) {
      if (st.curl > 1.45) endHold(st);
      else updateHold(st, viewerPos, reachDir, reachNow / st.hold.reach0, { hand: st.palm, squeeze: otherFist, squeezeEdge: otherFist && !st.prevOtherFist }, t, dt);
      st.prevOtherFist = otherFist;
      st.ready = false; st.armed = false;
      continue;
    }
    st.prevOtherFist = otherFist;
    if (near || t - st.clapBlock < 0.4) continue;
    // Shaping. Aqua: a pinch draws the carried water out into a stream. Morph: a bladed tendril. The others trace a line.
    if (ST.selected === 'aqua' || ST.selected === 'morph') {
      if (stream.on && stream.endOwner === st) {     // this hand has the far end
        if (!st.pinch) stream.endOwner = null;
        st.ready = false; st.charge = 0;
        continue;
      }
      if (stream.on && stream.owner === st) {
        if (st.pinch || st.curl < 1.45) {            // it stays out until the hand opens
          if (!stream.endOwner && other.valid && other.pinch && !other.wasPinch && stream.nodes.some(n => n.p.distanceTo(other.pinchPos) < 0.25)) stream.endOwner = other;
          ST.streamCtl = { root: st.pinch ? st.pinchPos : st.knuckle, dir: reachDir, vel: st.vel, eye: viewerPos, grip: isFist, squeeze: otherFist && !stream.endOwner, end: stream.endOwner ? stream.endOwner.pinchPos : null };
        }
        st.ready = false; st.charge = 0; st.wasPinch = st.pinch;
        continue;
      }
      if (!stream.on && st.pinch && !st.wasPinch) {
        noteGesture('pinch');
        ST.streamCtl = { root: st.pinchPos, dir: reachDir, vel: st.vel, eye: viewerPos, grip: false, squeeze: false, end: null };
        if (startStream(ST.streamCtl, t, ST.selected)) { stream.owner = st; st.ready = false; st.wasPinch = true; continue; }
      }
    } else if (st.pinch) {
      if (!ST.drawing) drawBegin(ST.selected, st.pinchPos, st);
      else if (ST.drawing.owner === st) drawAdd(st.pinchPos);
      st.ready = false; st.charge = 0; st.wasPinch = true;
      continue;
    } else if (ST.drawing && ST.drawing.owner === st) drawEnd(t);
    st.wasPinch = st.pinch;
    if (ST.selected === 'aero' && isOpen && st.speed > 0.4 && currents.length && bendCurrents(st.palm, st.vel, dt)) { st.ready = false; continue; }
    if (GRABS[ST.selected]) {
      if (isOpen && st.speed < 0.9) {                // an open hand reaching: show what it would take
        st.aim = findGrabTarget(holdKey(ST.selected), viewerPos, reachDir, t);
        st.aimT = t;
        showReticle(idx, st.aim, holdKey(ST.selected), viewerPos);
      } else if (isFist && st.aim && t - st.aimT < 0.35 && st.speed < 0.9 && reachNow >= CHARGE_REACH) {
        beginHold(st, holdKey(ST.selected), st.aim, viewerPos, t);
        st.hold.reach0 = reachNow || 1;
        st.aim = null; st.ready = false;
        continue;
      }
    }
    // Charging: a raised fist that stays closed builds the discipline's big throw; the next punch lets it go.
    // Pyro charges at any reach. The others charge with the fist drawn in toward you, so it cannot be mistaken for a grab.
    if (isFist && st.palm.y > viewerPos.y - 0.5 && (!GRABS[ST.selected] || reachNow < CHARGE_REACH)) st.charge = Math.min(st.charge + dt, CHARGE_MAX);
    else if (!isFist) st.charge = 0;
    showCharge(idx, st.knuckle, st.charge, ST.selected);

    // Held senses: Aqua reads through a raised open palm, Pyro through a raised fist.
    const raised = st.palm.y > viewerPos.y - 0.5;
    if (raised && st.stillT > HOLD_TIME) {
      if (ST.selected === 'aqua' && isOpen && st.normal.dot(_fwd) > 0.5) held.aqua = { origin: viewerPos, dir: st.normal };
      if (FIST_SENSE[ST.selected] && isFist) held.pyro = { centre: viewerPos };
      if (PALM_SENSE[ST.selected] && isOpen && st.normal.dot(_fwd) > 0.5) held.lumen = { origin: viewerPos };
    }

    // Attacks.
    if (st.ready && t - st.lastCast > CAST_COOLDOWN && t - st.lastTouch > 0.3) {
      const gesture = classifyGesture(st.curl, st.normal, st.vel, _fwd, st.point ? st.pointDir : null);
      if (gesture) {
        st.ready = false;
        st.lastCast = t;
        const c = { eye: viewerPos.clone(), fwd: _fwd.clone(), t, st };
        if (gesture === 'punch') { c.hand = st.knuckle.clone(); c.dir = st.vel.clone(); }
        else if (gesture === 'shove') { c.hand = st.palm.clone(); c.dir = st.normal.clone(); }
        else if (gesture === 'point') { c.hand = st.indexTip.clone(); c.dir = st.pointDir.clone(); }
        else { c.hand = st.palm.clone(); c.dir = _fwd.clone(); }   // lift and sweep aim where you look
        // A punch straight down is a slam, wherever your fist stops: it lands on whatever is under it. No need to hit the floor.
        if (gesture === 'punch' && st.charge <= CHARGE_MIN && c.dir.clone().normalize().y < -0.72) {
          const under = collide(st.knuckle, st.knuckle.clone().setY(st.knuckle.y - 2.6));
          if (under) {
            const twin = isTwin(st, other) && other !== menuHand && !other.hold;
            if (twin) { other.ready = false; other.lastCast = t; }
            noteGesture('down punch');
            cast(ST.selected, 'slam', { hand: st.knuckle.clone(), dir: _fwd.clone(), eye: viewerPos.clone(), fwd: _fwd.clone(), ground: under.point, normal: under.normal, t, st, power: twin ? 1.6 : 1 });
            continue;
          }
        }
        if (gesture === 'punch' && st.charge > CHARGE_MIN) {
          throwCharged(ST.selected, c.hand, c.dir, c.eye, c.fwd, st.charge, t);
          st.charge = 0;
          continue;
        }
        // Twin cast: the other hand is doing the same thing, the same way, right now.
        if (isTwin(st, other) && other !== menuHand && !other.hold) {
          other.ready = false; other.lastCast = t;
          c.power = 1.6;
          if (gesture !== 'lift' && gesture !== 'sweep') c.hand.lerp(gesture === 'punch' ? other.knuckle : gesture === 'point' ? other.indexTip : other.palm, 0.5);
        }
        cast(ST.selected, gesture, c);
      }
    }
  }

  // Carried water floats just above and outside whichever hand is free to lead.
  const lead = R.valid && R !== menuHand ? R : L.valid && L !== menuHand ? L : null;
  // Carried water floats in front of your chest, where either hand can reach it. (A charging fist still calls it over.)
  waterAnchor.copy(viewerPos).addScaledVector(_off.copy(_fwd).setY(0).normalize(), 0.42).setY(viewerPos.y - 0.38);
  ST.waterAnchorOn = ST.selected === 'aqua';

  readout.visible = options.read;
  if (options.read) {
    drawReadout(L, R, t);
    if (R.valid) readout.position.copy(R.wrist).add(_off.set(0, 0.11, 0));
    else { _off.set(0.22, -0.2, -0.55).applyQuaternion(LATE.viewerQuat); readout.position.copy(viewerPos).add(_off); }
    readout.lookAt(viewerPos);
  }

  // HUD rides the left wrist; it steps aside while the menu is up.
  hud.visible = !menuHand;
  if (L.valid) {
    hud.position.copy(L.wrist).add(_off.set(0, 0.09, 0));
  } else {
    _off.set(0, -0.28, -0.55).applyQuaternion(LATE.viewerQuat);
    hud.position.copy(viewerPos).add(_off);
  }
  hud.lookAt(viewerPos);
}

// Controller fallback: trigger punches at what you point at (or senses), grip changes discipline.
export const raycaster = new THREE.Raycaster();
const _origin = new THREE.Vector3(), _rayDir = new THREE.Vector3();
function controllerRay(event) {
  const source = event.inputSource;
  if (source.hand) return false;                     // hands use gestures instead
  const pose = event.frame.getPose(source.targetRaySpace, renderer.xr.getReferenceSpace());
  if (!pose) return false;
  const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
  _origin.setFromMatrixPosition(m);
  _rayDir.set(0, 0, -1).transformDirection(m);
  return true;
}
export function onSelectStart(event) {
  if (!controllerRay(event)) return;
  const t = now();
  if (aimAssist(_origin, _rayDir, 0.3, t)) {
    cast(ST.selected, 'punch', { hand: _origin.clone(), dir: _rayDir.clone(), eye: LATE.viewerPos.clone(), fwd: _rayDir.clone(), t });
    return;
  }
  if (ST.selected === 'aero') { senseAero(_origin.clone(), t); return; }
  raycaster.set(_origin, _rayDir);
  raycaster.far = Infinity;
  const hit = raycaster.intersectObjects(colliders(), false)[0];
  firePulse(hit ? hit.point : _origin);
}
export function onSqueezeStart(event) {
  if (event.inputSource.hand) return;
  selectElement(ELEMENT_ORDER[(ELEMENT_ORDER.indexOf(ST.selected) + 1) % ELEMENT_ORDER.length]);
}

// Reached from modules that load before this one.
Object.assign(LATE, { _fwd, handShape, handState });

import * as THREE from 'three';
import { ELEMENTS, ELEMENT_ORDER, FORMS, forms, MOVES, SENSE_HOW } from './data.js?v=16';
import { tick } from './audio.js?v=16';
import { ST, LATE } from './state.js?v=16';
import { chipEls, moveEls, formOf } from './core.js?v=16';
import { scene, now } from './renderer.js?v=16';
import { scatterEchoes } from './echoes.js?v=16';
import { AI } from './creatures.js?v=16';
import { SEALS } from './seal.js?v=16';
import { DRAWN } from './shaping.js?v=16';

// ---------- discipline selection ----------
export function setForm(key, form) {
  if (key === 'terra') ST.terraForm = form; else forms[key] = form;
  const name = ELEMENTS[key].label[0] + ELEMENTS[key].label.slice(1).toLowerCase();
  for (const el of chipEls) if (el.dataset.el === key) el.textContent = form === FORMS[key][0] ? name : `${name} · ${form}`;
}
export function cycleForm(key = 'terra') {
  const list = FORMS[key];
  setForm(key, list[(list.indexOf(formOf(key)) + 1) % list.length]);
  tick();
  ST.hudNote = `${ELEMENTS[key].label.toLowerCase()} as ${formOf(key)}`; ST.lastCast = key;
  LATE.drawHud();
}
ST.prevSelected = 'pyro';                         // the one before this one: a middle-finger pinch goes back to it
export function selectElement(key, quiet) {
  if (ST.selected === key && !quiet) { cycleForm(key); return; }
  if (ST.selected === key && quiet) return;
  ST.prevSelected = ST.selected;
  ST.selected = key;
  ST.lastCast = key;
  for (const el of chipEls) el.classList.toggle('on', el.dataset.el === key);
  for (const el of moveEls) {
    const g = el.dataset.g;
    el.textContent = g === 'sense' ? ELEMENTS[key].sense : g === 'draw' ? DRAWN[key] : g === 'seal' ? SEALS[key].name : MOVES[key][g].name;
    el.style.setProperty('--c', `#${ELEMENTS[key].color.getHexString()}`);
  }
  if (!quiet) { tick(); ST.hudNote = `${ELEMENTS[key].label.toLowerCase()} · sense: ${SENSE_HOW[key]}`; }
  LATE.drawHud();
}

// Palm menu: four orbs that float over an open palm turned toward your face.
export const menuGroup = new THREE.Group();
// The power wheel. An open palm turned toward you puts every discipline in a ring round it, each a coloured bead.
// Hover the other hand's fingertip near a bead and the plate in the middle names it; touch the bead to take it.
// Under the plate, the three sub-elements of the discipline you are in: touch one to switch straight to it.
export const menuOrbs = ELEMENT_ORDER.map((key) => {
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 16, 12),
    new THREE.MeshBasicMaterial({ color: ELEMENTS[key].color, depthTest: false, transparent: true }),
  );
  orb.renderOrder = 25;
  menuGroup.add(orb);
  return orb;
});
function makePlate(w, h, px = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = px; canvas.height = Math.round(px * h / w);
  const tex = new THREE.CanvasTexture(canvas);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false }));
  mesh.renderOrder = 26;
  menuGroup.add(mesh);
  let shown = null;
  return { mesh, draw(text, colour, on = false, sub = '') {
    const id = text + colour + on + sub;
    if (id === shown) return;
    shown = id;
    const c = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    c.clearRect(0, 0, W, H);
    c.fillStyle = on ? colour : 'rgba(8,10,14,0.82)';
    c.strokeStyle = colour; c.lineWidth = 6;
    c.beginPath(); c.roundRect(4, 4, W - 8, H - 8, H * 0.3); c.fill(); c.stroke();
    c.fillStyle = on ? '#06080c' : colour; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `600 ${Math.round(H * (sub ? 0.4 : 0.5))}px system-ui, sans-serif`;
    c.fillText(text, W / 2, sub ? H * 0.36 : H / 2);
    if (sub) { c.font = `${Math.round(H * 0.24)}px system-ui, sans-serif`; c.fillStyle = '#c8d0dc'; c.fillText(sub, W / 2, H * 0.74); }
    tex.needsUpdate = true;
  } };
}
export const menuPlate = makePlate(0.1, 0.042, 384);
export const formPlates = [0, 1, 2, 3].map(() => makePlate(0.046, 0.02, 160));
export const WHEEL_R = 0.115;
menuGroup.visible = false;
scene.add(menuGroup);
// Under the orbs: three switches.
//   CALM  creatures still move, but stop attacking. For practising moves.
//   READ  shows what the tracker thinks each hand is doing. For working out why a move will not fire.
//   NEW   back to wave one with a fresh room.
export const options = { calm: false, read: false };
const SWITCHES = ['CALM', 'READ', 'NEW', 'OCCL'];
export const switchMeshes = SWITCHES.map((label, i) => {
  const canvas = document.createElement('canvas');
  canvas.width = 160; canvas.height = 80;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.036, 0.018), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  mesh.renderOrder = 25;
  mesh.userData = { canvas, tex, label, i };
  menuGroup.add(mesh);
  return mesh;
});
function drawSwitch(mesh) {
  const { canvas, tex, label, i } = mesh.userData;
  const on = i === 0 ? options.calm : i === 1 ? options.read : i === 3 ? ST.occlusion : false;
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, 160, 80);
  c.fillStyle = on ? '#b6ff3c' : 'rgba(5,7,5,0.85)';
  c.strokeStyle = '#b6ff3c'; c.lineWidth = 4;
  c.beginPath(); c.roundRect(4, 4, 152, 72, 22); c.fill(); c.stroke();
  c.fillStyle = on ? '#050705' : '#b6ff3c';
  c.font = '600 34px ui-monospace, Menlo, Consolas, monospace';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(label, 80, 42);
  tex.needsUpdate = true;
}
switchMeshes.forEach(drawSwitch);
export function flipSwitch(i) {
  tick();
  if (i === 0) { options.calm = !options.calm; AI.attacks = !options.calm; ST.hudNote = options.calm ? 'calm: no attacks' : 'attacks on'; }
  else if (i === 1) { options.read = !options.read; ST.hudNote = options.read ? 'hand readout on' : 'hand readout off'; }
  else if (i === 3) { ST.occlusion = !ST.occlusion; ST.hudNote = ST.occlusion ? 'room hides what is behind it' : 'occlusion off'; }
  else { ST.wave = 1; scatterEchoes(); }
  switchMeshes.forEach(drawSwitch);
  for (const el of LATE.optionEls) el.classList.toggle('on', el.dataset.opt === 'calm' && options.calm);
  LATE.drawHud();
}
// The readout: a small panel over the right wrist.
const readCanvas = document.createElement('canvas');
readCanvas.width = 640; readCanvas.height = 200;
const readTex = new THREE.CanvasTexture(readCanvas);
readTex.colorSpace = THREE.SRGBColorSpace;
export const readout = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.0625), new THREE.MeshBasicMaterial({ map: readTex, transparent: true, depthTest: false, depthWrite: false }));
readout.renderOrder = 21; readout.visible = false;
scene.add(readout);
const gestureLog = { name: 'none', t: -99 };
let readDrawn = -1;
export function noteGesture(name) { gestureLog.name = name; gestureLog.t = now(); }
export function drawReadout(L, R, t) {
  if (t - readDrawn < 0.12) return;
  readDrawn = t;
  const c = readCanvas.getContext('2d');
  c.clearRect(0, 0, 640, 200);
  c.fillStyle = 'rgba(5,7,5,0.85)'; c.strokeStyle = '#cfd6d2'; c.lineWidth = 3;
  c.beginPath(); c.roundRect(3, 3, 634, 194, 26); c.fill(); c.stroke();
  c.font = '34px ui-monospace, Menlo, Consolas, monospace'; c.textBaseline = 'middle';
  const line = (tag, st, y) => {
    c.fillStyle = st.valid ? '#cfd6d2' : '#6f7a74';
    c.fillText(st.valid ? `${tag} ${LATE.handShape(st).padEnd(5)} curl ${st.curl.toFixed(2)}  ${st.speed.toFixed(1)} m/s` : `${tag} not tracked`, 24, y);
  };
  line('L', L, 46); line('R', R, 100);
  c.fillStyle = '#b6ff3c';
  const age = t - gestureLog.t;
  c.fillText(`last: ${gestureLog.name}${age < 60 ? `  ${age.toFixed(1)}s ago` : ''}`, 24, 156);
  readTex.needsUpdate = true;
}

// Reached from modules that load before this one.
Object.assign(LATE, { noteGesture });

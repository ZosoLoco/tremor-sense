import * as THREE from 'three';
import { KINDS, ELEMENTS, MOVES } from './data.js?v=17';
import { play, SFX, thump, tick, castSound } from './audio.js?v=17';
import { ST, LATE } from './state.js?v=17';
import { UP } from './renderer.js?v=17';
import { pulseUniforms } from './pulse.js?v=17';
import { lineOfSight } from './collision.js?v=17';
import { echoes, glowMat, roomBounds, reveal, hit } from './echoes.js?v=17';
import { particles, PCOL, puff } from './visuals.js?v=17';
import { addEffect, castBolt, thralls, raiseThrall } from './effects.js?v=17';
import { armour, cast } from './flourish.js?v=17';
import { objects, kick, sendBack, turn, explode } from './objects.js?v=17';
import { sources, WATER_MAX, water } from './water.js?v=17';

// ---------- the seal ----------
// Two fingers up (index and middle, the others folded), held still for a moment. Not an attack with a shape: each
// discipline does the one thing only it can do, to the whole room at once. Ten seconds between uses.
const SEAL_COOLDOWN = 10;
ST.sealAt = -99;
const liveEchoes = () => echoes.filter(e => !e.down);
export const SEALS = {
  pyro:   { name: 'Wildfire',   go: (t) => { let n = 0; for (const e of liveEchoes()) if (e.burnAt > 0) { n++; for (const o of liveEchoes()) if (o !== e && !(o.burnAt > 0) && o.group.position.distanceTo(e.group.position) < 2) o.burnAt = t + 1.5; e.burnAt = -1; hit(e, 'pyro', t, UP, { damage: 1, noBurn: true }); } return n ? 'every fire spreads and bursts' : 'nothing is burning'; } },
  aqua:   { name: 'Tide Call',  go: (t) => { for (const sc of sources) cast('aqua', 'lift', { hand: sc.pos.clone(), dir: sc.normal.clone(), eye: sc.pos.clone().addScaledVector(sc.normal, -0.5), fwd: new THREE.Vector3(0, 0, -1), t, quiet: true }); water.amount = WATER_MAX; return sources.length ? 'every source erupts' : 'filled from the air'; } },
  terra:  { name: 'Upheaval',   go: (t) => { let n = 0; const prey = liveEchoes(); for (const o of objects) { if (o.dead || o.held || o.def.cloud || !prey.length) continue; const e = prey[n++ % prey.length]; const d = e.group.position.clone().sub(o.pos); turn(o); kick(o, d.x * 2.2, 3 + d.y * 2, d.z * 2.2); } thump(); return n ? 'everything loose takes off' : 'nothing loose'; } },
  aero:   { name: 'Eye of the Storm', go: (t) => { stormUntil = t + 6; return 'nothing thrown can reach you'; } },
  lumen:  { name: 'Flashbang',  go: (t) => { pulseUniforms.uAmbient.value.setRGB(0.9, 0.85, 0.7); let n = 0; for (const e of liveEchoes()) if (lineOfSight(LATE.viewerPos, e.group.position)) { n++; e.blindUntil = t + 3.5; e.exposedUntil = t + 8; reveal(e, t, 8, ELEMENTS.lumen.color); } return n + ' blinded'; } },
  gravis: { name: 'Reverse',    go: (t) => { for (const e of liveEchoes()) { if (!(KINDS[e.kind] || {}).heavy) { e.airborne = true; e.vel.y = 2.6; } e.dropAt = t + 1.4; reveal(e, t, 3, ELEMENTS.gravis.color); } for (const o of objects) if (!o.dead && !o.held && !o.def.cloud) kick(o, 0, 5, 0); return 'everything falls up'; } },
  flora:  { name: 'Bloom',      go: (t) => { let n = 0; for (const e of liveEchoes()) if (e.rootedUntil > t) { n++; puff('flora', e.group.position, 40, 2.6, { up: 1 }); hit(e, 'flora', t, UP, { damage: 2, bleed: true }); } for (const tu of LATE.turrets) { tu.until += 10; tu.spitAt = 0; } return n ? n + ' rooted things burst' : LATE.turrets.length ? 'the snappers wake' : 'nothing rooted'; } },
  astra:  { name: 'Alignment',  go: (t) => { let n = 0; for (const e of liveEchoes()) if (e.revealedUntil > t) { n++; const at = e.group.position.clone(), top = at.clone().setY(Math.min(at.y + 2.6, roomBounds().max.y - 0.2)); castBolt('astra', { ...MOVES.astra.punch, sky: false }, { hand: top, dir: at.sub(top).normalize(), eye: LATE.viewerPos.clone(), fwd: new THREE.Vector3(0, 0, -1), t, scale: 1 }); } return n ? 'a comet for each one you can see' : 'reveal something first'; } },
  morph:  { name: 'Second Skin', go: (t) => { if (ST.playerHP < 5) ST.playerHP++; armour(t, 6); return 'healed, armoured'; } },
  umbra:  { name: 'Lights Out', go: (t) => { for (const e of liveEchoes()) { e.blindUntil = t + 6; e.drainAt = t + 1.5; } pulseUniforms.uAmbient.value.setRGB(0, 0, 0); return 'nothing can see'; } },
  necro:  { name: 'Detonate',   go: (t) => { if (!thralls.length) { raiseThrall(LATE.viewerPos.clone().add(new THREE.Vector3(0, -0.2, -0.8)), t); return 'one rises'; } for (const th of thralls) { explode(th.pos.clone(), 'necro', 1.3, t, 2, true); th.until = 0; } return 'the dead go off'; } },
};
let stormUntil = -1;
export function resonate(key, t) {
  if (t - ST.sealAt < SEAL_COOLDOWN) { ST.hudNote = `seal in ${Math.ceil(SEAL_COOLDOWN - (t - ST.sealAt))}s`; ST.lastCast = key; LATE.drawHud(); return false; }
  ST.sealAt = t;
  play(SFX.seal); castSound[key]();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 64), glowMat(ELEMENTS[key].color.clone(), 0.9));
  ring.position.copy(LATE.viewerPos).setY(LATE.viewerPos.y - 0.5); ring.rotation.x = -Math.PI / 2;
  addEffect([ring], (n) => { const k = (n - t) / 0.8; ring.scale.setScalar(0.2 + k * 6); ring.material.opacity = 0.9 * (1 - k); return k < 1; });
  const said = SEALS[key].go(t);
  ST.hudNote = `${SEALS[key].name.toLowerCase()}: ${said}`; ST.lastCast = key; LATE.drawHud();
  return true;
}
export function updateStorm(t) {                           // Aero's seal: for six seconds a wall of wind turns everything back
  if (t > stormUntil) return;
  if (Math.random() < 0.8) { const a = Math.random() * 6.28; particles.emit(LATE._np.set(Math.cos(a) * 1.1, (Math.random() - 0.6) * 1.2, Math.sin(a) * 1.1).add(LATE.viewerPos), LATE._nt.set(-Math.sin(a) * 4, 0.3, Math.cos(a) * 4), PCOL.aero[1], 0.02, 0.35, 0, 0); }
  for (const o of objects) if (!o.dead && o.hostile && o.pos.distanceTo(LATE.viewerPos) < 1.5) { turn(o); sendBack(o, 11); tick(); }
}


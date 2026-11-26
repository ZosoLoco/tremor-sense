import * as THREE from 'three';
import { ECHO_COUNT, KINDS, KIND_NAMES, ACID, ELEMENTS } from './data.js?v=17';
import { blip, tick, hitSound } from './audio.js?v=17';
import { ST, LATE } from './state.js?v=17';
import { renderer, scene, UP, ZERO, now } from './renderer.js?v=17';
import { planes } from './room.js?v=17';
import { clearBarriers, collide, nearestRoomSurface, lineOfSight } from './collision.js?v=17';

// ---------- echoes: the hidden things a sense reveals ----------
export const echoes = [];
const echoGroup = new THREE.Group();
scene.add(echoGroup);
ST.downCount = 0;
ST.respawnAt = -1;

export function glowMat(color, opacity = 0) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthTest: false, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

export const ICE = new THREE.Color(0xbfeeff), STEEL_TINT = new THREE.Color(0x9fb0c4);
function makeEcho() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), glowMat(ACID));
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.085, 0), glowMat(ACID));
  shell.material.wireframe = true;
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.11, 0.118, 40), glowMat(ACID));
  const ice = new THREE.Mesh(new THREE.IcosahedronGeometry(0.125, 0), glowMat(ICE, 0.32));
  ice.visible = false;
  // A face, so it reads as a creature: a soft body with two eyes that watch you, and a tail that trails behind it.
  const face = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.07, 18, 14).scale(1, 0.85, 1.1), glowMat(ACID));
  const eyes = [-1, 1].map((side) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.013, 10, 8), glowMat(new THREE.Color(0xffffff)));
    eye.position.set(side * 0.03, 0.018, 0.068);
    face.add(eye);
    return eye;
  });
  face.add(body);
  const tail = [0.045, 0.036, 0.028, 0.02, 0.013].map((r) => {
    const bead = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), glowMat(ACID));
    bead.visible = false; bead.renderOrder = 10;
    echoGroup.add(bead);
    return bead;
  });
  g.add(core, shell, halo, ice, face);
  g.renderOrder = 10;
  g.visible = false;
  echoGroup.add(g);
  return {
    group: g, core, shell, halo, ice, face, body, eyes, tail, parts: [core, shell, halo, body, ...tail],
    goal: new THREE.Vector3(), goalUntil: 0, windup: -1, puppet: false, moving: 0, last: new THREE.Vector3(),
    home: new THREE.Vector3(), phase: Math.random() * 6.28,
    revealedUntil: -1, level: 0, down: false, downT: -1, push: new THREE.Vector3(),
    hp: 2, restY: 0, vel: new THREE.Vector3(), airborne: false, flashT: -1,
    burnAt: -1, soakedUntil: -1, frozenUntil: -1, metalUntil: -1, blindUntil: -1, drainAt: -1, exposedUntil: -1, rootedUntil: -1, seedAt: -1, venom: 0, baseColor: new THREE.Color(ACID),
  };
}
for (let i = 0; i < ECHO_COUNT; i++) echoes.push(makeEcho());

export function roomBounds() {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  let any = false;
  for (const entry of planes.values()) {
    for (const [x, z] of entry.pts) {
      box.expandByPoint(v.set(x, 0, z).applyMatrix4(entry.mesh.matrix));
      any = true;
    }
  }
  if (!any) box.set(new THREE.Vector3(-2.2, 0, -2.2), new THREE.Vector3(2.2, 2.2, 2.2));
  // Keep echoes inside the walls and at heights you can aim at.
  box.min.addScalar(0.25); box.max.addScalar(-0.25);
  box.min.y = 0.12; box.max.y = Math.min(Math.max(box.max.y, 0.8), 1.7);
  if (box.max.x - box.min.x < 0.5) { box.min.x -= 1; box.max.x += 1; }
  if (box.max.z - box.min.z < 0.5) { box.min.z -= 1; box.max.z += 1; }
  return box;
}

// Where the player is standing when a round is laid out.
export function spawnEye() {
  return renderer.xr.isPresenting ? LATE.viewerPos.clone() : new THREE.Vector3(0.4, 1.5, 2.2);
}
const _sa = new THREE.Vector3(), _sb = new THREE.Vector3();
const SIDE_RAYS = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]].map(v => new THREE.Vector3(...v));
// Is a ball of this radius at p in open air: not inside a wall, not inside or under furniture, and in plain view from eye?
export function isOpen(p, radius, eye, needFloorGap = true) {
  for (const d of SIDE_RAYS) {
    if (!needFloorGap && d.y < 0) continue;
    if (collide(p, _sa.copy(p).addScaledVector(d, radius))) return false;
  }
  if (needFloorGap && p.y < radius) return false;
  const above = collide(p, _sa.copy(p).setY(p.y + 1.2));           // a table top or couch seat overhead means we are inside it
  if (above && above.point.y < 1.5) return false;
  const below = collide(_sb.copy(p).setY(2.6), p);                   // anything between the ceiling and here means the same
  if (below && below.point.y < 2.05 && below.point.y > p.y + radius) return false;
  return lineOfSight(eye, p);
}
function openSpot(box, yMin, yMax, radius, eye, others = [], gap = 0) {
  const p = new THREE.Vector3();
  for (let i = 0; i < 60; i++) {
    p.set(THREE.MathUtils.lerp(box.min.x, box.max.x, Math.random()), THREE.MathUtils.lerp(yMin, yMax, Math.random()), THREE.MathUtils.lerp(box.min.z, box.max.z, Math.random()));
    if (others.some(q => q.distanceTo(p) < gap)) continue;
    if (isOpen(p, radius, eye)) return p;
  }
  // Nowhere clean: fall back to open air in front of the player.
  return p.copy(eye).add(new THREE.Vector3((Math.random() - 0.5) * 1.6, -0.3 + Math.random() * 0.4, -1.2 - Math.random()));
}

// Waves: each one fields one more creature (three to start, eight at most) and they attack a little more often.
// Clear a wave and the next begins with the room as you left it. Go down and it is back to wave one, room reset.
ST.wave = 1; ST.activeCount = 3;
export function scatterEchoes(keepWorld = false) {
  if (!keepWorld) { clearBarriers(); LATE.clearShaping(); }
  const box = roomBounds();
  const eye = spawnEye(), taken = [];
  ST.activeCount = Math.min(1 + ST.wave, 6);          // waves build more slowly and top out lower
  echoes.forEach((e, i) => {
    if (i >= ST.activeCount) {                          // not in this wave: parked out of the way
      e.down = true; e.downT = -1; e.group.visible = false; e.home.set(0, -50, 0); e.windup = -1;
      for (const bead of e.tail) bead.visible = false;
      return;
    }
    e.kind = LATE.AI.kinds ? KIND_NAMES[(Math.random() * KIND_NAMES.length) | 0] : 'plain';
    if (KINDS[e.kind].minWave > ST.wave) e.kind = 'pebble';
    const KK = KINDS[e.kind];
    e.home.copy(KK.alt ? openSpot(box, Math.min(KK.alt, box.max.y - 0.4), Math.min(KK.alt + 0.25, box.max.y - 0.3), 0.3, eye, taken, 0.7) : openSpot(box, 0.5, 1.7, 0.3, eye, taken, 0.7));
    e.group.scale.setScalar((KK.scale || 1) * 0.8);   // everything a little smaller: easier to read a room full of them
    LATE.dressEcho(e);
    taken.push(e.home.clone());
    e.down = false; e.downT = -1; e.revealedUntil = -1; e.level = 0;
    e.hp = KINDS[e.kind].hp; e.restY = e.home.y; e.vel.set(0, 0, 0); e.airborne = false; e.flashT = -1;
    e.burnAt = e.soakedUntil = e.frozenUntil = e.metalUntil = e.blindUntil = e.drainAt = e.exposedUntil = e.rootedUntil = e.seedAt = e.dropAt = -1; e.venom = 0;
    e.baseColor.copy(ACID); e.ice.visible = false; e.shell.scale.setScalar(1);
    e.goal.copy(e.home); e.goalUntil = 0; e.windup = -1; e.puppet = false; e.last.copy(e.home);
    for (const bead of e.tail) { bead.position.copy(e.home); bead.visible = false; }
    for (const m of e.parts) m.material.color.copy(ACID);
    e.group.scale.setScalar(1);
    e.group.position.copy(e.home);
    e.group.visible = false;
  });
  ST.downCount = 0;
  ST.draftUntil = -1;
  ST.nextAttackAt = now() + LATE.CREATURE.firstAttack;
  if (!keepWorld) {
    ST.playerHP = LATE.MAX_HP;
    LATE.clearSources(); LATE.water.amount = 0;
    LATE.scatterObjects();
  } else if (LATE.objects.filter(o => !o.dead && !o.def.cloud && !o.hostile).length < 6) LATE.scatterObjects();   // running low: restock
  ST.hudNote = `wave ${ST.wave}`;
  LATE.drawHud();
}

export const isLive = (e, t) => !e.down && e.revealedUntil > t;

// Mark an echo as sensed. The colour tells you which sense found it.
export function reveal(e, t, duration, color) {
  if (e.down) return;
  if (e.revealedUntil < t) { blip(); e.baseColor.copy(LATE.AI.kinds && e.kind !== 'plain' ? KINDS[e.kind].colour : color); }
  e.revealedUntil = Math.max(e.revealedUntil, t + duration);
}

function defeat(e, elementKey, t, pushDir) {
  if (e.down) return;
  e.down = true;
  e.downT = t;
  e.push.copy(pushDir || ZERO);
  for (const m of e.parts) { m.material.color.copy(ELEMENTS[elementKey].color); m.material.opacity = 1; }
  e.group.visible = true;
  e.ice.visible = false;
  e.windup = -1;
  for (const bead of e.tail) bead.visible = false;
  ST.downCount++;
  LATE.puff(elementKey, e.group.position, 26, 2.4, pushDir && pushDir.lengthSq() ? { dir: pushDir, spread: 1.1 } : {});
  hitSound();
  LATE.drawHud();
  if (LATE.AI.kinds) deathEffect(e, t);
  if (ST.downCount === ST.activeCount) { ST.respawnAt = t + 3.5; ST.hudNote = 'wave clear'; LATE.drawHud(); }
}
// What each kind leaves behind.
function deathEffect(e, t) {
  const p = e.group.position.clone();
  if (e.kind === 'drip') {
    const under = nearestRoomSurface(p, 3);
    LATE.addSource(under ? under.point : p.clone().setY(0), under ? under.normal : UP, t, 20);
  } else if (e.kind === 'ember') LATE.explode(p, 'pyro', 0.9, t, 1);
  else if (e.kind === 'pebble') LATE.spawnObject('stone', p);
  else if (e.kind === 'wisp') {
    LATE.puff('aero', p, 40, 4, { life: 0.4 });
    for (const o of LATE.objects) {
      if (o.dead || o.held || o.pos.distanceTo(p) > 2) continue;
      const away = o.pos.clone().sub(p).normalize();
      LATE.kick(o, away.x * 4, 2, away.z * 4);
    }
  }
}

// Land an attack on an echo. m is the move (or a bare { damage } for knock-on effects).
// Works out damage, the mark the discipline leaves, and any combination with marks already there.
const _hd = new THREE.Vector3(), _hp = new THREE.Vector3();
export function hit(e, key, t, dir, m = {}) {
  if (e.down) return;
  _hd.copy(dir || ZERO);
  const pos = _hp.copy(e.group.position);
  const K = KINDS[e.kind] || KINDS.plain;
  const frozen = e.frozenUntil > t, soaked = e.soakedUntil > t || !!K.wet;
  let dmg = m.damage ?? (key === 'terra' ? 2 : 1);
  if (K.weak === key && !m.noBurn) dmg += 1;         // the thing it cannot stand
  let note = null, shatter = false;

  if (frozen && key === 'terra') { dmg = 9; shatter = true; note = 'shatter'; }
  else if (key === 'aero' && e.airborne) { dmg = 9; note = 'air finish'; }
  else if (m.volt && (soaked || e.metalUntil > t)) { dmg = 9; note = 'conduct'; }
  if (m.form === 'sand') { e.blindUntil = t + 3; note = note || 'blinded'; }
  if (m.form === 'metal') e.metalUntil = t + 8;      // steel in it: lightning will find it
  if (m.form === 'lava' && !frozen) e.burnAt = t + 1.5;
  if (e.exposedUntil > t && key !== 'lumen') { dmg += 1; e.exposedUntil = -1; note = note || 'exposed'; }
  const rooted = e.rootedUntil > t;
  if (rooted && key === 'pyro' && !m.noBurn) { dmg += 1; e.rootedUntil = -1; note = 'kindling'; }        // roots burn
  if (rooted && key === 'aqua' && !m.freeze) { e.rootedUntil = t + 8; note = note || 'overgrown'; }      // watered, they hold twice as long
  if (e.blindUntil > t && key === 'lumen' && !m.shadow) { dmg += 2; note = 'light in the dark'; }         // light on the blinded
  if (frozen && key === 'morph') { dmg = 9; shatter = true; note = 'shatter'; }                           // a fist breaks ice as well as a stone does
  if (key === 'flora') {
    if (m.spore) { e.blindUntil = t + 3; note = note || 'spores'; }
    else if (m.bleed) e.drainAt = t + 1.2;
    else if (!frozen) { e.rootedUntil = t + (soaked ? 8 : 4); e.vel.set(0, e.vel.y, 0); note = note || (soaked ? 'overgrown' : 'rooted'); }
    if (m.seed) e.seedAt = t + 2;                    // it sprouts inside what it hit
    if (e.burnAt > 0) { dmg += 1; note = 'fed the fire'; }
  }
  if (key === 'astra') {
    if (m.shadow) { e.blindUntil = t + 3; e.drainAt = t + 1.5; }
    else if (m.rain) e.soakedUntil = t + 6;
    else if (!frozen && !soaked) e.burnAt = t + 1.5;
    if (m.volt && (soaked || e.metalUntil > t)) { dmg = 9; note = 'conduct'; }
  }
  if ((key === 'morph' || key === 'necro') && m.venom) { e.drainAt = t + 1.2; e.venom = 1; note = note || 'poisoned'; }
  if (key === 'necro') {
    if (m.doom) { e.drainAt = t + 1.2; e.venom = 2; note = note || 'doomed'; }
    if (m.root && !frozen) { e.rootedUntil = t + m.root; e.vel.set(0, e.vel.y, 0); note = note || 'held by the dead'; }
    if (m.fear) { e.blindUntil = t + 4; note = note || 'terror'; }
  }
  if (key === 'umbra') {
    if (m.fear) { e.blindUntil = t + 5; _hd.copy(pos).sub(LATE.viewerPos).setY(0).normalize(); e.vel.x += _hd.x * 5; e.vel.z += _hd.z * 5; note = note || 'terror'; }
    else if (!m.hollow) { e.blindUntil = t + 4; e.drainAt = t + 1.5; }
    if (e.exposedUntil > t) { e.exposedUntil = -1; }
  }
  if (key === 'lumen') {
    if (m.shadow) { e.blindUntil = t + 4; e.drainAt = t + 1.5; note = note || 'lost in the dark'; }
    else { e.blindUntil = Math.max(e.blindUntil || -1, t + 1.5); e.exposedUntil = t + 8; }
  }
  if (key === 'gravis') {
    if (m.drop) e.dropAt = t + m.drop;
    if (e.airborne && (m.kind === 'ring' || m.crush)) { dmg = 9; note = 'brought down'; }
    else if (m.crush) { e.blindUntil = t + 3; e.vel.set(0, e.vel.y, 0); note = note || 'pinned'; }
  }

  if (key === 'pyro') {
    if (frozen) { e.frozenUntil = -1; e.soakedUntil = t + 4; note = note || 'thaw'; }
    else if (soaked && !m.volt) { e.soakedUntil = -1; note = 'steam'; LATE.spawnCloud('steam', pos.clone(), t, 5); }
    else if (!m.volt && !m.noBurn) e.burnAt = t + 1.5;
  } else if (key === 'aqua') {
    e.burnAt = -1;                                  // water puts fire out
    if (m.freeze) { e.frozenUntil = t + 6; e.vel.set(0, e.vel.y, 0); }
    else if (m.steam) { e.blindUntil = t + 2; note = note || 'scalded blind'; }
    else e.soakedUntil = t + 6;
  }
  if (!(e.frozenUntil > t)) {
    if (m.launch && !(K.heavy && K.scale > 1.5)) { e.airborne = true; e.vel.y = 2.2; }       // a slow toss (the heavy ones stay put): about a metre up, nearly two seconds of hang
    if (m.from) {                                   // vacuum: dragged toward whoever cast it
      _hd.copy(m.from).sub(pos).setY(0).normalize();
      e.vel.x += _hd.x * 3; e.vel.z += _hd.z * 3;
      e.drainAt = t + 1.5;
    } else if (!m.sonic && ((key === 'aero' && m.kind !== 'void') || m.kind === 'wall' || m.roll || m.push)) {   // shoved along the floor
      const push = m.push || (key === 'aero' ? 3.5 : 2.5);
      e.vel.x += _hd.x * push; e.vel.z += _hd.z * push;
    }
  }
  if (m.sonic) { e.blindUntil = t + 2.5; note = note || 'stunned'; }
  e.revealedUntil = Math.max(e.revealedUntil, t + 5);          // once you have hit it, you can keep track of it
  e.hp -= dmg;
  if (m.form === 'lightning' && !m.arc) {           // jumps to the nearest other creature
    let near = null, nearDist = 2.4;
    for (const o of echoes) { if (o === e || o.down) continue; const dd = o.group.position.distanceTo(pos); if (dd < nearDist) { nearDist = dd; near = o; } }
    if (near) { LATE.zap(pos.clone(), near.group.position.clone(), t); hit(near, 'pyro', t, near.group.position.clone().sub(pos).normalize(), { damage: 1, volt: true, arc: true }); _hp.copy(e.group.position); }
  }
  if (m.form === 'blast' && m.kind && m.kind !== 'bolt') LATE.explode(e.group.position.clone(), 'pyro', 0.7, t, 1, true);
  if (note) { ST.hudNote = note; LATE.drawHud(); }
  if (e.hp > 0 && m.blood) LATE.puff('morph', pos, 20, 2.5, { up: 1 });
  if (e.hp <= 0 && key === 'necro') LATE.raiseThrall(pos.clone(), t);        // what Necro kills gets back up, on your side
  if (e.hp <= 0 && ((key === 'umbra' && m.hollow) || key === 'morph') && ST.playerHP < 5) { ST.playerHP++; ST.hudNote = 'fed'; LATE.drawHud(); }   // the body, and the hollow dark, take back what they kill
  if (e.hp > 0) { e.flashT = t; tick(); LATE.puff(key, pos, 8, 1.6); return; }

  const centre = pos.clone(), away = _hd.clone();
  defeat(e, key, t, away);
  if (shatter) {                                    // the ice goes everywhere and cuts what is close
    LATE.puff('aqua', centre, 46, 3.6, { grav: 5, life: 0.8, size: 0.04 });
    for (const o of echoes) {
      if (o === e || !isLive(o, t) || o.group.position.distanceTo(centre) > 1.1) continue;
      hit(o, 'terra', t, o.group.position.clone().sub(centre).normalize(), { damage: 1 });
    }
  }
}


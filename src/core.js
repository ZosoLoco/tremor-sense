// Tremor Sense: a mixed reality prototype for Resonance.
//
// Pick a discipline (look at an open palm, poke an orb with the other index finger),
// then use the same six hand verbs. Each discipline answers them differently.
//
//            SENSE (fills the room)      PUNCH        SHOVE        LIFT     SWEEP      SLAM (fist on surface)  POINT (index finger jab)
//   TERRA    Tremor: palm on a surface   Stone Shot   Boulder      Spire    Rampart    Fault Line              Ferro Disc
//   PYRO     Chi: raised fist, held      Ember        Flame Burst  Pyre     Fire Arc   Eruption                Volt
//   AQUA     Tide: raised palm, held     Globe        Breaker      Geyser   Whip       Surge                   Frost Needle
//   AERO     Draft: clap                 Air Bullet   Gust         Updraft  Air Blade  Shockwave               Void
//
// Spire, Fault Line and Rampart come out of whatever surface is there: floor, wall, ceiling, table.
// Spire stays as cover. Rampart stands until you hit it, then charges. Terra has four forms: rock, sand, metal, lava.
// Aqua: an open palm on any surface starts a water source; water from a source gathers at your hand and powers the next move.
// Matter changes state: frost turns standing water to ice, fire turns it to steam, fire makes stone molten, crushing stone makes sand.
//
// GRIP (close an open hand while reaching at something, open it to let go):
//   AERO  Wind Grip    wind winds round any object (or cloud) you can see: carry it, throw it, crush it with the other fist
//   AQUA  Water Grip   water closes over an object, or takes hold of a creature by the water in it, through walls
//   TERRA Unearth      hold stone and steel, or reach at the floor to tear out a fresh boulder
//   PYRO  Fireball     keep a raised fist closed to grow a fireball, then punch to throw it
//
// Both hands making the same move together cast a stronger "twin" version.
//
// Echoes take two hits, and the disciplines leave different marks on them:
//   Pyro burns (a second hit lands by itself 1.5 s later). Aqua soaks. Frost freezes in place.
//   Terra hits twice as hard. Aero shoves things around. Lifts and Surge toss echoes into the air.
// Marks combine: Volt on a soaked echo conducts and chains. Terra on a frozen one shatters it and
// hurts its neighbours. Aero on an airborne one finishes it. Fire on water just makes steam.
//
// Projectiles collide with the real room. Columns, rings and Terra's ripple do not.





import { forms } from './data.js?v=17';
import { ST, LATE } from './state.js?v=17';
export const statusEl = document.getElementById('status');
export const hintEl = document.getElementById('hint');
export const enterBtn = document.getElementById('enter');
export const uiEl = document.getElementById('ui');
export const chipEls = Array.from(document.querySelectorAll('[data-el]'));
export const moveEls = Array.from(document.querySelectorAll('[data-g]'));
ST.terraForm = 'rock';
export const formOf = (key) => key === 'terra' ? ST.terraForm : forms[key];

// Tremor Sense: what the disciplines are. Tables only: tuning numbers, creature kinds, elements, forms, moves.
// Nothing in here changes while the game runs, except the `forms` object, which holds each discipline's current sub-element.
import * as THREE from 'three';

// ---------- tuning ----------
export const PULSE_SPEED = 2.4;    // metres per second
export const PULSE_LIFE = 4.5;     // seconds
export const MAX_PULSES = 4;
export const ECHO_COUNT = 8;        // the most creatures a wave can field
// Four kinds of creature, one leaning toward each discipline. Colour tells you which once you have sensed it.
//   ember:  quick shots. Water hurts it double. Bursts into flame when it dies.
//   drip:   always counts as soaked, so Volt goes straight through it and fire only makes steam. Leaves a water source.
//   pebble: slow, three hits to kill, and its shards chew through walls twice as fast. Drops a stone.
//   wisp:   fast and fragile: one hit, but hard to pin down. Dies in a gust that scatters loose objects.
export const KINDS = {
  plain:  { hp: 2, speed: 0.7,  shot: 3.2, colour: 0xb6ff3c },
  ember:  { hp: 2, speed: 0.8,  shot: 4.0, colour: 0xff7a2a, weak: 'aqua' },
  drip:   { hp: 2, speed: 0.6,  shot: 2.8, colour: 0x8fd3e6, wet: true },
  pebble: { hp: 3, speed: 0.45, shot: 3.0, colour: 0xd9b25a, heavy: true },
  wisp:   { hp: 1, speed: 1.3,  shot: 4.4, colour: 0xeaf7ff },
  // By how they move.
  crawler: { hp: 2, speed: 1.5, shot: 3.0, colour: 0x9be06a, alt: 0.2, scale: 0.8 },             // ground: fast, hugs the floor, slips under cover
  flyer:   { hp: 1, speed: 1.6, shot: 4.6, colour: 0x7fd8ff, alt: 2.0, scale: 0.7 },             // air: stays up near the ceiling, hard to reach with anything that runs along the ground
  brute:   { hp: 6, speed: 0.35, shot: 2.6, colour: 0xff5a4a, heavy: true, scale: 1.9, minWave: 2 },   // heavy: slow, soaks up hits, cannot be thrown about
  // By what they are made of.
  shade:   { hp: 2, speed: 0.9, shot: 3.4, colour: 0xa070ff, weak: 'lumen' },                    // hates light
  frost:   { hp: 3, speed: 0.6, shot: 3.0, colour: 0xbfefff, weak: 'pyro', cold: true },         // gives off no heat: Chi cannot see it
};
for (const k of Object.values(KINDS)) k.colour = new THREE.Color(k.colour);
export const KIND_NAMES = ['ember', 'drip', 'pebble', 'wisp', 'crawler', 'flyer', 'shade', 'frost', 'brute'];
export const REVEAL_TIME = 6;      // seconds an echo stays visible after a Terra or Aero sense
export const HOLD_REVEAL = 1.5;    // seconds an echo lingers after leaving an Aqua or Pyro sense
export const TOUCH_ON = 0.045;     // palm closer than this to a surface counts as a touch
export const SLAM_ON = 0.055;      // knuckles closer than this to a surface counts as a slam
export const TOUCH_OFF = 0.09;     // hand must lift past this before it can touch again
export const CURL_OPEN = 1.55;     // fingertip reach / knuckle reach above this = open hand
export const CURL_FIST = 1.2;      // below this = fist
export const PUNCH_SPEED = 1.3;    // metres per second, fist moving forward
export const PUSH_SPEED = 1.1;     // open palm moving the way it faces
export const LIFT_SPEED = 0.9;     // open palm facing up, moving up
export const SWEEP_SPEED = 1.4;    // open hand moving edge-on, sideways
export const REARM_SPEED = 0.5;    // hand must slow below this between attacks
export const CAST_COOLDOWN = 0.45; // seconds
export const HOLD_STILL = 0.25;    // a held sense needs the hand slower than this (m/s)
export const HOLD_TIME = 0.4;      // ...for this long (s)
export const POINT_SPEED = 1.0;    // index finger jab, moving the way it points
export const CLAP_ON = 0.09;       // palms closer than this = clap
export const CLAP_OFF = 0.18;
export const TIDE_SENSE = { speed: 3.2, reach: 14 };  // water spreads across the whole floor; anything above it shows where it stands
export const DRAFT_SENSE = { speed: 9, lasts: 9 };    // the air of the whole room, for a while: anything that moves gives itself away

export const ACID = new THREE.Color(0xb6ff3c);
export const ELEMENTS = {
  pyro:  { label: 'PYRO',  sense: 'Chi Sense',    color: new THREE.Color(0xff6a1a) },
  aqua:  { label: 'AQUA',  sense: 'Tide Sense',   color: new THREE.Color(0xa9dbe6) },
  terra: { label: 'TERRA', sense: 'Tremor Sense', color: new THREE.Color(0xe0b64a) },
  aero:  { label: 'AERO',  sense: 'Draft Sense',  color: new THREE.Color(0xdff9ff) },
  // Past the classical four.
  lumen:  { label: 'LUMEN',  sense: 'Glint Sense', color: new THREE.Color(0xfff1b0) },   // light: dazzles and exposes
  gravis: { label: 'GRAVIS', sense: 'Mass Sense',  color: new THREE.Color(0xb48cff) },   // gravity: pulls, floats, crushes
  flora:  { label: 'FLORA',  sense: 'Root Sense',  color: new THREE.Color(0x7fd65a) },   // growth: roots things where they stand
  astra:  { label: 'ASTRA',  sense: 'Zenith Sense', color: new THREE.Color(0x9fb8ff) },  // sky: everything comes down from above
  morph:  { label: 'MORPH',  sense: 'Pulse Sense', color: new THREE.Color(0xff7a8a) },   // the body itself: close, hard, armoured
  umbra:  { label: 'UMBRA',  sense: 'Dark Sense',  color: new THREE.Color(0xd24cff) },   // dark: blinds, drains, hides you
  necro:  { label: 'NECRO',  sense: 'Death Sense', color: new THREE.Color(0x6cf0c2) },   // the dead: what it kills gets up and fights for you
};
export const ELEMENT_ORDER = ['pyro', 'aqua', 'terra', 'aero', 'lumen', 'gravis', 'flora', 'astra', 'morph', 'umbra', 'necro'];
export const GRABS = { aqua: true, terra: true, aero: true, gravis: true, flora: true, morph: true };   // disciplines whose closed fist takes hold of things
export const HOLD_AS = { gravis: 'aero', morph: 'aero', flora: 'aqua' };     // gravity and muscle hold objects the way wind does; vines hold anything, the way water does
export const holdKey = (k) => HOLD_AS[k] || k;
export const FIST_SENSE = { pyro: true, gravis: true, morph: true, umbra: true, necro: true };   // sensed through a raised fist
export const PALM_SENSE = { lumen: true, astra: true };                             // sensed through a raised open palm
export const TOUCH_SENSE = { terra: true, flora: true };                            // sensed through a palm on a surface
// Terra works four kinds of earth. Pick Terra again while it is already selected to step to the next.
//   rock:  the default. Hits twice as hard as anything else.
//   sand:  light hits that blind for 3 s, shots that pass through, and a sand cloud wherever one lands.
//   metal: shots ricochet, what they hit conducts lightning like a soaked target, and walls throw shards back.
//   lava:  everything it touches burns, catches light, and boils water.
export const TERRA_FORMS = ['rock', 'sand', 'metal', 'lava'];
export const FORM_LOOK = {
  rock: {},
  sand: { pal: { dark: 0x7a6844, light: 0xdcc48e, seam: 0xefe0b4, amt: 0.2, grain: [22, 22, 22] } },
  metal: { metal: true },
  lava: { heat: 1 },
};
// The other three disciplines have sub-elements too. Same rule: pick the discipline again to step to the next.
//   Pyro  flame      burns: a second hit lands by itself.
//         lightning  no burn. Every hit arcs to one more creature nearby, and conducts through anything soaked or steel-struck.
//         blast      no burn. Every hit goes off as a small explosion that throws objects and hurts what is close.
//   Aqua  water      soaks.
//         ice        freezes instead. Breaker becomes a standing wall of ice, Geyser a standing spike. Globe becomes a shard.
//         steam      no soak. Blinds for 2 s, and shots leave a scalding cloud where they land.
//   Aero  wind       shoves away.
//         vacuum     pulls toward you instead, and leaves the target short of air: a second hit lands by itself.
//         sound      goes through walls and cover, and stuns for 2.5 s. No shove.
//   Lumen light     dazzles for a moment and leaves the target exposed: the next hit from anything else lands harder.
//         prism     shots bounce more and beams jump further.
//         shadow    no exposure. Blinds for 4 s, and a second hit lands by itself.
//   Gravis pull     as written.
//         float     everything it touches goes weightless and drifts up.
//         crush     pins what is on the ground; brings down hard what is in the air.
//   Flora vine      roots what it hits: it cannot move for 4 s.   thorn  no root; hits bleed (a second hit lands by itself) and do +1.
//         spore     no root; blinds for 3 s and leaves a cloud.
//   Astra day       burns.      night  blinds and drains.      storm  soaks, and every hit is lightning: it conducts.
//   Morph beast     as written.   shell  every move also armours you for 2 s.   venom  hits poison: two more hits land by themselves.
//   Umbra shade     blinds 4 s and drains.   fear  no drain; throws them back and they cannot act for 5 s.
//         hollow    no blind; what dies to it gives you a point of health.
export const FORMS = { terra: TERRA_FORMS, pyro: ['flame', 'lightning', 'blast'], aqua: ['water', 'ice', 'steam'], aero: ['wind', 'vacuum', 'sound'], lumen: ['light', 'prism', 'shadow'], gravis: ['pull', 'float', 'crush'],
  flora: ['vine', 'thorn', 'spore'], astra: ['day', 'night', 'storm'], morph: ['beast', 'shell', 'venom'], umbra: ['shade', 'fear', 'hollow'],
  //   Necro bone  as written.   plague  hits poison, and thralls last twice as long.   spirit  shots pass through walls.
  necro: ['bone', 'plague', 'spirit'] };
export const forms = { pyro: 'flame', aqua: 'water', aero: 'wind', lumen: 'light', gravis: 'pull', flora: 'vine', astra: 'day', morph: 'beast', umbra: 'shade', necro: 'bone' };
// Which set of colours a move is drawn in.
export const lookOf = (key, m) => m && m.form === 'lightning' ? 'volt' : key;
export const GESTURES = ['sense', 'punch', 'shove', 'lift', 'sweep', 'slam', 'point', 'grip', 'charge', 'draw', 'seal'];

// What each verb does per discipline. kind picks the behaviour, the rest are its numbers.
export const MOVES = {
  pyro: {
    punch: { name: 'Ember',       kind: 'bolt',   speed: 9,  radius: 0.22, shape: 'orb' },
    shove: { name: 'Flame Burst', kind: 'cone',   range: 4, angle: 0.7 },
    lift:  { name: 'Pyre',        kind: 'column', launch: true, radius: 0.35, top: 0.16, bottom: 0.2, sides: 12, flicker: true },
    sweep: { name: 'Fire Arc',    kind: 'bolt',   speed: 6,  radius: 0.5, shape: 'crescent', size: 0.5, pierce: true, life: 1.2 },
    slam:  { name: 'Eruption',    kind: 'ring',   maxR: 3.6, height: 1.4 },
    point: { name: 'Volt',        kind: 'beam',   range: 14, chain: 3, volt: true },
    grip:  { name: 'Fireball (hold)', kind: 'bolt',   speed: 8, radius: 0.3, shape: 'orb', size: 0.07, blast: 1.3, damage: 2, life: 2.2 },
    charge: { name: 'Fireball',   kind: 'bolt',   speed: 8, radius: 0.3, shape: 'orb', size: 0.07, blast: 1.3, damage: 2, life: 2.2 },
  },
  aqua: {
    punch: { name: 'Globe',       kind: 'bolt',   speed: 9, radius: 0.24, shape: 'blob', size: 0.085 },
    shove: { name: 'Breaker',     kind: 'wall',   ram: 6, width: 2.2, height: 1.2, passThrough: true },
    lift:  { name: 'Geyser',      kind: 'column', launch: true, radius: 0.32, top: 0.1, bottom: 0.1, sides: 16 },
    sweep: { name: 'Whip',        kind: 'whip',   range: 3.4, arc: 1.05 },
    slam:  { name: 'Surge',       kind: 'ring',   maxR: 4.2, height: 1.1, launch: true },
    point: { name: 'Frost Needle', kind: 'bolt',  speed: 14, radius: 0.2, shape: 'shard', freeze: true },
    grip:  { name: 'Water Grip',  kind: 'grip' },
    charge: { name: 'Deluge',     kind: 'bolt',   speed: 8, radius: 0.35, shape: 'blob', size: 0.1, splash: 1.3, damage: 2, life: 2.2 },
  },
  terra: {
    punch: { name: 'Stone Shot',  kind: 'bolt',   speed: 8,  radius: 0.28, shape: 'rock', gravity: 2.5 },
    shove: { name: 'Boulder',     kind: 'bolt',   speed: 4.5, radius: 0.55, shape: 'rock', size: 0.32, roll: true, pierce: true, life: 4 },
    lift:  { name: 'Spire',       kind: 'column', launch: true, radius: 0.32, top: 0.03, bottom: 0.19, sides: 6, pulse: true, stand: 18 },
    sweep: { name: 'Rampart',     kind: 'wall',   ram: 5, width: 1.8, height: 1.5, stand: 30 },
    slam:  { name: 'Fault Line',  kind: 'fault',  length: 8 },
    point: { name: 'Ferro Disc',  kind: 'bolt',   speed: 10, radius: 0.25, shape: 'disc', bounces: 3, pierce: true, life: 2.5 },
    grip:  { name: 'Unearth',     kind: 'grip' },
    charge: { name: 'Meteor',     kind: 'bolt',   speed: 9, radius: 0.4, shape: 'rock', size: 0.18, gravity: 3, quake: 1.2, damage: 3, life: 3 },
  },
  aero: {
    punch: { name: 'Air Bullet',  kind: 'bolt',   speed: 16, radius: 0.2, shape: 'orb', size: 0.03, bounces: 2 },
    shove: { name: 'Gust',        kind: 'cone',   range: 7, angle: 0.5 },
    lift:  { name: 'Updraft',     kind: 'column', launch: true, radius: 0.5, top: 0.3, bottom: 0.22, sides: 20 },
    sweep: { name: 'Air Blade',   kind: 'bolt',   speed: 11, radius: 0.4, shape: 'crescent', size: 0.4, pierce: true },
    slam:  { name: 'Shockwave',   kind: 'ring',   maxR: 4.5, height: 2.2 },
    point: { name: 'Void',        kind: 'void',   radius: 1.5, range: 10 },
    grip:  { name: 'Wind Grip',   kind: 'grip' },
    charge: { name: 'Air Cannon', kind: 'bolt',   speed: 15, radius: 0.5, shape: 'vortex', pierce: true, damage: 2, life: 1.6 },
  },
  lumen: {
    punch: { name: 'Lance',       kind: 'beam',   range: 14, straight: true },
    shove: { name: 'Flare',       kind: 'cone',   range: 5, angle: 0.8 },
    lift:  { name: 'Pillar',      kind: 'column', radius: 0.32, top: 0.12, bottom: 0.14, sides: 16 },
    sweep: { name: 'Halo',        kind: 'bolt',   speed: 14, radius: 0.45, shape: 'crescent', size: 0.45, pierce: true, life: 1 },
    slam:  { name: 'Nova',        kind: 'ring',   maxR: 4, height: 1.2 },
    point: { name: 'Prism',       kind: 'bolt',   speed: 18, radius: 0.2, shape: 'orb', size: 0.03, bounces: 4, pierce: true, life: 2.5 },
    grip:  { name: 'Sunburst (hold)', kind: 'bolt', speed: 10, radius: 0.3, shape: 'orb', size: 0.07, blast: 1.4, damage: 2, life: 2.2 },
    charge: { name: 'Sunburst',   kind: 'bolt',   speed: 10, radius: 0.3, shape: 'orb', size: 0.07, blast: 1.4, damage: 2, life: 2.2 },
  },
  gravis: {
    punch: { name: 'Graviton',    kind: 'bolt',   speed: 4.5, radius: 0.3, shape: 'orb', size: 0.06, implode: 1.4, homing: 7, life: 4 },   // slow, and it will not miss: it falls toward what you threw it at
    shove: { name: 'Repulse',     kind: 'cone',   range: 5, angle: 0.6, push: 5 },
    lift:  { name: 'Levitate',    kind: 'column', launch: true, drop: 1.3, radius: 0.45, top: 0.28, bottom: 0.28, sides: 18 },   // up, a held breath, then let go
    sweep: { name: 'Tilt',        kind: 'wall',   ram: 6, width: 2.2, height: 1.3, passThrough: true },
    slam:  { name: 'Crush',       kind: 'ring',   maxR: 3.6, height: 1.6 },
    point: { name: 'Singularity', kind: 'void',   radius: 2, range: 10 },
    grip:  { name: 'Gravity Grip', kind: 'grip' },
    charge: { name: 'Collapse',   kind: 'bolt',   speed: 7, radius: 0.4, shape: 'orb', size: 0.1, implode: 2.6, damage: 2, life: 2.5 },
  },
  flora: {
    punch: { name: 'Thorn',       kind: 'bolt',   speed: 13, radius: 0.22, shape: 'orb', size: 0.03, pierce: true },
    shove: { name: 'Bramble',     kind: 'wall',   ram: 4, width: 2, height: 1.4, stand: 25 },
    lift:  { name: 'Sprout',      kind: 'column', launch: true, radius: 0.35, top: 0.1, bottom: 0.2, sides: 8 },
    sweep: { name: 'Vine Lash',   kind: 'whip',   range: 3.8, arc: 1.1 },
    slam:  { name: 'Overgrowth',  kind: 'ring',   maxR: 4, height: 1.2 },
    point: { name: 'Snapper Seed', kind: 'bolt',  speed: 9, radius: 0.25, shape: 'orb', size: 0.045, seed: true, turret: true },   // in a creature it sprouts; on any surface it grows a snapper
    grip:  { name: 'Vine Grip',   kind: 'grip' },
    charge: { name: 'Ironwood',   kind: 'bolt',   speed: 9, radius: 0.45, shape: 'orb', size: 0.12, damage: 3, entangle: 1.6, life: 2.5 },
  },
  astra: {
    punch: { name: 'Comet',       kind: 'bolt',   speed: 11, radius: 0.3, shape: 'orb', size: 0.06, blast: 0.7, sky: true, life: 2 },
    shove: { name: 'Downburst',   kind: 'cone',   range: 4.5, angle: 0.8, sky: true, push: 3 },
    lift:  { name: 'Moonrise',    kind: 'column', launch: true, radius: 0.4, top: 0.25, bottom: 0.25, sides: 18 },
    sweep: { name: 'Aurora',      kind: 'wall',   ram: 6, width: 2.4, height: 1.5, passThrough: true },
    slam:  { name: 'Starfall',    kind: 'ring',   maxR: 4.2, height: 1.6 },
    point: { name: 'Sunbeam',     kind: 'beam',   range: 6, straight: true, sky: true, damage: 2 },
    grip:  { name: 'Meteor Shower (hold)', kind: 'bolt', speed: 11, radius: 0.3, shape: 'orb', size: 0.06, blast: 0.8, sky: true, shower: 5, life: 2 },
    charge: { name: 'Meteor Shower', kind: 'bolt', speed: 11, radius: 0.3, shape: 'orb', size: 0.06, blast: 0.8, sky: true, shower: 5, life: 2 },
  },
  morph: {
    punch: { name: 'Spear Hand',  kind: 'lance',  range: 2.8, damage: 2 },      // the arm itself goes out, through everything in line, and comes back
    shove: { name: 'Carapace',    kind: 'cone',   range: 1.4, angle: 1.2, damage: 1, push: 4, armour: 4 },
    lift:  { name: 'Spine',       kind: 'column', launch: true, radius: 0.3, top: 0.03, bottom: 0.16, sides: 5 },
    sweep: { name: 'Tail Whip',   kind: 'whip',   range: 2.6, arc: 1.4, damage: 2 },
    slam:  { name: 'Stomp',       kind: 'ring',   maxR: 3, height: 1.4, launch: true },
    point: { name: 'Blood Needle', kind: 'bolt',  speed: 22, radius: 0.18, shape: 'needle', venom: true, blood: true },   // costs nothing; what it kills gives blood back
    grip:  { name: 'Grapple',     kind: 'grip' },
    charge: { name: 'Rocket Fist', kind: 'bolt',  speed: 13, radius: 0.4, shape: 'fist', pierce: true, damage: 3, boomerang: true, life: 0.9 },   // the fist leaves, and comes home
  },
  umbra: {
    punch: { name: 'Shade Spike', kind: 'column', radius: 0.3, top: 0.01, bottom: 0.13, sides: 4 },       // nothing leaves your hand: it comes out of the surface nearest the target
    shove: { name: 'Eclipse',     kind: 'zone',   radius: 1.3, seconds: 5 },                              // a ball of dark that stays: what is inside is blind and bleeding
    lift:  { name: 'Pit',         kind: 'void',   radius: 1.4, range: 8 },
    sweep: { name: 'Scythe',      kind: 'bolt',   speed: 12, radius: 0.45, shape: 'crescent', size: 0.45, pierce: true, life: 1 },
    slam:  { name: 'Nightfall',   kind: 'ring',   maxR: 4.5, height: 1.6 },
    point: { name: 'Hex',         kind: 'beam',   range: 12, straight: true, chain: 1 },
    grip:  { name: 'Black Sun (hold)', kind: 'bolt', speed: 6, radius: 0.4, shape: 'orb', size: 0.1, implode: 2.2, damage: 2, life: 2.5 },
    charge: { name: 'Black Sun',  kind: 'bolt',   speed: 6, radius: 0.4, shape: 'orb', size: 0.1, implode: 2.2, damage: 2, life: 2.5 },
  },
  necro: {
    punch: { name: 'Bone Shard',  kind: 'bolt',   speed: 16, radius: 0.2, shape: 'bone', pierce: true },
    shove: { name: 'Wail',        kind: 'cone',   range: 5, angle: 0.9, fear: true },
    lift:  { name: 'Grasp',       kind: 'column', radius: 0.3, top: 0.1, bottom: 0.16, sides: 5, root: 3 },      // a hand out of the floor: it holds what it catches
    sweep: { name: 'Reap',        kind: 'whip',   range: 3, arc: 1.3, damage: 2 },
    slam:  { name: 'Graveyard',   kind: 'ring',   maxR: 3.5, height: 1.4, summon: 1 },                          // and one of the dead gets up where you struck
    point: { name: 'Doom',        kind: 'beam',   range: 12, straight: true, doom: true },                       // marked: three more hits land by themselves
    grip:  { name: 'Legion (hold)', kind: 'legion', count: 3 },
    charge: { name: 'Legion',     kind: 'legion', count: 3 },
  },
};

// How each discipline's sense is called, in words, for the HUD and the wheel.
export const SENSE_HOW = { terra: 'palm on any surface', flora: 'palm on any surface', aero: 'clap', aqua: 'raise an open palm', lumen: 'raise an open palm, facing out', astra: 'raise an open palm, facing out',
  pyro: 'raise a fist and hold', gravis: 'raise a fist and hold', morph: 'raise a fist and hold', umbra: 'always on; raise a fist to hide', necro: 'raise a fist and hold' };
// Two hands, closed together and hauled: a great wall out of whatever you were reaching at. Every discipline has one.
export const HAUL = { name: 'Great Wall', kind: 'wall', ram: 5, width: 2.6, height: 1.9, stand: 30 };
for (const k in MOVES) MOVES[k].haul = { ...HAUL, name: { terra: 'Great Wall', aqua: 'Tide Wall', pyro: 'Wall of Fire', aero: 'Wind Wall', flora: 'Thicket', lumen: 'Ward', gravis: 'Event Horizon', astra: 'Aurora Wall', morph: 'Bone Wall', umbra: 'Curtain of Night', necro: 'Ossuary' }[k] || 'Great Wall' };

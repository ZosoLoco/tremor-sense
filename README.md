# Tremor Sense

Mixed reality prototype for Resonance: four disciplines, hand tracked, in your real room. Open the page in the Quest 3 browser and enter mixed reality.

**Pick a discipline:** turn an open palm toward your face and poke one of the four orbs with your other index finger.

## The creatures

Six creatures drift around the room out of sight. Every few seconds one stops, swells, turns magenta and spits a shard at you. Five hits and the round resets. The shard is a physical object, so you have options:

- **Block:** a Rampart or Spire takes the hit (three hits breaks it).
- **Deflect:** Gust or Flame Burst sends it straight back at the creature that fired it.
- **Catch:** grab it with Wind Grip, Water Grip or Unearth and throw it back. Returned shards hit twice as hard.
- **Knock it away:** any move or object that touches it turns it.

Creatures take two hits. Attacking gives away a creature's position for a few seconds.

## Senses

Each fills the whole room and tells you something different.

| Discipline | Sense | Trigger | What you get |
|---|---|---|---|
| Terra | Tremor | open palm on a real surface | A ripple through every surface. Shows where everything is, once. |
| Aero | Draft | clap | The room's air made visible for 9 s. Anything that moves gives itself away and leaves a trail. |
| Pyro | Chi | hold a raised fist still | Heat and life through walls for as long as you hold. Every creature, plus a heat ghost on every object: bright if it is burning, molten or explosive. |
| Aqua | Tide | hold a raised open palm out | Water spreads across the whole floor. Everything standing over it shows as ripples, creatures and objects alike. |

## Moves

| | Punch | Shove | Lift (palm up, raise) | Sweep (open hand sideways) | Slam (fist on a surface) | Point (index finger jab) |
|---|---|---|---|---|---|---|
| Terra | Stone Shot | Boulder | Spire | Rampart | Fault Line | Ferro Disc |
| Pyro | Ember | Flame Burst | Pyre | Fire Arc | Eruption | Volt |
| Aqua | Globe | Breaker | Geyser | Whip | Surge | Frost Needle |
| Aero | Air Bullet | Gust | Updraft | Air Blade | Shockwave | Void |

**Twin casts.** The same move with both hands together comes out bigger and one point harder.

**Earth from any surface.** Spire grows out of whichever surface is nearest its target: floor, wall, ceiling or table. Unearth pulls a boulder out of whatever you reach at.

**Defence.** A Spire stays where it grew for 18 s. A Rampart stands for 30 s and blocks like a real wall, for you as well as for them. Hit it with a punch or a shove and it charges in that direction.

## Water

- **Sources.** In Aqua, an open palm on any surface starts water welling up there for 35 s. Geyser and Surge leave a source where they came up. A broken water barrel leaves one too.
- **Carried water.** While a source is running, water streams across the room to your hand and gathers there, up to three measures. Each Aqua move spends one, leaves from the water and hits a point harder. With none, Aqua still works at base strength.
- **Whip.** Aqua's sweep is one long lash across everything in front of you.

## Grip

Reach an open hand at something (a ring shows what you would take), close your fist to hold it, open your hand to let go.

| Discipline | Grip | What it does |
|---|---|---|
| Aero | Wind Grip | Bands of wind wind round any object or cloud you have a clear line to. Carry it, thrust your arm out to throw it, close your other fist to crush it. |
| Aqua | Water Grip | Water closes over an object, or takes a creature by the water in it, even through walls. Slam it into things, or wring it with your other fist. |
| Terra | Unearth | Holds stone and steel, or tears a fresh boulder out of any surface. |
| Pyro | Fireball | Keep a raised fist closed to grow a fireball, then punch to throw. |

## Matter changes state

| From | Do this | Get |
|---|---|---|
| Water source or barrel | Frost Needle | Blocks of ice. They slide, and a thrown one freezes what it hits. |
| Ice | Any fire | A water source again. |
| Water source | Any fire | A steam cloud. It scalds creatures inside it. Gust blows it around; Wind Grip carries it. |
| Stone or boulder | Any fire | Molten rock for 10 s. It leaves what it hits burning and sets light to what it touches. Steel goes red hot the same way. |
| Stone or boulder | Crush with Wind Grip | A sand cloud. Creatures inside it are blinded: they stop moving and cannot attack. Terra can carry it. |

Marks on creatures combine as before: soaked + Volt conducts, frozen + Terra shatters, airborne + Aero finishes, fire + water makes steam.

## Objects

Each round lays out a dozen: crates, a shipping crate, powder kegs, water barrels, stone blocks, a boulder, a steel ball and an anvil. They start in open space on whatever is underneath, land on table tops, fall off edges, bounce off the room and each other, and hurt creatures they hit at speed. Heavy ones lag behind your hand.

Controllers work as a fallback: trigger punches at what you point at (or senses), grip changes discipline. Holds need hand tracking.

On a phone or desktop the page runs a preview room: pick a discipline and a move, then tap the room. For the grip move, press and drag, and release to throw; C or the Squeeze button is the other fist.

No build step. `index.html`, `main.js` and a vendored copy of three.js. Serve over HTTPS (GitHub Pages works) because WebXR requires it.

Tuning lives at the top of `main.js`: gesture speeds and distances, sense ranges, and the `MOVES` table that defines every attack. Colours and flow of each element live in `ENERGY`.

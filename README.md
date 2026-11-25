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

**Earth from any surface.** Spire grows out of whichever surface is nearest its target: floor, wall, ceiling or table. Fault Line runs across whatever surface your fist struck, wall or table included. Rampart rises where you are looking: on the floor or a table top it is a wall, and if you look along a wall of the room it juts out of that wall as a partition. Unearth pulls a boulder out of whatever you reach at.

**Four kinds of earth.** Pick Terra again while it is already selected (poke its orb a second time) to step through them. Every Terra move is then made of that material.

| Form | What changes |
|---|---|
| Rock | The default. Hits twice as hard as anything else. |
| Sand | Light hits that blind for 3 s. Shots pass through creatures and leave a sand cloud where they land. Unearth pulls out a sand cloud to carry. |
| Metal | Shots ricochet twice more. Whatever they hit conducts Volt like a soaked target. Walls and spires take six hits, and shards ring off them back at the sender. Unearth pulls out an anvil. |
| Lava | Everything it hits burns. It lights crates and kegs, boils water sources to steam, and lights the room. Unearth pulls out molten rock. |

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

**Light.** Fire, lava and lightning throw light on your real walls, floor and furniture: a warm pool under a Pyre, a flash across the room from an explosion or a Volt.

Marks on creatures combine as before: soaked + Volt conducts, frozen + Terra shatters, airborne + Aero finishes, fire + water makes steam.

## Objects

Each round lays out a dozen: crates, a shipping crate, powder kegs, water barrels, stone blocks, a boulder, a steel ball and an anvil. They start in open space on whatever is underneath, land on table tops, fall off edges, bounce off the room and each other, and hurt creatures they hit at speed. Heavy ones lag behind your hand.

Controllers work as a fallback: trigger punches at what you point at (or senses), grip changes discipline. Holds need hand tracking.

On a phone or desktop the page runs a preview room: pick a discipline and a move, then tap the room. For the grip move, press and drag, and release to throw; C or the Squeeze button is the other fist.

No build step. `index.html`, `main.js` and a vendored copy of three.js. Serve over HTTPS (GitHub Pages works) because WebXR requires it.

Tuning lives at the top of `main.js`: gesture speeds and distances, sense ranges, and the `MOVES` table that defines every attack. Colours and flow of each element live in `ENERGY`.


## Build 4 to 6: sub-elements, charged throws, shaping

### Sub-elements
Pick the discipline you are already in (poke its orb again, or tap its chip) to step to its next form.

| Discipline | Forms | What changes |
|---|---|---|
| Terra | rock, sand, metal, lava | as before |
| Pyro | flame, lightning, blast | lightning arcs to a second creature and conducts, no burn. Blast makes every hit a small explosion, no burn. |
| Aqua | water, ice, steam | ice freezes; Breaker stands as an ice wall, Geyser as an ice spike. Steam blinds and leaves scalding cloud, no soak. |
| Aero | wind, vacuum, sound | vacuum pulls toward you and drains (a second hit lands by itself). Sound passes through walls and stuns, no shove. |

### Charged throws
Hold a raised fist closed, then punch to let it go. Pyro charges at any reach; the others charge with the fist drawn in
close to you (a fist reached out is a grab).

| Pyro | Aqua | Terra | Aero |
|---|---|---|---|
| Fireball | Deluge: spends all carried water, splashes, leaves a source. While charging, water streams in faster and past the usual three measures; with no source it condenses slowly from the air. | Meteor: arcs, lands as a quake, leaves a stone | Air Cannon: a fast ball of wind that goes through everything in line |

### Shaping: the pinch
Thumb and index together, other fingers out.

- **Aqua, Stream.** The water you carry runs out into a rope hanging from your fingers. Swing it to lash. Close the
  fist and the tip takes hold of what you are reaching at: a creature is dragged with your hand and cannot attack,
  an object swings like a weight on a line. The other fist constricts or crushes. Open the hand to let go and fling.
  Pinch the stream with your other hand and it stretches into a curtain that swallows shards (and turns them into
  water). Let go with that second hand while your hands are more than half a metre apart and it stays as a wall.
  Hit your own water wall and it rolls out as a wave. In ice form the stream is a blade, the curtain reflects, the
  wall is ice and breaks into shards. In steam form it scalds and the wall is a bank of cloud.
- **Aero, Current.** Pinch and drag a line through the air. Wind keeps blowing along it for 12 seconds: it carries
  objects and clouds, pushes creatures, and takes over shards. Push an open hand through it to bend it. Vacuum form
  runs it backwards and drains. Sound form holds creatures stunned instead of moving them. Three at a time.
- **Pyro, Fire Line.** Pinch and drag: a line of fire that burns for 7 seconds, hurts what crosses, eats shards.
  Lightning form goes off once along the whole line. Blast form is a fuse.
- **Terra, Ridge.** Pinch and drag: low cover rises from the floor under the line, in the current earth form.

### Also
Creature kinds (ember, wisp, pebble, drip) and waves; palm menu second row: CALM (no attacks), READ (shows what the
hand tracker thinks you did), NEW (new game); particle detail adapts to frame rate.
In the browser preview: `charge` and `draw` chips (press, hold or drag, release).

## Build 7: room view, occlusion, two new disciplines, sound

- **Room view.** The grid is gone. The room is drawn as its outline (the hard edges of walls and furniture as lines) with
  a faint fill, and a tremor pulse crosses it as a bright front with ripples behind. If the headset reports a scanned
  mesh of the room, only that is drawn; otherwise furniture boxes; otherwise flat planes. They no longer stack.
- **Occlusion.** Room surfaces are written to the depth buffer first, so real walls and furniture hide what is behind
  them. Creatures revealed by a sense still glow through. `OCCL` on the palm menu turns it off.
- **Lumen** (light): Lance, Flare, Pillar, Halo, Nova, Prism, Sunburst (charged), Mirror Line (drawn: turns shards back).
  Hits dazzle and leave the target exposed, so the next hit from another discipline lands harder. Forms: light, prism,
  shadow. Glint Sense (raised open palm): shows everything in line of sight.
- **Gravis** (gravity): Graviton, Repulse, Levitate, Tilt, Crush, Singularity, Gravity Grip, Collapse (charged), Rift
  (drawn: everything near falls toward the line). Crush brings down anything in the air. Forms: pull, float, crush.
  Mass Sense (raised fist): creatures and objects through walls.
- The palm menu has a second row of orbs, toward the fingers, for the new two. Keys 5 and 6 in the preview.
- **Sound.** Every move has its own synthesised sound in its discipline's voice, sub-elements add a layer, and
  everything runs through one compressor.

## Build 8

- **Fixed:** poking Lumen or Gravis on the palm menu flipped a switch instead. The menu now has three rows of orbs
  (4, 4, 2) above the switches.
- **Live depth occlusion.** The session asks for the headset's depth sensor. When it is granted, hands, arms, body and
  anything else real hide what is behind them. `OCCL` turns all occlusion off.
- **Four more disciplines** (ten in all), each with seven moves, a charged move, a drawn line, a sense, three forms and
  its own voice:
  - **Flora** roots what it hits. Thorn, Bramble (a standing wall), Sprout, Vine Lash, Overgrowth, Seed, Vine Grip,
    Ironwood, Snare. Forms vine, thorn, spore. Root Sense: palm on a surface.
  - **Astra** comes down from above the target. Comet, Downburst, Moonrise, Aurora, Starfall, Sunbeam, Meteor Shower,
    Constellation. Forms day, night, storm. Zenith Sense: raised open palm, shows what has open air above it.
  - **Morph** is close range and armoured. Ram Fist, Carapace (armour), Spine, Tail Whip, Stomp, Stinger, Grapple,
    Titan Fist, Bone Ridge. Kills heal you. Forms beast, shell, venom. Pulse Sense: raised fist.
  - **Umbra** blinds and drains. Shade Bolt, Eclipse, Pit, Scythe, Nightfall, Hex, Black Sun, Veil. Forms shade, fear,
    hollow. Dark Sense: raised fist; while held, nothing can see you.
- **Reactions.** Water or ice puts out burning objects, cools molten stone and kills a fire line in steam. Fire melts an
  ice wall into a water source. Fire on rooted creatures does extra and burns the roots off; water on them doubles
  the root; water on a snare makes it last longer; a fire line burns a snare. Light on a blinded creature does +2.
  A Morph hit shatters frozen creatures. Storm soaks then conducts. Chi cannot see frost creatures or ice.
- **Guard.** Cross your forearms in front of your chest: a shield in the current discipline. Nothing thrown lands while
  it is up. Aero, Lumen, Gravis and steel throw shards back; Aqua swallows them as water; Pyro burns the thrower;
  Flora roots the thrower. (`G` in the preview.)
- **Water.** The carried water floats in front of your chest (capacity 4) so either hand can use it. With nothing
  carried, Aqua bolts, cones and whips leave straight from the nearest source you can see.
- **Creatures.** Crawlers (floor, fast), flyers (near the ceiling), brutes (6 health, cannot be tossed, from wave 2),
  shades (weak to light), frost (weak to fire, invisible to Chi).

## Build 10: constructs and stranger abilities

- **Morph.** Spear Hand (punch): the arm itself extends up to 2.8 m through everything in line and retracts.
  Glaive (pinch): a bladed tendril grows from the hand; it lashes, hooks creatures and objects on a closed fist, and
  needs no water. Rocket Fist (charged): the fist flies out and comes back. Blood Needle (point).
- **Flora.** Snapper Seed (point): on any surface (floor, wall, ceiling) the seed grows a snapper that bites what is
  close, spits thorns at what is not, and eats shards. Three at a time, 25 seconds each.
- **Lumen.** A sweep leaves a blade of light in that hand for ten seconds. It cuts when swung, parries shards, and
  each sweep still throws a crescent.
- **Umbra.** Void sight, always on: every creature shows as a black hole in the room, through anything, with no
  colour or kind. Holding the fist still hides you.
- **Your constructs move.** An open-palm shove at a wall you raised (in the same discipline) slides it 1.6 m and hits
  what it passes through. A punch still breaks it loose.
- **Ceilings.** Water sources on a ceiling rain: what stands under them is soaked and fires below go out.

## Build 11: the wheel, Necro, familiars, shortcuts

- **Power wheel.** The palm menu is now a ring of beads round the palm. Hover a fingertip near one and the plate in
  the middle names it and lists what it does; touch to take it. Under the plate are the current discipline's
  sub-elements as labelled chips: touch one to switch straight to it. Switches sit below the ring, toward the wrist.
- **Shortcuts.** Thumb to middle finger (on an open hand): back to the previous discipline. Thumb to ring finger:
  next sub-element. `Tab` in the preview swaps back.
- **Necro.** Bone Shard, Wail, Grasp (a hand from the floor that holds), Reap, Graveyard, Doom (three more hits land
  by themselves), Legion (charged: three thralls). Anything Necro kills rises as a thrall that hunts the nearest
  creature, bites it, and takes shards for you. Four at a time. Forms bone, plague, spirit.
- **Summoning circles.** Pinch and draw a closed loop instead of a line and the discipline's familiar appears in it,
  using that discipline's basic attack in your current sub-element: Ember Wisp, Stone Sentry, Cyclone (roams),
  Sun Mote (follows you), Moon (orbits you), Guide Star (climbs high), Shade (follows you). Flora grows a snapper on
  the nearest surface; Necro raises two thralls. Two familiars at a time, 22 seconds each.

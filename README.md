# Tremor Sense

Mixed reality prototype for the Terra discipline. Open the page in the Quest 3 browser, enter mixed reality, and:

**Pick a discipline:** turn an open palm toward your face and poke one of the four orbs with your other index finger.

**Sense first.** Each discipline finds the hidden echoes a different way:

| Discipline | Sense | Trigger | What it can and cannot find |
|---|---|---|---|
| Terra | Tremor Sense | open palm on a real surface | A ripple through the room. Passes through everything, but takes time to travel. |
| Pyro | Chi Sense | hold a raised fist still | Everything within about 3 m of you, through walls. Nothing beyond. |
| Aqua | Tide Sense | hold a raised open palm out, still | A narrow beam you sweep around. Long range, through walls. |
| Aero | Draft Sense | clap | A fast burst in every direction. Only finds what it has a clear line to. |

**Then strike.** Six verbs, and every discipline answers them differently:

| | Punch (fist forward) | Shove (open palm forward) | Lift (palm up, raise) | Sweep (open hand sideways) | Slam (fist on a surface) | Point (index finger jab) |
|---|---|---|---|---|---|---|
| Terra | Stone Shot | Boulder | Spire | Rampart | Fault Line | Ferro Disc |
| Pyro | Ember | Flame Burst | Pyre | Fire Arc | Eruption | Volt |
| Aqua | Jet | Breaker | Geyser | Riptide | Surge | Frost Needle |
| Aero | Air Bullet | Gust | Updraft | Air Blade | Shockwave | Void |

**Twin casts.** Make the same move with both hands together and it comes out bigger and one point harder.

**Echoes take two hits, and each discipline marks them differently:**

- **Pyro burns.** A second point of damage lands by itself 1.5 s later.
- **Aqua soaks.** No extra damage, but it sets up Volt and puts out a burn.
- **Frost Needle freezes** an echo in place for 6 s.
- **Terra hits twice as hard**, so stone kills in one, but its moves are slow or need setup.
- **Aero shoves** echoes across the room. Void drags everything near a point into one spot.
- **Lifts and Surge toss** echoes into the air for a couple of seconds.

**Marks combine:**

| Setup | Finisher | Result |
|---|---|---|
| Soaked | Volt | Conducts: instant kill, and it jumps to every other soaked echo in reach |
| Frozen | Any Terra move | Shatters: instant kill, and the shards hurt everything within a metre |
| Airborne | Any Aero move | Air finish: instant kill |
| Soaked | Any other Pyro move | Steam: the soak and the burn cancel out |
| Frozen | Any Pyro move | Thaws it back to soaked |

**The room is solid.** Anything that flies stops at real walls and furniture (Air Bullet ricochets twice, Ferro Disc three times, Breaker rolls through). Lightning stops at the first surface. Columns, ground rings and Fault Line come up from the floor, so they reach behind cover. Gust, Flame Burst and Void need a clear line.

Controllers work as a fallback: trigger punches at what you point at (or senses), grip changes discipline.

On a phone or desktop the page runs a preview room: pick a discipline and a move, then tap the room.

No build step. `index.html`, `main.js` and a vendored copy of three.js. Serve over HTTPS (GitHub Pages works) because WebXR requires it.

Tuning lives at the top of `main.js`: gesture speeds and distances, sense ranges, and the `MOVES` table that defines every attack. Colours and flow of each element live in `ENERGY`.

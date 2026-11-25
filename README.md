# Tremor Sense

Mixed reality prototype for the Terra discipline. Open the page in the Quest 3 browser, enter mixed reality, and:

- **Palm on a real surface** (floor, wall, table): sends a pulse through the room.
- **Strike what it reveals** with a basic attack from each discipline:
  - **Pyro, Ember**: closed fist, punch forward. One fast bolt.
  - **Aero, Gust**: open palm, shove forward. Wide cone that hits everything in it.
  - **Terra, Spire**: open palm facing up, lift. A column erupts from the floor under the target, even behind furniture.
  - **Aqua, Riptide**: open hand, sideways sweep. A homing arc that passes through targets.
- Controllers work as a fallback: trigger attacks what you point at (or pulses a surface), grip changes discipline.

On a phone or desktop the page runs a preview room: tap a surface to pulse, pick a discipline, tap an echo to strike it.

No build step. `index.html`, `main.js` and a vendored copy of three.js. Serve over HTTPS (GitHub Pages works) because WebXR requires it.

Tuning lives at the top of `main.js`: pulse speed and life, palm touch distances, the speed each gesture needs, echo count.

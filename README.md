# Tremor Sense

Mixed reality prototype for the Terra discipline. Open the page in the Quest 3 browser, enter mixed reality, and:

- **Palm on a real surface** (floor, wall, table): sends a pulse through the room.
- **Pinch toward a revealed echo**: pulls it in.
- Controller trigger works as a fallback: point and pull.

On a phone or desktop the page runs a preview room: tap a surface to pulse, tap an echo to catch it.

No build step. `index.html`, `main.js` and a vendored copy of three.js. Serve over HTTPS (GitHub Pages works) because WebXR requires it.

Tuning lives at the top of `main.js`: pulse speed and life, touch and pinch distances, catch angle, echo count.

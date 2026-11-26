import { ensureAudio } from './audio.js?v=17';
import { ST, LATE } from './state.js?v=17';
import { statusEl, hintEl, enterBtn, uiEl } from './core.js?v=17';
import { renderer, scene, PREVIEW_BG } from './renderer.js?v=17';
import { pulseUniforms } from './pulse.js?v=17';
import { previewGroup, fallbackFloor, clearRoom } from './room.js?v=17';
import { scatterEchoes } from './echoes.js?v=17';
import { menuGroup, readout } from './selection.js?v=17';
import { hud, drawHud } from './hud.js?v=17';
import { newHand, handState, onSelectStart, onSqueezeStart } from './hands.js?v=17';

// ---------- session ----------
ST.xrSupported = false;
ST.sessionStart = 0;
ST.askedForRoom = false;
ST.placed = false;

async function enterXR() {
  ensureAudio();
  enterBtn.disabled = true;
  try {
    const session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['hand-tracking', 'plane-detection', 'mesh-detection', 'anchors', 'depth-sensing'],
      // The headset's own depth camera: with it, your hands, your body and anything else real hide what is behind them.
      depthSensing: { usagePreference: ['gpu-optimized'], dataFormatPreference: ['unsigned-short', 'float32', 'luminance-alpha'] },
    });
    renderer.xr.setReferenceSpaceType('local-floor');
    await renderer.xr.setSession(session);
    session.addEventListener('selectstart', onSelectStart);
    session.addEventListener('squeezestart', onSqueezeStart);
    session.addEventListener('end', onSessionEnd);
    scene.background = null;
    previewGroup.visible = false;
    pulseUniforms.uBase.value = 0;
    uiEl.style.display = 'none';
    hud.visible = true;
    ST.sawHands = false; ST.askedForRoom = false; ST.placed = false; ST.previewHold = null;
    handState.left = newHand(); handState.right = newHand();
    ST.hudNote = 'show your hands';
    ST.sessionStart = performance.now() / 1000;
    for (const v of pulseUniforms.uPulses.value) v.w = -999;
    drawHud();
  } catch (err) {
    statusEl.textContent = `Could not start mixed reality: ${err.message}`;
    enterBtn.disabled = false;
  }
}

function onSessionEnd() {
  clearRoom();
  fallbackFloor.visible = false;
  menuGroup.visible = false;
  scene.background = PREVIEW_BG;
  previewGroup.visible = true;
  pulseUniforms.uBase.value = 0.1;
  uiEl.style.display = '';
  hud.visible = false;
  readout.visible = false;
  enterBtn.disabled = false;
  scatterEchoes();
}

if (navigator.xr && navigator.xr.isSessionSupported) {
  navigator.xr.isSessionSupported('immersive-ar').then((ok) => {
    ST.xrSupported = ok;
    if (ok) {
      enterBtn.disabled = false;
      statusEl.textContent = 'Headset ready.';
      hintEl.textContent = 'In the headset: turn an open palm toward your face and poke an orb to pick a discipline. Sense first (Terra: palm on a surface. Aero: clap. Aqua: hold a raised palm out. Pyro: hold a raised fist), then punch, shove, lift, sweep, jab with a pointed finger, or slam a fist on a surface. Both hands together cast a twin. To hold something, reach an open hand at it and close your fist; open to let go. Creatures shoot back: block with a Rampart, blow shards back with Gust, or catch them. Under the palm menu orbs: CALM stops them attacking, READ shows what the tracker sees your hands doing, NEW restarts.';
    } else {
      statusEl.textContent = 'No mixed reality here. Open this page in the Quest browser to play for real.';
    }
  }).catch(() => { statusEl.textContent = 'Preview mode.'; });
} else {
  statusEl.textContent = 'Preview mode. Open this page in the Quest browser to play for real.';
}
enterBtn.addEventListener('click', enterXR);


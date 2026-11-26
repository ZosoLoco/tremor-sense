// Tremor Sense: sound. Everything is synthesised; there are no audio files.

// ---------- sound ----------
let audio = null;
export function ensureAudio() {
  if (!audio) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audio = new Ctx();
  }
  if (audio && audio.state === 'suspended') audio.resume();
}
// Everything goes through one compressor, so a room full of things going off at once does not clip.
let masterNode = null, noiseBuf = null;
export function master() {
  if (!masterNode) {
    masterNode = audio.createDynamicsCompressor();
    masterNode.threshold.value = -16; masterNode.ratio.value = 6; masterNode.attack.value = 0.003; masterNode.release.value = 0.2;
    masterNode.connect(audio.destination);
  }
  return masterNode;
}
// Filtered noise: the body of fire, water, wind and breaking stone. The filter sweeps from f0 to f1 over the sound.
export function noise(kind, f0, f1, dur, gain, q = 1, delay = 0, attack = 0.02) {
  if (!audio) return;
  if (!noiseBuf) {
    noiseBuf = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = audio.currentTime + delay;
  const src = audio.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  const f = audio.createBiquadFilter();
  f.type = kind; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t0 + dur);
  const g = audio.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(attack, dur * 0.5));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master());
  src.start(t0, Math.random());
  src.stop(t0 + dur + 0.05);
}
// A sound is a list of layers. ['t', from, to, seconds, gain, wave, delay] is a pitched tone;
// ['n', filter, from, to, seconds, gain, q, delay, attack] is swept noise.
export function play(layers) {
  if (!audio || !layers) return;
  for (const l of layers) {
    if (l[0] === 't') tone(l[1], l[2], l[3], l[4], l[5] || 'sine', l[6] || 0);
    else noise(l[1], l[2], l[3], l[4], l[5], l[6] ?? 1, l[7] || 0, l[8] ?? 0.02);
  }
}
// One voice per discipline, one sound per move.
//   Pyro roars (low noise opening up, a saw underneath).   Aqua glides and splashes (sine slides, mid noise).
//   Terra cracks and rumbles (square lows, dull noise).    Aero is breath (thin, high, fast noise).
//   Lumen rings (stacked pure tones).                      Gravis bends (deep sines that fall or climb).
let FORM_SFX_MORE;
export const SFX = {
  pyro: {
    punch:  [['n', 'bandpass', 1400, 350, 0.28, 0.3, 0.8], ['t', 520, 110, 0.3, 0.16, 'sawtooth']],
    shove:  [['n', 'lowpass', 500, 2600, 0.25, 0.4, 0.7], ['n', 'lowpass', 2600, 300, 0.7, 0.4, 0.7, 0.2], ['t', 90, 60, 0.8, 0.2, 'sawtooth']],
    lift:   [['n', 'lowpass', 250, 2200, 0.6, 0.4, 1, 0, 0.3], ['t', 70, 210, 0.6, 0.22, 'sawtooth']],
    sweep:  [['n', 'bandpass', 500, 2000, 0.22, 0.32, 1.2], ['n', 'bandpass', 2000, 600, 0.3, 0.22, 1.2, 0.18]],
    slam:   [['t', 80, 30, 0.9, 0.6], ['n', 'lowpass', 2200, 150, 1.0, 0.5, 0.7], ['n', 'bandpass', 900, 400, 0.5, 0.2, 2, 0.25]],
    point:  [['n', 'highpass', 5000, 2500, 0.07, 0.4, 0.7, 0, 0.002], ['t', 3000, 120, 0.14, 0.2, 'square']],
    charge: [['n', 'lowpass', 900, 200, 0.6, 0.45, 0.7], ['t', 240, 70, 0.55, 0.3, 'sawtooth'], ['n', 'bandpass', 1800, 700, 0.3, 0.2, 1]],
    grip:   [['n', 'lowpass', 900, 200, 0.6, 0.45, 0.7], ['t', 240, 70, 0.55, 0.3, 'sawtooth']],
    draw:   [['n', 'lowpass', 400, 1800, 0.5, 0.3, 0.8, 0, 0.2], ['t', 110, 160, 0.5, 0.12, 'sawtooth']],
    sense:  [['t', 110, 110, 1.2, 0.14, 'sine'], ['t', 165, 165, 1.2, 0.07, 'sine'], ['n', 'lowpass', 300, 500, 1.2, 0.1, 1, 0, 0.5]],
  },
  aqua: {
    punch:  [['t', 300, 760, 0.22, 0.2], ['n', 'bandpass', 1600, 900, 0.18, 0.16, 1.5, 0.05]],
    shove:  [['n', 'lowpass', 300, 1500, 0.5, 0.35, 0.7, 0, 0.35], ['n', 'bandpass', 1800, 700, 0.7, 0.3, 0.8, 0.4], ['t', 120, 70, 0.9, 0.2]],
    lift:   [['n', 'highpass', 700, 3200, 0.55, 0.22, 0.7, 0, 0.25], ['t', 180, 640, 0.5, 0.16], ['n', 'bandpass', 1200, 600, 0.5, 0.2, 1, 0.45]],
    sweep:  [['n', 'bandpass', 700, 2600, 0.24, 0.22, 2], ['n', 'highpass', 4000, 6000, 0.05, 0.45, 0.7, 0.24, 0.002], ['t', 1500, 300, 0.1, 0.14, 'triangle', 0.24]],
    slam:   [['t', 90, 40, 0.6, 0.45], ['n', 'bandpass', 900, 500, 0.9, 0.42, 0.6], ['n', 'highpass', 2500, 1500, 0.6, 0.14, 0.7, 0.15]],
    point:  [['t', 2400, 3300, 0.14, 0.14, 'triangle'], ['t', 3600, 4800, 0.2, 0.07, 'sine', 0.03], ['n', 'highpass', 6000, 8000, 0.08, 0.12, 0.7]],
    charge: [['n', 'lowpass', 400, 1800, 0.35, 0.4, 0.7, 0, 0.2], ['n', 'bandpass', 1500, 500, 0.6, 0.35, 0.7, 0.3], ['t', 140, 60, 0.7, 0.3]],
    grip:   [['t', 260, 180, 0.4, 0.16], ['n', 'bandpass', 900, 500, 0.45, 0.2, 2]],
    draw:   [['n', 'bandpass', 600, 1500, 0.5, 0.2, 3, 0, 0.2], ['t', 420, 640, 0.4, 0.1]],
    latch:  [['n', 'bandpass', 1400, 600, 0.2, 0.3, 2, 0, 0.005], ['t', 500, 240, 0.18, 0.16]],
    wall:   [['n', 'lowpass', 300, 1600, 0.45, 0.35, 0.7, 0, 0.3], ['t', 150, 220, 0.4, 0.14]],
    sense:  [['t', 220, 330, 1.2, 0.1], ['n', 'bandpass', 500, 900, 1.3, 0.12, 4, 0, 0.5]],
  },
  terra: {
    punch:  [['t', 150, 45, 0.3, 0.4, 'square'], ['n', 'lowpass', 900, 300, 0.12, 0.35, 0.7, 0, 0.003]],
    shove:  [['n', 'lowpass', 260, 140, 1.3, 0.55, 0.7, 0, 0.2], ['t', 62, 40, 1.3, 0.35, 'square'], ['n', 'bandpass', 700, 300, 0.2, 0.2, 2, 0, 0.003]],
    lift:   [['n', 'bandpass', 300, 1500, 0.26, 0.4, 1.5, 0, 0.003], ['t', 60, 170, 0.3, 0.35, 'square'], ['n', 'lowpass', 500, 200, 0.4, 0.3, 0.7, 0.2]],
    sweep:  [['n', 'lowpass', 420, 200, 0.7, 0.5, 0.7, 0, 0.1], ['t', 55, 48, 0.7, 0.4, 'square'], ['n', 'bandpass', 1100, 500, 0.15, 0.2, 2, 0.5, 0.003]],
    slam:   [['t', 85, 28, 0.9, 0.65], ['n', 'bandpass', 1300, 500, 0.1, 0.35, 2, 0.1, 0.003], ['n', 'bandpass', 1000, 400, 0.1, 0.3, 2, 0.24, 0.003], ['n', 'bandpass', 800, 300, 0.14, 0.25, 2, 0.4, 0.003], ['n', 'lowpass', 300, 120, 1.0, 0.4]],
    point:  [['t', 1900, 1880, 0.5, 0.12, 'triangle'], ['t', 2860, 2840, 0.4, 0.07, 'triangle'], ['t', 4010, 3990, 0.3, 0.04, 'sine'], ['n', 'highpass', 5000, 3000, 0.05, 0.2, 0.7, 0, 0.002]],
    charge: [['t', 900, 160, 0.5, 0.12, 'triangle'], ['n', 'lowpass', 500, 180, 0.8, 0.5, 0.7], ['t', 70, 40, 0.8, 0.4, 'square']],
    grip:   [['n', 'lowpass', 500, 200, 0.5, 0.4, 0.7, 0, 0.05], ['t', 70, 110, 0.4, 0.3, 'square']],
    draw:   [['n', 'lowpass', 350, 200, 0.6, 0.45, 0.7, 0, 0.1], ['n', 'bandpass', 1000, 500, 0.12, 0.25, 2, 0.2, 0.003], ['t', 58, 80, 0.5, 0.3, 'square']],
    sense:  [['t', 55, 55, 1.0, 0.3], ['t', 110, 82, 0.6, 0.12, 'triangle']],
  },
  aero: {
    punch:  [['n', 'bandpass', 3200, 1600, 0.12, 0.3, 1.5, 0, 0.004], ['t', 1900, 500, 0.12, 0.04, 'sawtooth']],
    shove:  [['n', 'bandpass', 500, 2000, 0.4, 0.32, 0.9, 0, 0.25], ['n', 'bandpass', 2000, 700, 0.5, 0.25, 0.9, 0.3]],
    lift:   [['n', 'bandpass', 350, 2600, 0.6, 0.3, 1.2, 0, 0.3], ['n', 'highpass', 3000, 5000, 0.4, 0.08, 0.7, 0.3]],
    sweep:  [['n', 'bandpass', 3600, 900, 0.2, 0.34, 2.5, 0, 0.004], ['t', 2400, 700, 0.16, 0.04, 'sawtooth']],
    slam:   [['t', 110, 40, 0.45, 0.4], ['n', 'lowpass', 1800, 300, 0.5, 0.35, 0.7, 0, 0.004], ['n', 'highpass', 2500, 4500, 0.7, 0.1, 0.7, 0.1]],
    point:  [['n', 'bandpass', 2600, 180, 0.8, 0.3, 3, 0, 0.3], ['t', 600, 80, 0.8, 0.1], ['t', 70, 40, 0.3, 0.4, 'sine', 0.8]],
    charge: [['t', 220, 50, 0.4, 0.45], ['n', 'bandpass', 1500, 500, 0.4, 0.4, 0.8, 0, 0.004], ['n', 'highpass', 3000, 2000, 0.5, 0.1, 0.7, 0.1]],
    grip:   [['n', 'bandpass', 900, 1800, 0.5, 0.22, 2, 0, 0.2]],
    draw:   [['n', 'bandpass', 700, 2200, 0.7, 0.25, 1.5, 0, 0.4]],
    sense:  [['n', 'bandpass', 1200, 2400, 1.0, 0.16, 3, 0, 0.4], ['n', 'highpass', 4000, 6000, 0.08, 0.3, 0.7, 0, 0.002]],
  },
  lumen: {
    punch:  [['t', 1568, 1568, 0.3, 0.12], ['t', 2349, 2349, 0.35, 0.07, 'sine', 0.02], ['n', 'highpass', 7000, 5000, 0.08, 0.12, 0.7, 0, 0.002]],
    shove:  [['t', 1047, 1047, 0.5, 0.1], ['t', 1319, 1319, 0.5, 0.08, 'sine', 0.03], ['t', 1568, 1568, 0.5, 0.07, 'sine', 0.06], ['n', 'highpass', 4000, 7000, 0.4, 0.08, 0.7]],
    lift:   [['t', 523, 1047, 0.5, 0.12], ['t', 784, 1568, 0.5, 0.08], ['t', 2093, 2093, 0.5, 0.05, 'sine', 0.4]],
    sweep:  [['t', 2093, 1568, 0.25, 0.1, 'triangle'], ['n', 'highpass', 6000, 3000, 0.2, 0.1, 0.7]],
    slam:   [['t', 262, 262, 1.0, 0.2], ['t', 523, 523, 1.0, 0.14], ['t', 784, 784, 1.0, 0.1], ['t', 1047, 1047, 1.2, 0.08], ['n', 'highpass', 3000, 8000, 0.6, 0.1, 0.7]],
    point:  [['t', 3136, 3136, 0.12, 0.08, 'triangle'], ['t', 2637, 2637, 0.12, 0.07, 'triangle', 0.07], ['t', 3520, 3520, 0.2, 0.06, 'triangle', 0.14]],
    charge: [['t', 392, 784, 0.4, 0.16], ['t', 1175, 1175, 0.6, 0.1, 'sine', 0.3], ['t', 1568, 1568, 0.7, 0.08, 'sine', 0.35], ['n', 'highpass', 5000, 2000, 0.5, 0.12, 0.7, 0.3]],
    grip:   [['t', 392, 784, 0.4, 0.16], ['t', 1175, 1175, 0.6, 0.1, 'sine', 0.3]],
    draw:   [['t', 1319, 1319, 0.8, 0.08], ['t', 1976, 1976, 0.8, 0.05], ['n', 'highpass', 6000, 6000, 0.6, 0.05, 0.7, 0, 0.3]],
    sense:  [['t', 880, 880, 1.2, 0.08], ['t', 1320, 1320, 1.2, 0.05], ['t', 1760, 1760, 1.4, 0.03]],
  },
  gravis: {
    punch:  [['t', 160, 45, 0.5, 0.4], ['t', 320, 90, 0.5, 0.1, 'triangle']],
    shove:  [['t', 50, 190, 0.35, 0.45], ['n', 'lowpass', 300, 900, 0.3, 0.2, 0.7]],
    lift:   [['t', 60, 240, 0.8, 0.35], ['t', 90, 360, 0.8, 0.12, 'triangle']],
    sweep:  [['t', 120, 60, 0.5, 0.4], ['t', 126, 63, 0.5, 0.3], ['n', 'lowpass', 400, 150, 0.5, 0.2]],
    slam:   [['t', 240, 26, 0.7, 0.6], ['n', 'lowpass', 600, 80, 0.7, 0.4, 0.7, 0, 0.004]],
    point:  [['t', 400, 40, 1.0, 0.3], ['t', 404, 42, 1.0, 0.25], ['n', 'bandpass', 1500, 100, 1.0, 0.15, 4]],
    charge: [['t', 300, 30, 0.9, 0.5], ['t', 150, 28, 0.9, 0.3, 'triangle'], ['n', 'lowpass', 800, 60, 0.9, 0.3]],
    grip:   [['t', 80, 120, 0.5, 0.3], ['t', 83, 124, 0.5, 0.2]],
    draw:   [['t', 200, 50, 0.9, 0.35], ['t', 206, 53, 0.9, 0.25]],
    sense:  [['t', 48, 48, 1.3, 0.35], ['t', 50, 50, 1.3, 0.3]],
  },
};
//   Flora creaks and rustles (woody triangles, soft high noise).   Astra falls (bright tones dropping, a boom after).
//   Morph is meat and bone (short square thuds, wet noise).        Umbra breathes (two low sines beating, dark noise).
Object.assign(SFX, {
  flora: {
    punch:  [['t', 900, 500, 0.1, 0.16, 'triangle'], ['n', 'highpass', 4000, 2500, 0.1, 0.14, 0.7, 0, 0.003]],
    shove:  [['t', 140, 220, 0.6, 0.25, 'triangle'], ['t', 147, 231, 0.6, 0.18, 'triangle'], ['n', 'highpass', 2500, 4000, 0.6, 0.14, 0.7, 0, 0.2]],
    lift:   [['t', 180, 520, 0.45, 0.22, 'triangle'], ['n', 'bandpass', 2000, 3500, 0.4, 0.12, 2, 0, 0.1]],
    sweep:  [['n', 'bandpass', 900, 2600, 0.22, 0.2, 2], ['t', 700, 250, 0.1, 0.2, 'triangle', 0.22], ['n', 'highpass', 4500, 5500, 0.05, 0.3, 0.7, 0.22, 0.002]],
    slam:   [['t', 90, 45, 0.7, 0.4], ['t', 160, 300, 0.8, 0.18, 'triangle', 0.1], ['n', 'highpass', 2200, 4500, 0.9, 0.16, 0.7, 0.1, 0.3]],
    point:  [['t', 600, 900, 0.12, 0.16, 'triangle'], ['t', 900, 1350, 0.12, 0.08, 'triangle', 0.06]],
    charge: [['t', 110, 70, 0.6, 0.4, 'triangle'], ['t', 220, 140, 0.6, 0.2, 'square'], ['n', 'lowpass', 700, 250, 0.4, 0.3, 0.7, 0, 0.005]],
    grip:   [['t', 200, 320, 0.4, 0.2, 'triangle'], ['n', 'highpass', 3000, 4000, 0.4, 0.1]],
    draw:   [['t', 250, 380, 0.6, 0.18, 'triangle'], ['n', 'highpass', 2800, 4200, 0.6, 0.12, 0.7, 0, 0.2]],
    sense:  [['t', 82, 82, 1.0, 0.25, 'triangle'], ['n', 'highpass', 3000, 3600, 1.0, 0.06, 0.7, 0, 0.4]],
  },
  astra: {
    punch:  [['t', 2400, 500, 0.45, 0.1, 'triangle'], ['n', 'highpass', 6000, 1500, 0.45, 0.1], ['t', 90, 40, 0.3, 0.3, 'sine', 0.45]],
    shove:  [['n', 'bandpass', 3000, 400, 0.5, 0.3, 0.8, 0, 0.3], ['t', 100, 50, 0.4, 0.3, 'sine', 0.4]],
    lift:   [['t', 392, 784, 0.7, 0.14], ['t', 587, 1175, 0.7, 0.1], ['t', 1568, 1568, 0.5, 0.05, 'sine', 0.5]],
    sweep:  [['t', 660, 990, 0.5, 0.1], ['t', 880, 1320, 0.5, 0.08], ['n', 'highpass', 5000, 8000, 0.5, 0.08, 0.7, 0, 0.2]],
    slam:   [['t', 3000, 300, 0.5, 0.08, 'triangle'], ['t', 2500, 250, 0.5, 0.08, 'triangle', 0.1], ['t', 2000, 200, 0.5, 0.08, 'triangle', 0.2], ['t', 80, 30, 0.8, 0.5, 'sine', 0.5], ['n', 'lowpass', 1500, 200, 0.7, 0.3, 0.7, 0.5]],
    point:  [['t', 1760, 1760, 0.4, 0.1], ['t', 2640, 2640, 0.4, 0.06], ['n', 'highpass', 7000, 4000, 0.3, 0.1]],
    charge: [['t', 2600, 400, 0.4, 0.08, 'triangle'], ['t', 2200, 350, 0.4, 0.08, 'triangle', 0.15], ['t', 2900, 450, 0.4, 0.08, 'triangle', 0.3], ['t', 2400, 380, 0.4, 0.08, 'triangle', 0.45], ['n', 'highpass', 5000, 1500, 0.9, 0.12]],
    grip:   [['t', 2600, 400, 0.4, 0.08, 'triangle'], ['t', 2200, 350, 0.4, 0.08, 'triangle', 0.15]],
    draw:   [['t', 1175, 1175, 0.3, 0.08], ['t', 1568, 1568, 0.3, 0.08, 'sine', 0.12], ['t', 2093, 2093, 0.5, 0.08, 'sine', 0.24]],
    sense:  [['t', 660, 660, 1.3, 0.08], ['t', 990, 990, 1.3, 0.05], ['n', 'highpass', 6000, 7000, 1.2, 0.04, 0.7, 0, 0.5]],
  },
  morph: {
    punch:  [['t', 170, 60, 0.16, 0.5, 'square'], ['n', 'lowpass', 1200, 300, 0.1, 0.4, 0.7, 0, 0.002]],
    shove:  [['t', 220, 330, 0.18, 0.25, 'square'], ['n', 'bandpass', 1800, 900, 0.3, 0.3, 3, 0, 0.004], ['t', 110, 80, 0.4, 0.3, 'triangle', 0.05]],
    lift:   [['n', 'bandpass', 2500, 1200, 0.12, 0.35, 3, 0, 0.002], ['t', 300, 900, 0.14, 0.2, 'square']],
    sweep:  [['n', 'bandpass', 600, 1800, 0.2, 0.25, 1.5], ['t', 200, 70, 0.14, 0.4, 'square', 0.2]],
    slam:   [['t', 100, 30, 0.6, 0.65], ['n', 'lowpass', 900, 150, 0.4, 0.45, 0.7, 0, 0.003]],
    point:  [['t', 3200, 2200, 0.07, 0.14, 'square'], ['n', 'highpass', 6000, 4000, 0.05, 0.2, 0.7, 0, 0.002]],
    charge: [['t', 60, 140, 0.3, 0.4, 'square'], ['t', 200, 40, 0.3, 0.6, 'square', 0.3], ['n', 'lowpass', 1500, 200, 0.3, 0.5, 0.7, 0.3, 0.003]],
    grip:   [['t', 150, 100, 0.2, 0.4, 'square'], ['n', 'bandpass', 900, 500, 0.2, 0.25, 2]],
    draw:   [['n', 'bandpass', 2200, 1100, 0.1, 0.3, 3, 0, 0.002], ['n', 'bandpass', 2000, 1000, 0.1, 0.3, 3, 0.12, 0.002], ['n', 'bandpass', 1800, 900, 0.1, 0.3, 3, 0.24, 0.002], ['t', 90, 60, 0.5, 0.3, 'square']],
    sense:  [['t', 60, 45, 0.18, 0.5], ['t', 60, 45, 0.18, 0.4, 'sine', 0.28], ['t', 60, 45, 0.18, 0.5, 'sine', 0.9], ['t', 60, 45, 0.18, 0.4, 'sine', 1.18]],
  },
  umbra: {
    punch:  [['t', 220, 110, 0.4, 0.25], ['t', 226, 113, 0.4, 0.2], ['n', 'lowpass', 600, 200, 0.4, 0.2]],
    shove:  [['n', 'lowpass', 1200, 150, 0.8, 0.35, 2, 0, 0.3], ['t', 130, 65, 0.8, 0.25], ['t', 134, 67, 0.8, 0.2]],
    lift:   [['t', 300, 40, 0.9, 0.3], ['t', 306, 42, 0.9, 0.25], ['n', 'bandpass', 900, 100, 0.9, 0.15, 4]],
    sweep:  [['n', 'bandpass', 2500, 500, 0.25, 0.25, 3, 0, 0.004], ['t', 400, 150, 0.25, 0.14]],
    slam:   [['t', 98, 49, 1.2, 0.4], ['t', 101, 50, 1.2, 0.35], ['n', 'lowpass', 500, 100, 1.2, 0.3, 0.7, 0, 0.3]],
    point:  [['t', 466, 440, 0.4, 0.14, 'triangle'], ['t', 622, 587, 0.4, 0.1, 'triangle', 0.05]],
    charge: [['t', 150, 37, 1.0, 0.45], ['t', 154, 39, 1.0, 0.4], ['n', 'lowpass', 900, 80, 1.0, 0.3]],
    grip:   [['t', 150, 37, 1.0, 0.45], ['t', 154, 39, 1.0, 0.4]],
    draw:   [['t', 147, 147, 0.9, 0.2], ['t', 150, 150, 0.9, 0.2], ['n', 'lowpass', 400, 300, 0.9, 0.12]],
    sense:  [['t', 73, 73, 1.4, 0.3], ['t', 75, 75, 1.4, 0.28]],
  },
});
//   Necro rattles and moans: hollow triangles a tritone apart, dry clicks.
SFX.necro = {
  punch:  [['n', 'bandpass', 3000, 1800, 0.05, 0.3, 4, 0, 0.002], ['t', 622, 440, 0.12, 0.12, 'triangle']],
  shove:  [['t', 440, 311, 0.9, 0.14, 'sawtooth'], ['t', 622, 440, 0.9, 0.1, 'sawtooth'], ['n', 'bandpass', 900, 500, 0.9, 0.12, 5, 0, 0.3]],
  lift:   [['n', 'bandpass', 2400, 1200, 0.05, 0.3, 4, 0, 0.002], ['n', 'bandpass', 2000, 1000, 0.05, 0.3, 4, 0.08, 0.002], ['n', 'bandpass', 1700, 900, 0.05, 0.3, 4, 0.16, 0.002], ['t', 110, 78, 0.5, 0.25, 'triangle']],
  sweep:  [['n', 'bandpass', 3000, 700, 0.3, 0.22, 3, 0, 0.004], ['t', 311, 220, 0.3, 0.14, 'triangle']],
  slam:   [['t', 78, 55, 1.1, 0.45, 'triangle'], ['t', 110, 78, 1.1, 0.3, 'triangle'], ['n', 'bandpass', 2200, 1100, 0.06, 0.3, 4, 0.3, 0.002], ['n', 'bandpass', 1800, 900, 0.06, 0.3, 4, 0.5, 0.002]],
  point:  [['t', 220, 220, 0.8, 0.14, 'triangle'], ['t', 311, 311, 0.8, 0.12, 'triangle'], ['t', 110, 110, 0.9, 0.2]],
  charge: [['t', 155, 220, 0.6, 0.2, 'sawtooth'], ['t', 220, 311, 0.6, 0.15, 'sawtooth', 0.15], ['t', 311, 440, 0.6, 0.12, 'sawtooth', 0.3], ['n', 'bandpass', 2000, 1000, 0.06, 0.3, 4, 0.6, 0.002]],
  grip:   [['t', 155, 220, 0.6, 0.2, 'sawtooth'], ['t', 220, 311, 0.6, 0.15, 'sawtooth', 0.15]],
  draw:   [['n', 'bandpass', 2400, 1200, 0.05, 0.3, 4, 0, 0.002], ['n', 'bandpass', 2200, 1100, 0.05, 0.3, 4, 0.1, 0.002], ['n', 'bandpass', 2000, 1000, 0.05, 0.3, 4, 0.2, 0.002], ['n', 'bandpass', 1800, 900, 0.05, 0.3, 4, 0.3, 0.002]],
  sense:  [['t', 155, 155, 1.3, 0.14, 'triangle'], ['t', 220, 220, 1.3, 0.1, 'triangle']],
  rise:   [['t', 110, 220, 0.5, 0.2, 'sawtooth'], ['n', 'bandpass', 2000, 1000, 0.06, 0.3, 4, 0.35, 0.002]],
  bite:   [['n', 'bandpass', 2600, 1300, 0.04, 0.3, 4, 0, 0.002], ['t', 180, 120, 0.08, 0.2, 'square']],
};
SFX.summon = [['t', 262, 523, 0.5, 0.14, 'triangle'], ['t', 392, 784, 0.5, 0.1, 'triangle', 0.1], ['n', 'highpass', 3000, 6000, 0.5, 0.08, 0.7, 0.1, 0.2]];
SFX.seal = [['t', 220, 880, 0.5, 0.16, 'triangle'], ['t', 330, 1320, 0.5, 0.1, 'triangle', 0.05], ['n', 'bandpass', 500, 4000, 0.5, 0.2, 2, 0, 0.3], ['t', 110, 55, 0.6, 0.35, 'sine', 0.45]];
SFX.zone = [['t', 82, 41, 1.4, 0.3], ['t', 87, 43, 1.4, 0.28], ['n', 'lowpass', 300, 120, 1.4, 0.2, 1, 0, 0.5]];
SFX.snap = [['n', 'bandpass', 1800, 700, 0.07, 0.45, 3, 0, 0.002], ['t', 240, 120, 0.09, 0.3, 'triangle'], ['n', 'highpass', 4000, 3000, 0.04, 0.2, 0.7, 0.05, 0.002]];
SFX.spit = [['n', 'bandpass', 2600, 1200, 0.09, 0.25, 2, 0, 0.004], ['t', 520, 260, 0.08, 0.12, 'triangle']];
SFX.lance = [['n', 'bandpass', 800, 3200, 0.07, 0.4, 2, 0, 0.003], ['t', 140, 420, 0.07, 0.3, 'square'], ['n', 'lowpass', 900, 250, 0.12, 0.35, 0.7, 0.07, 0.003]];
SFX.blade = [['t', 1976, 2637, 0.25, 0.1, 'triangle'], ['t', 1318, 1318, 0.5, 0.06], ['n', 'highpass', 6000, 9000, 0.2, 0.08]];
export const FAMILIAR_NOTE = { pyro: 740, terra: 150, aero: 1500, lumen: 2093, gravis: 98, astra: 1175, umbra: 196 };
SFX.orbit = [['t', 880, 1320, 0.3, 0.08], ['t', 1320, 1760, 0.3, 0.06, 'sine', 0.1], ['t', 1760, 2640, 0.4, 0.05, 'sine', 0.2]];
SFX.dome = [['t', 262, 523, 0.5, 0.16], ['t', 392, 784, 0.5, 0.12], ['n', 'highpass', 3000, 7000, 0.5, 0.08, 0.7, 0, 0.3], ['t', 131, 131, 1.0, 0.2, 'sine', 0.3]];
SFX.sling = [['t', 70, 260, 0.25, 0.4], ['n', 'bandpass', 400, 2400, 0.25, 0.25, 2, 0, 0.15], ['t', 260, 60, 0.3, 0.35, 'sine', 0.25]];
SFX.crash = [['n', 'lowpass', 1600, 200, 0.25, 0.5, 0.7, 0, 0.003], ['t', 120, 45, 0.3, 0.45]];
SFX.trapSet = [['n', 'bandpass', 1200, 2400, 0.08, 0.2, 4, 0, 0.004], ['t', 196, 294, 0.2, 0.14, 'triangle', 0.06]];
SFX.trapSnap = [['n', 'highpass', 3000, 2000, 0.05, 0.5, 0.7, 0, 0.001], ['n', 'bandpass', 1400, 500, 0.12, 0.45, 3, 0.02, 0.002], ['t', 300, 90, 0.14, 0.35, 'triangle']];
SFX.mark = [['t', 1568, 1568, 0.12, 0.08, 'triangle'], ['t', 2093, 2093, 0.12, 0.08, 'triangle', 0.09], ['t', 2637, 2637, 0.2, 0.08, 'triangle', 0.18]];
SFX.decoy = [['t', 220, 110, 0.5, 0.2], ['t', 226, 113, 0.5, 0.18], ['n', 'lowpass', 500, 150, 0.5, 0.2, 1, 0, 0.2]];
SFX.swap = [['t', 600, 900, 0.07, 0.12, 'triangle']];
SFX.guard = [['t', 300, 600, 0.15, 0.2, 'triangle'], ['n', 'bandpass', 1500, 2500, 0.2, 0.15, 3]];
SFX.guardHit = [['t', 700, 500, 0.1, 0.2, 'triangle'], ['n', 'highpass', 4000, 3000, 0.06, 0.25, 0.7, 0, 0.002]];
SFX.quench = [['n', 'highpass', 2500, 7000, 0.7, 0.25, 0.7, 0, 0.02]];
Object.assign(FORM_SFX_MORE = {}, {
  thorn: [['n', 'highpass', 5000, 3500, 0.06, 0.2, 0.7, 0, 0.002]], spore: [['n', 'highpass', 2000, 3500, 0.5, 0.12, 0.7, 0, 0.1]],
  night: [['t', 196, 98, 0.5, 0.15]], storm: [['n', 'highpass', 5000, 2000, 0.09, 0.3, 0.7, 0, 0.002], ['n', 'lowpass', 400, 100, 0.9, 0.3, 0.7, 0.1]],
  shell: [['t', 400, 600, 0.1, 0.15, 'square']], venom: [['n', 'highpass', 5000, 8000, 0.25, 0.1]],
  fear: [['t', 700, 500, 0.5, 0.08, 'sawtooth'], ['t', 742, 530, 0.5, 0.08, 'sawtooth']], hollow: [['t', 110, 220, 0.5, 0.15]],
});
// What a sub-element adds on top of the move's own sound.
export const FORM_SFX = {
  lightning: [['n', 'highpass', 5000, 2000, 0.09, 0.35, 0.7, 0, 0.002], ['t', 2800, 100, 0.12, 0.14, 'square']],
  blast:     [['t', 120, 40, 0.3, 0.35, 'sine', 0.05], ['n', 'lowpass', 1500, 200, 0.3, 0.3, 0.7, 0.05, 0.004]],
  ice:       [['t', 2800, 3600, 0.25, 0.08, 'triangle'], ['t', 4200, 4200, 0.3, 0.04, 'sine', 0.05], ['n', 'highpass', 7000, 9000, 0.12, 0.08]],
  steam:     [['n', 'highpass', 3000, 6000, 0.6, 0.14, 0.7, 0, 0.1]],
  vacuum:    [['n', 'bandpass', 2400, 250, 0.5, 0.2, 3, 0, 0.3]],
  sound:     [['t', 220, 220, 0.5, 0.2, 'square'], ['t', 223, 223, 0.5, 0.2, 'square']],
  sand:      [['n', 'highpass', 2500, 4500, 0.5, 0.16, 0.7, 0, 0.05]],
  metal:     [['t', 1400, 1390, 0.5, 0.1, 'triangle'], ['t', 2110, 2100, 0.4, 0.06, 'triangle']],
  lava:      [['n', 'lowpass', 300, 150, 0.7, 0.3, 0.7, 0, 0.2], ['t', 70, 50, 0.7, 0.15, 'sawtooth']],
  prism:     [['t', 2637, 2637, 0.2, 0.05, 'triangle', 0.05], ['t', 3520, 3520, 0.25, 0.04, 'triangle', 0.12]],
  shadow:    [['t', 196, 98, 0.6, 0.2], ['t', 199, 100, 0.6, 0.15]],
  float:     [['t', 300, 900, 0.6, 0.08]],
  crush:     [['t', 100, 30, 0.4, 0.4, 'sine', 0.05]],
};
export function moveSound(key, gesture, form) {
  if (!audio) return;
  play((SFX[key] && SFX[key][gesture]) || null);
  if (!SFX[key] || !SFX[key][gesture]) castSound[key]();
  if (form && (FORM_SFX[form] || FORM_SFX_MORE[form])) play(FORM_SFX[form] || FORM_SFX_MORE[form]);
}
export function tone(freqFrom, freqTo, dur, gain, type = 'sine', delay = 0) {
  if (!audio) return;
  const t0 = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqFrom, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(freqTo, 1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master());
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}
export const thump = () => { tone(90, 32, 0.7, 0.6); tone(180, 60, 0.25, 0.2, 'triangle'); };
export const blip = () => tone(1250, 1700, 0.12, 0.08, 'triangle');
export const tick = () => tone(900, 1300, 0.08, 0.1, 'square');
export const thud = () => tone(160, 70, 0.12, 0.18, 'triangle');
export const hitSound = () => { tone(660, 660, 0.18, 0.12, 'triangle'); tone(990, 990, 0.25, 0.12, 'triangle', 0.09); };
export const castSound = {
  pyro: () => tone(520, 110, 0.32, 0.22, 'sawtooth'),
  aqua: () => { tone(300, 720, 0.4, 0.14, 'sine'); tone(450, 1080, 0.4, 0.07, 'sine', 0.05); },
  terra: () => tone(140, 45, 0.5, 0.4, 'square'),
  aero: () => tone(1800, 240, 0.45, 0.07, 'sawtooth'),
  lumen: () => { tone(1400, 2100, 0.25, 0.1, 'sine'); tone(2100, 2800, 0.3, 0.05, 'sine', 0.04); },
  gravis: () => tone(90, 30, 0.7, 0.45, 'sine'),
  flora: () => tone(330, 220, 0.3, 0.2, 'triangle'),
  astra: () => tone(1200, 400, 0.4, 0.12, 'triangle'),
  morph: () => tone(180, 70, 0.2, 0.4, 'square'),
  umbra: () => tone(196, 98, 0.6, 0.25, 'sine'),
  necro: () => tone(311, 155, 0.5, 0.2, 'triangle'),
};

export const getAudio = () => audio;

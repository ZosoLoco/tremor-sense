import * as THREE from 'three';
import { FORM_LOOK } from './data.js?v=17';
import { ST, LATE } from './state.js?v=17';
import { scene } from './renderer.js?v=17';
import { pulseUniforms } from './pulse.js?v=17';

// ---------- visual kit: what each discipline is made of ----------
// Pyro, Aqua and Aero are flowing noise in their own colours. Terra is solid, faceted stone.
// A shared particle pool supplies embers, spray, dust and wind streaks.
const NOISE_GLSL = /* glsl */`
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { return 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.03) + 0.15 * vnoise(p * 4.01); }`;

export const ENERGY = {
  // a: hot core colour, b: body colour, scale: noise frequency per axis, speed: how fast it flows,
  // cut/soft: how much of the surface is filled in (low cut = dense, high cut = wispy)
  pyro: { a: 0xfff0b8, b: 0xff5a0c, c: 0x7a0c02, scale: [9, 7, 9], speed: 2.6, cut: 0.38, soft: 0.26 },
  aqua: { a: 0xe6fbff, b: 0x1487ff, scale: [5, 4, 5],     speed: 1.6, cut: 0.2,  soft: 0.5 },
  aero: { a: 0xffffff, b: 0xbfeeff, scale: [16, 1.6, 16], speed: 4.5, cut: 0.56, soft: 0.16 },
  volt: { a: 0xffffff, b: 0x9fc0ff, c: 0x3a55d6, scale: [14, 14, 14], speed: 7, cut: 0.46, soft: 0.14 },
  lumen:  { a: 0xffffff, b: 0xffe9a0, c: 0xc98a1c, scale: [6, 6, 6], speed: 1.2, cut: 0.2, soft: 0.5 },
  gravis: { a: 0xe9dcff, b: 0x8a4dff, c: 0x1a0540, scale: [7, 7, 7], speed: 3.2, cut: 0.4, soft: 0.3 },
  flora:  { a: 0xe4ffb0, b: 0x4fae2a, c: 0x1d4a12, scale: [8, 3, 8], speed: 1.4, cut: 0.3, soft: 0.3 },
  astra:  { a: 0xffffff, b: 0x8fa8ff, c: 0x1a2a7a, scale: [12, 12, 12], speed: 2.2, cut: 0.42, soft: 0.2 },
  morph:  { a: 0xffe0d8, b: 0xd8485c, c: 0x4a0a18, scale: [6, 6, 6], speed: 2, cut: 0.3, soft: 0.35 },
  umbra:  { a: 0x000000, b: 0x0a0312, c: 0x3a1460, scale: [5, 5, 5], speed: 1.8, cut: 0.3, soft: 0.4 },      // black at the heart, a violet fringe; drawn dark, not glowing
  necro:  { a: 0xeafff4, b: 0x3fd69e, c: 0x06301f, scale: [9, 4, 9], speed: 1.0, cut: 0.36, soft: 0.3 },
};
// flow is the direction the pattern travels, in the mesh's own space. fadeY (0 to 1) thins it out toward the top of the mesh.
// Water: mostly clear. You see it by its edges, its highlights and the light moving inside it, not by a colour.
export function waterMat(o = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: pulseUniforms.uTime,
      uScale: { value: new THREE.Vector3(...(o.scale || [5, 4, 5])) },
      uFlow: { value: new THREE.Vector3(...(o.flow || [0, 1, 0])).multiplyScalar(1.6) },
      uAmp: { value: o.amp ?? 0 }, uBody: { value: o.body ?? 0.14 }, uOpacity: { value: 1 },
    },
    transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      uniform float uTime, uAmp; uniform vec3 uScale, uFlow;
      varying vec3 vObj, vN, vV;
      ${NOISE_GLSL}
      void main() {
        vec3 p = position + normal * (fbm(position * 2.2 + vec3(0.0, uTime * 1.3, uTime * 0.7)) - 0.5) * uAmp * 2.0;   // a slow wobble
        vObj = position;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalMatrix * normal; vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uBody, uOpacity; uniform vec3 uScale, uFlow;
      varying vec3 vObj, vN, vV;
      ${NOISE_GLSL}
      void main() {
        vec3 q = vObj * uScale - uFlow * uTime;
        float f = fbm(q);
        vec3 n = normalize(vN + (vec3(fbm(q + 3.1), fbm(q + 7.7), f) - 0.5) * 0.9);      // the surface is never still
        vec3 v = normalize(vV);
        float ndv = abs(dot(n, v));
        float rim = pow(1.0 - ndv, 2.6);                                                    // edges bend the most light
        vec3 l = normalize(vec3(0.3, 0.9, 0.45));
        float glint = pow(max(dot(reflect(-l, n), v), 0.0), 60.0) + 0.5 * pow(max(dot(reflect(-l, -n), v), 0.0), 40.0);
        float caustic = smoothstep(0.6, 0.78, f) * 0.22;
        vec3 col = mix(vec3(0.70, 0.84, 0.86), vec3(0.96, 0.99, 1.0), clamp(rim + caustic, 0.0, 1.0)) + glint;
        float a = clamp(uBody + 0.7 * rim + caustic * 0.45 + glint, 0.0, 0.95) * uOpacity;
        gl_FragColor = vec4(col, a);
      }`,
  });
  mat.opacity = o.opacity ?? 1;
  mat.onBeforeRender = () => { mat.uniforms.uOpacity.value = mat.opacity; };
  return mat;
}
export function energyMat(key, o = {}) {
  if (key === 'aqua') return waterMat({ flow: o.flow, scale: o.scale, opacity: o.opacity, body: 0.07 });
  const P = ENERGY[key];
  const dark = key === 'umbra';                    // shadow covers what is behind it instead of adding light to it
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: pulseUniforms.uTime,
      uA: { value: new THREE.Color(P.a) }, uB: { value: new THREE.Color(P.b) }, uC: { value: new THREE.Color(P.c ?? P.b) },
      uScale: { value: new THREE.Vector3(...(o.scale || P.scale)) },
      uFlow: { value: new THREE.Vector3(...(o.flow || [0, 1, 0])).multiplyScalar(P.speed) },
      uCut: { value: o.cut ?? P.cut }, uSoft: { value: P.soft },
      uFade: { value: o.fadeY === true ? 1 : (o.fadeY || 0) }, uOpacity: { value: 1 },
    },
    transparent: true, depthWrite: false, depthTest: false, blending: dark ? THREE.NormalBlending : THREE.AdditiveBlending, premultipliedAlpha: dark, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec3 vObj; varying vec2 vUv;
      void main() { vObj = position; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uCut, uSoft, uFade, uOpacity;
      uniform vec3 uA, uB, uC, uScale, uFlow;
      varying vec3 vObj; varying vec2 vUv;
      ${NOISE_GLSL}
      void main() {
        float n = fbm(vObj * uScale - uFlow * uTime);
        float lift = uFade * (0.3 - vUv.y * 0.75);
        float body = smoothstep(uCut, uCut + uSoft, n + lift);
        float core = smoothstep(uCut + uSoft * 0.6, uCut + uSoft * 1.8, n + lift);
        float a = body * uOpacity;
        vec3 col = mix(mix(uC, uB, smoothstep(0.0, 0.6, body)), uA, core);       // thin edges run to the cooler colour
        gl_FragColor = vec4(col * a, a);
      }`,
  });
  mat.opacity = o.opacity ?? 1;
  mat.onBeforeRender = () => { mat.uniforms.uOpacity.value = mat.opacity; };   // lets effects fade it like any other material
  return mat;
}

// Solid rock: opaque, flat shaded from the surface itself, with faint amber seams.
// pal swaps the rock colours for something else (wood, painted metal): { dark, light, seam, amt, grain }
export function stoneMat(metal = false, pal = null) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMetal: { value: metal ? 1 : 0 },
      uDark: { value: new THREE.Color(pal ? pal.dark : 0x332b21) }, uLight: { value: new THREE.Color(pal ? pal.light : 0x8f7a5c) },
      uSeam: { value: new THREE.Color(pal ? pal.seam : 0xe09e29) }, uSeamAmt: { value: pal ? pal.amt : 0.55 }, uHeat: { value: 0 },
      uGrain: { value: new THREE.Vector3(...(pal ? pal.grain : [7, 7, 7])) },
    },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec3 vW; varying vec3 vObj;
      void main() { vObj = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      varying vec3 vW; varying vec3 vObj;
      uniform float uMetal, uSeamAmt, uHeat; uniform vec3 uDark, uLight, uSeam, uGrain;
      ${NOISE_GLSL}
      void main() {
        vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
        if (dot(n, cameraPosition - vW) < 0.0) n = -n;
        float light = 0.32 + 0.68 * max(dot(n, normalize(vec3(0.35, 1.0, 0.45))), 0.0);
        float grain = fbm(vObj * uGrain);
        vec3 g22 = vec3(0.4545);                       // uniforms arrive in linear light; this shader writes display values
        vec3 rock = mix(pow(uDark, g22), pow(uLight, g22), grain) * light;
        float seam = 1.0 - smoothstep(0.0, 0.035, abs(vnoise(vObj * 5.0) - 0.5));
        vec3 L = normalize(vec3(0.35, 1.0, 0.45)), V = normalize(cameraPosition - vW);
        float spec = pow(max(dot(reflect(-L, n), V), 0.0), 18.0) + 0.35 * pow(1.0 - max(dot(n, V), 0.0), 3.0);
        vec3 steel = vec3(0.42, 0.45, 0.5) * (0.35 + 0.65 * light) * (0.85 + 0.3 * grain) + vec3(0.95, 0.97, 1.0) * spec;
        vec3 cold = mix(mix(rock, pow(uSeam, g22), seam * uSeamAmt), steel, uMetal);
        // Heated: the cracks go first, then the whole face starts to glow. Lava is rock with this turned all the way up.
        float crack = 1.0 - smoothstep(0.0, 0.22, abs(vnoise(vObj * 4.0 + 9.0) - 0.5));
        vec3 glow = mix(vec3(0.95, 0.18, 0.02), vec3(1.0, 0.82, 0.3), crack) * (0.25 + 0.75 * crack);
        gl_FragColor = vec4(mix(cold, cold * 0.35 + glow, uHeat), 1.0);
      }`,
  });
}
// The material for anything Terra raises, in the form it was cast in.
// Ice: water that has stopped moving. Cloudy, hard edged, still lets light through.
export function iceMat() { return waterMat({ flow: [0, 0, 0], scale: [10, 10, 10], amp: 0, body: 0.42 }); }
export function earthMat(form) {
  const look = FORM_LOOK[form || 'rock'];
  const mat = stoneMat(!!look.metal, look.pal || null);
  if (look.heat) mat.uniforms.uHeat.value = look.heat;
  return mat;
}
// Knock a smooth primitive into a craggy one. Vertices that share a position move together, so it stays sealed.
export function craggy(geo, amount) {
  const p = geo.attributes.position;
  const r = (x, y, z, k) => { const s = Math.sin(Math.round(x * 60) * 12.9898 * k + Math.round(y * 60) * 78.233 + Math.round(z * 60) * 37.719) * 43758.5453; return s - Math.floor(s) - 0.5; };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setXYZ(i, x + r(x, y, z, 1) * amount, y + r(x, y, z, 2.3) * amount * 0.6, z + r(x, y, z, 3.7) * amount);
  }
  p.needsUpdate = true;
  return geo;
}

// --- particles ---
// additive: glowing motes that add light. Otherwise: soft opaque puffs that sit in the air like smoke.
function makePool(P_MAX, additive) {
  const pos = new Float32Array(P_MAX * 3), vel = new Float32Array(P_MAX * 3), col = new Float32Array(P_MAX * 3);
  const size = new Float32Array(P_MAX), alpha = new Float32Array(P_MAX);
  const life = new Float32Array(P_MAX), span = new Float32Array(P_MAX), grav = new Float32Array(P_MAX), drag = new Float32Array(P_MAX);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uHalfH: { value: 400 } },
    transparent: true, depthWrite: false, depthTest: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: /* glsl */`
      attribute float aSize; attribute float aAlpha; attribute vec3 color;
      uniform float uHalfH; varying vec3 vCol; varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aAlpha > 0.0 ? aSize * projectionMatrix[1][1] * uHalfH / max(-mv.z, 0.05) : 0.0;
        vCol = color; vA = aAlpha;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = pow(smoothstep(0.5, 0.0, d), 1.6) * vA;
        gl_FragColor = ${additive ? 'vec4(vCol * a, a)' : 'vec4(vCol, a * 0.42)'};
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = additive ? 18 : 13;
  scene.add(points);
  let cursor = 0, liveCount = 0;
  return {
    material: mat,
    get live() { return liveCount; },
    // size in metres, life in seconds, gravity in m/s² (positive falls), drag per second
    emit(p, v, color, s, l, g = 0, d = 0) {
      const i = cursor; cursor = (cursor + 1) % P_MAX;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      vel[i * 3] = v.x; vel[i * 3 + 1] = v.y; vel[i * 3 + 2] = v.z;
      col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b;
      size[i] = s; life[i] = l; span[i] = l; grav[i] = g; drag[i] = d;
    },
    update(dt) {
      liveCount = 0;
      for (let i = 0; i < P_MAX; i++) {
        if (life[i] <= 0) { alpha[i] = 0; continue; }
        life[i] -= dt;
        const k = Math.max(1 - drag[i] * dt, 0);
        vel[i * 3] *= k; vel[i * 3 + 1] = vel[i * 3 + 1] * k - grav[i] * dt; vel[i * 3 + 2] *= k;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const f = Math.max(life[i] / span[i], 0);
        alpha[i] = additive ? Math.min(f * 2.2, 1) : Math.min(f * 2.2, (1 - f) * 6, 1);   // glow holds then fades; smoke also swells in
        if (!additive) size[i] += dt * 0.12;        // and spreads as it hangs
        liveCount++;
      }
      for (const name of ['position', 'color', 'aSize', 'aAlpha']) geo.attributes[name].needsUpdate = true;
    },
  };
}
export const particles = makePool(2000, true);
export const smoke = makePool(600, false);
export const SMOKE = new THREE.Color(0x26221f), STEAM = new THREE.Color(0xe6ecee), DUST = new THREE.Color(0x9c8763), SAND = new THREE.Color(0xc9ad74);
export const _fv = new THREE.Vector3(), _fp = new THREE.Vector3();
// How much loose matter to draw: 1 is everything. Drops when frames run long, climbs back when they do not.
ST.detail = 1; let frameAvg = 0.012, detailCheck = 0;
export function tuneDetail(t, dt) {
  frameAvg += (dt - frameAvg) * 0.05;
  if (t - detailCheck < 1) return;
  detailCheck = t;
  if (frameAvg > 0.0165) ST.detail = Math.max(0.35, ST.detail - 0.15);
  else if (frameAvg < 0.0145) ST.detail = Math.min(1, ST.detail + 0.05);
}
export const thinned = (n) => { const k = n * ST.detail; return Math.floor(k) + (Math.random() < k % 1 ? 1 : 0); };
// Soft puffs: smoke off a fire, dust off broken stone, steam, sand.
export function fume(color, point, n, o = {}) {
  n = thinned(n);
  for (let i = 0; i < n; i++) {
    _fv.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(o.speed ?? 0.5);
    _fv.y += o.rise ?? 0.4;
    const j = o.jitter ?? 0.15;
    _fp.set(point.x + (Math.random() - 0.5) * j, point.y + (Math.random() - 0.5) * j, point.z + (Math.random() - 0.5) * j);
    smoke.emit(_fp, _fv, color, (o.size ?? 0.22) * (0.7 + Math.random() * 0.6), (o.life ?? 1.4) * (0.7 + Math.random() * 0.6), o.grav ?? 0, o.drag ?? 1.2);
  }
}

export const PCOL = {
  pyro: [0xffe08a, 0xff8a1f, 0xff3b0a].map(c => new THREE.Color(c)),
  aqua: [0xf4fcff, 0xcfe7ec, 0x9cc6cf].map(c => new THREE.Color(c)),      // clear water catches light; it is not blue paint
  terra: [0xcdb78c, 0x8a7655, 0xe0b64a].map(c => new THREE.Color(c)),
  aero: [0xffffff, 0xdff9ff, 0xbfeeff].map(c => new THREE.Color(c)),
  lumen: [0xffffff, 0xfff1b0, 0xffd76a].map(c => new THREE.Color(c)),
  gravis: [0xe9dcff, 0xb48cff, 0x6a2cff].map(c => new THREE.Color(c)),
  flora: [0xe4ffb0, 0x7fd65a, 0x3d8a22].map(c => new THREE.Color(c)),
  astra: [0xffffff, 0xc9d6ff, 0x7f9cff].map(c => new THREE.Color(c)),
  morph: [0xffd0c8, 0xff7a8a, 0xb02a44].map(c => new THREE.Color(c)),
  umbra: [0xd9a8ff, 0x9a3cff, 0x4a0a8a].map(c => new THREE.Color(c)),
  necro: [0xeafff4, 0x6cf0c2, 0x1f8a60].map(c => new THREE.Color(c)),
};
// How each discipline's loose matter behaves once it is in the air.
PCOL.volt = [0xffffff, 0xcfe0ff, 0x7f9cff].map(c => new THREE.Color(c));
const PSTYLE = {
  volt:  { size: 0.022, life: 0.22, grav: 0,    drag: 2 },     // sparks
  pyro:  { size: 0.035, life: 0.5,  grav: -1.6, drag: 1.5 },   // embers rise
  aqua:  { size: 0.028, life: 0.6,  grav: 6,    drag: 0.4 },   // droplets fall
  terra: { size: 0.04,  life: 0.7,  grav: 7,    drag: 0.8 },   // chips drop fast
  aero:  { size: 0.018, life: 0.28, grav: 0,    drag: 3 },     // streaks vanish
  lumen: { size: 0.02,  life: 0.4,  grav: 0,    drag: 2.5 },   // motes hang
  gravis: { size: 0.026, life: 0.6, grav: 9,    drag: 0.2 },   // everything falls hard
  flora: { size: 0.03,  life: 0.9,  grav: 1.5,  drag: 2 },     // leaves drift down
  astra: { size: 0.02,  life: 0.5,  grav: 3,    drag: 0.5 },   // sparks fall
  morph: { size: 0.03,  life: 0.35, grav: 5,    drag: 1 },
  umbra: { size: 0.034, life: 0.7,  grav: -0.6, drag: 2 },     // smoke lifts
  necro: { size: 0.026, life: 0.9,  grav: -0.3, drag: 3 },     // wisps hang and rise
};
const _pv = new THREE.Vector3(), _pp = new THREE.Vector3();
// n particles from a point. dir + spread aims them; without dir they go every way.
const SHADOW = new THREE.Color(0x040108);
export function puff(key, point, n, speed, o = {}) {
  if (key === 'umbra') { fume(SHADOW, point, Math.max(1, Math.round(thinned(n) / 3)), { size: 0.1 + speed * 0.02, life: 0.8, jitter: 0.06 + speed * 0.03, rise: 0.12 }); return; }
  const S = PSTYLE[key], C = PCOL[key];
  n = thinned(n);
  for (let i = 0; i < n; i++) {
    _pv.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    if (o.dir) _pv.multiplyScalar(o.spread ?? 0.5).add(o.dir).normalize();
    _pv.multiplyScalar(speed * (0.35 + Math.random() * 0.65));
    if (o.up) _pv.y = Math.abs(_pv.y) + o.up * Math.random();
    _pp.copy(point);
    if (o.jitter) _pp.x += (Math.random() - 0.5) * o.jitter, _pp.y += (Math.random() - 0.5) * o.jitter, _pp.z += (Math.random() - 0.5) * o.jitter;
    particles.emit(_pp, _pv, C[(Math.random() * C.length) | 0], (o.size || S.size) * (0.6 + Math.random() * 0.8),
      (o.life || S.life) * (0.6 + Math.random() * 0.8), o.grav ?? S.grav, o.drag ?? S.drag);
  }
}

// Reached from modules that load before this one.
Object.assign(LATE, { particles, puff });

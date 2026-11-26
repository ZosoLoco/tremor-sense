import * as THREE from 'three';
import { ST, LATE } from './state.js?v=16';

// ---------- renderer ----------
export const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.prepend(renderer.domElement);

export const scene = new THREE.Scene();
export const PREVIEW_BG = new THREE.Color(0x050705);
scene.background = PREVIEW_BG;
export const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 50);
camera.position.set(0.4, 1.55, 2.9);
camera.lookAt(0, 0.9, 0);

window.addEventListener('resize', () => {
  if (renderer.xr.isPresenting) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

export const UP = new THREE.Vector3(0, 1, 0);
export const ZERO = new THREE.Vector3();
export const now = () => LATE.pulseUniforms.uTime.value;


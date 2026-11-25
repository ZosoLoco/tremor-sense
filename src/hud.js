import * as THREE from 'three';
import { ELEMENTS, FORMS } from './data.js?v=14';
import { S, L } from './state.js?v=14';
import { statusEl, formOf } from './core.js?v=14';
import { renderer, scene } from './renderer.js?v=14';
import { MAX_HP } from './creatures.js?v=14';

// ---------- wrist HUD ----------
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 512; hudCanvas.height = 192;
const hudTex = new THREE.CanvasTexture(hudCanvas);
hudTex.colorSpace = THREE.SRGBColorSpace;
export const hud = new THREE.Mesh(
  new THREE.PlaneGeometry(0.16, 0.06),
  new THREE.MeshBasicMaterial({ map: hudTex, transparent: true, depthTest: false, depthWrite: false }),
);
hud.renderOrder = 20;
hud.visible = false;
scene.add(hud);

export function drawHud() {
  const accent = `#${ELEMENTS[S.selected].color.getHexString()}`;
  const c = hudCanvas.getContext('2d');
  c.clearRect(0, 0, 512, 192);
  c.fillStyle = 'rgba(5,7,5,0.82)';
  c.strokeStyle = accent;
  c.lineWidth = 4;
  c.beginPath(); c.roundRect(4, 4, 504, 184, 36); c.fill(); c.stroke();
  c.textBaseline = 'middle';
  c.fillStyle = accent;
  c.font = '600 58px ui-monospace, Menlo, Consolas, monospace';
  c.fillText(ELEMENTS[S.selected].label, 34, 68);
  if (formOf(S.selected) !== FORMS[S.selected][0]) {      // which sub-element
    const w = c.measureText(ELEMENTS[S.selected].label).width;
    c.font = '30px ui-monospace, Menlo, Consolas, monospace';
    c.fillText(formOf(S.selected), 46 + w, 74);
    c.font = '600 58px ui-monospace, Menlo, Consolas, monospace';
  }
  c.fillStyle = '#b6ff3c';
  c.textAlign = 'right';
  c.font = '600 40px ui-monospace, Menlo, Consolas, monospace';
  c.fillText(`w${S.wave} ${S.downCount}/${S.activeCount}`, 478, 66);
  for (let i = 0; i < MAX_HP; i++) {                // health pips
    c.beginPath(); c.arc(470 - i * 24, 138, 8, 0, Math.PI * 2);
    c.fillStyle = i < S.playerHP ? '#ff4d6a' : 'rgba(255,77,106,0.18)';
    c.fill();
  }
  c.textAlign = 'left';
  c.fillStyle = '#cfd6d2';
  c.font = '30px ui-monospace, Menlo, Consolas, monospace';
  c.fillText(S.hudNote, 36, 138);
  hudTex.needsUpdate = true;
  if (!renderer.xr.isPresenting) {
    statusEl.textContent = `Wave ${S.wave} · ${S.downCount}/${S.activeCount} down · health ${S.playerHP}/${MAX_HP}` + (S.xrSupported ? '' : ' · preview mode');
  }
}

// Reached from modules that load before this one.
Object.assign(L, { drawHud });

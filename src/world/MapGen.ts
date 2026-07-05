import Phaser from 'phaser';
import { WORLD } from '../config';

// 값 노이즈 근사 (시드 기반 격자 보간)
function makeNoise(seed: number) {
  const rand = (x: number, y: number) => {
    let n = x * 374761393 + y * 668265263 + seed * 1442695040;
    n = (n ^ (n >> 13)) * 1274126177;
    n = n ^ (n >> 16);
    return (n >>> 0) / 4294967295;
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (fx: number, fy: number) => {
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = smooth(fx - x0);
    const ty = smooth(fy - y0);
    const a = rand(x0, y0);
    const b = rand(x0 + 1, y0);
    const c = rand(x0, y0 + 1);
    const d = rand(x0 + 1, y0 + 1);
    const top = a + (b - a) * tx;
    const bot = c + (d - c) * tx;
    return top + (bot - top) * ty;
  };
}

export interface Decoration {
  x: number;
  y: number;
  type: 'tree' | 'rock';
}

// 대륙 느낌의 배경 텍스처를 절차 생성하고, 데코 좌표 목록을 반환
// landmarks: 반드시 육지여야 하는 지점(거점) — 주변에 초원 패치를 찍는다
export function genWorldBackground(
  scene: Phaser.Scene,
  landmarks: { x: number; y: number }[] = []
): Decoration[] {
  const key = 'worldbg';
  const tile = 32;
  const cols = Math.ceil(WORLD.width / tile);
  const rows = Math.ceil(WORLD.height / tile);

  const canvas = document.createElement('canvas');
  canvas.width = WORLD.width;
  canvas.height = WORLD.height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const elevN = makeNoise(1337);
  const moistN = makeNoise(9001);

  // 색 팔레트
  const water = ['#2a5a8a', '#3568a0'];
  const sand = ['#c8b878', '#d0c088'];
  const grass = ['#3a7a3a', '#347034', '#428442', '#2f6a2f'];
  const forest = ['#25601f', '#2a6a24'];
  const mountain = ['#7a7368', '#8a8378', '#6a6358'];
  const snow = ['#d8d8d0', '#e8e8e0'];

  const pick = (arr: string[], r: number) => arr[Math.floor(r * arr.length) % arr.length];

  const decos: Decoration[] = [];

  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const nx = tx / 12;
      const ny = ty / 12;
      let e = elevN(nx, ny);
      const m = moistN(nx + 50, ny + 50);

      // 가장자리는 바다로 (해안 느낌)
      const edgeX = Math.min(tx, cols - tx) / cols;
      const edgeY = Math.min(ty, rows - ty) / rows;
      const edge = Math.min(edgeX, edgeY);
      if (edge < 0.06) e -= 0.5;
      else if (edge < 0.11) e -= 0.25;

      const r = (elevN(nx * 3.3, ny * 3.3) + m) * 0.5;
      let color: string;
      if (e < 0.28) color = pick(water, r);
      else if (e < 0.34) color = pick(sand, r);
      else if (e > 0.72) color = pick(snow, r);
      else if (e > 0.6) color = pick(mountain, r);
      else if (m > 0.6 && e < 0.6) color = pick(forest, r);
      else color = pick(grass, r);

      ctx.fillStyle = color;
      ctx.fillRect(tx * tile, ty * tile, tile, tile);

      // 데코 산포 (숲/초원에만)
      if (e >= 0.36 && e <= 0.6) {
        const dr = elevN(nx * 7.7 + 3, ny * 7.7 + 3);
        if (m > 0.55 && dr > 0.82) {
          decos.push({ x: tx * tile + tile / 2, y: ty * tile + tile / 2, type: 'tree' });
        } else if (dr > 0.94) {
          decos.push({ x: tx * tile + tile / 2, y: ty * tile + tile / 2, type: 'rock' });
        }
      } else if (e > 0.6 && e <= 0.72) {
        const dr = elevN(nx * 9.1 + 7, ny * 9.1 + 7);
        if (dr > 0.9) {
          decos.push({ x: tx * tile + tile / 2, y: ty * tile + tile / 2, type: 'rock' });
        }
      }
    }
  }

  // 거점 주변을 초원으로 스탬프 (성채가 바다에 뜨지 않게)
  for (const lm of landmarks) {
    const R = 220;
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) {
        const px = tx * tile + tile / 2;
        const py = ty * tile + tile / 2;
        const d = Math.hypot(px - lm.x, py - lm.y);
        if (d > R) continue;
        // 중심부는 확실한 초원, 가장자리는 페더링(노이즈로 자연스럽게)
        const t = d / R;
        const nz = elevN((tx / 12) * 3.3, (ty / 12) * 3.3);
        if (t < 0.7 || nz > t) {
          ctx.fillStyle = pick(grass, (nz + 0.3) % 1);
          ctx.fillRect(tx * tile, ty * tile, tile, tile);
        }
      }
    }
    // 거점 자리를 가리던 데코 제거
    for (let i = decos.length - 1; i >= 0; i--) {
      if (Math.hypot(decos[i].x - lm.x, decos[i].y - lm.y) < 90) decos.splice(i, 1);
    }
  }

  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
  return decos;
}

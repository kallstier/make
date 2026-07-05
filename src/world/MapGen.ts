import Phaser from 'phaser';
import { WORLD } from '../config';

// 값 노이즈 (시드 기반 격자 보간) — 타일 색 변화용
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
  type: 'tree' | 'rock' | 'bush';
}

// 숲 덩어리 정의 (손 설계)
const FORESTS = [
  { x: 260, y: 240, r: 150, n: 12 },
  { x: 1340, y: 260, r: 150, n: 12 },
  { x: 800, y: 1020, r: 190, n: 16 }
];

// 손으로 설계한 평원 전장 배경을 절차 생성하고, 데코 좌표 목록을 반환
export function genBattlefield(scene: Phaser.Scene): Decoration[] {
  const key = 'battlefield';
  const tile = 16;
  const cols = Math.ceil(WORLD.width / tile);
  const rows = Math.ceil(WORLD.height / tile);

  const canvas = document.createElement('canvas');
  canvas.width = WORLD.width;
  canvas.height = WORLD.height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const grassN = makeNoise(4021);
  const detailN = makeNoise(881);

  const grass = ['#3f7f38', '#4a8a40', '#3a7433', '#548f48', '#437d3b'];
  const grassDark = '#2f6a2c';
  const road = ['#9c7a4a', '#a88452', '#8f6f42'];

  // 1) 초원 베이스 (타일 노이즈 색변화)
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const n = grassN(tx / 6, ty / 6);
      const d = detailN(tx / 2.2, ty / 2.2);
      let idx = Math.floor((n * 0.7 + d * 0.3) * grass.length) % grass.length;
      let color = grass[idx];
      // 점점이 짙은 풀 얼룩
      if (d > 0.86) color = grassDark;
      ctx.fillStyle = color;
      ctx.fillRect(tx * tile, ty * tile, tile, tile);
    }
  }

  // 2) 부드러운 언덕 명암 (라디얼 그라디언트 2개)
  const hills: [number, number, number, string][] = [
    [1050, 780, 420, 'rgba(255,255,220,0.10)'], // 밝은 둔덕
    [520, 900, 380, 'rgba(0,0,0,0.10)'], // 그늘진 저지
    [900, 300, 340, 'rgba(255,255,210,0.08)']
  ];
  for (const [hx, hy, hr, col] of hills) {
    const grad = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
    grad.addColorStop(0, col);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  }

  // 3) 가로지르는 흙길 (약간의 굴곡)
  for (let x = 0; x < WORLD.width; x += tile) {
    const cy = WORLD.height * 0.5 + Math.sin(x / 220) * 70 + Math.sin(x / 90) * 20;
    const halfW = 34 + Math.sin(x / 140) * 8;
    for (let y = cy - halfW; y < cy + halfW; y += tile) {
      const r = detailN(x / 30, y / 30);
      ctx.fillStyle = road[Math.floor(r * road.length) % road.length];
      ctx.fillRect(x, Math.floor(y / tile) * tile, tile, tile);
    }
    // 길가 자국
    ctx.fillStyle = 'rgba(60,40,20,0.25)';
    ctx.fillRect(x, Math.floor((cy - halfW) / tile) * tile, tile, tile);
    ctx.fillRect(x, Math.floor((cy + halfW) / tile) * tile, tile, tile);
  }

  // 4) 숲 덩어리 바닥(짙은 초원 패치)
  for (const f of FORESTS) {
    for (let a = 0; a < 360; a += 6) {
      const rr = f.r * (0.6 + detailN(a / 30 + f.x, f.y) * 0.5);
      const px = f.x + Math.cos((a * Math.PI) / 180) * rr;
      const py = f.y + Math.sin((a * Math.PI) / 180) * rr * 0.7;
      ctx.fillStyle = 'rgba(30,70,28,0.5)';
      ctx.beginPath();
      ctx.ellipse(px, py, 40, 28, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);

  // ---- 데코 배치 ----
  const decos: Decoration[] = [];
  const rand = () => Math.random();
  // 숲: 나무 밀집 + 덤불
  for (const f of FORESTS) {
    for (let i = 0; i < f.n; i++) {
      const a = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand()) * f.r;
      decos.push({ x: f.x + Math.cos(a) * rr, y: f.y + Math.sin(a) * rr * 0.7, type: 'tree' });
    }
    for (let i = 0; i < 4; i++) {
      const a = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand()) * f.r;
      decos.push({ x: f.x + Math.cos(a) * rr, y: f.y + Math.sin(a) * rr * 0.7 + 14, type: 'bush' });
    }
  }
  // 흩어진 바위 & 덤불 (전장 가장자리 위주, 중앙 충돌 지대는 비움)
  const scatter: Decoration['type'][] = ['rock', 'bush', 'rock'];
  for (let i = 0; i < 26; i++) {
    const x = 120 + rand() * (WORLD.width - 240);
    const y = 120 + rand() * (WORLD.height - 240);
    // 중앙 교전 회랑(가로 세로 중앙 대역)은 데코 제외
    if (x > 560 && x < 1040 && y > 380 && y < 820) continue;
    decos.push({ x, y, type: scatter[i % scatter.length] });
  }

  return decos;
}

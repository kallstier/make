// ============================================================
// 절차 생성 스프라이트: Canvas에 픽셀 단위로 그려 Phaser 텍스처로 등록
// 외부 이미지/오디오 에셋 금지 — 전부 코드로 생성
// ============================================================
import Phaser from 'phaser';

export type WeaponType = 'sword' | 'bow' | 'club';

export interface UnitPalette {
  body: number;
  bodyDark: number;
  skin: number;
  weapon: number;
}

function hex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

// 픽셀 그리드를 실제 캔버스에 확대해서 그리는 헬퍼
class PixelCanvas {
  ctx: CanvasRenderingContext2D;
  scale: number;
  canvas: HTMLCanvasElement;

  constructor(w: number, h: number, scale: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w * scale;
    this.canvas.height = h * scale;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.scale = scale;
  }

  px(x: number, y: number, color: string) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x * this.scale, y * this.scale, this.scale, this.scale);
  }

  rect(x: number, y: number, w: number, h: number, color: string) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x * this.scale, y * this.scale, w * this.scale, h * this.scale);
  }
}

// 유닛 한 프레임을 그린다. gridSize x gridSize 픽셀 논리 해상도.
function drawUnitFrame(
  pc: PixelCanvas,
  grid: number,
  pal: UnitPalette,
  weapon: WeaponType,
  legPhase: number // 0 or 1
) {
  const cx = Math.floor(grid / 2);
  const skin = hex(pal.skin);
  const body = hex(pal.body);
  const dark = hex(pal.bodyDark);
  const wpn = hex(pal.weapon);
  const outline = 'rgba(0,0,0,0.55)';

  // 크기 비율 (grid 기준). 치비: 큰 머리 + 작은 몸.
  const headR = Math.max(2, Math.round(grid * 0.20));
  const headCY = Math.round(grid * 0.32);
  const bodyTop = headCY + headR;
  const bodyBot = Math.round(grid * 0.82);
  const bodyW = Math.max(3, Math.round(grid * 0.30));

  // 그림자
  pc.ctx.fillStyle = 'rgba(0,0,0,0.22)';
  pc.ctx.beginPath();
  pc.ctx.ellipse(
    cx * pc.scale,
    (grid - 1) * pc.scale,
    bodyW * pc.scale,
    Math.max(1, grid * 0.09) * pc.scale,
    0,
    0,
    Math.PI * 2
  );
  pc.ctx.fill();

  // 머리 (외곽 + 채움)
  for (let y = headCY - headR; y <= headCY + headR; y++) {
    for (let x = cx - headR; x <= cx + headR; x++) {
      const dx = x - cx;
      const dy = y - headCY;
      if (dx * dx + dy * dy <= headR * headR) {
        pc.px(x, y, skin);
      }
    }
  }
  // 눈 2픽셀
  pc.px(cx - Math.max(1, Math.round(headR * 0.4)), headCY, '#222');
  pc.px(cx + Math.max(1, Math.round(headR * 0.4)) - 1, headCY, '#222');

  // 몸통
  pc.rect(cx - Math.floor(bodyW / 2), bodyTop, bodyW, bodyBot - bodyTop, body);
  // 몸통 음영 (오른쪽)
  pc.rect(cx + Math.floor(bodyW / 2) - 1, bodyTop, 1, bodyBot - bodyTop, dark);

  // 다리 2개 (걷기 프레임: 위치 변경)
  const legY = bodyBot;
  const legLen = Math.max(1, Math.round(grid * 0.14));
  const legOffset = legPhase === 0 ? 0 : 1;
  pc.rect(cx - Math.floor(bodyW / 2), legY - legOffset, 1, legLen, dark);
  pc.rect(cx + Math.floor(bodyW / 2) - 1, legY + legOffset, 1, legLen, dark);

  // 무기 (오른손, 몸 오른쪽)
  const armY = bodyTop + Math.round((bodyBot - bodyTop) * 0.25);
  const wx = cx + Math.floor(bodyW / 2);
  if (weapon === 'sword') {
    // 세로 검
    const bladeLen = Math.round(grid * 0.34);
    pc.rect(wx + 1, armY - bladeLen + 2, 1, bladeLen, wpn);
    pc.px(wx + 1, armY + 1, '#8a6a2a'); // 손잡이
    pc.px(wx, armY, '#8a6a2a');
  } else if (weapon === 'bow') {
    // 활 (곡선 근사)
    const bx = wx + 1;
    for (let k = -2; k <= 2; k++) {
      const yy = armY + k;
      const off = 2 - Math.abs(k);
      pc.px(bx + off, yy, hex(0x9a6b2a));
    }
    // 시위
    pc.rect(bx, armY - 2, 1, 5, '#eee');
  } else {
    // club / 몽둥이
    const clubLen = Math.round(grid * 0.26);
    pc.rect(wx + 1, armY - clubLen + 2, 2, clubLen, hex(0x7a5a2a));
    pc.rect(wx, armY - clubLen + 1, 3, 2, dark);
  }

  // 팔 (몸 색)
  pc.px(wx, armY, skin);
}

export interface GenUnitOptions {
  key: string;
  grid: number; // 논리 픽셀 크기 (예: 16, 20, 24, 32)
  scale: number; // 확대 배율 (텍스처 실제 픽셀 = grid*scale)
  pal: UnitPalette;
  weapon: WeaponType;
}

// 걷기 2프레임 스프라이트시트 생성 -> 텍스처 키 등록 (frame 0,1)
export function genUnit(scene: Phaser.Scene, opts: GenUnitOptions) {
  if (scene.textures.exists(opts.key)) return;
  const { grid, scale } = opts;
  // 두 프레임을 가로로 배치
  const sheet = document.createElement('canvas');
  sheet.width = grid * scale * 2;
  sheet.height = grid * scale;
  const sctx = sheet.getContext('2d')!;
  sctx.imageSmoothingEnabled = false;

  const fw = grid * scale;
  const fh = grid * scale;
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(grid, grid, scale);
    drawUnitFrame(pc, grid, opts.pal, opts.weapon, f);
    sctx.drawImage(pc.canvas, f * fw, 0);
  }

  // 캔버스를 텍스처로 등록하고 두 프레임을 수동으로 추가
  const tex = scene.textures.addCanvas(opts.key, sheet)!;
  tex.add(0, 0, 0, 0, fw, fh);
  tex.add(1, 0, fw, 0, fw, fh);
}

// ============================================================
// 성채 스프라이트
// ============================================================
export function genCastle(scene: Phaser.Scene, key: string, flagColor: number) {
  if (scene.textures.exists(key)) return;
  const grid = 48;
  const scale = 2;
  const pc = new PixelCanvas(grid, grid, scale);
  const stone = hex(0x8f8f9a);
  const stoneDark = hex(0x5f5f6a);
  const stoneLight = hex(0xb0b0ba);

  // 본체
  pc.rect(8, 18, 32, 26, stone);
  pc.rect(8, 18, 32, 2, stoneLight);
  pc.rect(38, 18, 2, 26, stoneDark);
  // 성문
  pc.rect(20, 32, 8, 12, hex(0x3a2a1a));
  pc.rect(21, 30, 6, 3, stoneDark);
  // 흉벽 (톱니)
  for (let i = 0; i < 8; i++) {
    pc.rect(8 + i * 4, 14, 2, 4, stone);
  }
  // 양쪽 탑
  pc.rect(4, 12, 8, 32, stone);
  pc.rect(36, 12, 8, 32, stone);
  pc.rect(4, 12, 8, 2, stoneLight);
  pc.rect(36, 12, 8, 2, stoneLight);
  for (let i = 0; i < 2; i++) {
    pc.rect(4 + i * 4, 9, 2, 3, stone);
    pc.rect(36 + i * 4, 9, 2, 3, stone);
  }
  // 창문
  pc.rect(6, 20, 3, 3, hex(0x2a2a1a));
  pc.rect(39, 20, 3, 3, hex(0x2a2a1a));

  scene.textures.addCanvas(key, pc.canvas);
}

// ============================================================
// 깃발
// ============================================================
export function genFlag(scene: Phaser.Scene, key: string, color: number) {
  if (scene.textures.exists(key)) return;
  const grid = 16;
  const scale = 2;
  const pc = new PixelCanvas(grid, grid, scale);
  // 깃대
  pc.rect(3, 1, 1, 15, hex(0x6a4a2a));
  // 천
  pc.ctx.fillStyle = hex(color);
  for (let y = 2; y <= 8; y++) {
    const w = 9 - Math.abs(5 - y);
    pc.rect(4, y, w, 1, hex(color));
  }
  scene.textures.addCanvas(key, pc.canvas);
}

// ============================================================
// 데코: 나무, 바위
// ============================================================
export function genTree(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const grid = 20;
  const scale = 2;
  const pc = new PixelCanvas(grid, grid, scale);
  // 그림자
  pc.ctx.fillStyle = 'rgba(0,0,0,0.2)';
  pc.ctx.fillRect(6 * scale, 18 * scale, 8 * scale, 2 * scale);
  // 줄기
  pc.rect(9, 13, 2, 6, hex(0x5a3a1a));
  // 잎 (원형 3덩이)
  const leaf = hex(0x2f7a2f);
  const leafDark = hex(0x1f5a1f);
  const blobs = [
    [10, 8, 5],
    [7, 10, 3],
    [13, 10, 3]
  ];
  for (const [bx, by, r] of blobs) {
    for (let y = by - r; y <= by + r; y++) {
      for (let x = bx - r; x <= bx + r; x++) {
        const dx = x - bx;
        const dy = y - by;
        if (dx * dx + dy * dy <= r * r) {
          pc.px(x, y, y > by ? leafDark : leaf);
        }
      }
    }
  }
  scene.textures.addCanvas(key, pc.canvas);
}

export function genRock(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const grid = 16;
  const scale = 2;
  const pc = new PixelCanvas(grid, grid, scale);
  pc.ctx.fillStyle = 'rgba(0,0,0,0.2)';
  pc.ctx.fillRect(3 * scale, 12 * scale, 10 * scale, 2 * scale);
  const rock = hex(0x8a8a8a);
  const rockDark = hex(0x5a5a5a);
  const rockLight = hex(0xaaaaaa);
  const blobs = [
    [8, 9, 4],
    [5, 11, 2]
  ];
  for (const [bx, by, r] of blobs) {
    for (let y = by - r; y <= by + r; y++) {
      for (let x = bx - r; x <= bx + r; x++) {
        const dx = x - bx;
        const dy = y - by;
        if (dx * dx + dy * dy <= r * r) {
          pc.px(x, y, y < by ? rockLight : rock);
        }
      }
    }
  }
  pc.rect(6, 10, 2, 1, rockDark);
  scene.textures.addCanvas(key, pc.canvas);
}

// ============================================================
// 투사체 (화살)
// ============================================================
export function genArrow(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const grid = 12;
  const scale = 2;
  const pc = new PixelCanvas(grid, grid, scale);
  const y = 5;
  pc.rect(1, y, 8, 2, hex(0x6a4a2a)); // 대
  pc.rect(9, y - 1, 2, 4, hex(0xcccccc)); // 촉
  pc.px(0, y - 1, hex(0xdddddd)); // 깃
  pc.px(0, y + 2, hex(0xdddddd));
  scene.textures.addCanvas(key, pc.canvas);
}

// ============================================================
// 스킬 이펙트 링 (일섬 AOE)
// ============================================================
export function genSkillRing(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  // 방사형 그라디언트 링
  ctx.strokeStyle = 'rgba(255,240,180,0.95)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(c, c, c - 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,200,80,0.6)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(c, c, c - 18, 0, Math.PI * 2);
  ctx.stroke();
  // 내부 반짝임 삼각 조각
  ctx.fillStyle = 'rgba(255,255,220,0.5)';
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(ang) * (c - 24), c + Math.sin(ang) * (c - 24));
    ctx.lineTo(c + Math.cos(ang + 0.1) * (c - 10), c + Math.sin(ang + 0.1) * (c - 10));
    ctx.lineTo(c + Math.cos(ang - 0.1) * (c - 10), c + Math.sin(ang - 0.1) * (c - 10));
    ctx.closePath();
    ctx.fill();
  }
  scene.textures.addCanvas(key, canvas);
}

// ============================================================
// 조작(빙의) 중인 유닛 발밑 표시용 선택 링 (납작한 타원)
// ============================================================
export function genSelectRing(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const w = 96;
  const h = 48;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const cx = w / 2;
  const cy = h / 2;
  // 바깥 노란 링
  ctx.strokeStyle = 'rgba(255,224,80,0.95)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(cx, cy, cx - 6, cy - 6, 0, 0, Math.PI * 2);
  ctx.stroke();
  // 안쪽 흰 링
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, cx - 12, cy - 11, 0, 0, Math.PI * 2);
  ctx.stroke();
  // 은은한 채움
  ctx.fillStyle = 'rgba(255,224,80,0.12)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, cx - 8, cy - 8, 0, 0, Math.PI * 2);
  ctx.fill();
  scene.textures.addCanvas(key, canvas);
}

// ============================================================
// 사망 파티클용 작은 사각 텍스처
// ============================================================
export function genParticle(scene: Phaser.Scene, key: string, color: number) {
  if (scene.textures.exists(key)) return;
  const canvas = document.createElement('canvas');
  canvas.width = 6;
  canvas.height = 6;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = hex(color);
  ctx.fillRect(0, 0, 6, 6);
  scene.textures.addCanvas(key, canvas);
}

// ============================================================
// 절차 생성 스프라이트 (픽셀아트 v2)
// 논리 픽셀 그리드에 손으로 배치 -> 실루엣 자동 외곽선 -> 확대 텍스처화
// 외부 이미지/오디오 에셋 금지 — 전부 코드로 생성
// ============================================================
import Phaser from 'phaser';

const DISPLAY_SCALE = 3; // 논리 픽셀 1개 = 화면 3px

function hex(n: number): string {
  return '#' + (n & 0xffffff).toString(16).padStart(6, '0');
}

// 논리 픽셀 버퍼. null = 투명. 채운 뒤 outline()으로 실루엣 테두리를 만든다.
class Grid {
  w: number;
  h: number;
  buf: (number | null)[];
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.buf = new Array(w * h).fill(null);
  }
  set(x: number, y: number, c: number) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.buf[y * this.w + x] = c;
  }
  get(x: number, y: number): number | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.buf[y * this.w + x];
  }
  rect(x: number, y: number, w: number, h: number, c: number) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  disc(cx: number, cy: number, r: number, c: number) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r * r + 0.2) this.set(x, y, c);
      }
  }
  vline(x: number, y0: number, y1: number, c: number) {
    for (let y = y0; y <= y1; y++) this.set(x, y, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }
  }
  // 실루엣 자동 외곽선: 빈 칸 중 채워진 칸과 4방향 인접이면 outline 색으로.
  outlined(outline: number): (number | null)[] {
    const out = this.buf.slice();
    const isFill = (x: number, y: number) => {
      const v = this.get(x, y);
      return v !== null && v !== outline;
    };
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.buf[y * this.w + x] !== null) continue;
        if (isFill(x - 1, y) || isFill(x + 1, y) || isFill(x, y - 1) || isFill(x, y + 1)) {
          out[y * this.w + x] = outline;
        }
      }
    return out;
  }
}

export interface UnitPalette {
  outline: number;
  skin: number;
  skinShade: number;
  body: number;
  bodyShade: number;
  gear: number; // 투구/후드/모자
  gearShade: number;
  metal: number; // 무기 금속/밝은 부분
  metalDark: number; // 무기 손잡이/어두운 부분
  accent: number; // 방패/망토 등 강조
  accentShade: number;
}

export type UnitKind =
  | 'melee'
  | 'ranged'
  | 'spear'
  | 'hero'
  | 'goblin'
  | 'goblinArcher'
  | 'bandit'
  | 'oni'
  | 'goblinKing'
  | 'oniLord';

interface UnitShape {
  gw: number;
  gh: number;
}

const SHAPES: Record<UnitKind, UnitShape> = {
  melee: { gw: 16, gh: 16 },
  ranged: { gw: 16, gh: 16 },
  spear: { gw: 16, gh: 18 },
  hero: { gw: 20, gh: 20 },
  goblin: { gw: 16, gh: 15 },
  goblinArcher: { gw: 16, gh: 15 },
  bandit: { gw: 16, gh: 16 },
  oni: { gw: 24, gh: 24 },
  goblinKing: { gw: 26, gh: 26 },
  oniLord: { gw: 28, gh: 28 }
};

// 병종별 팔레트 (손으로 고른 상수)
export const UNIT_PALETTES: Record<UnitKind, UnitPalette> = {
  melee: {
    outline: 0x151a2a,
    skin: 0xf0c090,
    skinShade: 0xcf9968,
    body: 0x3f74e0,
    bodyShade: 0x274ea0,
    gear: 0xb9c6da,
    gearShade: 0x7c8aa4,
    metal: 0xe6edf7,
    metalDark: 0x8a6a34,
    accent: 0xd9b64a,
    accentShade: 0x9a7c26
  },
  ranged: {
    outline: 0x151a2a,
    skin: 0xf0c090,
    skinShade: 0xcf9968,
    body: 0x2f8a6a,
    bodyShade: 0x1d5c46,
    gear: 0x2a5a9a,
    gearShade: 0x1b3c6c,
    metal: 0xd9b06a,
    metalDark: 0x7a5326,
    accent: 0xe8e0c8,
    accentShade: 0xb0a888
  },
  spear: {
    outline: 0x151a2a,
    skin: 0xf0c090,
    skinShade: 0xcf9968,
    body: 0x4a6fd0,
    bodyShade: 0x2f4a9a,
    gear: 0xcf9048,
    gearShade: 0x8f5f24,
    metal: 0xe6edf7,
    metalDark: 0x7a5326,
    accent: 0xc0c0cc,
    accentShade: 0x88889a
  },
  hero: {
    outline: 0x2a1e08,
    skin: 0xf6cf9a,
    skinShade: 0xd39f68,
    body: 0xf2c53b,
    bodyShade: 0xc2901a,
    gear: 0xffe97a,
    gearShade: 0xc9a52a,
    metal: 0xfbffff,
    metalDark: 0x9a7420,
    accent: 0xc0392a, // 망토
    accentShade: 0x82231a
  },
  goblin: {
    outline: 0x101c10,
    skin: 0x6bbf4a,
    skinShade: 0x458a2e,
    body: 0x8a6a3a,
    bodyShade: 0x5c4522,
    gear: 0x6a5230,
    gearShade: 0x463618,
    metal: 0x9a7a4a,
    metalDark: 0x5a4426,
    accent: 0x7a3a2a,
    accentShade: 0x511f16
  },
  goblinArcher: {
    outline: 0x101c10,
    skin: 0x6bbf4a,
    skinShade: 0x458a2e,
    body: 0x555f38,
    bodyShade: 0x353c22,
    gear: 0x3a4a2a,
    gearShade: 0x24301a,
    metal: 0xba9058,
    metalDark: 0x6a4d28,
    accent: 0xd8cba0,
    accentShade: 0x9a8f6a
  },
  // 산적: 거친 인간. 어두운 가죽 + 붉은 두건 + 도끼 강철.
  bandit: {
    outline: 0x1a1208,
    skin: 0xe0a878,
    skinShade: 0xb07c4e,
    body: 0x6a4a30,
    bodyShade: 0x452e1c,
    gear: 0xb03028, // 붉은 두건
    gearShade: 0x7a1c18,
    metal: 0xd8dee8, // 도끼 날
    metalDark: 0x6a4a24, // 자루
    accent: 0x8a6a3a,
    accentShade: 0x5a4222
  },
  oni: {
    outline: 0x2a0d0d,
    skin: 0xdb4a3a,
    skinShade: 0xa02a20,
    body: 0x3a3550,
    bodyShade: 0x241f36,
    gear: 0xf2d64a,
    gearShade: 0xb89a1e,
    metal: 0xffe070,
    metalDark: 0xb0801a,
    accent: 0x101018,
    accentShade: 0x000000
  },
  // 고블린 킹: 진한 초록 거구 + 황금 왕관 + 대형 몽둥이
  goblinKing: {
    outline: 0x0a160a,
    skin: 0x4f9e34,
    skinShade: 0x2f6a1e,
    body: 0x6b3a22,
    bodyShade: 0x462213,
    gear: 0xffd23b, // 왕관 금색
    gearShade: 0xc79a12,
    metal: 0x9a7a4a, // 몽둥이 나무
    metalDark: 0x5a4426,
    accent: 0x8a2a20, // 왕의 망토
    accentShade: 0x561510
  },
  // 오니 대장: 기존 오니보다 진한 붉은 피부 + 검은 투구 + 대형 철퇴
  oniLord: {
    outline: 0x1e0707,
    skin: 0xc0342a,
    skinShade: 0x821c16,
    body: 0x272338,
    bodyShade: 0x14111f,
    gear: 0x2a2a3a, // 투구(검붉은 철)
    gearShade: 0x151520,
    metal: 0xffe070,
    metalDark: 0x9a6a12,
    accent: 0xd23b3b,
    accentShade: 0x8a1f1f
  }
};

// ---- 프레임 종류 ----
// 0: 걷기A, 1: 걷기B, 2: 공격, 3: 시체
function legOffsets(frame: number): [number, number] {
  if (frame === 0) return [0, 1];
  if (frame === 1) return [1, 0];
  return [0, 0]; // 공격 프레임은 정지 자세
}

// 공용 다리 그리기 (facing right 기준)
function drawLegs(g: Grid, cx: number, groundY: number, bodyBot: number, P: UnitPalette, frame: number) {
  const [lo, ro] = legOffsets(frame);
  const legLen = groundY - bodyBot;
  const lx = cx - 2;
  const rx = cx + 1;
  g.rect(lx, bodyBot + lo, 2, legLen - lo, P.bodyShade);
  g.rect(rx, bodyBot + ro, 2, legLen - ro, P.body);
  // 발
  g.rect(lx - 1, groundY, 3, 1, P.gearShade);
  g.rect(rx, groundY, 3, 1, P.gearShade);
}

function drawHumanoid(g: Grid, kind: UnitKind, P: UnitPalette, frame: number) {
  const { gw, gh } = SHAPES[kind];
  const cx = Math.floor(gw / 2);
  const groundY = gh - 1;

  if (frame === 3) {
    drawCorpse(g, kind, P);
    return;
  }

  const attack = frame === 2;

  // 헤드/보디 세팅 (병종별)
  if (kind === 'oni') {
    drawOni(g, P, frame, cx, groundY, attack);
    return;
  }
  if (kind === 'goblinKing') {
    drawGoblinKing(g, P, frame, cx, groundY, attack);
    return;
  }
  if (kind === 'oniLord') {
    drawOniLord(g, P, frame, cx, groundY, attack);
    return;
  }
  if (kind === 'hero') {
    drawHero(g, P, frame, cx, groundY, attack);
    return;
  }
  if (kind === 'goblin' || kind === 'goblinArcher') {
    drawGoblin(g, kind, P, frame, cx, groundY, attack);
    return;
  }
  if (kind === 'bandit') {
    drawBandit(g, P, frame, cx, groundY, attack);
    return;
  }

  // ---- 일반 병사 (검병/궁병/창병) 16x16~18 ----
  const headCY = kind === 'spear' ? 5 : 4;
  const headR = 3;
  const bodyTop = headCY + headR;
  const bodyBot = groundY - 3;
  const bodyW = 5;
  const bodyX = cx - Math.floor(bodyW / 2);

  drawLegs(g, cx, groundY, bodyBot, P, frame);

  // 몸통(갑옷)
  g.rect(bodyX, bodyTop, bodyW, bodyBot - bodyTop, P.body);
  g.vline(bodyX + bodyW - 1, bodyTop, bodyBot - 1, P.bodyShade); // 오른쪽 음영
  g.rect(bodyX, bodyTop, bodyW, 1, P.body); // 어깨선

  // 머리
  g.disc(cx, headCY, headR, P.skin);
  g.set(cx + headR - 1, headCY + 1, P.skinShade);
  g.set(cx + 1, headCY, P.outline); // 눈

  // 헤드기어
  if (kind === 'melee') {
    // 투구 (윗머리 덮고 볏)
    g.disc(cx, headCY - 1, headR, P.gear);
    g.rect(cx - headR, headCY, headR * 2 + 1, 1, P.gearShade); // 챙
    g.set(cx, headCY - headR - 1, P.accent); // 볏
    g.set(cx, headCY - headR - 2, P.accent);
    // 얼굴 노출
    g.rect(cx - 1, headCY + 1, 3, 2, P.skin);
    g.set(cx + 1, headCY + 1, P.outline);
  } else if (kind === 'ranged') {
    // 후드 (뾰족)
    g.disc(cx, headCY, headR, P.gear);
    g.set(cx - 1, headCY - headR - 1, P.gear);
    g.set(cx, headCY - headR - 1, P.gearShade);
    g.rect(cx - 1, headCY, 3, 3, P.skin); // 얼굴
    g.set(cx + 1, headCY + 1, P.outline);
  } else if (kind === 'spear') {
    // 원뿔 모자 (삼각)
    for (let i = 0; i <= headR + 1; i++) {
      g.rect(cx - i, headCY - headR - 1 + i, i * 2 + 1, 1, i % 2 === 0 ? P.gear : P.gearShade);
    }
    g.rect(cx - 1, headCY, 3, 2, P.skin);
    g.set(cx + 1, headCY, P.outline);
  }

  // 무기 & 방패
  const armY = bodyTop + 1;
  if (kind === 'melee') {
    // 방패 (전면/왼쪽 근접팔)
    g.rect(cx - 4, armY, 2, 5, P.accent);
    g.vline(cx - 4, armY, armY + 4, P.accentShade);
    g.set(cx - 3, armY + 2, P.metal); // 방패 보스
    // 검
    if (attack) {
      g.line(cx + 2, armY, cx + 6, armY + 4, P.metal);
      g.set(cx + 6, armY + 4, P.metal);
      g.set(cx + 2, armY, P.metalDark);
    } else {
      g.vline(cx + 3, headCY - 2, armY + 1, P.metal);
      g.rect(cx + 2, armY + 1, 3, 1, P.metalDark); // 가드
      g.set(cx + 3, armY + 2, P.metalDark); // 손잡이
    }
  } else if (kind === 'ranged') {
    // 활 (전면 호)
    const bx = cx + 3;
    g.line(bx, armY - 2, bx + 1, armY, P.metalDark);
    g.line(bx + 1, armY, bx, armY + 3, P.metalDark);
    g.vline(bx - 1, armY - 2, armY + 3, P.accent); // 시위
    if (attack) g.set(bx - 3, armY, P.metal); // 화살 노킹
  } else if (kind === 'spear') {
    // 긴 창 (대각)
    if (attack) {
      g.line(cx + 1, armY + 1, cx + 6, armY - 1, P.metalDark);
      g.set(cx + 6, armY - 1, P.metal);
      g.set(cx + 7, armY - 2, P.metal);
    } else {
      g.line(cx - 2, groundY - 1, cx + 4, headCY - 4, P.metalDark);
      g.set(cx + 4, headCY - 4, P.metal);
      g.set(cx + 5, headCY - 5, P.metal); // 창끝
    }
  }
}

function drawHero(g: Grid, P: UnitPalette, frame: number, cx: number, groundY: number, attack: boolean) {
  const headCY = 5;
  const headR = 3;
  const bodyTop = headCY + headR;
  const bodyBot = groundY - 4;
  const bodyW = 6;
  const bodyX = cx - Math.floor(bodyW / 2);

  // 망토 (뒤 — 왼쪽)
  g.rect(bodyX - 2, bodyTop, 3, bodyBot - bodyTop + 3, P.accent);
  g.vline(bodyX - 2, bodyTop, bodyBot + 1, P.accentShade);
  g.set(bodyX - 1, bodyBot + 2, P.accentShade);

  drawLegs(g, cx, groundY, bodyBot, P, frame);

  // 몸통(황금 갑옷)
  g.rect(bodyX, bodyTop, bodyW, bodyBot - bodyTop, P.body);
  g.vline(bodyX + bodyW - 1, bodyTop, bodyBot - 1, P.bodyShade);
  g.rect(bodyX + 1, bodyTop + 1, 2, 2, P.gear); // 흉갑 광택

  // 머리 + 투구 + 깃털
  g.disc(cx, headCY, headR, P.skin);
  g.disc(cx, headCY - 1, headR, P.gear);
  g.rect(cx - headR, headCY, headR * 2 + 1, 1, P.gearShade);
  g.rect(cx - 1, headCY + 1, 3, 2, P.skin);
  g.set(cx + 1, headCY + 1, P.outline);
  // 깃털 볏
  g.set(cx, headCY - headR - 1, P.accent);
  g.set(cx, headCY - headR - 2, P.accent);
  g.set(cx - 1, headCY - headR - 1, P.accentShade);

  // 빛나는 검 (오른손)
  const armY = bodyTop + 1;
  if (attack) {
    g.line(cx + 2, armY - 1, cx + 8, armY + 5, P.metal);
    g.line(cx + 2, armY, cx + 7, armY + 5, 0xffffff);
    g.set(cx + 2, armY, P.metalDark);
  } else {
    g.vline(cx + 4, headCY - 4, armY + 1, P.metal);
    g.vline(cx + 3, headCY - 4, armY, 0xffffff); // 검광 하이라이트
    g.rect(cx + 3, armY + 1, 3, 1, P.metalDark);
    g.set(cx + 4, armY + 2, P.metalDark);
  }
}

function drawGoblin(g: Grid, kind: UnitKind, P: UnitPalette, frame: number, cx: number, groundY: number, attack: boolean) {
  // 웅크린 자세: 머리 앞으로, 몸통 낮게
  const headCY = 4;
  const headR = 3;
  const bodyTop = headCY + headR - 1;
  const bodyBot = groundY - 2;
  const bodyW = 5;
  const bodyX = cx - Math.floor(bodyW / 2);

  drawLegs(g, cx, groundY, bodyBot, P, frame);

  // 몸통 (누더기)
  g.rect(bodyX, bodyTop, bodyW, bodyBot - bodyTop, P.body);
  g.vline(bodyX + bodyW - 1, bodyTop, bodyBot - 1, P.bodyShade);

  // 큰 귀 + 머리
  g.disc(cx, headCY, headR, P.skin);
  g.set(cx - headR - 1, headCY, P.skin); // 왼귀
  g.set(cx - headR - 2, headCY - 1, P.skinShade);
  g.set(cx + headR + 1, headCY, P.skin); // 오른귀
  g.set(cx + headR + 2, headCY - 1, P.skinShade);
  g.set(cx + 1, headCY, P.outline); // 눈
  g.set(cx + 2, headCY + 1, P.skinShade); // 코/입

  if (kind === 'goblinArcher') {
    // 두건
    g.disc(cx, headCY - 1, headR, P.gear);
    g.rect(cx - 1, headCY, 3, 2, P.skin);
    g.set(cx + 1, headCY, P.outline);
    // 활
    const bx = cx + 3;
    g.line(bx, headCY, bx + 1, headCY + 2, P.metalDark);
    g.line(bx + 1, headCY + 2, bx, headCY + 5, P.metalDark);
    g.vline(bx - 1, headCY, headCY + 5, P.accent);
    if (attack) g.set(bx - 3, headCY + 2, P.metal);
  } else {
    // 몽둥이
    const armY = bodyTop + 1;
    if (attack) {
      g.line(cx + 1, armY, cx + 6, armY - 3, P.metalDark);
      g.rect(cx + 5, armY - 4, 2, 2, P.metal); // 뭉툭한 머리
    } else {
      g.line(cx + 2, armY + 2, cx + 5, headCY - 3, P.metalDark);
      g.rect(cx + 4, headCY - 4, 2, 2, P.metal);
    }
  }
}

// 산적: 인간 근접형 + 붉은 두건 + 도끼 (방패 없음, 도끼가 큼)
function drawBandit(g: Grid, P: UnitPalette, frame: number, cx: number, groundY: number, attack: boolean) {
  const headCY = 4;
  const headR = 3;
  const bodyTop = headCY + headR;
  const bodyBot = groundY - 3;
  const bodyW = 6;
  const bodyX = cx - Math.floor(bodyW / 2);

  drawLegs(g, cx, groundY, bodyBot, P, frame);

  // 몸통 (가죽 조끼) + 어깨
  g.rect(bodyX, bodyTop, bodyW, bodyBot - bodyTop, P.body);
  g.vline(bodyX + bodyW - 1, bodyTop, bodyBot - 1, P.bodyShade);
  g.rect(bodyX, bodyTop, bodyW, 1, P.accent); // 어깨선
  g.set(cx - 1, bodyTop + 2, P.accentShade); // 가슴 벨트

  // 머리
  g.disc(cx, headCY, headR, P.skin);
  g.set(cx + headR - 1, headCY + 1, P.skinShade);
  g.set(cx + 1, headCY, P.outline); // 눈
  g.set(cx + 2, headCY + 1, P.skinShade); // 수염 그늘

  // 붉은 두건 (머리 위 + 뒤로 흘러내림)
  g.rect(cx - headR, headCY - headR, headR * 2 + 1, 2, P.gear);
  g.vline(cx - headR, headCY - headR, headCY - headR + 1, P.gearShade);
  g.set(cx - headR - 1, headCY - headR + 1, P.gear); // 매듭 자락
  g.set(cx - headR - 2, headCY - headR + 2, P.gearShade);

  // 도끼 (오른손)
  const armY = bodyTop + 1;
  if (attack) {
    // 내려찍는 자세: 자루 대각 + 도끼날 앞
    g.line(cx + 1, armY + 1, cx + 6, armY - 3, P.metalDark);
    g.rect(cx + 5, armY - 5, 3, 3, P.metal); // 도끼날
    g.set(cx + 4, armY - 5, P.metal);
    g.set(cx + 7, armY - 2, P.metalDark);
  } else {
    // 어깨에 걸친 도끼
    g.line(cx + 2, armY + 2, cx + 5, headCY - 3, P.metalDark); // 자루
    g.rect(cx + 4, headCY - 5, 3, 3, P.metal); // 도끼날
    g.set(cx + 6, headCY - 5, P.metal);
    g.set(cx + 4, headCY - 2, P.metalDark);
  }
}

function drawOni(g: Grid, P: UnitPalette, frame: number, cx: number, groundY: number, attack: boolean) {
  // 24x24 붉은 거구
  const headCY = 6;
  const headR = 4;
  const bodyTop = headCY + headR - 1;
  const bodyBot = groundY - 5;
  const bodyW = 10;
  const bodyX = cx - Math.floor(bodyW / 2);

  // 다리 (굵게)
  const [lo, ro] = legOffsets(frame);
  const legLen = groundY - bodyBot;
  g.rect(cx - 4, bodyBot + lo, 3, legLen - lo, P.skinShade);
  g.rect(cx + 1, bodyBot + ro, 3, legLen - ro, P.skin);
  g.rect(cx - 5, groundY, 4, 1, P.outline);
  g.rect(cx + 1, groundY, 4, 1, P.outline);

  // 몸통 (근육 + 허리 두른 천)
  g.disc(cx, bodyTop + 4, 6, P.skin); // 가슴 근육 덩어리
  g.rect(bodyX, bodyTop, bodyW, bodyBot - bodyTop, P.skin);
  g.vline(bodyX + bodyW - 1, bodyTop, bodyBot - 1, P.skinShade);
  g.rect(bodyX, bodyBot - 3, bodyW, 3, P.body); // 허리천
  g.vline(bodyX + bodyW - 1, bodyBot - 3, bodyBot - 1, P.bodyShade);

  // 머리
  g.disc(cx, headCY, headR, P.skin);
  g.set(cx + headR - 1, headCY + 1, P.skinShade);
  g.rect(cx - 2, headCY, 1, 1, P.gear); // 눈(금빛, 사나움)
  g.rect(cx + 1, headCY, 1, 1, P.gear);
  g.rect(cx - 1, headCY + 2, 3, 1, P.accent); // 입/이빨
  g.set(cx - 1, headCY + 2, P.metal);
  g.set(cx + 1, headCY + 2, P.metal);
  // 뿔 두 개
  g.line(cx - 3, headCY - headR, cx - 4, headCY - headR - 3, P.gear);
  g.line(cx + 3, headCY - headR, cx + 4, headCY - headR - 3, P.gear);
  g.set(cx - 4, headCY - headR - 3, P.metal);
  g.set(cx + 4, headCY - headR - 3, P.metal);

  // 금강저(가시 금봉) — 오른손
  const armY = bodyTop + 2;
  if (attack) {
    g.line(cx + 3, armY, cx + 9, armY - 6, P.metalDark);
    g.rect(cx + 7, armY - 9, 3, 4, P.metal);
    g.set(cx + 6, armY - 9, P.gear);
    g.set(cx + 10, armY - 6, P.gear);
  } else {
    g.line(cx + 4, bodyBot, cx + 7, headCY - 5, P.metalDark);
    g.rect(cx + 6, headCY - 8, 3, 4, P.metal);
    g.set(cx + 5, headCY - 8, P.gear);
    g.set(cx + 9, headCY - 5, P.gear);
  }
}

function drawGoblinKing(g: Grid, P: UnitPalette, frame: number, cx: number, groundY: number, attack: boolean) {
  // 26x26 초록 거구 + 왕관 + 대형 몽둥이
  const headCY = 7;
  const headR = 5;
  const bodyTop = headCY + headR - 1;
  const bodyBot = groundY - 5;
  const bodyW = 11;
  const bodyX = cx - Math.floor(bodyW / 2);

  // 망토 (뒤 왼쪽)
  g.rect(bodyX - 2, bodyTop, 3, bodyBot - bodyTop + 3, P.accent);
  g.vline(bodyX - 2, bodyTop, bodyBot + 1, P.accentShade);

  // 굵은 다리
  const [lo, ro] = legOffsets(frame);
  const legLen = groundY - bodyBot;
  g.rect(cx - 4, bodyBot + lo, 4, legLen - lo, P.skinShade);
  g.rect(cx + 1, bodyBot + ro, 4, legLen - ro, P.skin);
  g.rect(cx - 5, groundY, 5, 1, P.outline);
  g.rect(cx + 1, groundY, 5, 1, P.outline);

  // 몸통 (가죽 갑옷) + 배
  g.rect(bodyX, bodyTop, bodyW, bodyBot - bodyTop, P.body);
  g.vline(bodyX + bodyW - 1, bodyTop, bodyBot - 1, P.bodyShade);
  g.disc(cx, bodyTop + 4, 5, P.skin); // 드러난 배
  g.set(cx + 3, bodyTop + 5, P.skinShade);

  // 머리 + 큰 귀
  g.disc(cx, headCY, headR, P.skin);
  g.set(cx - headR - 1, headCY, P.skin);
  g.set(cx - headR - 2, headCY - 1, P.skinShade);
  g.set(cx + headR + 1, headCY, P.skin);
  g.set(cx + headR + 2, headCY - 1, P.skinShade);
  g.rect(cx + 1, headCY, 1, 2, P.outline); // 눈
  g.rect(cx - 2, headCY, 1, 2, P.outline);
  g.rect(cx - 1, headCY + 2, 3, 1, P.skinShade); // 험상궂은 입
  g.set(cx - 1, headCY + 2, P.metal); // 송곳니
  g.set(cx + 1, headCY + 2, P.metal);

  // 황금 왕관
  const crownY = headCY - headR - 1;
  g.rect(cx - headR + 1, crownY, headR * 2 - 1, 2, P.gear);
  g.vline(cx - headR + 1, crownY, crownY + 1, P.gearShade);
  for (let i = -headR + 2; i <= headR - 2; i += 2) {
    g.set(cx + i, crownY - 1, P.gear); // 뾰족한 첨탑
    g.set(cx + i, crownY - 2, P.metal);
  }
  g.set(cx, crownY - 2, 0xff5a5a); // 중앙 보석

  // 대형 몽둥이 (오른손)
  const armY = bodyTop + 2;
  if (attack) {
    g.line(cx + 3, armY, cx + 10, armY - 7, P.metalDark);
    g.disc(cx + 10, armY - 8, 3, P.metal);
    g.set(cx + 11, armY - 9, P.gearShade);
    g.set(cx + 8, armY - 6, P.metalDark);
  } else {
    g.line(cx + 5, bodyBot, cx + 9, headCY - 6, P.metalDark);
    g.disc(cx + 9, headCY - 8, 3, P.metal);
    g.set(cx + 10, headCY - 9, P.gearShade);
  }
}

function drawOniLord(g: Grid, P: UnitPalette, frame: number, cx: number, groundY: number, attack: boolean) {
  // 28x28 진홍 거구 + 검은 투구(뿔) + 대형 철퇴
  const headCY = 7;
  const headR = 5;
  const bodyTop = headCY + headR - 1;
  const bodyBot = groundY - 6;
  const bodyW = 13;
  const bodyX = cx - Math.floor(bodyW / 2);

  // 굵은 다리
  const [lo, ro] = legOffsets(frame);
  const legLen = groundY - bodyBot;
  g.rect(cx - 5, bodyBot + lo, 4, legLen - lo, P.skinShade);
  g.rect(cx + 2, bodyBot + ro, 4, legLen - ro, P.skin);
  g.rect(cx - 6, groundY, 5, 1, P.outline);
  g.rect(cx + 2, groundY, 5, 1, P.outline);

  // 몸통 (근육 + 허리천)
  g.disc(cx, bodyTop + 5, 7, P.skin);
  g.rect(bodyX, bodyTop, bodyW, bodyBot - bodyTop, P.skin);
  g.vline(bodyX + bodyW - 1, bodyTop, bodyBot - 1, P.skinShade);
  g.rect(bodyX, bodyBot - 4, bodyW, 4, P.body); // 허리천
  g.vline(bodyX + bodyW - 1, bodyBot - 4, bodyBot - 1, P.bodyShade);
  g.rect(cx - 3, bodyTop + 2, 6, 1, P.accentShade); // 가슴 흉터

  // 머리
  g.disc(cx, headCY, headR, P.skin);
  g.set(cx + headR - 1, headCY + 1, P.skinShade);
  g.rect(cx - 3, headCY + 1, 2, 1, P.gear); // 눈(어두운 투구 그늘 아래 번뜩임)
  g.rect(cx + 2, headCY + 1, 2, 1, P.gear);
  g.rect(cx - 3, headCY + 1, 1, 1, 0xffe070);
  g.rect(cx + 3, headCY + 1, 1, 1, 0xffe070);
  g.rect(cx - 2, headCY + 3, 5, 1, P.accent); // 입/이빨
  g.set(cx - 2, headCY + 3, P.metal);
  g.set(cx, headCY + 3, P.metal);
  g.set(cx + 2, headCY + 3, P.metal);

  // 검은 투구 (이마 덮개) + 금속 뿔
  g.disc(cx, headCY - 1, headR, P.gear);
  g.rect(cx - headR, headCY + 1, headR * 2 + 1, 1, P.gearShade); // 투구 챙
  g.rect(cx - 3, headCY + 1, 7, 1, P.skin); // 얼굴 노출
  g.line(cx - 4, headCY - headR + 1, cx - 6, headCY - headR - 3, P.metal);
  g.line(cx + 4, headCY - headR + 1, cx + 6, headCY - headR - 3, P.metal);
  g.set(cx - 6, headCY - headR - 3, P.metalDark);
  g.set(cx + 6, headCY - headR - 3, P.metalDark);
  g.set(cx, headCY - headR - 1, 0xffe070); // 투구 중앙 장식

  // 대형 철퇴 (오른손)
  const armY = bodyTop + 2;
  if (attack) {
    g.line(cx + 4, armY, cx + 11, armY - 7, P.metalDark);
    g.rect(cx + 9, armY - 11, 4, 5, P.metal);
    g.set(cx + 8, armY - 11, P.gear);
    g.set(cx + 13, armY - 7, P.gear);
    g.set(cx + 10, armY - 12, P.gear);
  } else {
    g.line(cx + 5, bodyBot, cx + 9, headCY - 6, P.metalDark);
    g.rect(cx + 7, headCY - 10, 4, 5, P.metal);
    g.set(cx + 6, headCY - 10, P.gear);
    g.set(cx + 11, headCY - 6, P.gear);
  }
}

function drawCorpse(g: Grid, kind: UnitKind, P: UnitPalette) {
  const { gw, gh } = SHAPES[kind];
  const cx = Math.floor(gw / 2);
  const y = gh - 2;
  const len =
    kind === 'oniLord' ? 11 : kind === 'goblinKing' ? 10 : kind === 'oni' ? 9 : kind === 'hero' ? 7 : 5;
  // 쓰러진 몸통
  g.rect(cx - len, y - 1, len * 2, 2, P.body);
  g.rect(cx - len, y, len * 2, 1, P.bodyShade);
  // 머리
  g.disc(cx - len, y, 2, P.skin);
  // 흩어진 무기
  g.line(cx, y - 2, cx + len, y - 2, P.metalDark);
}

// ---- 텍스처 등록 ----
export function genUnit(scene: Phaser.Scene, key: string, kind: UnitKind, tint = 0xffffff) {
  if (scene.textures.exists(key)) return;
  const { gw, gh } = SHAPES[kind];
  const P = applyTint(UNIT_PALETTES[kind], tint);
  const frames = 4;
  const fw = gw * DISPLAY_SCALE;
  const fh = gh * DISPLAY_SCALE;

  const sheet = document.createElement('canvas');
  sheet.width = fw * frames;
  sheet.height = fh;
  const sctx = sheet.getContext('2d')!;
  sctx.imageSmoothingEnabled = false;

  for (let f = 0; f < frames; f++) {
    const g = new Grid(gw, gh);
    drawHumanoid(g, kind, P, f);
    const out = g.outlined(P.outline);
    for (let y = 0; y < gh; y++)
      for (let x = 0; x < gw; x++) {
        const c = out[y * gw + x];
        if (c === null) continue;
        sctx.fillStyle = hex(c);
        sctx.fillRect(f * fw + x * DISPLAY_SCALE, y * DISPLAY_SCALE, DISPLAY_SCALE, DISPLAY_SCALE);
      }
  }

  const tex = scene.textures.addCanvas(key, sheet)!;
  for (let f = 0; f < frames; f++) tex.add(f, 0, f * fw, 0, fw, fh);
}

// 부대 소속 미세 색조 (원색과 곱연산)
function applyTint(P: UnitPalette, tint: number): UnitPalette {
  if (tint === 0xffffff) return P;
  const tr = ((tint >> 16) & 0xff) / 255;
  const tg = ((tint >> 8) & 0xff) / 255;
  const tb = (tint & 0xff) / 255;
  const mul = (c: number) => {
    const r = Math.min(255, Math.round(((c >> 16) & 0xff) * (0.55 + tr * 0.45)));
    const gg = Math.min(255, Math.round(((c >> 8) & 0xff) * (0.55 + tg * 0.45)));
    const b = Math.min(255, Math.round((c & 0xff) * (0.55 + tb * 0.45)));
    return (r << 16) | (gg << 8) | b;
  };
  const out = { ...P };
  out.body = mul(P.body);
  out.bodyShade = mul(P.bodyShade);
  return out;
}

// 프레임 상수 (Unit에서 참조)
export const FRAME = { WALK_A: 0, WALK_B: 1, ATTACK: 2, CORPSE: 3 };

// ============================================================
// 부대 배너 (선두 유닛 위 작은 깃발)
// ============================================================
export function genBanner(scene: Phaser.Scene, key: string, color: number) {
  if (scene.textures.exists(key)) return;
  const g = new Grid(12, 14);
  g.vline(2, 0, 13, 0x5a4028); // 깃대
  for (let y = 1; y <= 7; y++) {
    const w = 8 - Math.abs(4 - y);
    g.rect(3, y, w, 1, color);
  }
  g.rect(3, 3, 3, 3, 0xffffff); // 문양
  const out = g.outlined(0x101010);
  blit(scene, key, g, out, 2);
}

// ============================================================
// 보스 마크 (머리 위 작은 왕관/해골 표식)
// ============================================================
export function genBossMark(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const g = new Grid(12, 10);
  // 작은 왕관
  g.rect(2, 5, 8, 3, 0xffd23b);
  g.vline(2, 5, 7, 0xc79a12);
  g.set(2, 3, 0xffd23b);
  g.set(2, 2, 0xffe070);
  g.set(5, 2, 0xffd23b);
  g.set(5, 1, 0xffe070);
  g.set(8, 3, 0xffd23b);
  g.set(8, 2, 0xffe070);
  g.set(5, 6, 0xff5a5a); // 중앙 보석
  const out = g.outlined(0x2a1e08);
  blit(scene, key, g, out, 3);
}

// ============================================================
// 백기 (투항 표식)
// ============================================================
export function genWhiteFlag(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const g = new Grid(12, 14);
  g.vline(2, 0, 13, 0x6a5030); // 깃대
  for (let y = 1; y <= 7; y++) {
    const w = 8 - Math.abs(4 - y);
    g.rect(3, y, w, 1, 0xf4f4f4);
  }
  g.set(9, 4, 0xd8d8d8);
  const out = g.outlined(0x2a2a2a);
  blit(scene, key, g, out, 2);
}

// ============================================================
// 이동 명령 목표 깃발 마커 (부대 배너 색으로 틴트해 사용)
// ============================================================
export function genOrderFlag(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const g = new Grid(14, 22);
  g.vline(3, 0, 21, 0x3a2a12); // 긴 깃대
  g.vline(4, 1, 20, 0x24190b);
  // 삼각 페넌트 (위가 넓고 아래로 좁아짐)
  for (let y = 1; y <= 8; y++) {
    const ww = 9 - y; // y=1 → 8칸, y=8 → 1칸
    if (ww >= 1) g.rect(5, y, ww, 1, 0xffffff);
  }
  const out = g.outlined(0x101010);
  blit(scene, key, g, out, 3);
}

// ============================================================
// 투사체 (화살)
// ============================================================
export function genArrow(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const g = new Grid(12, 6);
  g.rect(1, 2, 8, 1, 0x6a4a2a); // 대
  g.rect(9, 1, 2, 3, 0xd8d8d8); // 촉
  g.set(0, 1, 0xdddddd); // 깃
  g.set(0, 3, 0xdddddd);
  const out = g.outlined(0x1a1208);
  blit(scene, key, g, out, 2);
}

// ============================================================
// 타격 스파크
// ============================================================
export function genSpark(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const g = new Grid(9, 9);
  const c = 4;
  g.set(c, c, 0xffffff);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as [number, number][]) {
    g.set(c + dx, c + dy, 0xffe9a0);
    g.set(c + dx * 2, c + dy * 2, 0xffb84a);
  }
  blit(scene, key, g, g.buf, 3);
}

// ============================================================
// 조작(빙의) 선택 링 (납작한 타원)
// ============================================================
export function genSelectRing(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const w = 96;
  const h = 44;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const cx = w / 2;
  const cy = h / 2;
  ctx.strokeStyle = 'rgba(255,224,80,0.95)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(cx, cy, cx - 6, cy - 6, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, cx - 12, cy - 10, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,224,80,0.10)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, cx - 8, cy - 8, 0, 0, Math.PI * 2);
  ctx.fill();
  scene.textures.addCanvas(key, canvas);
}

// 정보창에서 클릭 대상 표시용 (붉은 링)
export function genTargetRing(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const w = 88;
  const h = 40;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w / 2 - 4, h / 2 - 4, 0, 0, Math.PI * 2);
  ctx.stroke();
  scene.textures.addCanvas(key, canvas);
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
// 폭발(폭열검) 이펙트: 확장 링 + 화염 파편 파티클
// ============================================================
export function genExplosionRing(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  // 바깥 주황 링
  ctx.strokeStyle = 'rgba(255,140,40,0.95)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(c, c, c - 10, 0, Math.PI * 2);
  ctx.stroke();
  // 안쪽 노란 링
  ctx.strokeStyle = 'rgba(255,220,120,0.85)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(c, c, c - 22, 0, Math.PI * 2);
  ctx.stroke();
  // 코어 광
  const grad = ctx.createRadialGradient(c, c, 2, c, c, c - 24);
  grad.addColorStop(0, 'rgba(255,240,190,0.55)');
  grad.addColorStop(1, 'rgba(255,120,30,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(c, c, c - 24, 0, Math.PI * 2);
  ctx.fill();
  scene.textures.addCanvas(key, canvas);
}

// 화염 파편 (작은 불꽃 사각). 색조는 파티클 tint로 변주.
export function genFireShard(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const g = new Grid(6, 6);
  g.disc(3, 3, 2, 0xffd24a);
  g.set(3, 2, 0xffffff);
  g.set(2, 3, 0xff8a30);
  g.set(4, 4, 0xff5a20);
  const out = g.outlined(0x7a2a08);
  blit(scene, key, g, out, 3);
}

// ============================================================
// 장비 슬롯 아이콘 (하단 정보창용 작은 픽셀 글리프)
// ============================================================
export function genItemIcon(scene: Phaser.Scene, key: string, slot: string) {
  if (scene.textures.exists(key)) return;
  const g = new Grid(12, 12);
  if (slot === 'weapon') {
    // 검
    g.line(3, 9, 8, 4, 0xd8dee8);
    g.line(4, 9, 9, 4, 0xf0f4fa);
    g.rect(2, 8, 3, 1, 0x8a6a34); // 가드
    g.set(2, 9, 0x6a4a24); // 손잡이
    g.set(9, 3, 0xffffff);
  } else if (slot === 'helmet') {
    g.disc(6, 5, 3, 0xb9c6da);
    g.rect(3, 5, 7, 2, 0x7c8aa4);
    g.set(6, 1, 0xd9b64a); // 볏
    g.set(6, 2, 0xd9b64a);
  } else if (slot === 'top') {
    g.rect(3, 3, 6, 6, 0x3f74e0);
    g.vline(8, 3, 8, 0x274ea0);
    g.rect(2, 3, 2, 2, 0x274ea0); // 어깨
    g.rect(8, 3, 2, 2, 0x274ea0);
    g.set(6, 5, 0x9ab0e8);
  } else if (slot === 'bottom') {
    g.rect(3, 3, 6, 3, 0x5a6ea0);
    g.rect(3, 6, 2, 4, 0x445488); // 왼다리
    g.rect(7, 6, 2, 4, 0x445488); // 오른다리
  } else if (slot === 'gloves') {
    g.rect(4, 4, 4, 5, 0x8a5a34);
    g.set(3, 4, 0x8a5a34); // 엄지
    g.set(4, 3, 0xb07a44);
    g.rect(4, 8, 4, 1, 0x5a3a1a);
  } else if (slot === 'boots') {
    g.rect(4, 3, 3, 6, 0x6a4a2a);
    g.rect(4, 8, 6, 2, 0x4a3018); // 밑창
    g.set(5, 3, 0x8a6a44);
  }
  const out = g.outlined(0x14100a);
  blit(scene, key, g, out, 3);
}

// ============================================================
// 파티클 (사망 핏빛 파편 등)
// ============================================================
export function genParticle(scene: Phaser.Scene, key: string, color: number) {
  if (scene.textures.exists(key)) return;
  const canvas = document.createElement('canvas');
  canvas.width = 5;
  canvas.height = 5;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = hex(color);
  ctx.fillRect(0, 0, 5, 5);
  scene.textures.addCanvas(key, canvas);
}

// ============================================================
// 지형 데코 (나무 / 바위 / 풀숲)
// ============================================================
export function genTree(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const g = new Grid(22, 26);
  g.rect(10, 17, 3, 8, 0x5a3a1a); // 줄기
  g.vline(12, 17, 24, 0x40280f);
  const blobs: [number, number, number][] = [
    [11, 9, 6],
    [7, 12, 4],
    [15, 12, 4],
    [11, 14, 5]
  ];
  for (const [bx, by, r] of blobs) {
    g.disc(bx, by, r, 0x2f7a2f);
  }
  // 음영 + 하이라이트
  for (const [bx, by, r] of blobs) {
    for (let x = bx - r; x <= bx + r; x++) g.set(x, by + r - 1, 0x1f5a1f);
    g.set(bx - 1, by - r + 1, 0x4aa04a);
  }
  const out = g.outlined(0x123012);
  blit(scene, key, g, out, 3);
}

export function genRock(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const g = new Grid(18, 14);
  g.disc(9, 9, 5, 0x8a8a92);
  g.disc(5, 11, 3, 0x7a7a82);
  g.disc(13, 11, 3, 0x9a9aa2);
  for (let x = 4; x <= 14; x++) g.set(x, 6, 0xb2b2ba); // 상단 하이라이트
  g.rect(6, 10, 3, 1, 0x5a5a62); // 균열
  const out = g.outlined(0x2a2a30);
  blit(scene, key, g, out, 3);
}

export function genBush(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const g = new Grid(18, 12);
  const blobs: [number, number, number][] = [
    [6, 8, 4],
    [11, 8, 4],
    [9, 6, 3]
  ];
  for (const [bx, by, r] of blobs) g.disc(bx, by, r, 0x3a7e34);
  for (const [bx, by, r] of blobs) {
    for (let x = bx - r; x <= bx + r; x++) g.set(x, by + r - 1, 0x275a24);
    g.set(bx - 1, by - r + 1, 0x54a048);
  }
  const out = g.outlined(0x143012);
  blit(scene, key, g, out, 3);
}

// ============================================================
// 전략 노드맵: 성채 (거점) 스프라이트
// ============================================================
export function genCastle(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const g = new Grid(22, 20);
  const wall = 0x9a8f7a;
  const wallShade = 0x6f6555;
  const wallLite = 0xc0b49a;
  const gate = 0x3a2a18;
  // 성벽 본체
  g.rect(2, 9, 18, 10, wall);
  g.vline(19, 9, 18, wallShade);
  g.rect(2, 9, 18, 1, wallLite);
  // 흉벽(총안) — 위쪽 요철
  for (let x = 2; x <= 19; x += 3) {
    g.rect(x, 7, 2, 2, wall);
    g.set(x, 7, wallLite);
  }
  // 좌우 탑
  g.rect(1, 5, 4, 14, wall);
  g.rect(17, 5, 4, 14, wall);
  g.vline(4, 5, 18, wallShade);
  g.vline(20, 5, 18, wallShade);
  for (let x = 1; x <= 4; x += 2) g.rect(x, 3, 1, 2, wall);
  for (let x = 17; x <= 20; x += 2) g.rect(x, 3, 1, 2, wall);
  // 중앙 성문
  g.rect(9, 12, 4, 7, gate);
  g.rect(9, 12, 4, 1, 0x241a0e);
  g.disc(11, 12, 2, gate);
  // 돌 이음새
  g.set(7, 13, wallShade);
  g.set(14, 15, wallShade);
  g.set(5, 16, wallShade);
  const out = g.outlined(0x2a2018);
  blit(scene, key, g, out, 3);
}

// 노드 소유 깃발 (성 위에 꽂히는 작은 삼각기). color = 진영 색.
export function genNodeFlag(scene: Phaser.Scene, key: string, color: number) {
  if (scene.textures.exists(key)) return;
  const g = new Grid(12, 16);
  g.vline(2, 0, 15, 0x3a2a12); // 깃대
  for (let y = 1; y <= 6; y++) {
    const ww = 8 - y;
    if (ww >= 1) g.rect(3, y, ww, 1, color);
  }
  g.set(4, 3, 0xffffff); // 문양
  const out = g.outlined(0x101010);
  blit(scene, key, g, out, 3);
}

// 공용 blit: outline 버퍼를 확대 텍스처로
function blit(scene: Phaser.Scene, key: string, g: Grid, buf: (number | null)[], scale: number) {
  const canvas = document.createElement('canvas');
  canvas.width = g.w * scale;
  canvas.height = g.h * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const c = buf[y * g.w + x];
      if (c === null) continue;
      ctx.fillStyle = hex(c);
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  scene.textures.addCanvas(key, canvas);
}

// ============================================================
// 밸런스 수치 모음 (한 곳에서 관리)
// 야전 1판 — 밀집 난전 전투
// ============================================================

// 손으로 설계한 평원 전장 크기
export const WORLD = {
  width: 1600,
  height: 1200
};

export const GAME = {
  width: 1280,
  height: 720
};

// 진영 색 팔레트 (픽셀아트 v2 팔레트는 spriteGen 내부 상수와 연동)
export const PALETTE = {
  ally: {
    body: 0x3b6ef0,
    bodyDark: 0x2647a8,
    skin: 0xf0c8a0,
    weapon: 0xdfe6f0,
    flag: 0x3b6ef0
  },
  enemy: {
    body: 0x4a9a3a,
    bodyDark: 0x2f6a24,
    skin: 0x6aa84a,
    weapon: 0xcfc0a0,
    flag: 0x4a9a3a
  },
  hero: {
    body: 0xffd23b,
    bodyDark: 0xc79a12,
    skin: 0xf0c8a0,
    weapon: 0xffffff,
    flag: 0xffd23b
  },
  oni: {
    body: 0xd23b3b,
    bodyDark: 0x8a1f1f,
    skin: 0xe06a3a,
    weapon: 0xffe070,
    flag: 0xd23b3b
  }
};

export const HERO = {
  hp: 320,
  speed: 190,
  attackRange: 40,
  attackDamage: 26,
  attackCooldown: 480, // ms
  knockback: 5,
  skillRadius: 130,
  skillDamage: 60,
  skillCooldown: 5000 // ms
};

export const SOLDIER = {
  // 검병
  melee: {
    hp: 70,
    speed: 88,
    detectRange: 300,
    attackRange: 30,
    attackDamage: 13,
    attackCooldown: 720,
    knockback: 3
  },
  // 궁병
  ranged: {
    hp: 48,
    speed: 84,
    detectRange: 320,
    attackRange: 250,
    keepDist: 150, // 이 거리보다 적이 가까우면 후퇴
    attackDamage: 11,
    attackCooldown: 1150,
    projectileSpeed: 430,
    knockback: 0
  },
  // 창병 (긴 사거리 근접, 높은 HP)
  spear: {
    hp: 90,
    speed: 82,
    detectRange: 300,
    attackRange: 44,
    attackDamage: 16,
    attackCooldown: 900,
    knockback: 4
  }
};

export const MONSTER = {
  goblin: {
    hp: 46,
    speed: 90,
    detectRange: 300,
    attackRange: 30,
    attackDamage: 10,
    attackCooldown: 780,
    knockback: 3
  },
  goblinArcher: {
    hp: 38,
    speed: 86,
    detectRange: 320,
    attackRange: 240,
    keepDist: 145,
    attackDamage: 9,
    attackCooldown: 1200,
    projectileSpeed: 410,
    knockback: 0
  },
  oni: {
    hp: 180,
    speed: 66,
    detectRange: 280,
    attackRange: 46,
    attackDamage: 26,
    attackCooldown: 1150,
    knockback: 6
  }
};

// 유닛 병종 식별자
export type UnitType = 'hero' | 'melee' | 'ranged' | 'spear' | 'goblin' | 'goblinArcher' | 'oni';

// 부대(squad): 원작의 병력 단위. 1부대 ≈ 20명.
// 전략층(예정)에서 거점 이동의 "이동 단위"가 되므로 배열로 명확히 모델링.
export interface SquadDef {
  id: number;
  name: string; // 하단 정보창/배너 표기
  faction: 'ally' | 'enemy';
  tint: number; // 소속 구분용 미세 색조 (0xffffff = 원색)
  banner: number; // 부대 배너 색
  composition: { type: UnitType; count: number }[];
}

// 이번 전투 편성: 아군 2개 부대(42) vs 적 2개 무리(45) = 87
export const SQUADS: SquadDef[] = [
  {
    id: 0,
    name: '1부대',
    faction: 'ally',
    tint: 0xffffff,
    banner: 0x3b6ef0,
    composition: [
      { type: 'hero', count: 1 },
      { type: 'melee', count: 12 },
      { type: 'ranged', count: 5 },
      { type: 'spear', count: 3 }
    ]
  },
  {
    id: 1,
    name: '2부대',
    faction: 'ally',
    tint: 0xc6dcff,
    banner: 0x6aa0ff,
    composition: [
      { type: 'melee', count: 13 },
      { type: 'ranged', count: 6 },
      { type: 'spear', count: 2 }
    ]
  },
  {
    id: 2,
    name: '무리 A',
    faction: 'enemy',
    tint: 0xffffff,
    banner: 0xd23b3b,
    composition: [
      { type: 'goblin', count: 17 },
      { type: 'goblinArcher', count: 6 }
    ]
  },
  {
    id: 3,
    name: '무리 B',
    faction: 'enemy',
    tint: 0xffd8c6,
    banner: 0xe0803b,
    composition: [
      { type: 'goblin', count: 16 },
      { type: 'oni', count: 6 }
    ]
  }
];

// 대형 & 진군
export const FORMATION = {
  cols: 4, // 밀집 대형 열 수(세로 방향으로 쌓는 줄)
  colSpacing: 32, // 전후(x) 간격 — 진군 방향
  rowSpacing: 28, // 좌우(y) 간격
  allyLineX: 340, // 아군 최전선 x
  enemyLineX: 1260, // 적 최전선 x
  squadGap: 70, // 부대 블록 사이 세로 간격
  jitter: 5, // 대형 위치 랜덤 흔들림
  marchStartDelay: 2000, // 개전 후 진군 시작까지 ms
  marchSpeed: 72 // 진군 속도(교전 전)
};

// 밀집 난전: 유닛 간 분리(separation) 스티어링
export const CROWD = {
  separationRadius: 26, // 이 반경 내 다른 유닛과 밀어냄
  separationForce: 165, // 밀어내는 최대 속도 성분
  gridCellSize: 48 // separation 근접 탐색 그리드 셀 크기
};

// 대미지 숫자 / 이펙트
export const FX = {
  damageNumberLifespan: 650, // ms
  damageNumberRise: 22, // px 상승
  corpseLifespan: 2600, // 시체 표시 시간 ms
  corpseFade: 700, // 페이드 시간 ms
  sparkLifespan: 220
};

// 패주/패배 임계
export const OUTCOME = {
  routRatio: 0.1 // 아군 생존 비율 이 이하 시 패주 → 패배
};

// 유닛 전환(빙의) / 정보창 선택: 탭 판정 수치
export const TAP = {
  maxDurationMs: 250, // 터치 시작~종료 이 시간 이내여야 탭
  maxMoveDist: 12, // 화면 픽셀 이동량이 이 값 미만이어야 탭
  pickRadius: 40 // 탭 지점(월드 좌표) 기준 유닛 선택 히트 반경
};

// AI 틱 분산: 유닛 AI를 프레임마다 전부 돌리지 않고 N개 그룹으로 나눠 처리
export const AI = {
  tickGroups: 3, // 프레임을 N그룹으로 스태거
  gridCellSize: 200 // 타겟 탐색 그리드 셀 크기
};

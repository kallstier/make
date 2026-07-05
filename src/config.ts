// ============================================================
// 밸런스 수치 모음 (한 곳에서 관리)
// ============================================================

export const WORLD = {
  width: 2400,
  height: 1600
};

export const GAME = {
  width: 1280,
  height: 720
};

// 진영 색 팔레트
export const PALETTE = {
  ally: {
    body: 0x3b6ef0,
    bodyDark: 0x2647a8,
    skin: 0xf0c8a0,
    weapon: 0xdfe6f0,
    flag: 0x3b6ef0
  },
  enemy: {
    body: 0xd23b3b,
    bodyDark: 0x8a1f1f,
    skin: 0xc89060,
    weapon: 0xf0d0d0,
    flag: 0xd23b3b
  },
  hero: {
    body: 0xffd23b,
    bodyDark: 0xc79a12,
    skin: 0xf0c8a0,
    weapon: 0xffffff,
    flag: 0xffd23b
  },
  oni: {
    body: 0x8a3bd2,
    bodyDark: 0x561f8a,
    skin: 0xb090d0,
    weapon: 0xe0d0f0,
    flag: 0x8a3bd2
  }
};

export const HERO = {
  hp: 300,
  speed: 200,
  attackRange: 46,
  attackDamage: 22,
  attackCooldown: 500, // ms
  skillRadius: 120,
  skillDamage: 60,
  skillCooldown: 5000 // ms
};

export const SOLDIER = {
  hp: 60,
  speed: 150,
  detectRange: 260,
  followRadius: 140,
  maxDistFromHero: 400,
  retreatHpRatio: 0.3,
  // 검병
  melee: {
    attackRange: 40,
    attackDamage: 12,
    attackCooldown: 700
  },
  // 궁병
  ranged: {
    attackRange: 240,
    attackDamage: 10,
    attackCooldown: 1100,
    projectileSpeed: 420
  }
};

export const MONSTER = {
  goblin: {
    hp: 45,
    speed: 110,
    detectRange: 240,
    attackRange: 38,
    attackDamage: 9,
    attackCooldown: 800
  },
  oni: {
    hp: 160,
    speed: 70,
    detectRange: 220,
    attackRange: 46,
    attackDamage: 24,
    attackCooldown: 1200
  }
};

export const STRONGHOLD = {
  radius: 130,        // 점령/영향 반경
  captureTime: 5000,  // ms, 게이지 참 시간
  garrisonRespawn: 6000, // 적 거점 수비 리스폰 간격 ms
  garrisonMax: 6,     // 적 거점 최대 수비 병력
  raidInterval: 12000, // 습격대 파견 간격 ms
  raidMin: 4,
  raidMax: 6,
  captureReinforce: 5 // 점령 시 증원 아군 수
};

export const START_ALLY_SOLDIERS = 30;

// 유닛 전환(빙의) 조작: 탭 판정 수치
export const TAP = {
  maxDurationMs: 250, // 터치 시작~종료 이 시간 이내여야 탭
  maxMoveDist: 12,    // 화면 픽셀 이동량이 이 값 미만이어야 탭
  pickRadius: 36      // 탭 지점(월드 좌표) 기준 아군 유닛 선택 히트 반경
};

// AI 틱 분산: 유닛 AI를 프레임마다 전부 돌리지 않고 N개 그룹으로 나눠 처리
export const AI = {
  tickGroups: 4,       // 프레임을 4그룹으로 스태거
  gridCellSize: 200    // 타겟 탐색 그리드 셀 크기
};

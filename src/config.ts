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
  // 산적 (인간형, 도끼) — 고블린보다 단단하고 한 방이 무거움
  bandit: {
    hp: 64,
    speed: 84,
    detectRange: 300,
    attackRange: 32,
    attackDamage: 16,
    attackCooldown: 840,
    knockback: 4
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
  },
  // 보스: 무리 A 대장 (고블린 킹) — 거대한 몽둥이, 높은 HP/공격력
  goblinKing: {
    hp: 440,
    speed: 70,
    detectRange: 340,
    attackRange: 44,
    attackDamage: 32,
    attackCooldown: 950,
    knockback: 9
  },
  // 보스: 무리 B 대장 (오니 대장) — 기존 오니보다 크고 강함
  oniLord: {
    hp: 560,
    speed: 58,
    detectRange: 320,
    attackRange: 52,
    attackDamage: 40,
    attackCooldown: 1200,
    knockback: 12
  }
};

// 유닛 병종 식별자
export type UnitType =
  | 'hero'
  | 'melee'
  | 'ranged'
  | 'spear'
  | 'goblin'
  | 'goblinArcher'
  | 'bandit'
  | 'oni'
  | 'goblinKing'
  | 'oniLord';

// ============================================================
// RPG 스탯 층 (직업/레벨/장비 → 최종 스탯)
// 직업(class) = 병종(unitType) 기반 표시명. 전직은 이번 스코프 밖(구조만 마련).
// ============================================================

// 직업 표시명 (하단 정보창/이름표). BattleScene의 TYPE_NAME과 공유.
export const CLASS_NAME: Record<UnitType, string> = {
  hero: '영웅',
  melee: '검병',
  ranged: '궁병',
  spear: '창병',
  goblin: '고블린',
  goblinArcher: '고블린 궁수',
  bandit: '산적',
  oni: '오니',
  goblinKing: '고블린 킹',
  oniLord: '오니 대장'
};

// 스탯 성분: 공격력/방어력/최대HP/최대MP/이동속도
export interface StatBase {
  hp: number;
  mp: number;
  atk: number;
  def: number;
  speed: number;
}

// 직업별 기본 스탯 (레벨1, 장비 미착용). 최종 = base + 레벨성장 + 장비보정.
export const CLASS_STATS: Record<UnitType, StatBase> = {
  hero: { hp: 250, mp: 60, atk: 22, def: 3, speed: 190 },
  melee: { hp: 52, mp: 10, atk: 10, def: 2, speed: 88 },
  ranged: { hp: 36, mp: 20, atk: 9, def: 1, speed: 84 },
  spear: { hp: 68, mp: 10, atk: 13, def: 2, speed: 82 },
  goblin: { hp: 50, mp: 0, atk: 14, def: 1, speed: 90 },
  goblinArcher: { hp: 36, mp: 0, atk: 12, def: 0, speed: 86 },
  bandit: { hp: 66, mp: 0, atk: 17, def: 2, speed: 84 },
  oni: { hp: 185, mp: 0, atk: 24, def: 3, speed: 66 },
  goblinKing: { hp: 430, mp: 0, atk: 30, def: 5, speed: 70 },
  oniLord: { hp: 540, mp: 0, atk: 36, def: 7, speed: 58 }
};

// 레벨업 시 (레벨-1)배 적용되는 성장치. 적(고정 레벨)은 0.
export const LEVEL_GROWTH: Record<UnitType, StatBase> = {
  hero: { hp: 22, mp: 8, atk: 3, def: 1, speed: 0 },
  melee: { hp: 8, mp: 2, atk: 2, def: 1, speed: 0 },
  ranged: { hp: 6, mp: 3, atk: 2, def: 0, speed: 0 },
  spear: { hp: 9, mp: 2, atk: 2, def: 1, speed: 0 },
  goblin: { hp: 0, mp: 0, atk: 0, def: 0, speed: 0 },
  goblinArcher: { hp: 0, mp: 0, atk: 0, def: 0, speed: 0 },
  bandit: { hp: 0, mp: 0, atk: 0, def: 0, speed: 0 },
  oni: { hp: 0, mp: 0, atk: 0, def: 0, speed: 0 },
  goblinKing: { hp: 0, mp: 0, atk: 0, def: 0, speed: 0 },
  oniLord: { hp: 0, mp: 0, atk: 0, def: 0, speed: 0 }
};

// 레벨 L→L+1 에 필요한 누적 EXP (index 0 = 1→2). 마지막 값 이후로는 성장 정지.
export const EXP_TABLE = [12, 28, 50, 80];
export const MAX_LEVEL = EXP_TABLE.length + 1; // 5

// 처치 대상 병종별 EXP 보상 (처치자에게 지급, 아군만 레벨업)
export const EXP_REWARD: Record<UnitType, number> = {
  hero: 5,
  melee: 5,
  ranged: 5,
  spear: 5,
  goblin: 8,
  goblinArcher: 8,
  bandit: 12,
  oni: 20,
  goblinKing: 120,
  oniLord: 160
};

// 피해 계산: dmg = max(1, atk - def * DAMAGE.defFactor)
export const DAMAGE = {
  defFactor: 0.5
};

// 레벨업 회복 비율 (최대치 대비)
export const LEVELUP = {
  hpHealRatio: 0.4,
  mpHealRatio: 0.5
};

// 하이브리드 조작: 입력이 끝난 뒤 이 시간(ms)만큼 수동 유지 후 AI 이동 재개
export const CONTROL = {
  manualGraceMs: 500
};

// 영웅 액티브 스킬(일섬) MP 소모
export const SKILL = {
  ilseomMpCost: 30
};

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

// 이번 전투 편성: 아군 2개 부대(42) vs 적 2개 무리(보스 포함 47) = 89
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
      { type: 'goblinKing', count: 1 },
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
      { type: 'oniLord', count: 1 },
      { type: 'goblin', count: 16 },
      { type: 'oni', count: 6 }
    ]
  }
];

// 어느 병종이 무리의 보스인지 (하단 정보창 강조/보스 마크/투항 유발)
export const BOSS_TYPES: UnitType[] = ['goblinKing', 'oniLord'];

// ============================================================
// 부대 전술 명령 (원작 부대 지휘 참고 확장)
// 돌격(공격) / 정지(대기) / 이동(집결) / 후퇴 / 탈출
// ============================================================
export type SquadOrder = 'charge' | 'hold' | 'move' | 'retreat' | 'escape';

export const ORDER_NAME: Record<SquadOrder, string> = {
  charge: '돌격',
  hold: '정지',
  move: '이동',
  retreat: '후퇴',
  escape: '탈출'
};

// 명령 버튼 표시 순서 (모바일/데스크톱 공통)
export const ORDER_LIST: SquadOrder[] = ['charge', 'hold', 'move', 'retreat', 'escape'];

// 데스크톱 단축키: Z/X/C/V/B = 돌격/정지/이동/후퇴/탈출 (WASD 이동과 겹치지 않게)
export const ORDER_KEYS: Record<string, SquadOrder> = {
  Z: 'charge',
  X: 'hold',
  C: 'move',
  V: 'retreat',
  B: 'escape'
};

export const TACTICS = {
  arriveDist: 42, // 이동 명령 도착 판정 반경
  arriveSquadDist: 90, // 부대 중심이 목표에 이만큼 접근하면 "도착"으로 보고 정지 전환
  retreatX: 220, // 후퇴 시 물러나 멈추는 아군측 x 라인
  escapeEdgeX: 40, // 탈출: 이 x 이하 도달 시 전장에서 이탈(제거)
  escapeReactRange: 0 // 탈출 중에는 교전하지 않음
};

// ============================================================
// 투항 시스템 (원작 특징: 열세에 몰린 적병이 항복 → 아군 편입)
// ============================================================
export const SURRENDER = {
  hpThreshold: 0.3, // 자기 HP 비율 이 미만
  factionRatioThreshold: 0.5, // 자기 진영 잔존율 이 미만
  baseChancePerTick: 0.003, // 상시 AI 틱당 투항 확률
  bossDeathInstant: 0.4, // 보스 사망 시 즉시 1회 판정 확률
  bossDeathMultiplier: 10, // 보스 사망 이후 상시 확률 배수
  poseMs: 1000, // 백기 → 아군 전환까지 무기 내려놓는 정지 시간
  convertTint: 0x6a9cff // 투항병 재틴트 (파랑 계열)
};

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

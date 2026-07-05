// ============================================================
// 전략층 상태 (GameState)
// 거점 노드맵 소유/수비, 아군 부대 명단(유닛별 HP/MP/LV/EXP/투항 여부).
// 전투 결과(BattleResult)를 소비해 갱신한다. 세이브는 스코프 밖이지만
// 전부 직렬화 가능한 평범한 데이터 구조 + 순수 함수로 다룬다.
// BattleScene 은 여기서 만든 BattleSetup 을 받아 스폰하고, 결과를
// applyBattleResult 로 되돌린다.
// ============================================================
import type { UnitType } from '../config';
import { CLASS_NAME, BOSS_TYPES } from '../config';
import { makeEquipment } from '../rpg/items';
import { computeStats } from '../rpg/stats';

// ---------- 데이터 구조 ----------
export interface UnitState {
  uid: number; // 부대 내 안정 식별자 (전투 결과 매핑용)
  unitType: UnitType;
  level: number;
  exp: number;
  hp: number; // 현재 HP (거점 간 이월)
  mp: number;
  surrendered: boolean; // 투항 편입병
  isHero: boolean;
  label: string;
}

export interface SquadState {
  id: number;
  name: string;
  banner: number;
  tint: number;
  location: string; // 현재 위치한 노드 id
  units: UnitState[];
}

export interface GarrisonGroup {
  type: UnitType;
  count: number;
}

export interface NodeState {
  id: string;
  name: string;
  x: number;
  y: number;
  owner: 'ally' | 'monster';
  neighbors: string[];
  garrison: GarrisonGroup[];
  enemySquadId: number; // 이 수비대의 배틀/텍스처 부대 id
  enemyBanner: number;
  enemyTint: number;
}

// 이번 턴에 판정할 공격 (한 노드로 향한 아군 부대들의 합동 전투)
export interface PendingAttack {
  targetNodeId: string;
  squadIds: number[];
}

export interface StrategyState {
  turn: number;
  nodes: NodeState[];
  squads: SquadState[];
  reservedMoves: Record<number, string>; // squadId -> 목표 노드 id (이번 턴 예약)
  pendingAttacks: PendingAttack[];
  battleCount: number;
  wins: number;
  losses: number;
  escapes: number;
  gameOver: boolean;
  victory: boolean;
}

// ---------- 전투 입출력 (BattleScene 공유 타입) ----------
export interface BattleUnitInput {
  stateUid: number | null; // null = 신규(적 투항 편입 예정 자리 없음 — 아군 전용)
  unitType: UnitType;
  level: number;
  exp: number;
  hp: number; // <0 = 최대치로 스폰 (적 수비대)
  mp: number; // <0 = 최대치
  surrendered: boolean;
  isHero: boolean;
  label: string;
}

export interface BattleSquadInput {
  id: number;
  name: string;
  faction: 'ally' | 'enemy';
  tint: number;
  banner: number;
  units: BattleUnitInput[];
}

export interface BattleSetup {
  fromStrategy: boolean;
  targetNodeId: string;
  nodeName: string;
  allySquadIds: number[];
  allySquads: BattleSquadInput[];
  enemySquads: BattleSquadInput[];
}

// 전투 종료 시 살아남은 아군 유닛 (win = 잔존, escape = 탈출자)
export interface BattleSurvivor {
  stateUid: number | null; // null = 신규 투항 편입병
  squadId: number;
  unitType: UnitType;
  level: number;
  exp: number;
  hp: number;
  mp: number;
  surrendered: boolean;
  isHero: boolean;
  label: string;
}

// ---------- 모듈 싱글턴 ----------
let _uid = 1;
function nextUid(): number {
  return _uid++;
}

let _state: StrategyState;

export function getState(): StrategyState {
  if (!_state) initGameState();
  return _state;
}

// ---------- 유닛 파생 스탯 ----------
export function unitMaxHp(u: UnitState): number {
  return computeStats(u.unitType, u.level, makeEquipment(u.unitType)).maxHp;
}
export function unitMaxMp(u: UnitState): number {
  return computeStats(u.unitType, u.level, makeEquipment(u.unitType)).maxMp;
}

function makeUnit(type: UnitType, squadName: string, idx: number, isHero = false): UnitState {
  const u: UnitState = {
    uid: nextUid(),
    unitType: type,
    level: 1,
    exp: 0,
    hp: 0,
    mp: 0,
    surrendered: false,
    isHero,
    label: isHero ? `${squadName} 영웅` : `${squadName} ${CLASS_NAME[type]} #${idx}`
  };
  u.hp = unitMaxHp(u);
  u.mp = unitMaxMp(u);
  return u;
}

// ---------- 초기 상태 구성 ----------
// 거점 10개 (동아시아 퓨전). 좌표는 수동 배치. 한양이 플레이어 시작 수도.
interface NodeSeed {
  id: string;
  name: string;
  x: number;
  y: number;
  neighbors: string[];
  garrison: GarrisonGroup[];
  enemyTint: number;
  enemyBanner: number;
}

const ALLY_BANNER_1 = 0x3b6ef0;
const ALLY_BANNER_2 = 0x6aa0ff;
const G_GOB = 0x4a9a3a; // 고블린 계열 깃발
const G_BANDIT = 0x8a5a2a; // 산적 계열
const G_ONI = 0xd23b3b; // 오니 계열

const NODE_SEEDS: NodeSeed[] = [
  {
    id: 'hanyang',
    name: '한양',
    x: 980,
    y: 640,
    neighbors: ['gaegyeong', 'jeonju', 'busan'],
    garrison: [],
    enemyTint: 0xffffff,
    enemyBanner: G_GOB
  },
  {
    id: 'busan',
    name: '부산',
    x: 1090,
    y: 830,
    neighbors: ['hanyang', 'jeonju'],
    garrison: [
      { type: 'bandit', count: 4 },
      { type: 'goblin', count: 3 }
    ],
    enemyTint: 0xffffff,
    enemyBanner: G_BANDIT
  },
  {
    id: 'jeonju',
    name: '전주',
    x: 900,
    y: 790,
    neighbors: ['hanyang', 'busan', 'shanghai'],
    garrison: [
      { type: 'goblin', count: 5 },
      { type: 'goblinArcher', count: 3 }
    ],
    enemyTint: 0xffffff,
    enemyBanner: G_GOB
  },
  {
    id: 'gaegyeong',
    name: '개경',
    x: 950,
    y: 520,
    neighbors: ['hanyang', 'pyongyang', 'shanghai'],
    garrison: [
      { type: 'bandit', count: 5 },
      { type: 'goblin', count: 4 },
      { type: 'goblinArcher', count: 2 }
    ],
    enemyTint: 0xffffff,
    enemyBanner: G_BANDIT
  },
  {
    id: 'shanghai',
    name: '상하이',
    x: 560,
    y: 730,
    neighbors: ['gaegyeong', 'jeonju', 'chengdu'],
    garrison: [
      { type: 'goblin', count: 6 },
      { type: 'goblinArcher', count: 4 },
      { type: 'oni', count: 1 }
    ],
    enemyTint: 0xffffff,
    enemyBanner: G_GOB
  },
  {
    id: 'pyongyang',
    name: '평양',
    x: 860,
    y: 400,
    neighbors: ['gaegyeong', 'uiju', 'shenyang'],
    garrison: [
      { type: 'bandit', count: 6 },
      { type: 'goblin', count: 5 },
      { type: 'oni', count: 2 }
    ],
    enemyTint: 0xffffff,
    enemyBanner: G_BANDIT
  },
  {
    id: 'uiju',
    name: '의주',
    x: 760,
    y: 290,
    neighbors: ['pyongyang', 'shenyang', 'beijing'],
    garrison: [
      { type: 'goblin', count: 8 },
      { type: 'goblinArcher', count: 4 },
      { type: 'oni', count: 2 }
    ],
    enemyTint: 0xffffff,
    enemyBanner: G_GOB
  },
  {
    id: 'shenyang',
    name: '심양',
    x: 610,
    y: 250,
    neighbors: ['pyongyang', 'uiju', 'beijing'],
    garrison: [
      { type: 'bandit', count: 8 },
      { type: 'goblinArcher', count: 4 },
      { type: 'oni', count: 3 }
    ],
    enemyTint: 0xffffff,
    enemyBanner: G_BANDIT
  },
  {
    id: 'beijing',
    name: '베이징',
    x: 410,
    y: 360,
    neighbors: ['shenyang', 'uiju', 'chengdu'],
    garrison: [
      { type: 'goblinKing', count: 1 },
      { type: 'goblin', count: 10 },
      { type: 'goblinArcher', count: 5 }
    ],
    enemyTint: 0xffffff,
    enemyBanner: G_GOB
  },
  {
    id: 'chengdu',
    name: '청두',
    x: 190,
    y: 560,
    neighbors: ['beijing', 'shanghai'],
    garrison: [
      { type: 'oniLord', count: 1 },
      { type: 'oni', count: 4 },
      { type: 'bandit', count: 8 }
    ],
    enemyTint: 0xffd8c6,
    enemyBanner: G_ONI
  }
];

export function initGameState(): StrategyState {
  _uid = 1;
  const nodes: NodeState[] = NODE_SEEDS.map((s, i) => ({
    id: s.id,
    name: s.name,
    x: s.x,
    y: s.y,
    owner: s.id === 'hanyang' ? 'ally' : 'monster',
    neighbors: s.neighbors.slice(),
    garrison: s.garrison.map((g) => ({ ...g })),
    enemySquadId: 100 + i,
    enemyBanner: s.enemyBanner,
    enemyTint: s.enemyTint
  }));

  // 인접 대칭 보정
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) {
    for (const nb of n.neighbors) {
      const other = byId.get(nb);
      if (other && !other.neighbors.includes(n.id)) other.neighbors.push(n.id);
    }
  }

  // 아군 부대 2개 (1부대: 영웅 포함, 2부대). 한양 시작.
  const sq0Units: UnitState[] = [makeUnit('hero', '1부대', 1, true)];
  const push = (arr: UnitState[], name: string, type: UnitType, n: number) => {
    for (let k = 1; k <= n; k++) arr.push(makeUnit(type, name, k));
  };
  push(sq0Units, '1부대', 'melee', 12);
  push(sq0Units, '1부대', 'ranged', 5);
  push(sq0Units, '1부대', 'spear', 3);

  const sq1Units: UnitState[] = [];
  push(sq1Units, '2부대', 'melee', 13);
  push(sq1Units, '2부대', 'ranged', 6);
  push(sq1Units, '2부대', 'spear', 2);

  const squads: SquadState[] = [
    { id: 0, name: '1부대', banner: ALLY_BANNER_1, tint: 0xffffff, location: 'hanyang', units: sq0Units },
    { id: 1, name: '2부대', banner: ALLY_BANNER_2, tint: 0xc6dcff, location: 'hanyang', units: sq1Units }
  ];

  _state = {
    turn: 1,
    nodes,
    squads,
    reservedMoves: {},
    pendingAttacks: [],
    battleCount: 0,
    wins: 0,
    losses: 0,
    escapes: 0,
    gameOver: false,
    victory: false
  };
  return _state;
}

// ---------- 조회 헬퍼 ----------
export function getNode(id: string): NodeState | undefined {
  return getState().nodes.find((n) => n.id === id);
}
export function getSquad(id: number): SquadState | undefined {
  return getState().squads.find((s) => s.id === id);
}
export function squadsAt(nodeId: string): SquadState[] {
  return getState().squads.filter((s) => s.location === nodeId);
}
export function areAdjacent(a: string, b: string): boolean {
  const n = getNode(a);
  return !!n && n.neighbors.includes(b);
}

// 수비 규모 대략 표기 (정보 카드)
export function garrisonTotal(node: NodeState): number {
  return node.garrison.reduce((a, g) => a + g.count, 0);
}
export function garrisonEstimate(node: NodeState): string {
  const total = garrisonTotal(node);
  if (total === 0) return '무방비';
  const hasBoss = node.garrison.some((g) => BOSS_TYPES.includes(g.type));
  // 대표 병종 (가장 많은 수)
  let dom = node.garrison[0];
  for (const g of node.garrison) if (g.count > dom.count) dom = g;
  const size = total >= 14 ? '대군' : total >= 7 ? '무리' : '소수';
  const bossTag = hasBoss ? ' · 보스' : '';
  return `${CLASS_NAME[dom.type]} ${size}${bossTag} (약 ${total})`;
}
// 지도 아이콘용 대표 병종
export function garrisonIconType(node: NodeState): UnitType | null {
  if (node.garrison.length === 0) return null;
  const boss = node.garrison.find((g) => BOSS_TYPES.includes(g.type));
  if (boss) return boss.type;
  let dom = node.garrison[0];
  for (const g of node.garrison) if (g.count > dom.count) dom = g;
  return dom.type;
}

export function squadAvgLevel(sq: SquadState): number {
  if (sq.units.length === 0) return 0;
  return sq.units.reduce((a, u) => a + u.level, 0) / sq.units.length;
}
export function squadHasHero(sq: SquadState): boolean {
  return sq.units.some((u) => u.isHero);
}

// ---------- 전투 셋업 생성 ----------
function garrisonExpanded(node: NodeState): UnitType[] {
  const out: UnitType[] = [];
  for (const g of node.garrison) for (let k = 0; k < g.count; k++) out.push(g.type);
  return out;
}

function squadToInput(sq: SquadState): BattleSquadInput {
  return {
    id: sq.id,
    name: sq.name,
    faction: 'ally',
    tint: sq.tint,
    banner: sq.banner,
    units: sq.units.map((u) => ({
      stateUid: u.uid,
      unitType: u.unitType,
      level: u.level,
      exp: u.exp,
      hp: u.hp,
      mp: u.mp,
      surrendered: u.surrendered,
      isHero: u.isHero,
      label: u.label
    }))
  };
}

function garrisonToInput(node: NodeState): BattleSquadInput {
  const types = garrisonExpanded(node);
  const counts = new Map<string, number>();
  return {
    id: node.enemySquadId,
    name: `${node.name} 수비대`,
    faction: 'enemy',
    tint: node.enemyTint,
    banner: node.enemyBanner,
    units: types.map((t) => {
      const idx = (counts.get(t) ?? 0) + 1;
      counts.set(t, idx);
      const boss = BOSS_TYPES.includes(t);
      return {
        stateUid: null,
        unitType: t,
        level: 1,
        exp: 0,
        hp: -1,
        mp: -1,
        surrendered: false,
        isHero: false,
        label: boss ? `【보스】 ${CLASS_NAME[t]}` : `${node.name} ${CLASS_NAME[t]} #${idx}`
      };
    })
  };
}

export function buildBattleSetup(targetNodeId: string, squadIds: number[]): BattleSetup {
  const node = getNode(targetNodeId)!;
  const allySquads = squadIds
    .map((id) => getSquad(id))
    .filter((s): s is SquadState => !!s)
    .map(squadToInput);
  return {
    fromStrategy: true,
    targetNodeId,
    nodeName: node.name,
    allySquadIds: squadIds.slice(),
    allySquads,
    enemySquads: [garrisonToInput(node)]
  };
}

// ---------- 턴 진행 ----------
// 아군 소유 노드에 주둔(비이동)한 부대: HP 30% / MP 50% 회복
export function healSquadOnFriendlyNode(sq: SquadState) {
  for (const u of sq.units) {
    const mx = unitMaxHp(u);
    const mm = unitMaxMp(u);
    u.hp = Math.min(mx, u.hp + mx * 0.3);
    u.mp = Math.min(mm, u.mp + mm * 0.5);
  }
}

// ---------- 전투 결과 반영 ----------
function survivorToUnit(su: BattleSurvivor): UnitState {
  return {
    uid: su.stateUid ?? nextUid(),
    unitType: su.unitType,
    level: su.level,
    exp: su.exp,
    hp: su.hp,
    mp: su.mp,
    surrendered: su.surrendered,
    isHero: su.isHero,
    label: su.label
  };
}

export interface BattleResultLike {
  outcome: 'win' | 'lose' | 'escape';
  heroDied: boolean;
  survivorUnits: BattleSurvivor[];
  enemyRemaining: { unitType: UnitType }[];
}

// setup 의 참전 부대/대상 노드 기준으로 상태를 갱신한다.
export function applyBattleResult(setup: BattleSetup, result: BattleResultLike) {
  const st = getState();
  st.battleCount++;
  const node = getNode(setup.targetNodeId);
  if (!node) return;

  const bySquad = new Map<number, BattleSurvivor[]>();
  for (const su of result.survivorUnits) {
    if (!bySquad.has(su.squadId)) bySquad.set(su.squadId, []);
    bySquad.get(su.squadId)!.push(su);
  }

  if (result.outcome === 'win') {
    st.wins++;
    for (const id of setup.allySquadIds) {
      const sq = getSquad(id);
      if (!sq) continue;
      sq.units = (bySquad.get(id) ?? []).map(survivorToUnit);
      sq.location = node.id; // 점령 → 입성
    }
    // 신규 투항 편입병(원 부대가 소멸했을 가능성 대비): 참전 부대 중 남은 곳에 붙임
    attachOrphanSurvivors(setup, bySquad);
    node.owner = 'ally';
    node.garrison = [];
    pruneEmptySquads(setup);
  } else {
    // escape / lose: 노드 미점령, 수비 잔존 상태 갱신
    if (result.outcome === 'escape') st.escapes++;
    else st.losses++;
    if (result.heroDied) st.gameOver = true;
    for (const id of setup.allySquadIds) {
      const sq = getSquad(id);
      if (!sq) continue;
      sq.units = (bySquad.get(id) ?? []).map(survivorToUnit);
      // location 유지 = 출발 노드로 귀환
    }
    attachOrphanSurvivors(setup, bySquad);
    // 수비대 잔존 반영 (전사 수비병 제거)
    const counts = new Map<UnitType, number>();
    for (const e of result.enemyRemaining) counts.set(e.unitType, (counts.get(e.unitType) ?? 0) + 1);
    node.garrison = Array.from(counts.entries()).map(([type, count]) => ({ type, count }));
    pruneEmptySquads(setup);
  }

  // 이 대상 노드의 pendingAttack 소거
  st.pendingAttacks = st.pendingAttacks.filter((p) => p.targetNodeId !== setup.targetNodeId);

  // 승리 판정: 전 노드 아군 소유
  if (st.nodes.every((n) => n.owner === 'ally')) st.victory = true;
}

// 참전 부대에 속하지 않은 squadId(예외적 투항 편입)의 생존자를 첫 참전 부대에 흡수
function attachOrphanSurvivors(setup: BattleSetup, bySquad: Map<number, BattleSurvivor[]>) {
  const known = new Set(setup.allySquadIds);
  for (const [sid, list] of bySquad) {
    if (known.has(sid)) continue;
    const host = setup.allySquadIds.map((id) => getSquad(id)).find((s) => s && s.units.length > 0);
    if (host) for (const su of list) host.units.push(survivorToUnit(su));
  }
}

function pruneEmptySquads(setup: BattleSetup) {
  const st = getState();
  for (const id of setup.allySquadIds) {
    const sq = getSquad(id);
    if (sq && sq.units.length === 0) {
      st.squads = st.squads.filter((s) => s.id !== id);
    }
  }
}

export function gameStateSummary() {
  const st = getState();
  return {
    turn: st.turn,
    battles: st.battleCount,
    wins: st.wins,
    losses: st.losses,
    escapes: st.escapes,
    gameOver: st.gameOver,
    victory: st.victory,
    allyNodes: st.nodes.filter((n) => n.owner === 'ally').map((n) => n.id),
    squads: st.squads.map((s) => ({
      id: s.id,
      name: s.name,
      location: s.location,
      units: s.units.length,
      avgLevel: Math.round(squadAvgLevel(s) * 10) / 10,
      hasHero: squadHasHero(s)
    }))
  };
}

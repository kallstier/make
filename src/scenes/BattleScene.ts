import Phaser from 'phaser';
import {
  WORLD,
  GAME,
  HERO,
  AI,
  TAP,
  CROWD,
  FX,
  FORMATION,
  OUTCOME,
  SQUADS,
  SKILL,
  CLASS_NAME,
  UnitType,
  SquadDef,
  SquadOrder,
  ORDER_KEYS,
  TACTICS,
  SURRENDER,
  BOSS_TYPES
} from '../config';
import { Unit, Faction, BattleContext } from '../units/Unit';
import { Hero } from '../units/Hero';
import { Soldier, SoldierKind } from '../units/Soldier';
import { Monster, MonsterKind } from '../units/Monster';
import { Projectile } from '../units/Projectile';
import { genBattlefield } from '../world/MapGen';
import { FloatingStick } from '../input/FloatingStick';
import { FRAME, genUnit, genBanner, UnitKind } from '../gen/spriteGen';
import { EQUIP_SLOTS, SLOT_ICON, SLOT_NAME, itemProc, EquipSlot } from '../rpg/items';
import { expForNext } from '../rpg/stats';
import {
  BattleSetup,
  BattleSquadInput,
  BattleUnitInput,
  BattleSurvivor,
  applyBattleResult
} from '../state/GameState';

export type GameState = 'playing' | 'win' | 'lose' | 'escape';

const TYPE_NAME = CLASS_NAME;

// 하단 정보창 장비 표시 항목
export interface InfoEquipSlot {
  slot: EquipSlot;
  slotName: string;
  iconKey: string;
  name: string; // 아이템 이름 또는 '-'
  filled: boolean;
  highlight: boolean;
}

// 전투 내부에서 쓰는 최소 부대 정의 (편성 데이터는 전략층 BattleSetup 에서 공급)
interface BattleSquadDef {
  id: number;
  name: string;
  faction: Faction;
  tint: number;
  banner: number;
}

interface SquadRuntime {
  def: BattleSquadDef;
  members: Unit[];
  banner: Phaser.GameObjects.Image;
  order: SquadOrder;
  movePoint: { x: number; y: number } | null;
  orderFlag: Phaser.GameObjects.Image; // '이동' 목표 깃발 (ally 전용)
  bossDead: boolean; // 이 무리의 보스가 죽었는지 (투항 확률 상승)
}

interface Spawn {
  input: BattleUnitInput;
  squadId: number;
  x: number;
  y: number;
}

export interface BattleResult {
  win: boolean;
  outcome: GameState; // 'win' | 'lose' | 'escape'
  allyDead: number;
  enemyDead: number;
  heroKills: number;
  playerKills: number;
  surrenderedGained: number; // 투항 영입 수
  escapees: BattleSurvivor[]; // 탈출 생존자 (귀환에 사용)
  heroDied: boolean; // 영웅 전사 (게임 오버 판정)
  survivorUnits: BattleSurvivor[]; // 전략층 반영용 생존 유닛 (win=잔존, escape=탈출)
  enemyRemaining: { unitType: UnitType }[]; // 수비대 잔존 (미점령 시 감소분 반영)
  // 부대별 생존 요약 (UI/이월)
  squadSurvivors: { squadId: number; name: string; alive: number; escaped: number }[];
}

export class BattleScene extends Phaser.Scene {
  private hero?: Hero; // 참전 부대에 영웅이 없을 수도 있으므로 옵셔널
  private setup!: BattleSetup;
  private fromStrategy = false;
  private allies: Unit[] = [];
  private enemies: Unit[] = [];
  private squads: SquadRuntime[] = [];

  private allyGroup!: Phaser.Physics.Arcade.Group;
  private enemyGroup!: Phaser.Physics.Arcade.Group;
  private projectiles: Projectile[] = [];

  private stick!: FloatingStick;
  private keys!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    space: Phaser.Input.Keyboard.Key;
    tab: Phaser.Input.Keyboard.Key;
  };
  private squadKeys!: {
    sel1: Phaser.Input.Keyboard.Key;
    sel2: Phaser.Input.Keyboard.Key;
    q: Phaser.Input.Keyboard.Key;
    w: Phaser.Input.Keyboard.Key;
    e: Phaser.Input.Keyboard.Key;
    r: Phaser.Input.Keyboard.Key;
    t: Phaser.Input.Keyboard.Key;
  };
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  // 빙의(조작) & 정보 선택
  private controlled!: Unit;
  private selected!: Unit; // 하단 정보창에 표시되는 유닛 (적 포함)
  private selectRing!: Phaser.GameObjects.Image;
  private targetRing!: Phaser.GameObjects.Image;
  private tapDownTime = 0;
  private tapDownX = 0;
  private tapDownY = 0;

  private frameCount = 0;
  private gameState: GameState = 'playing';
  private battleStartTime = 0;

  private allyGrid = new Map<number, Unit[]>();
  private enemyGrid = new Map<number, Unit[]>();
  private crowdGrid = new Map<number, Unit[]>();
  private hpGfx!: Phaser.GameObjects.Graphics;
  private allyCentroid: { x: number; y: number } | null = null;
  private enemyCentroid: { x: number; y: number } | null = null;

  private allyStart = 0;
  private enemyStart = 0;
  private allyDead = 0;
  private enemyDead = 0;
  private playerKills = 0;
  private result: BattleResult | null = null;

  // 부대 명령 UI 상태 (선택된 아군 부대 탭 / 이동 지점 지정 모드)
  private selectedSquadTab = 0; // ally 부대 인덱스 (0,1)
  private pendingMoveSquad: number | null = null; // '이동' 지점 탭 대기 중인 squadId

  // 투항/탈출 통계
  private surrenderedGained = 0;
  private escapees: BattleSurvivor[] = [];
  private heroEscaped = false;

  // 보스 머리 위 마크 / 투항 백기 (uid → 이미지)
  private bossMarks = new Map<number, Phaser.GameObjects.Image>();
  private surrenderFlags = new Map<number, Phaser.GameObjects.Image>();

  // FX 풀
  private dmgPool: Phaser.GameObjects.Text[] = [];
  private sparkPool: Phaser.GameObjects.Image[] = [];

  private ctx!: BattleContext;

  constructor() {
    super('BattleScene');
  }

  // 전략층에서 넘겨준 편성 데이터 수신 (없으면 config SQUADS 기반 단독 전투)
  init(data: { setup?: BattleSetup }) {
    this.setup = data && data.setup ? data.setup : this.defaultSetup();
    this.fromStrategy = !!(data && data.setup && data.setup.fromStrategy);
  }

  // 단독 실행/폴백용: config SQUADS 를 BattleSetup 으로 변환
  private defaultSetup(): BattleSetup {
    const toInput = (def: SquadDef): BattleSquadInput => {
      const units: BattleUnitInput[] = [];
      const counts: Record<string, number> = {};
      for (const c of def.composition) {
        for (let k = 0; k < c.count; k++) {
          counts[c.type] = (counts[c.type] ?? 0) + 1;
          units.push({
            stateUid: null,
            unitType: c.type,
            level: 1,
            exp: 0,
            hp: -1,
            mp: -1,
            surrendered: false,
            isHero: c.type === 'hero',
            label:
              c.type === 'hero'
                ? `${def.name} 영웅`
                : BOSS_TYPES.includes(c.type)
                ? `【보스】 ${CLASS_NAME[c.type]}`
                : `${def.name} ${CLASS_NAME[c.type]} #${counts[c.type]}`
          });
        }
      }
      return { id: def.id, name: def.name, faction: def.faction, tint: def.tint, banner: def.banner, units };
    };
    const ally = SQUADS.filter((s) => s.faction === 'ally').map(toInput);
    const enemy = SQUADS.filter((s) => s.faction === 'enemy').map(toInput);
    return {
      fromStrategy: false,
      targetNodeId: '',
      nodeName: '',
      allySquadIds: ally.map((s) => s.id),
      allySquads: ally,
      enemySquads: enemy
    };
  }

  create() {
    this.gameState = 'playing';
    this.frameCount = 0;
    this.allies = [];
    this.enemies = [];
    this.squads = [];
    this.projectiles = [];
    this.dmgPool = [];
    this.sparkPool = [];
    this.allyDead = 0;
    this.enemyDead = 0;
    this.playerKills = 0;
    this.result = null;
    this.selectedSquadTab = 0;
    this.pendingMoveSquad = null;
    this.surrenderedGained = 0;
    this.escapees = [];
    this.heroEscaped = false;
    this.bossMarks = new Map();
    this.surrenderFlags = new Map();
    this.battleStartTime = this.time.now;

    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.setBackgroundColor('#31502b'); // 개전 줌아웃 시 여백을 초원 톤으로

    // 전장 배경 + 데코
    const decos = genBattlefield(this);
    this.add.image(0, 0, 'battlefield').setOrigin(0, 0).setDepth(0);
    for (const d of decos) {
      const img = this.add.image(d.x, d.y, d.type);
      img.setOrigin(0.5, 0.85);
      img.setDepth(d.type === 'rock' || d.type === 'bush' ? 3 : 5 + (d.y % 3));
      // 나무/큰 데코는 y 기준 깊이 정렬 근사
      if (d.type === 'tree') img.setDepth(6);
    }

    this.allyGroup = this.physics.add.group();
    this.enemyGroup = this.physics.add.group();

    this.ctx = {
      time: 0,
      findNearestEnemy: (f, x, y, r) => this.findNearestEnemy(f, x, y, r),
      spawnProjectile: (x, y, t, dmg, f, s) => this.spawnProjectile(x, y, t, dmg, f, s),
      onUnitDied: (u, k) => this.onUnitDied(u, k),
      spawnCorpse: (u) => this.spawnCorpse(u),
      spawnDamageNumber: (x, y, a, f, color) => this.spawnDamageNumber(x, y, a, f, color),
      spawnSpark: (x, y) => this.spawnSpark(x, y),
      emitBlood: (x, y, c) => this.emitBlood(x, y, c),
      heroRef: () => (this.hero && this.hero.alive ? this.hero : null),
      controlledRef: () =>
        this.controlled && this.controlled.alive
          ? this.controlled
          : this.hero && this.hero.alive
          ? this.hero
          : null,
      combatActive: () => this.time.now - this.battleStartTime >= FORMATION.marchStartDelay,
      rallyPoint: (f) => (f === 'ally' ? this.enemyCentroid : this.allyCentroid),
      explodeAt: (x, y, r, dmg, f, atk) => this.explodeAt(x, y, r, dmg, f, atk),
      applyStun: (t, ms) => this.applyStun(t, ms),
      spawnLevelUpText: (x, y) => this.spawnLevelUpText(x, y),
      factionRatio: (f) => this.factionRatio(f),
      maybeSurrender: (u) => this.maybeSurrender(u)
    };

    // 부대 편성 스폰
    this.spawnArmies();
    this.allyStart = this.allies.length;
    this.enemyStart = this.enemies.length;

    // 투사체 풀
    for (let i = 0; i < 32; i++) this.projectiles.push(new Projectile(this));

    // FX 풀
    for (let i = 0; i < 40; i++) {
      const t = this.add.text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3
      });
      t.setOrigin(0.5).setDepth(40).setActive(false).setVisible(false);
      this.dmgPool.push(t);
    }
    for (let i = 0; i < 24; i++) {
      const s = this.add.image(0, 0, 'spark');
      s.setDepth(19).setActive(false).setVisible(false);
      this.sparkPool.push(s);
    }

    // 밀집 난전의 "뒤엉켜 밀치는" 느낌은 전 진영 분리(separation) 스티어링이 담당한다
    // (Arcade 원형 바디는 유지하되 교차 진영 하드 충돌은 분리 스티어링으로 대체 — 밀집 시 성능)

    // HP바 배치 렌더용 공용 Graphics
    this.hpGfx = this.add.graphics().setDepth(20);

    // 조작 대상 = 영웅 (없으면 아무 아군 유닛)
    const startCtrl = this.hero ?? this.allies[0];
    this.controlled = startCtrl;
    this.selected = startCtrl;
    startCtrl.playerControlled = true;

    this.selectRing = this.add.image(startCtrl.x, startCtrl.y, 'selectRing').setDepth(6);
    this.tweens.add({
      targets: this.selectRing,
      alpha: { from: 0.6, to: 1 },
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut'
    });
    this.targetRing = this.add.image(0, 0, 'targetRing').setDepth(6).setVisible(false);

    // 입력
    this.stick = new FloatingStick(this);
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keys = {
      up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      space: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      tab: kb.addKey(Phaser.Input.Keyboard.KeyCodes.TAB)
    };
    this.squadKeys = {
      sel1: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      sel2: kb.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      q: kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
      w: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      e: kb.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      r: kb.addKey(Phaser.Input.Keyboard.KeyCodes.R),
      t: kb.addKey(Phaser.Input.Keyboard.KeyCodes.T)
    };
    kb.addCapture('TAB');
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointerup', this.onPointerUp, this);

    // 카메라 개전 연출: 전장 전체 줌아웃 → 줌인 추적
    const fit = Math.min(GAME.width / WORLD.width, GAME.height / WORLD.height);
    this.cameras.main.setZoom(fit);
    this.cameras.main.centerOn(WORLD.width / 2, WORLD.height / 2);
    this.time.delayedCall(150, () => {
      this.tweens.add({
        targets: this.cameras.main,
        zoom: 1,
        duration: 1500,
        ease: 'Cubic.InOut',
        onComplete: () => this.cameras.main.startFollow(this.controlled, true, 0.08, 0.08)
      });
    });

    this.installDebug();
  }

  // ---------- 스폰 (전략층 BattleSetup 기반) ----------
  private spawnArmies() {
    const allyInputs = this.setup.allySquads;
    const enemyInputs = this.setup.enemySquads;

    // 필요한 텍스처(병종 스프라이트 + 배너)를 부대 소속 색조로 지연 생성
    for (const sq of [...allyInputs, ...enemyInputs]) this.ensureSquadTextures(sq);

    // 부대 런타임 준비
    for (const sq of [...allyInputs, ...enemyInputs]) {
      const def: BattleSquadDef = {
        id: sq.id,
        name: sq.name,
        faction: sq.faction,
        tint: sq.tint,
        banner: sq.banner
      };
      const banner = this.add.image(0, 0, `banner_${sq.id}`).setDepth(14).setVisible(false);
      const orderFlag = this.add.image(0, 0, 'orderFlag').setOrigin(0.5, 1).setDepth(13).setVisible(false);
      orderFlag.setTint(sq.banner);
      this.squads.push({ def, members: [], banner, order: 'charge', movePoint: null, orderFlag, bossDead: false });
    }

    const spawns = [
      ...this.layoutFaction(allyInputs, 'ally'),
      ...this.layoutFaction(enemyInputs, 'enemy')
    ];

    for (const sp of spawns) {
      const u = this.createUnit(sp);
      const sr = this.squads.find((r) => r.def.id === sp.squadId);
      if (sr) sr.members.push(u);
      // 보스 머리 위 마크 (왕관/해골)
      if (u.isBoss) {
        const mark = this.add.image(u.x, u.y, 'bossMark').setDepth(15);
        this.bossMarks.set(u.uid, mark);
      }
    }
  }

  // 부대 소속 색조로 병종 스프라이트 + 배너 텍스처 보장 (이미 있으면 무시)
  private ensureSquadTextures(sq: BattleSquadInput) {
    const seen = new Set<string>();
    for (const u of sq.units) {
      if (seen.has(u.unitType)) continue;
      seen.add(u.unitType);
      genUnit(this, `u_${u.unitType}_${sq.id}`, u.unitType as UnitKind, sq.tint);
    }
    genBanner(this, `banner_${sq.id}`, sq.banner);
  }

  private allySquads(): SquadRuntime[] {
    return this.squads.filter((s) => s.def.faction === 'ally');
  }

  private layoutFaction(squads: BattleSquadInput[], faction: Faction): Spawn[] {
    const blocks = squads.map((sq) => {
      const total = sq.units.length;
      const width = Math.max(1, Math.ceil(total / FORMATION.cols)); // 횡대 폭(유닛 수)
      return { sq, total, width };
    });
    const totalH = blocks.reduce((a, b) => a + b.width * FORMATION.rowSpacing, 0) + (blocks.length - 1) * FORMATION.squadGap;
    let cursorY = WORLD.height / 2 - totalH / 2;
    const spawns: Spawn[] = [];

    for (const b of blocks) {
      const blockH = b.width * FORMATION.rowSpacing;
      const centerY = cursorY + blockH / 2;
      // 근접(front)→원거리(back) 정렬 (유닛 상태 참조 보존)
      const units = b.sq.units.slice().sort((a, z) => this.roleRank(a.unitType) - this.roleRank(z.unitType));

      units.forEach((input, i) => {
        const depth = Math.floor(i / b.width); // 0 = 최전선
        const lat = i % b.width;
        const bx =
          faction === 'ally'
            ? FORMATION.allyLineX - depth * FORMATION.colSpacing
            : FORMATION.enemyLineX + depth * FORMATION.colSpacing;
        const by = centerY + (lat - (b.width - 1) / 2) * FORMATION.rowSpacing;
        const jx = (Math.random() - 0.5) * 2 * FORMATION.jitter;
        const jy = (Math.random() - 0.5) * 2 * FORMATION.jitter;
        spawns.push({ input, squadId: b.sq.id, x: bx + jx, y: by + jy });
      });
      cursorY += blockH + FORMATION.squadGap;
    }
    return spawns;
  }

  private roleRank(t: UnitType): number {
    return t === 'ranged' || t === 'goblinArcher' ? 1 : 0; // 원거리 후열
  }

  private createUnit(sp: Spawn): Unit {
    const t = sp.input.unitType;
    let u: Unit;
    if (t === 'hero') {
      this.hero = new Hero(this, sp.x, sp.y, sp.squadId);
      this.allyGroup.add(this.hero);
      this.allies.push(this.hero);
      u = this.hero;
    } else if (t === 'melee' || t === 'ranged' || t === 'spear') {
      const s = new Soldier(this, sp.x, sp.y, t as SoldierKind, sp.squadId);
      this.allyGroup.add(s);
      this.allies.push(s);
      u = s;
    } else {
      const m = new Monster(this, sp.x, sp.y, t as MonsterKind, sp.squadId);
      this.enemyGroup.add(m);
      this.enemies.push(m);
      u = m;
    }
    this.applyUnitState(u, sp.input);
    return u;
  }

  // 전략층 유닛 상태(레벨/EXP/HP/MP/투항/라벨)를 스폰된 유닛에 반영
  private applyUnitState(u: Unit, input: BattleUnitInput) {
    u.stateUid = input.stateUid;
    u.level = input.level;
    u.exp = input.exp;
    u.recomputeStats();
    u.hp = input.hp >= 0 ? Math.min(input.hp, u.maxHp) : u.maxHp;
    u.mp = input.mp >= 0 ? Math.min(input.mp, u.maxMp) : u.maxMp;
    if (input.surrendered) {
      u.surrendered = true;
      u.applyConvertTint(SURRENDER.convertTint);
    }
    u.label = input.label;
  }

  private spawnProjectile(x: number, y: number, target: Unit, damage: number, faction: Faction, speed: number) {
    let p = this.projectiles.find((pr) => !pr.active);
    if (!p) {
      p = new Projectile(this);
      this.projectiles.push(p);
    }
    // shooter 추적: 발사 유닛은 사거리 내 자기 진영이 아닌 유닛 — 간단히 null 처리(넉백/킬은 근접 위주)
    p.fire(x, y, target, damage, faction, speed, null);
  }

  // ---------- 선택 / 빙의 ----------
  private onPointerDown(pointer: Phaser.Input.Pointer) {
    this.tapDownTime = this.time.now;
    this.tapDownX = pointer.x;
    this.tapDownY = pointer.y;
  }

  private onPointerUp(pointer: Phaser.Input.Pointer) {
    if (this.gameState !== 'playing') return;
    const dur = this.time.now - this.tapDownTime;
    const moved = Math.hypot(pointer.x - this.tapDownX, pointer.y - this.tapDownY);
    if (dur > TAP.maxDurationMs || moved > TAP.maxMoveDist) return;
    const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    // '이동' 지점 지정 모드: 이 탭은 유닛 선택/빙의가 아니라 집결 지점으로 해석
    if (this.pendingMoveSquad !== null) {
      this.applyMovePoint(this.pendingMoveSquad, wp.x, wp.y);
      this.pendingMoveSquad = null;
      return;
    }
    this.clickAt(wp.x, wp.y);
  }

  // 월드 좌표 클릭: 아군이면 빙의+정보, 적이면 정보만
  private clickAt(wx: number, wy: number) {
    const u = this.pickUnitAt(wx, wy);
    if (!u) return;
    this.selected = u;
    if (u.faction === 'ally') this.possess(u);
  }

  private pickUnitAt(wx: number, wy: number): Unit | null {
    let best: Unit | null = null;
    let bestD = TAP.pickRadius * TAP.pickRadius;
    const consider = (u: Unit) => {
      if (!u.alive) return;
      const dx = u.x - wx;
      const dy = u.y - wy;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    };
    for (const a of this.allies) consider(a);
    for (const e of this.enemies) consider(e);
    return best;
  }

  private possess(u: Unit) {
    if (!u.alive || u === this.controlled || u.faction !== 'ally') return;
    if (this.controlled && this.controlled.alive) {
      this.controlled.playerControlled = false;
      this.controlled.setMoveInput(0, 0);
      this.controlled.stopMotion();
    }
    this.controlled = u;
    u.playerControlled = true;
    u.setMoveInput(0, 0);
    this.cameras.main.startFollow(u, true, 0.08, 0.08);
  }

  // ---------- 사망 ----------
  private onUnitDied(unit: Unit, killer: Unit | null) {
    if (unit.faction === 'ally') {
      const i = this.allies.findIndex((a) => a.uid === unit.uid);
      if (i >= 0) this.allies.splice(i, 1);
      this.allyDead++;
    } else {
      const i = this.enemies.findIndex((e) => e.uid === unit.uid);
      if (i >= 0) this.enemies.splice(i, 1);
      this.enemyDead++;
    }
    if (killer && killer.playerControlled) this.playerKills++;

    // 마커 정리
    this.removeMark(this.surrenderFlags, unit.uid);

    // 보스 사망: 큰 연출 + "적장 격파!" 배너 + 무리 투항 유발
    if (unit.isBoss) {
      this.removeMark(this.bossMarks, unit.uid);
      this.onBossKilled(unit);
    }

    // 조작 중이던 유닛 사망 → 영웅 복귀
    if (unit === this.controlled && unit !== this.hero && this.hero && this.hero.alive && !this.heroEscaped) {
      this.possessHeroFallback();
    }
    // 정보 선택 대상 사망 → 조작 유닛으로 되돌림
    if (unit === this.selected) {
      this.selected = this.controlled && this.controlled.alive ? this.controlled : this.hero ?? this.controlled;
    }
  }

  private removeMark(map: Map<number, Phaser.GameObjects.Image>, uid: number) {
    const img = map.get(uid);
    if (img) {
      img.destroy();
      map.delete(uid);
    }
  }

  // 적장(보스) 격파 처리: 화면 흔들림 + 파편 + 배너 이벤트 + 무리 투항 판정
  private onBossKilled(boss: Unit) {
    const sr = this.squads.find((s) => s.def.id === boss.squadId);
    if (sr) sr.bossDead = true;

    // 큰 사망 연출
    this.cameras.main.shake(360, 0.014);
    this.spawnExplosionFx(boss.x, boss.y, 90);
    const debris = this.add.particles(boss.x, boss.y, 'fireShard', {
      speed: { min: 80, max: 260 },
      angle: { min: 0, max: 360 },
      gravityY: 120,
      scale: { start: 1.6, end: 0 },
      tint: [0xffe070, 0xff8a30, 0xffffff, 0xd23b3b],
      lifespan: 620,
      quantity: 30,
      emitting: false
    });
    debris.setDepth(33);
    debris.explode(30);
    this.time.delayedCall(700, () => debris.destroy());

    // UIScene가 "적장 격파!" 배너를 띄우도록 이벤트 발신
    this.events.emit('bossKilled', boss.label);

    // 무리 전원 즉시 1회 투항 판정 (40%)
    for (const e of this.enemies.slice()) {
      if (e.squadId !== boss.squadId || e.isBoss) continue;
      if (e.surrenderState !== 'none') continue;
      if (Math.random() < SURRENDER.bossDeathInstant) this.beginSurrender(e);
    }
  }

  private possessHeroFallback() {
    if (!this.hero || !this.hero.alive) return;
    this.controlled = this.hero;
    this.hero.playerControlled = true;
    this.hero.setMoveInput(0, 0);
    this.cameras.main.startFollow(this.hero, true, 0.08, 0.08);
  }

  // ---------- 투항 시스템 ----------
  private factionRatio(faction: Faction): number {
    if (faction === 'ally') return this.allyStart > 0 ? this.allies.length / this.allyStart : 0;
    return this.enemyStart > 0 ? this.enemies.length / this.enemyStart : 0;
  }

  // 적 일반병 상시 투항 판정 (Monster.aiTick에서 위임 호출)
  private maybeSurrender(unit: Unit) {
    if (unit.surrenderState !== 'none' || unit.isBoss || unit.faction !== 'enemy') return;
    if (unit.hp / unit.maxHp >= SURRENDER.hpThreshold) return;
    if (this.factionRatio('enemy') >= SURRENDER.factionRatioThreshold) return;
    const sr = this.squads.find((s) => s.def.id === unit.squadId);
    const mult = sr && sr.bossDead ? SURRENDER.bossDeathMultiplier : 1;
    if (Math.random() < SURRENDER.baseChancePerTick * mult) this.beginSurrender(unit);
  }

  // 투항 개시: 백기 + 무기 내려놓고 poseMs 후 아군 전환
  private beginSurrender(unit: Unit) {
    if (unit.surrenderState !== 'none' || !unit.alive) return;
    unit.surrenderState = 'surrendering';
    unit.surrenderReadyAt = this.time.now + SURRENDER.poseMs;
    unit.stopMotion();
    // 백기 아이콘
    const flag = this.add.image(unit.x, unit.y, 'whiteFlag').setDepth(17);
    this.surrenderFlags.set(unit.uid, flag);
  }

  // 백기 정지 시간이 끝난 투항병을 아군으로 전환 (update 루프에서 호출)
  private processSurrenders() {
    for (const e of this.enemies.slice()) {
      if (e.surrenderState === 'surrendering' && e.alive && this.time.now >= e.surrenderReadyAt) {
        this.convertToAlly(e);
      }
    }
  }

  // 투항병 → 아군 편입 (가장 가까운 아군 부대 소속으로)
  private convertToAlly(unit: Unit) {
    // enemies에서 제거
    const i = this.enemies.findIndex((e) => e.uid === unit.uid);
    if (i >= 0) this.enemies.splice(i, 1);
    // 물리 그룹 이동
    this.enemyGroup.remove(unit);
    this.allyGroup.add(unit);
    unit.faction = 'ally';
    unit.surrenderState = 'converted';
    unit.surrendered = true;
    unit.stunnedUntil = 0;

    // 가장 가까운 아군 부대 찾기 (생존 유닛 기준)
    let bestSquad: SquadRuntime | null = null;
    let bestD = Infinity;
    for (const sr of this.allySquads()) {
      for (const m of sr.members) {
        if (!m.alive || m.escaped) continue;
        const d = Phaser.Math.Distance.Squared(unit.x, unit.y, m.x, m.y);
        if (d < bestD) {
          bestD = d;
          bestSquad = sr;
        }
      }
    }
    if (!bestSquad) bestSquad = this.allySquads()[0] ?? null;
    if (bestSquad) {
      unit.squadId = bestSquad.def.id;
      unit.order = bestSquad.order === 'escape' ? 'charge' : bestSquad.order;
      unit.orderPoint = bestSquad.movePoint;
      bestSquad.members.push(unit);
      unit.label = `투항병 ${CLASS_NAME[unit.unitType]}`;
    }

    // 파랑 계열 재틴트 + 아군 배열 편입
    unit.applyConvertTint(SURRENDER.convertTint);
    this.allies.push(unit);
    this.surrenderedGained++;
    this.removeMark(this.surrenderFlags, unit.uid);
    // 투항 연출: 짧은 반짝임
    this.spawnSpark(unit.x, unit.y - unit.height * 0.3);
  }

  // ---------- 부대 전술 명령 ----------
  private setSquadOrder(squadId: number, order: SquadOrder, point?: { x: number; y: number }) {
    const sr = this.squads.find((s) => s.def.id === squadId && s.def.faction === 'ally');
    if (!sr) return;
    sr.order = order;
    sr.movePoint = order === 'move' ? point ?? sr.movePoint : null;
    if (order !== 'move') sr.orderFlag.setVisible(false);
    for (const m of sr.members) {
      if (!m.alive || m.escaped || m.surrenderState === 'surrendering') continue;
      m.order = order;
      m.orderPoint = order === 'move' ? sr.movePoint : null;
    }
  }

  // '이동' 지점 지정 (탭/디버그): 깃발 세우고 부대에 이동 명령
  private applyMovePoint(squadId: number, x: number, y: number) {
    const sr = this.squads.find((s) => s.def.id === squadId && s.def.faction === 'ally');
    if (!sr) return;
    const px = Phaser.Math.Clamp(x, 20, WORLD.width - 20);
    const py = Phaser.Math.Clamp(y, 20, WORLD.height - 20);
    this.setSquadOrder(squadId, 'move', { x: px, y: py });
    sr.orderFlag.setPosition(px, py).setVisible(true);
  }

  // 탈출: 좌측 가장자리 도달 유닛 제거 (생존 기록)
  private escapeUnit(unit: Unit) {
    if (unit.escaped) return;
    unit.escaped = true;
    this.escapees.push(this.toSurvivor(unit));
    const i = this.allies.findIndex((a) => a.uid === unit.uid);
    if (i >= 0) this.allies.splice(i, 1);
    if (unit === this.hero) this.heroEscaped = true;
    if (unit === this.controlled) {
      // 조작 유닛 이탈 → 남은 영웅/아군으로 조작 이양
      if (this.hero && this.hero.alive && !this.heroEscaped) this.possessHeroFallback();
      else {
        const next = this.allies.find((a) => a.alive && !a.escaped);
        if (next) {
          this.controlled = next;
          next.playerControlled = true;
          this.cameras.main.startFollow(next, true, 0.08, 0.08);
        }
      }
    }
    this.removeMark(this.bossMarks, unit.uid);
    this.removeMark(this.surrenderFlags, unit.uid);
    if (this.selected === unit) {
      this.selected =
        this.controlled && this.controlled.alive && !this.controlled.escaped ? this.controlled : this.hero ?? this.controlled;
    }
    // 이탈 연출: 페이드아웃 후 제거
    const ghost = this.add.image(unit.x, unit.y, unit.texture.key, 0).setDepth(10).setFlipX(unit.flipX);
    if (unit.convertTint !== null) ghost.setTint(unit.convertTint);
    this.tweens.add({ targets: ghost, alpha: 0, x: unit.x - 40, duration: 400, onComplete: () => ghost.destroy() });
    unit.destroy();
  }

  private spawnCorpse(unit: Unit) {
    const corpse = this.add.image(unit.x, unit.y, unit.texture.key, FRAME.CORPSE);
    corpse.setFlipX(unit.flipX);
    corpse.setDepth(2);
    corpse.setAlpha(0.95);
    this.tweens.add({
      targets: corpse,
      alpha: 0,
      delay: FX.corpseLifespan,
      duration: FX.corpseFade,
      onComplete: () => corpse.destroy()
    });
  }

  private emitBlood(x: number, y: number, color: number) {
    const key =
      color === 0xffd23b ? 'blood_hero' : color === 0xd23b3b ? 'blood_oni' : color === 0x6bbf4a ? 'blood_enemy' : 'blood_ally';
    const emitter = this.add.particles(x, y, key, {
      speed: { min: 30, max: 110 },
      angle: { min: 0, max: 360 },
      gravityY: 140,
      scale: { start: 1, end: 0 },
      lifespan: 380,
      quantity: 7,
      emitting: false
    });
    emitter.setDepth(18);
    emitter.explode(7);
    this.time.delayedCall(450, () => emitter.destroy());
  }

  private spawnDamageNumber(x: number, y: number, amount: number, faction: Faction, color?: string) {
    const t = this.dmgPool.find((d) => !d.active);
    if (!t) return;
    t.setActive(true).setVisible(true);
    t.setText(String(amount));
    t.setColor(color ?? (faction === 'ally' ? '#ff9a9a' : '#fff2c0'));
    t.setPosition(x + (Math.random() - 0.5) * 6, y);
    t.setAlpha(1);
    t.setScale(1);
    this.tweens.add({
      targets: t,
      y: y - FX.damageNumberRise,
      alpha: 0,
      duration: FX.damageNumberLifespan,
      ease: 'Quad.Out',
      onComplete: () => t.setActive(false).setVisible(false)
    });
  }

  private spawnSpark(x: number, y: number) {
    const s = this.sparkPool.find((sp) => !sp.active);
    if (!s) return;
    s.setActive(true).setVisible(true);
    s.setPosition(x, y);
    s.setAlpha(1);
    s.setScale(0.6);
    s.setAngle(Math.random() * 360);
    this.tweens.add({
      targets: s,
      scale: 1.2,
      alpha: 0,
      duration: FX.sparkLifespan,
      ease: 'Quad.Out',
      onComplete: () => s.setActive(false).setVisible(false)
    });
  }

  // ---------- 스킬 장비(proc) 연출/판정 ----------
  // 폭발 AOE: 지점 반경 내 상대 진영에 마법 피해 + 화염 이펙트 + 화면 흔들림.
  // 반환값 = 피해를 준 적 수 (디버그 검증용).
  private explodeAt(x: number, y: number, radius: number, damage: number, faction: Faction, attacker: Unit | null): number {
    const list = faction === 'ally' ? this.enemies : this.allies;
    const r2 = radius * radius;
    let hit = 0;
    for (const u of list.slice()) {
      if (!u.alive) continue;
      const dx = u.x - x;
      const dy = u.y - y;
      if (dx * dx + dy * dy <= r2) {
        u.takeDamage(damage, this.ctx, attacker, '#ffb030'); // 주황 전용 색
        hit++;
      }
    }
    this.spawnExplosionFx(x, y, radius);
    this.cameras.main.shake(140, 0.006);
    return hit;
  }

  private spawnExplosionFx(x: number, y: number, radius: number) {
    // 확장 링
    const ring = this.add.image(x, y, 'explosionRing').setDepth(31);
    ring.setScale(0.15).setAlpha(0.95);
    this.tweens.add({
      targets: ring,
      scale: (radius * 2) / 128,
      alpha: 0,
      duration: 320,
      ease: 'Cubic.Out',
      onComplete: () => ring.destroy()
    });
    // 화염 파편
    const emitter = this.add.particles(x, y, 'fireShard', {
      speed: { min: 60, max: 200 },
      angle: { min: 0, max: 360 },
      gravityY: 60,
      scale: { start: 1.1, end: 0 },
      tint: [0xffe070, 0xff8a30, 0xff5a20],
      lifespan: 420,
      quantity: 16,
      emitting: false
    });
    emitter.setDepth(32);
    emitter.explode(16);
    this.time.delayedCall(480, () => emitter.destroy());
  }

  private applyStun(target: Unit, ms: number) {
    if (!target.alive) return;
    target.stunnedUntil = Math.max(target.stunnedUntil, this.time.now + ms);
    this.spawnSpark(target.x, target.y - target.height * 0.3);
  }

  private spawnLevelUpText(x: number, y: number) {
    const t = this.add.text(x, y, 'LV UP!', {
      fontFamily: 'sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#ffe066',
      stroke: '#000000',
      strokeThickness: 4
    });
    t.setOrigin(0.5).setDepth(45);
    this.tweens.add({
      targets: t,
      y: y - 30,
      alpha: { from: 1, to: 0 },
      scale: { from: 0.8, to: 1.2 },
      duration: 900,
      ease: 'Quad.Out',
      onComplete: () => t.destroy()
    });
  }

  // ---------- 그리드 ----------
  private cellKey(x: number, y: number, size: number): number {
    return Math.floor(x / size) * 4096 + Math.floor(y / size);
  }

  private rebuildGrids() {
    this.allyGrid.clear();
    this.enemyGrid.clear();
    this.crowdGrid.clear();
    const push = (grid: Map<number, Unit[]>, u: Unit, size: number) => {
      const k = this.cellKey(u.x, u.y, size);
      let arr = grid.get(k);
      if (!arr) {
        arr = [];
        grid.set(k, arr);
      }
      arr.push(u);
    };
    for (const a of this.allies) {
      if (!a.alive) continue;
      push(this.allyGrid, a, AI.gridCellSize);
      push(this.crowdGrid, a, CROWD.gridCellSize);
    }
    for (const e of this.enemies) {
      if (!e.alive) continue;
      push(this.enemyGrid, e, AI.gridCellSize);
      push(this.crowdGrid, e, CROWD.gridCellSize);
    }
  }

  private updateCentroids() {
    this.allyCentroid = this.centroid(this.allies);
    this.enemyCentroid = this.centroid(this.enemies);
  }

  private centroid(list: Unit[]): { x: number; y: number } | null {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const u of list) {
      if (!u.alive) continue;
      sx += u.x;
      sy += u.y;
      n++;
    }
    return n > 0 ? { x: sx / n, y: sy / n } : null;
  }

  findNearestEnemy(searcherFaction: Faction, x: number, y: number, range: number): Unit | null {
    const grid = searcherFaction === 'ally' ? this.enemyGrid : this.allyGrid;
    const reach = Math.ceil(range / AI.gridCellSize);
    const cx = Math.floor(x / AI.gridCellSize);
    const cy = Math.floor(y / AI.gridCellSize);
    let best: Unit | null = null;
    let bestD = range * range;
    for (let gx = cx - reach; gx <= cx + reach; gx++) {
      for (let gy = cy - reach; gy <= cy + reach; gy++) {
        const arr = grid.get(gx * 4096 + gy);
        if (!arr) continue;
        for (const u of arr) {
          if (!u.alive) continue;
          const dx = u.x - x;
          const dy = u.y - y;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = u;
          }
        }
      }
    }
    return best;
  }

  // 분리(separation) 스티어링 + 최종 속도 적용
  private applyCrowdAndMove() {
    const size = CROWD.gridCellSize;
    const apply = (u: Unit) => {
      if (!u.alive) return;
      let sx = 0;
      let sy = 0;
      const cx = Math.floor(u.x / size);
      const cy = Math.floor(u.y / size);
      const ur = u.sepRadius;
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          const arr = this.crowdGrid.get(gx * 4096 + gy);
          if (!arr) continue;
          for (const n of arr) {
            if (n === u || !n.alive) continue;
            const dx = u.x - n.x;
            const dy = u.y - n.y;
            const d = Math.hypot(dx, dy);
            const thr = ur + n.sepRadius;
            if (d > 0 && d < thr) {
              const w = (thr - d) / thr;
              sx += (dx / d) * w;
              sy += (dy / d) * w;
            }
          }
        }
      }
      const mag = Math.hypot(sx, sy);
      if (mag > 0) {
        const s = Math.min(mag, 1.4) * CROWD.separationForce;
        sx = (sx / mag) * s;
        sy = (sy / mag) * s;
      }
      const body = u.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(u.dvx + u.kbx + sx, u.dvy + u.kby + sy);
      u.kbx *= 0.8;
      u.kby *= 0.8;
      // 전장 이탈 방지 (안전 클램프)
      if (u.x < 10) u.x = 10;
      else if (u.x > WORLD.width - 10) u.x = WORLD.width - 10;
      if (u.y < 10) u.y = 10;
      else if (u.y > WORLD.height - 10) u.y = WORLD.height - 10;
    };
    for (const a of this.allies) apply(a);
    for (const e of this.enemies) apply(e);
  }

  // ---------- 스킬 ----------
  // 일섬: 영웅 빙의 중 + MP 충분 + 쿨다운 완료 시 발동. MP 소모.
  requestSkill() {
    if (this.gameState !== 'playing' || !this.hero || !this.hero.alive) return;
    if (this.controlled !== this.hero) return;
    const now = this.time.now;
    if (!this.hero.skillReady(now)) return;
    if (this.hero.mp < SKILL.ilseomMpCost) return;
    if (this.hero.tryUseSkill(this.ctx, now)) {
      this.hero.mp -= SKILL.ilseomMpCost;
      const r2 = HERO.skillRadius * HERO.skillRadius;
      for (const e of this.enemies.slice()) {
        const dx = e.x - this.hero.x;
        const dy = e.y - this.hero.y;
        if (dx * dx + dy * dy <= r2) e.takeDamage(HERO.skillDamage, this.ctx, this.hero);
      }
    }
  }

  getSkillCdRatio(): number {
    return this.hero ? this.hero.skillCooldownRatio(this.time.now) : 1;
  }

  // UI: 스킬 버튼 활성 여부 (영웅 빙의 + MP 충분)
  canUseSkill(): boolean {
    return this.isControllingHero() && !!this.hero && this.hero.alive && this.hero.mp >= SKILL.ilseomMpCost;
  }

  restart() {
    // 전략층에서 진입한 전투는 결과창 버튼이 전략맵 복귀로 동작
    if (this.fromStrategy) {
      this.returnToStrategy();
      return;
    }
    this.scene.stop('UIScene');
    this.scene.restart();
    this.scene.launch('UIScene');
  }

  // 전략층 전투 여부 (UIScene 결과창 버튼 라벨 분기)
  isFromStrategy() {
    return this.fromStrategy;
  }

  // ---------- UI 게터 ----------
  getHeroHp() {
    return { hp: Math.max(0, Math.ceil(this.hero?.hp ?? 0)), max: this.hero?.maxHp ?? 0 };
  }
  isControllingHero() {
    return this.controlled === this.hero;
  }
  getCounts() {
    return { ally: this.allies.length, enemy: this.enemies.length };
  }
  getGameState() {
    return this.gameState;
  }
  getResult(): BattleResult | null {
    return this.result;
  }

  // 하단 정보창용: 현재 정보 표시 대상
  getInfoUnit() {
    const u = this.selected && this.selected.alive && !this.selected.escaped ? this.selected : this.controlled;
    if (!u || !u.alive || u.escaped) return null;
    const equip: InfoEquipSlot[] = EQUIP_SLOTS.map((slot) => {
      const it = u.equipment[slot];
      return {
        slot,
        slotName: SLOT_NAME[slot],
        iconKey: SLOT_ICON[slot],
        name: it ? it.name : '-',
        filled: !!it,
        highlight: !!(it && it.highlight)
      };
    });
    // 장착 무기의 proc 스킬 설명 (예: "폭열검 — 타격 시 10% 폭발")
    const w = u.equipment.weapon;
    const proc = itemProc(w);
    const procDesc = w && proc ? `${w.name} — ${proc.desc}` : null;
    return {
      label: u.label,
      typeName: TYPE_NAME[u.unitType],
      level: u.level,
      hp: Math.max(0, Math.ceil(u.hp)),
      max: u.maxHp,
      mp: Math.max(0, Math.ceil(u.mp)),
      maxMp: u.maxMp,
      kills: u.kills,
      exp: u.exp,
      expNext: expForNext(u.level),
      atk: u.getAtk(),
      def: u.getDef(),
      faction: u.faction,
      textureKey: u.texture.key,
      possessed: u === this.controlled,
      isBoss: u.isBoss,
      surrendered: u.surrendered,
      equip,
      procDesc
    };
  }

  // ---------- 메인 루프 ----------
  update(time: number, delta: number) {
    if (this.gameState !== 'playing') return;
    this.ctx.time = time;
    this.frameCount++;

    this.handleInput();
    this.rebuildGrids();
    this.updateCentroids();

    // 빙의 유닛: 기본은 AI(자동 이동+공격)가 돌고, 유저 입력 중에만 이동 수동 오버라이드
    if (this.controlled && this.controlled.alive) this.controlled.updateAsControlled(delta, this.ctx);
    // 영웅은 비조작 시 매 프레임 반응 (스태거 루프에서는 제외해 중복 틱 방지)
    if (this.hero && this.hero.alive && !this.heroEscaped && this.controlled !== this.hero) this.hero.aiTick(delta, this.ctx);

    const group = this.frameCount % AI.tickGroups;
    for (const a of this.allies) {
      if (a === this.controlled || a === this.hero) continue;
      if (a.uid % AI.tickGroups === group) a.aiTick(delta, this.ctx);
    }
    for (const e of this.enemies) {
      if (e.uid % AI.tickGroups === group) e.aiTick(delta, this.ctx);
    }

    // 분리 + 이동
    this.applyCrowdAndMove();

    // 링
    if (this.controlled && this.controlled.alive) {
      this.selectRing.setVisible(true);
      this.selectRing.setPosition(this.controlled.x, this.controlled.y + this.controlled.height * 0.32);
    } else {
      this.selectRing.setVisible(false);
    }
    if (this.selected && this.selected.alive && this.selected !== this.controlled) {
      this.targetRing.setVisible(true);
      this.targetRing.setPosition(this.selected.x, this.selected.y + this.selected.height * 0.32);
    } else {
      this.targetRing.setVisible(false);
    }

    // 부대 배너 (선두 생존 유닛 위)
    for (const sr of this.squads) {
      const lead = sr.members.find((m) => m.alive && !m.escaped);
      if (lead) {
        sr.banner.setVisible(true);
        sr.banner.setPosition(lead.x, lead.y - lead.height * 0.5 - 8);
      } else {
        sr.banner.setVisible(false);
      }
    }

    // 전술 마커 (보스 마크 / 투항 백기) 위치 갱신 + 탈출/도착/투항 처리
    this.updateTacticalMarkers();
    this.processEscapeAndArrival();
    this.processSurrenders();

    // 투사체
    for (const p of this.projectiles) if (p.active) p.tick(delta, this.ctx);

    // HP바 (배치 렌더 — 단일 Graphics)
    this.hpGfx.clear();
    for (const a of this.allies) a.drawHpBarInto(this.hpGfx);
    for (const e of this.enemies) e.drawHpBarInto(this.hpGfx);

    this.checkGameEnd();
  }

  // 보스 마크 / 투항 백기를 대상 유닛 머리 위로 갱신
  private updateTacticalMarkers() {
    for (const [uid, img] of this.bossMarks) {
      const u = this.enemies.find((e) => e.uid === uid) ?? this.allies.find((a) => a.uid === uid);
      if (u && u.alive && !u.escaped) {
        img.setVisible(true);
        img.setPosition(u.x, u.y - u.height * 0.5 - 12);
      } else {
        img.setVisible(false);
      }
    }
    for (const [uid, img] of this.surrenderFlags) {
      const u = this.enemies.find((e) => e.uid === uid) ?? this.allies.find((a) => a.uid === uid);
      if (u && u.alive) {
        img.setVisible(true);
        img.setPosition(u.x + 6, u.y - u.height * 0.55);
      } else {
        img.setVisible(false);
      }
    }
  }

  // 탈출 유닛 가장자리 제거 + 이동 명령 도착 시 정지 전환
  private processEscapeAndArrival() {
    // 탈출: 좌측 가장자리 도달 유닛 제거
    for (const a of this.allies.slice()) {
      if (a.order === 'escape' && !a.escaped && a.x <= TACTICS.escapeEdgeX) {
        this.escapeUnit(a);
      }
    }
    // 이동: 부대 중심이 목표에 근접하면 자동 정지
    for (const sr of this.allySquads()) {
      if (sr.order !== 'move' || !sr.movePoint) continue;
      const living = sr.members.filter((m) => m.alive && !m.escaped);
      if (living.length === 0) continue;
      let sx = 0;
      let sy = 0;
      for (const m of living) {
        sx += m.x;
        sy += m.y;
      }
      const cx = sx / living.length;
      const cy = sy / living.length;
      if (Phaser.Math.Distance.Between(cx, cy, sr.movePoint.x, sr.movePoint.y) <= TACTICS.arriveSquadDist) {
        // 도착 → 정지 상태로 전환
        this.setSquadOrder(sr.def.id, 'hold');
      }
    }
  }

  private handleInput() {
    if (Phaser.Input.Keyboard.JustDown(this.keys.tab)) {
      if (this.hero && this.hero.alive && !this.heroEscaped) {
        this.possess(this.hero);
        this.selected = this.hero;
      }
    }
    let vx = 0;
    let vy = 0;
    if (this.keys.left.isDown || this.cursors.left.isDown) vx -= 1;
    if (this.keys.right.isDown || this.cursors.right.isDown) vx += 1;
    if (this.keys.up.isDown || this.cursors.up.isDown) vy -= 1;
    if (this.keys.down.isDown || this.cursors.down.isDown) vy += 1;
    if (this.stick.isActive()) {
      vx = this.stick.vecX;
      vy = this.stick.vecY;
    }
    if (this.controlled && this.controlled.alive) this.controlled.setMoveInput(vx, vy);
    if (Phaser.Input.Keyboard.JustDown(this.keys.space)) this.requestSkill();

    // 부대 명령 단축키: 1/2 부대 선택, Z/X/C/V/B = 돌격/정지/이동/후퇴/탈출
    if (Phaser.Input.Keyboard.JustDown(this.squadKeys.sel1)) this.selectSquadTab(0);
    if (Phaser.Input.Keyboard.JustDown(this.squadKeys.sel2)) this.selectSquadTab(1);
    for (const [code, key] of [
      ['Q', this.squadKeys.q],
      ['W', this.squadKeys.w],
      ['E', this.squadKeys.e],
      ['R', this.squadKeys.r],
      ['T', this.squadKeys.t]
    ] as [string, Phaser.Input.Keyboard.Key][]) {
      if (Phaser.Input.Keyboard.JustDown(key)) this.issueSquadOrder(ORDER_KEYS[code]);
    }
  }

  // ---------- 부대 명령 공개 API (UIScene / 키보드 공용) ----------
  selectSquadTab(i: number) {
    const allies = this.allySquads();
    if (i < 0 || i >= allies.length) return;
    this.selectedSquadTab = i;
  }

  getSelectedSquadTab(): number {
    return this.selectedSquadTab;
  }

  isMoveTargeting(): boolean {
    return this.pendingMoveSquad !== null;
  }

  // 선택된 부대에 명령 발령. '이동'은 지점 탭 대기 모드로 진입.
  issueSquadOrder(order: SquadOrder) {
    const sr = this.allySquads()[this.selectedSquadTab];
    if (!sr) return;
    if (order === 'move') {
      this.pendingMoveSquad = sr.def.id;
      return;
    }
    this.pendingMoveSquad = null;
    this.setSquadOrder(sr.def.id, order);
  }

  // UIScene 렌더용 아군 부대 요약
  getAllySquadInfos() {
    return this.allySquads().map((sr, i) => ({
      squadId: sr.def.id,
      name: sr.def.name,
      alive: sr.members.filter((m) => m.alive && !m.escaped).length,
      order: sr.order,
      banner: sr.def.banner,
      selected: i === this.selectedSquadTab
    }));
  }

  private checkGameEnd() {
    if (this.gameState !== 'playing') return;
    const anyEscaping = this.allySquads().some((s) => s.order === 'escape');
    let ended: GameState | null = null;
    if (this.hero && !this.hero.alive && !this.heroEscaped) ended = 'lose';
    else if (this.enemies.length === 0) ended = 'win';
    else if (this.allies.length === 0) ended = this.escapees.length > 0 ? 'escape' : 'lose';
    // 후퇴/탈출 명령 중이 아닐 때만 패주(rout) 판정 — 탈출로 병력이 빠지는 걸 패배로 오인하지 않음
    else if (!anyEscaping && this.allies.length <= Math.ceil(this.allyStart * OUTCOME.routRatio)) ended = 'lose';
    if (!ended) return;
    this.finishBattle(ended);
  }

  // 유닛 → 전략층 생존자 레코드
  private toSurvivor(u: Unit): BattleSurvivor {
    return {
      stateUid: u.stateUid,
      squadId: u.squadId,
      unitType: u.unitType,
      level: u.level,
      exp: u.exp,
      hp: Math.max(1, Math.round(u.hp)),
      mp: Math.max(0, Math.round(u.mp)),
      surrendered: u.surrendered,
      isHero: u.unitType === 'hero',
      label: u.label
    };
  }

  private finishBattle(outcome: GameState) {
    this.gameState = outcome;
    const heroDied = !!this.hero && !this.hero.alive && !this.heroEscaped;
    // 승리/패배 = 전장 잔존 아군, 탈출 = 탈출 생존자
    const survivorUnits =
      outcome === 'escape'
        ? this.escapees.slice()
        : this.allies.filter((a) => a.alive && !a.escaped).map((a) => this.toSurvivor(a));
    const enemyRemaining = this.enemies.filter((e) => e.alive).map((e) => ({ unitType: e.unitType }));

    this.result = {
      win: outcome === 'win',
      outcome,
      allyDead: this.allyDead,
      enemyDead: this.enemyDead,
      heroKills: this.hero ? this.hero.kills : 0,
      playerKills: this.playerKills,
      surrenderedGained: this.surrenderedGained,
      escapees: this.escapees.slice(),
      heroDied,
      survivorUnits,
      enemyRemaining,
      squadSurvivors: this.allySquads().map((sr) => ({
        squadId: sr.def.id,
        name: sr.def.name,
        alive: sr.members.filter((m) => m.alive && !m.escaped).length,
        escaped: sr.members.filter((m) => m.escaped).length
      }))
    };
    this.cameras.main.stopFollow();

    // 전략층에서 진입한 전투면 결과를 GameState 에 반영
    if (this.fromStrategy) {
      applyBattleResult(this.setup, {
        outcome: outcome as 'win' | 'lose' | 'escape',
        heroDied,
        survivorUnits,
        enemyRemaining
      });
    }
  }

  // 전략맵으로 복귀 (결과는 finishBattle 에서 이미 반영됨)
  returnToStrategy() {
    this.scene.stop('UIScene');
    this.scene.start('StrategyScene');
  }

  private installDebug() {
    (window as any).__debug = {
      state: () => this.gameState,
      allyCount: () => this.allies.length,
      enemyCount: () => this.enemies.length,
      totalCount: () => this.allies.length + this.enemies.length,
      fps: () => Math.round((this.game.loop as any).actualFps),
      combatActive: () => this.time.now - this.battleStartTime >= FORMATION.marchStartDelay,
      allyFrontX: () => this.allies.reduce((m, a) => (a.alive ? Math.max(m, a.x) : m), -Infinity),
      enemyFrontX: () => this.enemies.reduce((m, e) => (e.alive ? Math.min(m, e.x) : m), Infinity),
      frontGap: () => {
        const af = this.allies.reduce((m, a) => (a.alive ? Math.max(m, a.x) : m), -Infinity);
        const ef = this.enemies.reduce((m, e) => (e.alive ? Math.min(m, e.x) : m), Infinity);
        return ef - af;
      },
      controlledUid: () => (this.controlled ? this.controlled.uid : -1),
      controllingHero: () => this.controlled === this.hero,
      controlledPos: () =>
        this.controlled && this.controlled.alive ? { x: this.controlled.x, y: this.controlled.y } : null,
      // 하이브리드 조작: 현재 수동 이동 오버라이드가 활성인지
      controlledManual: () =>
        this.controlled && this.controlled.alive ? this.controlled.isManualActive(this.ctx) : false,
      infoLabel: () => (this.getInfoUnit() ? this.getInfoUnit()!.label : null),
      // ---- RPG 스탯/장비/스킬 검증 ----
      unitStats: (u: Unit | null) =>
        u && u.alive
          ? {
              label: u.label,
              className: TYPE_NAME[u.unitType],
              level: u.level,
              exp: u.exp,
              hp: Math.ceil(u.hp),
              maxHp: u.maxHp,
              mp: Math.ceil(u.mp),
              maxMp: u.maxMp,
              atk: u.getAtk(),
              def: u.getDef(),
              speed: u.speed,
              equipment: EQUIP_SLOTS.map((s) => (u.equipment[s] ? u.equipment[s]!.name : '-'))
            }
          : null,
      heroStats: () => (window as any).__debug.unitStats(this.hero),
      allyStats: (i: number) => (window as any).__debug.unitStats(this.allies[i] ?? null),
      enemyStats: (i: number) => (window as any).__debug.unitStats(this.enemies[i] ?? null),
      maxAllyLevel: () => this.allies.reduce((m, a) => (a.alive ? Math.max(m, a.level) : m), 1),
      // 강제 EXP 지급 (레벨업 검증)
      grantExp: (i: number, amount: number) => {
        const a = this.allies[i];
        if (!a || !a.alive) return -1;
        for (let k = 0; k < amount; k++) a.gainExpFromKill({ unitType: 'hero' } as any, this.ctx);
        return a.level;
      },
      // 폭열검 강제 발동: 조작 유닛 위치에서 폭발 → 피해 준 적 수 반환
      forceExplode: (radius = 90, dmg = 45) => {
        const u = this.controlled && this.controlled.alive ? this.controlled : this.hero;
        if (!u || !u.alive) return 0;
        return this.explodeAt(u.x, u.y, radius, dmg, 'ally', u);
      },
      // 적 중심에서 폭발 강제 발동 (폭열검 AOE 검증 — 조작 유닛/영웅을 위험에 두지 않음)
      forceExplodeAtEnemies: (radius = 120, dmg = 45) => {
        if (!this.enemyCentroid) return 0;
        return this.explodeAt(this.enemyCentroid.x, this.enemyCentroid.y, radius, dmg, 'ally', this.hero ?? null);
      },
      enemyCentroid: () => this.enemyCentroid,
      canUseSkill: () => this.canUseSkill(),
      heroMp: () => (this.hero && this.hero.alive ? { mp: Math.ceil(this.hero.mp), max: this.hero.maxMp } : null),
      selectAlly: (i: number) => {
        const u = this.allies[i];
        if (u && u.alive) {
          this.selected = u;
          this.possess(u);
        }
        return u ? u.uid : -1;
      },
      selectEnemy: (i: number) => {
        const u = this.enemies[i];
        if (u && u.alive) this.selected = u;
        return u ? u.uid : -1;
      },
      clickAt: (wx: number, wy: number) => {
        this.clickAt(wx, wy);
        return this.getInfoUnit();
      },
      result: () => this.result,
      // ---- 전략층 연결 검증 ----
      fromStrategy: () => this.fromStrategy,
      setupInfo: () => ({
        targetNodeId: this.setup.targetNodeId,
        nodeName: this.setup.nodeName,
        allySquadIds: this.setup.allySquadIds,
        allyCount: this.setup.allySquads.reduce((a, s) => a + s.units.length, 0),
        enemyCount: this.setup.enemySquads.reduce((a, s) => a + s.units.length, 0)
      }),
      // 전투를 즉시 승리 처리 (아군이 모든 적을 처치 → EXP 획득 + 점령)
      forceWin: () => {
        const killer = (this.hero && this.hero.alive ? this.hero : this.allies.find((a) => a.alive)) ?? null;
        for (const e of this.enemies.slice()) {
          if (e.alive) e.takeDamage(e.hp + 99999, this.ctx, killer);
        }
        return this.gameState;
      },
      // 전 아군 부대 즉시 탈출 (탈출 결과 검증)
      forceEscape: () => {
        for (const sr of this.allySquads()) this.setSquadOrder(sr.def.id, 'escape');
        for (const a of this.allies.slice()) this.escapeUnit(a);
        this.checkGameEnd();
        return this.gameState;
      },
      returnToStrategy: () => {
        this.returnToStrategy();
        return true;
      },
      // ---- 부대 명령 / 보스 / 투항 검증 ----
      squadInfos: () => this.getAllySquadInfos(),
      // squadId 기준으로 명령 설정. '이동'은 x,y 지점 필요.
      setSquadOrder: (squadId: number, order: SquadOrder, x?: number, y?: number) => {
        if (order === 'move' && x !== undefined && y !== undefined) this.applyMovePoint(squadId, x, y);
        else this.setSquadOrder(squadId, order);
        const sr = this.squads.find((s) => s.def.id === squadId);
        return sr ? sr.order : null;
      },
      // 부대 생존 멤버 위치 (이동량 검증)
      squadPositions: (squadId: number) => {
        const sr = this.squads.find((s) => s.def.id === squadId);
        if (!sr) return [];
        return sr.members.filter((m) => m.alive && !m.escaped).map((m) => ({ uid: m.uid, x: m.x, y: m.y }));
      },
      squadAlive: (squadId: number) => {
        const sr = this.squads.find((s) => s.def.id === squadId);
        return sr ? sr.members.filter((m) => m.alive && !m.escaped).length : 0;
      },
      escapedCount: () => this.escapees.length,
      // 보스 현황: [{squadId, alive, label, hp}]
      bossInfo: () =>
        this.enemies
          .concat(this.allies)
          .filter((u) => u.isBoss)
          .map((b) => ({ squadId: b.squadId, alive: b.alive, label: b.label, hp: Math.ceil(b.hp) })),
      bossAlive: () => this.enemies.filter((e) => e.isBoss && e.alive).length,
      // 특정 무리 보스 강제 처치 (없으면 -1)
      killBoss: (squadId: number) => {
        const b = this.enemies.find((e) => e.isBoss && e.squadId === squadId && e.alive);
        if (!b) return -1;
        b.takeDamage(b.hp + 9999, this.ctx, this.hero);
        return squadId;
      },
      killAllBosses: () => {
        let n = 0;
        for (const b of this.enemies.slice()) {
          if (b.isBoss && b.alive) {
            b.takeDamage(b.hp + 9999, this.ctx, this.hero);
            n++;
          }
        }
        return n;
      },
      surrenderedCount: () => this.surrenderedGained,
      surrenderingCount: () =>
        this.enemies.filter((e) => e.surrenderState === 'surrendering').length +
        this.allies.filter((a) => a.surrenderState === 'surrendering').length,
      // 특정 적 강제 투항 개시 (연출/전환 검증)
      forceSurrender: (i: number) => {
        const e = this.enemies.filter((u) => !u.isBoss && u.surrenderState === 'none')[i];
        if (!e) return -1;
        this.beginSurrender(e);
        return e.uid;
      },
      moveTargeting: () => this.pendingMoveSquad !== null
    };
  }
}

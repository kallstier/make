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
  UnitType,
  SquadDef
} from '../config';
import { Unit, Faction, BattleContext } from '../units/Unit';
import { Hero } from '../units/Hero';
import { Soldier, SoldierKind } from '../units/Soldier';
import { Monster, MonsterKind } from '../units/Monster';
import { Projectile } from '../units/Projectile';
import { genBattlefield } from '../world/MapGen';
import { FloatingStick } from '../input/FloatingStick';
import { FRAME } from '../gen/spriteGen';

export type GameState = 'playing' | 'win' | 'lose';

const TYPE_NAME: Record<UnitType, string> = {
  hero: '영웅',
  melee: '검병',
  ranged: '궁병',
  spear: '창병',
  goblin: '고블린',
  goblinArcher: '고블린 궁수',
  oni: '오니'
};

interface SquadRuntime {
  def: SquadDef;
  members: Unit[];
  banner: Phaser.GameObjects.Image;
}

interface Spawn {
  type: UnitType;
  squadId: number;
  x: number;
  y: number;
}

export interface BattleResult {
  win: boolean;
  allyDead: number;
  enemyDead: number;
  heroKills: number;
  playerKills: number;
}

export class BattleScene extends Phaser.Scene {
  private hero!: Hero;
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

  // FX 풀
  private dmgPool: Phaser.GameObjects.Text[] = [];
  private sparkPool: Phaser.GameObjects.Image[] = [];

  private ctx!: BattleContext;

  constructor() {
    super('BattleScene');
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
      spawnDamageNumber: (x, y, a, f) => this.spawnDamageNumber(x, y, a, f),
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
      rallyPoint: (f) => (f === 'ally' ? this.enemyCentroid : this.allyCentroid)
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

    // 조작 대상 = 영웅
    this.controlled = this.hero;
    this.selected = this.hero;
    this.hero.playerControlled = true;

    this.selectRing = this.add.image(this.hero.x, this.hero.y, 'selectRing').setDepth(6);
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

  // ---------- 스폰 ----------
  private spawnArmies() {
    const allySquads = SQUADS.filter((s) => s.faction === 'ally');
    const enemySquads = SQUADS.filter((s) => s.faction === 'enemy');
    const spawns = [
      ...this.layoutFaction(allySquads, 'ally'),
      ...this.layoutFaction(enemySquads, 'enemy')
    ];

    // 부대 런타임 준비
    for (const def of SQUADS) {
      const banner = this.add.image(0, 0, `banner_${def.id}`).setDepth(14).setVisible(false);
      this.squads.push({ def, members: [], banner });
    }

    const labelCount = new Map<string, number>();
    for (const sp of spawns) {
      const u = this.createUnit(sp);
      const sqName = SQUADS[sp.squadId].name;
      const key = `${sp.squadId}_${sp.type}`;
      const idx = (labelCount.get(key) ?? 0) + 1;
      labelCount.set(key, idx);
      u.label = sp.type === 'hero' ? `${sqName} 영웅` : `${sqName} ${TYPE_NAME[sp.type]} #${idx}`;
      this.squads[this.squads.findIndex((r) => r.def.id === sp.squadId)].members.push(u);
    }
  }

  private layoutFaction(squads: SquadDef[], faction: Faction): Spawn[] {
    const blocks = squads.map((sq) => {
      const total = sq.composition.reduce((a, c) => a + c.count, 0);
      const width = Math.ceil(total / FORMATION.cols); // 횡대 폭(유닛 수)
      return { sq, total, width };
    });
    const totalH = blocks.reduce((a, b) => a + b.width * FORMATION.rowSpacing, 0) + (blocks.length - 1) * FORMATION.squadGap;
    let cursorY = WORLD.height / 2 - totalH / 2;
    const spawns: Spawn[] = [];

    for (const b of blocks) {
      const blockH = b.width * FORMATION.rowSpacing;
      const centerY = cursorY + blockH / 2;
      // 유닛 타입 나열 후 근접(front)→원거리(back) 정렬
      const types: UnitType[] = [];
      for (const c of b.sq.composition) for (let k = 0; k < c.count; k++) types.push(c.type);
      types.sort((a, z) => this.roleRank(a) - this.roleRank(z));

      types.forEach((t, i) => {
        const depth = Math.floor(i / b.width); // 0 = 최전선
        const lat = i % b.width;
        const bx =
          faction === 'ally'
            ? FORMATION.allyLineX - depth * FORMATION.colSpacing
            : FORMATION.enemyLineX + depth * FORMATION.colSpacing;
        const by = centerY + (lat - (b.width - 1) / 2) * FORMATION.rowSpacing;
        const jx = (Math.random() - 0.5) * 2 * FORMATION.jitter;
        const jy = (Math.random() - 0.5) * 2 * FORMATION.jitter;
        spawns.push({ type: t, squadId: b.sq.id, x: bx + jx, y: by + jy });
      });
      cursorY += blockH + FORMATION.squadGap;
    }
    return spawns;
  }

  private roleRank(t: UnitType): number {
    return t === 'ranged' || t === 'goblinArcher' ? 1 : 0; // 원거리 후열
  }

  private createUnit(sp: Spawn): Unit {
    if (sp.type === 'hero') {
      this.hero = new Hero(this, sp.x, sp.y, sp.squadId);
      this.allyGroup.add(this.hero);
      this.allies.push(this.hero);
      return this.hero;
    }
    if (sp.type === 'melee' || sp.type === 'ranged' || sp.type === 'spear') {
      const s = new Soldier(this, sp.x, sp.y, sp.type as SoldierKind, sp.squadId);
      this.allyGroup.add(s);
      this.allies.push(s);
      return s;
    }
    const m = new Monster(this, sp.x, sp.y, sp.type as MonsterKind, sp.squadId);
    this.enemyGroup.add(m);
    this.enemies.push(m);
    return m;
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

    // 조작 중이던 유닛 사망 → 영웅 복귀
    if (unit === this.controlled && unit !== this.hero && this.hero.alive) {
      this.possessHeroFallback();
    }
    // 정보 선택 대상 사망 → 조작 유닛으로 되돌림
    if (unit === this.selected) {
      this.selected = this.controlled && this.controlled.alive ? this.controlled : this.hero;
    }
  }

  private possessHeroFallback() {
    this.controlled = this.hero;
    this.hero.playerControlled = true;
    this.hero.setMoveInput(0, 0);
    this.cameras.main.startFollow(this.hero, true, 0.08, 0.08);
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

  private spawnDamageNumber(x: number, y: number, amount: number, faction: Faction) {
    const t = this.dmgPool.find((d) => !d.active);
    if (!t) return;
    t.setActive(true).setVisible(true);
    t.setText(String(amount));
    t.setColor(faction === 'ally' ? '#ff9a9a' : '#fff2c0');
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
  requestSkill() {
    if (this.gameState !== 'playing' || !this.hero.alive) return;
    if (this.controlled !== this.hero) return;
    const now = this.time.now;
    if (this.hero.tryUseSkill(this.ctx, now)) {
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

  restart() {
    this.scene.stop('UIScene');
    this.scene.restart();
    this.scene.launch('UIScene');
  }

  // ---------- UI 게터 ----------
  getHeroHp() {
    return { hp: Math.max(0, Math.ceil(this.hero?.hp ?? 0)), max: HERO.hp };
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
    const u = this.selected && this.selected.alive ? this.selected : this.controlled;
    if (!u || !u.alive) return null;
    return {
      label: u.label,
      typeName: TYPE_NAME[u.unitType],
      hp: Math.max(0, Math.ceil(u.hp)),
      max: u.maxHp,
      kills: u.kills,
      faction: u.faction,
      textureKey: u.texture.key,
      possessed: u === this.controlled
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

    if (this.controlled && this.controlled.alive) this.controlled.playerUpdate(delta, this.ctx);
    if (this.hero.alive && this.controlled !== this.hero) this.hero.aiTick(delta, this.ctx);

    const group = this.frameCount % AI.tickGroups;
    for (const a of this.allies) {
      if (a === this.controlled) continue;
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
      const lead = sr.members.find((m) => m.alive);
      if (lead) {
        sr.banner.setVisible(true);
        sr.banner.setPosition(lead.x, lead.y - lead.height * 0.5 - 8);
      } else {
        sr.banner.setVisible(false);
      }
    }

    // 투사체
    for (const p of this.projectiles) if (p.active) p.tick(delta, this.ctx);

    // HP바 (배치 렌더 — 단일 Graphics)
    this.hpGfx.clear();
    for (const a of this.allies) a.drawHpBarInto(this.hpGfx);
    for (const e of this.enemies) e.drawHpBarInto(this.hpGfx);

    this.checkGameEnd();
  }

  private handleInput() {
    if (Phaser.Input.Keyboard.JustDown(this.keys.tab)) {
      if (this.hero.alive) {
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
  }

  private checkGameEnd() {
    if (this.gameState !== 'playing') return;
    let ended: GameState | null = null;
    if (!this.hero.alive) ended = 'lose';
    else if (this.enemies.length === 0) ended = 'win';
    else if (this.allies.length <= Math.ceil(this.allyStart * OUTCOME.routRatio)) ended = 'lose';
    if (!ended) return;
    this.gameState = ended;
    this.result = {
      win: ended === 'win',
      allyDead: this.allyDead,
      enemyDead: this.enemyDead,
      heroKills: this.hero ? this.hero.kills : 0,
      playerKills: this.playerKills
    };
    this.cameras.main.stopFollow();
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
      infoLabel: () => (this.getInfoUnit() ? this.getInfoUnit()!.label : null),
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
      result: () => this.result
    };
  }
}

import Phaser from 'phaser';
import { WORLD, HERO, STRONGHOLD, START_ALLY_SOLDIERS, AI, TAP } from '../config';
import { Unit, Faction, BattleContext } from '../units/Unit';
import { Hero } from '../units/Hero';
import { Soldier } from '../units/Soldier';
import { Monster, MonsterKind } from '../units/Monster';
import { Projectile } from '../units/Projectile';
import { Stronghold, StrongholdDef } from '../world/Stronghold';
import { genWorldBackground } from '../world/MapGen';
import { FloatingStick } from '../input/FloatingStick';

const MAX_ENEMIES = 70;
const MAX_ALLIES = 70;

export type GameState = 'playing' | 'win' | 'lose';

const STRONGHOLD_DEFS: StrongholdDef[] = [
  { id: 'hanyang', name: '한양', x: 360, y: 1180, owner: 'ally' },
  { id: 'pyongyang', name: '평양', x: 520, y: 460, owner: 'enemy' },
  { id: 'beijing', name: '베이징', x: 1200, y: 300, owner: 'enemy' },
  { id: 'shanghai', name: '상하이', x: 1950, y: 720, owner: 'enemy' },
  { id: 'kyoto', name: '교토', x: 1980, y: 1360, owner: 'enemy' }
];

export class BattleScene extends Phaser.Scene {
  private hero!: Hero;
  private allies: Soldier[] = [];
  private enemies: Monster[] = [];
  private strongholds: Stronghold[] = [];

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

  // 유닛 전환(빙의)
  private controlled!: Unit;             // 현재 조작 중인 아군 유닛
  private selectRing!: Phaser.GameObjects.Image;
  private tapDownTime = 0;
  private tapDownX = 0;
  private tapDownY = 0;

  private frameCount = 0;
  private gameState: GameState = 'playing';

  // 스폰 그리드 (타겟 탐색용)
  private allyGrid = new Map<number, Unit[]>();
  private enemyGrid = new Map<number, Unit[]>();

  private captureInfo: { name: string; progress: number } | null = null;
  private ctx!: BattleContext;

  constructor() {
    super('BattleScene');
  }

  create() {
    this.gameState = 'playing';
    this.frameCount = 0;
    this.allies = [];
    this.enemies = [];
    this.strongholds = [];
    this.projectiles = [];
    this.captureInfo = null;

    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);

    // 배경 + 데코
    const decos = genWorldBackground(
      this,
      STRONGHOLD_DEFS.map((d) => ({ x: d.x, y: d.y }))
    );
    this.add.image(0, 0, 'worldbg').setOrigin(0, 0).setDepth(0);
    for (const d of decos) {
      const img = this.add.image(d.x, d.y, d.type === 'tree' ? 'tree' : 'rock');
      img.setDepth(2);
    }

    // 그룹
    this.allyGroup = this.physics.add.group();
    this.enemyGroup = this.physics.add.group();

    // 전장 컨텍스트
    this.ctx = {
      time: 0,
      findNearestEnemy: (f, x, y, r) => this.findNearestEnemy(f, x, y, r),
      spawnProjectile: (x, y, t, dmg, f, s) => this.spawnProjectile(x, y, t, dmg, f, s),
      onUnitDied: (u) => this.onUnitDied(u),
      emitDeathParticles: (x, y, c) => this.emitDeathParticles(x, y, c),
      heroRef: () => (this.hero && this.hero.alive ? this.hero : null),
      controlledRef: () =>
        this.controlled && this.controlled.alive
          ? this.controlled
          : this.hero && this.hero.alive
          ? this.hero
          : null
    };

    // 거점
    for (const def of STRONGHOLD_DEFS) {
      const s = new Stronghold(this, def);
      this.strongholds.push(s);
      // 적 거점 초기 수비대
      if (def.owner === 'enemy') {
        const n = 3 + Math.floor(Math.random() * 2);
        for (let i = 0; i < n; i++) {
          this.spawnMonster(def.x, def.y, Math.random() < 0.75 ? 'goblin' : 'oni');
        }
      }
    }

    // 영웅 (한양에서 시작)
    const start = STRONGHOLD_DEFS[0];
    this.hero = new Hero(this, start.x + 40, start.y + 40);
    this.allyGroup.add(this.hero);

    // 아군 병사
    for (let i = 0; i < START_ALLY_SOLDIERS; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 40 + Math.random() * 120;
      this.spawnSoldier(
        start.x + Math.cos(a) * r,
        start.y + Math.sin(a) * r,
        Math.random() < 0.6 ? 'melee' : 'ranged'
      );
    }

    // 투사체 풀
    for (let i = 0; i < 40; i++) {
      this.projectiles.push(new Projectile(this));
    }

    // 물리 충돌: 같은 진영끼리 겹침 방지
    this.physics.add.collider(this.allyGroup, this.allyGroup);
    this.physics.add.collider(this.enemyGroup, this.enemyGroup);

    // 조작 대상: 시작은 영웅
    this.controlled = this.hero;
    this.hero.playerControlled = true;

    // 조작 유닛 발밑 선택 링
    this.selectRing = this.add.image(this.hero.x, this.hero.y, 'selectRing');
    this.selectRing.setDepth(6);
    this.tweens.add({
      targets: this.selectRing,
      alpha: { from: 0.6, to: 1 },
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut'
    });

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
    // Tab 기본 포커스 이동 방지
    kb.addCapture('TAB');

    // 아군 유닛 탭/클릭 -> 조작 전환
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointerup', this.onPointerUp, this);

    // 카메라 추적 (부드러운 lerp)
    this.cameras.main.startFollow(this.controlled, true, 0.08, 0.08);
    this.cameras.main.setZoom(1);

    // 디버그 훅 (자동화 테스트에서 좌표/상태 확인용)
    (window as any).__debug = {
      heroPos: () => (this.hero && this.hero.alive ? { x: this.hero.x, y: this.hero.y } : null),
      controlledPos: () =>
        this.controlled && this.controlled.alive ? { x: this.controlled.x, y: this.controlled.y } : null,
      controlledUid: () => (this.controlled ? this.controlled.uid : -1),
      controllingHero: () => this.controlled === this.hero,
      state: () => this.gameState,
      allyCount: () => this.allies.length,
      enemyCount: () => this.enemies.length,
      selectAlly: (i: number) => {
        const u = this.allies[i];
        if (u && u.alive) this.selectUnit(u);
        return u ? u.uid : -1;
      }
    };
  }

  // ---------- 유닛 전환(빙의) ----------
  private onPointerDown(pointer: Phaser.Input.Pointer) {
    this.tapDownTime = this.time.now;
    this.tapDownX = pointer.x;
    this.tapDownY = pointer.y;
  }

  private onPointerUp(pointer: Phaser.Input.Pointer) {
    if (this.gameState !== 'playing') return;
    const dur = this.time.now - this.tapDownTime;
    const moved = Math.hypot(pointer.x - this.tapDownX, pointer.y - this.tapDownY);
    // 탭 판정 실패 -> 스틱(드래그) 로직에 맡김
    if (dur > TAP.maxDurationMs || moved > TAP.maxMoveDist) return;
    const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const target = this.pickAllyAt(wp.x, wp.y);
    if (target) this.selectUnit(target);
  }

  // 월드 좌표에서 가장 가까운 아군 유닛(영웅/병사) 선택
  private pickAllyAt(wx: number, wy: number): Unit | null {
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
    if (this.hero && this.hero.alive) consider(this.hero);
    for (const a of this.allies) consider(a);
    return best;
  }

  private selectUnit(u: Unit) {
    if (!u.alive || u === this.controlled) return;
    if (this.controlled && this.controlled.alive) {
      this.controlled.playerControlled = false;
      this.controlled.setMoveInput(0, 0);
      this.halt(this.controlled);
    }
    this.controlled = u;
    u.playerControlled = true;
    u.setMoveInput(0, 0);
    this.cameras.main.startFollow(u, true, 0.08, 0.08);
  }

  private halt(u: Unit) {
    const body = u.body as Phaser.Physics.Arcade.Body | null;
    if (body) body.setVelocity(0, 0);
  }

  // ---------- 스폰 ----------
  private spawnSoldier(x: number, y: number, kind: 'melee' | 'ranged') {
    if (this.allies.length >= MAX_ALLIES) return;
    const s = new Soldier(this, x, y, kind);
    this.allies.push(s);
    this.allyGroup.add(s);
  }

  private spawnMonster(x: number, y: number, kind: MonsterKind, isRaid = false) {
    if (this.enemies.length >= MAX_ENEMIES) return;
    const m = new Monster(this, x, y, kind, isRaid);
    this.enemies.push(m);
    this.enemyGroup.add(m);
    return m;
  }

  private spawnProjectile(x: number, y: number, target: Unit, damage: number, faction: Faction, speed: number) {
    let p = this.projectiles.find((pr) => !pr.active);
    if (!p) {
      p = new Projectile(this);
      this.projectiles.push(p);
    }
    p.fire(x, y, target, damage, faction, speed);
  }

  // ---------- 사망 처리 ----------
  private onUnitDied(unit: Unit) {
    if (unit.faction === 'ally') {
      const i = this.allies.findIndex((a) => a.uid === unit.uid);
      if (i >= 0) this.allies.splice(i, 1);
    } else {
      const i = this.enemies.findIndex((e) => e.uid === unit.uid);
      if (i >= 0) this.enemies.splice(i, 1);
    }
    // 조작 중이던 병사가 죽으면 영웅에게 조작 복귀
    if (unit === this.controlled && unit !== this.hero && this.hero.alive) {
      this.controlled = this.hero;
      this.hero.playerControlled = true;
      this.hero.setMoveInput(0, 0);
      this.cameras.main.startFollow(this.hero, true, 0.08, 0.08);
    }
  }

  private emitDeathParticles(x: number, y: number, color: number) {
    const key =
      color === 0x8a3bd2 ? 'p_oni' : color === 0x3b6ef0 ? 'p_ally' : color === 0xffd23b ? 'p_hero' : 'p_enemy';
    const emitter = this.add.particles(x, y, key, {
      speed: { min: 40, max: 120 },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 },
      lifespan: 420,
      quantity: 8,
      emitting: false
    });
    emitter.setDepth(18);
    emitter.explode(8);
    this.time.delayedCall(500, () => emitter.destroy());
  }

  // ---------- 타겟 탐색 (그리드) ----------
  private cellKey(x: number, y: number): number {
    const cx = Math.floor(x / AI.gridCellSize);
    const cy = Math.floor(y / AI.gridCellSize);
    return cx * 1000 + cy;
  }

  private rebuildGrids() {
    this.allyGrid.clear();
    this.enemyGrid.clear();
    const push = (grid: Map<number, Unit[]>, u: Unit) => {
      if (!u.alive) return;
      const k = this.cellKey(u.x, u.y);
      let arr = grid.get(k);
      if (!arr) {
        arr = [];
        grid.set(k, arr);
      }
      arr.push(u);
    };
    if (this.hero && this.hero.alive) push(this.allyGrid, this.hero);
    for (const a of this.allies) push(this.allyGrid, a);
    for (const e of this.enemies) push(this.enemyGrid, e);
  }

  // searcherFaction 기준으로 반대 진영에서 가장 가까운 유닛
  findNearestEnemy(searcherFaction: Faction, x: number, y: number, range: number): Unit | null {
    const grid = searcherFaction === 'ally' ? this.enemyGrid : this.allyGrid;
    const reach = Math.ceil(range / AI.gridCellSize);
    const cx = Math.floor(x / AI.gridCellSize);
    const cy = Math.floor(y / AI.gridCellSize);
    let best: Unit | null = null;
    let bestD = range * range;
    for (let gx = cx - reach; gx <= cx + reach; gx++) {
      for (let gy = cy - reach; gy <= cy + reach; gy++) {
        const arr = grid.get(gx * 1000 + gy);
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

  // ---------- 스킬 ----------
  requestSkill() {
    if (this.gameState !== 'playing' || !this.hero.alive) return;
    // 스킬은 영웅 조작 중에만 사용 가능
    if (this.controlled !== this.hero) return;
    const now = this.time.now;
    if (this.hero.tryUseSkill(this.ctx, now)) {
      // 반경 내 모든 적에게 대미지
      const r2 = HERO.skillRadius * HERO.skillRadius;
      const targets = this.enemies.slice();
      for (const e of targets) {
        const dx = e.x - this.hero.x;
        const dy = e.y - this.hero.y;
        if (dx * dx + dy * dy <= r2) {
          e.takeDamage(HERO.skillDamage, this.ctx);
        }
      }
    }
  }

  getSkillCdRatio(): number {
    if (!this.hero) return 1;
    return this.hero.skillCooldownRatio(this.time.now);
  }

  // ---------- UI용 게터 ----------
  getHeroHp() {
    return { hp: Math.max(0, Math.ceil(this.hero?.hp ?? 0)), max: HERO.hp };
  }
  isControllingHero() {
    return this.controlled === this.hero;
  }
  // 현재 조작 중인 유닛의 HP + 라벨 (HUD 메인 바용)
  getControlledHp() {
    const u = this.controlled;
    if (!u || u === this.hero) {
      return { hp: Math.max(0, Math.ceil(this.hero?.hp ?? 0)), max: HERO.hp, label: '영웅' };
    }
    let label = '병사';
    const kind = (u as Soldier).kind;
    if (kind === 'melee') label = '검병';
    else if (kind === 'ranged') label = '궁병';
    return { hp: Math.max(0, Math.ceil(u.hp)), max: u.maxHp, label };
  }
  getAllyCount() {
    return this.allies.length;
  }
  getStrongholdCounts() {
    const ally = this.strongholds.filter((s) => s.owner === 'ally').length;
    return { ally, total: this.strongholds.length };
  }
  getCaptureInfo() {
    return this.captureInfo;
  }
  getGameState() {
    return this.gameState;
  }

  restart() {
    this.scene.stop('UIScene');
    this.scene.restart();
    this.scene.launch('UIScene');
  }

  // ---------- 메인 루프 ----------
  update(time: number, delta: number) {
    if (this.gameState !== 'playing') return;
    this.ctx.time = time;
    this.frameCount++;

    // 입력 -> 조작 유닛 이동
    this.handleInput();

    // 그리드 재구성 (매 프레임 — 유닛 수 적당해 저렴)
    this.rebuildGrids();

    // 조작 중인 유닛: 플레이어 입력으로 갱신 (AI 정지)
    if (this.controlled && this.controlled.alive) {
      this.controlled.playerUpdate(delta, this.ctx);
    }

    // 조작하지 않는 영웅: 자율 AI (단일 유닛이라 매 프레임 처리)
    if (this.hero.alive && this.controlled !== this.hero) {
      this.hero.aiTick(delta, this.ctx);
    }

    // 스태거드 AI 틱 (조작 중인 유닛은 제외)
    const group = this.frameCount % AI.tickGroups;
    for (const a of this.allies) {
      if (a === this.controlled) continue;
      if (a.uid % AI.tickGroups === group) a.aiTick(delta, this.ctx);
    }
    for (const e of this.enemies) {
      if (e.uid % AI.tickGroups === group) e.aiTick(delta, this.ctx);
    }

    // 선택 링을 조작 유닛 발밑에 배치
    if (this.controlled && this.controlled.alive) {
      this.selectRing.setVisible(true);
      this.selectRing.setPosition(this.controlled.x, this.controlled.y + this.controlled.height * 0.28);
    } else {
      this.selectRing.setVisible(false);
    }

    // 투사체
    for (const p of this.projectiles) {
      if (p.active) p.tick(delta, this.ctx);
    }

    // HP바 갱신
    if (this.hero.alive) this.hero.drawHpBar();
    for (const a of this.allies) a.drawHpBar();
    for (const e of this.enemies) e.drawHpBar();

    // 거점 로직
    this.updateStrongholds(time, delta);

    // 승패 판정
    this.checkGameEnd();
  }

  private handleInput() {
    // Tab: 영웅으로 조작 복귀
    if (Phaser.Input.Keyboard.JustDown(this.keys.tab)) {
      if (this.hero.alive) this.selectUnit(this.hero);
    }

    let vx = 0;
    let vy = 0;
    // 키보드
    if (this.keys.left.isDown || this.cursors.left.isDown) vx -= 1;
    if (this.keys.right.isDown || this.cursors.right.isDown) vx += 1;
    if (this.keys.up.isDown || this.cursors.up.isDown) vy -= 1;
    if (this.keys.down.isDown || this.cursors.down.isDown) vy += 1;
    // 조이스틱 (활성 시 우선)
    if (this.stick.isActive()) {
      vx = this.stick.vecX;
      vy = this.stick.vecY;
    }
    if (this.controlled && this.controlled.alive) {
      this.controlled.setMoveInput(vx, vy);
    }

    // 스페이스 스킬 (영웅 조작 중에만)
    if (Phaser.Input.Keyboard.JustDown(this.keys.space)) {
      this.requestSkill();
    }
  }

  private updateStrongholds(time: number, delta: number) {
    this.captureInfo = null;
    for (const s of this.strongholds) {
      if (s.owner === 'ally') {
        // 아군 거점: (스코프상) 적에게 점령당하지 않음. 리셋만.
        s.captureProgress = 0;
        continue;
      }

      // 적 거점: 반경 내 수비대 수 & 아군 수 계산
      let enemiesInside = 0;
      for (const e of this.enemies) {
        if (s.contains(e.x, e.y)) enemiesInside++;
      }
      let alliesInside = 0;
      if (this.hero.alive && s.contains(this.hero.x, this.hero.y)) alliesInside++;
      for (const a of this.allies) {
        if (s.contains(a.x, a.y)) alliesInside++;
      }

      // 점령 진행: 수비 전멸 + 아군 존재
      if (enemiesInside === 0 && alliesInside > 0) {
        s.captureProgress += delta / STRONGHOLD.captureTime;
        if (s.captureProgress >= 1) {
          this.captureStronghold(s);
        } else {
          this.captureInfo = { name: s.name, progress: s.captureProgress };
        }
      } else {
        // 되돌림
        s.captureProgress = Math.max(0, s.captureProgress - (delta / STRONGHOLD.captureTime) * 0.5);
      }

      // 수비대 리스폰
      if (time > s.nextGarrison && enemiesInside < STRONGHOLD.garrisonMax) {
        s.nextGarrison = time + STRONGHOLD.garrisonRespawn;
        const a = Math.random() * Math.PI * 2;
        const r = 40 + Math.random() * 60;
        this.spawnMonster(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r, Math.random() < 0.8 ? 'goblin' : 'oni');
      }

      // 습격대 파견
      if (time > s.nextRaid) {
        s.nextRaid = time + STRONGHOLD.raidInterval + Math.random() * 6000;
        this.launchRaid(s);
      }
    }
  }

  private captureStronghold(s: Stronghold) {
    s.setOwner('ally');
    // 증원 스폰
    for (let i = 0; i < STRONGHOLD.captureReinforce; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 30 + Math.random() * 60;
      this.spawnSoldier(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r, Math.random() < 0.6 ? 'melee' : 'ranged');
    }
    // 점령 플래시
    this.cameras.main.flash(200, 80, 140, 255);
  }

  private launchRaid(from: Stronghold) {
    // 가장 가까운 아군 거점 방향으로 소규모 습격대
    const allyStrongholds = this.strongholds.filter((s) => s.owner === 'ally');
    if (allyStrongholds.length === 0) return;
    let target = allyStrongholds[0];
    let bd = Infinity;
    for (const t of allyStrongholds) {
      const d = Phaser.Math.Distance.Between(from.x, from.y, t.x, t.y);
      if (d < bd) {
        bd = d;
        target = t;
      }
    }
    const n = STRONGHOLD.raidMin + Math.floor(Math.random() * (STRONGHOLD.raidMax - STRONGHOLD.raidMin + 1));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 30 + Math.random() * 50;
      const m = this.spawnMonster(from.x + Math.cos(a) * r, from.y + Math.sin(a) * r, Math.random() < 0.85 ? 'goblin' : 'oni', true);
      if (m) m.setRaidTarget(target.x + (Math.random() - 0.5) * 120, target.y + (Math.random() - 0.5) * 120);
    }
  }

  private checkGameEnd() {
    if (!this.hero.alive) {
      this.gameState = 'lose';
      return;
    }
    const counts = this.getStrongholdCounts();
    if (counts.ally >= counts.total) {
      this.gameState = 'win';
    }
  }
}

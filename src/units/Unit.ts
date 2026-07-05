import Phaser from 'phaser';

export type Faction = 'ally' | 'enemy';

// BattleScene가 유닛에게 제공하는 전장 컨텍스트 (순환 참조 회피용 인터페이스)
export interface BattleContext {
  time: number;
  findNearestEnemy(faction: Faction, x: number, y: number, range: number): Unit | null;
  spawnProjectile(x: number, y: number, target: Unit, damage: number, faction: Faction, speed: number): void;
  onUnitDied(unit: Unit): void;
  emitDeathParticles(x: number, y: number, color: number): void;
  heroRef(): Unit | null;
  // 현재 플레이어가 조작(빙의) 중인 유닛. 아군 AI의 추종 기준점.
  controlledRef(): Unit | null;
}

export interface UnitConfig {
  texture: string;
  faction: Faction;
  hp: number;
  speed: number;
  particleColor: number;
}

let _uid = 0;

export abstract class Unit extends Phaser.Physics.Arcade.Sprite {
  readonly uid: number;
  faction: Faction;
  hp: number;
  maxHp: number;
  speed: number;
  particleColor: number;

  alive = true;
  aiGroup = 0; // 스태거드 AI 틱 그룹 인덱스

  // 플레이어 조작(빙의) 상태 및 이동 입력 벡터
  playerControlled = false;
  protected moveVec = new Phaser.Math.Vector2(0, 0);

  protected hpBar: Phaser.GameObjects.Graphics;
  protected lastAttack = 0;
  protected flashUntil = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, cfg: UnitConfig) {
    super(scene, x, y, cfg.texture, 0);
    this.uid = _uid++;
    this.faction = cfg.faction;
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.speed = cfg.speed;
    this.particleColor = cfg.particleColor;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(this.width * 0.32, this.width * 0.18, this.height * 0.36);
    body.setCollideWorldBounds(true);

    this.hpBar = scene.add.graphics();
    this.hpBar.setDepth(20);

    this.aiGroup = this.uid; // 나중에 modulo로 그룹핑
  }

  // 걷기 애니메이션 프레임 토글 (텍스처별 애니 대신 수동 프레임)
  protected walkTimer = 0;
  protected frameIndex = 0;
  protected animateWalk(dt: number, moving: boolean) {
    if (!moving) {
      if (this.frameIndex !== 0) {
        this.frameIndex = 0;
        this.setFrame(0);
      }
      return;
    }
    this.walkTimer += dt;
    if (this.walkTimer > 140) {
      this.walkTimer = 0;
      this.frameIndex = this.frameIndex === 0 ? 1 : 0;
      this.setFrame(this.frameIndex);
    }
  }

  takeDamage(amount: number, ctx: BattleContext) {
    if (!this.alive) return;
    this.hp -= amount;
    this.flashUntil = ctx.time + 90;
    this.setTintFill(0xffffff);
    if (this.hp <= 0) {
      this.die(ctx);
    }
  }

  protected die(ctx: BattleContext) {
    if (!this.alive) return;
    this.alive = false;
    ctx.emitDeathParticles(this.x, this.y, this.particleColor);
    ctx.onUnitDied(this);
    this.hpBar.destroy();
    this.destroy();
  }

  protected updateFlash(ctx: BattleContext) {
    if (this.flashUntil && ctx.time > this.flashUntil) {
      this.flashUntil = 0;
      this.clearTint();
    }
  }

  drawHpBar() {
    const g = this.hpBar;
    g.clear();
    if (!this.alive) return;
    if (this.hp >= this.maxHp) return; // 풀피면 숨김
    const w = Math.max(14, this.width * 0.7);
    const h = 3;
    const x = this.x - w / 2;
    const y = this.y - this.height * 0.5 - 6;
    g.fillStyle(0x000000, 0.6);
    g.fillRect(x - 1, y - 1, w + 2, h + 2);
    const ratio = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    const col = this.faction === 'ally' ? 0x4ce04c : 0xe04c4c;
    g.fillStyle(col, 1);
    g.fillRect(x, y, w * ratio, h);
  }

  // 목표 방향으로 이동 (arrive 근처면 감속 정지)
  protected moveToward(tx: number, ty: number, stopDist: number): boolean {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (dist <= stopDist) {
      body.setVelocity(0, 0);
      return false;
    }
    body.setVelocity((dx / dist) * this.speed, (dy / dist) * this.speed);
    if (dx < -2) this.setFlipX(true);
    else if (dx > 2) this.setFlipX(false);
    return true;
  }

  protected halt() {
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
  }

  // ---------- 플레이어 조작(빙의) ----------
  // 정규화된 이동 입력 (-1..1). 스틱/키보드 공통.
  setMoveInput(x: number, y: number) {
    this.moveVec.set(x, y);
  }

  // 조작 중 매 프레임 호출: 이동 + 사거리 내 자동공격
  playerUpdate(dt: number, ctx: BattleContext) {
    if (!this.alive) return;
    this.playerMove(dt);
    this.playerAttack(ctx);
    this.updateFlash(ctx);
  }

  protected playerMove(dt: number) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const len = this.moveVec.length();
    if (len > 0.01) {
      const nx = this.moveVec.x / Math.max(len, 1);
      const ny = this.moveVec.y / Math.max(len, 1);
      const mag = Math.min(len, 1);
      body.setVelocity(nx * this.speed * mag, ny * this.speed * mag);
      if (this.moveVec.x < -0.05) this.setFlipX(true);
      else if (this.moveVec.x > 0.05) this.setFlipX(false);
      this.animateWalk(dt, true);
    } else {
      body.setVelocity(0, 0);
      this.animateWalk(dt, false);
    }
  }

  // 조작 중 자동공격 (유닛별 오버라이드). 기본은 없음.
  protected playerAttack(_ctx: BattleContext): void {
    /* 서브클래스에서 구현 */
  }

  abstract aiTick(dt: number, ctx: BattleContext): void;
}

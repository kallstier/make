import Phaser from 'phaser';
import type { UnitType } from '../config';
import { CROWD } from '../config';
import { FRAME } from '../gen/spriteGen';

export type Faction = 'ally' | 'enemy';

// BattleScene가 유닛에게 제공하는 전장 컨텍스트 (순환 참조 회피용 인터페이스)
export interface BattleContext {
  time: number;
  findNearestEnemy(faction: Faction, x: number, y: number, range: number): Unit | null;
  spawnProjectile(x: number, y: number, target: Unit, damage: number, faction: Faction, speed: number): void;
  onUnitDied(unit: Unit, killer: Unit | null): void;
  spawnCorpse(unit: Unit): void;
  spawnDamageNumber(x: number, y: number, amount: number, faction: Faction): void;
  spawnSpark(x: number, y: number): void;
  emitBlood(x: number, y: number, color: number): void;
  heroRef(): Unit | null;
  // 현재 플레이어가 조작(빙의) 중인 유닛.
  controlledRef(): Unit | null;
  combatActive(): boolean; // 개전 대기(정렬) 종료 후 true → 전진/교전 개시
  rallyPoint(faction: Faction): { x: number; y: number } | null; // 상대 진영 중심(집결점)
}

// 병종별 전투 수치 (combatMelee/combatRanged 공용)
export interface CombatStats {
  detectRange: number;
  attackRange: number;
  attackDamage: number;
  attackCooldown: number;
  keepDist?: number;
  projectileSpeed?: number;
}

export interface UnitConfig {
  texture: string;
  faction: Faction;
  unitType: UnitType;
  squadId: number;
  hp: number;
  speed: number;
  knockback: number;
  particleColor: number;
}

let _uid = 0;

export abstract class Unit extends Phaser.Physics.Arcade.Sprite {
  readonly uid: number;
  faction: Faction;
  unitType: UnitType;
  squadId: number;
  hp: number;
  maxHp: number;
  speed: number;
  knockback: number;
  particleColor: number;
  kills = 0;
  label = '';

  alive = true;

  // 플레이어 조작(빙의) 상태 및 이동 입력 벡터
  playerControlled = false;
  protected moveVec = new Phaser.Math.Vector2(0, 0);

  // 중앙 집중식 속도 모델: AI/입력은 "희망 속도"만 세팅,
  // 최종 속도 = 희망 + 분리(separation) + 넉백 → 씬이 매 프레임 적용
  dvx = 0;
  dvy = 0;
  kbx = 0;
  kby = 0;

  protected lastAttack = 0;
  protected flashUntil = 0;
  protected attackFrameUntil = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, cfg: UnitConfig) {
    super(scene, x, y, cfg.texture, 0);
    this.uid = _uid++;
    this.faction = cfg.faction;
    this.unitType = cfg.unitType;
    this.squadId = cfg.squadId;
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.speed = cfg.speed;
    this.knockback = cfg.knockback;
    this.particleColor = cfg.particleColor;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    const body = this.body as Phaser.Physics.Arcade.Body;
    const r = this.width * 0.16; // 원형 충돌체
    body.setCircle(r, this.width * 0.5 - r, this.height * 0.62 - r);
    body.setCollideWorldBounds(true);
  }

  // 크라우드 분리 반경 (오니는 더 크게). 두 유닛 임계거리 = 양쪽 합.
  get sepRadius(): number {
    return CROWD.separationRadius * 0.5 * (this.unitType === 'oni' ? 1.6 : 1);
  }

  // 외부(씬)에서 조작 전환 시 정지
  stopMotion() {
    this.dvx = 0;
    this.dvy = 0;
    this.kbx = 0;
    this.kby = 0;
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (body) body.setVelocity(0, 0);
  }

  // 걷기 애니메이션 프레임 토글
  protected walkTimer = 0;
  protected frameIndex = 0;
  protected animateWalk(dt: number, moving: boolean) {
    if (this.scene && this.time_now() < this.attackFrameUntil) {
      this.setFrame(FRAME.ATTACK);
      return;
    }
    if (!moving) {
      if (this.frameIndex !== FRAME.WALK_A) {
        this.frameIndex = FRAME.WALK_A;
        this.setFrame(FRAME.WALK_A);
      }
      return;
    }
    this.walkTimer += dt;
    if (this.walkTimer > 150) {
      this.walkTimer = 0;
      this.frameIndex = this.frameIndex === FRAME.WALK_A ? FRAME.WALK_B : FRAME.WALK_A;
      this.setFrame(this.frameIndex);
    }
  }

  private time_now(): number {
    return (this.scene as Phaser.Scene).time.now;
  }

  takeDamage(amount: number, ctx: BattleContext, attacker: Unit | null = null) {
    if (!this.alive) return;
    this.hp -= amount;
    this.flashUntil = ctx.time + 90;
    this.setTintFill(0xffffff);
    ctx.spawnDamageNumber(this.x, this.y - this.height * 0.42, Math.round(amount), this.faction);
    ctx.spawnSpark(this.x, this.y - this.height * 0.2);
    // 넉백 (공격자 반대 방향)
    if (attacker && this.knockback > 0) {
      const dx = this.x - attacker.x;
      const dy = this.y - attacker.y;
      const d = Math.hypot(dx, dy) || 1;
      const imp = attacker.knockback * 34;
      this.kbx += (dx / d) * imp;
      this.kby += (dy / d) * imp;
    }
    if (this.hp <= 0) {
      if (attacker && attacker.alive) attacker.kills++;
      this.die(ctx, attacker);
    }
  }

  protected die(ctx: BattleContext, killer: Unit | null = null) {
    if (!this.alive) return;
    this.alive = false;
    ctx.emitBlood(this.x, this.y, this.particleColor);
    ctx.spawnCorpse(this);
    ctx.onUnitDied(this, killer);
    this.destroy();
  }

  protected updateFlash(ctx: BattleContext) {
    if (this.flashUntil && ctx.time > this.flashUntil) {
      this.flashUntil = 0;
      this.clearTint();
    }
  }

  // HP바를 씬의 공용 Graphics에 그린다 (배치 렌더 — 유닛별 Graphics 미사용)
  drawHpBarInto(g: Phaser.GameObjects.Graphics) {
    if (!this.alive || this.hp >= this.maxHp) return;
    const w = Math.max(16, this.width * 0.5);
    const h = 3;
    const x = this.x - w / 2;
    const y = this.y - this.height * 0.42 - 6;
    g.fillStyle(0x000000, 0.6);
    g.fillRect(x - 1, y - 1, w + 2, h + 2);
    const ratio = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    const col = this.faction === 'ally' ? 0x4ce04c : 0xe04c4c;
    g.fillStyle(col, 1);
    g.fillRect(x, y, w * ratio, h);
  }

  // 목표 방향으로 희망 속도 세팅 (arrive 근처면 정지)
  protected moveToward(tx: number, ty: number, stopDist: number, speedScale = 1): boolean {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= stopDist) {
      this.dvx = 0;
      this.dvy = 0;
      return false;
    }
    const sp = this.speed * speedScale;
    this.dvx = (dx / dist) * sp;
    this.dvy = (dy / dist) * sp;
    if (dx < -2) this.setFlipX(true);
    else if (dx > 2) this.setFlipX(false);
    return true;
  }

  protected halt() {
    this.dvx = 0;
    this.dvy = 0;
  }

  // 근접 공격 연출: 공격 프레임 + 대상 방향 짧은 런지
  protected attackVisual(ctx: BattleContext, tx: number, ty: number) {
    this.attackFrameUntil = ctx.time + 160;
    this.setFrame(FRAME.ATTACK);
    if (tx < this.x) this.setFlipX(true);
    else this.setFlipX(false);
    const ang = Math.atan2(ty - this.y, tx - this.x);
    const ox = this.x;
    const oy = this.y;
    this.scene.tweens.add({
      targets: this,
      x: ox + Math.cos(ang) * 4,
      y: oy + Math.sin(ang) * 4,
      duration: 70,
      yoyo: true,
      ease: 'Quad.Out'
    });
  }

  // ---------- 플레이어 조작(빙의) ----------
  setMoveInput(x: number, y: number) {
    this.moveVec.set(x, y);
  }

  playerUpdate(dt: number, ctx: BattleContext) {
    if (!this.alive) return;
    this.playerMove(dt);
    this.playerAttack(ctx);
    this.updateFlash(ctx);
  }

  protected playerMove(dt: number) {
    const len = this.moveVec.length();
    if (len > 0.01) {
      const nx = this.moveVec.x / Math.max(len, 1);
      const ny = this.moveVec.y / Math.max(len, 1);
      const mag = Math.min(len, 1);
      this.dvx = nx * this.speed * mag;
      this.dvy = ny * this.speed * mag;
      if (this.moveVec.x < -0.05) this.setFlipX(true);
      else if (this.moveVec.x > 0.05) this.setFlipX(false);
      this.animateWalk(dt, true);
    } else {
      this.dvx = 0;
      this.dvy = 0;
      this.animateWalk(dt, false);
    }
  }

  protected playerAttack(_ctx: BattleContext): void {
    /* 서브클래스에서 구현 */
  }

  // ---------- 자율 AI 공용 전투 루틴 ----------
  protected seekTarget(ctx: BattleContext, range: number): Unit | null {
    return ctx.findNearestEnemy(this.faction, this.x, this.y, range);
  }

  // 근처 적이 없을 때: 상대 진영 집결점(중심)으로 전진
  protected advance(dt: number, ctx: BattleContext) {
    const rally = ctx.rallyPoint(this.faction);
    if (rally) {
      this.moveToward(rally.x, rally.y, 24);
      this.animateWalk(dt, true);
      return;
    }
    const dir = this.faction === 'ally' ? 1 : -1;
    this.dvx = dir * this.speed;
    this.dvy = 0;
    this.setFlipX(dir < 0);
    this.animateWalk(dt, true);
  }

  protected combatMelee(dt: number, ctx: BattleContext, s: CombatStats) {
    if (!ctx.combatActive()) {
      this.halt();
      this.animateWalk(dt, false);
      return;
    }
    const e = this.seekTarget(ctx, s.detectRange);
    if (!e) {
      this.advance(dt, ctx);
      return;
    }
    const d = Math.hypot(e.x - this.x, e.y - this.y);
    if (d <= s.attackRange) {
      this.halt();
      if (ctx.time - this.lastAttack >= s.attackCooldown) {
        this.lastAttack = ctx.time;
        e.takeDamage(s.attackDamage, ctx, this);
        this.attackVisual(ctx, e.x, e.y);
      } else {
        this.animateWalk(dt, false);
      }
    } else {
      this.moveToward(e.x, e.y, s.attackRange - 4);
      this.animateWalk(dt, true);
    }
  }

  protected combatRanged(dt: number, ctx: BattleContext, s: CombatStats) {
    if (!ctx.combatActive()) {
      this.halt();
      this.animateWalk(dt, false);
      return;
    }
    const e = this.seekTarget(ctx, s.detectRange);
    if (!e) {
      this.advance(dt, ctx);
      return;
    }
    const d = Math.hypot(e.x - this.x, e.y - this.y);
    const keep = s.keepDist ?? s.attackRange * 0.5;
    // 사격
    if (d <= s.attackRange && ctx.time - this.lastAttack >= s.attackCooldown) {
      this.lastAttack = ctx.time;
      ctx.spawnProjectile(this.x, this.y - this.height * 0.28, e, s.attackDamage, this.faction, s.projectileSpeed ?? 420);
      if (e.x < this.x) this.setFlipX(true);
      else this.setFlipX(false);
    }
    // 이동: 너무 가까우면 후퇴, 너무 멀면 접근
    if (d < keep) {
      const ang = Math.atan2(this.y - e.y, this.x - e.x);
      this.dvx = Math.cos(ang) * this.speed;
      this.dvy = Math.sin(ang) * this.speed;
      this.setFlipX(e.x > this.x ? false : true);
      this.animateWalk(dt, true);
    } else if (d > s.attackRange) {
      this.moveToward(e.x, e.y, s.attackRange - 10);
      this.animateWalk(dt, true);
    } else {
      this.halt();
      this.animateWalk(dt, false);
    }
  }

  abstract aiTick(dt: number, ctx: BattleContext): void;
}

import { Unit, BattleContext } from './Unit';
import { SOLDIER, PALETTE } from '../config';
import { genUnit } from '../gen/spriteGen';

export type SoldierKind = 'melee' | 'ranged';

type FSM = 'follow' | 'engage' | 'retreat';

export class Soldier extends Unit {
  kind: SoldierKind;
  private fsm: FSM = 'follow';
  private retreatUntil = 0;
  private followOffsetX: number;
  private followOffsetY: number;

  static preload(scene: Phaser.Scene) {
    genUnit(scene, { key: 'soldier_melee', grid: 20, scale: 2, pal: PALETTE.ally, weapon: 'sword' });
    genUnit(scene, { key: 'soldier_ranged', grid: 18, scale: 2, pal: PALETTE.ally, weapon: 'bow' });
  }

  constructor(scene: Phaser.Scene, x: number, y: number, kind: SoldierKind) {
    super(scene, x, y, {
      texture: kind === 'melee' ? 'soldier_melee' : 'soldier_ranged',
      faction: 'ally',
      hp: SOLDIER.hp,
      speed: SOLDIER.speed,
      particleColor: PALETTE.ally.body
    });
    this.kind = kind;
    this.setDepth(8);
    // 영웅 주변 느슨한 대형용 랜덤 오프셋
    const a = Math.random() * Math.PI * 2;
    const r = 40 + Math.random() * SOLDIER.followRadius;
    this.followOffsetX = Math.cos(a) * r;
    this.followOffsetY = Math.sin(a) * r;
  }

  private cfg() {
    return this.kind === 'melee' ? SOLDIER.melee : SOLDIER.ranged;
  }

  // 조작 중 자동공격 (사거리 내 적)
  protected playerAttack(ctx: BattleContext) {
    const cfg = this.cfg();
    const enemy = ctx.findNearestEnemy('ally', this.x, this.y, cfg.attackRange);
    if (enemy && ctx.time - this.lastAttack >= cfg.attackCooldown) {
      this.lastAttack = ctx.time;
      if (this.kind === 'ranged') {
        ctx.spawnProjectile(this.x, this.y, enemy, cfg.attackDamage, 'ally', SOLDIER.ranged.projectileSpeed);
      } else {
        enemy.takeDamage(cfg.attackDamage, ctx);
      }
      if (enemy.x < this.x) this.setFlipX(true);
      else this.setFlipX(false);
    }
  }

  aiTick(dt: number, ctx: BattleContext): void {
    if (!this.alive) return;
    this.updateFlash(ctx);
    // 추종 기준점 = 현재 조작 중인 유닛 (없으면 영웅)
    const anchor = ctx.controlledRef();

    // HP 낮으면 후퇴 상태로
    if (this.fsm !== 'retreat' && this.hp / this.maxHp <= SOLDIER.retreatHpRatio) {
      this.fsm = 'retreat';
      this.retreatUntil = ctx.time + 2500;
    }

    // 기준점과 너무 멀면 강제 복귀
    if (anchor && anchor !== this) {
      const dh = Math.hypot(anchor.x - this.x, anchor.y - this.y);
      if (dh > SOLDIER.maxDistFromHero && this.fsm !== 'retreat') {
        this.fsm = 'follow';
      }
    }

    switch (this.fsm) {
      case 'retreat':
        this.doRetreat(dt, ctx, anchor);
        break;
      case 'engage':
        this.doEngage(dt, ctx, anchor);
        break;
      case 'follow':
      default:
        this.doFollow(dt, ctx, anchor);
        break;
    }
  }

  private doFollow(dt: number, ctx: BattleContext, anchor: Unit | null) {
    // 근처 적 탐지 -> 교전
    const enemy = ctx.findNearestEnemy('ally', this.x, this.y, SOLDIER.detectRange);
    if (enemy) {
      this.fsm = 'engage';
      return;
    }
    if (anchor && anchor !== this) {
      const tx = anchor.x + this.followOffsetX;
      const ty = anchor.y + this.followOffsetY;
      const moving = this.moveToward(tx, ty, 18);
      this.animateWalk(dt, moving);
    } else {
      this.halt();
      this.animateWalk(dt, false);
    }
  }

  private doEngage(dt: number, ctx: BattleContext, _anchor: Unit | null) {
    const cfg = this.cfg();
    const enemy = ctx.findNearestEnemy('ally', this.x, this.y, SOLDIER.detectRange + 60);
    if (!enemy) {
      this.fsm = 'follow';
      return;
    }
    const d = Math.hypot(enemy.x - this.x, enemy.y - this.y);
    if (d <= cfg.attackRange) {
      this.halt();
      this.animateWalk(dt, false);
      if (ctx.time - this.lastAttack >= cfg.attackCooldown) {
        this.lastAttack = ctx.time;
        if (this.kind === 'ranged') {
          ctx.spawnProjectile(this.x, this.y, enemy, cfg.attackDamage, 'ally', SOLDIER.ranged.projectileSpeed);
        } else {
          enemy.takeDamage(cfg.attackDamage, ctx);
        }
        if (enemy.x < this.x) this.setFlipX(true);
        else this.setFlipX(false);
      }
    } else {
      // 궁병은 사거리 유지, 검병은 접근
      const moving = this.moveToward(enemy.x, enemy.y, this.kind === 'ranged' ? cfg.attackRange - 20 : cfg.attackRange - 6);
      this.animateWalk(dt, moving);
    }
  }

  private doRetreat(dt: number, ctx: BattleContext, anchor: Unit | null) {
    if (ctx.time > this.retreatUntil) {
      this.fsm = 'follow';
      return;
    }
    if (anchor && anchor !== this) {
      // 기준점 쪽으로 물러남
      const away = this.moveToward(anchor.x, anchor.y, 30);
      this.animateWalk(dt, away);
    } else {
      this.halt();
    }
  }
}

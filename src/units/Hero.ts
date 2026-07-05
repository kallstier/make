import Phaser from 'phaser';
import { Unit, BattleContext, CombatStats } from './Unit';
import { HERO } from '../config';
import { genSkillRing } from '../gen/spriteGen';

export function heroTexKey(squadId: number) {
  return `u_hero_${squadId}`;
}

export class Hero extends Unit {
  private lastSkill = -99999;

  static preloadRing(scene: Phaser.Scene) {
    genSkillRing(scene, 'skillRing');
  }

  constructor(scene: Phaser.Scene, x: number, y: number, squadId: number) {
    super(scene, x, y, {
      texture: heroTexKey(squadId),
      faction: 'ally',
      unitType: 'hero',
      squadId,
      hp: HERO.hp,
      speed: HERO.speed,
      knockback: HERO.knockback,
      particleColor: 0xffd23b
    });
    this.setDepth(12);
  }

  private stats(): CombatStats {
    return {
      detectRange: 320,
      attackRange: HERO.attackRange,
      attackDamage: HERO.attackDamage,
      attackCooldown: HERO.attackCooldown
    };
  }

  skillReady(now: number): boolean {
    return now - this.lastSkill >= HERO.skillCooldown;
  }

  skillCooldownRatio(now: number): number {
    return Phaser.Math.Clamp((now - this.lastSkill) / HERO.skillCooldown, 0, 1);
  }

  tryUseSkill(_ctx: BattleContext, now: number): boolean {
    if (!this.skillReady(now)) return false;
    this.lastSkill = now;
    const ring = this.scene.add.image(this.x, this.y, 'skillRing');
    ring.setDepth(30);
    ring.setScale(0.2);
    ring.setAlpha(0.9);
    this.scene.tweens.add({
      targets: ring,
      scale: (HERO.skillRadius * 2) / 128,
      alpha: 0,
      duration: 350,
      ease: 'Cubic.Out',
      onComplete: () => ring.destroy()
    });
    return true;
  }

  protected playerAttack(ctx: BattleContext) {
    if (ctx.time - this.lastAttack >= HERO.attackCooldown) {
      const target = ctx.findNearestEnemy('ally', this.x, this.y, HERO.attackRange);
      if (target) {
        this.lastAttack = ctx.time;
        target.takeDamage(HERO.attackDamage, ctx, this);
        this.attackVisual(ctx, target.x, target.y);
      }
    }
  }

  // 자율 영웅: 전장으로 돌진해 자멸하지 않도록 "제자리 사수" — 사거리 내 적만 처치
  aiTick(dt: number, ctx: BattleContext): void {
    if (!this.alive) return;
    this.updateFlash(ctx);
    if (!ctx.combatActive()) {
      this.halt();
      this.animateWalk(dt, false);
      return;
    }
    const s = this.stats();
    const e = this.seekTarget(ctx, s.detectRange);
    if (!e) {
      this.halt();
      this.animateWalk(dt, false);
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
}

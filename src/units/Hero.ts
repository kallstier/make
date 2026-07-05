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
      knockback: HERO.knockback,
      particleColor: 0xffd23b
    });
    this.setDepth(12);
  }

  private stats(): CombatStats {
    return {
      detectRange: 340,
      attackRange: HERO.attackRange,
      attackDamage: this.getAtk(),
      attackCooldown: HERO.attackCooldown
    };
  }

  skillReady(now: number): boolean {
    return now - this.lastSkill >= HERO.skillCooldown;
  }

  skillCooldownRatio(now: number): number {
    return Phaser.Math.Clamp((now - this.lastSkill) / HERO.skillCooldown, 0, 1);
  }

  // 쿨다운/연출만 담당. MP 소모 판정은 BattleScene.requestSkill에서.
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

  // 자율 영웅: 병사와 같은 교전 AI로 스스로 싸운다 (빙의 여부와 무관).
  // 근접형이라 후퇴 개념이 없어 combatMelee로 최전선에서 교전.
  aiTick(dt: number, ctx: BattleContext): void {
    if (!this.alive) return;
    this.updateFlash(ctx);
    this.combat(dt, ctx, this.stats(), false);
  }
}

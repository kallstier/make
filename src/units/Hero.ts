import Phaser from 'phaser';
import { Unit, BattleContext } from './Unit';
import { HERO, SOLDIER, PALETTE } from '../config';
import { genUnit, genSkillRing } from '../gen/spriteGen';

type HeroFSM = 'follow' | 'engage' | 'retreat';

export class Hero extends Unit {
  private lastSkill = -99999;

  // 조작하지 않을 때 쓰는 자율 AI 상태
  private fsm: HeroFSM = 'follow';
  private retreatUntil = 0;
  private followOffsetX: number;
  private followOffsetY: number;

  static preload(scene: Phaser.Scene) {
    genUnit(scene, {
      key: 'hero',
      grid: 32,
      scale: 2,
      pal: PALETTE.hero,
      weapon: 'sword'
    });
    genSkillRing(scene, 'skillRing');
  }

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, {
      texture: 'hero',
      faction: 'ally',
      hp: HERO.hp,
      speed: HERO.speed,
      particleColor: PALETTE.hero.body
    });
    this.setDepth(12);
    this.setScale(1);
    const a = Math.random() * Math.PI * 2;
    const r = 30 + Math.random() * 60;
    this.followOffsetX = Math.cos(a) * r;
    this.followOffsetY = Math.sin(a) * r;
  }

  skillReady(now: number): boolean {
    return now - this.lastSkill >= HERO.skillCooldown;
  }

  skillCooldownRatio(now: number): number {
    const elapsed = now - this.lastSkill;
    return Phaser.Math.Clamp(elapsed / HERO.skillCooldown, 0, 1);
  }

  tryUseSkill(_ctx: BattleContext, now: number): boolean {
    if (!this.skillReady(now)) return false;
    this.lastSkill = now;

    // 링 이펙트
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

    // 반경 내 모든 적에게 대미지 (BattleScene가 실제 적 목록 순회를 위해 콜백 제공)
    return true;
  }

  // 조작 중 근접 자동공격
  protected playerAttack(ctx: BattleContext) {
    if (ctx.time - this.lastAttack >= HERO.attackCooldown) {
      const target = ctx.findNearestEnemy('ally', this.x, this.y, HERO.attackRange);
      if (target) {
        this.lastAttack = ctx.time;
        target.takeDamage(HERO.attackDamage, ctx);
        this.attackLunge(target.x, target.y);
      }
    }
  }

  private attackLunge(tx: number, ty: number) {
    const ang = Math.atan2(ty - this.y, tx - this.x);
    const ox = this.x;
    const oy = this.y;
    this.scene.tweens.add({
      targets: this,
      x: ox + Math.cos(ang) * 8,
      y: oy + Math.sin(ang) * 8,
      duration: 70,
      yoyo: true,
      ease: 'Quad.Out'
    });
  }

  // ---------- 자율 AI (조작하지 않을 때) ----------
  // 병사와 동일한 교전/후퇴 로직. 단 추종 기준은 현재 조작 중인 유닛.
  aiTick(dt: number, ctx: BattleContext): void {
    if (!this.alive) return;
    this.updateFlash(ctx);
    const anchor = ctx.controlledRef();

    if (this.fsm !== 'retreat' && this.hp / this.maxHp <= SOLDIER.retreatHpRatio) {
      this.fsm = 'retreat';
      this.retreatUntil = ctx.time + 2000;
    }

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
        this.doEngage(dt, ctx);
        break;
      case 'follow':
      default:
        this.doFollow(dt, ctx, anchor);
        break;
    }
  }

  private doFollow(dt: number, ctx: BattleContext, anchor: Unit | null) {
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

  private doEngage(dt: number, ctx: BattleContext) {
    const enemy = ctx.findNearestEnemy('ally', this.x, this.y, SOLDIER.detectRange + 60);
    if (!enemy) {
      this.fsm = 'follow';
      return;
    }
    const d = Math.hypot(enemy.x - this.x, enemy.y - this.y);
    if (d <= HERO.attackRange) {
      this.halt();
      this.animateWalk(dt, false);
      if (ctx.time - this.lastAttack >= HERO.attackCooldown) {
        this.lastAttack = ctx.time;
        enemy.takeDamage(HERO.attackDamage, ctx);
        this.attackLunge(enemy.x, enemy.y);
      }
    } else {
      const moving = this.moveToward(enemy.x, enemy.y, HERO.attackRange - 6);
      this.animateWalk(dt, moving);
    }
  }

  private doRetreat(dt: number, ctx: BattleContext, anchor: Unit | null) {
    if (ctx.time > this.retreatUntil) {
      this.fsm = 'follow';
      return;
    }
    if (anchor && anchor !== this) {
      const away = this.moveToward(anchor.x, anchor.y, 30);
      this.animateWalk(dt, away);
    } else {
      this.halt();
      this.animateWalk(dt, false);
    }
  }
}

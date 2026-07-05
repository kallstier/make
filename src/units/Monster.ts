import { Unit, BattleContext } from './Unit';
import { MONSTER, PALETTE } from '../config';
import { genUnit } from '../gen/spriteGen';

export type MonsterKind = 'goblin' | 'oni';

type MState = 'wander' | 'engage' | 'raid';

export class Monster extends Unit {
  kind: MonsterKind;
  private fsm: MState;
  private homeX: number;
  private homeY: number;
  private wanderTarget = { x: 0, y: 0 };
  private nextWander = 0;
  private raidTargetX = 0;
  private raidTargetY = 0;

  static preload(scene: Phaser.Scene) {
    genUnit(scene, { key: 'goblin', grid: 18, scale: 2, pal: PALETTE.enemy, weapon: 'club' });
    genUnit(scene, { key: 'oni', grid: 26, scale: 2, pal: PALETTE.oni, weapon: 'club' });
  }

  constructor(scene: Phaser.Scene, x: number, y: number, kind: MonsterKind, isRaid = false) {
    const stats = kind === 'goblin' ? MONSTER.goblin : MONSTER.oni;
    super(scene, x, y, {
      texture: kind,
      faction: 'enemy',
      hp: stats.hp,
      speed: stats.speed,
      particleColor: kind === 'goblin' ? PALETTE.enemy.body : PALETTE.oni.body
    });
    this.kind = kind;
    this.homeX = x;
    this.homeY = y;
    this.fsm = isRaid ? 'raid' : 'wander';
    this.setDepth(kind === 'oni' ? 9 : 7);
    this.wanderTarget = { x, y };
  }

  setRaidTarget(x: number, y: number) {
    this.raidTargetX = x;
    this.raidTargetY = y;
    this.fsm = 'raid';
  }

  private stats() {
    return this.kind === 'goblin' ? MONSTER.goblin : MONSTER.oni;
  }

  aiTick(dt: number, ctx: BattleContext): void {
    if (!this.alive) return;
    this.updateFlash(ctx);
    const s = this.stats();

    // 아군 탐지 -> 교전
    const target = ctx.findNearestEnemy('enemy', this.x, this.y, s.detectRange);
    if (target) {
      const d = Math.hypot(target.x - this.x, target.y - this.y);
      if (d <= s.attackRange) {
        this.halt();
        this.animateWalk(dt, false);
        if (ctx.time - this.lastAttack >= s.attackCooldown) {
          this.lastAttack = ctx.time;
          target.takeDamage(s.attackDamage, ctx);
          if (target.x < this.x) this.setFlipX(true);
          else this.setFlipX(false);
        }
      } else {
        const moving = this.moveToward(target.x, target.y, s.attackRange - 6);
        this.animateWalk(dt, moving);
      }
      return;
    }

    // 비교전 상태
    if (this.fsm === 'raid') {
      const moving = this.moveToward(this.raidTargetX, this.raidTargetY, 40);
      this.animateWalk(dt, moving);
      if (!moving) {
        // 거점 도착 후 배회
        this.homeX = this.raidTargetX;
        this.homeY = this.raidTargetY;
        this.fsm = 'wander';
      }
    } else {
      // 거점 주변 배회
      if (ctx.time > this.nextWander) {
        this.nextWander = ctx.time + 1500 + Math.random() * 2000;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 90;
        this.wanderTarget = { x: this.homeX + Math.cos(a) * r, y: this.homeY + Math.sin(a) * r };
      }
      const moving = this.moveToward(this.wanderTarget.x, this.wanderTarget.y, 8);
      this.animateWalk(dt, moving);
    }
  }
}

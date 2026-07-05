import { Unit, BattleContext, CombatStats } from './Unit';
import { MONSTER } from '../config';

export type MonsterKind = 'goblin' | 'goblinArcher' | 'oni';

export function monsterTexKey(kind: MonsterKind, squadId: number) {
  return `u_${kind}_${squadId}`;
}

export class Monster extends Unit {
  kind: MonsterKind;

  constructor(scene: Phaser.Scene, x: number, y: number, kind: MonsterKind, squadId: number) {
    const s = MONSTER[kind];
    super(scene, x, y, {
      texture: monsterTexKey(kind, squadId),
      faction: 'enemy',
      unitType: kind,
      squadId,
      knockback: s.knockback,
      particleColor: kind === 'oni' ? 0xd23b3b : 0x6bbf4a
    });
    this.kind = kind;
    this.setDepth(kind === 'oni' ? 9 : 7);
  }

  private stats(): CombatStats {
    const s = MONSTER[this.kind];
    return {
      detectRange: s.detectRange,
      attackRange: s.attackRange,
      attackDamage: this.getAtk(),
      attackCooldown: s.attackCooldown,
      keepDist: (s as any).keepDist,
      projectileSpeed: (s as any).projectileSpeed
    };
  }

  aiTick(dt: number, ctx: BattleContext): void {
    if (!this.alive) return;
    this.updateFlash(ctx);
    if (this.kind === 'goblinArcher') this.combatRanged(dt, ctx, this.stats());
    else this.combatMelee(dt, ctx, this.stats());
  }
}

import { Unit, BattleContext, CombatStats } from './Unit';
import { SOLDIER } from '../config';

export type SoldierKind = 'melee' | 'ranged' | 'spear';

export function soldierTexKey(kind: SoldierKind, squadId: number) {
  return `u_${kind}_${squadId}`;
}

export class Soldier extends Unit {
  kind: SoldierKind;

  constructor(scene: Phaser.Scene, x: number, y: number, kind: SoldierKind, squadId: number) {
    const s = SOLDIER[kind];
    super(scene, x, y, {
      texture: soldierTexKey(kind, squadId),
      faction: 'ally',
      unitType: kind,
      squadId,
      knockback: s.knockback,
      particleColor: 0xc0303a
    });
    this.kind = kind;
    this.setDepth(8);
  }

  private stats(): CombatStats {
    const s = SOLDIER[this.kind];
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
    if (this.kind === 'ranged') this.combatRanged(dt, ctx, this.stats());
    else this.combatMelee(dt, ctx, this.stats());
  }
}

import { Unit, BattleContext, CombatStats } from './Unit';
import { MONSTER, BOSS_TYPES } from '../config';

export type MonsterKind = 'goblin' | 'goblinArcher' | 'bandit' | 'oni' | 'goblinKing' | 'oniLord';

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
      particleColor:
        kind === 'oni' || kind === 'oniLord'
          ? 0xd23b3b
          : kind === 'bandit'
          ? 0xc0303a
          : 0x6bbf4a
    });
    this.kind = kind;
    this.isBoss = BOSS_TYPES.includes(kind);
    this.setDepth(this.isBoss ? 11 : kind === 'oni' ? 9 : 7);
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
    // 적 일반병(투항 전): 열세 시 투항 판정. 보스/이미 아군 편입된 유닛은 제외.
    if (this.faction === 'enemy' && !this.isBoss && this.surrenderState === 'none') {
      ctx.maybeSurrender(this);
    }
    this.combat(dt, ctx, this.stats(), this.kind === 'goblinArcher');
  }
}

// ============================================================
// 스킬 장비 (proc) 시스템
// 장비에 { chance, effect } 형태의 발동 스킬을 붙일 수 있는 범용 구조.
// 근접 타격이 성공할 때마다 chance 확률로 effect가 발동한다.
// 효과 연출/판정은 BattleContext(전장)에 위임 → 스킬 정의는 순수하게 유지.
// ============================================================
import type { Unit, BattleContext } from '../units/Unit';

export interface ProcSkill {
  id: string;
  name: string;
  chance: number; // 0..1 발동 확률
  desc: string; // 정보창 한 줄 설명
  // hitX/hitY = 타격 지점(월드 좌표)
  effect(ctx: BattleContext, attacker: Unit, target: Unit, hitX: number, hitY: number): void;
}

// 폭열검: 근접 타격 시 10% 확률로 타격 지점에 폭발 마법 AOE.
export const EXPLOSIVE_BLADE_PROC: ProcSkill = {
  id: 'explosive_blade',
  name: '폭열',
  chance: 0.1,
  desc: '타격 시 10% 폭발',
  effect(ctx, attacker, _target, hitX, hitY) {
    ctx.explodeAt(hitX, hitY, 90, 45, attacker.faction, attacker);
  }
};

// 오니 금봉: 근접 타격 시 5% 확률로 스턴 + 넉백 강화 (범용성 증명 예시).
export const CRUSHING_STAFF_PROC: ProcSkill = {
  id: 'crushing_staff',
  name: '분쇄',
  chance: 0.05,
  desc: '타격 시 5% 스턴+넉백',
  effect(ctx, attacker, target, _hitX, _hitY) {
    ctx.applyStun(target, 700);
    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    const d = Math.hypot(dx, dy) || 1;
    target.kbx += (dx / d) * 280;
    target.kby += (dy / d) * 280;
  }
};

// id → proc 조회 (아이템 정의에서 참조)
export const PROCS: Record<string, ProcSkill> = {
  [EXPLOSIVE_BLADE_PROC.id]: EXPLOSIVE_BLADE_PROC,
  [CRUSHING_STAFF_PROC.id]: CRUSHING_STAFF_PROC
};

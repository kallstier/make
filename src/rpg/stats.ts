// ============================================================
// 스탯 계산 층
// 최종 스탯 = 직업(base) + 레벨 성장 + 장비 보정.
// 피해 계산은 Unit.takeDamage 가 방어력을 반영해 수행한다.
// ============================================================
import type { UnitType } from '../config';
import { CLASS_STATS, LEVEL_GROWTH, EXP_TABLE } from '../config';
import type { Equipment } from './items';
import { sumEquipMods } from './items';

export interface StatBlock {
  maxHp: number;
  maxMp: number;
  atk: number;
  def: number;
  speed: number;
}

// 직업 + 레벨 + 장비 → 최종 스탯 블록
export function computeStats(type: UnitType, level: number, equip: Equipment): StatBlock {
  const base = CLASS_STATS[type];
  const g = LEVEL_GROWTH[type];
  const lv = Math.max(0, level - 1);
  const m = sumEquipMods(equip);
  return {
    maxHp: Math.round(base.hp + g.hp * lv + m.hp),
    maxMp: Math.round(base.mp + g.mp * lv + m.mp),
    atk: Math.round(base.atk + g.atk * lv + m.atk),
    def: Math.round(base.def + g.def * lv + m.def),
    speed: Math.round(base.speed + g.speed * lv + m.speed)
  };
}

// 현재 레벨에서 다음 레벨까지 필요한 EXP (테이블 범위 밖이면 Infinity → 성장 정지)
export function expForNext(level: number): number {
  const idx = level - 1;
  return idx < EXP_TABLE.length ? EXP_TABLE[idx] : Infinity;
}

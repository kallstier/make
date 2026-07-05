// ============================================================
// 부위별 장비 시스템
// 6슬롯(무기/투구/상의/하의/장갑/신발) · 스탯 보정 · 부가 proc 스킬.
// 착탈 UI/인벤토리는 마을 층(예정) — 지금은 생성 시 기본 세트를 착용하고
// 스탯에 반영 + 하단 정보창에 표시하는 데까지.
// ============================================================
import type { UnitType } from '../config';
import { PROCS, ProcSkill } from './skills';

export type EquipSlot = 'weapon' | 'helmet' | 'top' | 'bottom' | 'gloves' | 'boots';

export const EQUIP_SLOTS: EquipSlot[] = ['weapon', 'helmet', 'top', 'bottom', 'gloves', 'boots'];

export const SLOT_NAME: Record<EquipSlot, string> = {
  weapon: '무기',
  helmet: '투구',
  top: '상의',
  bottom: '하의',
  gloves: '장갑',
  boots: '신발'
};

// 슬롯별 아이콘 텍스처 키 (spriteGen에서 생성)
export const SLOT_ICON: Record<EquipSlot, string> = {
  weapon: 'item_weapon',
  helmet: 'item_helmet',
  top: 'item_top',
  bottom: 'item_bottom',
  gloves: 'item_gloves',
  boots: 'item_boots'
};

export interface StatMods {
  atk?: number;
  def?: number;
  hp?: number;
  mp?: number;
  speed?: number;
}

export interface Item {
  id: string;
  name: string;
  slot: EquipSlot;
  mods: StatMods;
  procId?: string; // 부가 proc 스킬 (skills.PROCS 참조)
  highlight?: boolean; // 정보창에서 이름 강조색 표시
}

export type Equipment = Partial<Record<EquipSlot, Item>>;

// ---- 아이템 정의 ----
export const ITEMS: Record<string, Item> = {
  // 무기
  bomb_blade: {
    id: 'bomb_blade',
    name: '폭열검',
    slot: 'weapon',
    mods: { atk: 6 },
    procId: 'explosive_blade',
    highlight: true
  },
  iron_sword: { id: 'iron_sword', name: '철검', slot: 'weapon', mods: { atk: 4 } },
  short_bow: { id: 'short_bow', name: '단궁', slot: 'weapon', mods: { atk: 3 } },
  long_spear: { id: 'long_spear', name: '장창', slot: 'weapon', mods: { atk: 4 } },
  gob_club: { id: 'gob_club', name: '몽둥이', slot: 'weapon', mods: { atk: 2 } },
  gob_bow: { id: 'gob_bow', name: '고블린 활', slot: 'weapon', mods: { atk: 2 } },
  kongo_staff: {
    id: 'kongo_staff',
    name: '금강저',
    slot: 'weapon',
    mods: { atk: 4 },
    procId: 'crushing_staff',
    highlight: true
  },

  // 투구
  iron_helm: { id: 'iron_helm', name: '철투구', slot: 'helmet', mods: { def: 1, hp: 4 } },
  hood: { id: 'hood', name: '가죽 후드', slot: 'helmet', mods: { def: 1, hp: 3 } },
  cone_hat: { id: 'cone_hat', name: '삿갓', slot: 'helmet', mods: { def: 1, hp: 4 } },
  gold_helm: { id: 'gold_helm', name: '황금 투구', slot: 'helmet', mods: { def: 2, hp: 10 } },
  gob_rag_hood: { id: 'gob_rag_hood', name: '누더기 두건', slot: 'helmet', mods: { hp: 2 } },

  // 상의
  leather_top: { id: 'leather_top', name: '가죽 상의', slot: 'top', mods: { def: 2, hp: 8 } },
  gold_plate: { id: 'gold_plate', name: '황금 흉갑', slot: 'top', mods: { def: 3, hp: 30 } },
  gob_rag_top: { id: 'gob_rag_top', name: '누더기 상의', slot: 'top', mods: { def: 1, hp: 4 } },

  // 하의
  leather_bottom: { id: 'leather_bottom', name: '가죽 하의', slot: 'bottom', mods: { def: 1, hp: 4 } },
  gold_greaves: { id: 'gold_greaves', name: '황금 각반', slot: 'bottom', mods: { def: 1, hp: 10 } },
  gob_rag_bottom: { id: 'gob_rag_bottom', name: '누더기 하의', slot: 'bottom', mods: { def: 1, hp: 2 } },

  // 장갑
  leather_gloves: { id: 'leather_gloves', name: '가죽 장갑', slot: 'gloves', mods: { atk: 1 } },
  gold_gauntlet: { id: 'gold_gauntlet', name: '황금 건틀릿', slot: 'gloves', mods: { atk: 2, def: 1 } },

  // 신발
  leather_boots: { id: 'leather_boots', name: '가죽 신발', slot: 'boots', mods: { def: 1, speed: 3 } },
  gold_boots: { id: 'gold_boots', name: '황금 신발', slot: 'boots', mods: { def: 1, speed: 4 } }
};

// ---- 병종별 기본 장비 세트 ----
export const DEFAULT_LOADOUT: Record<UnitType, Partial<Record<EquipSlot, string>>> = {
  hero: {
    weapon: 'bomb_blade',
    helmet: 'gold_helm',
    top: 'gold_plate',
    bottom: 'gold_greaves',
    gloves: 'gold_gauntlet',
    boots: 'gold_boots'
  },
  melee: {
    weapon: 'iron_sword',
    helmet: 'iron_helm',
    top: 'leather_top',
    bottom: 'leather_bottom',
    gloves: 'leather_gloves',
    boots: 'leather_boots'
  },
  ranged: {
    weapon: 'short_bow',
    helmet: 'hood',
    top: 'leather_top'
  },
  spear: {
    weapon: 'long_spear',
    helmet: 'cone_hat',
    top: 'leather_top',
    bottom: 'leather_bottom',
    gloves: 'leather_gloves',
    boots: 'leather_boots'
  },
  goblin: {
    weapon: 'gob_club',
    top: 'gob_rag_top'
  },
  goblinArcher: {
    weapon: 'gob_bow',
    helmet: 'gob_rag_hood'
  },
  oni: {
    weapon: 'kongo_staff',
    top: 'gob_rag_top',
    bottom: 'gob_rag_bottom'
  }
};

// 병종 기본 세트로 Equipment 인스턴스 생성
export function makeEquipment(type: UnitType): Equipment {
  const loadout = DEFAULT_LOADOUT[type];
  const eq: Equipment = {};
  for (const slot of EQUIP_SLOTS) {
    const id = loadout[slot];
    if (id && ITEMS[id]) eq[slot] = ITEMS[id];
  }
  return eq;
}

// 장착 장비의 스탯 보정 합산
export function sumEquipMods(e: Equipment): Required<StatMods> {
  const out = { atk: 0, def: 0, hp: 0, mp: 0, speed: 0 };
  for (const slot of EQUIP_SLOTS) {
    const it = e[slot];
    if (!it) continue;
    out.atk += it.mods.atk ?? 0;
    out.def += it.mods.def ?? 0;
    out.hp += it.mods.hp ?? 0;
    out.mp += it.mods.mp ?? 0;
    out.speed += it.mods.speed ?? 0;
  }
  return out;
}

// 아이템의 proc 스킬 조회
export function itemProc(it: Item | undefined): ProcSkill | undefined {
  return it?.procId ? PROCS[it.procId] : undefined;
}

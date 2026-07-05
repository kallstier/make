import Phaser from 'phaser';
import { Hero } from '../units/Hero';
import { Projectile } from '../units/Projectile';
import { EQUIP_SLOTS, SLOT_ICON } from '../rpg/items';
import { initGameState, garrisonIconType } from '../state/GameState';
import {
  genUnit,
  genBanner,
  genSpark,
  genSelectRing,
  genTargetRing,
  genParticle,
  genTree,
  genRock,
  genBush,
  genExplosionRing,
  genFireShard,
  genItemIcon,
  genBossMark,
  genWhiteFlag,
  genOrderFlag,
  genCastle,
  genNodeFlag,
  UnitKind
} from '../gen/spriteGen';

// 모든 절차 생성 텍스처를 등록하는 부트 씬
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    // 전략층 초기 상태 구성 (부대/거점/수비 편성) — 텍스처 생성의 기준이 된다
    const state = initGameState();

    // 아군 부대별 병종 텍스처 + 배너 (소속 색조 반영)
    for (const sq of state.squads) {
      const seen = new Set<string>();
      for (const u of sq.units) {
        if (seen.has(u.unitType)) continue;
        seen.add(u.unitType);
        genUnit(this, `u_${u.unitType}_${sq.id}`, u.unitType as UnitKind, sq.tint);
      }
      genBanner(this, `banner_${sq.id}`, sq.banner);
    }

    // 거점 수비대(몬스터) 병종 텍스처 + 배너
    for (const node of state.nodes) {
      for (const g of node.garrison) {
        genUnit(this, `u_${g.type}_${node.enemySquadId}`, g.type as UnitKind, node.enemyTint);
      }
      genBanner(this, `banner_${node.enemySquadId}`, node.enemyBanner);
      void garrisonIconType(node);
    }

    // 전략 노드맵 에셋: 성채 + 소유 깃발
    genCastle(this, 'castle');
    genNodeFlag(this, 'nodeFlag_ally', 0x3b6ef0);
    genNodeFlag(this, 'nodeFlag_monster', 0x8a2a2a);

    Hero.preloadRing(this);
    Projectile.preload(this);

    genSpark(this, 'spark');
    genSelectRing(this, 'selectRing');
    genTargetRing(this, 'targetRing');
    genExplosionRing(this, 'explosionRing');
    genFireShard(this, 'fireShard');
    genTree(this, 'tree');
    genRock(this, 'rock');
    genBush(this, 'bush');
    genBossMark(this, 'bossMark');
    genWhiteFlag(this, 'whiteFlag');
    genOrderFlag(this, 'orderFlag');

    // 장비 슬롯 아이콘 (하단 정보창)
    for (const slot of EQUIP_SLOTS) genItemIcon(this, SLOT_ICON[slot], slot);

    // 핏빛 파편 + 진영 파편
    genParticle(this, 'blood_ally', 0xc0303a);
    genParticle(this, 'blood_enemy', 0x4a7a2a);
    genParticle(this, 'blood_oni', 0xd23b3b);
    genParticle(this, 'blood_hero', 0xffd23b);

    this.scene.start('TitleScene');
  }
}

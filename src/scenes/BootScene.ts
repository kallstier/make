import Phaser from 'phaser';
import { SQUADS } from '../config';
import { Hero } from '../units/Hero';
import { Projectile } from '../units/Projectile';
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
  UnitKind
} from '../gen/spriteGen';

// 모든 절차 생성 텍스처를 등록하는 부트 씬
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    // 부대별 병종 텍스처 (소속 색조 반영)
    for (const sq of SQUADS) {
      for (const c of sq.composition) {
        genUnit(this, `u_${c.type}_${sq.id}`, c.type as UnitKind, sq.tint);
      }
      genBanner(this, `banner_${sq.id}`, sq.banner);
    }

    Hero.preloadRing(this);
    Projectile.preload(this);

    genSpark(this, 'spark');
    genSelectRing(this, 'selectRing');
    genTargetRing(this, 'targetRing');
    genTree(this, 'tree');
    genRock(this, 'rock');
    genBush(this, 'bush');

    // 핏빛 파편 + 진영 파편
    genParticle(this, 'blood_ally', 0xc0303a);
    genParticle(this, 'blood_enemy', 0x4a7a2a);
    genParticle(this, 'blood_oni', 0xd23b3b);
    genParticle(this, 'blood_hero', 0xffd23b);

    this.scene.start('TitleScene');
  }
}

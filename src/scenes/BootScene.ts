import Phaser from 'phaser';
import { Hero } from '../units/Hero';
import { Soldier } from '../units/Soldier';
import { Monster } from '../units/Monster';
import { Projectile } from '../units/Projectile';
import { Stronghold } from '../world/Stronghold';
import { genTree, genRock, genParticle, genSelectRing } from '../gen/spriteGen';
import { PALETTE } from '../config';

// 모든 절차 생성 텍스처를 등록하는 부트 씬
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    Hero.preload(this);
    Soldier.preload(this);
    Monster.preload(this);
    Projectile.preload(this);
    Stronghold.preload(this);
    genTree(this, 'tree');
    genRock(this, 'rock');
    genParticle(this, 'p_ally', PALETTE.ally.body);
    genParticle(this, 'p_enemy', PALETTE.enemy.body);
    genParticle(this, 'p_oni', PALETTE.oni.body);
    genParticle(this, 'p_hero', PALETTE.hero.body);
    genSelectRing(this, 'selectRing');

    this.scene.start('TitleScene');
  }
}

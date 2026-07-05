import Phaser from 'phaser';
import { Faction } from '../units/Unit';
import { STRONGHOLD } from '../config';
import { genCastle, genFlag } from '../gen/spriteGen';

export interface StrongholdDef {
  id: string;
  name: string;
  x: number;
  y: number;
  owner: Faction;
}

export class Stronghold {
  id: string;
  name: string;
  x: number;
  y: number;
  owner: Faction;
  radius = STRONGHOLD.radius;

  captureProgress = 0; // 0..1
  contesting = false;

  // 적 거점 스폰 타이머
  nextGarrison = 0;
  nextRaid = 0;

  private castle: Phaser.GameObjects.Image;
  private flag: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;
  private ring: Phaser.GameObjects.Graphics;
  private scene: Phaser.Scene;

  static preload(scene: Phaser.Scene) {
    genCastle(scene, 'castle', 0);
    genFlag(scene, 'flag_ally', 0x3b6ef0);
    genFlag(scene, 'flag_enemy', 0xd23b3b);
  }

  constructor(scene: Phaser.Scene, def: StrongholdDef) {
    this.scene = scene;
    this.id = def.id;
    this.name = def.name;
    this.x = def.x;
    this.y = def.y;
    this.owner = def.owner;

    this.ring = scene.add.graphics();
    this.ring.setDepth(1);

    this.castle = scene.add.image(def.x, def.y, 'castle');
    this.castle.setDepth(6);

    this.flag = scene.add.image(def.x + 30, def.y - 44, this.flagKey());
    this.flag.setDepth(7);

    this.label = scene.add.text(def.x, def.y - 60, def.name, {
      fontFamily: 'sans-serif',
      fontSize: '16px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4
    });
    this.label.setOrigin(0.5);
    this.label.setDepth(25);

    this.drawRing();

    this.nextGarrison = 4000 + Math.random() * 3000;
    this.nextRaid = STRONGHOLD.raidInterval + Math.random() * 5000;
  }

  private flagKey() {
    return this.owner === 'ally' ? 'flag_ally' : 'flag_enemy';
  }

  private drawRing() {
    const g = this.ring;
    g.clear();
    const col = this.owner === 'ally' ? 0x3b6ef0 : 0xd23b3b;
    g.lineStyle(2, col, 0.35);
    g.strokeCircle(this.x, this.y, this.radius);
    g.fillStyle(col, 0.06);
    g.fillCircle(this.x, this.y, this.radius);
  }

  setOwner(owner: Faction) {
    this.owner = owner;
    this.flag.setTexture(this.flagKey());
    this.captureProgress = 0;
    this.drawRing();
    // 깃발 펄럭 효과
    this.scene.tweens.add({
      targets: this.flag,
      y: this.flag.y - 8,
      duration: 200,
      yoyo: true,
      ease: 'Quad.Out'
    });
  }

  contains(x: number, y: number): boolean {
    return Phaser.Math.Distance.Between(this.x, this.y, x, y) <= this.radius;
  }

  destroy() {
    this.castle.destroy();
    this.flag.destroy();
    this.label.destroy();
    this.ring.destroy();
  }
}

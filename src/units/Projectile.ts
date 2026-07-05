import Phaser from 'phaser';
import { Unit, Faction, BattleContext } from './Unit';
import { genArrow } from '../gen/spriteGen';

// 오브젝트 풀링되는 화살 투사체
export class Projectile extends Phaser.Physics.Arcade.Image {
  target: Unit | null = null;
  damage = 0;
  faction: Faction = 'ally';
  speed = 400;
  ttl = 0;

  static preload(scene: Phaser.Scene) {
    genArrow(scene, 'arrow');
  }

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, 'arrow');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(15);
    this.setActive(false);
    this.setVisible(false);
  }

  fire(x: number, y: number, target: Unit, damage: number, faction: Faction, speed: number) {
    this.target = target;
    this.damage = damage;
    this.faction = faction;
    this.speed = speed;
    this.ttl = 2000;
    this.setPosition(x, y);
    this.setActive(true);
    this.setVisible(true);
    (this.body as Phaser.Physics.Arcade.Body).enable = true;
  }

  deactivate() {
    this.setActive(false);
    this.setVisible(false);
    this.target = null;
    (this.body as Phaser.Physics.Arcade.Body).enable = false;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
  }

  tick(dt: number, ctx: BattleContext) {
    if (!this.active) return;
    this.ttl -= dt;
    if (this.ttl <= 0) {
      this.deactivate();
      return;
    }
    if (!this.target || !this.target.alive) {
      this.deactivate();
      return;
    }
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 12) {
      this.target.takeDamage(this.damage, ctx);
      this.deactivate();
      return;
    }
    const ang = Math.atan2(dy, dx);
    this.setRotation(ang);
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(
      Math.cos(ang) * this.speed,
      Math.sin(ang) * this.speed
    );
  }
}

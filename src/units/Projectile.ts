import Phaser from 'phaser';
import { Unit, Faction, BattleContext } from './Unit';
import { genArrow } from '../gen/spriteGen';

// 오브젝트 풀링되는 화살 투사체 (곡사 + 그림자)
export class Projectile extends Phaser.GameObjects.Image {
  target: Unit | null = null;
  shooter: Unit | null = null;
  damage = 0;
  faction: Faction = 'ally';
  speed = 400;
  ttl = 0;

  // 논리 위치 (그림자/명중 판정) — 시각 위치는 포물선만큼 위로 뜬다
  private lx = 0;
  private ly = 0;
  private initialDist = 1;
  private traveled = 0;
  private shadow: Phaser.GameObjects.Ellipse;

  static preload(scene: Phaser.Scene) {
    genArrow(scene, 'arrow');
  }

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, 'arrow');
    scene.add.existing(this);
    this.setDepth(16);
    this.setActive(false);
    this.setVisible(false);
    this.shadow = scene.add.ellipse(0, 0, 8, 4, 0x000000, 0.28);
    this.shadow.setDepth(4);
    this.shadow.setVisible(false);
  }

  fire(x: number, y: number, target: Unit, damage: number, faction: Faction, speed: number, shooter: Unit | null = null) {
    this.target = target;
    this.shooter = shooter;
    this.damage = damage;
    this.faction = faction;
    this.speed = speed;
    this.ttl = 2200;
    this.lx = x;
    this.ly = y;
    this.traveled = 0;
    this.initialDist = Math.max(1, Math.hypot(target.x - x, target.y - y));
    this.setPosition(x, y);
    this.setActive(true);
    this.setVisible(true);
    this.shadow.setVisible(true);
  }

  deactivate() {
    this.setActive(false);
    this.setVisible(false);
    this.shadow.setVisible(false);
    this.target = null;
    this.shooter = null;
  }

  tick(dt: number, ctx: BattleContext) {
    if (!this.active) return;
    this.ttl -= dt;
    if (this.ttl <= 0 || !this.target || !this.target.alive) {
      this.deactivate();
      return;
    }
    const tx = this.target.x;
    const ty = this.target.y;
    const dx = tx - this.lx;
    const dy = ty - this.ly;
    const dist = Math.hypot(dx, dy);
    if (dist < 12) {
      this.target.takeDamage(this.damage, ctx, this.shooter);
      this.deactivate();
      return;
    }
    const step = (this.speed * dt) / 1000;
    const ux = dx / dist;
    const uy = dy / dist;
    this.lx += ux * step;
    this.ly += uy * step;
    this.traveled += step;

    // 포물선 높이 (비행 진행도 기반)
    const progress = Phaser.Math.Clamp(this.traveled / (this.traveled + dist), 0, 1);
    const arc = Math.sin(progress * Math.PI) * Math.min(28, this.initialDist * 0.12);

    this.shadow.setPosition(this.lx, this.ly);
    this.setPosition(this.lx, this.ly - arc);
    // 진행 방향 + 상승/하강 기울기 반영
    const slope = Math.cos(progress * Math.PI); // +상승 -하강
    this.setRotation(Math.atan2(uy, ux) - slope * 0.35);
  }
}

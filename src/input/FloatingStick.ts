import Phaser from 'phaser';

// 모바일용 플로팅 조이스틱: 화면 왼쪽 아무 데나 터치 시 그 위치에 생성,
// 드래그로 이동 벡터 산출, 떼면 소멸.
export class FloatingStick {
  private scene: Phaser.Scene;
  private base: Phaser.GameObjects.Graphics;
  private knob: Phaser.GameObjects.Graphics;
  private active = false;
  private pointerId = -1;
  private originX = 0;
  private originY = 0;
  private maxRadius = 70;

  // 정규화 출력 (-1..1)
  vecX = 0;
  vecY = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.base = scene.add.graphics();
    this.knob = scene.add.graphics();
    this.base.setScrollFactor(0).setDepth(100).setVisible(false);
    this.knob.setScrollFactor(0).setDepth(101).setVisible(false);

    scene.input.addPointer(2); // 멀티터치 지원

    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
  }

  private isLeftHalf(x: number): boolean {
    return x < this.scene.scale.width * 0.5;
  }

  private onDown(pointer: Phaser.Input.Pointer) {
    if (this.active) return;
    if (!this.isLeftHalf(pointer.x)) return; // 오른쪽은 스킬버튼 영역
    this.active = true;
    this.pointerId = pointer.id;
    this.originX = pointer.x;
    this.originY = pointer.y;
    this.drawBase();
    this.base.setVisible(true);
    this.knob.setVisible(true);
    this.updateKnob(pointer.x, pointer.y);
  }

  private onMove(pointer: Phaser.Input.Pointer) {
    if (!this.active || pointer.id !== this.pointerId) return;
    this.updateKnob(pointer.x, pointer.y);
  }

  private onUp(pointer: Phaser.Input.Pointer) {
    if (!this.active || pointer.id !== this.pointerId) return;
    this.active = false;
    this.pointerId = -1;
    this.vecX = 0;
    this.vecY = 0;
    this.base.setVisible(false);
    this.knob.setVisible(false);
  }

  private drawBase() {
    this.base.clear();
    this.base.fillStyle(0xffffff, 0.12);
    this.base.fillCircle(this.originX, this.originY, this.maxRadius);
    this.base.lineStyle(3, 0xffffff, 0.35);
    this.base.strokeCircle(this.originX, this.originY, this.maxRadius);
  }

  private updateKnob(px: number, py: number) {
    let dx = px - this.originX;
    let dy = py - this.originY;
    const dist = Math.hypot(dx, dy);
    if (dist > this.maxRadius) {
      dx = (dx / dist) * this.maxRadius;
      dy = (dy / dist) * this.maxRadius;
    }
    this.vecX = dx / this.maxRadius;
    this.vecY = dy / this.maxRadius;
    this.knob.clear();
    this.knob.fillStyle(0xffffff, 0.5);
    this.knob.fillCircle(this.originX + dx, this.originY + dy, 28);
  }

  isActive() {
    return this.active;
  }

  destroy() {
    this.scene.input.off('pointerdown', this.onDown, this);
    this.scene.input.off('pointermove', this.onMove, this);
    this.scene.input.off('pointerup', this.onUp, this);
    this.base.destroy();
    this.knob.destroy();
  }
}

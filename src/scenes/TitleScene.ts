import Phaser from 'phaser';

// 타이틀 씬: 로고 텍스트 + 시작 버튼
export class TitleScene extends Phaser.Scene {
  // 리사이즈 시 재배치할 요소 (뷰포트 비율 기준 앵커)
  private bg!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private subText!: Phaser.GameObjects.Text;
  private btn!: Phaser.GameObjects.Graphics;
  private btnText!: Phaser.GameObjects.Text;
  private btnZone!: Phaser.GameObjects.Zone;
  private hintText!: Phaser.GameObjects.Text;
  private readonly btnW = 240;
  private readonly btnH = 66;

  constructor() {
    super('TitleScene');
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    // 배경 그라디언트 느낌 (절차) — layout에서 뷰포트에 맞춰 다시 그림
    this.bg = this.add.graphics();

    // 로고
    const title = this.add.text(w / 2, h * 0.32, '화현전기', {
      fontFamily: 'sans-serif',
      fontSize: '72px',
      fontStyle: 'bold',
      color: '#ffe066',
      stroke: '#3a2a00',
      strokeThickness: 10
    });
    title.setOrigin(0.5);
    this.titleText = title;
    this.tweens.add({
      targets: title,
      scale: { from: 0.96, to: 1.04 },
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut'
    });

    this.subText = this.add
      .text(w / 2, h * 0.45, '거점을 점령해 대륙을 통일하는 턴제 전략 + 밀집 야전', {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: '#cfd8e8',
        align: 'center'
      })
      .setOrigin(0.5);

    // 시작 버튼
    this.btn = this.add.graphics();
    const drawBtn = (hover: boolean) => {
      const bx = this.btnZone.x;
      const by = this.btnZone.y;
      this.btn.clear();
      this.btn.fillStyle(hover ? 0x4c7ef0 : 0x3b6ef0, 1);
      this.btn.fillRoundedRect(bx - this.btnW / 2, by - this.btnH / 2, this.btnW, this.btnH, 14);
      this.btn.lineStyle(3, 0xffffff, 0.8);
      this.btn.strokeRoundedRect(bx - this.btnW / 2, by - this.btnH / 2, this.btnW, this.btnH, 14);
    };

    this.btnText = this.add
      .text(0, 0, '시작', { fontFamily: 'sans-serif', fontSize: '32px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5);

    this.btnZone = this.add.zone(w / 2, h * 0.66, this.btnW, this.btnH).setInteractive({ useHandCursor: true });
    this.btnZone.on('pointerover', () => drawBtn(true));
    this.btnZone.on('pointerout', () => drawBtn(false));
    this.btnZone.on('pointerdown', () => {
      this.scene.start('StrategyScene');
    });

    this.hintText = this.add
      .text(
        w / 2,
        h * 0.82,
        '전략맵: 부대를 탭해 선택 → 인접 거점 탭으로 이동 예약 → 턴 종료로 진군·점령\n전투: 왼쪽 드래그 이동 / 오른쪽 버튼 스킬 / 아군 탭 빙의 · 유닛 탭 정보 / 좌상단 부대 명령',
        { fontFamily: 'sans-serif', fontSize: '16px', color: '#9fb0c8', align: 'center' }
      )
      .setOrigin(0.5);

    this.layout();
    drawBtn(false);

    this.scale.on('resize', this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', this.layout, this));
  }

  // 뷰포트 비율 기준 재배치 (생성/리사이즈 공용)
  private layout() {
    const w = this.scale.width;
    const h = this.scale.height;

    // 배경 그라디언트 + 장식 별 (뷰포트 전체 채움)
    this.bg.clear();
    this.bg.fillGradientStyle(0x1a2a4a, 0x1a2a4a, 0x2a1a1a, 0x2a1a1a, 1);
    this.bg.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h * 0.6;
      const s = Math.random() * 2 + 0.5;
      this.bg.fillStyle(0xffffff, Math.random() * 0.5 + 0.1);
      this.bg.fillRect(x, y, s, s);
    }

    this.titleText.setPosition(w / 2, h * 0.32);
    this.subText.setPosition(w / 2, h * 0.45);
    const bx = w / 2;
    const by = h * 0.66;
    this.btnZone.setPosition(bx, by);
    this.btnText.setPosition(bx, by);
    this.btn.clear();
    this.btn.fillStyle(0x3b6ef0, 1);
    this.btn.fillRoundedRect(bx - this.btnW / 2, by - this.btnH / 2, this.btnW, this.btnH, 14);
    this.btn.lineStyle(3, 0xffffff, 0.8);
    this.btn.strokeRoundedRect(bx - this.btnW / 2, by - this.btnH / 2, this.btnW, this.btnH, 14);
    this.hintText.setPosition(w / 2, h * 0.82);
  }
}

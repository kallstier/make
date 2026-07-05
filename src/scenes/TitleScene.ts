import Phaser from 'phaser';

// 타이틀 씬: 로고 텍스트 + 시작 버튼
export class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    // 배경 그라디언트 느낌 (절차)
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x1a2a4a, 0x1a2a4a, 0x2a1a1a, 0x2a1a1a, 1);
    bg.fillRect(0, 0, w, h);

    // 장식 별/입자
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h * 0.6;
      const s = Math.random() * 2 + 0.5;
      bg.fillStyle(0xffffff, Math.random() * 0.5 + 0.1);
      bg.fillRect(x, y, s, s);
    }

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
    this.tweens.add({
      targets: title,
      scale: { from: 0.96, to: 1.04 },
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut'
    });

    const sub = this.add.text(w / 2, h * 0.45, '이야기가 현실이 되는 전장', {
      fontFamily: 'sans-serif',
      fontSize: '20px',
      color: '#cfd8e8'
    });
    sub.setOrigin(0.5);

    // 시작 버튼
    const btnW = 240;
    const btnH = 66;
    const bx = w / 2;
    const by = h * 0.66;
    const btn = this.add.graphics();
    const drawBtn = (hover: boolean) => {
      btn.clear();
      btn.fillStyle(hover ? 0x4c7ef0 : 0x3b6ef0, 1);
      btn.fillRoundedRect(bx - btnW / 2, by - btnH / 2, btnW, btnH, 14);
      btn.lineStyle(3, 0xffffff, 0.8);
      btn.strokeRoundedRect(bx - btnW / 2, by - btnH / 2, btnW, btnH, 14);
    };
    drawBtn(false);

    const btnText = this.add.text(bx, by, '시작', {
      fontFamily: 'sans-serif',
      fontSize: '32px',
      fontStyle: 'bold',
      color: '#ffffff'
    });
    btnText.setOrigin(0.5);

    const zone = this.add
      .zone(bx, by, btnW, btnH)
      .setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => drawBtn(true));
    zone.on('pointerout', () => drawBtn(false));
    zone.on('pointerdown', () => {
      this.scene.start('BattleScene');
      this.scene.launch('UIScene');
    });

    const hint = this.add.text(
      w / 2,
      h * 0.82,
      '모바일: 왼쪽 드래그 이동 / 오른쪽 버튼 스킬 / 아군 탭하여 빙의\n데스크톱: WASD·화살표 이동 / 스페이스 스킬 / 아군 클릭 빙의 · Tab 영웅 복귀',
      {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: '#9fb0c8',
        align: 'center'
      }
    );
    hint.setOrigin(0.5);
  }
}

import Phaser from 'phaser';
import type { BattleScene, GameState } from './BattleScene';

// UIScene: BattleScene 위에 겹쳐 HUD/정보창/버튼/오버레이 렌더
export class UIScene extends Phaser.Scene {
  private battle!: BattleScene;

  private topText!: Phaser.GameObjects.Text;
  private heroMiniText!: Phaser.GameObjects.Text;

  // 하단 정보 바 (FQ4식)
  private infoPanel!: Phaser.GameObjects.Graphics;
  private faceFrame!: Phaser.GameObjects.Graphics;
  private faceIcon!: Phaser.GameObjects.Image;
  private nameText!: Phaser.GameObjects.Text;
  private typeText!: Phaser.GameObjects.Text;
  private tagText!: Phaser.GameObjects.Text;
  private infoHpBar!: Phaser.GameObjects.Graphics;
  private infoHpText!: Phaser.GameObjects.Text;
  private killText!: Phaser.GameObjects.Text;
  private lastFaceKey = '';

  private skillBtn!: Phaser.GameObjects.Graphics;
  private skillLabel!: Phaser.GameObjects.Text;
  private skillZone!: Phaser.GameObjects.Zone;
  private skillCx = 0;
  private skillCy = 0;
  private skillR = 40;

  private barY = 0;
  private barH = 78;

  private shownState: GameState | null = null;

  constructor() {
    super('UIScene');
  }

  create() {
    this.battle = this.scene.get('BattleScene') as BattleScene;
    this.shownState = null;
    this.lastFaceKey = '';

    // 상단 요약
    const panel = this.add.graphics();
    panel.fillStyle(0x000000, 0.42);
    panel.fillRoundedRect(10, 8, 250, 58, 10);
    this.topText = this.add.text(24, 16, '', {
      fontFamily: 'sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#ffffff'
    });
    this.heroMiniText = this.add.text(24, 42, '', {
      fontFamily: 'sans-serif',
      fontSize: '13px',
      color: '#ffd23b'
    });

    // 하단 정보 바 구성
    this.infoPanel = this.add.graphics();
    this.faceFrame = this.add.graphics();
    this.faceIcon = this.add.image(0, 0, 'selectRing');
    this.faceIcon.setVisible(false);
    this.nameText = this.add.text(0, 0, '', {
      fontFamily: 'sans-serif',
      fontSize: '19px',
      fontStyle: 'bold',
      color: '#ffffff'
    });
    this.typeText = this.add.text(0, 0, '', {
      fontFamily: 'sans-serif',
      fontSize: '13px',
      color: '#bcd0ea'
    });
    this.tagText = this.add.text(0, 0, '', {
      fontFamily: 'sans-serif',
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#ffe066'
    });
    this.infoHpBar = this.add.graphics();
    this.infoHpText = this.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#ffffff'
    });
    this.killText = this.add.text(0, 0, '', {
      fontFamily: 'sans-serif',
      fontSize: '14px',
      color: '#ffd0a0'
    });

    // 스킬 버튼
    this.layout();
    this.skillBtn = this.add.graphics();
    this.skillLabel = this.add.text(this.skillCx, this.skillCy, '일섬', {
      fontFamily: 'sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#ffffff'
    });
    this.skillLabel.setOrigin(0.5);
    this.skillZone = this.add
      .zone(this.skillCx, this.skillCy, this.skillR * 2, this.skillR * 2)
      .setInteractive({ useHandCursor: true });
    this.skillZone.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      this.battle.requestSkill();
    });

    this.scale.on('resize', () => this.layout());
  }

  private layout() {
    const w = this.scale.width;
    const h = this.scale.height;
    this.barY = h - this.barH;
    this.skillCx = w - 60;
    this.skillCy = this.barY - 52;
    if (this.skillLabel) this.skillLabel.setPosition(this.skillCx, this.skillCy);
    if (this.skillZone) this.skillZone.setPosition(this.skillCx, this.skillCy);
  }

  update() {
    if (!this.battle || !this.battle.getCounts) return;

    const counts = this.battle.getCounts();
    this.topText.setText(`⚔ 아군 ${counts.ally}  vs  적 ${counts.enemy}`);
    const hh = this.battle.getHeroHp();
    this.heroMiniText.setText(`영웅 HP ${hh.hp}/${hh.max}`);

    this.drawInfoPanel();

    const skillEnabled = this.battle.isControllingHero();
    this.drawSkillButton(this.battle.getSkillCdRatio(), skillEnabled);
    this.skillLabel.setAlpha(skillEnabled ? 1 : 0.4);

    const gs = this.battle.getGameState();
    if (gs !== 'playing' && this.shownState !== gs) {
      this.shownState = gs;
      this.showOverlay(gs);
    }
  }

  private drawInfoPanel() {
    const w = this.scale.width;
    const y = this.barY;
    const info = this.battle.getInfoUnit();

    this.infoPanel.clear();
    this.infoPanel.fillStyle(0x0a1020, 0.82);
    this.infoPanel.fillRect(0, y, w, this.barH);
    this.infoPanel.lineStyle(2, 0x3a4a6a, 0.9);
    this.infoPanel.lineBetween(0, y, w, y);

    this.faceFrame.clear();
    if (!info) {
      this.faceIcon.setVisible(false);
      this.nameText.setText('');
      this.typeText.setText('');
      this.tagText.setText('');
      this.infoHpText.setText('');
      this.killText.setText('');
      this.infoHpBar.clear();
      return;
    }

    const isEnemy = info.faction === 'enemy';
    const accent = isEnemy ? 0xd23b3b : info.possessed ? 0xffd23b : 0x3b8ef0;

    // 얼굴 아이콘 박스
    const boxX = 14;
    const boxY = y + 8;
    const boxS = this.barH - 16;
    this.faceFrame.fillStyle(0x000000, 0.5);
    this.faceFrame.fillRoundedRect(boxX, boxY, boxS, boxS, 6);
    this.faceFrame.lineStyle(2, accent, 1);
    this.faceFrame.strokeRoundedRect(boxX, boxY, boxS, boxS, 6);

    if (this.lastFaceKey !== info.textureKey) {
      this.lastFaceKey = info.textureKey;
      this.faceIcon.setTexture(info.textureKey, 0);
    } else {
      this.faceIcon.setFrame(0);
    }
    const fr = this.textures.getFrame(info.textureKey, 0);
    const scale = fr ? Math.min((boxS - 8) / fr.width, (boxS - 6) / fr.height) * 1.15 : 1;
    this.faceIcon.setVisible(true);
    this.faceIcon.setScale(scale);
    this.faceIcon.setPosition(boxX + boxS / 2, boxY + boxS / 2 + 4);

    // 텍스트 열
    const tx = boxX + boxS + 14;
    this.nameText.setPosition(tx, y + 10);
    this.nameText.setText(info.label);
    this.nameText.setColor(isEnemy ? '#ff9a9a' : '#ffffff');

    this.typeText.setPosition(tx, y + 34);
    this.typeText.setText(`병종: ${info.typeName}`);

    this.tagText.setPosition(tx + 120, y + 34);
    this.tagText.setText(info.possessed ? '● 빙의 중' : isEnemy ? '적' : '아군');
    this.tagText.setColor(info.possessed ? '#ffe066' : isEnemy ? '#ff8080' : '#8fc0ff');

    // HP 바
    const hbx = tx;
    const hby = y + 54;
    const hbw = 210;
    const hbh = 12;
    this.infoHpBar.clear();
    this.infoHpBar.fillStyle(0x000000, 0.6);
    this.infoHpBar.fillRect(hbx - 2, hby - 2, hbw + 4, hbh + 4);
    const ratio = Phaser.Math.Clamp(info.hp / info.max, 0, 1);
    const col = ratio > 0.5 ? 0x4ce04c : ratio > 0.25 ? 0xe0c04c : 0xe04c4c;
    this.infoHpBar.fillStyle(col, 1);
    this.infoHpBar.fillRect(hbx, hby, hbw * ratio, hbh);
    this.infoHpText.setPosition(hbx + hbw + 10, hby - 2);
    this.infoHpText.setText(`${info.hp}/${info.max}`);

    // 처치 수
    this.killText.setPosition(tx + 300, y + 10);
    this.killText.setText(`처치 ${info.kills}`);
  }

  private drawSkillButton(cd: number, enabled: boolean) {
    const g = this.skillBtn;
    g.clear();
    const cx = this.skillCx;
    const cy = this.skillCy;
    const r = this.skillR;
    const alpha = enabled ? 0.9 : 0.35;
    g.fillStyle(!enabled ? 0x555555 : cd >= 1 ? 0xd23b3b : 0x555555, alpha);
    g.fillCircle(cx, cy, r);
    g.lineStyle(3, 0xffffff, enabled ? 0.85 : 0.35);
    g.strokeCircle(cx, cy, r);
    if (enabled && cd < 1) {
      g.fillStyle(0x000000, 0.55);
      g.slice(cx, cy, r, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(-90 + 360 * (1 - cd)), true);
      g.fillPath();
    }
  }

  private showOverlay(state: GameState) {
    const w = this.scale.width;
    const h = this.scale.height;
    const cont = this.add.container(0, 0);
    cont.setDepth(200);

    const dim = this.add.graphics();
    dim.fillStyle(0x000000, 0.62);
    dim.fillRect(0, 0, w, h);
    cont.add(dim);

    const win = state === 'win';
    const title = this.add.text(w / 2, h * 0.26, win ? '승리!' : '패배...', {
      fontFamily: 'sans-serif',
      fontSize: '64px',
      fontStyle: 'bold',
      color: win ? '#ffe066' : '#ff6b6b',
      stroke: '#000',
      strokeThickness: 8
    });
    title.setOrigin(0.5);
    cont.add(title);

    const res = this.battle.getResult();
    const lines = res
      ? [
          `아군 전사: ${res.allyDead}`,
          `적 전사: ${res.enemyDead}`,
          `영웅 처치: ${res.heroKills}`,
          `빙의 유닛 처치: ${res.playerKills}`
        ]
      : [];
    const stat = this.add.text(w / 2, h * 0.46, lines.join('     '), {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#e6eefb',
      align: 'center'
    });
    stat.setOrigin(0.5);
    cont.add(stat);

    const bw = 240;
    const bh = 62;
    const bx = w / 2;
    const by = h * 0.64;
    const btn = this.add.graphics();
    btn.fillStyle(0x3b6ef0, 1);
    btn.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 12);
    btn.lineStyle(3, 0xffffff, 0.85);
    btn.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 12);
    cont.add(btn);
    const btnText = this.add.text(bx, by, '다시 싸우기', {
      fontFamily: 'sans-serif',
      fontSize: '26px',
      fontStyle: 'bold',
      color: '#ffffff'
    });
    btnText.setOrigin(0.5);
    cont.add(btnText);

    const zone = this.add.zone(bx, by, bw, bh).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => {
      cont.destroy();
      this.shownState = null;
      this.lastFaceKey = '';
      this.battle.restart();
    });
    cont.add(zone);
  }
}

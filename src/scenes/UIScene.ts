import Phaser from 'phaser';
import type { BattleScene, GameState } from './BattleScene';

// UIScene: BattleScene 위에 겹쳐 HUD/정보창/버튼/오버레이 렌더
export class UIScene extends Phaser.Scene {
  private battle!: BattleScene;

  private topText!: Phaser.GameObjects.Text;
  private heroMiniText!: Phaser.GameObjects.Text;

  // 하단 정보 바 (2단: 1단 스탯 / 2단 장비)
  private infoPanel!: Phaser.GameObjects.Graphics;
  private faceFrame!: Phaser.GameObjects.Graphics;
  private faceIcon!: Phaser.GameObjects.Image;
  private nameText!: Phaser.GameObjects.Text;
  private lvClassText!: Phaser.GameObjects.Text;
  private tagText!: Phaser.GameObjects.Text;
  private atkDefText!: Phaser.GameObjects.Text;
  private infoHpBar!: Phaser.GameObjects.Graphics;
  private infoHpText!: Phaser.GameObjects.Text;
  private infoMpBar!: Phaser.GameObjects.Graphics;
  private infoMpText!: Phaser.GameObjects.Text;
  private killExpText!: Phaser.GameObjects.Text;
  private procDescText!: Phaser.GameObjects.Text;
  // 장비 6슬롯 (아이콘 + 이름)
  private equipIcons: Phaser.GameObjects.Image[] = [];
  private equipNames: Phaser.GameObjects.Text[] = [];
  private lastFaceKey = '';

  private skillBtn!: Phaser.GameObjects.Graphics;
  private skillLabel!: Phaser.GameObjects.Text;
  private skillZone!: Phaser.GameObjects.Zone;
  private skillCx = 0;
  private skillCy = 0;
  private skillR = 40;

  private barY = 0;
  private barH = 120;

  private shownState: GameState | null = null;

  constructor() {
    super('UIScene');
  }

  create() {
    this.battle = this.scene.get('BattleScene') as BattleScene;
    this.shownState = null;
    this.lastFaceKey = '';
    this.equipIcons = [];
    this.equipNames = [];

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
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#ffffff'
    });
    this.lvClassText = this.add.text(0, 0, '', {
      fontFamily: 'sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#ffe066'
    });
    this.tagText = this.add.text(0, 0, '', {
      fontFamily: 'sans-serif',
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#ffe066'
    });
    this.atkDefText = this.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#bcd0ea'
    });
    this.infoHpBar = this.add.graphics();
    this.infoHpText = this.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#ffffff'
    });
    this.infoMpBar = this.add.graphics();
    this.infoMpText = this.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#cfe0ff'
    });
    this.killExpText = this.add.text(0, 0, '', {
      fontFamily: 'sans-serif',
      fontSize: '12px',
      color: '#ffd0a0'
    });
    this.procDescText = this.add.text(0, 0, '', {
      fontFamily: 'sans-serif',
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#ff9a4a'
    });
    // 장비 6슬롯 아이콘 + 이름
    for (let i = 0; i < 6; i++) {
      const icon = this.add.image(0, 0, 'item_weapon').setVisible(false);
      icon.setScale(1.4);
      this.equipIcons.push(icon);
      const nm = this.add.text(0, 0, '', {
        fontFamily: 'sans-serif',
        fontSize: '11px',
        color: '#c8d4e8'
      });
      this.equipNames.push(nm);
    }

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

    const skillEnabled = this.battle.canUseSkill();
    this.drawSkillButton(this.battle.getSkillCdRatio(), skillEnabled);
    this.skillLabel.setAlpha(skillEnabled ? 1 : 0.4);

    const gs = this.battle.getGameState();
    if (gs !== 'playing' && this.shownState !== gs) {
      this.shownState = gs;
      this.showOverlay(gs);
    }
  }

  private hideInfo() {
    this.faceIcon.setVisible(false);
    this.nameText.setText('');
    this.lvClassText.setText('');
    this.tagText.setText('');
    this.atkDefText.setText('');
    this.infoHpText.setText('');
    this.infoMpText.setText('');
    this.killExpText.setText('');
    this.procDescText.setText('');
    this.infoHpBar.clear();
    this.infoMpBar.clear();
    for (const ic of this.equipIcons) ic.setVisible(false);
    for (const nm of this.equipNames) nm.setText('');
  }

  private drawInfoPanel() {
    const w = this.scale.width;
    const y = this.barY;
    const info = this.battle.getInfoUnit();

    this.infoPanel.clear();
    this.infoPanel.fillStyle(0x0a1020, 0.85);
    this.infoPanel.fillRect(0, y, w, this.barH);
    this.infoPanel.lineStyle(2, 0x3a4a6a, 0.9);
    this.infoPanel.lineBetween(0, y, w, y);
    // 1단/2단 구분선
    const rowSplit = y + 82;
    this.infoPanel.lineStyle(1, 0x2a3a5a, 0.7);
    this.infoPanel.lineBetween(10, rowSplit, w - 10, rowSplit);

    this.faceFrame.clear();
    if (!info) {
      this.hideInfo();
      return;
    }

    const isEnemy = info.faction === 'enemy';
    const accent = isEnemy ? 0xd23b3b : info.possessed ? 0xffd23b : 0x3b8ef0;

    // 얼굴 아이콘 박스 (1단 높이)
    const boxX = 12;
    const boxY = y + 8;
    const boxS = 66;
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
    const scale = fr ? Math.min((boxS - 8) / fr.width, (boxS - 6) / fr.height) * 1.1 : 1;
    this.faceIcon.setVisible(true);
    this.faceIcon.setScale(scale);
    this.faceIcon.setPosition(boxX + boxS / 2, boxY + boxS / 2 + 3);

    // ---- 1단: 스탯 ----
    const tx = boxX + boxS + 14;
    this.nameText.setPosition(tx, y + 8);
    this.nameText.setText(info.label);
    this.nameText.setColor(isEnemy ? '#ff9a9a' : '#ffffff');

    // 빙의/소속 태그는 이름 행 우측에
    this.tagText.setPosition(tx + 190, y + 10);
    this.tagText.setText(info.possessed ? '● 빙의 중' : isEnemy ? '적' : '아군');
    this.tagText.setColor(info.possessed ? '#ffe066' : isEnemy ? '#ff8080' : '#8fc0ff');

    this.lvClassText.setPosition(tx, y + 30);
    this.lvClassText.setText(`LV ${info.level}  ${info.typeName}`);

    this.atkDefText.setPosition(tx + 120, y + 31);
    this.atkDefText.setText(`ATK ${info.atk}  DEF ${info.def}`);

    // HP 바
    const hbx = tx;
    const hby = y + 48;
    const hbw = 200;
    const hbh = 11;
    this.infoHpBar.clear();
    this.infoHpBar.fillStyle(0x000000, 0.6);
    this.infoHpBar.fillRect(hbx - 2, hby - 2, hbw + 4, hbh + 4);
    const hpr = Phaser.Math.Clamp(info.hp / info.max, 0, 1);
    const hcol = hpr > 0.5 ? 0x4ce04c : hpr > 0.25 ? 0xe0c04c : 0xe04c4c;
    this.infoHpBar.fillStyle(hcol, 1);
    this.infoHpBar.fillRect(hbx, hby, hbw * hpr, hbh);
    this.infoHpText.setPosition(hbx + hbw + 8, hby - 2);
    this.infoHpText.setText(`HP ${info.hp}/${info.max}`);

    // MP 바 (파랑)
    const mby = y + 64;
    const mbh = 9;
    this.infoMpBar.clear();
    this.infoMpBar.fillStyle(0x000000, 0.6);
    this.infoMpBar.fillRect(hbx - 2, mby - 2, hbw + 4, mbh + 4);
    const mpr = info.maxMp > 0 ? Phaser.Math.Clamp(info.mp / info.maxMp, 0, 1) : 0;
    this.infoMpBar.fillStyle(0x3b8ef0, 1);
    this.infoMpBar.fillRect(hbx, mby, hbw * mpr, mbh);
    this.infoMpText.setPosition(hbx + hbw + 8, mby - 3);
    this.infoMpText.setText(`MP ${info.mp}/${info.maxMp}`);

    // 처치 · EXP
    const expStr = info.expNext === Infinity ? 'MAX' : `${info.exp}/${info.expNext}`;
    this.killExpText.setPosition(tx + 330, y + 8);
    this.killExpText.setText(`처치 ${info.kills}    EXP ${expStr}`);

    // 무기 proc 스킬 설명 한 줄 (있을 때만)
    this.procDescText.setPosition(tx + 330, y + 30);
    this.procDescText.setText(info.procDesc ?? '');

    // ---- 2단: 장비 6슬롯 ----
    const rowY = rowSplit + 4;
    const cellW = (w - 24) / 6;
    for (let i = 0; i < 6; i++) {
      const e = info.equip[i];
      const cx = 12 + cellW * i;
      const ic = this.equipIcons[i];
      const nm = this.equipNames[i];
      // 아이콘
      ic.setVisible(true);
      ic.setTexture(e.iconKey);
      ic.setAlpha(e.filled ? 1 : 0.3);
      ic.setPosition(cx + 14, rowY + 15);
      // 이름 (비면 회색 '-')
      nm.setPosition(cx + 30, rowY + 2);
      nm.setText(`${e.slotName}\n${e.name}`);
      nm.setColor(!e.filled ? '#6a7488' : e.highlight ? '#ff9a4a' : '#c8d4e8');
      nm.setFontStyle(e.highlight ? 'bold' : 'normal');
    }
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

import Phaser from 'phaser';
import type { BattleScene, GameState } from './BattleScene';
import { ORDER_LIST, ORDER_NAME } from '../config';

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

  // 부대 명령 패널 (좌상단)
  private squadPanelG!: Phaser.GameObjects.Graphics;
  private tabTexts: Phaser.GameObjects.Text[] = [];
  private tabZones: Phaser.GameObjects.Zone[] = [];
  private orderTexts: Phaser.GameObjects.Text[] = [];
  private orderZones: Phaser.GameObjects.Zone[] = [];
  private moveHintText!: Phaser.GameObjects.Text;
  private bossBannerText!: Phaser.GameObjects.Text;

  // 부대 명령 패널 레이아웃 상수
  private readonly TAB_Y = 74;
  private readonly TAB_W = 118;
  private readonly TAB_H = 30;
  private readonly TAB_GAP = 6;
  private readonly BTN_Y = 110;
  private readonly BTN_W = 60;
  private readonly BTN_H = 28;
  private readonly BTN_GAP = 4;
  private readonly PANEL_X = 12;

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

    // 부대 명령 패널 (좌상단, 상단 HUD 아래)
    this.buildSquadPanel();

    // "적장 격파!" 배너 (보스 처치 이벤트 시 표시)
    this.bossBannerText = this.add
      .text(this.scale.width / 2, this.scale.height * 0.34, '', {
        fontFamily: 'sans-serif',
        fontSize: '54px',
        fontStyle: 'bold',
        color: '#ff5a4a',
        stroke: '#2a0000',
        strokeThickness: 9
      })
      .setOrigin(0.5)
      .setDepth(210)
      .setVisible(false);
    this.battle.events.on('bossKilled', this.showBossBanner, this);

    this.scale.on('resize', () => this.layout());
  }

  // ---------- 부대 명령 패널 ----------
  private buildSquadPanel() {
    this.squadPanelG = this.add.graphics().setDepth(60);
    this.tabTexts = [];
    this.tabZones = [];
    this.orderTexts = [];
    this.orderZones = [];

    // 부대 탭 2개
    for (let i = 0; i < 2; i++) {
      const x = this.PANEL_X + i * (this.TAB_W + this.TAB_GAP);
      const t = this.add
        .text(x + this.TAB_W / 2, this.TAB_Y + this.TAB_H / 2, '', {
          fontFamily: 'sans-serif',
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#ffffff'
        })
        .setOrigin(0.5)
        .setDepth(62);
      this.tabTexts.push(t);
      const z = this.add.zone(x + this.TAB_W / 2, this.TAB_Y + this.TAB_H / 2, this.TAB_W, this.TAB_H).setInteractive();
      z.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        this.battle.selectSquadTab(i);
      });
      this.tabZones.push(z);
    }

    // 명령 버튼 5개
    for (let i = 0; i < ORDER_LIST.length; i++) {
      const x = this.PANEL_X + i * (this.BTN_W + this.BTN_GAP);
      const t = this.add
        .text(x + this.BTN_W / 2, this.BTN_Y + this.BTN_H / 2, ORDER_NAME[ORDER_LIST[i]], {
          fontFamily: 'sans-serif',
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#ffffff'
        })
        .setOrigin(0.5)
        .setDepth(62);
      this.orderTexts.push(t);
      const z = this.add.zone(x + this.BTN_W / 2, this.BTN_Y + this.BTN_H / 2, this.BTN_W, this.BTN_H).setInteractive();
      z.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        this.battle.issueSquadOrder(ORDER_LIST[i]);
      });
      this.orderZones.push(z);
    }

    this.moveHintText = this.add
      .text(this.PANEL_X, this.BTN_Y + this.BTN_H + 6, '', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#ffe066',
        stroke: '#000000',
        strokeThickness: 3
      })
      .setDepth(62);
  }

  private drawSquadPanel() {
    const infos = this.battle.getAllySquadInfos();
    const sel = this.battle.getSelectedSquadTab();
    const g = this.squadPanelG;
    g.clear();

    // 탭
    for (let i = 0; i < this.tabTexts.length; i++) {
      const info = infos[i];
      const x = this.PANEL_X + i * (this.TAB_W + this.TAB_GAP);
      const selected = info && info.selected;
      g.fillStyle(0x0a1020, selected ? 0.92 : 0.55);
      g.fillRoundedRect(x, this.TAB_Y, this.TAB_W, this.TAB_H, 6);
      g.lineStyle(selected ? 3 : 1.5, info ? info.banner : 0x888888, selected ? 1 : 0.7);
      g.strokeRoundedRect(x, this.TAB_Y, this.TAB_W, this.TAB_H, 6);
      // 부대 색 배너 점
      if (info) {
        g.fillStyle(info.banner, 1);
        g.fillRect(x + 8, this.TAB_Y + this.TAB_H / 2 - 5, 10, 10);
      }
      if (info) {
        this.tabTexts[i].setText(`${info.name}  ${info.alive}`);
        this.tabTexts[i].setColor(selected ? '#ffffff' : '#b8c4da');
        this.tabTexts[i].setPosition(x + this.TAB_W / 2 + 8, this.TAB_Y + this.TAB_H / 2);
      } else {
        this.tabTexts[i].setText('');
      }
    }

    // 명령 버튼
    const curOrder = infos[sel] ? infos[sel].order : 'charge';
    for (let i = 0; i < this.orderTexts.length; i++) {
      const x = this.PANEL_X + i * (this.BTN_W + this.BTN_GAP);
      const active = ORDER_LIST[i] === curOrder;
      g.fillStyle(active ? 0xd23b3b : 0x1a2438, active ? 0.95 : 0.7);
      g.fillRoundedRect(x, this.BTN_Y, this.BTN_W, this.BTN_H, 5);
      g.lineStyle(active ? 2.5 : 1, 0xffffff, active ? 0.9 : 0.4);
      g.strokeRoundedRect(x, this.BTN_Y, this.BTN_W, this.BTN_H, 5);
      this.orderTexts[i].setColor(active ? '#ffffff' : '#c8d4e8');
    }

    // 이동 지점 지정 안내
    if (this.battle.isMoveTargeting()) {
      this.moveHintText.setVisible(true);
      this.moveHintText.setText('▶ 집결 지점을 탭하세요');
    } else {
      this.moveHintText.setVisible(false);
    }
  }

  private showBossBanner(name: string) {
    const t = this.bossBannerText;
    t.setPosition(this.scale.width / 2, this.scale.height * 0.34);
    t.setText(`적장 격파!\n${name}`);
    t.setAlpha(1);
    t.setScale(0.6);
    t.setVisible(true);
    this.tweens.killTweensOf(t);
    this.tweens.add({ targets: t, scale: 1, duration: 260, ease: 'Back.Out' });
    this.tweens.add({
      targets: t,
      alpha: 0,
      delay: 1500,
      duration: 500,
      onComplete: () => t.setVisible(false)
    });
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
    this.drawSquadPanel();

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
    const accent = info.isBoss ? 0xff3020 : isEnemy ? 0xd23b3b : info.possessed ? 0xffd23b : 0x3b8ef0;

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
    this.nameText.setColor(info.isBoss ? '#ff5040' : isEnemy ? '#ff9a9a' : info.surrendered ? '#8fc0ff' : '#ffffff');
    this.nameText.setFontStyle('bold');

    // 빙의/소속/보스/투항 태그는 이름 행 우측에
    this.tagText.setPosition(tx + 190, y + 10);
    let tag: string;
    let tagColor: string;
    if (info.isBoss) {
      tag = '☠ 적장(보스)';
      tagColor = '#ff5040';
    } else if (info.surrendered) {
      tag = '⚑ 투항병';
      tagColor = '#8fc0ff';
    } else if (info.possessed) {
      tag = '● 빙의 중';
      tagColor = '#ffe066';
    } else if (isEnemy) {
      tag = '적';
      tagColor = '#ff8080';
    } else {
      tag = '아군';
      tagColor = '#8fc0ff';
    }
    this.tagText.setText(tag);
    this.tagText.setColor(tagColor);

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

    const titleInfo: Record<GameState, { text: string; color: string }> = {
      playing: { text: '', color: '#ffffff' },
      win: { text: '승리!', color: '#ffe066' },
      lose: { text: '패배...', color: '#ff6b6b' },
      escape: { text: '탈출', color: '#7ad0ff' }
    };
    const ti = titleInfo[state];
    const title = this.add.text(w / 2, h * 0.24, ti.text, {
      fontFamily: 'sans-serif',
      fontSize: '64px',
      fontStyle: 'bold',
      color: ti.color,
      stroke: '#000',
      strokeThickness: 8
    });
    title.setOrigin(0.5);
    cont.add(title);

    const res = this.battle.getResult();
    if (state === 'escape' && res) {
      const sub = this.add.text(w / 2, h * 0.34, '부대가 전장을 이탈했습니다 — 다음 거점으로 귀환', {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        color: '#bcd8ea'
      });
      sub.setOrigin(0.5);
      cont.add(sub);
    }
    const lines = res
      ? [
          `아군 전사: ${res.allyDead}`,
          `적 전사: ${res.enemyDead}`,
          `영웅 처치: ${res.heroKills}`,
          `빙의 처치: ${res.playerKills}`,
          `투항 영입: ${res.surrenderedGained}`,
          `탈출 생존: ${res.escapees.length}`
        ]
      : [];
    const stat = this.add.text(w / 2, h * 0.46, lines.join('     '), {
      fontFamily: 'monospace',
      fontSize: '18px',
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

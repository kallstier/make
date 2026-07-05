import Phaser from 'phaser';
import { HERO } from '../config';
import type { BattleScene, GameState } from './BattleScene';

// UIScene: BattleScene 위에 겹쳐 HUD/버튼/오버레이 렌더
export class UIScene extends Phaser.Scene {
  private battle!: BattleScene;

  private hpBarBg!: Phaser.GameObjects.Graphics;
  private hpBar!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private heroMiniText!: Phaser.GameObjects.Text;
  private topText!: Phaser.GameObjects.Text;

  private captureBg!: Phaser.GameObjects.Graphics;
  private captureText!: Phaser.GameObjects.Text;

  private skillBtn!: Phaser.GameObjects.Graphics;
  private skillLabel!: Phaser.GameObjects.Text;
  private skillCx = 0;
  private skillCy = 0;
  private skillR = 46;

  private overlay?: Phaser.GameObjects.Container;
  private shownState: GameState | null = null;

  constructor() {
    super('UIScene');
  }

  create() {
    this.battle = this.scene.get('BattleScene') as BattleScene;
    this.shownState = null;
    this.overlay = undefined;

    const w = this.scale.width;

    // 상단 패널 배경
    const panel = this.add.graphics();
    panel.fillStyle(0x000000, 0.4);
    panel.fillRoundedRect(10, 8, 320, 98, 10);

    this.topText = this.add.text(24, 16, '', {
      fontFamily: 'sans-serif',
      fontSize: '18px',
      color: '#ffffff'
    });

    // 조작 중인 유닛 HP 바 (메인)
    this.hpBarBg = this.add.graphics();
    this.hpBar = this.add.graphics();
    this.hpText = this.add.text(24, 54, '', {
      fontFamily: 'sans-serif',
      fontSize: '13px',
      color: '#ffffff'
    });

    // 영웅 HP 소형 표시 (항상 노출 — 패배 조건)
    this.heroMiniText = this.add.text(24, 80, '', {
      fontFamily: 'sans-serif',
      fontSize: '13px',
      color: '#ffd23b'
    });

    // 점령 게이지
    this.captureBg = this.add.graphics();
    this.captureText = this.add.text(w / 2, 44, '', {
      fontFamily: 'sans-serif',
      fontSize: '16px',
      color: '#ffffff',
      stroke: '#000',
      strokeThickness: 3
    });
    this.captureText.setOrigin(0.5);
    this.captureText.setVisible(false);

    // 스킬 버튼 (오른쪽 하단)
    this.layoutSkillButton();
    this.skillBtn = this.add.graphics();
    this.skillLabel = this.add.text(this.skillCx, this.skillCy, '일섬', {
      fontFamily: 'sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#ffffff'
    });
    this.skillLabel.setOrigin(0.5);

    const skillZone = this.add
      .zone(this.skillCx, this.skillCy, this.skillR * 2, this.skillR * 2)
      .setInteractive({ useHandCursor: true });
    skillZone.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      this.battle.requestSkill();
    });

    this.scale.on('resize', () => {
      this.layoutSkillButton();
      this.skillLabel.setPosition(this.skillCx, this.skillCy);
      skillZone.setPosition(this.skillCx, this.skillCy);
      this.captureText.setPosition(this.scale.width / 2, 44);
    });
  }

  private layoutSkillButton() {
    this.skillCx = this.scale.width - 90;
    this.skillCy = this.scale.height - 90;
  }

  update() {
    if (!this.battle || !this.battle.scene || !this.battle.getHeroHp) return;

    // 상단 스탯
    const sc = this.battle.getStrongholdCounts();
    const ac = this.battle.getAllyCount();
    this.topText.setText(`⚑ 거점 ${sc.ally}/${sc.total}    ⚔ 아군 ${ac}`);

    // HP 바 (조작 중인 유닛)
    const hp = this.battle.getControlledHp();
    const bx = 24;
    const by = 44;
    const bw = 200;
    const bh = 12;
    this.hpBarBg.clear();
    this.hpBarBg.fillStyle(0x000000, 0.6);
    this.hpBarBg.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
    this.hpBar.clear();
    const ratio = Phaser.Math.Clamp(hp.hp / hp.max, 0, 1);
    const col = ratio > 0.5 ? 0x4ce04c : ratio > 0.25 ? 0xe0c04c : 0xe04c4c;
    this.hpBar.fillStyle(col, 1);
    this.hpBar.fillRect(bx, by, bw * ratio, bh);
    this.hpText.setText(`${hp.label} HP ${hp.hp}/${hp.max}`);
    this.hpText.setPosition(bx + bw + 10, by - 2);

    // 영웅 HP 소형 (조작 대상이 영웅이 아닐 때만 별도 표시)
    if (this.battle.isControllingHero()) {
      this.heroMiniText.setText('');
    } else {
      const hh = this.battle.getHeroHp();
      this.heroMiniText.setText(`⚑ 영웅 HP ${hh.hp}/${hh.max}`);
    }

    // 점령 게이지
    const cap = this.battle.getCaptureInfo();
    this.captureBg.clear();
    if (cap) {
      const cw = 300;
      const cx = this.scale.width / 2 - cw / 2;
      const cy = 60;
      this.captureBg.fillStyle(0x000000, 0.55);
      this.captureBg.fillRoundedRect(cx - 6, cy - 6, cw + 12, 22, 6);
      this.captureBg.fillStyle(0x3b6ef0, 1);
      this.captureBg.fillRect(cx, cy, cw * Phaser.Math.Clamp(cap.progress, 0, 1), 10);
      this.captureBg.lineStyle(1, 0xffffff, 0.6);
      this.captureBg.strokeRect(cx, cy, cw, 10);
      this.captureText.setVisible(true);
      this.captureText.setText(`${cap.name} 점령 중...`);
    } else {
      this.captureText.setVisible(false);
    }

    // 스킬 버튼 (쿨다운 원형 표시) — 영웅 조작 중에만 활성
    const skillEnabled = this.battle.isControllingHero();
    this.drawSkillButton(this.battle.getSkillCdRatio(), skillEnabled);
    this.skillLabel.setAlpha(skillEnabled ? 1 : 0.4);

    // 승패 오버레이
    const gs = this.battle.getGameState();
    if (gs !== 'playing' && this.shownState !== gs) {
      this.shownState = gs;
      this.showOverlay(gs);
    }
  }

  private drawSkillButton(cd: number, enabled = true) {
    const g = this.skillBtn;
    g.clear();
    const cx = this.skillCx;
    const cy = this.skillCy;
    const r = this.skillR;
    const alpha = enabled ? 0.85 : 0.35;
    // 바닥
    g.fillStyle(!enabled ? 0x555555 : cd >= 1 ? 0xd23b3b : 0x555555, alpha);
    g.fillCircle(cx, cy, r);
    g.lineStyle(3, 0xffffff, enabled ? 0.8 : 0.35);
    g.strokeCircle(cx, cy, r);
    // 쿨다운 파이 (아직 안 참 부분을 어둡게)
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
    dim.fillStyle(0x000000, 0.6);
    dim.fillRect(0, 0, w, h);
    cont.add(dim);

    const win = state === 'win';
    const title = this.add.text(w / 2, h * 0.36, win ? '승리!' : '패배...', {
      fontFamily: 'sans-serif',
      fontSize: '64px',
      fontStyle: 'bold',
      color: win ? '#ffe066' : '#ff6b6b',
      stroke: '#000',
      strokeThickness: 8
    });
    title.setOrigin(0.5);
    cont.add(title);

    const sub = this.add.text(
      w / 2,
      h * 0.48,
      win ? '대륙의 모든 거점을 점령했다!' : '영웅이 쓰러졌다...',
      { fontFamily: 'sans-serif', fontSize: '22px', color: '#e0e0e0' }
    );
    sub.setOrigin(0.5);
    cont.add(sub);

    // 다시 시작 버튼
    const bw = 220;
    const bh = 60;
    const bx = w / 2;
    const by = h * 0.62;
    const btn = this.add.graphics();
    btn.fillStyle(0x3b6ef0, 1);
    btn.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 12);
    btn.lineStyle(3, 0xffffff, 0.8);
    btn.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 12);
    cont.add(btn);

    const btnText = this.add.text(bx, by, '다시 시작', {
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
      this.battle.restart();
    });
    cont.add(zone);

    this.overlay = cont;
  }
}

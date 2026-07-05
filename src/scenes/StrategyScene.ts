import Phaser from 'phaser';
import { genContinent } from '../world/MapGen';
import {
  getState,
  getNode,
  getSquad,
  squadsAt,
  areAdjacent,
  buildBattleSetup,
  healSquadOnFriendlyNode,
  garrisonEstimate,
  garrisonIconType,
  garrisonTotal,
  squadAvgLevel,
  squadHasHero,
  initGameState,
  NodeState,
  SquadState,
  PendingAttack
} from '../state/GameState';

const STRAT_W = 1300;
const STRAT_H = 1050;

// ============================================================
// StrategyScene: 삼국지풍 거점 노드맵 + 턴제 부대 이동/점령/전투 연결
// ============================================================
export class StrategyScene extends Phaser.Scene {
  private overlay!: Phaser.GameObjects.Graphics; // 엣지 + 하이라이트 + 이동 화살표
  private nodeObjs = new Map<
    string,
    { castle: Phaser.GameObjects.Image; flag: Phaser.GameObjects.Image; icon: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text }
  >();
  private squadImgs = new Map<number, { banner: Phaser.GameObjects.Image; text: Phaser.GameObjects.Text }>();

  private selectedSquadId: number | null = null;

  // 입력/카메라
  private downX = 0;
  private downY = 0;
  private downTime = 0;
  private moved = 0;
  private lastPinch = 0;
  private uiConsumed = false;
  private popupOpen = false;

  // UI (scrollFactor 0)
  private turnBar!: Phaser.GameObjects.Graphics;
  private turnText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private endBtn!: Phaser.GameObjects.Graphics;
  private endBtnText!: Phaser.GameObjects.Text;
  private endZone!: Phaser.GameObjects.Zone;
  private squadCard!: Phaser.GameObjects.Container;
  private nodeCard!: Phaser.GameObjects.Container;
  private popup!: Phaser.GameObjects.Container;
  private endScreen!: Phaser.GameObjects.Container;

  // 카메라 fit 상태
  private minZoom = 0.4;
  private userZoomed = false; // 사용자가 핀치/휠로 줌을 조정했는지 (리사이즈 시 재-fit 여부 판단)

  constructor() {
    super('StrategyScene');
  }

  create() {
    this.nodeObjs.clear();
    this.squadImgs.clear();
    this.selectedSquadId = null;
    this.popupOpen = false;
    this.lastPinch = 0;

    // 배경 대륙
    genContinent(this, STRAT_W, STRAT_H, 'continent');
    this.add.image(0, 0, 'continent').setOrigin(0, 0).setDepth(0);

    this.overlay = this.add.graphics().setDepth(2);

    // 노드 (성채/깃발/아이콘/라벨)
    const st = getState();
    for (const node of st.nodes) {
      const castle = this.add.image(node.x, node.y, 'castle').setDepth(5);
      const flag = this.add.image(node.x + 20, node.y - 30, 'nodeFlag_ally').setDepth(7).setOrigin(0.5, 1);
      const icon = this.add.image(node.x, node.y - 42, 'castle').setDepth(7);
      const label = this.add
        .text(node.x, node.y + 26, node.name, {
          fontFamily: 'sans-serif',
          fontSize: '18px',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#101820',
          strokeThickness: 4
        })
        .setOrigin(0.5, 0)
        .setDepth(7);
      this.nodeObjs.set(node.id, { castle, flag, icon, label });
    }
    this.refreshNodes();

    // 부대 배너
    for (const sq of st.squads) {
      const banner = this.add.image(0, 0, `banner_${sq.id}`).setDepth(9).setScale(1.6);
      const text = this.add
        .text(0, 0, sq.name, {
          fontFamily: 'sans-serif',
          fontSize: '12px',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 3
        })
        .setOrigin(0.5, 0)
        .setDepth(9);
      this.squadImgs.set(sq.id, { banner, text });
    }
    this.refreshSquads();

    this.setupCamera();
    this.setupInput();
    this.buildUI();
    this.layout();
    this.redrawOverlay();
    this.installDebug();

    // 뷰포트 변화(회전/창 크기) 대응: 카메라 재-fit + UI 재배치
    this.scale.on('resize', this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', this.onResize, this));

    // 게임 종료/승리 → 결과 화면. 아니면 대기 중인 공격(순차 전투) 재개.
    if (st.gameOver || st.victory) {
      this.showEndScreen(st.victory);
    } else if (st.pendingAttacks.length > 0) {
      this.time.delayedCall(250, () => this.beginNextAttack(false));
    }
  }

  // ---------- 카메라 ----------
  // 지도 전체(1300x1050)가 뷰포트에 들어오는 줌 = fit. 최소 줌 = fit, 최대 = 2.5.
  private computeFit(): number {
    return Math.min(this.scale.width / STRAT_W, this.scale.height / STRAT_H);
  }

  private setupCamera() {
    const cam = this.cameras.main;
    // Phaser 기본 바운즈는 지도<뷰포트 축을 상단에 고정(센터링 안 됨) → 직접 스크롤 관리
    cam.useBounds = false;
    cam.setBackgroundColor('#1f4a67'); // 남는 여백은 바다 톤으로 (순수 남색 공백 방지)
    this.userZoomed = false;
    this.fitCamera(true);
  }

  // 카메라를 지도에 맞춤. initial=true 또는 사용자가 줌을 건드리지 않았으면 fit,
  // 사용자가 줌 중이면 새 fit 범위로 클램프만. 이후 항상 clampOrCenter로 위치 정리.
  private fitCamera(initial: boolean) {
    const cam = this.cameras.main;
    const fit = this.computeFit();
    this.minZoom = fit;
    if (initial || !this.userZoomed) {
      cam.setZoom(fit);
    } else {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom, this.minZoom, 2.5));
    }
    this.clampOrCenter();
  }

  // 축별로: 지도가 뷰포트보다 작으면(전부 보임) 중앙 정렬, 크면(줌인) 지도 밖으로 못 나가게 클램프.
  // Phaser는 카메라 중심 기준으로 줌하므로 midPoint(= scroll + viewport/2, 월드 좌표) 기준으로 계산한다.
  private clampOrCenter() {
    const cam = this.cameras.main;
    const halfW = this.scale.width / 2;
    const halfH = this.scale.height / 2;
    const dispW = this.scale.width / cam.zoom; // 화면에 보이는 월드 폭
    const dispH = this.scale.height / cam.zoom;
    // 보고자 하는 월드 중심 좌표 (지도 전부 보이면 지도 중앙, 아니면 지도 안으로 클램프)
    const cx = STRAT_W <= dispW ? STRAT_W / 2 : Phaser.Math.Clamp(cam.scrollX + halfW, dispW / 2, STRAT_W - dispW / 2);
    const cy = STRAT_H <= dispH ? STRAT_H / 2 : Phaser.Math.Clamp(cam.scrollY + halfH, dispH / 2, STRAT_H - dispH / 2);
    cam.scrollX = cx - halfW;
    cam.scrollY = cy - halfH;
  }

  private setZoom(z: number) {
    this.userZoomed = true;
    this.cameras.main.setZoom(Phaser.Math.Clamp(z, this.minZoom, 2.5));
    this.clampOrCenter();
  }

  private onResize() {
    this.fitCamera(false);
    this.layout();
  }

  // ---------- 입력 ----------
  private setupInput() {
    this.input.addPointer(2);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.downX = p.x;
      this.downY = p.y;
      this.downTime = this.time.now;
      this.moved = 0;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      const p1 = this.input.pointer1;
      const p2 = this.input.pointer2;
      if (p1.isDown && p2.isDown) {
        const d = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        if (this.lastPinch > 0) this.setZoom(this.cameras.main.zoom * (d / this.lastPinch));
        this.lastPinch = d;
        this.moved = 999;
        return;
      }
      const dx = p.x - p.prevPosition.x;
      const dy = p.y - p.prevPosition.y;
      this.moved += Math.hypot(dx, dy);
      const cam = this.cameras.main;
      cam.scrollX -= dx / cam.zoom;
      cam.scrollY -= dy / cam.zoom;
      this.clampOrCenter(); // 지도 밖으로 못 나가게 (전부 보이는 축은 중앙 고정)
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      this.lastPinch = 0;
      if (this.uiConsumed) {
        this.uiConsumed = false;
        return;
      }
      const dur = this.time.now - this.downTime;
      if (this.moved < 14 && dur < 400) {
        const wp = this.cameras.main.getWorldPoint(p.x, p.y);
        this.onTap(wp.x, wp.y);
      }
    });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      this.setZoom(this.cameras.main.zoom * (dy > 0 ? 0.9 : 1.11));
    });
  }

  private onTap(wx: number, wy: number) {
    if (this.popupOpen) return;
    // 1) 부대 배너 우선
    const sq = this.pickSquad(wx, wy);
    if (sq) {
      this.selectSquad(sq.id);
      return;
    }
    // 2) 노드
    const node = this.pickNode(wx, wy);
    if (node) {
      if (this.selectedSquadId != null) {
        const sel = getSquad(this.selectedSquadId);
        if (sel && node.id !== sel.location && areAdjacent(sel.location, node.id)) {
          this.toggleMove(this.selectedSquadId, node.id);
          this.showNodeCard(node);
          return;
        }
      }
      this.showNodeCard(node);
      return;
    }
    // 3) 빈 곳: 선택 해제
    this.selectSquad(null);
    this.hideCards();
  }

  private pickSquad(wx: number, wy: number): SquadState | null {
    let best: SquadState | null = null;
    let bestD = 40 * 40;
    for (const sq of getState().squads) {
      const img = this.squadImgs.get(sq.id);
      if (!img) continue;
      const d = Phaser.Math.Distance.Squared(wx, wy, img.banner.x, img.banner.y);
      if (d < bestD) {
        bestD = d;
        best = sq;
      }
    }
    return best;
  }

  private pickNode(wx: number, wy: number): NodeState | null {
    let best: NodeState | null = null;
    let bestD = 54 * 54;
    for (const node of getState().nodes) {
      const d = Phaser.Math.Distance.Squared(wx, wy, node.x, node.y);
      if (d < bestD) {
        bestD = d;
        best = node;
      }
    }
    return best;
  }

  // ---------- 선택 / 이동 예약 ----------
  private selectSquad(id: number | null) {
    this.selectedSquadId = id;
    if (id != null) this.showSquadCard(id);
    else this.hideCards();
    this.redrawOverlay();
  }

  private toggleMove(squadId: number, nodeId: string) {
    const st = getState();
    if (st.reservedMoves[squadId] === nodeId) delete st.reservedMoves[squadId];
    else st.reservedMoves[squadId] = nodeId; // 한 턴 한 칸: 재지정 시 덮어씀
    this.redrawOverlay();
  }

  // ---------- 렌더 ----------
  private refreshNodes() {
    for (const node of getState().nodes) {
      const o = this.nodeObjs.get(node.id);
      if (!o) continue;
      if (node.owner === 'ally') {
        o.flag.setTexture('nodeFlag_ally').setVisible(true);
        o.icon.setVisible(false);
      } else {
        o.flag.setTexture('nodeFlag_monster').setVisible(true);
        const it = garrisonIconType(node);
        if (it) {
          o.icon.setTexture(`u_${it}_${node.enemySquadId}`, 0).setVisible(true);
        } else {
          o.icon.setVisible(false);
        }
      }
    }
  }

  private refreshSquads() {
    const st = getState();
    // 노드별 부대 인덱스 (겹치면 나란히)
    const perNode = new Map<string, number>();
    for (const sq of st.squads) {
      const img = this.squadImgs.get(sq.id);
      if (!img) continue;
      const node = getNode(sq.location);
      if (!node) {
        img.banner.setVisible(false);
        img.text.setVisible(false);
        continue;
      }
      const idx = perNode.get(node.id) ?? 0;
      perNode.set(node.id, idx + 1);
      const bx = node.x - 30 + idx * 34;
      const by = node.y - 6;
      img.banner.setPosition(bx, by).setVisible(true);
      img.text.setPosition(bx, by + 10).setVisible(true).setText(`${sq.name}·${sq.units.length}`);
    }
    // 소멸한 부대 이미지 숨김
    for (const [id, img] of this.squadImgs) {
      if (!getSquad(id)) {
        img.banner.setVisible(false);
        img.text.setVisible(false);
      }
    }
  }

  private redrawOverlay() {
    const g = this.overlay;
    g.clear();
    const st = getState();
    // 1) 엣지 (길): 갈색 점선
    const drawn = new Set<string>();
    for (const node of st.nodes) {
      for (const nb of node.neighbors) {
        const key = [node.id, nb].sort().join('|');
        if (drawn.has(key)) continue;
        drawn.add(key);
        const o = getNode(nb);
        if (!o) continue;
        this.dashedLine(g, node.x, node.y, o.x, o.y, 0xe8dcc0, 0.55, 12, 8, 3);
      }
    }
    // 2) 선택 부대: 인접 노드 강조
    if (this.selectedSquadId != null) {
      const sel = getSquad(this.selectedSquadId);
      if (sel) {
        const from = getNode(sel.location);
        if (from) {
          g.lineStyle(3, 0xffe066, 0.9);
          g.strokeCircle(from.x, from.y, 30);
          for (const nb of from.neighbors) {
            const n = getNode(nb);
            if (!n) continue;
            g.lineStyle(3, 0xffe066, 0.85);
            g.strokeCircle(n.x, n.y, 28);
          }
        }
      }
    }
    // 3) 예약 이동 화살표
    for (const sidStr of Object.keys(st.reservedMoves)) {
      const sid = Number(sidStr);
      const sq = getSquad(sid);
      if (!sq) continue;
      const from = getNode(sq.location);
      const to = getNode(st.reservedMoves[sid]);
      if (!from || !to) continue;
      const enemy = to.owner === 'monster';
      this.drawArrow(g, from.x, from.y, to.x, to.y, enemy ? 0xff5a4a : 0x6ad0ff);
    }
  }

  private dashedLine(
    g: Phaser.GameObjects.Graphics,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: number,
    alpha: number,
    dash: number,
    gap: number,
    width: number
  ) {
    const dist = Phaser.Math.Distance.Between(x1, y1, x2, y2);
    const steps = Math.floor(dist / (dash + gap));
    const nx = (x2 - x1) / dist;
    const ny = (y2 - y1) / dist;
    g.lineStyle(width, color, alpha);
    for (let i = 0; i < steps; i++) {
      const s = i * (dash + gap);
      g.lineBetween(x1 + nx * s, y1 + ny * s, x1 + nx * (s + dash), y1 + ny * (s + dash));
    }
  }

  private drawArrow(g: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number, color: number) {
    const ang = Math.atan2(y2 - y1, x2 - x1);
    // 노드 반경만큼 끝을 당김
    const bx = x2 - Math.cos(ang) * 34;
    const by = y2 - Math.sin(ang) * 34;
    const sx = x1 + Math.cos(ang) * 30;
    const sy = y1 + Math.sin(ang) * 30;
    g.lineStyle(5, color, 0.95);
    g.lineBetween(sx, sy, bx, by);
    const head = 16;
    g.fillStyle(color, 0.95);
    g.beginPath();
    g.moveTo(bx + Math.cos(ang) * head, by + Math.sin(ang) * head);
    g.lineTo(bx + Math.cos(ang + 2.5) * head, by + Math.sin(ang + 2.5) * head);
    g.lineTo(bx + Math.cos(ang - 2.5) * head, by + Math.sin(ang - 2.5) * head);
    g.closePath();
    g.fillPath();
  }

  // 안전 여백 (모바일 노치 고려)
  private readonly PAD = 12;
  private readonly END_W = 150;
  private readonly END_H = 56;

  // ---------- UI ----------
  // 객체 생성만 담당. 실제 좌표 배치는 layout()이 (생성 시/리사이즈 시 동일하게) 수행.
  private buildUI() {
    // 상단: 턴 카운터 (좌상 앵커)
    this.turnBar = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.turnText = this.add
      .text(0, 0, '', { fontFamily: 'sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#ffe066' })
      .setScrollFactor(0)
      .setDepth(101);

    // 하단 중앙: 안내 문구 (좁은 화면에서는 layout에서 숨김)
    this.hintText = this.add
      .text(0, 0, '부대를 탭해 선택 → 인접 거점 탭으로 이동 예약 → 턴 종료', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#cfe0f0',
        stroke: '#000000',
        strokeThickness: 3
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(101);

    // 우하단: 턴 종료 버튼
    this.endBtn = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.endBtnText = this.add
      .text(0, 0, '턴 종료', { fontFamily: 'sans-serif', fontSize: '22px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(101);
    this.endZone = this.add
      .zone(0, 0, this.END_W, this.END_H)
      .setScrollFactor(0)
      .setDepth(102)
      .setInteractive({ useHandCursor: true });
    this.endZone.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      this.uiConsumed = true;
      this.endTurnHuman();
    });

    // 카드 컨테이너 (좌하단)
    this.squadCard = this.add.container(0, 0).setScrollFactor(0).setDepth(103).setVisible(false);
    this.nodeCard = this.add.container(0, 0).setScrollFactor(0).setDepth(103).setVisible(false);
    this.popup = this.add.container(0, 0).setScrollFactor(0).setDepth(150).setVisible(false);
    this.endScreen = this.add.container(0, 0).setScrollFactor(0).setDepth(160).setVisible(false);

    this.updateTurnText();
  }

  // 뷰포트(this.scale.width/height) 기준으로 모든 고정 UI를 앵커링. 생성/리사이즈 공용.
  private layout() {
    const w = this.scale.width;
    const h = this.scale.height;
    const pad = this.PAD;

    // 턴 카운터: 좌상 (반투명 배경 유지 — 지도 라벨 위에 떠도 가독)
    this.turnBar.clear();
    this.turnBar.fillStyle(0x0a1424, 0.8);
    this.turnBar.fillRoundedRect(pad, pad, 220, 46, 8);
    this.turnText.setPosition(pad + 12, pad + 8);

    // 턴 종료: 우하단 고정
    const bw = this.END_W;
    const bh = this.END_H;
    const bx = w - bw / 2 - pad;
    const by = h - bh / 2 - pad;
    this.endBtn.clear();
    this.endBtn.fillStyle(0x2f6ad0, 1);
    this.endBtn.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 12);
    this.endBtn.lineStyle(3, 0xffffff, 0.85);
    this.endBtn.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 12);
    this.endBtnText.setPosition(bx, by);
    this.endZone.setPosition(bx, by);

    // 안내 문구: 하단 중앙. 카드/버튼과 겹칠 좁은 화면에서는 숨김.
    this.hintText.setPosition(w / 2, h - pad);
    this.hintText.setVisible(w >= 820);

    // 표시 중인 정보 카드 재배치
    this.layoutCards();
  }

  private layoutCards() {
    const h = this.scale.height;
    for (const card of [this.squadCard, this.nodeCard]) {
      if (!card.visible) continue;
      const ch = (card.getData('ch') as number) ?? 96;
      card.setPosition(this.PAD, h - ch - (this.END_H + this.PAD * 2));
    }
  }

  private cardWidth(): number {
    return Math.min(360, this.scale.width - 24);
  }

  private updateTurnText() {
    const st = getState();
    const owned = st.nodes.filter((n) => n.owner === 'ally').length;
    this.turnText.setText(`턴 ${st.turn}   거점 ${owned}/${st.nodes.length}`);
  }

  private hideCards() {
    this.squadCard.setVisible(false);
    this.nodeCard.setVisible(false);
  }

  private cardBg(width: number, height: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    g.fillStyle(0x0a1424, 0.9);
    g.fillRoundedRect(0, 0, width, height, 10);
    g.lineStyle(2, 0x3a5a86, 0.9);
    g.strokeRoundedRect(0, 0, width, height, 10);
    return g;
  }

  private showSquadCard(id: number) {
    const sq = getSquad(id);
    if (!sq) return;
    this.nodeCard.setVisible(false);
    this.squadCard.removeAll(true);
    const cw = this.cardWidth();
    const ch = 96;
    this.squadCard.setData('ch', ch);
    this.squadCard.add(this.cardBg(cw, ch));
    const node = getNode(sq.location);
    const lines = [
      `${sq.name}   (${node ? node.name : '-'})`,
      `인원 ${sq.units.length}명   평균 LV ${(Math.round(squadAvgLevel(sq) * 10) / 10).toFixed(1)}`,
      squadHasHero(sq) ? '영웅 포함' : '영웅 없음'
    ];
    this.squadCard.add(
      this.add.text(12, 10, lines.join('\n'), {
        fontFamily: 'sans-serif',
        fontSize: '15px',
        color: '#eaf2ff',
        lineSpacing: 6
      })
    );
    // 배너 색 점
    const dot = this.add.graphics();
    dot.fillStyle(sq.banner, 1);
    dot.fillRect(cw - 26, 12, 14, 14);
    this.squadCard.add(dot);
    this.squadCard.setVisible(true);
    this.layoutCards();
  }

  private showNodeCard(node: NodeState) {
    this.squadCard.setVisible(false);
    this.nodeCard.removeAll(true);
    const cw = this.cardWidth();
    const ch = 92;
    this.nodeCard.setData('ch', ch);
    this.nodeCard.add(this.cardBg(cw, ch));
    const ownerStr = node.owner === 'ally' ? '아군 점령' : '적 점유';
    const def = node.owner === 'ally' ? (garrisonTotal(node) === 0 ? '아군 영토' : '') : garrisonEstimate(node);
    const lines = [`${node.name}   [${ownerStr}]`, `수비: ${def || '-'}`];
    this.nodeCard.add(
      this.add.text(12, 12, lines.join('\n'), {
        fontFamily: 'sans-serif',
        fontSize: '15px',
        color: '#eaf2ff',
        lineSpacing: 8
      })
    );
    this.nodeCard.setVisible(true);
    this.layoutCards();
  }

  // ---------- 턴 종료 ----------
  // 예약 이동 처리: 평화 이동은 즉시, 적 노드행은 pendingAttacks 로 큐잉.
  // 반환 = 전투 필요 여부.
  private resolveEndTurn(): boolean {
    const st = getState();
    const attacks = new Map<string, number[]>();
    for (const sidStr of Object.keys(st.reservedMoves)) {
      const sid = Number(sidStr);
      const sq = getSquad(sid);
      const target = getNode(st.reservedMoves[sid]);
      if (!sq || !target) continue;
      if (!areAdjacent(sq.location, target.id)) continue;
      if (target.owner === 'ally') {
        sq.location = target.id; // 평화 이동/증원
      } else {
        if (!attacks.has(target.id)) attacks.set(target.id, []);
        attacks.get(target.id)!.push(sid); // 합동 전투
      }
    }
    st.pendingAttacks = Array.from(attacks.entries()).map(([targetNodeId, squadIds]) => ({ targetNodeId, squadIds }));

    // 주둔 정비: 공격에 나서지 않고 아군 노드에 있는 부대 HP/MP 회복
    const attackingIds = new Set<number>();
    for (const a of st.pendingAttacks) for (const s of a.squadIds) attackingIds.add(s);
    for (const sq of st.squads) {
      const node = getNode(sq.location);
      if (node && node.owner === 'ally' && !attackingIds.has(sq.id)) healSquadOnFriendlyNode(sq);
    }

    st.reservedMoves = {};
    st.turn++;
    return st.pendingAttacks.length > 0;
  }

  private endTurnHuman() {
    const hasBattle = this.resolveEndTurn();
    this.selectSquad(null);
    this.refreshSquads();
    this.refreshNodes();
    this.updateTurnText();
    this.redrawOverlay();
    if (hasBattle) this.beginNextAttack(false);
    else this.checkEndState();
  }

  private beginNextAttack(auto: boolean) {
    const st = getState();
    if (st.pendingAttacks.length === 0) return;
    const atk = st.pendingAttacks[0];
    if (auto) this.launchAttack(atk);
    else this.showAttackPopup(atk);
  }

  private launchAttack(atk: PendingAttack) {
    const setup = buildBattleSetup(atk.targetNodeId, atk.squadIds);
    this.scene.start('BattleScene', { setup });
    this.scene.launch('UIScene');
  }

  private showAttackPopup(atk: PendingAttack) {
    const node = getNode(atk.targetNodeId);
    if (!node) return;
    this.popupOpen = true;
    this.popup.removeAll(true);
    const w = this.scale.width;
    const h = this.scale.height;
    const dim = this.add.graphics();
    dim.fillStyle(0x000000, 0.6);
    dim.fillRect(0, 0, w, h);
    this.popup.add(dim);
    const title = this.add
      .text(w / 2, h * 0.34, `${node.name} 공격!`, {
        fontFamily: 'sans-serif',
        fontSize: '46px',
        fontStyle: 'bold',
        color: '#ff5a4a',
        stroke: '#2a0000',
        strokeThickness: 8
      })
      .setOrigin(0.5);
    this.popup.add(title);
    const sub = this.add
      .text(w / 2, h * 0.44, `${garrisonEstimate(node)}\n참전 부대 ${atk.squadIds.length}개`, {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        color: '#e6eefb',
        align: 'center'
      })
      .setOrigin(0.5);
    this.popup.add(sub);

    this.addPopupButton(w / 2 - 110, h * 0.58, '공격', 0xd23b3b, () => {
      this.popupOpen = false;
      this.popup.setVisible(false);
      this.launchAttack(atk);
    });
    this.addPopupButton(w / 2 + 110, h * 0.58, '취소', 0x445066, () => {
      this.popupOpen = false;
      this.popup.setVisible(false);
      // 이 공격 취소 (부대는 제자리 유지)
      const st = getState();
      st.pendingAttacks = st.pendingAttacks.filter((p) => p.targetNodeId !== atk.targetNodeId);
      if (st.pendingAttacks.length > 0) this.beginNextAttack(false);
      else this.checkEndState();
    });
    this.popup.setVisible(true);
  }

  private addPopupButton(cx: number, cy: number, label: string, color: number, onClick: () => void) {
    const bw = 180;
    const bh = 56;
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillRoundedRect(cx - bw / 2, cy - bh / 2, bw, bh, 12);
    g.lineStyle(3, 0xffffff, 0.85);
    g.strokeRoundedRect(cx - bw / 2, cy - bh / 2, bw, bh, 12);
    this.popup.add(g);
    const t = this.add
      .text(cx, cy, label, { fontFamily: 'sans-serif', fontSize: '24px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5);
    this.popup.add(t);
    const zone = this.add.zone(cx, cy, bw, bh).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      this.uiConsumed = true;
      onClick();
    });
    this.popup.add(zone);
  }

  private checkEndState() {
    const st = getState();
    if (st.gameOver || st.victory) this.showEndScreen(st.victory);
  }

  private showEndScreen(victory: boolean) {
    const st = getState();
    this.popupOpen = true;
    this.endScreen.removeAll(true);
    const w = this.scale.width;
    const h = this.scale.height;
    const dim = this.add.graphics();
    dim.fillStyle(0x000000, 0.72);
    dim.fillRect(0, 0, w, h);
    this.endScreen.add(dim);
    this.endScreen.add(
      this.add
        .text(w / 2, h * 0.3, victory ? '천하 통일!' : '패망...', {
          fontFamily: 'sans-serif',
          fontSize: '64px',
          fontStyle: 'bold',
          color: victory ? '#ffe066' : '#ff6b6b',
          stroke: '#000000',
          strokeThickness: 9
        })
        .setOrigin(0.5)
    );
    this.endScreen.add(
      this.add
        .text(
          w / 2,
          h * 0.46,
          `총 ${st.turn - 1}턴   전투 ${st.battleCount}회   승 ${st.wins} · 패 ${st.losses} · 탈출 ${st.escapes}`,
          { fontFamily: 'monospace', fontSize: '18px', color: '#e6eefb', align: 'center' }
        )
        .setOrigin(0.5)
    );
    const bw = 220;
    const bh = 58;
    const bx = w / 2;
    const by = h * 0.62;
    const g = this.add.graphics();
    g.fillStyle(0x2f6ad0, 1);
    g.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 12);
    g.lineStyle(3, 0xffffff, 0.85);
    g.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 12);
    this.endScreen.add(g);
    this.endScreen.add(
      this.add
        .text(bx, by, '다시 시작', { fontFamily: 'sans-serif', fontSize: '24px', fontStyle: 'bold', color: '#ffffff' })
        .setOrigin(0.5)
    );
    const zone = this.add.zone(bx, by, bw, bh).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      this.uiConsumed = true;
      initGameState();
      this.scene.restart();
    });
    this.endScreen.add(zone);
    this.endScreen.setVisible(true);
  }

  // ---------- 디버그 ----------
  private installDebug() {
    (window as any).__debug = {
      scene: () => 'strategy',
      // 전체 지도가 보이도록 카메라 맞춤 (스크린샷/개요용)
      fitMap: () => {
        this.userZoomed = false;
        this.fitCamera(true);
        return this.cameras.main.zoom;
      },
      // 검증용: 카메라/뷰포트 상태
      camInfo: () => {
        const cam = this.cameras.main;
        return {
          zoom: cam.zoom,
          minZoom: this.minZoom,
          scrollX: cam.scrollX,
          scrollY: cam.scrollY,
          viewW: this.scale.width,
          viewH: this.scale.height,
          worldW: STRAT_W,
          worldH: STRAT_H
        };
      },
      // 검증용: 노드의 화면(스크린) 좌표 — 전부 뷰포트 안에 있는지 확인
      // Phaser 실제 렌더와 일치하도록 worldView(보이는 월드 사각형) 기준으로 투영한다.
      nodeScreenPoints: () => {
        const cam = this.cameras.main;
        const wv = cam.worldView;
        const out: Record<string, { x: number; y: number }> = {};
        for (const n of getState().nodes) {
          const sx = (n.x - wv.x) * cam.zoom;
          const sy = (n.y - wv.y) * cam.zoom;
          out[n.id] = { x: Math.round(sx), y: Math.round(sy) };
        }
        return out;
      },
      // 검증용: 턴 종료 버튼 중심 (스크린 좌표, scrollFactor 0)
      endBtnCenter: () => ({ x: this.endZone.x, y: this.endZone.y }),
      turn: () => getState().turn,
      nodeOwners: () => {
        const o: Record<string, string> = {};
        for (const n of getState().nodes) o[n.id] = n.owner;
        return o;
      },
      nodes: () =>
        getState().nodes.map((n) => ({
          id: n.id,
          name: n.name,
          owner: n.owner,
          neighbors: n.neighbors.slice(),
          garrison: garrisonTotal(n)
        })),
      squads: () =>
        getState().squads.map((s) => ({
          id: s.id,
          name: s.name,
          location: s.location,
          units: s.units.length,
          avgLevel: Math.round(squadAvgLevel(s) * 10) / 10,
          hasHero: squadHasHero(s)
        })),
      squadAt: (squadId: number) => {
        const s = getSquad(squadId);
        return s ? s.location : null;
      },
      squadUnits: (squadId: number) => {
        const s = getSquad(squadId);
        if (!s) return null;
        return s.units.map((u) => ({
          uid: u.uid,
          unitType: u.unitType,
          level: u.level,
          hp: Math.round(u.hp),
          surrendered: u.surrendered,
          isHero: u.isHero
        }));
      },
      adjacent: (nodeId: string) => {
        const n = getNode(nodeId);
        return n ? n.neighbors.slice() : [];
      },
      enemyNeighbors: (squadId: number) => {
        const s = getSquad(squadId);
        if (!s) return [];
        const from = getNode(s.location);
        if (!from) return [];
        return from.neighbors.filter((nb) => getNode(nb)?.owner === 'monster');
      },
      selectSquad: (squadId: number) => {
        this.selectSquad(squadId);
        return this.selectedSquadId;
      },
      orderMove: (squadId: number, nodeId: string) => {
        const s = getSquad(squadId);
        if (!s || !areAdjacent(s.location, nodeId)) return false;
        getState().reservedMoves[squadId] = nodeId;
        this.redrawOverlay();
        return true;
      },
      cancelMove: (squadId: number) => {
        delete getState().reservedMoves[squadId];
        this.redrawOverlay();
        return true;
      },
      reservedMoves: () => ({ ...getState().reservedMoves }),
      // 예약 이동을 실행. 전투가 필요하면 즉시 전투 진입(자동 확인).
      endTurn: () => {
        const hasBattle = this.resolveEndTurn();
        this.selectSquad(null);
        this.refreshSquads();
        this.refreshNodes();
        this.updateTurnText();
        this.redrawOverlay();
        if (hasBattle) {
          const atk = getState().pendingAttacks[0];
          this.launchAttack(atk);
          return { battle: true, target: atk.targetNodeId, squads: atk.squadIds };
        }
        this.checkEndState();
        return { battle: false };
      },
      pendingAttacks: () => getState().pendingAttacks.map((p) => ({ ...p })),
      // 대기 중인 첫 공격 즉시 전투 진입 (팝업 우회)
      confirmBattle: () => {
        const st = getState();
        if (st.pendingAttacks.length === 0) return false;
        this.launchAttack(st.pendingAttacks[0]);
        return true;
      },
      victory: () => getState().victory,
      gameOver: () => getState().gameOver,
      gameStateSummary: () => {
        const st = getState();
        return {
          turn: st.turn,
          battles: st.battleCount,
          wins: st.wins,
          losses: st.losses,
          escapes: st.escapes,
          gameOver: st.gameOver,
          victory: st.victory,
          allyNodes: st.nodes.filter((n) => n.owner === 'ally').map((n) => n.id),
          squads: st.squads.map((s) => ({ id: s.id, location: s.location, units: s.units.length }))
        };
      }
    };
  }
}

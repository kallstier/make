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
  // 팝업/결과창 버튼의 화면좌표 히트 영역.
  // 컨테이너(scrollFactor 0) 내부 zone은 카메라 줌/스크롤 시 입력 판정이 어긋나는
  // Phaser 제약이 있어, 화면 좌표로 직접 히트 테스트한다.
  private popupHits: { x: number; y: number; w: number; h: number; cb: () => void }[] = [];

  // UI (scrollFactor 0) — 하단 고정 툴바
  private toolbar!: Phaser.GameObjects.Graphics; // 툴바 배경 패널
  private turnText!: Phaser.GameObjects.Text; // 좌측: 턴/거점
  private ctxText!: Phaser.GameObjects.Text; // 중앙: 상황별 안내/부대·노드 정보
  private endBtn!: Phaser.GameObjects.Graphics;
  private endBtnText!: Phaser.GameObjects.Text;
  private cancelBtn!: Phaser.GameObjects.Graphics;
  private cancelBtnText!: Phaser.GameObjects.Text;
  private popup!: Phaser.GameObjects.Container;
  private endScreen!: Phaser.GameObjects.Container;
  // 툴바 버튼 화면좌표 히트 rect (카메라 줌과 무관하게 직접 판정)
  private endRect = { x: 0, y: 0, w: 0, h: 0 };
  private cancelRect = { x: 0, y: 0, w: 0, h: 0 };
  private cancelActive = false;
  private downOnToolbar = false;
  private ctxNodeId: string | null = null; // 마지막으로 탭한 노드(정보 표시용)

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
  // 하단 툴바 높이 (세로화면은 2줄 레이아웃이라 더 크게)
  private toolbarH(): number {
    return this.scale.height > this.scale.width ? 124 : 78;
  }

  // 지도 전체(1300x1050)가 "툴바 위 영역"에 들어오는 줌 = fit. 약간의 여백(0.98)으로 가장자리 노드가 안 잘리게.
  private computeFit(): number {
    const availH = this.scale.height - this.toolbarH();
    return Math.min(this.scale.width / STRAT_W, availH / STRAT_H) * 0.98;
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

  // 지도를 "툴바 위 영역" 중앙에 맞춘다. 전부 보이는 축은 중앙 정렬, 줌인된 축은 지도 밖으로 못 나가게 클램프.
  // 세로 중심은 툴바를 제외한 가용 영역(availH)의 중앙 → 하단 노드가 툴바에 가리지 않음.
  private clampOrCenter() {
    const cam = this.cameras.main;
    const z = cam.zoom;
    const w = this.scale.width;
    const h = this.scale.height;
    const th = this.toolbarH();
    const availH = h - th;
    const dispW = w / z; // 화면에 보이는 월드 폭
    // X: midPoint(= scrollX + w/2)를 화면 중앙에 두는 게 Phaser 기본. 전부 보이면 지도 중앙, 아니면 클램프.
    const halfW = w / 2;
    const cx = STRAT_W <= dispW ? STRAT_W / 2 : Phaser.Math.Clamp(cam.scrollX + halfW, dispW / 2, STRAT_W - dispW / 2);
    cam.scrollX = cx - halfW;
    // Y: 지도를 "툴바 위 영역(availH)"의 중앙에 오도록. Phaser는 midPoint(scrollY+h/2)를 화면중앙(h/2)에 두므로,
    // 월드중심을 화면 availH/2 에 놓으려면 scrollY = STRAT_H/2 - h/2 + th/(2z).
    if (STRAT_H <= availH / z) {
      cam.scrollY = STRAT_H / 2 - h / 2 + th / (2 * z);
    } else {
      // 줌인: 팬 허용하되 지도가 가용영역을 벗어나지 않게 클램프
      const lo = h / (2 * z) - h / 2; // worldView.y >= 0
      const hi = STRAT_H - h / 2 + h / (2 * z) - availH / z; // 화면 availH 지점 월드 <= STRAT_H
      cam.scrollY = Phaser.Math.Clamp(cam.scrollY, lo, Math.max(lo, hi));
    }
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
      // 툴바 영역에서 시작한 포인터는 지도 팬/탭으로 넘기지 않음
      this.downOnToolbar = p.y >= this.scale.height - this.toolbarH();
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      if (this.downOnToolbar) return; // 툴바 위 드래그는 지도 팬 금지
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
      const onToolbar = this.downOnToolbar;
      this.downOnToolbar = false;
      if (this.uiConsumed) {
        this.uiConsumed = false;
        return;
      }
      if (onToolbar) return; // 툴바 위 탭은 지도 탭으로 처리하지 않음(버튼은 별도 판정)
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
    this.refreshToolbar();
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

  // ---------- UI (하단 고정 툴바) ----------
  // 객체 생성만 담당. 실제 좌표/그리기는 layout()·refreshToolbar()가 수행.
  private buildUI() {
    this.toolbar = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.turnText = this.add
      .text(0, 0, '', { fontFamily: 'sans-serif', fontSize: '18px', fontStyle: 'bold', color: '#ffe066' })
      .setScrollFactor(0)
      .setDepth(101);
    this.ctxText = this.add
      .text(0, 0, '', { fontFamily: 'sans-serif', fontSize: '15px', color: '#dbe6f5', align: 'left', lineSpacing: 3 })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(101);
    this.endBtn = this.add.graphics().setScrollFactor(0).setDepth(101);
    this.endBtnText = this.add
      .text(0, 0, '턴 종료', { fontFamily: 'sans-serif', fontSize: '22px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(102);
    this.cancelBtn = this.add.graphics().setScrollFactor(0).setDepth(101);
    this.cancelBtnText = this.add
      .text(0, 0, '이동 취소', { fontFamily: 'sans-serif', fontSize: '16px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(102);

    this.popup = this.add.container(0, 0).setScrollFactor(0).setDepth(150).setVisible(false);
    this.endScreen = this.add.container(0, 0).setScrollFactor(0).setDepth(160).setVisible(false);

    // 고정 버튼 입력: 화면 좌표 직접 판정 (카메라 줌과 무관)
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.popupOpen) {
        for (const b of this.popupHits) {
          if (Math.abs(p.x - b.x) <= b.w / 2 && Math.abs(p.y - b.y) <= b.h / 2) {
            this.uiConsumed = true;
            b.cb();
            return;
          }
        }
        return;
      }
      // 이동 취소
      if (this.cancelActive && this.hitRect(p, this.cancelRect)) {
        this.uiConsumed = true;
        this.cancelReservedMoves();
        return;
      }
      // 턴 종료
      if (this.hitRect(p, this.endRect)) {
        this.uiConsumed = true;
        this.endTurnHuman();
      }
    });

    this.refreshToolbar();
  }

  private hitRect(p: Phaser.Input.Pointer, r: { x: number; y: number; w: number; h: number }): boolean {
    return Math.abs(p.x - r.x) <= r.w / 2 && Math.abs(p.y - r.y) <= r.h / 2;
  }

  // 뷰포트 기준 툴바 레이아웃 + 버튼 rect 계산. 생성/리사이즈/상태변화 공용.
  private layout() {
    this.refreshToolbar();
  }

  // 툴바 배경/버튼/텍스트를 현재 뷰포트·게임상태에 맞춰 다시 그림.
  // 세로화면: 2줄(위=상태/정보, 아래=버튼). 가로화면: 1줄(좌=상태·정보, 우=버튼).
  private refreshToolbar() {
    const w = this.scale.width;
    const h = this.scale.height;
    const th = this.toolbarH();
    const top = h - th;
    const pad = this.PAD;
    const portrait = h > w;
    const st = getState();
    const owned = st.nodes.filter((n) => n.owner === 'ally').length;
    this.cancelActive = Object.keys(st.reservedMoves).length > 0;

    // 배경 패널
    this.toolbar.clear();
    this.toolbar.fillStyle(0x0c1626, 0.96);
    this.toolbar.fillRect(0, top, w, th);
    this.toolbar.lineStyle(2, 0x3a5a86, 0.9);
    this.toolbar.lineBetween(0, top, w, top);

    const drawBtn = (g: Phaser.GameObjects.Graphics, t: Phaser.GameObjects.Text, x: number, y: number, bw: number, bh: number, fill: number, label: string) => {
      g.clear();
      g.fillStyle(fill, 1);
      g.fillRoundedRect(x - bw / 2, y - bh / 2, bw, bh, 11);
      g.lineStyle(3, 0xffffff, 0.85);
      g.strokeRoundedRect(x - bw / 2, y - bh / 2, bw, bh, 11);
      t.setText(label).setPosition(x, y).setVisible(true);
    };

    this.turnText.setText(`턴 ${st.turn}  ·  거점 ${owned}/${st.nodes.length}`);
    this.ctxText.setText(this.buildContextText());

    if (portrait) {
      // Row1: 상태(좌) + 컨텍스트(그 아래/우). Row2: 버튼.
      const row1H = th * 0.46;
      this.turnText.setFontSize(16).setPosition(pad, top + 8);
      this.ctxText.setOrigin(0, 0).setFontSize(14);
      this.ctxText.setWordWrapWidth(w - pad * 2);
      this.ctxText.setPosition(pad, top + 30);
      // Row2 버튼
      const by = top + row1H + (th - row1H) / 2;
      const bh = Math.min(46, th - row1H - 10);
      const ebw = this.cancelActive ? w * 0.42 : w * 0.6;
      const ebx = w - pad - ebw / 2;
      drawBtn(this.endBtn, this.endBtnText, ebx, by, ebw, bh, 0x2f6ad0, '턴 종료');
      this.endBtnText.setFontSize(20);
      this.endRect = { x: ebx, y: by, w: ebw, h: bh };
      if (this.cancelActive) {
        const cbw = w * 0.32;
        const cbx = pad + cbw / 2;
        drawBtn(this.cancelBtn, this.cancelBtnText, cbx, by, cbw, bh, 0x8a3d3d, '이동 취소');
        this.cancelBtnText.setFontSize(16);
        this.cancelRect = { x: cbx, y: by, w: cbw, h: bh };
      } else {
        this.cancelBtn.clear();
        this.cancelBtnText.setVisible(false);
        this.cancelRect = { x: -999, y: -999, w: 0, h: 0 };
      }
    } else {
      // 가로: 1줄. 좌=상태, 우=버튼, 가운데=컨텍스트.
      const cy = top + th / 2;
      this.turnText.setFontSize(17).setPosition(pad, top + th / 2 - 10);
      const ebw = 150;
      const ebh = th - pad * 2;
      const ebx = w - ebw / 2 - pad;
      drawBtn(this.endBtn, this.endBtnText, ebx, cy, ebw, ebh, 0x2f6ad0, '턴 종료');
      this.endBtnText.setFontSize(22);
      this.endRect = { x: ebx, y: cy, w: ebw, h: ebh };
      let ctxRight = ebx - ebw / 2 - pad;
      if (this.cancelActive) {
        const cbw = 120;
        const cbx = ebx - ebw / 2 - pad - cbw / 2;
        drawBtn(this.cancelBtn, this.cancelBtnText, cbx, cy, cbw, ebh, 0x8a3d3d, '이동 취소');
        this.cancelBtnText.setFontSize(16);
        this.cancelRect = { x: cbx, y: cy, w: cbw, h: ebh };
        ctxRight = cbx - cbw / 2 - pad;
      } else {
        this.cancelBtn.clear();
        this.cancelBtnText.setVisible(false);
        this.cancelRect = { x: -999, y: -999, w: 0, h: 0 };
      }
      const ctxLeft = pad + 220;
      this.ctxText.setOrigin(0, 0.5).setFontSize(15);
      this.ctxText.setWordWrapWidth(Math.max(60, ctxRight - ctxLeft));
      this.ctxText.setPosition(ctxLeft, cy);
    }
  }

  // 하단 툴바 중앙에 표시할 컨텍스트 문구.
  private buildContextText(): string {
    const st = getState();
    if (this.selectedSquadId != null) {
      const sq = getSquad(this.selectedSquadId);
      if (sq) {
        const lv = (Math.round(squadAvgLevel(sq) * 10) / 10).toFixed(1);
        const reserved = st.reservedMoves[sq.id];
        const target = reserved ? getNode(reserved) : null;
        const hero = squadHasHero(sq) ? ' · 영웅' : '';
        if (target) return `${sq.name} · ${sq.units.length}명 · Lv${lv}${hero}\n→ ${target.name}(으)로 이동 예약`;
        return `${sq.name} · ${sq.units.length}명 · Lv${lv}${hero}\n인접 거점을 탭해 이동`;
      }
    }
    if (this.ctxNodeId) {
      const node = getNode(this.ctxNodeId);
      if (node) {
        if (node.owner === 'ally') {
          const g = garrisonTotal(node) === 0 ? '아군 영토' : '아군 점령';
          return `${node.name} [${g}]`;
        }
        return `${node.name} [적 점유]\n수비: ${garrisonEstimate(node)}`;
      }
    }
    return '부대를 탭해 선택';
  }

  private cancelReservedMoves() {
    const st = getState();
    if (this.selectedSquadId != null) delete st.reservedMoves[this.selectedSquadId];
    else st.reservedMoves = {};
    this.redrawOverlay();
    this.refreshToolbar();
  }

  private updateTurnText() {
    this.refreshToolbar();
  }

  private hideCards() {
    this.ctxNodeId = null;
    this.refreshToolbar();
  }

  private showSquadCard(_id: number) {
    this.refreshToolbar();
  }

  private showNodeCard(node: NodeState) {
    this.ctxNodeId = node.id;
    this.refreshToolbar();
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
    this.popupHits = [];
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
    this.popupHits.push({ x: cx, y: cy, w: bw, h: bh, cb: onClick });
  }

  private checkEndState() {
    const st = getState();
    if (st.gameOver || st.victory) this.showEndScreen(st.victory);
  }

  private showEndScreen(victory: boolean) {
    const st = getState();
    this.popupOpen = true;
    this.popupHits = [];
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
    this.popupHits.push({
      x: bx,
      y: by,
      w: bw,
      h: bh,
      cb: () => {
        initGameState();
        this.scene.restart();
      }
    });
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
      // 검증용: 턴 종료 버튼 중심 (스크린 좌표)
      endBtnCenter: () => ({ x: this.endRect.x, y: this.endRect.y }),
      cancelBtnCenter: () => ({ x: this.cancelRect.x, y: this.cancelRect.y }),
      toolbarTop: () => this.scale.height - this.toolbarH(),
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

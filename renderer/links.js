// 연결선 — 쪽지 · 사진 · 파일 · 파일 묶음 · 캘린더 · 연대표 사이를 곡선으로 이음 (마인드맵처럼, 메모장.md 아이디어)
//   캘린더는 종이, 연대표는 걸이 막대의 테두리에 닿음 (boards.js boardSize). 연대표에 따라 그린 캘린더 쪽지(note-mirror)는 그림이라 잇지 않음
//   잇기: 우클릭 › '연결선 잇기' 뒤 이을 것을 누름 · Alt 를 누른 채 끌어 다른 것 위에 놓기
//         · 여럿 고르고 Ctrl+L — 처음 고른 것(가운데 주제)에 나머지를 하나씩 이음. 고른 것끼리 이어진 선이 있으면 Ctrl+L 은 끊기
//   선을 누르면 고름 → Delete 로 지우기, 선 우클릭 › 지우기. 이은 것이 없어지면 선도 그리지 않고 저장할 때 버림
//   선을 두 번 누르거나 우클릭하면 수정 메뉴 (모양 · 색 · 굵기 · 연결 위치 · 지우기 — openLinkMenu)
//   그리기: 판 바로 뒤에 둔 SVG 한 장 (#link-layer) — 판 위 · 쪽지 · 사진 · 파일 아래.
//     두 물건의 마주 보는 변 가운데를 잇는 곡선 + 양 끝 점. 접힌 파일 묶음 속 파일은 묶음에, 다른 달에 붙어 숨은 쪽지는 선도 숨김
//   모양: 곡선 · 직선 — 설정 '연결선 모양'이 기본, 선마다 우클릭으로 바꿀 수 있음 (link.style)
//   색: 선 우클릭 › '선 색 ›' — 기본(회색) + 5색 + 직접 고르기 (쪽지 스타일 창과 같은 점 · 고르개)
//   굵기: 선 우클릭 › '선 굵기 ›' — 가늘게 · 보통 · 굵게 · 아주 굵게. 설정 '연결선 굵기'가 기본 (link.width)
//   이은 자리: 보통은 마주 보는 변 가운데 (자동). 선을 고르면 양 끝에 손잡이 → 끌어 테두리 위 원하는 자리에 고정
//     (물건을 옮기거나 크기를 바꿔도 그 변의 같은 비율 자리). 손잡이 두 번 누르기 · 선 우클릭 › '연결 위치 자동으로' 로 되돌림
//     사진 · 영상 · 캘린더 · 연대표는 안쪽에도 고정 (사진 속 한 곳 · 캘린더의 한 날짜를 가리키게) — 테두리에서 조금 들어오면 안쪽 자리
//     사진처럼 선 층보다 위에 있는 물건의 안쪽에 고정한 선은 그 물건 바로 뒤의 작은 층(.link-float)에 그려 물건 위로 보이게 (linkHost)
//   this.links = [{ id, a, b, style?, color?, customColor?, anchorA?, anchorB? }] — a · b 는 물건 id (방향 없음)
//     color: LINK_COLORS 의 이름 · 'custom'(customColor 에 #RRGGBB). 없으면 기본 색
//     width: LINK_WIDTHS 의 키. 없으면 설정 '연결선 굵기'
//     anchorA · anchorB: a · b 쪽 끝을 고정한 자리 { side: 'top'|'right'|'bottom'|'left', t: 변 위 비율 0~1 }
//       · 안쪽 { side: 'inside', u, v } (네모 안 가로 · 세로 비율 0~1). 없으면 자동
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { t } from './i18n.js';
import { LINK_COLORS, LINK_COLOR_ORDER, LINK_CUSTOM_DEFAULT, LINK_WIDTHS, LINK_WIDTH_ORDER } from './constants.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ITEM_SELECTOR = '.sticky-note, .canvas-photo, .file-icon, .board';

// 고정한 끝 자리 — 변 · 변 위 비율. 둥근 모서리에 걸리지 않게 끝에서 조금 안쪽까지만
const SIDES = ['top', 'right', 'bottom', 'left'];
const NORMAL = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };   // 변에서 바깥쪽 — 곡선이 뻗어 나가는 방향
const ANCHOR_T_MIN = 0.08;
const ANCHOR_T_MAX = 0.92;
const ANCHOR_SNAP_PX = 8;          // 변 가운데에서 이만큼(화면 px) 안이면 가운데에 붙음 (안쪽 자리는 한가운데에)
const INSIDE_EDGE_PX = 10;         // 안쪽 자리를 쓸 수 있는 것: 테두리에서 이만큼(화면 px, 폭 · 높이의 1/4 까지) 들어와야 안쪽
const LINK_LAYER_Z = 2000;         // 선 층 (styles/links.css #link-layer) — 이보다 위 층인 물건의 안쪽 끝은 .link-float 에

function sidePoint(r, { side, t, u, v }) {
  if (side === 'inside') return { x: r.x + r.width * u, y: r.y + r.height * v };   // 안쪽 자리
  if (side === 'top') return { x: r.x + r.width * t, y: r.y };
  if (side === 'bottom') return { x: r.x + r.width * t, y: r.y + r.height };
  if (side === 'left') return { x: r.x, y: r.y + r.height * t };
  return { x: r.x + r.width, y: r.y + r.height * t };
}

// r 이 o(네모) 를 바라보는 변 — 자동 곡선(linkGeometry)과 같은 규칙: 옆으로 더 떨어져 있으면 좌우 변, 아니면 위아래 변
function facingSide(r, o) {
  const gapX = Math.max(o.x - (r.x + r.width), r.x - (o.x + o.width));
  const gapY = Math.max(o.y - (r.y + r.height), r.y - (o.y + o.height));
  if (gapX >= gapY) return o.x + o.width / 2 >= r.x + r.width / 2 ? 'right' : 'left';
  return o.y + o.height / 2 >= r.y + r.height / 2 ? 'bottom' : 'top';
}

// 네모 테두리에서 (x, y) 에 가장 가까운 자리 → { side, t } (변 가운데 가까이면 가운데에 붙음)
function nearestAnchor(r, x, y) {
  let best = null;
  SIDES.forEach(side => {
    const across = side === 'top' || side === 'bottom';
    const len = across ? r.width : r.height;
    let t = len ? ((across ? x - r.x : y - r.y) / len) : 0.5;
    t = Math.min(ANCHOR_T_MAX, Math.max(ANCHOR_T_MIN, t));
    if (Math.abs(t - 0.5) * len < ANCHOR_SNAP_PX) t = 0.5;
    const p = sidePoint(r, { side, t });
    const d = Math.hypot(p.x - x, p.y - y);
    if (!best || d < best.d) best = { side, t, d };
  });
  return { side: best.side, t: Math.round(best.t * 1000) / 1000 };
}

// 끈 자리(x, y) → 고정할 자리. inside: 안쪽에도 고정할 수 있는 것 — 테두리에서 조금 들어오면 { side: 'inside', u, v }
//   (판 막대처럼 얇으면 들어올 몫도 얇게 — 폭 · 높이의 1/4 까지). 한가운데 가까이면 한가운데에 붙음
function anchorAt(r, x, y, inside) {
  const ex = Math.min(INSIDE_EDGE_PX, r.width / 4);
  const ey = Math.min(INSIDE_EDGE_PX, r.height / 4);
  if (!inside || x <= r.x + ex || x >= r.x + r.width - ex || y <= r.y + ey || y >= r.y + r.height - ey) return nearestAnchor(r, x, y);
  let u = (x - r.x) / r.width;
  let v = (y - r.y) / r.height;
  if (Math.hypot((u - 0.5) * r.width, (v - 0.5) * r.height) < ANCHOR_SNAP_PX) u = v = 0.5;
  return { side: 'inside', u: Math.round(u * 1000) / 1000, v: Math.round(v * 1000) / 1000 };
}

function cleanAnchor(v) {
  const unit = (n) => typeof n === 'number' && isFinite(n);
  if (v && v.side === 'inside' && unit(v.u) && unit(v.v)) {
    return { side: 'inside', u: Math.min(1, Math.max(0, v.u)), v: Math.min(1, Math.max(0, v.v)) };
  }
  if (!v || !SIDES.includes(v.side) || typeof v.t !== 'number' || !isFinite(v.t)) return null;
  return { side: v.side, t: Math.min(ANCHOR_T_MAX, Math.max(ANCHOR_T_MIN, v.t)) };
}

// 두 네모(화면 좌표) 사이 곡선 — 가로로 더 떨어져 있으면 옆 변 가운데끼리, 아니면 위 · 아래 변 가운데끼리
function linkGeometry(a, b, zoom) {
  const acx = a.x + a.width / 2, acy = a.y + a.height / 2;
  const bcx = b.x + b.width / 2, bcy = b.y + b.height / 2;
  const gapX = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width));
  const gapY = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height));
  let ax, ay, bx, by, c1, c2;
  if (gapX >= gapY) {
    const dir = bcx >= acx ? 1 : -1;
    ax = dir > 0 ? a.x + a.width : a.x;
    ay = acy;
    bx = dir > 0 ? b.x : b.x + b.width;
    by = bcy;
    const k = Math.max(Math.abs(bx - ax) * 0.5, 24 * zoom);
    c1 = [ax + dir * k, ay];
    c2 = [bx - dir * k, by];
  } else {
    const dir = bcy >= acy ? 1 : -1;
    ax = acx;
    ay = dir > 0 ? a.y + a.height : a.y;
    bx = bcx;
    by = dir > 0 ? b.y : b.y + b.height;
    const k = Math.max(Math.abs(by - ay) * 0.5, 24 * zoom);
    c1 = [ax, ay + dir * k];
    c2 = [bx, by - dir * k];
  }
  const f = (v) => Math.round(v * 10) / 10;
  return {
    ax: f(ax), ay: f(ay), bx: f(bx), by: f(by),
    d: `M${f(ax)} ${f(ay)} C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(bx)} ${f(by)}`,
  };
}

// 직선 — 두 네모의 가운데를 잇는 선이 각 네모 테두리와 만나는 곳끼리
function edgePoint(r, toward) {
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const dx = toward.x - cx, dy = toward.y - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const k = Math.min(dx ? (r.width / 2) / Math.abs(dx) : Infinity, dy ? (r.height / 2) / Math.abs(dy) : Infinity, 1);
  return { x: cx + dx * k, y: cy + dy * k };
}

function straightGeometry(a, b) {
  const ca = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const cb = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const p = edgePoint(a, cb), q = edgePoint(b, ca);
  const f = (v) => Math.round(v * 10) / 10;
  return { ax: f(p.x), ay: f(p.y), bx: f(q.x), by: f(q.y), d: `M${f(p.x)} ${f(p.y)} L${f(q.x)} ${f(q.y)}` };
}

// 한쪽이라도 끝 자리를 고정한 선 — 고정한 끝은 그 자리, 아닌 끝은 상대 끝을 바라보는 변 가운데 (곡선) · 테두리 교점 (직선)
//   곡선은 각 끝의 변에서 바깥쪽으로 뻗어 나감. 안쪽에 고정한 끝은 상대 쪽을 바라보는 변 방향으로 뻗어 나감
function anchoredGeometry(a, b, anchorA, anchorB, style, zoom) {
  const f = (v) => Math.round(v * 10) / 10;
  const dot = (p) => ({ x: p.x, y: p.y, width: 0, height: 0 });
  const center = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  const fixedA = anchorA ? sidePoint(a, anchorA) : null;
  const fixedB = anchorB ? sidePoint(b, anchorB) : null;
  if (style === 'straight') {
    const p = fixedA || edgePoint(a, fixedB || center(b));
    const q = fixedB || edgePoint(b, fixedA || center(a));
    return { ax: f(p.x), ay: f(p.y), bx: f(q.x), by: f(q.y), d: `M${f(p.x)} ${f(p.y)} L${f(q.x)} ${f(q.y)}` };
  }
  const edge = (anchor) => anchor && anchor.side !== 'inside';
  const sideA = edge(anchorA) ? anchorA.side : facingSide(a, fixedB ? dot(fixedB) : b);
  const sideB = edge(anchorB) ? anchorB.side : facingSide(b, fixedA ? dot(fixedA) : a);
  const p = fixedA || sidePoint(a, { side: sideA, t: 0.5 });
  const q = fixedB || sidePoint(b, { side: sideB, t: 0.5 });
  const k = Math.max(Math.hypot(q.x - p.x, q.y - p.y) * 0.4, 24 * zoom);
  const c1 = [p.x + NORMAL[sideA][0] * k, p.y + NORMAL[sideA][1] * k];
  const c2 = [q.x + NORMAL[sideB][0] * k, q.y + NORMAL[sideB][1] * k];
  return {
    ax: f(p.x), ay: f(p.y), bx: f(q.x), by: f(q.y),
    d: `M${f(p.x)} ${f(p.y)} C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(q.x)} ${f(q.y)}`,
  };
}

function svg(tag, className) {
  const el = document.createElementNS(SVG_NS, tag);
  if (className) el.setAttribute('class', className);
  return el;
}

// 잇기를 끝낸 누르기에 이어 오는 click · contextmenu 를 버림 (체크 칸이 눌리거나 메뉴가 뜨지 않게)
//   waitForUp: mousedown 안에서 부르면 그 누르기를 뗄 때까지 기다렸다가, mouseup 안에서 부르면 바로 — 잠깐 뒤 풂
function swallowNext(type, { waitForUp = true } = {}) {
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  const done = () => setTimeout(() => document.removeEventListener(type, stop, true), 50);
  document.addEventListener(type, stop, true);
  if (!waitForUp) {
    done();
    return;
  }
  const release = () => {
    document.removeEventListener('mouseup', release, true);
    done();
  };
  document.addEventListener('mouseup', release, true);
}

export const linkMethods = {
  setupLinks() {
    // 선 밖을 누르면 선 고른 것 풀기
    document.addEventListener('mousedown', (e) => {
      if (this.linking || !this.selectedLinkId) return;
      if (e.target.closest && e.target.closest('.link-hit, .link-handle, #context-menu, #style-panel')) return;   // 손잡이 · 메뉴 · 선 색 창을 누르는 동안은 그대로
      this.selectLink(null);
    }, true);
    // Alt + 끌기: 잡은 것에서 선을 끌어 다른 것 위에 놓으면 이음 (Ctrl + Alt 는 맞춰 붙이며 끌기 — align.js)
    document.addEventListener('mousedown', (e) => {
      if (!e.altKey || e.ctrlKey || e.button !== 0 || this.linking) return;
      const id = this.linkableAt(e.target);
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      this.startLinking(id, { drag: true, x: e.clientX, y: e.clientY });
    }, true);
  },

  // 끝을 안쪽에도 고정할 수 있는 것 — 사진 · 영상 · 캘린더 · 연대표 (가리킬 곳이 안에 있음)
  linkInsideOk(id) {
    const entry = this.linkEntry(id);
    return !!entry && (entry.kind === 'photo' || (entry.kind === 'board' && entry.item.kind !== 'group'));
  },

  // 그 요소가 속한 물건 id — 이을 수 있는 것(쪽지 · 사진 · 파일 · 파일 묶음 · 캘린더 · 연대표)만
  linkableAt(target) {
    const el = target && target.closest ? target.closest(ITEM_SELECTOR) : null;
    if (!el || !el.id || el.classList.contains('note-mirror')) return null;   // 연대표에 따라 그린 캘린더 쪽지는 그림일 뿐
    return this.linkEntry(el.id) ? el.id : null;
  },

  // id → { kind, item } — 이을 수 있는 것. 캘린더 · 연대표도 (selection.js itemById 는 판 가운데 파일 묶음만 봄)
  linkEntry(id) {
    return this.layerEntryById(id);
  },

  // ---- 잇기 · 지우기 ----
  hasLink(a, b) {
    return this.links.some(l => (l.a === a && l.b === b) || (l.a === b && l.b === a));
  },

  addLink(a, b) {
    if (!a || !b || a === b || this.hasLink(a, b) || !this.linkEntry(a) || !this.linkEntry(b)) return null;
    this.record();
    const link = { id: this.newId('link'), a, b };
    this.links.push(link);
    this.scheduleSave();
    return link;
  },

  // 처음 고른 것(가운데 주제)에 나머지를 하나씩 이음 (Ctrl+L · 여러 개 메뉴) — 되돌리기 한 번에
  connectSelection() {
    const [hub, ...rest] = [...this.selection].filter(id => this.linkEntry(id));   // 고른 캘린더 · 연대표도
    const pairs = rest.filter(id => !this.hasLink(hub, id)).map(id => [hub, id]);
    if (!pairs.length) return false;
    this.record();
    pairs.forEach(([a, b]) => this.links.push({ id: this.newId('link'), a, b }));
    this.scheduleSave();
    return true;
  },

  // 고른 것끼리 이은 선 (양 끝이 다 고른 것)
  linksAmongSelection() {
    return this.liveLinks().filter(l => this.selection.has(l.a) && this.selection.has(l.b));
  },

  // 고른 것끼리 이은 선 끊기 (Ctrl+L — 이어져 있을 때 · 여러 개 메뉴) — 되돌리기 한 번에. 반환: 끊은 수
  disconnectSelection() {
    const gone = new Set(this.linksAmongSelection().map(l => l.id));
    if (!gone.size) return 0;
    this.record();
    this.links = this.links.filter(l => !gone.has(l.id));
    if (gone.has(this.selectedLinkId)) this.selectedLinkId = null;
    this.requestLinks();
    this.scheduleSave();
    return gone.size;
  },

  deleteLink(id) {
    if (!this.links.some(l => l.id === id)) return false;
    this.record();
    this.links = this.links.filter(l => l.id !== id);
    if (this.selectedLinkId === id) this.selectedLinkId = null;
    this.scheduleSave();
    return true;
  },

  // 두 끝이 다 있는 선 (이은 것을 지우면 선은 남아 있다가 그리지 않고 저장할 때 버림)
  liveLinks() {
    return this.links.filter(l => this.findItem(l.a) && this.findItem(l.b));
  },

  linksOf(id) {
    return this.liveLinks().filter(l => l.a === id || l.b === id);
  },

  // 그 물건에 이은 선 모두 지우기
  deleteLinksOf(id) {
    const gone = new Set(this.linksOf(id).map(l => l.id));
    if (!gone.size) return false;
    this.record();
    this.links = this.links.filter(l => !gone.has(l.id));
    if (gone.has(this.selectedLinkId)) this.selectedLinkId = null;
    this.scheduleSave();
    return true;
  },

  // 우클릭 메뉴 줄 (쪽지 · 사진 · 파일 · 파일 묶음 · 캘린더 · 연대표 메뉴에 들어감)
  linkMenuItems(id) {
    const items = [{ icon: 'menu-connect.svg', label: t('menu.connect'), action: () => this.startLinking(id) }];
    const n = this.linksOf(id).length;
    if (n) items.push({ icon: 'menu-disconnect.svg', label: t('menu.disconnect', { n }), action: () => this.deleteLinksOf(id) });
    return items;
  },

  // 불러오기 · 되돌리기 — 모양이 맞는 선만, 같은 두 물건 사이는 하나만
  normalizeLinks(list) {
    const seen = new Set();
    return (Array.isArray(list) ? list : []).filter(l => {
      if (!l || typeof l.a !== 'string' || typeof l.b !== 'string' || l.a === l.b) return false;
      const key = [l.a, l.b].sort().join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(l => {
      const link = { id: typeof l.id === 'string' ? l.id : this.newId('link'), a: l.a, b: l.b };
      if (l.style === 'curve' || l.style === 'straight') link.style = l.style;
      if (LINK_WIDTHS[l.width]) link.width = l.width;
      if (l.color === 'custom' && /^#[0-9a-f]{6}$/i.test(String(l.customColor))) {
        link.color = 'custom';
        link.customColor = l.customColor.toUpperCase();
      } else if (LINK_COLORS[l.color]) {
        link.color = l.color;                               // 기본(gray)은 적지 않음
      }
      const anchorA = cleanAnchor(l.anchorA);
      const anchorB = cleanAnchor(l.anchorB);
      if (anchorA) link.anchorA = anchorA;
      if (anchorB) link.anchorB = anchorB;
      return link;
    });
  },

  // 선 모양 — 선마다 정한 것, 없으면 설정 '연결선 모양'
  linkStyleOf(link) {
    return (link && link.style) || (this.settings && this.settings.linkStyle) || 'curve';
  },

  setLinkStyle(id, style) {
    const link = this.links.find(l => l.id === id);
    if (!link || this.linkStyleOf(link) === style) return;
    this.record();
    link.style = style;
    this.scheduleSave();
  },

  // 선 굵기 — 선마다 정한 것, 없으면 설정 '연결선 굵기' (키 · 월드 px)
  linkWidthOf(link) {
    const own = link && link.width;
    if (LINK_WIDTHS[own]) return own;
    const s = this.settings && this.settings.linkWidth;
    return LINK_WIDTHS[s] ? s : 'normal';
  },

  linkWidthPx(link) {
    return LINK_WIDTHS[this.linkWidthOf(link)];
  },

  setLinkWidth(id, key) {
    const link = this.links.find(l => l.id === id);
    if (!link || !LINK_WIDTHS[key] || link.width === key) return;
    this.record();
    link.width = key;
    this.requestLinks();
    this.scheduleSave();
  },

  // 선 굵기를 그 선의 SVG 묶음에 (선 · 누르는 자리 굵기 · 끝 점 크기) — 바뀔 때만
  //   w: 월드 px. 보통(2)일 때 예전 값과 같음: 선 max(1, 2z) · 누르는 자리 max(10, 14z) · 끝 점 max(2.5, 4z)
  applyLinkWidth(parts, w) {
    const z = this.zoom;
    const key = `${w}@${z}`;
    if (parts.widthKey === key) return;
    parts.widthKey = key;
    parts.el.style.setProperty('--link-w', `${Math.max(1, w * z)}px`);
    parts.el.style.setProperty('--link-hit-w', `${Math.max(10, (w + 12) * z)}px`);
    parts.dotR = Math.max(2.5, (2 + w) * z);
  },

  // 선 색 — 이름('gray' 는 기본) · 실제 색 (#RRGGBB, 기본이면 null — CSS 가 배경에 맞춰 정함)
  linkColorKey(link) {
    return (link && link.color) || 'gray';
  },

  linkColorValue(link) {
    if (!link || !link.color) return null;
    return link.color === 'custom' ? link.customColor : LINK_COLORS[link.color] || null;
  },

  // key: LINK_COLORS 이름 · 'custom' (hex 와 함께). record: false 면 되돌리기 기록 없이 (직접 고르는 동안 — recordHistory 로 한 번)
  setLinkColor(id, key, hex = '', { record = true } = {}) {
    const link = this.links.find(l => l.id === id);
    if (!link) return;
    const custom = key === 'custom' ? String(hex).toUpperCase() : '';
    if (this.linkColorKey(link) === key && (link.customColor || '') === custom) return;
    if (record) this.record();
    if (key === 'gray' || (key !== 'custom' && !LINK_COLORS[key])) delete link.color;
    else link.color = key;
    if (custom) link.customColor = custom;
    else delete link.customColor;
    this.requestLinks();
    this.scheduleSave();
  },

  // 선 우클릭 › '선 색 ›' 옆에 열리는 작은 창 — 쪽지 스타일 창과 같은 틀 (#style-panel) · 같은 점
  openLinkColorPanel(menu, anchor, id) {
    if (this.stylePanel && this.stylePanel.dataset.link === id) return;
    this.closeStylePanel();
    this.closeContextSubmenu();
    const panel = document.createElement('div');
    panel.id = 'style-panel';                 // 바깥 누르면 닫히기는 스타일 창과 같게
    panel.className = 'link-color-panel';
    panel.dataset.link = id;
    document.body.appendChild(panel);
    this.stylePanel = panel;
    this.framePanelAt = { menu, anchor };     // 자리 잡기는 사진 틀 창과 같이 (photo-frame.js placeFramePanel)
    this.renderLinkColorPanel(id);
    anchor.classList.add('open');
  },

  renderLinkColorPanel(id) {
    const panel = this.stylePanel;
    const link = this.links.find(l => l.id === id);
    if (!panel || !link) return;
    panel.innerHTML = '';
    const section = document.createElement('div');
    section.className = 'style-section';
    const title = document.createElement('div');
    title.className = 'style-title';
    title.textContent = t('link.color');
    const dots = document.createElement('div');
    dots.className = 'style-colors';
    const current = this.linkColorKey(link);
    LINK_COLOR_ORDER.forEach(key => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = `style-dot link-dot-${key}` + (current === key ? ' current' : '');
      if (LINK_COLORS[key]) dot.style.background = LINK_COLORS[key];
      dot.title = key === 'gray' ? t('link.colorDefault') : t(`color_${key}`);
      dot.addEventListener('click', () => {
        this.setLinkColor(id, key);
        this.renderLinkColorPanel(id);
      });
      dots.appendChild(dot);
    });
    dots.appendChild(this.createCustomColorDot({
      className: 'style-dot',
      current: current === 'custom',
      value: link.customColor || LINK_CUSTOM_DEFAULT,
      onStart: () => this.recordHistory(),
      onInput: (hex) => this.setLinkColor(id, 'custom', hex, { record: false }),
      onDone: () => { this.dropHistoryIfUnchanged(); this.renderLinkColorPanel(id); },
    }));
    section.append(title, dots);
    panel.appendChild(section);
    this.placeFramePanel();
  },

  // link: 끝 자리를 고정했으면 그 자리로 (잇는 중인 선은 null)
  linkShape(a, b, style, link = null) {
    if (link && (link.anchorA || link.anchorB)) return anchoredGeometry(a, b, link.anchorA, link.anchorB, style, this.zoom);
    return style === 'straight' ? straightGeometry(a, b) : linkGeometry(a, b, this.zoom);
  },

  // ---- 이은 자리 옮기기 · 고정 ----
  // 고른 선의 끝 손잡이를 누름 — 끌면 그 물건 테두리 위 가장 가까운 자리로 (end: 'a' · 'b')
  //   사진 · 영상 · 캘린더 · 연대표는 테두리에서 안으로 들어오면 그 안쪽 자리로 (anchorAt)
  startAnchorDrag(e, end) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const link = this.links.find(l => l.id === this.selectedLinkId);
    if (!link) return;
    const key = end === 'a' ? 'anchorA' : 'anchorB';
    const itemId = link[end];
    const inside = this.linkInsideOk(itemId);
    let recorded = false;
    document.body.classList.add('link-anchoring');
    const move = (ev) => {
      const r = this.linkRect(itemId);
      if (!r) return;
      if (!recorded) {
        this.record();                                    // 되돌리기 한 번에 옮기기 전 자리로
        recorded = true;
      }
      link[key] = anchorAt(r, ev.clientX, ev.clientY, inside);
      this.requestLinks();
    };
    const up = () => {
      document.removeEventListener('mousemove', move, true);
      document.removeEventListener('mouseup', up, true);
      document.body.classList.remove('link-anchoring');
      if (recorded) this.scheduleSave();
    };
    document.addEventListener('mousemove', move, true);
    document.addEventListener('mouseup', up, true);
  },

  // 끝 자리 고정 풀기 — end: 'a' · 'b' · 없으면 양쪽 (다시 마주 보는 변 가운데로)
  resetLinkAnchors(id, end = null) {
    const link = this.links.find(l => l.id === id);
    const keys = end ? [end === 'a' ? 'anchorA' : 'anchorB'] : ['anchorA', 'anchorB'];
    if (!link || !keys.some(k => link[k])) return;
    this.record();
    keys.forEach(k => delete link[k]);
    this.requestLinks();
    this.scheduleSave();
  },

  // 손잡이 층 — 쪽지 · 사진 · 파일 위 (선 층은 그 아래라 손잡이 반이 물건에 가려져서 따로 둠)
  linkHandleLayer() {
    let layer = document.getElementById('link-handle-layer');
    if (layer && layer.parentNode === this.uiLayer) return layer;
    if (layer) layer.remove();
    layer = svg('svg');
    layer.id = 'link-handle-layer';
    this.uiLayer.appendChild(layer);
    return layer;
  },

  // 고른 선 양 끝에 손잡이 (잇는 중 · 고른 선 없으면 치움)
  drawLinkHandles(link, geo) {
    const layer = this.linkHandleLayer();
    if (!link || !geo) {
      layer.replaceChildren();
      layer.handleFor = null;
      return;
    }
    if (layer.handleFor !== link.id || layer.childElementCount !== 2) {
      layer.replaceChildren();
      layer.handleFor = link.id;
      ['a', 'b'].forEach(end => {
        const h = svg('circle', 'link-handle');
        h.dataset.end = end;
        h.addEventListener('mousedown', (e) => this.startAnchorDrag(e, end));
        h.addEventListener('dblclick', (e) => {             // 두 번 누르기: 이 끝만 자동으로
          e.preventDefault();
          e.stopPropagation();
          this.resetLinkAnchors(link.id, end);
        });
        h.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });
        layer.appendChild(h);
      });
    }
    const r = Math.max(4.5, (4 + this.linkWidthPx(link)) * this.zoom);   // 굵은 선은 손잡이도 크게 (보통: 6z)
    [...layer.children].forEach(h => {
      const end = h.dataset.end;
      h.setAttribute('cx', end === 'a' ? geo.ax : geo.bx);
      h.setAttribute('cy', end === 'a' ? geo.ay : geo.by);
      h.setAttribute('r', r);
      h.classList.toggle('fixed', !!link[end === 'a' ? 'anchorA' : 'anchorB']);   // 고정한 끝은 채운 점
    });
  },

  // ---- 고르기 ----
  selectLink(id) {
    if (this.selectedLinkId === id) return;
    this.selectedLinkId = id;
    if (id) this.clearSelection();
    this.requestLinks();
  },

  // ---- 잇는 중 ----
  // 이을 것을 누르면 (drag: 끌어 놓으면) 이음. Esc · 빈 곳 누르기 · 우클릭: 그만두기
  startLinking(fromId, { drag = false, x, y } = {}) {
    this.cancelLinking();
    this.closeMenus();
    const at = x === undefined ? (this.lastMouse || { x: 0, y: 0 }) : { x, y };
    const linking = { from: fromId, x: at.x, y: at.y, target: null };
    this.linking = linking;
    document.body.classList.add('linking');
    if (!drag) this.showToast(t('link.hint'));

    const move = (e) => {
      linking.x = e.clientX;
      linking.y = e.clientY;
      this.setLinkTarget(this.linkTargetAt(e));
      this.requestLinks();
    };
    const finish = (e) => {
      const target = this.linkTargetAt(e);
      this.endLinking();
      if (target) this.addLink(fromId, target);
    };
    const down = (e) => {                     // 누르기로 잇기: 다음 누르기에서 끝 (그 누르기는 물건에 가지 않게)
      e.preventDefault();
      e.stopPropagation();
      if (e.button === 0) {
        swallowNext('click');
        finish(e);
      } else {
        swallowNext('contextmenu');
        this.cancelLinking();
      }
    };
    const up = (e) => {                       // Alt + 끌기: 놓으면 끝
      if (e.button !== 0) return;
      swallowNext('click', { waitForUp: false });
      finish(e);
    };
    document.addEventListener('mousemove', move, true);
    if (drag) document.addEventListener('mouseup', up, true);
    else document.addEventListener('mousedown', down, true);
    linking.cleanup = () => {
      document.removeEventListener('mousemove', move, true);
      document.removeEventListener('mouseup', up, true);
      document.removeEventListener('mousedown', down, true);
    };
    this.requestLinks();
  },

  // 마우스 아래에 이을 수 있는 것 (처음 것 말고)
  linkTargetAt(e) {
    const id = this.linkableAt(document.elementFromPoint(e.clientX, e.clientY));
    return id && this.linking && id !== this.linking.from ? id : null;
  },

  setLinkTarget(id) {
    const linking = this.linking;
    if (!linking || linking.target === id) return;
    if (linking.target) document.getElementById(linking.target)?.classList.remove('link-target');
    linking.target = id;
    if (id) document.getElementById(id)?.classList.add('link-target');
  },

  endLinking() {
    const linking = this.linking;
    if (!linking) return;
    this.linking = null;
    linking.cleanup();
    if (linking.target) document.getElementById(linking.target)?.classList.remove('link-target');
    document.body.classList.remove('linking');
    const toast = document.querySelector('.toast.show');          // '이을 것을 누르세요' 안내도 함께 내림
    if (toast && toast.textContent === t('link.hint')) toast.classList.remove('show');
    this.requestLinks();
  },

  // 반환: 잇는 중이었는지 (Esc 가 씀)
  cancelLinking() {
    if (!this.linking) return false;
    this.endLinking();
    return true;
  },

  // ---- 그리기 ----
  // 물건이 움직이거나 바뀌면 부름 — 한 화면에 한 번만 다시 그림
  requestLinks() {
    if (this.linkFrame) return;
    this.linkFrame = requestAnimationFrame(() => {
      this.linkFrame = null;
      this.drawLinks();
    });
  },

  // 선을 그리는 SVG — 판 바로 뒤 (판 위 · 쪽지 · 사진 · 파일 아래). renderAll 이 지우면 다시 만듦
  linkLayer() {
    let layer = document.getElementById('link-layer');
    if (layer && layer.parentNode === this.uiLayer) return layer;
    if (layer) layer.remove();
    layer = svg('svg');
    layer.id = 'link-layer';
    layer.linkEls = new Map();
    layer.floatEls = new Map();                            // 선 id → 물건 바로 뒤의 작은 층 (linkHost)
    const boards = this.uiLayer.querySelectorAll(':scope > .board');
    if (boards.length) boards[boards.length - 1].after(layer);
    else this.uiLayer.prepend(layer);
    return layer;
  },

  // 선이 닿는 네모 (화면 좌표) — 없거나 숨었으면 null
  linkRect(id) {
    const entry = this.linkEntry(id);
    if (!entry) return null;
    const { kind, item } = entry;
    let r;
    if (kind === 'file') {
      const slot = this.fileSlot(item);
      r = slot && slot.hidden ? this.itemRect('board', slot.group) : this.itemRect('file', item);   // 접힌 묶음 속 → 묶음에
    } else if (kind === 'note') {
      if (this.noteBoardState(item).hidden) return null;                                         // 다른 달 · 겹쳐 가려진 쪽지
      r = this.itemRect('note', item);
    } else {
      r = this.itemRect(kind, item);
    }
    const z = this.zoom;
    return { x: r.x * z + this.panX, y: r.y * z + this.panY, width: r.width * z, height: r.height * z };
  },

  // 선을 그릴 SVG — 보통은 선 층. 끝을 물건 안쪽에 고정했고 그 물건이 선 층보다 위 층이면 (사진 · 영상 · 고른 판)
  //   그 물건 바로 뒤에 둔 작은 층(.link-float, 같은 층 번호)에 → 물건 위로 그려져 가리킨 곳이 보이고, 그 물건보다 앞의 것에는 가려짐
  //   양 끝이 다 그렇다면 더 위에 있는 물건 쪽에
  linkHost(link, layer) {
    let top = null;
    let z = LINK_LAYER_Z;
    ['a', 'b'].forEach(end => {
      const anchor = link[end === 'a' ? 'anchorA' : 'anchorB'];
      if (!anchor || anchor.side !== 'inside') return;
      const el = document.getElementById(link[end]);
      const layerZ = el ? parseInt(getComputedStyle(el).zIndex, 10) : NaN;
      if (layerZ > z) {
        z = layerZ;
        top = el;
      }
    });
    let float = layer.floatEls.get(link.id);
    if (!top) {
      if (float) float.remove();
      layer.floatEls.delete(link.id);
      return layer;
    }
    if (!float) {
      float = svg('svg', 'link-float');
      layer.floatEls.set(link.id, float);
    }
    if (top.nextSibling !== float) top.after(float);
    float.style.zIndex = String(z);
    ['--link-w', '--link-hit-w', '--link-ring-w', '--link-shadow-y', '--link-shadow-blur'].forEach(k => float.style.setProperty(k, layer.style.getPropertyValue(k)));
    return float;
  },

  createLinkElement(link) {
    const el = svg('g', 'link');
    const line = svg('path', 'link-line');
    const dotA = svg('circle', 'link-dot');
    const dotB = svg('circle', 'link-dot');
    const hit = svg('path', 'link-hit');                   // 누르기 쉽게 굵고 투명한 선
    el.append(line, dotA, dotB, hit);
    hit.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || this.linking) return;
      e.stopPropagation();
      this.selectLink(link.id);
    });
    const openMenu = (e) => {                              // 우클릭 · 두 번 누르기 — 같은 수정 메뉴
      e.preventDefault();
      e.stopPropagation();
      this.selectLink(link.id);
      this.openLinkMenu(link.id, e.clientX, e.clientY);
    };
    hit.addEventListener('contextmenu', openMenu);
    hit.addEventListener('dblclick', openMenu);
    return { el, line, dotA, dotB, hit };
  },

  // 선 수정 메뉴 — 곡선 · 직선 / 선 색 › / 선 굵기 › / (고정했으면) 연결 위치 자동으로 / 지우기
  openLinkMenu(id, x, y) {
    const link = this.links.find(l => l.id === id);
    if (!link) return;
    const straight = this.linkStyleOf(link) === 'straight';
    const now = this.linkWidthOf(link);
    this.openContextMenu([
      straight
        ? { icon: 'menu-connect.svg', label: t('menu.linkCurve'), action: () => this.setLinkStyle(link.id, 'curve') }
        : { icon: 'menu-straight.svg', label: t('menu.linkStraight'), action: () => this.setLinkStyle(link.id, 'straight') },
      { icon: 'palette.svg', label: t('menu.linkColor'), arrow: true, panel: (menu, row) => this.openLinkColorPanel(menu, row, link.id) },
      {                                                    // 선 굵기 › 가늘게 · 보통 · 굵게 · 아주 굵게
        icon: 'menu-line-width.svg', label: t('menu.linkWidth'), arrow: true,
        submenu: LINK_WIDTH_ORDER.map(key => ({ label: t(`linkWidth.${key}`), current: now === key, action: () => this.setLinkWidth(link.id, key) })),
      },
      ...(link.anchorA || link.anchorB
        ? [{ icon: 'style-reset.svg', label: t('menu.linkAutoAnchor'), action: () => this.resetLinkAnchors(link.id) }]
        : []),
      { separator: true },
      { icon: 'trash.svg', label: t('menu.deleteLink'), danger: true, action: () => this.deleteLink(link.id) },
    ], x, y);
  },

  drawLinks() {
    if (this.previewing) return;                   // 확대 · 축소 미리 보기 중 — 선 층도 함께 늘어나 있음, 멈추면 다시 그림 (view.js)
    const layer = this.linkLayer();
    const z = this.zoom;
    layer.style.setProperty('--link-w', `${Math.max(1, 2 * z)}px`);
    layer.style.setProperty('--link-hit-w', `${Math.max(10, 14 * z)}px`);
    layer.style.setProperty('--link-ring-w', `${Math.max(1, 1.5 * z)}px`);
    layer.style.setProperty('--link-shadow-y', `${Math.max(1.5, 3 * z)}px`);     // 고른 선의 그림자 (styles/links.css)
    layer.style.setProperty('--link-shadow-blur', `${Math.max(2, 4 * z)}px`);
    const r = Math.max(2.5, 4 * z);
    const els = layer.linkEls;
    const seen = new Set();
    const place = (parts, geo, radius = r) => {
      parts.line.setAttribute('d', geo.d);
      if (parts.hit) parts.hit.setAttribute('d', geo.d);
      parts.dotA.setAttribute('cx', geo.ax);
      parts.dotA.setAttribute('cy', geo.ay);
      parts.dotB.setAttribute('cx', geo.bx);
      parts.dotB.setAttribute('cy', geo.by);
      parts.dotA.setAttribute('r', radius);
      parts.dotB.setAttribute('r', radius);
    };

    this.links.forEach(link => {
      const ra = this.linkRect(link.a);
      const rb = ra && this.linkRect(link.b);
      if (!ra || !rb) return;
      let parts = els.get(link.id);
      if (!parts) {
        parts = this.createLinkElement(link);
        els.set(link.id, parts);
      }
      const host = this.linkHost(link, layer);            // 보통은 선 층, 사진 · 고른 판 안쪽에 고정한 선은 그 물건 위 (linkHost)
      if (parts.el.parentNode !== host) host.appendChild(parts.el);
      seen.add(link.id);
      parts.geo = this.linkShape(ra, rb, this.linkStyleOf(link), link);
      this.applyLinkWidth(parts, this.linkWidthPx(link));  // 선마다 굵기 (보통이면 예전과 같음)
      place(parts, parts.geo, parts.dotR);
      const color = this.linkColorValue(link);
      if (color !== parts.color) {                         // 색을 정한 선: --link-color (styles/links.css .link.colored)
        parts.color = color;
        parts.el.classList.toggle('colored', !!color);
        if (color) parts.el.style.setProperty('--link-color', color);
        else parts.el.style.removeProperty('--link-color');
      }
      parts.el.classList.toggle('selected', this.selectedLinkId === link.id);   // 고르면 진하게 (styles/links.css) — 이은 것을 골라도 선은 그대로
    });
    els.forEach((parts, id) => {
      if (seen.has(id)) return;
      parts.el.remove();
      els.delete(id);
    });
    layer.floatEls.forEach((float, id) => {               // 안 그린 선 · 선 층으로 돌아간 선의 작은 층은 치움
      if (seen.has(id) && float.firstChild) return;
      float.remove();
      layer.floatEls.delete(id);
    });
    const chosen = !this.linking && this.selectedLinkId && this.links.find(l => l.id === this.selectedLinkId);
    this.drawLinkHandles(chosen && els.has(chosen.id) ? chosen : null, chosen && els.get(chosen.id) ? els.get(chosen.id).geo : null);

    // 잇는 중인 선 — 처음 것에서 마우스까지 (이을 것 위에 있으면 그 변에 붙음)
    let temp = layer.tempLink;
    if (!this.linking) {
      if (temp) temp.el.remove();
      layer.tempLink = null;
      return;
    }
    const from = this.linkRect(this.linking.from);
    if (!from) return;
    if (!temp) {
      temp = { el: svg('g', 'link link-temp'), line: svg('path', 'link-line'), dotA: svg('circle', 'link-dot'), dotB: svg('circle', 'link-dot') };
      temp.el.append(temp.line, temp.dotA, temp.dotB);
      layer.tempLink = temp;
    }
    layer.appendChild(temp.el);
    const target = this.linking.target && this.linkRect(this.linking.target);
    this.applyLinkWidth(temp, this.linkWidthPx(null));    // 새 선은 설정 '연결선 굵기'
    place(temp, this.linkShape(from, target || { x: this.linking.x, y: this.linking.y, width: 0, height: 0 }, this.linkStyleOf(null)), temp.dotR);
  },
};

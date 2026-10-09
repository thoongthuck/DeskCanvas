// 연대표 — 벽에 박은 걸이 막대만 (판 상자 없음. code/icons/아이콘_가이드.md 12-4, 시안_연대표판.png)
//   판의 자리(board.x · y) = 막대 왼쪽 위, board.width = 막대 길이
//   가로 막대 (기본): 시간이 왼쪽 → 오른쪽. 쪽지를 막대 위에 얹거나(note.side 'up' — 아래가 막대에 6 물림, 걸이 · 줄 없음) 아래에 검(걸이 + 줄)
//   세로 막대 (board.dir 'v' — 판 메뉴 '방향 ›'): 시간이 위 → 아래. 쪽지를 막대 왼쪽(note.side 'up') · 오른쪽에 짧은 가로 선으로 이음.
//     눈금 글씨는 막대 폭(26)에 안 들어가서 막대 왼쪽 바깥에 꼬리표로 (시안에 없는 모양 — 사용자와 정함)
//   시간 축 두 가지 (판 메뉴 '시간 축 ›') — 두 모드는 자료를 따로 가짐
//     캘린더:   진짜 날짜 · 눈금(연 112 · 월 210 · 일 64) · 오늘 · 주말/빨간 날 띠. 쪽지는 note.date
//               눈금 단위는 설정 › 판 › 연대표 눈금 단위 — 모든 연대표에 함께 (막대 위 조작 줄은 없앰 — 사용자 요청)
//     직접 작성: 내가 만든 칸(이름 · 폭). 쪽지는 note.segmentId + note.ratio(칸 안 0~1)
//   쪽지를 끌어서 막대에서 띄울 수 있음 (note.off — 놓은 높이 그대로. 아래는 줄이 길어지고, 위는 가는 받침 선으로 이음 — 사용자 요청)
//   옆 쪽지와 겹칠 때만 바깥으로 밀림 — 가로: 아래는 줄이 길어져 내려가고 위는 아래 쪽지에 6 겹쳐 기댐 / 세로: 바깥 줄로
//   캘린더 연동: 그 캘린더에 붙은 쪽지도 막대에 함께 걸림 — 같은 쪽지를 연대표에 따라 그린 것 (note-mirror)
//   막대를 잡고 끌면 막대가 옮겨지고(붙은 쪽지도 함께), 막대 위에서 휠을 돌리면 보이는 때가 옮겨감
//   보고 있는 때는 저장하지 않음 (켜면 오늘이 앞에서 1/4쯤)
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { ICON_DIR } from './constants.js';
import { t, getLanguage } from './i18n.js';
import { isHexColor, isDarkColor, customFoldImage } from './color.js';
import { dateKey, parseKey } from './calendar.js';

const TL_WIDTH = 1260;                               // 막대 길이
const MIN_WIDTH = 480;
const RAIL_H = 26;                                   // 걸이 막대 높이 (아래 자리 값은 모두 막대 왼쪽 위 기준)
const TOP_ROW = 26;                                  // 맨 위 줄 — '오늘' · 빨간 날 이름
const PERCH = 6;                                     // 얹은 쪽지가 막대에 물리는 만큼 · 위층 쪽지가 아래 쪽지에 겹치는 만큼
const HOOK = { width: 14, height: 18, top: 18 };     // rail-hook.svg — 막대 위에서 18
const STRING_TOP = 29;                               // 걸이 굽은 곳 — 줄이 여기서 내려감
const FIRST_TIER = 56;                               // 건 쪽지 1층 위
const TIER_GAP = 20;                                 // 아래층 사이
const BOTTOM_PAD = 10;
const NOTE_GAP = 12;                                 // 같은 층 쪽지 사이 최소 간격
const REACH = 420;                                   // 끌어다 놓을 수 있는 거리 — 쪽지 가운데가 막대에서 이만큼 안이면 붙음 (더 멀면 떨어짐)
const OFF_SNAP = 16;                                 // 기본 자리에서 이만큼 안이면 기본 자리로 (막대에 딱 얹기 · 걸기)
const OLD_BOX = { left: 14, top: 87 };               // 예전 판 상자 안에서 막대가 있던 자리 (불러올 때 옮겨 적음)
// 세로 막대 — 쪽지는 막대 옆에 가로 선으로 이음. 왼쪽은 눈금 꼬리표 자리를 지나서 놓임
const V = {
  gap: 30,                                           // 막대(왼쪽은 꼬리표 자리)에서 쪽지까지 — 이음 선
  col: 20,                                           // 바깥 줄 사이
  label: { calendar: 82, direct: 110 },              // 꼬리표 자리 (막대와의 틈 4 포함) — 캘린더: '2026년 10월' / 직접 작성: 칸 이름
  pad: 10,
};
const UNIT = { year: 112, month: 210, day: 64 };     // 눈금 한 칸
const MIN_SEG = 40;
const NEW_SEG_WIDTH = 180;
const EPOCH = 2000;                                  // 축 위치 0 = 2000년 1월 1일

const pad2 = (n) => String(n).padStart(2, '0');
const dayIndex = (d) => Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(EPOCH, 0, 1)) / 86400000);
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const daysInYear = (y) => (new Date(y, 1, 29).getMonth() === 1 ? 366 : 365);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 날짜 → 축 위치 (그날이 시작하는 곳). 월 눈금은 달마다 같은 폭, 연 눈금은 해마다 같은 폭
function axisX(date, scale) {
  const y = date.getFullYear();
  const m = date.getMonth();
  if (scale === 'day') return dayIndex(date) * UNIT.day;
  if (scale === 'year') return (y - EPOCH) * UNIT.year + ((dayIndex(date) - dayIndex(new Date(y, 0, 1))) / daysInYear(y)) * UNIT.year;
  return ((y - EPOCH) * 12 + m) * UNIT.month + ((date.getDate() - 1) / daysInMonth(y, m)) * UNIT.month;
}

function dayWidth(date, scale) {
  if (scale === 'day') return UNIT.day;
  if (scale === 'year') return UNIT.year / daysInYear(date.getFullYear());
  return UNIT.month / daysInMonth(date.getFullYear(), date.getMonth());
}

// 축 위치 → 그 자리의 날짜
function dateAt(x, scale) {
  if (scale === 'day') return new Date(EPOCH, 0, 1 + Math.floor(x / UNIT.day));
  if (scale === 'year') {
    const yi = Math.floor(x / UNIT.year);
    const y = EPOCH + yi;
    const n = daysInYear(y);
    return new Date(y, 0, 1 + clamp(Math.floor(((x - yi * UNIT.year) / UNIT.year) * n), 0, n - 1));
  }
  const mi = Math.floor(x / UNIT.month);
  const y = EPOCH + Math.floor(mi / 12);
  const m = ((mi % 12) + 12) % 12;
  const n = daysInMonth(y, m);
  return new Date(y, m, 1 + clamp(Math.floor(((x - mi * UNIT.month) / UNIT.month) * n), 0, n - 1));
}

// 처음 보여 줄 때 — 오늘이 왼쪽 1/4쯤 오도록 조금 앞에서 시작
function defaultStart(scale) {
  const now = new Date();
  if (scale === 'year') return new Date(now.getFullYear() - 1, 0, 1);
  if (scale === 'day') return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3);
  return new Date(now.getFullYear(), now.getMonth() - 1, 1);
}

// 막대 방향으로 놓기 — 가로 막대는 left · width, 세로 막대는 top · height (zoom 1 기준 값)
function along(el, vert, start, size) {
  el.style[vert ? 'top' : 'left'] = `calc(${start}px * var(--z))`;
  if (size !== undefined) el.style[vert ? 'height' : 'width'] = `calc(${size}px * var(--z))`;
}

// 판 안 자리 (zoom 1 기준 값 → 화면 배율은 CSS 가 곱함)
function place(el, x, y, w, h) {
  el.style.left = `calc(${x}px * var(--z))`;
  el.style.top = `calc(${y}px * var(--z))`;
  if (w !== undefined) el.style.width = `calc(${w}px * var(--z))`;
  if (h !== undefined) el.style.height = `calc(${h}px * var(--z))`;
}

function div(className, text) {
  const el = document.createElement('div');
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export const timelineMethods = {
  newTimelineData() {
    return { v: 2, width: TL_WIDTH, mode: 'calendar', linkedBoardId: '', segments: this.defaultSegments() };
  },

  // 직접 작성 모드의 처음 칸 — 막대를 네 칸으로
  defaultSegments() {
    const width = TL_WIDTH / 4;
    return [1, 2, 3, 4].map(n => ({ id: this.newId('seg'), name: t('tl.segmentN', { n }), width }));
  },

  normalizeTimeline(board) {
    if (board.v !== 2) {                                  // 예전 판 상자 → 막대만: 자리 · 길이를 막대 기준으로 옮겨 적음
      board.x += OLD_BOX.left;
      board.y += OLD_BOX.top;
      if (typeof board.width === 'number') board.width -= OLD_BOX.left * 2;
      board.v = 2;
    }
    if (typeof board.width !== 'number' || board.width < MIN_WIDTH) board.width = TL_WIDTH;
    if (board.mode !== 'direct') board.mode = 'calendar';
    if (board.dir !== 'v') delete board.dir;              // 방향 — 'v' 세로 (없으면 가로)
    delete board.scale;                                   // 예전: 판마다 눈금 단위 — 이제 설정 › 판 (모든 연대표에 함께)
    if (typeof board.linkedBoardId !== 'string') board.linkedBoardId = '';
    const segments = (Array.isArray(board.segments) ? board.segments : [])
      .filter(s => s && typeof s.id === 'string' && s.id)
      .map(s => ({ id: s.id, name: typeof s.name === 'string' ? s.name : '', width: Math.max(MIN_SEG, Number(s.width) || NEW_SEG_WIDTH) }));
    board.segments = segments.length ? segments : this.defaultSegments();
    delete board.height;                                  // 높이는 막대 높이 (붙은 쪽지는 판 자리 밖)
    return board;
  },

  timelineMinSize() {
    return { width: MIN_WIDTH, height: RAIL_H };
  },

  // 막대 길이 (세로 막대도 board.width 에)
  railWidth(board) {
    return board.width;
  },

  timelineVertical(board) {
    return board.dir === 'v';
  },

  // 판의 자리 = 걸이 막대 (boards.js boardSize)
  timelineSize(board) {
    return board.dir === 'v' ? { width: RAIL_H, height: board.width } : { width: board.width, height: RAIL_H };
  },

  // 눈금 단위 — 설정 › 판 › 연대표 눈금 단위 (모든 연대표에 함께)
  timelineScale() {
    const scale = this.settings && this.settings.timelineScale;
    return UNIT[scale] ? scale : 'month';
  },

  // 보고 있는 때 — 눈금 단위가 바뀌었으면 보던 가운데 날짜가 가운데에 오도록 (쪽지 날짜는 그대로)
  timelineView(board) {
    const scale = this.timelineScale();
    let view = this.boardViews.get(board.id);
    if (!view) {
      view = { scale, x: axisX(defaultStart(scale), scale) };
      this.boardViews.set(board.id, view);
    } else if (view.scale !== scale) {
      const len = this.railWidth(board);
      const center = dateAt(view.x + len / 2, view.scale);
      view = { scale, x: axisX(center, scale) + dayWidth(center, scale) / 2 - len / 2 };
      this.boardViews.set(board.id, view);
    }
    return view;
  },

  // 캘린더 모드에서 연동한 캘린더 판 (없으면 null)
  linkedCalendar(board) {
    if (board.mode !== 'calendar' || !board.linkedBoardId) return null;
    const cal = this.findBoard(board.linkedBoardId);
    return cal && cal.kind === 'calendar' ? cal : null;
  },

  // 쪽지를 붙이는 자리 — 막대 방향으로 막대 처음에서 얼마나 (가로: x, 세로: y). 지금 막대에 보이지 않으면 null
  timelineHookPos(board, note) {
    const len = this.railWidth(board);
    if (board.mode === 'calendar') {
      if (!note.date) return null;
      const scale = this.timelineScale();
      const view = this.timelineView(board);
      const d = parseKey(note.date);
      const pos = axisX(d, scale) + dayWidth(d, scale) / 2 - view.x;
      return pos >= 0 && pos <= len ? pos : null;
    }
    if (!note.segmentId) return null;
    let start = 0;
    for (const seg of board.segments) {
      if (seg.id === note.segmentId) {
        const pos = start + clamp(note.ratio || 0, 0, 1) * seg.width;
        return pos <= len ? pos : null;
      }
      start += seg.width;
    }
    return null;
  },

  // 막대에 붙은 쪽지 (연동한 캘린더의 쪽지는 mirror). side: 'up' 위(세로 막대는 왼쪽) · 'down' 아래(오른쪽) — 놓은 쪽 그대로
  timelineItems(board) {
    const items = [];
    const cal = this.linkedCalendar(board);
    this.notes.forEach(note => {
      let mirror = false;
      if (note.boardId === board.id) {
        if (board.mode === 'calendar' ? !note.date : !note.segmentId) return;   // 다른 모드에 걸어 둔 쪽지
      } else if (cal && note.boardId === cal.id && note.date) {
        mirror = true;
      } else {
        return;
      }
      const pos = this.timelineHookPos(board, note);
      if (pos === null) return;
      const size = this.noteSize(note);
      items.push({
        note, mirror, pos, side: note.side === 'up' ? 'up' : 'down',
        off: note.off > 0 ? note.off : 0,                 // 막대에서 더 띄운 만큼 (끌어서 정한 높이)
        width: size.width, height: size.height,
      });
    });
    return items;
  },

  // 세로 막대: 왼쪽 바깥 꼬리표(눈금 글씨 · 칸 이름) 자리 — 왼쪽 쪽지는 이 자리를 지나서 놓임
  timelineLabelZone(board) {
    return board.mode === 'direct' ? V.label.direct : V.label.calendar;
  },

  // 자리 잡기 — 양쪽 따로, 붙인 순서대로. 쪽지마다 정해 둔 높이(off — 없으면 막대 바로 옆)에 놓되,
  //   먼저 붙인 쪽지와 겹치면 그 바깥으로 밀림 (먼저 붙인 쪽지는 자리를 지키고 나중 것이 바깥으로)
  //   d = 기본 자리에서 바깥으로 얼마나 (쪽지 안쪽 끝). 밀릴 때 안쪽 쪽지와의 틈:
  //     가로 막대: 아래는 20 (줄이 길어져 내려감) / 위는 −6 (아래 쪽지에 6 겹쳐 기댐)   세로 막대: 20
  //   자리 값은 막대 왼쪽 위 기준. lo · hi = 막대에서 벗어난 쪽으로 차지하는 자리의 양 끝
  //     (가로: 위 · 아래 끝 — 맨 위 줄 26 · 아래 여백 10 포함 / 세로: 왼쪽 · 오른쪽 끝)
  timelineLayout(board) {
    const vert = board.dir === 'v';
    const items = this.timelineItems(board)
      .sort((a, b) => ((a.note.boardAt || 0) - (b.note.boardAt || 0)) || (a.pos - b.pos));
    const sep = { up: vert ? V.col : -PERCH, down: vert ? V.col : TIER_GAP };
    const placed = { up: [], down: [] };
    items.forEach(item => {
      item.span = vert ? item.height : item.width;        // 막대 방향으로 차지하는 길이
      const depth = vert ? item.width : item.height;      // 막대에서 멀어지는 쪽 두께
      item.lo = item.pos - item.span / 2;
      const hi = item.lo + item.span;
      const near = placed[item.side].filter(p => item.lo < p.hi + NOTE_GAP && p.lo < hi + NOTE_GAP);
      const gap = sep[item.side];
      let d = item.off;
      for (let moved = true; moved;) {
        moved = false;
        near.forEach(p => {
          if (d < p.d1 + gap && p.d0 < d + depth + gap) {
            d = p.d1 + gap;
            moved = true;
          }
        });
      }
      item.d = d;
      item.over = near.filter(p => p.d0 < d).length;      // 안쪽에 있는 쪽지 수 — 얹은 쪽지의 앞뒤 차례
      placed[item.side].push({ lo: item.lo, hi, d0: d, d1: d + depth });
    });
    const end = (side) => placed[side].reduce((max, p) => Math.max(max, p.d1), 0);   // 가장 바깥
    let lo;
    let hi;
    if (vert) {
      const label = this.timelineLabelZone(board);
      items.forEach(item => {
        item.y = item.lo;
        if (item.side === 'up') {
          item.edge = -(label + V.gap) - item.d;          // 왼쪽 쪽지의 오른쪽 끝
          item.x = item.edge - item.width;
        } else {
          item.x = RAIL_H + V.gap + item.d;
        }
      });
      lo = (placed.up.length ? -(label + V.gap) - end('up') : -label) - V.pad;
      hi = (placed.down.length ? RAIL_H + V.gap + end('down') : RAIL_H) + V.pad;
    } else {
      items.forEach(item => {
        item.x = item.lo;
        if (item.side === 'up') {
          item.base = PERCH - item.d;                     // 얹은 쪽지의 아래 끝 — 띄우지 않으면 막대에 6 물림
          item.y = item.base - item.height;
        } else {
          item.y = FIRST_TIER + item.d;
        }
      });
      // 위로 띄운 쪽지의 받침 선 — 쪽지 아래 끝에서 바로 밑의 것(그 자리에 있는 다른 쪽지의 위 끝, 없으면 막대)까지
      items.forEach(item => {
        item.stem = null;
        if (item.side !== 'up') return;
        let support = 0;
        items.forEach(o => {
          if (o !== item && o.side === 'up' && o.d < item.d && o.lo <= item.pos && item.pos <= o.lo + o.span) support = Math.min(support, o.y);
        });
        if (item.base < support - 0.5) item.stem = { from: item.base, to: support };
      });
      lo = (placed.up.length ? PERCH - end('up') : 0) - TOP_ROW;
      hi = (placed.down.length ? FIRST_TIER + end('down') : RAIL_H) + BOTTOM_PAD;
    }
    const layout = { vert, items, lo, hi, byNote: new Map(items.filter(i => !i.mirror).map(i => [i.note.id, i])) };
    this.timelineLayouts.set(board.id, layout);
    return layout;
  },

  // 붙은 쪽지 자리 — 위치는 배치에서, 크기는 지금 쪽지 크기 그대로 (글이 넘쳐 늘어나도 붙인 자리 가운데 · 안쪽 끝 유지)
  //   perch: 가로 막대 위쪽 쪽지의 앞뒤 차례 (1 = 가장 안쪽) — 막대보다 뒤, 안쪽 쪽지가 앞 (board-notes.js applyBoardState)
  timelineNoteSlot(board, note) {
    const layout = this.timelineLayouts.get(board.id) || this.timelineLayout(board);
    const item = layout.byNote.get(note.id);
    if (!item) return { board, offView: true };
    const size = this.noteSize(note);
    const up = item.side === 'up';
    if (layout.vert) {
      return {
        x: board.x + (up ? item.edge - size.width : item.x),
        y: board.y + item.pos - size.height / 2,
        width: size.width, height: size.height, board, top: true,
      };
    }
    return {
      x: board.x + item.pos - size.width / 2,
      y: board.y + (up ? item.base - size.height : item.y),
      width: size.width, height: size.height, board, top: true,
      perch: up ? item.over + 1 : 0,
    };
  },

  // 연대표에 붙은 쪽지면 그 연대표 (연동한 캘린더에 붙은 쪽지도 — 막대에 따라 그려지므로). 아니면 null
  noteTimeline(note) {
    const board = this.noteBoard(note);
    if (!board) return null;
    if (board.kind === 'timeline') return board;
    if (board.kind !== 'calendar' || !note.date) return null;
    return this.boards.find(b => b.kind === 'timeline' && this.linkedCalendar(b) === board) || null;
  },

  // 쪽 바꾸기 — 쪽지 우클릭 '막대 위로 / 아래로' (세로 막대: 왼쪽으로 / 오른쪽으로). 막대 바로 옆에 놓이고, 그 자리가 차 있으면 바깥으로 (나중에 온 것이 바깥)
  setNoteRailSide(note, side) {
    if ((note.side === 'up' ? 'up' : 'down') === side) return;
    this.record();
    if (side === 'up') note.side = 'up';
    else delete note.side;
    delete note.off;                                      // 띄워 둔 높이는 풂
    note.boardAt = Date.now();
    note.updatedAt = Date.now();
    this.refreshAllBoards();
    this.scheduleSave();
  },

  // ---- 그리기 ----
  renderTimeline(board, el) {
    const vert = board.dir === 'v';
    el.classList.toggle('tl-v', vert);
    const layout = this.timelineLayout(board);
    const calendarMode = board.mode === 'calendar';

    // 걸이 막대 — 판 요소가 곧 막대 자리 (잡고 끌면 옮겨짐 — boards.js)
    const rail = div('tl-rail');
    const extras = [];                                   // 막대 밖 글씨 (오늘 · 빨간 날 이름 · 세로 막대의 꼬리표) · 오늘 점선 · 칸 추가
    if (calendarMode) this.fillCalendarRail(board, rail, extras, layout);
    else this.fillDirectRail(board, rail, extras);
    ['left', 'right'].forEach(side => {                  // 나사 — 양 끝 (세로 막대는 위 · 아래 끝)
      const screw = div(`tl-screw ${side}`);
      rail.appendChild(screw);
    });
    this.bindRailWheel(board, rail);

    // 가로: 걸이 · 줄 (아래에 건 쪽지) · 받침 선 (위로 띄운 쪽지) / 세로: 이음 선 (양쪽) · 연동한 캘린더 쪽지
    const hangs = div('tl-hangs');
    layout.items.forEach(item => {
      if (vert) {
        const link = div(`tl-link ${item.side === 'up' ? 'l' : 'r'}`);
        if (item.side === 'up') place(link, item.edge, item.pos, -item.edge);
        else place(link, RAIL_H, item.pos, item.x - RAIL_H);
        hangs.appendChild(link);
      } else if (item.side === 'down') {
        const hook = document.createElement('img');
        hook.className = 'tl-hook';
        hook.src = `${ICON_DIR}rail-hook.svg`;
        hook.alt = '';
        hook.draggable = false;
        place(hook, item.pos - HOOK.width / 2, HOOK.top, HOOK.width, HOOK.height);
        const string = div('tl-string');
        place(string, item.pos, STRING_TOP, undefined, item.y - STRING_TOP);
        hangs.append(hook, string);
      } else if (item.stem) {
        const stem = div('tl-string tl-stem');
        place(stem, item.pos, item.stem.from, undefined, item.stem.to - item.stem.from);
        hangs.appendChild(stem);
      }
      if (item.mirror) hangs.appendChild(this.buildNoteMirror(board, item));
    });

    // 이름 꼬리표 — 이름이 있을 때만 (가로: 막대 왼쪽 끝 옆 / 세로: 위 끝 위). 두 번 누르면 이름 바꾸기 (판 메뉴에도 있음)
    const nameBox = div('tl-name');
    nameBox.appendChild(this.boardNameElement(board, '', 'tl-tag'));

    el.append(hangs, rail, ...extras, nameBox);

    // 길이 손잡이 — 막대 끝 (가로: 오른쪽 / 세로: 아래. 막대에 마우스를 올렸을 때만). 직접 작성 모드에서 마지막 칸이 막대 끝까지면 그 칸 손잡이가 대신함
    const segEnd = calendarMode ? 0 : this.timelineSegmentsWidth(board);
    if (!board.pinned && (calendarMode || segEnd < board.width - 1)) el.appendChild(div('tl-len'));
  },

  // 캘린더 모드 막대 — 칸마다 경계선 · 글씨, 주말 · 빨간 날 띠, 오늘
  //   글씨: 가로 막대는 막대 안 칸 가운데 / 세로 막대는 막대 왼쪽 바깥 꼬리표 (칸이 시작하는 곳)
  fillCalendarRail(board, rail, extras, layout) {
    const vert = board.dir === 'v';
    const scale = this.timelineScale();
    const view = this.timelineView(board);
    const len = this.railWidth(board);
    const x0 = view.x;
    const x1 = view.x + len;
    const en = getLanguage() === 'en';
    const tag = (className, text, start) => {            // 세로 막대 꼬리표
      const el = div(`tl-tag tl-vlabel ${className}`, text);
      el.style.top = `calc(${start}px * var(--z))`;
      extras.push(el);
      return el;
    };
    const tick = (x, strong) => {
      const line = div('tl-tick' + (strong ? ' year' : ''));
      along(line, vert, x);
      rail.appendChild(line);
    };
    const label = (start, end, text) => {
      const visA = Math.max(0, start);
      const visB = Math.min(len, end);
      if (visB - visA < 24) return;
      if (vert) {
        tag('', text, visA + 3);
        return;
      }
      const lab = div('tl-label', text);
      lab.style.left = `calc(${(visA + visB) / 2}px * var(--z))`;
      rail.appendChild(lab);
    };

    // 칸 (연 · 월 · 일)
    let first = true;
    if (scale === 'year') {
      for (let yi = Math.floor(x0 / UNIT.year); yi * UNIT.year < x1; yi++) {
        const left = yi * UNIT.year - x0;
        if (left > 0) tick(left, true);
        label(left, left + UNIT.year, en ? String(EPOCH + yi) : t('tl.year', { y: EPOCH + yi }));
      }
    } else if (scale === 'month') {
      for (let mi = Math.floor(x0 / UNIT.month); mi * UNIT.month < x1; mi++) {
        const left = mi * UNIT.month - x0;
        const y = EPOCH + Math.floor(mi / 12);
        const m = ((mi % 12) + 12) % 12;
        if (left > 0) tick(left, m === 0);
        const full = first || m === 0;
        const text = en
          ? new Date(y, m, 1).toLocaleDateString('en-US', full ? { month: 'short', year: 'numeric' } : { month: 'short' })
          : (full ? t('tl.monthFull', { y, m: m + 1 }) : t('tl.month', { m: m + 1 }));
        label(left, left + UNIT.month, text);
        if (left + UNIT.month > 24) first = false;
      }
    } else {
      for (let di = Math.floor(x0 / UNIT.day); di * UNIT.day < x1; di++) {
        const left = di * UNIT.day - x0;
        const d = new Date(EPOCH, 0, 1 + di);
        if (left > 0) tick(left, d.getDate() === 1);
        const full = first || d.getDate() === 1;
        const text = en
          ? d.toLocaleDateString('en-US', full ? { month: 'short', day: 'numeric' } : { day: 'numeric' })
          : (full ? t('tl.dayFull', { m: d.getMonth() + 1, d: d.getDate() }) : String(d.getDate()));
        label(left, left + UNIT.day, text);
        if (left + UNIT.day > 24) first = false;
      }
    }

    // 주말 · 빨간 날 띠 — 막대 아래 절반(세로 막대는 오른쪽 절반), 하루 폭 (연 눈금에서는 표시하지 않음)
    const todayKey = this.todayKey();
    let todayHoliday = '';
    if (scale !== 'year') {
      for (let d = dateAt(x0, scale); axisX(d, scale) < x1; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
        const dow = d.getDay();
        const key = dateKey(d);
        const name = this.holidayName(key);
        if (!name && dow !== 0 && dow !== 6) continue;
        const left = axisX(d, scale) - x0;
        const width = dayWidth(d, scale);
        const strip = div(`tl-strip ${name ? 'holiday' : dow === 0 ? 'sun' : 'sat'}`);
        along(strip, vert, left, width);
        if (name) strip.title = name;                    // 월 눈금: 마우스를 올리면 이름
        rail.appendChild(strip);
        if (!name || scale !== 'day') continue;
        if (vert) {                                      // 일 눈금: 날짜 꼬리표 아래에 이름 (오늘이면 '오늘' 꼬리표에 함께)
          if (key === todayKey) todayHoliday = name;
          else if (left + 24 >= 0 && left + 42 <= len) tag('holiday', name, left + 24);
        } else {                                         // 맨 위 줄에 이름 (얹은 쪽지가 없으면 막대 바로 위)
          const top = div('tl-holiday-name', name);
          place(top, left + width / 2, layout.lo, undefined, TOP_ROW);
          extras.push(top);
        }
      }
    }

    // 오늘 — 막대 안 빨간 선 + 막대를 가로지르는 점선 (차지하는 자리 끝에서 끝까지) + '오늘' (가로: 맨 위 줄 / 세로: 꼬리표)
    const now = new Date();
    const tx = axisX(now, scale) + dayWidth(now, scale) / 2 - x0;
    if (tx >= 0 && tx <= len) {
      const line = div('tl-today-line');
      along(line, vert, tx);
      rail.appendChild(line);
      const drop = div('tl-today-drop');
      if (vert) {
        place(drop, layout.lo, tx, layout.hi - layout.lo);
        extras.push(drop);
        tag('today mid', todayHoliday ? `${t('board.today')} · ${todayHoliday}` : t('board.today'), tx);
      } else {
        place(drop, tx, layout.lo + TOP_ROW, undefined, layout.hi - layout.lo - TOP_ROW);
        const top = div('tl-today-label', t('board.today'));
        place(top, tx, layout.lo, undefined, TOP_ROW);
        extras.push(drop, top);
      }
    }
  },

  // 직접 작성 모드 막대 — 내가 만든 칸 (이름 두 번 누르면 고침 · 경계를 끌면 폭 · 우클릭으로 지우기)
  //   칸 이름: 가로 막대는 막대 안 / 세로 막대는 막대 왼쪽 바깥 꼬리표 (칸 가운데)
  fillDirectRail(board, rail, extras) {
    const vert = board.dir === 'v';
    let start = 0;
    board.segments.forEach((seg, i) => {
      const cell = div('tl-seg');
      cell.dataset.seg = seg.id;
      along(cell, vert, start, seg.width);
      const name = div(vert ? 'tl-tag tl-vlabel seg mid' : 'tl-seg-label', seg.name || t('tl.segmentUnnamed'));
      if (!seg.name) name.classList.add('empty');
      const rename = (e) => {
        e.stopPropagation();
        this.renameTimelineSegment(board, seg);
      };
      const menu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openSegmentMenu(board, seg, e.clientX, e.clientY);
      };
      cell.addEventListener('dblclick', rename);
      cell.addEventListener('contextmenu', menu);
      if (vert) {
        name.dataset.seg = seg.id;
        name.style.top = `calc(${start + seg.width / 2}px * var(--z))`;
        name.addEventListener('dblclick', rename);
        name.addEventListener('contextmenu', menu);
        extras.push(name);
      } else {
        cell.appendChild(name);
      }
      rail.appendChild(cell);
      start += seg.width;
      if (i < board.segments.length - 1) {
        const line = div('tl-tick');
        along(line, vert, start);
        rail.appendChild(line);
      }
      if (!board.pinned) {                               // 경계 손잡이 — 마우스를 올렸을 때만 보임
        const handle = div('tl-seg-handle');
        along(handle, vert, start);
        handle.addEventListener('mousedown', (e) => this.startSegmentResize(board, i, e));
        rail.appendChild(handle);
      }
    });

    if (!board.pinned) {                                 // '+ 칸 추가' — 가로: 막대 오른쪽 아래 / 세로: 막대 아래 끝 밑
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'tl-add-seg';
      add.innerHTML = `<img src="${ICON_DIR}plus.svg" alt="" draggable="false"><span></span>`;
      add.querySelector('span').textContent = t('tl.addSegment');
      add.style.top = `calc(${(vert ? board.width : RAIL_H) + 6}px * var(--z))`;
      add.addEventListener('click', () => this.addTimelineSegment(board));
      extras.push(add);
    }
  },

  // 캘린더 모드: 막대 위에서 휠을 돌리면 보이는 때가 옮겨감 (막대를 잡고 끌면 막대가 옮겨지므로 — 화면 확대 대신)
  bindRailWheel(board, rail) {
    rail.addEventListener('wheel', (e) => {
      if (board.mode !== 'calendar' || e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      this.timelineView(board).x += clamp(d, -240, 240);
      this.requestBoardsRefresh();
    }, { passive: false });
  },

  // 연동한 캘린더 쪽지를 막대에 따라 그림 — 끌면 진짜 쪽지가 이어받아 움직이고, 두 번 누르면 캘린더에서 고침
  buildNoteMirror(board, item) {
    const note = item.note;
    const custom = note.color === 'custom' && isHexColor(note.customColor);
    const m = div(['sticky-note', 'note-mirror', 'on-board', 'stack-top',
      item.side === 'up' && board.dir !== 'v' ? 'perched' : '',   // 가로 막대 위에 얹은 쪽지는 막대보다 뒤
      custom ? 'note-custom' : `note-${note.color}`,
      `type-${note.type}`, `size-${note.size}`, `font-${note.font}`, `ink-${note.ink}`,
      this.noteAlignClass(note),                        // 글 정렬 (notes.js)
      this.selection.has(note.id) ? 'selected' : '',
      custom && isDarkColor(note.customColor) ? 'note-dark' : '',
    ].filter(Boolean).join(' '));
    if (custom) {
      m.style.setProperty('--note-bg', note.customColor);
      m.style.setProperty('--fold-img', customFoldImage(note.customColor));
    }
    this.applyNoteTextVars(m, note);                  // 글자 색 · pt 크기 (notes.js)
    place(m, item.x, item.y, item.width, item.height);
    m.innerHTML = `
      <div class="note-header">
        <img class="note-state-icon" src="${ICON_DIR}${this.noteIcon(note)}" alt="" draggable="false">
      </div>
      <div class="note-title"></div>
      <div class="note-body"></div>`;
    m.querySelector('.note-title').textContent = note.title;
    const body = m.querySelector('.note-body');
    if (note.type === 'checklist') {
      const list = div('note-checklist');
      note.items.forEach(it => {
        const row = div('check-item' + (it.done ? ' done' : ''));
        row.innerHTML = `<img class="check-box" src="${ICON_DIR}${it.done ? 'checkbox-checked.svg' : 'checkbox.svg'}" alt="" draggable="false"><div class="check-text"></div>`;
        row.querySelector('.check-text').textContent = it.text;
        list.appendChild(row);
      });
      body.appendChild(list);
    } else if (note.type === 'table' && note.table) {
      body.appendChild(this.tableMirror(note));        // 표 (table-note.js)
    } else {
      body.appendChild(div('note-text', note.content));
    }

    m.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      e.preventDefault();
      this.selectItem(note.id);
      if (board.pinned || this.noteLocked(note)) return;
      note.x = board.x + item.x;                         // 끌기 시작하면 진짜 쪽지가 이 자리에서 이어받음
      note.y = board.y + item.y;
      this.startItemDrag(e, 'note', note);
      this.drag.carrySize = { width: item.width, height: item.height };
    });
    m.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.openLinkedNote(note);
    });
    m.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.selectItem(note.id);
      this.openNoteMenu(note, e.clientX, e.clientY);
    });
    return m;
  },

  // 따라 그린 쪽지를 두 번 누르면: 캘린더 판에서 그 쪽지를 펼쳐 바로 고침
  openLinkedNote(note) {
    this.revealNoteOnBoard(note);
    const rect = this.noteRect(note);
    const zoom = Math.max(this.zoom, 0.8);
    this.animateView({
      zoom,
      panX: this.viewWidth / 2 - (rect.x + rect.width / 2) * zoom,
      panY: this.viewHeight / 2 - (rect.y + rect.height / 2) * zoom,
    });
    this.startEditing(note);
  },

  // ---- 끌어서 붙이기 ----
  // 놓을 수 있는 자리 — 가로 막대: 위에 놓으면 얹히고 아래에 놓으면 걸림 / 세로 막대: 놓은 쪽(왼쪽 · 오른쪽)에 붙음
  //   캘린더 모드는 하루 단위, 직접 작성 모드는 칸 안 아무 자리
  //   rect: 끄는 쪽지가 지금 있는 자리 (월드 좌표) — 쪽지 가운데가 놓일 날짜 · 쪽을 정하고, 막대에서 떨어진 만큼이 높이(off)가 됨
  //     → 놓은 쪽 · 놓은 높이 그대로 (자리가 차 있어도 반대쪽으로 넘기지 않음. 다른 쪽지와 겹칠 때만 배치가 바깥으로 밂)
  //   rect 가 없으면 (막대 두 번 누르기) 그 점의 날짜에 막대 바로 옆
  timelineDropAt(board, wx, wy, rect = null) {
    const vert = board.dir === 'v';
    const px = rect ? rect.x + rect.width / 2 : wx;
    const py = rect ? rect.y + rect.height / 2 : wy;
    const along = vert ? py - board.y : px - board.x;    // 막대 방향 자리
    const away = vert ? px - board.x : py - board.y;     // 막대에서 벗어난 쪽 자리
    const len = this.railWidth(board);
    const layout = this.timelineLayouts.get(board.id) || this.timelineLayout(board);
    const zone = vert ? this.timelineLabelZone(board) : 0;
    if (along < 0 || along > len || away < Math.min(layout.lo - 100, -(zone + REACH)) || away > Math.max(layout.hi + 100, RAIL_H + REACH)) return null;
    let hit = null;
    if (board.mode === 'calendar') {
      const scale = this.timelineScale();
      const view = this.timelineView(board);
      const d = dateAt(view.x + along, scale);
      const key = dateKey(d);
      hit = { key, date: key, pos: axisX(d, scale) + dayWidth(d, scale) / 2 - view.x, label: this.balloonDate(d) };
    } else {
      let start = 0;
      for (const seg of board.segments) {
        if (along <= start + seg.width) {
          const ratio = clamp((along - start) / seg.width, 0, 1);
          hit = { key: `${seg.id}:${ratio.toFixed(3)}`, segmentId: seg.id, ratio, pos: along, label: seg.name || t('tl.segmentUnnamed') };
          break;
        }
        start += seg.width;
      }
      if (!hit) return null;                             // 칸이 없는 자리
    }
    hit.side = away < RAIL_H / 2 ? 'up' : 'down';
    let off = 0;                                         // 기본 자리(막대 바로 옆)에서 더 띄운 만큼
    if (rect) {
      const up = hit.side === 'up';
      if (vert) off = up ? -(zone + V.gap) - (rect.x + rect.width - board.x) : rect.x - board.x - (RAIL_H + V.gap);
      else off = up ? PERCH - (rect.y + rect.height - board.y) : rect.y - board.y - FIRST_TIER;
    }
    hit.off = off < OFF_SNAP ? 0 : Math.round(off);
    hit.span = rect ? (vert ? rect.height : rect.width) : this.newNote().width;
    hit.key += `|${hit.side}|${hit.off}`;
    return hit;
  },

  balloonDate(d) {
    if (getLanguage() === 'en') return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return t('tl.balloon', { m: d.getMonth() + 1, d: d.getDate(), w: t(`wd.${d.getDay()}`) });
  },

  // 놓일 자리가 파랗게 — 가로: 위는 막대 위 테두리(얹기) · 띄우면 받침 선, 아래는 파란 걸이 + 줄 / 세로: 파란 이음 선
  showTimelineDropHint(target) {
    const board = target.board;
    const el = document.getElementById(board.id);
    if (!el) return;
    const hangs = el.querySelector('.tl-hangs');
    if (board.dir === 'v') {
      const link = div(`tl-link tl-hint target ${target.side === 'up' ? 'l' : 'r'}`);
      const reach = this.timelineLabelZone(board) + V.gap + target.off;
      if (target.side === 'up') place(link, -reach, target.pos, reach);
      else place(link, RAIL_H, target.pos, V.gap + target.off);
      hangs.appendChild(link);
      return;
    }
    if (target.side === 'up') {
      if (target.off > PERCH) {                          // 막대에서 띄움 — 받침 선
        const stem = div('tl-string tl-stem tl-hint target');
        place(stem, target.pos, PERCH - target.off, undefined, target.off - PERCH);
        hangs.appendChild(stem);
      }
      const edge = div('tl-perch-hint tl-hint');
      const left = Math.max(0, target.pos - target.span / 2);
      place(edge, left, 0, Math.min(this.railWidth(board), target.pos + target.span / 2) - left);
      el.appendChild(edge);
      return;
    }
    const hook = document.createElement('img');
    hook.className = 'tl-hook tl-hint target';
    hook.src = `${ICON_DIR}rail-hook.svg`;
    hook.alt = '';
    hook.draggable = false;
    place(hook, target.pos - HOOK.width / 2, HOOK.top, HOOK.width, HOOK.height);
    const string = div('tl-string tl-hint target');
    place(string, target.pos, STRING_TOP, undefined, FIRST_TIER + target.off - STRING_TOP);
    hangs.append(hook, string);
  },

  // 끄는 쪽지 위에 풍선 — 날짜(캘린더) 또는 칸 이름(직접 작성)
  moveTimelineBalloon(target, drag) {
    const noteEl = document.getElementById(drag.item.id);
    if (!noteEl) return;
    let balloon = document.getElementById('tl-balloon');
    if (!balloon) {
      balloon = div('tl-balloon');
      balloon.id = 'tl-balloon';
      document.body.appendChild(balloon);
    }
    balloon.textContent = target.label;
    const r = noteEl.getBoundingClientRect();
    balloon.style.left = `${r.left + r.width / 2}px`;
    balloon.style.top = `${r.top - 8}px`;
  },

  // 붙이기 — 연동한 캘린더가 있으면 그 캘린더에 붙여서 양쪽에 함께 보이게. 놓은 쪽(위 · 아래, 세로 막대는 왼쪽 · 오른쪽) · 높이를 기억함
  hangNoteOnTimeline(note, board, target) {
    this.detachNoteFields(note);
    if (board.mode === 'calendar') {
      const cal = this.linkedCalendar(board);
      note.boardId = cal ? cal.id : board.id;
      note.date = target.date;
    } else {
      note.boardId = board.id;
      note.segmentId = target.segmentId;
      note.ratio = target.ratio;
    }
    if (target.side === 'up') note.side = 'up';
    if (target.off > 0) note.off = target.off;
  },

  // 막대를 두 번 누르면 그 자리에 새 쪽지를 걸고 바로 제목 입력 (boards.js)
  addNoteOnTimeline(board, target) {
    if (board.pinned || !target) return;
    this.record();
    const note = this.newNote({ x: board.x, y: board.y });   // 자리는 막대가 정함 (timelineNoteSlot)
    this.hangNoteOnTimeline(note, board, target);
    note.boardAt = Date.now();
    this.notes.push(note);
    this.refreshAllBoards();                               // 먼저 층을 다시 나눠야 새 쪽지 자리가 정해짐
    this.revealNoteOnBoard(note);                          // 연동: 캘린더가 다른 달이면 그 달로
    this.createNoteElement(note);
    this.scheduleSave();
    if (this.linkedCalendar(board)) {
      this.selectItem(note.id);                            // 연동: 진짜 쪽지는 캘린더 판에 — 선택만
    } else {
      this.startEditing(note);
      this.typingRecorded = true;
    }
  },

  // ---- 판 메뉴 ----
  setTimelineMode(board, mode) {
    if (board.mode === mode) return;
    this.record();
    board.mode = mode;
    board.updatedAt = Date.now();
    this.refreshAllBoards();
    this.scheduleSave();
  },

  // 방향 — 가로 ↔ 세로. 막대 왼쪽 위(board.x · y)를 그대로 두고 눕히거나 세움. 쪽지 날짜 · 칸 · 쪽은 그대로
  setTimelineDir(board, dir) {
    if ((board.dir === 'v' ? 'v' : 'h') === dir) return;
    this.record();
    if (dir === 'v') board.dir = 'v';
    else delete board.dir;
    board.updatedAt = Date.now();
    this.refreshAllBoards();
    this.requestMinimap();
    this.scheduleSave();
  },

  timelineGoToday(board) {
    this.boardViews.delete(board.id);
    this.refreshAllBoards();
  },

  setTimelineLink(board, calendarId) {
    if (board.linkedBoardId === calendarId) return;
    this.record();
    board.linkedBoardId = calendarId;
    board.updatedAt = Date.now();
    this.refreshAllBoards();
    this.scheduleSave();
  },

  // 찾기로 갈 때: 막대 밖 날짜면 그 날짜가 가운데 오도록
  revealOnTimeline(board, note) {
    if (board.mode !== 'calendar' || !note.date) return;
    const d = parseKey(note.date);
    const scale = this.timelineScale();
    this.boardViews.set(board.id, { scale, x: axisX(d, scale) - this.railWidth(board) / 2 });
    this.refreshAllBoards();
  },

  // ---- 직접 작성 모드의 칸 ----
  // 칸이 막대보다 길어지면 막대를 늘림
  fitTimelineWidth(board) {
    const total = this.timelineSegmentsWidth(board);
    if (total > this.railWidth(board)) board.width = total;
  },

  timelineSegmentsWidth(board) {
    return board.segments.reduce((sum, s) => sum + s.width, 0);
  },

  addTimelineSegment(board) {
    this.record();
    const seg = { id: this.newId('seg'), name: t('tl.newSegment'), width: NEW_SEG_WIDTH };
    board.segments.push(seg);
    this.fitTimelineWidth(board);
    board.updatedAt = Date.now();
    this.refreshAllBoards();
    this.scheduleSave();
    this.renameTimelineSegment(board, seg);
  },

  // 칸 지우기 — 그 칸에 걸린 쪽지는 옆 칸으로 옮겨 붙음 (앞 칸 끝, 없으면 뒤 칸 처음)
  deleteTimelineSegment(board, seg) {
    const i = board.segments.indexOf(seg);
    if (i < 0 || board.segments.length < 2) return;
    this.record();
    const prev = board.segments[i - 1];
    const next = board.segments[i + 1];
    this.notes.forEach(note => {
      if (note.boardId !== board.id || note.segmentId !== seg.id) return;
      note.segmentId = (prev || next).id;
      note.ratio = prev ? 0.97 : 0.03;
    });
    board.segments.splice(i, 1);
    board.updatedAt = Date.now();
    this.refreshAllBoards();
    this.scheduleSave();
  },

  openSegmentMenu(board, seg, x, y) {
    const items = [{ icon: 'edit.svg', label: t('menu.renameSegment'), action: () => this.renameTimelineSegment(board, seg) }];
    if (board.segments.length > 1 && !board.pinned) {
      items.push({ separator: true });
      items.push({ icon: 'trash.svg', label: t('menu.deleteSegment'), action: () => this.deleteTimelineSegment(board, seg), danger: true });
    }
    this.openContextMenu(items, x, y);
  },

  // 칸 이름을 그 자리에서 고침 (Enter 끝 · Esc 취소 · 바깥 누르면 끝)
  renameTimelineSegment(board, seg) {
    const el = document.getElementById(board.id);
    // 가로 막대는 막대 안 칸에서, 세로 막대는 막대 왼쪽 바깥 꼬리표에서
    const cell = el && el.querySelector(`${board.dir === 'v' ? '.tl-vlabel' : '.tl-seg'}[data-seg="${seg.id}"]`);
    if (!cell || cell.querySelector('input')) return;
    const input = document.createElement('input');
    input.className = 'tl-seg-input';
    input.value = seg.name;
    input.placeholder = t('tl.segmentUnnamed');
    input.spellcheck = false;
    input.maxLength = 30;
    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      const value = input.value.replace(/\s+/g, ' ').trim();
      if (commit && value !== seg.name) {
        this.record();
        seg.name = value;
        board.updatedAt = Date.now();
        this.scheduleSave();
      }
      this.refreshAllBoards();
    };
    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
  },

  // 칸 경계를 끌면 폭이 바뀜 — 가운데 경계는 양옆이 같이 늘고 줄어듦, 맨 끝은 그 칸만
  startSegmentResize(board, i, e) {
    if (e.button !== 0 || board.pinned) return;
    e.preventDefault();
    e.stopPropagation();
    this.record();
    const a = board.segments[i];
    const b = board.segments[i + 1];
    const startA = a.width;
    const total = b ? a.width + b.width : 0;
    const vert = board.dir === 'v';                        // 세로 막대는 위아래로 끎
    const p0 = vert ? e.clientY : e.clientX;
    const move = (ev) => {
      const dx = ((vert ? ev.clientY : ev.clientX) - p0) / this.zoom;
      if (b) {
        a.width = clamp(startA + dx, MIN_SEG, total - MIN_SEG);
        b.width = total - a.width;
      } else {
        a.width = Math.max(MIN_SEG, startA + dx);
        this.fitTimelineWidth(board);
      }
      this.requestBoardsRefresh();
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      this.dropHistoryIfUnchanged();
      board.updatedAt = Date.now();
      this.scheduleSave();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  },
};

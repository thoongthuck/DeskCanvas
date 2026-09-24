// 연대표 판 — 걸이 막대에 쪽지를 걸어 늘어뜨림 (code/icons/아이콘_가이드.md 12-4, 시안_연대표판.png 4안)
//   시간 축 두 가지 (판 메뉴 '시간 축 ›') — 두 모드는 자료를 따로 가짐
//     캘린더:   진짜 날짜 · 눈금(연 112 · 월 210 · 일 64) · 오늘 · 주말/빨간 날 띠. 쪽지는 note.date
//     직접 작성: 내가 만든 칸(이름 · 폭). 쪽지는 note.segmentId + note.ratio(칸 안 0~1)
//   옆 쪽지와 가로로 겹치면 줄이 길어져 아래층에 걸리고 판 높이도 따라 늘어남 (쪽지 크기는 그대로)
//   캘린더 판 연동: 그 캘린더 판에 붙은 쪽지도 막대에 함께 걸림 — 같은 쪽지를 연대표에 따라 그린 것 (note-mirror)
//   막대를 잡고 좌우로 끌면 보이는 때가 옮겨감. 보고 있는 때는 저장하지 않음 (켜면 오늘이 왼쪽 1/4쯤)
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { ICON_DIR, INK_COLORS } from './constants.js';
import { t, getLanguage } from './i18n.js';
import { isHexColor, isDarkColor, customFoldImage } from './color.js';
import { dateKey, parseKey } from './calendar.js';

const TL_WIDTH = 1288;
const MIN_WIDTH = 560;
const RAIL = { left: 14, top: 87, height: 26 };      // 걸이 막대 (판 왼쪽 위 기준)
const RAIL_BOTTOM = RAIL.top + RAIL.height;          // 113
const STRING_TOP = RAIL_BOTTOM + 5;                  // 걸이 굽은 곳 — 줄이 여기서 내려감
const FIRST_TIER = STRING_TOP + 25;                  // 1층 쪽지 위 (줄 25)
const TIER_GAP = 20;                                 // 층 사이
const BOTTOM_PAD = 19;
const MIN_HEIGHT = 280;                              // 층 1개 (쪽지 118)
const NOTE_GAP = 12;                                 // 같은 층 쪽지 사이 최소 간격
const HOOK = { width: 14, height: 18, overlap: 6 };   // rail-hook.svg — 막대 바닥에서 위로 6 겹침
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
    return { width: TL_WIDTH, mode: 'calendar', scale: 'month', linkedBoardId: '', segments: this.defaultSegments() };
  },

  // 직접 작성 모드의 처음 칸 — 막대를 네 칸으로
  defaultSegments() {
    const width = (TL_WIDTH - RAIL.left * 2) / 4;
    return [1, 2, 3, 4].map(n => ({ id: this.newId('seg'), name: t('tl.segmentN', { n }), width }));
  },

  normalizeTimeline(board) {
    if (typeof board.width !== 'number' || board.width < MIN_WIDTH) board.width = TL_WIDTH;
    if (board.mode !== 'direct') board.mode = 'calendar';
    if (!UNIT[board.scale]) board.scale = 'month';
    if (typeof board.linkedBoardId !== 'string') board.linkedBoardId = '';
    const segments = (Array.isArray(board.segments) ? board.segments : [])
      .filter(s => s && typeof s.id === 'string' && s.id)
      .map(s => ({ id: s.id, name: typeof s.name === 'string' ? s.name : '', width: Math.max(MIN_SEG, Number(s.width) || NEW_SEG_WIDTH) }));
    board.segments = segments.length ? segments : this.defaultSegments();
    delete board.height;                                  // 높이는 걸린 쪽지 층 수로 정해짐
    return board;
  },

  timelineMinSize() {
    return { width: MIN_WIDTH, height: MIN_HEIGHT };
  },

  railWidth(board) {
    return board.width - RAIL.left * 2;
  },

  timelineView(board) {
    let view = this.boardViews.get(board.id);
    if (!view || view.scale !== board.scale) {
      view = { scale: board.scale, x: axisX(defaultStart(board.scale), board.scale) };
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

  // 쪽지를 거는 자리 (판 왼쪽 기준 x). 지금 막대에 보이지 않으면 null
  timelineHookX(board, note) {
    const railW = this.railWidth(board);
    if (board.mode === 'calendar') {
      if (!note.date) return null;
      const view = this.timelineView(board);
      const d = parseKey(note.date);
      const x = axisX(d, board.scale) + dayWidth(d, board.scale) / 2 - view.x;
      return x >= 0 && x <= railW ? RAIL.left + x : null;
    }
    if (!note.segmentId) return null;
    let start = 0;
    for (const seg of board.segments) {
      if (seg.id === note.segmentId) {
        const x = start + clamp(note.ratio || 0, 0, 1) * seg.width;
        return x <= railW ? RAIL.left + x : null;
      }
      start += seg.width;
    }
    return null;
  },

  // 막대에 걸린 쪽지 (연동한 캘린더 판의 쪽지는 mirror)
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
      const hookX = this.timelineHookX(board, note);
      if (hookX === null) return;
      const size = this.noteSize(note);
      items.push({ note, mirror, hookX, width: size.width, height: size.height });
    });
    return items;
  },

  // 층 나누기 — 왼쪽부터, 들어갈 수 있는 가장 위층에. 층 높이는 그 층에서 가장 큰 쪽지
  timelineLayout(board) {
    const items = this.timelineItems(board).sort((a, b) => a.hookX - b.hookX);
    const tiers = [];
    items.forEach(item => {
      const left = item.hookX - item.width / 2;
      let tier = tiers.findIndex(tr => left >= tr.right + NOTE_GAP);
      if (tier < 0) {
        tier = tiers.length;
        tiers.push({ right: -Infinity, height: 0 });
      }
      tiers[tier].right = left + item.width;
      tiers[tier].height = Math.max(tiers[tier].height, item.height);
      item.tier = tier;
    });
    const tops = [];
    let y = FIRST_TIER;
    tiers.forEach((tr, i) => {
      tops[i] = y;
      y += tr.height + TIER_GAP;
    });
    items.forEach(item => {
      item.x = item.hookX - item.width / 2;
      item.y = tops[item.tier];
    });
    const layout = {
      items,
      height: tiers.length ? Math.max(MIN_HEIGHT, y - TIER_GAP + BOTTOM_PAD) : MIN_HEIGHT,
      byNote: new Map(items.filter(i => !i.mirror).map(i => [i.note.id, i])),
    };
    this.timelineLayouts.set(board.id, layout);
    return layout;
  },

  timelineHeight(board) {
    return (this.timelineLayouts.get(board.id) || this.timelineLayout(board)).height;
  },

  // 걸린 쪽지 자리 — 층(위치)은 배치에서, 크기는 지금 쪽지 크기 그대로 (글이 넘쳐 늘어나도 걸이 가운데 유지)
  timelineNoteSlot(board, note) {
    const layout = this.timelineLayouts.get(board.id) || this.timelineLayout(board);
    const item = layout.byNote.get(note.id);
    if (!item) return { board, offView: true };
    const size = this.noteSize(note);
    return { x: board.x + item.hookX - size.width / 2, y: board.y + item.y, width: size.width, height: size.height, board, top: true };
  },

  // ---- 그리기 ----
  renderTimeline(board, el) {
    const layout = this.timelineLayout(board);
    const railW = this.railWidth(board);
    const calendarMode = board.mode === 'calendar';

    // 판 머리: 이름 [연 | 월 | 일] [오늘] … [⋯]   (직접 작성 ↔ 캘린더는 ⋯ 메뉴의 '시간 축')
    const head = div('board-head');
    head.append(this.boardNameElement(board, t('board.timeline'), 'tl-title'));
    if (calendarMode) {
      const today = document.createElement('button');
      today.type = 'button';
      today.className = 'board-text-btn';
      today.textContent = t('board.today');
      today.addEventListener('click', () => this.timelineGoToday(board));
      head.append(
        this.boardSegmented(['year', 'month', 'day'].map(s => [s, t(`tl.scale.${s}`)]), board.scale, (v) => this.setTimelineScale(board, v)),
        today,
      );
    }
    head.append(div('board-spacer'), this.boardMoreButton(board));

    // 걸이 막대
    const rail = div('tl-rail');
    place(rail, RAIL.left, RAIL.top, railW, RAIL.height);
    const extras = [];                                   // 막대 위 · 아래 글씨 (오늘 · 빨간 날 이름) · 오늘 점선
    if (calendarMode) this.fillCalendarRail(board, rail, extras);
    else this.fillDirectRail(board, rail, extras);
    ['left', 'right'].forEach(side => {
      const screw = div(`tl-screw ${side}`);
      rail.appendChild(screw);
    });
    this.bindRailPan(board, rail);

    // 걸이 · 줄 · (연동한 캘린더 쪽지)
    const hangs = div('tl-hangs');
    layout.items.forEach(item => {
      const hook = document.createElement('img');
      hook.className = 'tl-hook';
      hook.src = `${ICON_DIR}rail-hook.svg`;
      hook.alt = '';
      hook.draggable = false;
      place(hook, item.hookX - HOOK.width / 2, RAIL_BOTTOM - HOOK.overlap, HOOK.width, HOOK.height);
      const string = div('tl-string');
      place(string, item.hookX, STRING_TOP, undefined, item.y - STRING_TOP);
      hangs.append(hook, string);
      if (item.mirror) hangs.appendChild(this.buildNoteMirror(board, item));
    });

    el.append(head, hangs, rail, ...extras);
  },

  // 캘린더 모드 막대 — 칸마다 경계선 · 글씨, 주말 · 빨간 날 띠, 오늘
  fillCalendarRail(board, rail, extras) {
    const scale = board.scale;
    const view = this.timelineView(board);
    const railW = this.railWidth(board);
    const x0 = view.x;
    const x1 = view.x + railW;
    const en = getLanguage() === 'en';
    const tick = (x, strong) => {
      const line = div('tl-tick' + (strong ? ' year' : ''));
      line.style.left = `calc(${x}px * var(--z))`;
      rail.appendChild(line);
    };
    const label = (left, right, text) => {
      const visL = Math.max(0, left);
      const visR = Math.min(railW, right);
      if (visR - visL < 24) return;
      const lab = div('tl-label', text);
      lab.style.left = `calc(${(visL + visR) / 2}px * var(--z))`;
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

    // 주말 · 빨간 날 띠 — 막대 아래 절반, 하루 폭 (연 눈금에서는 표시하지 않음)
    if (scale !== 'year') {
      for (let d = dateAt(x0, scale); axisX(d, scale) < x1; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
        const dow = d.getDay();
        const name = this.holidayName(dateKey(d));
        if (!name && dow !== 0 && dow !== 6) continue;
        const left = axisX(d, scale) - x0;
        const width = dayWidth(d, scale);
        const strip = div(`tl-strip ${name ? 'holiday' : dow === 0 ? 'sun' : 'sat'}`);
        strip.style.left = `calc(${left}px * var(--z))`;
        strip.style.width = `calc(${width}px * var(--z))`;
        if (name) strip.title = name;                    // 월 눈금: 마우스를 올리면 이름
        rail.appendChild(strip);
        if (name && scale === 'day') {                   // 일 눈금: 막대 위에 이름
          const tag = div('tl-holiday-name', name);
          tag.style.left = `calc(${RAIL.left + left + width / 2}px * var(--z))`;
          extras.push(tag);
        }
      }
    }

    // 오늘 — 막대 안 빨간 선 + 아래로 점선, 막대 위 '오늘'
    const now = new Date();
    const tx = axisX(now, scale) + dayWidth(now, scale) / 2 - x0;
    if (tx >= 0 && tx <= railW) {
      const line = div('tl-today-line');
      line.style.left = `calc(${tx}px * var(--z))`;
      rail.appendChild(line);
      const drop = div('tl-today-drop');
      drop.style.left = `calc(${RAIL.left + tx}px * var(--z))`;
      drop.style.top = `calc(${RAIL_BOTTOM}px * var(--z))`;
      const tag = div('tl-today-label', t('board.today'));
      tag.style.left = `calc(${RAIL.left + tx}px * var(--z))`;
      extras.push(drop, tag);
    }
  },

  // 직접 작성 모드 막대 — 내가 만든 칸 (이름 두 번 누르면 고침 · 경계를 끌면 폭 · 우클릭으로 지우기)
  fillDirectRail(board, rail, extras) {
    let start = 0;
    board.segments.forEach((seg, i) => {
      const cell = div('tl-seg');
      cell.dataset.seg = seg.id;
      cell.style.left = `calc(${start}px * var(--z))`;
      cell.style.width = `calc(${seg.width}px * var(--z))`;
      const name = div('tl-seg-label', seg.name || t('tl.segmentUnnamed'));
      if (!seg.name) name.classList.add('empty');
      cell.appendChild(name);
      cell.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.renameTimelineSegment(board, seg);
      });
      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openSegmentMenu(board, seg, e.clientX, e.clientY);
      });
      rail.appendChild(cell);
      start += seg.width;
      if (i < board.segments.length - 1) {
        const line = div('tl-tick');
        line.style.left = `calc(${start}px * var(--z))`;
        rail.appendChild(line);
      }
      if (!board.pinned) {                               // 경계 손잡이 — 마우스를 올렸을 때만 보임
        const handle = div('tl-seg-handle');
        handle.style.left = `calc(${start}px * var(--z))`;
        handle.addEventListener('mousedown', (e) => this.startSegmentResize(board, i, e));
        rail.appendChild(handle);
      }
    });

    if (!board.pinned) {                                 // 막대 오른쪽 아래 '+ 칸 추가'
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'tl-add-seg';
      add.innerHTML = `<img src="${ICON_DIR}plus.svg" alt="" draggable="false"><span></span>`;
      add.querySelector('span').textContent = t('tl.addSegment');
      add.style.right = `calc(${RAIL.left}px * var(--z))`;
      add.style.top = `calc(${RAIL_BOTTOM + 6}px * var(--z))`;
      add.addEventListener('click', () => this.addTimelineSegment(board));
      extras.push(add);
    }
  },

  // 캘린더 모드: 막대를 잡고 좌우로 끌면 보이는 때가 옮겨감
  bindRailPan(board, rail) {
    rail.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || board.mode !== 'calendar') return;
      e.preventDefault();
      e.stopPropagation();
      let last = e.clientX;
      const move = (ev) => {
        const view = this.timelineView(board);
        view.x -= (ev.clientX - last) / this.zoom;
        last = ev.clientX;
        this.requestBoardsRefresh();
      };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  },

  // 연동한 캘린더 쪽지를 막대에 따라 그림 — 끌면 진짜 쪽지가 이어받아 움직이고, 두 번 누르면 캘린더에서 고침
  buildNoteMirror(board, item) {
    const note = item.note;
    const custom = note.color === 'custom' && isHexColor(note.customColor);
    const m = div(['sticky-note', 'note-mirror', 'on-board', 'stack-top',
      custom ? 'note-custom' : `note-${note.color}`,
      `type-${note.type}`, `size-${note.size}`, `font-${note.font}`, `ink-${note.ink}`,
      this.selection.has(note.id) ? 'selected' : '',
      custom && isDarkColor(note.customColor) ? 'note-dark' : '',
    ].filter(Boolean).join(' '));
    if (custom) {
      m.style.setProperty('--note-bg', note.customColor);
      m.style.setProperty('--fold-img', customFoldImage(note.customColor));
    }
    if (note.ink !== 'default') m.style.setProperty('--ink', INK_COLORS[note.ink]);
    place(m, item.x, item.y, item.width, item.height);
    m.innerHTML = `
      <div class="note-header">
        <img class="note-state-icon" src="${ICON_DIR}${this.noteIcon(note)}" alt="" draggable="false">
        <img class="note-more" src="${ICON_DIR}note-more.svg" alt="" draggable="false">
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

  // ---- 끌어서 걸기 ----
  // 막대 아래 걸 수 있는 자리 — 캘린더 모드는 하루 단위, 직접 작성 모드는 칸 안 아무 자리
  timelineDropAt(board, wx, wy) {
    const lx = wx - board.x;
    const ly = wy - board.y;
    const railW = this.railWidth(board);
    if (ly < RAIL.top || ly > this.timelineHeight(board) || lx < RAIL.left || lx > RAIL.left + railW) return null;
    const x = lx - RAIL.left;
    if (board.mode === 'calendar') {
      const view = this.timelineView(board);
      const d = dateAt(view.x + x, board.scale);
      const key = dateKey(d);
      return {
        key, date: key,
        hookX: RAIL.left + axisX(d, board.scale) + dayWidth(d, board.scale) / 2 - view.x,
        label: this.balloonDate(d),
      };
    }
    let start = 0;
    for (const seg of board.segments) {
      if (x <= start + seg.width) {
        const ratio = clamp((x - start) / seg.width, 0, 1);
        return { key: `${seg.id}:${ratio.toFixed(3)}`, segmentId: seg.id, ratio, hookX: RAIL.left + x, label: seg.name || t('tl.segmentUnnamed') };
      }
      start += seg.width;
    }
    return null;                                         // 칸이 없는 자리
  },

  balloonDate(d) {
    if (getLanguage() === 'en') return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return t('tl.balloon', { m: d.getMonth() + 1, d: d.getDate(), w: t(`wd.${d.getDay()}`) });
  },

  // 걸릴 자리 걸이가 파래지고 줄이 내려옴
  showTimelineDropHint(target) {
    const el = document.getElementById(target.board.id);
    if (!el) return;
    const hook = document.createElement('img');
    hook.className = 'tl-hook tl-hint target';
    hook.src = `${ICON_DIR}rail-hook.svg`;
    hook.alt = '';
    hook.draggable = false;
    place(hook, target.hookX - HOOK.width / 2, RAIL_BOTTOM - HOOK.overlap, HOOK.width, HOOK.height);
    const string = div('tl-string tl-hint target');
    place(string, target.hookX, STRING_TOP, undefined, FIRST_TIER - STRING_TOP);
    el.querySelector('.tl-hangs').append(hook, string);
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

  // 걸기 — 연동한 캘린더 판이 있으면 그 판에 붙여서 양쪽에 함께 보이게
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
  },

  // 막대 아래 빈 곳을 두 번 누르면 그 자리에 새 쪽지를 걸고 바로 제목 입력
  addNoteOnTimeline(board, target) {
    if (board.pinned || !target) return;
    this.record();
    const size = this.newNote().width;
    const note = this.newNote({ x: board.x + target.hookX - size / 2, y: board.y + FIRST_TIER });
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

  // ---- 판 메뉴 · 머리 고르개 ----
  setTimelineMode(board, mode) {
    if (board.mode === mode) return;
    this.record();
    board.mode = mode;
    board.updatedAt = Date.now();
    this.refreshAllBoards();
    this.scheduleSave();
  },

  // 눈금 단위 — 쪽지 날짜는 그대로, 보던 가운데 날짜가 가운데에 오도록
  setTimelineScale(board, scale) {
    if (board.scale === scale) return;
    const view = this.timelineView(board);
    const railW = this.railWidth(board);
    const center = dateAt(view.x + railW / 2, board.scale);
    this.record();
    board.scale = scale;
    board.updatedAt = Date.now();
    this.boardViews.set(board.id, { scale, x: axisX(center, scale) + dayWidth(center, scale) / 2 - railW / 2 });
    this.refreshAllBoards();
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
    this.boardViews.set(board.id, { scale: board.scale, x: axisX(d, board.scale) - this.railWidth(board) / 2 });
    this.refreshAllBoards();
  },

  // ---- 직접 작성 모드의 칸 ----
  // 칸이 막대보다 길어지면 판을 넓힘
  fitTimelineWidth(board) {
    const total = board.segments.reduce((sum, s) => sum + s.width, 0);
    if (total > this.railWidth(board)) board.width = total + RAIL.left * 2;
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
    const cell = el && el.querySelector(`.tl-seg[data-seg="${seg.id}"]`);
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
    const x0 = e.clientX;
    const move = (ev) => {
      const dx = (ev.clientX - x0) / this.zoom;
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

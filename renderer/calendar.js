// 캘린더 판 — 한 달판 (code/icons/아이콘_가이드.md 12-3, 시안_캘린더판.png) · 한 주 보기
//   쪽지를 칸 위로 끌어다 놓으면 그 날짜에 붙고 칸 크기(164 × 120)로 맞춰짐 → 판 밖으로 꺼내면 원래 크기로
//   한 칸에 여러 장이면 겹쳐 쌓이고, 그 날짜를 누르면 쪽지들이 날짜를 가운데 두고 둥글게 펼쳐짐 (다시 누르면 접힘)
//   한 주 보기 (판 메뉴 › 보기): 7일을 한 줄로 (칸 크기는 한 달판과 같음). 여러 장이면 똑같이 겹쳐 쌓이고,
//     그 날짜를 누르면 맨 위 쪽지는 제자리에 두고 나머지가 칸 아래로 줄지어 펼쳐짐 (다시 누르거나 밖을 누르면 접힘)
//   빨간 날은 holidays.js (구글 캘린더 공휴일). 붙이기 · 떼기 공통 부분은 board-notes.js
//   보고 있는 달 · 주는 저장하지 않음 (앱을 켜면 오늘이 든 달 · 주, 날짜가 바뀌면 따라감). 보기(한 달 · 한 주)는 저장
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { ICON_DIR } from './constants.js';
import { t, getLanguage } from './i18n.js';
import { BOARD_HEAD, BOARD_PAD, BOARD_DAYS_ROW } from './boards.js';

const CAL_WIDTH = 1288;           // 칸 180 × 7 + 여백
const CAL_HEIGHT = 848;           // 5줄일 때 (6줄이면 한 줄만큼 더)
const MIN_CELL = { width: 100, height: 90 };
const SLOT = { left: 8, right: 8, top: 23, bottom: 5 };   // 칸 속 쪽지 자리 (180 × 148 칸 → 164 × 120)
const MAX_SHOWN_STACK = 3;        // 한 칸에 겹쳐 보이는 장수 (나머지는 맨 아래에 숨음)
// 겹친 뒤 쪽지 — 살짝 돌리고 옆 · 아래로 비켜 놓아 가장자리가 보이게 (위에서 두 번째 · 세 번째)
//   위로는 비키지 않음: 칸 위쪽의 날짜 · 빨간 날 이름을 가리지 않게
const STACK_BACK = [{ rot: -6, dx: -7, dy: 6 }, { rot: 4.5, dx: 7, dy: 7 }];
const FAN_MIN_RADIUS = 120;       // 펼칠 때 날짜 가운데에서 쪽지 가운데까지 (가장 짧을 때)
const FAN_ANIM_MS = 360;          // 펼치기 · 접기 뒤 표시 정리 (styles/boards.css .fan-anim 기울기 0.28s + 여유)
const FAN_MOVE_MS = 280;          // 펼치기 · 접기 자리 옮김 — 캔버스 좌표에서 움직여서 그사이 캔버스를 옮겨도 바로 따라감
const WEEK_GAP = 8;               // 한 주 보기: 아래로 펼친 쪽지 사이
// 펼친 채로 눌러도 접히지 않는 곳 — 펼친 쪽지 · 메뉴 · 쪽지 스타일 · 설정 창 · 찾기 · 미니맵 (그 캘린더 판은 따로)
const FAN_KEEP = '.sticky-note.fanned, #context-menu, #context-submenu, #desktop-menu, #add-menu, #template-menu, '
  + '#board-add-menu, #code-lang-menu, #style-panel, #settings-dropdown, .settings-overlay, #search-box, #minimap';

const pad2 = (n) => String(n).padStart(2, '0');
export const dateKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const parseKey = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const weekFirstDay = (d, weekStart) => addDays(d, -((d.getDay() - weekStart + 7) % 7));   // d 가 든 주의 첫날
const sameMonth = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

export const calendarMethods = {
  // 새 캘린더 판 — 보기 · 주 시작 요일은 설정 › 판
  newCalendarData() {
    const s = this.settings || {};
    return { width: CAL_WIDTH, height: CAL_HEIGHT, weekStart: s.weekStart === 1 ? 1 : 0, view: s.calendarView === 'week' ? 'week' : 'month' };
  },

  normalizeCalendar(board) {
    const min = this.calendarMinSize();
    if (typeof board.width !== 'number' || board.width < min.width) board.width = CAL_WIDTH;
    if (typeof board.height !== 'number' || board.height < min.height) board.height = CAL_HEIGHT;
    board.weekStart = board.weekStart === 1 ? 1 : 0;
    board.view = board.view === 'week' ? 'week' : 'month';
    return board;
  },

  calendarMinSize() {
    return {
      width: BOARD_PAD * 2 + MIN_CELL.width * 7,
      height: BOARD_HEAD + BOARD_DAYS_ROW + BOARD_PAD + MIN_CELL.height * 5,
    };
  },

  todayKey() {
    return dateKey(new Date());
  },

  // 보고 있는 때 — 한 달 보기는 year · month, 한 주 보기는 focus(그 주의 아무 날)가 든 주
  //   한 달 보기에서도 focus 는 그 달 안의 날 (오늘이 든 달이면 오늘) → 한 주 보기로 바꾸면 그 날이 든 주
  calendarView(board) {
    let view = this.boardViews.get(board.id);
    if (!view) {
      view = this.calendarViewAt(new Date());
      this.boardViews.set(board.id, view);
    }
    return view;
  },

  calendarViewAt(date) {
    return { year: date.getFullYear(), month: date.getMonth(), focus: dateKey(date) };
  },

  // date 가 든 달(한 달 보기) · 주(한 주 보기)를 펼침
  setCalendarView(board, date) {
    this.boardViews.set(board.id, this.calendarViewAt(date));
    if (this.calendarFan && this.calendarFan.boardId === board.id) this.calendarFan = null;
    this.refreshAllBoards();
  },

  // 칸 배치 — 한 달: 7칸 × 5줄 (6주에 걸친 달이면 6줄) · 한 주: 7칸 × 1줄 (쪽지가 가장 많은 날만큼 길어짐)
  calendarGrid(board) {
    const view = this.calendarView(board);
    const week = board.view === 'week';
    const first = weekFirstDay(week ? parseKey(view.focus) : new Date(view.year, view.month, 1), board.weekStart);
    const sig = [board.view, view.year, view.month, dateKey(first), board.weekStart, board.width, board.height].join('|');
    const cached = this.calendarCache.get(board.id);
    if (cached && cached.sig === sig) return cached.grid;

    const cellW = (board.width - BOARD_PAD * 2) / 7;
    const monthCellH = (board.height - BOARD_HEAD - BOARD_DAYS_ROW - BOARD_PAD) / 5;
    const noteH = monthCellH - SLOT.top - SLOT.bottom;          // 칸 속 쪽지 높이 — 한 주 보기도 같은 크기
    let rows;
    const cellH = monthCellH;
    if (week) {
      rows = 1;
    } else {
      const lead = (new Date(view.year, view.month, 1).getDay() - board.weekStart + 7) % 7;
      const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
      rows = Math.max(5, Math.ceil((lead + daysInMonth) / 7));
    }
    const dates = [];
    for (let i = 0; i < rows * 7; i++) dates.push(addDays(first, i));
    const keys = dates.map(dateKey);
    const grid = {
      week, year: view.year, month: view.month, rows, cellW, cellH, noteH, dates, keys,
      index: new Map(keys.map((k, i) => [k, i])),
      height: BOARD_HEAD + BOARD_DAYS_ROW + rows * cellH + BOARD_PAD,
    };
    this.calendarCache.set(board.id, { sig, grid });
    return grid;
  },

  // i 번째 칸 속 (맨 위) 쪽지 자리 (월드 좌표)
  calendarSlot(board, grid, i) {
    const x = board.x + BOARD_PAD + (i % 7) * grid.cellW;
    const y = board.y + BOARD_HEAD + BOARD_DAYS_ROW + Math.floor(i / 7) * grid.cellH;
    return {
      x: x + SLOT.left,
      y: y + SLOT.top,
      width: grid.cellW - SLOT.left - SLOT.right,
      height: grid.noteH,
    };
  },

  monthTitle(year, month) {
    if (getLanguage() === 'en') return new Date(year, month, 1).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    return t('board.monthTitle', { y: year, m: month + 1 });
  },

  // 한 주 보기 제목 — 2026년 9월 21일 – 27일 · 2026년 9월 28일 – 10월 4일 · 2026년 12월 27일 – 2027년 1월 2일
  weekTitle(first, last) {
    const sameYear = first.getFullYear() === last.getFullYear();
    const sameMon = sameYear && first.getMonth() === last.getMonth();
    if (getLanguage() === 'en') {
      const md = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (!sameYear) return `${md(first)}, ${first.getFullYear()} – ${md(last)}, ${last.getFullYear()}`;
      return `${md(first)} – ${sameMon ? last.getDate() : md(last)}, ${last.getFullYear()}`;
    }
    const vars = { y: last.getFullYear(), m: last.getMonth() + 1, d: last.getDate() };
    const end = !sameYear ? t('board.weekEndYear', vars) : !sameMon ? t('board.weekEndMonth', vars) : t('board.weekEndDay', vars);
    return t('board.weekTitle', { y: first.getFullYear(), m: first.getMonth() + 1, d: first.getDate(), end });
  },

  renderCalendar(board, el) {
    const grid = this.calendarGrid(board);
    const week = grid.week;
    const today = this.todayKey();
    const fan = this.calendarFan && this.calendarFan.boardId === board.id ? this.calendarFan.date : null;
    el.classList.toggle('cal-week', week);

    // 판 머리: ‹ 2026년 9월 › [오늘] 이름 … [⋯]   (한 주 보기: ‹ 2026년 9월 21일 – 27일 ›)
    const head = document.createElement('div');
    head.className = 'board-head';
    const title = document.createElement('div');
    title.className = 'cal-month';
    title.textContent = week ? this.weekTitle(grid.dates[0], grid.dates[6]) : this.monthTitle(grid.year, grid.month);
    const todayBtn = document.createElement('button');
    todayBtn.type = 'button';
    todayBtn.className = 'board-text-btn';
    todayBtn.textContent = t('board.today');
    todayBtn.addEventListener('click', () => this.calendarGoToday(board));
    const spacer = document.createElement('div');
    spacer.className = 'board-spacer';
    head.append(
      this.boardButton('arrow-left.svg', t(week ? 'board.prevWeek' : 'board.prevMonth'), () => this.shiftCalendar(board, -1)),
      title,
      this.boardButton('arrow-right.svg', t(week ? 'board.nextWeek' : 'board.nextMonth'), () => this.shiftCalendar(board, 1)),
      todayBtn,
      this.boardNameElement(board, ''),
      spacer,
      this.boardMoreButton(board),
    );

    // 요일 줄
    const weekdays = document.createElement('div');
    weekdays.className = 'cal-weekdays';
    for (let c = 0; c < 7; c++) {
      const dow = (board.weekStart + c) % 7;
      const cell = document.createElement('div');
      cell.className = 'cal-wd' + (dow === 0 ? ' sun' : dow === 6 ? ' sat' : '');
      cell.textContent = t(`wd.${dow}`);
      weekdays.appendChild(cell);
    }

    // 날짜 칸
    const counts = new Map();
    this.notes.forEach(n => { if (n.boardId === board.id && n.date) counts.set(n.date, (counts.get(n.date) || 0) + 1); });
    const cells = document.createElement('div');
    cells.className = 'cal-grid';
    cells.style.gridTemplateRows = `repeat(${grid.rows}, 1fr)`;
    grid.dates.forEach((date, i) => {
      const key = grid.keys[i];
      const dow = date.getDay();
      const holiday = this.holidayName(key);
      const stacked = (counts.get(key) || 0) > 1;
      const cell = document.createElement('div');
      cell.className = ['cal-cell',
        !week && date.getMonth() !== grid.month ? 'other' : '',
        dow === 0 ? 'sun' : '',
        dow === 6 ? 'sat' : '',
        holiday ? 'holiday' : '',
        key === today ? 'today' : '',
        stacked ? 'stacked' : '',
        key === fan ? 'fan-open' : '',
      ].filter(Boolean).join(' ');
      cell.dataset.date = key;

      // 날짜 + 빨간 날 이름
      const top = document.createElement('div');
      top.className = 'cal-head';
      const num = document.createElement('span');
      num.className = 'cal-date';
      num.textContent = date.getDate();
      top.appendChild(num);
      if (holiday) {
        const name = document.createElement('span');
        name.className = 'cal-holiday';
        name.textContent = holiday;
        name.title = holiday;
        top.appendChild(name);
      }
      cell.appendChild(top);

      if (stacked) {                                         // 여러 장 쌓임: 장수 배지 (누르면 펼침)
        const badge = document.createElement('span');
        badge.className = 'cal-count';
        badge.textContent = counts.get(key);
        badge.title = t('fan.hint');
        cell.appendChild(badge);
      }
      if (!board.pinned) {                                   // 마우스를 올린 칸에 + (그 날짜에 새 쪽지)
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'cal-add';
        add.title = t('board.addNote');
        add.innerHTML = `<img src="${ICON_DIR}plus.svg" alt="" draggable="false">`;
        add.addEventListener('click', () => this.addNoteOnDate(board, key));
        cell.appendChild(add);
      }
      // 날짜를 누르면: 겹친 칸이면 펼치기 · 접기, 아니면 펼친 것을 접음
      cell.addEventListener('click', (e) => {
        if (e.target.closest('button') || this.justPannedBoard) return;
        if (stacked) this.toggleCalendarFan(board, key);
        else this.collapseCalendarFan();
      });
      cells.appendChild(cell);
    });

    el.append(head, weekdays, cells);
  },

  // ‹ › — 한 달 보기는 한 달씩, 한 주 보기는 한 주씩
  shiftCalendar(board, delta) {
    const view = this.calendarView(board);
    if (board.view === 'week') {
      this.setCalendarView(board, addDays(parseKey(view.focus), 7 * delta));
      return;
    }
    const first = new Date(view.year, view.month + delta, 1);
    const now = new Date();
    this.setCalendarView(board, sameMonth(first, now) ? now : first);   // 이번 달로 돌아오면 오늘을 기준으로
  },

  calendarGoToday(board) {
    this.setCalendarView(board, new Date());
  },

  setCalendarWeekStart(board, day) {
    if (board.weekStart === day) return;
    this.record();
    board.weekStart = day;
    board.updatedAt = Date.now();
    this.refreshAllBoards();
    this.scheduleSave();
  },

  // 보기 바꾸기 — 한 달 ↔ 한 주. 보던 때를 이어서 (한 달 → 한 주: 오늘 · 그 달 1일이 든 주, 한 주 → 한 달: 그 주의 달)
  setCalendarViewMode(board, mode) {
    if (board.view === mode) return;
    this.record();
    board.view = mode;
    board.updatedAt = Date.now();
    if (this.calendarFan && this.calendarFan.boardId === board.id) this.calendarFan = null;
    this.refreshAllBoards();
    this.scheduleSave();
  },

  // 날짜가 바뀌었을 때: 어제가 든 달 · 주를 보고 있던 캘린더는 오늘이 든 달 · 주로 넘김
  followTodayOnCalendars(beforeKey) {
    const before = parseKey(beforeKey);
    const now = new Date();
    this.boards.forEach(board => {
      if (board.kind !== 'calendar') return;
      const view = this.boardViews.get(board.id);
      if (!view) return;                                    // 아직 그리지 않은 판은 그릴 때 오늘로
      const following = board.view === 'week'
        ? dateKey(weekFirstDay(parseKey(view.focus), board.weekStart)) === dateKey(weekFirstDay(before, board.weekStart))
        : view.year === before.getFullYear() && view.month === before.getMonth();
      if (following) this.boardViews.set(board.id, this.calendarViewAt(now));
    });
  },

  // 칸의 + : 그 날짜에 새 쪽지 (바로 제목 입력)
  addNoteOnDate(board, date) {
    if (board.pinned) return;
    const grid = this.calendarGrid(board);
    const i = grid.index.get(date);
    if (i === undefined) return;
    this.collapseCalendarFan();
    const slot = this.calendarSlot(board, grid, i);
    this.addNoteAt({ x: slot.x, y: slot.y }, { boardId: board.id, date, boardAt: Date.now() }, { edit: true });
    this.refreshAllBoards();
  },

  // 한 날짜에 붙은 쪽지 (붙인 순서 — 마지막이 맨 위)
  dateStack(boardId, date) {
    return this.notes
      .filter(n => n.boardId === boardId && n.date === date)
      .sort((a, b) => (a.boardAt || 0) - (b.boardAt || 0));
  },

  // 칸에 붙은 쪽지의 자리 — 겹쳐 쌓였거나, 펼친 날짜면 펼친 자리 (한 달: 둥글게, 한 주: 칸 아래로 줄지어)
  calendarNoteSlot(board, note) {
    if (!note.date) return null;
    const grid = this.calendarGrid(board);
    const i = grid.index.get(note.date);
    if (i === undefined) return { board, offView: true };
    const stack = this.dateStack(board.id, note.date);
    const pos = stack.indexOf(note);
    const slot = this.calendarSlot(board, grid, i);
    const fromTop = stack.length - 1 - pos;
    const fan = this.calendarFan;
    if (fan && fan.boardId === board.id && fan.date === note.date && stack.length > 1) {
      if (grid.week) return { ...slot, y: slot.y + fromTop * (slot.height + WEEK_GAP), board, top: true, fanned: true };
      const spot = this.calendarFanPlacement(board, grid, i, stack, slot).spots[pos];
      return { ...slot, x: spot.cx - slot.width / 2, y: spot.cy - slot.height / 2, board, top: true, fanned: true };
    }
    const back = STACK_BACK[fromTop - 1];
    return {
      ...slot, board,
      top: fromTop === 0,
      buried: fromTop >= MAX_SHOWN_STACK,
      rot: back ? back.rot : 0,
      dx: back ? back.dx : 0,
      dy: back ? back.dy : 0,
    };
  },

  // 끄는 동안: 마우스 아래 날짜 칸
  calendarDropAt(board, wx, wy) {
    const grid = this.calendarGrid(board);
    const gx = wx - board.x - BOARD_PAD;
    const gy = wy - board.y - BOARD_HEAD - BOARD_DAYS_ROW;
    if (gx < 0 || gy < 0 || gx >= grid.cellW * 7 || gy >= grid.cellH * grid.rows) return null;
    const date = grid.keys[Math.floor(gy / grid.cellH) * 7 + Math.floor(gx / grid.cellW)];
    return { key: date, date };
  },

  showCalendarDropHint(target) {
    const cell = document.querySelector(`#${CSS.escape(target.board.id)} .cal-cell[data-date="${target.date}"]`);
    if (cell) cell.classList.add('drop-target');
  },

  // ---- 겹친 쪽지 펼치기 (한 달 보기: 둥글게, 한 주 보기: 칸 아래로) ----
  // 날짜 가운데를 두고 둘레에 고르게 — 가장 최근 쪽지가 오른쪽(위)부터 시계 방향으로
  calendarFanPlacement(board, grid, i, stack, slot) {
    const n = stack.length;
    const cx = board.x + BOARD_PAD + ((i % 7) + 0.5) * grid.cellW;
    const cy = board.y + BOARD_HEAD + BOARD_DAYS_ROW + (Math.floor(i / 7) + 0.5) * grid.cellH;
    const r = Math.max(FAN_MIN_RADIUS, (slot.width + 24) / (2 * Math.sin(Math.PI / n)));
    const spots = stack.map((note, pos) => {
      const k = n - 1 - pos;
      const angle = (-90 + 180 / n + (k * 360) / n) * (Math.PI / 180);
      return { note, cx: cx + r * Math.cos(angle), cy: cy + r * Math.sin(angle) };
    });
    return { cx, cy, r, spots };
  },

  toggleCalendarFan(board, date) {
    const before = this.calendarFan;
    if ((before && before.boardId === board.id && before.date === date)
      || this.dateStack(board.id, date).length < 2) {
      this.collapseCalendarFan();
      return;
    }
    const next = { boardId: board.id, date };
    const from = this.fanNoteRects([before, next]);
    this.calendarFan = next;
    this.animateFan([before, next], from);
  },

  collapseCalendarFan() {
    const before = this.calendarFan;
    if (!before) return;
    const from = this.fanNoteRects([before]);
    this.calendarFan = null;
    this.animateFan([before], from);
  },

  // 펼치기 · 접기 전 자리 (움직이는 중이면 지금 자리) — 거기서부터 새 자리로
  fanNoteRects(fans) {
    const rects = new Map();
    this.notes.forEach(note => {
      if (fans.some(f => f && note.boardId === f.boardId && note.date === f.date)) rects.set(note.id, { ...this.noteRect(note) });
    });
    return rects;
  },

  // 펼친 채로 그 캘린더 밖(다른 쪽지 · 사진 · 파일 · 다른 판 · 빈 바탕)을 누르면 접힘 — 문서 전체에서 먼저 받음 (app.js)
  //   그 캘린더 안은 칸 누르기가 알아서 접거나 다른 날짜를 펼침
  collapseFanOnOutside(e) {
    const fan = this.calendarFan;
    if (!fan || !(e.target instanceof Element)) return;
    if (e.target.closest(`#${CSS.escape(fan.boardId)}, ${FAN_KEEP}`)) return;
    this.collapseCalendarFan();
  },

  // 펼치고 접을 때 쪽지가 제자리까지 미끄러져 감 — 캔버스 좌표에서 한 장면씩 옮김 (board-notes.js noteRect 가 this.fanAnims 를 봄)
  //   그래서 그사이 캔버스를 끌어 옮겨도 쪽지가 늦지 않고 바로 따라감 (화면 좌표로 옮기면 캔버스 이동까지 천천히 따라감)
  //   접히는 동안은 맨 아래로 숨을 쪽지도 보이다가 다 들어간 뒤에 숨음 (board-notes.js applyBoardState)
  animateFan(fans, from = new Map()) {
    const reduce = reducedMotion();
    const moving = this.notes.filter(note => fans.some(f => f && note.boardId === f.boardId && note.date === f.date));
    cancelAnimationFrame(this.fanFrame);
    this.fanAnims = new Map();
    const targets = new Map(moving.map(note => [note.id, { ...this.noteRect(note) }]));
    moving.forEach(note => {
      const el = document.getElementById(note.id);
      if (!el) return;
      if (!reduce) {
        el.classList.add('fan-anim');
        if (from.has(note.id)) this.fanAnims.set(note.id, from.get(note.id));
      }
      this.updateNotePosition(el, note);
    });
    if (!reduce && this.fanAnims.size) {
      const t0 = performance.now();
      const ease = (p) => 1 - Math.pow(1 - p, 3);
      const step = (now) => {
        const p = Math.min(1, (now - t0) / FAN_MOVE_MS);
        const e = ease(p);
        moving.forEach(note => {
          const a = from.get(note.id);
          const b = targets.get(note.id);
          if (p < 1 && a && b) {
            this.fanAnims.set(note.id, {
              x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e,
              width: a.width + (b.width - a.width) * e, height: a.height + (b.height - a.height) * e,
            });
          } else {
            this.fanAnims.delete(note.id);
          }
          const el = document.getElementById(note.id);
          if (el) this.updateNotePosition(el, note);
        });
        if (p < 1) this.fanFrame = requestAnimationFrame(step);
      };
      this.fanFrame = requestAnimationFrame(step);
    }
    document.querySelectorAll('.cal-cell.fan-open').forEach(c => c.classList.remove('fan-open'));
    const fan = this.calendarFan;
    if (fan) {
      const cell = document.querySelector(`#${CSS.escape(fan.boardId)} .cal-cell[data-date="${fan.date}"]`);
      if (cell) cell.classList.add('fan-open');
    }
    this.updateFanOverlay();
    clearTimeout(this.fanAnimTimer);
    this.fanAnimTimer = setTimeout(() => {
      this.notes.forEach(note => {
        const el = document.getElementById(note.id);
        if (!el || !el.classList.contains('fan-anim')) return;
        el.classList.remove('fan-anim');
        this.applyBoardState(el, note);
      });
    }, FAN_ANIM_MS);
  },

  // 펼친 날짜 뒤에 둥근 바탕 + 가운데 날짜에서 쪽지까지 이은 선 (화면 이동 · 확대 때마다 다시 맞춤)
  //   한 주 보기는 칸에서 아래로 내려오는 긴 바탕
  updateFanOverlay() {
    let overlay = document.getElementById('fan-overlay');
    const fan = this.calendarFan;
    const board = fan && this.findBoard(fan.boardId);
    const grid = board && board.kind === 'calendar' ? this.calendarGrid(board) : null;
    const i = grid ? grid.index.get(fan.date) : undefined;
    const stack = i !== undefined ? this.dateStack(board.id, fan.date) : [];
    if (stack.length < 2) {
      if (fan) {
        this.calendarFan = null;
        document.querySelectorAll('.cal-cell.fan-open').forEach(c => c.classList.remove('fan-open'));
      }
      if (overlay) this.fadeOutFanOverlay(overlay);
      return;
    }
    const slot = this.calendarSlot(board, grid, i);
    const z = this.zoom;
    if (grid.week) {
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'fan-overlay';
        overlay.className = 'fan-overlay';
        this.uiLayer.appendChild(overlay);
      }
      const x = slot.x - SLOT.left + 3;                       // 날짜 줄은 가리지 않게 첫 쪽지 바로 위부터
      const y = slot.y - 6;
      const w = grid.cellW - 6;
      const h = stack.length * slot.height + (stack.length - 1) * WEEK_GAP + 14;
      overlay.style.left = `${x * z + this.panX}px`;
      overlay.style.top = `${y * z + this.panY}px`;
      overlay.style.width = `${w * z}px`;
      overlay.style.height = `${h * z}px`;
      overlay.innerHTML = `<svg width="${w * z}" height="${h * z}" viewBox="0 0 ${w * z} ${h * z}">
        <rect class="fan-halo" x="0" y="0" width="${w * z}" height="${h * z}" rx="${12 * z}"/></svg>`;
      return;
    }
    const place = this.calendarFanPlacement(board, grid, i, stack, slot);
    const reach = place.r + Math.hypot(slot.width, slot.height) / 2 + 14;    // 둥근 바탕 반지름
    const c = reach * z;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'fan-overlay';
      overlay.className = 'fan-overlay';
      this.uiLayer.appendChild(overlay);
    }
    overlay.style.left = `${(place.cx - reach) * z + this.panX}px`;
    overlay.style.top = `${(place.cy - reach) * z + this.panY}px`;
    overlay.style.width = overlay.style.height = `${c * 2}px`;
    const spokes = place.spots.map(s =>
      `<line x1="${c}" y1="${c}" x2="${c + (s.cx - place.cx) * z}" y2="${c + (s.cy - place.cy) * z}"/>`).join('');
    overlay.innerHTML = `
      <svg width="${c * 2}" height="${c * 2}" viewBox="0 0 ${c * 2} ${c * 2}">
        <circle class="fan-halo" cx="${c}" cy="${c}" r="${c}"/>
        <g class="fan-spokes" stroke-width="${1.5 * z}" stroke-dasharray="${4 * z} ${4 * z}">${spokes}</g>
        <circle class="fan-hub" cx="${c}" cy="${c}" r="${15 * z}"/>
        <text class="fan-hub-text" x="${c}" y="${c}" font-size="${12.5 * z}">${grid.dates[i].getDate()}</text>
      </svg>`;
  },

  // 접을 때 둥근 바탕은 서서히 사라짐 (그사이 다시 펼치면 새 바탕을 따로 만듦)
  fadeOutFanOverlay(overlay) {
    overlay.removeAttribute('id');
    if (reducedMotion()) {
      overlay.remove();
      return;
    }
    overlay.classList.add('closing');
    setTimeout(() => overlay.remove(), 220);
  },
};

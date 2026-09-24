// 판 — 캔버스 위에 놓이는 큰 틀: 캘린더(calendar.js) · 연대표(timeline.js) (code/icons/아이콘_가이드.md 12장)
//   · 파일 묶음(groups.js — 파일 아이콘을 담는 큰 포스트잇)
//   판은 CSS 로 그리고, 자리·크기는 쪽지처럼 zoom 1 기준 값에 배율을 곱해 씀 (styles/boards.css · groups.css)
//   판 머리를 잡고 끌면 판이 옮겨지고(붙은 쪽지 · 담긴 파일도 함께), 칸 · 빈 곳을 잡고 끌면 화면이 움직임
//   판은 쪽지·사진·파일보다 아래에 깔림 (판끼리는 나중에 만든 판이 위). 쪽지 붙이기 · 떼기는 board-notes.js
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { ICON_DIR } from './constants.js';
import { t } from './i18n.js';

export const BOARD_HEAD = 60;        // 판 머리 높이
export const BOARD_PAD = 14;         // 판 안쪽 좌우 · 아래 여백
export const BOARD_DAYS_ROW = 34;    // 요일 줄 높이
export const BOARD_KINDS = ['calendar', 'timeline', 'group'];

export const boardMethods = {
  newBoard(kind, extra = {}) {
    const board = {
      id: this.newId('board'),
      kind,                          // 'calendar' | 'timeline' | 'group'
      x: 0, y: 0,
      title: '',
      pinned: false,                 // 판 잠금
      updatedAt: Date.now(),
    };
    Object.assign(board, kind === 'timeline' ? this.newTimelineData()
      : kind === 'group' ? this.newGroupData() : this.newCalendarData());
    return Object.assign(board, extra);
  },

  // 저장된 판을 지금 형식으로 (모르는 종류면 null → 버림)
  normalizeBoard(raw) {
    if (!raw || !BOARD_KINDS.includes(raw.kind)) return null;
    const board = { ...raw };
    if (typeof board.id !== 'string' || !board.id) board.id = this.newId('board');
    if (typeof board.x !== 'number') board.x = 0;
    if (typeof board.y !== 'number') board.y = 0;
    if (typeof board.title !== 'string') board.title = '';
    board.pinned = !!board.pinned;
    if (typeof board.updatedAt !== 'number') board.updatedAt = Date.now();
    if (board.kind === 'group') return this.normalizeGroup(board);
    return board.kind === 'timeline' ? this.normalizeTimeline(board) : this.normalizeCalendar(board);
  },

  // 바탕 우클릭 › 판 추가 — 우클릭한 자리에
  addBoardAt(at, kind) {
    this.record();
    const board = this.newBoard(kind, { x: at.x, y: at.y });
    this.boards.push(board);
    this.createBoardElement(board);
    this.scheduleSave();
    return board;
  },

  findBoard(id) {
    return this.boards.find(b => b.id === id) || null;
  },

  // 화면에 차지하는 크기 — 캘린더는 6주에 걸친 달이면 한 줄만큼, 연대표는 걸린 쪽지 층만큼,
  //   파일 묶음은 담긴 파일 줄 수만큼 길어짐
  boardSize(board) {
    if (board.kind === 'timeline') return { width: board.width, height: this.timelineHeight(board) };
    if (board.kind === 'group') return this.groupSize(board);
    return { width: board.width, height: this.calendarGrid(board).height };
  },

  createBoardElement(board) {
    const el = document.createElement('div');
    el.className = `board board-${board.kind}`;
    el.id = board.id;

    el.addEventListener('mousedown', (e) => {
      if (e.target.closest('input, textarea, button')) return;       // 버튼 · 글자칸은 각자 처리
      const group = board.kind === 'group';                         // 파일 묶음: 누르면 선택 (쪽지처럼, Ctrl · Shift 는 여러 개)
      const canDrag = group ? this.pressSelect(e, board.id, !board.pinned) : true;
      if (e.button !== 0) return;
      if (e.target.closest('.board-resize')) {
        if (board.pinned) return;
        e.preventDefault();
        e.stopPropagation();
        this.startItemResize(e, 'board', board);
        return;
      }
      if (group) {                                                   // 파일 묶음은 어디를 잡아도 옮겨짐
        e.preventDefault();
        if (canDrag && !board.pinned) this.startItemDrag(e, 'board', board);
        return;
      }
      if (e.target.closest('.board-head') && !board.pinned) {
        e.preventDefault();
        this.startItemDrag(e, 'board', board);
        return;
      }
      this.startBoardPan(e);                                         // 칸 · 빈 곳 · 잠긴 판: 화면 이동
    });

    // 연대표: 막대 아래 빈 곳을 두 번 누르면 그 자리에 새 쪽지
    el.addEventListener('dblclick', (e) => {
      if (board.kind !== 'timeline' || board.pinned) return;
      if (e.target.closest('.board-head, .tl-rail, .note-mirror, input, button')) return;
      const wx = (e.clientX - this.panX) / this.zoom;
      const wy = (e.clientY - this.panY) / this.zoom;
      this.addNoteOnTimeline(board, this.timelineDropAt(board, wx, wy));
    });

    el.addEventListener('contextmenu', (e) => {
      if (e.target.closest('input, textarea')) return;
      e.preventDefault();
      e.stopPropagation();
      if (board.kind === 'group' && this.multiSelected(board.id)) this.openSelectionMenu(e.clientX, e.clientY);
      else this.openBoardMenu(board, e.clientX, e.clientY);
    });

    // 판은 쪽지 · 사진 · 파일보다 아래, 판끼리는 나중에 만든 판이 위 (다른 판 바로 뒤에 끼움)
    const boardEls = this.uiLayer.querySelectorAll(':scope > .board');
    if (boardEls.length) boardEls[boardEls.length - 1].after(el);
    else this.uiLayer.prepend(el);
    this.renderBoard(board, el);
    this.ensureBoardClock();
  },

  renderBoard(board, el = document.getElementById(board.id)) {
    if (!el) return;
    el.innerHTML = '';
    el.classList.toggle('pinned', !!board.pinned);
    el.classList.toggle('tl-direct', board.kind === 'timeline' && board.mode === 'direct');
    if (board.kind === 'timeline') this.renderTimeline(board, el);
    else if (board.kind === 'group') this.renderGroup(board, el);
    else this.renderCalendar(board, el);
    const grip = document.createElement('div');
    grip.className = 'board-resize';
    el.appendChild(grip);
    this.updateBoardPosition(el, board);
  },

  updateBoardPosition(el, board) {
    const size = this.boardSize(board);
    el.style.left = `${board.x * this.zoom + this.panX}px`;
    el.style.top = `${board.y * this.zoom + this.panY}px`;
    el.style.width = `${size.width * this.zoom}px`;
    el.style.height = `${size.height * this.zoom}px`;
    el.style.setProperty('--zoom', this.zoom);
    this.requestLinks();                            // 파일 묶음에 이은 선도 따라감 (links.js)
  },

  // ---- 판 머리 부품 ----
  boardButton(icon, title, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'board-btn';
    btn.title = title;
    btn.innerHTML = `<img src="${ICON_DIR}${icon}" alt="" draggable="false">`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick(btn);
    });
    return btn;
  },

  // 판 머리 오른쪽 끝 … — 판 우클릭 메뉴를 그 자리에서
  boardMoreButton(board) {
    return this.boardButton('board-more.svg', t('board.more'), (btn) => {
      const r = btn.getBoundingClientRect();
      this.openBoardMenu(board, r.left, r.bottom + 4);
    });
  },

  // 판 이름 (두 번 누르면 이름 바꾸기). 이름이 없으면 fallback 을 보여 줌
  boardNameElement(board, fallback, extraClass = '') {
    const name = document.createElement('div');
    name.className = 'board-name' + (extraClass ? ` ${extraClass}` : '');
    name.textContent = board.title || fallback;
    name.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.renameBoard(board);
    });
    return name;
  },

  // 고르개 (세그먼트) — 연대표 눈금 [연 | 월 | 일] (가이드 12-2)
  boardSegmented(entries, current, onPick) {
    const wrap = document.createElement('div');
    wrap.className = 'board-seg';
    entries.forEach(([value, label]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = value === current ? 'current' : '';
      btn.textContent = label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onPick(value);
      });
      wrap.appendChild(btn);
    });
    return wrap;
  },

  // 판 크기 조절 — 캘린더는 칸이 함께 늘어나고, 연대표는 폭만 (높이는 걸린 쪽지 층 수로 정해짐)
  resizeBoard(board, width, height) {
    if (board.kind === 'group') {                                   // 파일 묶음: 폭이 바뀌면 칸이 다시 늘어섬
      const min = this.groupMinSize();
      board.width = Math.max(min.width, width);
      board.height = Math.max(min.height, height);
      this.updateGroupFiles(board);
      return;
    }
    const min = board.kind === 'timeline' ? this.timelineMinSize() : this.calendarMinSize();
    board.width = Math.max(min.width, width);
    if (board.kind === 'timeline') {
      this.requestBoardsRefresh();
      return;
    }
    board.height = Math.max(min.height, height);
    const el = document.getElementById(board.id);
    if (el) this.updateBoardPosition(el, board);
    this.updateBoardNotes(board);
  },

  // 판의 칸 · 빈 곳을 끌면 빈 바탕을 끈 것처럼 화면이 움직임
  startBoardPan(e) {
    e.preventDefault();
    this.clearSelection();
    let lastX = e.clientX;
    let lastY = e.clientY;
    let moved = false;
    const move = (ev) => {
      if (ev.buttons !== 1) { up(); return; }
      this.panX += ev.clientX - lastX;
      this.panY += ev.clientY - lastY;
      lastX = ev.clientX;
      lastY = ev.clientY;
      moved = true;
      this.updateUIPositions();
      this.draw();
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      if (!moved) return;
      this.scheduleSave({ system: true });                  // 화면 위치는 '저장 안 한 변경'으로 치지 않음
      this.justPannedBoard = true;                          // 끌고 난 뒤의 클릭은 칸 누르기로 치지 않음
      setTimeout(() => { this.justPannedBoard = false; }, 0);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  },

  // ---- 판 메뉴 (판 우클릭 · 판 머리 …) ----
  openBoardMenu(board, x, y) {
    if (board.kind === 'group') {                                   // 파일 묶음 메뉴 (groups.js)
      this.openContextMenu(this.groupMenuItems(board), x, y);
      return;
    }
    const items = [
      { icon: 'edit.svg', label: t('menu.rename'), action: () => this.renameBoard(board) },
    ];
    if (board.kind === 'calendar') {
      // 가이드 12-3: 이름 바꾸기 · 보기 › (한 달 · 한 주) · 오늘로 이동 · 주 시작 요일 › · 판 잠금 · ─ · 판 지우기
      items.push({
        icon: 'menu-view.svg', label: t('menu.calView'), arrow: true,
        submenu: ['month', 'week'].map(view => ({
          label: t(`calView.${view}`), current: board.view === view, action: () => this.setCalendarViewMode(board, view),
        })),
      });
      items.push({ icon: 'menu-today.svg', label: t('menu.goToday'), action: () => this.calendarGoToday(board) });
      items.push({
        icon: 'menu-weekstart.svg', label: t('menu.weekStart'), arrow: true,
        submenu: [0, 1].map(day => ({
          label: t(day === 0 ? 'weekStart.sun' : 'weekStart.mon'),
          current: board.weekStart === day,
          action: () => this.setCalendarWeekStart(board, day),
        })),
      });
      items.push({ icon: 'pin.svg', label: t(board.pinned ? 'menu.unlockBoard' : 'menu.lockBoard'), action: () => this.toggleBoardLock(board) });
      items.push({ separator: true });
    } else {
      // 시안 4안: 이름 바꾸기 · 시간 축 › · 눈금 단위 › · 캘린더 판 연동 · 오늘로 이동 · ─ · 판 잠금 · 판 지우기
      items.push({
        icon: 'menu-axis.svg', label: t('menu.axis'), arrow: true,
        submenu: ['direct', 'calendar'].map(mode => ({
          label: t(`axis.${mode}`), current: board.mode === mode, action: () => this.setTimelineMode(board, mode),
        })),
      });
      if (board.mode === 'calendar') {
        items.push({
          icon: 'menu-scale.svg', label: t('menu.scale'), arrow: true,
          submenu: ['year', 'month', 'day'].map(scale => ({
            label: t(`scale.${scale}`), current: board.scale === scale, action: () => this.setTimelineScale(board, scale),
          })),
        });
        items.push(this.timelineLinkMenuItem(board));
        items.push({ icon: 'menu-today.svg', label: t('menu.goToday'), action: () => this.timelineGoToday(board) });
      }
      items.push({ separator: true });
      items.push({ icon: 'pin.svg', label: t(board.pinned ? 'menu.unlockBoard' : 'menu.lockBoard'), action: () => this.toggleBoardLock(board) });
    }
    items.push({ icon: 'trash.svg', label: t('menu.deleteBoard'), action: () => this.deleteBoard(board), danger: true });
    this.openContextMenu(items, x, y);
  },

  // 캘린더 판 연동 — 캘린더 판이 하나면 켜고 끄기, 여럿이면 옆 목록에서 고름
  timelineLinkMenuItem(board) {
    const calendars = this.boards.filter(b => b.kind === 'calendar');
    const linked = this.linkedCalendar(board);
    if (calendars.length === 1) {
      return {
        icon: 'menu-link.svg', label: t(linked ? 'menu.unlink' : 'menu.link'),
        action: () => this.setTimelineLink(board, linked ? '' : calendars[0].id),
      };
    }
    const submenu = calendars.length
      ? calendars.map((cal, i) => ({
        label: cal.title || t('link.calendarN', { n: i + 1 }),
        current: board.linkedBoardId === cal.id,
        action: () => this.setTimelineLink(board, cal.id),
      })).concat([{ label: t('link.none'), current: !linked, action: () => this.setTimelineLink(board, '') }])
      : [{ label: t('link.noCalendar'), disabled: true }];
    return { icon: 'menu-link.svg', label: t('menu.link'), arrow: true, submenu };
  },

  // 이름 바꾸기 — 판 머리의 이름 자리에서 바로 씀 (Enter 끝 · Esc 취소)
  renameBoard(board) {
    const el = document.getElementById(board.id);
    const name = el && el.querySelector('.board-name');
    if (!name) return;
    const input = document.createElement('input');
    input.className = 'board-name-input';
    input.value = board.title;
    input.placeholder = t(board.kind === 'timeline' ? 'board.timeline' : board.kind === 'group' ? 'group.namePlaceholder' : 'board.namePlaceholder');
    input.spellcheck = false;
    input.maxLength = 40;
    name.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      const value = input.value.replace(/\s+/g, ' ').trim();
      if (commit && value !== board.title) {
        this.record();
        board.title = value;
        board.updatedAt = Date.now();
        this.scheduleSave();
      }
      this.renderBoard(board);
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

  // 판 잠금 — 판과 그 위 쪽지를 옮기거나 고칠 수 없음 (화면 이동 · 확대는 그대로)
  toggleBoardLock(board) {
    this.record();
    board.pinned = !board.pinned;
    this.refreshAllBoards();
    this.notes.forEach(note => { if (note.boardId === board.id) this.refreshNote(note); });
    if (board.kind === 'group') this.updateGroupFiles(board);        // 잠긴 묶음의 파일은 못 옮김 표시
    this.scheduleSave();
  },

  // 판 지우기 — 붙어 있던 쪽지는 보이던 자리에 그대로 남음 (연동한 연대표는 연동만 풀림)
  deleteBoard(board) {
    this.record();
    if (this.calendarFan && this.calendarFan.boardId === board.id) this.calendarFan = null;
    this.notes.forEach(note => {
      if (note.boardId !== board.id) return;
      const slot = this.noteBoardSlot(note);
      if (slot && !slot.offView) {
        note.x = slot.x;
        note.y = slot.y;
      }
      this.detachNoteFields(note);
    });
    this.boards.forEach(b => { if (b.linkedBoardId === board.id) b.linkedBoardId = ''; });
    this.boards = this.boards.filter(b => b.id !== board.id);
    this.boardViews.delete(board.id);
    this.timelineLayouts.delete(board.id);
    this.calendarCache.delete(board.id);
    const el = document.getElementById(board.id);
    if (el) el.remove();
    this.refreshAllBoards();
    this.notes.forEach(note => {
      const noteEl = document.getElementById(note.id);
      if (!noteEl) return;
      this.refreshNote(note, noteEl);
      this.fitNote(note, noteEl);
    });
    this.scheduleSave();
  },

  // ---- 시계: 날짜가 바뀌면 오늘 표시 · 빨간 날을 다시 (캘린더는 '이번 달'을 따라감) ----
  ensureBoardClock() {
    if (this.boardClock) return;
    this.boardClockKey = this.todayKey();
    this.boardClock = setInterval(() => this.tickBoards(), 30 * 1000);
  },

  tickBoards() {
    const today = this.todayKey();
    if (today === this.boardClockKey) return;
    const before = this.boardClockKey;
    this.boardClockKey = today;
    this.followTodayOnCalendars(before);
    this.loadHolidays();                                             // 하루에 한 번 (main 이 받아 둔 자료를 먼저 씀)
    this.refreshAllBoards();
  },
};

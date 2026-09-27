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
    const tone = this.settings && this.settings.boardTone;          // 설정 › 판 › 기본 판 색상 (배경 테마 따라면 적지 않음)
    if (kind !== 'group' && (tone === 'light' || tone === 'dark')) board.tone = tone;
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
    if (board.tone !== 'light' && board.tone !== 'dark') delete board.tone;     // 판 색 — 없으면 배경 테마 따라
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
      const group = board.kind === 'group';
      const canDrag = this.pressSelect(e, board.id, !board.pinned);  // 누르면 판을 고름 (쪽지처럼, Ctrl · Shift 는 여러 개) → Delete 로 지우기
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
        if (board.pinned) this.startGrabPan(e);                      // 잠근 묶음: 끌면 화면 이동
        else if (canDrag) this.startItemDrag(e, 'board', board);
        return;
      }
      if (e.target.closest('.board-head') && !board.pinned) {
        e.preventDefault();
        if (canDrag) this.startItemDrag(e, 'board', board);
        return;
      }
      this.narrowTo = null;
      this.startGrabPan(e);                                          // 칸 · 빈 곳 · 잠긴 판: 화면 이동 (판은 고른 채)
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
      else {
        const cell = e.target.closest('.cal-cell');                  // 캘린더 날짜 칸이면 그 날짜 표시 줄도 (day-marks.js)
        this.openBoardMenu(board, e.clientX, e.clientY, cell ? cell.dataset.date : null);
      }
    });

    // 판은 쪽지 · 사진 · 파일보다 아래, 판끼리는 나중에 만든 판이 위 (다른 판 바로 뒤에 끼움)
    const boardEls = this.uiLayer.querySelectorAll(':scope > .board');
    if (boardEls.length) boardEls[boardEls.length - 1].after(el);
    else this.uiLayer.prepend(el);
    el.classList.toggle('selected', this.boardSelected(board));
    this.renderBoard(board, el);
    this.ensureBoardClock();
  },

  renderBoard(board, el = document.getElementById(board.id)) {
    if (!el) return;
    el.innerHTML = '';
    el.classList.toggle('pinned', !!board.pinned);
    if (board.kind !== 'group') el.classList.toggle('selected', this.boardSelected(board));   // 잠그면 선택 표시도 없앰
    if (board.kind !== 'group') el.classList.toggle('tone-dark', this.boardTone(board) === 'dark');   // 검은 판 (styles/boards.css)
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
    if (board.kind === 'group') el.style.zIndex = String(this.groupLayer(board));   // 묶음마다 자기 층 (groups.js)
    else {
      el.style.zIndex = String(this.boardLayer(board));                             // 판마다 자기 층 — 붙은 쪽지는 바로 위
      if (this.selection.has(board.id)) this.updateBoardResizeFloat();             // 위에 띄운 크기 조절 손잡이도 따라감
    }
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
  // 잡고 끌어 화면 이동 — 판의 칸 · 빈 곳, 고정한 쪽지 · 사진, 잠근 판 · 묶음 (옮길 수 없는 것 위에서 끌 때)
  //   고른 것은 그대로 둠. 끌고 난 뒤의 클릭은 판 칸 누르기로 치지 않음 (justPannedBoard)
  startGrabPan(e) {
    e.preventDefault();
    if (this.viewLocked()) return;                            // 화면 잠금 (view.js)
    document.body.classList.add('pointer-busy');            // 쪽지 속 영상 재생기가 마우스를 가로채지 않게
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
      document.body.classList.remove('pointer-busy');
      if (!moved) return;
      this.scheduleSave({ system: true });                  // 화면 위치는 '저장 안 한 변경'으로 치지 않음
      this.justPannedBoard = true;                          // 끌고 난 뒤의 클릭은 칸 누르기로 치지 않음
      setTimeout(() => { this.justPannedBoard = false; }, 0);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  },

  // ---- 고르기 — 캘린더 · 연대표 (파일 묶음은 groups.js updateGroupSelection) ----
  //   잠근 판은 쪽지처럼 선택 표시를 하지 않고 Delete 로도 지우지 않음
  boardSelected(board) {
    return this.selection.has(board.id) && !board.pinned;
  },

  updateBoardSelection() {
    this.boards.forEach(board => {
      if (board.kind === 'group') return;
      const el = document.getElementById(board.id);
      if (!el) return;
      el.classList.toggle('selected', this.boardSelected(board));
      el.style.zIndex = String(this.boardLayer(board));       // 고르면 붙은 쪽지와 함께 맨 앞 층으로
    });
    this.notes.forEach(note => {                                // 붙은 쪽지도 판의 층을 따라감 (board-notes.js)
      if (!note.boardId) return;
      const el = document.getElementById(note.id);
      if (el) this.applyNoteLayer(el, note);
    });
    this.updateBoardResizeFloat();
  },

  // ---- 쌓임 순서 (styles/boards.css 머리 설명) ----
  // 캘린더 · 연대표마다 자기 층: 판 = 밴드 + 4 × 차례, 붙은 쪽지 = 그 바로 위 (board-notes.js applyNoteLayer)
  //   → 다른 쪽지 · 사진 · 파일 · 파일 묶음 · 다른 판이 판과 붙은 쪽지 사이에 끼지 않음 (지나가면 판과 쪽지가 함께 가려짐)
  //   차례: 판끼리의 순서 (layer-order.js — 우클릭 › 순서, 24 까지 — 고정한 쪽지 100 아래)
  //   밴드: 보통 0 (맨 뒤) · 고른 판 90000 (붙은 쪽지와 함께 맨 앞). 잠근 판은 고르지 않으니 늘 뒤
  boardLayer(board) {
    const rank = Math.min(24, Math.max(0, this.layerZ('board', board)));
    return (this.boardSelected(board) ? 90000 : 0) + rank * 4;
  },

  // 고른 캘린더 · 연대표의 크기 조절 손잡이를 모든 것보다 위에 하나 더 (styles/boards.css .board-resize-float)
  //   고른 판도 고른 파일 묶음보다는 아래라 모서리에 겹치면 판의 손잡이를 못 잡음. 고른 판 하나만 (마지막으로 고른 것)
  updateBoardResizeFloat() {
    const board = [...this.selection].reverse().map(id => this.boards.find(b => b.id === id))
      .find(b => b && b.kind !== 'group' && !b.pinned);
    let handle = document.getElementById('board-resize-float');
    if (!board) {
      if (handle) handle.remove();
      return;
    }
    if (!handle || handle.parentNode !== this.uiLayer) {
      if (handle) handle.remove();
      handle = document.createElement('div');
      handle.id = 'board-resize-float';
      handle.className = 'board-resize-float';
      handle.addEventListener('mousedown', (e) => {
        const target = this.findBoard(handle.dataset.board);
        if (!target || target.pinned || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        this.startItemResize(e, 'board', target);
      });
      this.uiLayer.appendChild(handle);
    }
    handle.dataset.board = board.id;
    const size = this.boardSize(board);
    const s = Math.max(14, 18 * this.zoom);
    handle.style.left = `${(board.x + size.width) * this.zoom + this.panX - s}px`;
    handle.style.top = `${(board.y + size.height) * this.zoom + this.panY - s}px`;
    handle.style.width = `${s}px`;
    handle.style.height = `${s}px`;
  },

  // ---- 판 색 — 흰색 · 검은색 (캘린더 · 연대표. 파일 묶음은 포스트잇 색 — groups.js) ----
  //   판마다 정한 색, 없으면 배경 테마 따라 (예전에 만든 판 · 설정 '기본 판 색상'이 배경 테마 따라)
  boardTone(board) {
    if (board.tone === 'light' || board.tone === 'dark') return board.tone;
    return this.settings && this.settings.theme === 'dark' ? 'dark' : 'light';
  },

  setBoardTone(board, tone) {
    if (this.boardTone(board) === tone && board.tone === tone) return;
    this.record();
    board.tone = tone;
    board.updatedAt = Date.now();
    this.renderBoard(board);
    this.updateFanOverlay();
    this.scheduleSave();
  },

  // 배경 테마가 바뀌면 색을 정하지 않은 판도 따라 바꿈 (settings.js applySettings)
  updateBoardTones() {
    if (!this.boards) return;
    this.boards.forEach(board => {
      if (board.kind === 'group') return;
      const el = document.getElementById(board.id);
      if (el) el.classList.toggle('tone-dark', this.boardTone(board) === 'dark');
    });
    if (this.uiLayer) this.updateFanOverlay();
  },

  boardToneMenuItem(board) {
    const current = this.boardTone(board);
    return {
      icon: 'palette.svg', label: t('menu.boardTone'), arrow: true,
      submenu: [['light', '#FCFBF9'], ['dark', '#2A3038']].map(([tone, swatch]) => ({
        label: t(`boardTone.${tone}`), swatch, current: current === tone, action: () => this.setBoardTone(board, tone),
      })),
    };
  },

  // ---- 판 메뉴 (판 우클릭 · 판 머리 …) ----
  //   date: 우클릭한 캘린더 날짜 칸 ('YYYY-MM-DD') — 맨 위에 '이 날짜 표시 ›' (day-marks.js)
  openBoardMenu(board, x, y, date = null) {
    if (board.kind === 'group') {                                   // 파일 묶음 메뉴 (groups.js)
      this.openContextMenu(this.groupMenuItems(board), x, y);
      return;
    }
    const items = [
      { icon: 'edit.svg', label: t('menu.rename'), action: () => this.renameBoard(board) },
      this.boardToneMenuItem(board),                                // 판 색상 › 흰색 · 검은색
    ];
    if (board.kind === 'calendar' && date && !board.pinned) items.unshift(...this.dayMarkMenuItems(board, date), { separator: true });
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

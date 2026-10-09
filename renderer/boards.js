// 판 — 캔버스(벽)에 놓이는 물건: 캘린더(calendar.js — 링으로 건 종이 달력) · 연대표(timeline.js — 걸이 막대)
//   (code/icons/아이콘_가이드.md 12장 — 둘 다 '판 상자'가 없음. 물건 바깥은 바탕화면이 그대로 보임)
//   · 파일 묶음(groups.js — 파일 아이콘을 담는 큰 포스트잇)
//   판은 CSS 로 그리고, 자리·크기는 쪽지처럼 zoom 1 기준 값에 배율을 곱해 씀 (styles/boards.css · groups.css)
//   캘린더는 색 띠, 연대표는 막대를 잡고 끌면 옮겨지고(붙은 쪽지 · 담긴 파일도 함께), 종이 안 칸 · 빈 곳을 끌면 화면이 움직임
//   판 메뉴는 우클릭으로만 (캘린더의 오늘 · … 단추, 연대표 조작 줄은 없앰 — 사용자 요청)
//   판은 쪽지·사진·파일보다 아래에 깔림 (판끼리는 나중에 만든 판이 위). 쪽지 붙이기 · 떼기는 board-notes.js
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { ICON_DIR, CALENDAR_BANDS } from './constants.js';
import { t } from './i18n.js';

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
    delete board.tone;                                    // 예전 판 색 (흰색 · 검은색) — 판 상자가 없어져서 안 씀
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

  // 화면에 차지하는 크기 — 캘린더는 종이 (6주에 걸친 달이면 한 줄만큼 길어짐. 링 · 겹친 종이는 그 밖),
  //   연대표는 걸이 막대 (얹히고 걸린 쪽지는 그 밖), 파일 묶음은 담긴 파일 줄 수만큼 길어짐
  boardSize(board) {
    if (board.kind === 'timeline') return this.timelineSize(board);
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
      const canDrag = this.pressSelect(e, board.id);                 // 누르면 판을 고름 (쪽지처럼, Ctrl · Shift 는 여러 개 — 잠근 판도) → Delete 로 지우기
      if (e.button !== 0) return;
      if (e.target.closest('.board-resize, .tl-len')) {              // 크기 조절 — 연대표는 막대 끝 길이 손잡이
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
      // 캘린더: 색 띠 / 연대표: 걸이 막대 · 이름 꼬리표 — 잡고 끌면 옮겨짐
      if (e.target.closest('.board-head, .tl-rail, .tl-name') && !board.pinned) {
        e.preventDefault();
        if (canDrag) this.startItemDrag(e, 'board', board);
        return;
      }
      this.narrowTo = null;
      this.startGrabPan(e);                                          // 칸 · 빈 곳 · 잠긴 판: 화면 이동 (판은 고른 채)
    });

    // 연대표: 막대를 두 번 누르면 그 자리에 새 쪽지를 검 (직접 작성 모드의 칸은 이름 고치기 — timeline.js)
    el.addEventListener('dblclick', (e) => {
      if (board.kind !== 'timeline' || board.pinned || !e.target.closest('.tl-rail')) return;
      const wx = (e.clientX - this.panX) / this.zoom;
      const wy = (e.clientY - this.panY) / this.zoom;
      // 가로 막대: 그 날짜 아래쪽에 걸기 / 세로 막대: 오른쪽에 붙이기
      this.addNoteOnTimeline(board, this.timelineVertical(board)
        ? this.timelineDropAt(board, board.x + 20, wy) : this.timelineDropAt(board, wx, board.y + 20));
    });

    el.addEventListener('contextmenu', (e) => {
      if (e.target.closest('input, textarea')) return;
      e.preventDefault();
      e.stopPropagation();
      if (this.multiSelected(board.id)) this.openSelectionMenu(e.clientX, e.clientY);   // 여럿 고른 것 가운데 하나 — 여러 개 메뉴 (한꺼번에 잠금 · 풀기 등. 캘린더 · 연대표도)
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
    el.classList.toggle('picked', !!board.pinned && this.multiSelected(board.id));            // 잠근 것을 여럿 가운데 고름 — 파란 테두리만
    if (board.kind !== 'group') el.classList.toggle('tone-dark', this.boardTone(board) === 'dark');   // 어두운 배경일 때 (styles/boards.css)
    el.classList.toggle('tl-direct', board.kind === 'timeline' && board.mode === 'direct');
    if (board.kind === 'timeline') this.renderTimeline(board, el);
    else if (board.kind === 'group') this.renderGroup(board, el);
    else this.renderCalendar(board, el);
    if (board.kind !== 'timeline') {                    // 연대표는 막대 끝 길이 손잡이 (timeline.js)
      const grip = document.createElement('div');
      grip.className = 'board-resize';
      el.appendChild(grip);
    }
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

  // 판 크기 조절 — 캘린더는 칸이 함께 늘어나고, 연대표는 막대 길이만 (눈금 한 칸 폭은 그대로 — 보이는 때가 늘어남)
  //   width · height: 화면에 보일 크기 (drag.js — 손잡이가 마우스를 그대로 따라가게)
  resizeBoard(board, width, height) {
    if (board.kind === 'group') {                                   // 파일 묶음: 폭이 바뀌면 칸이 다시 늘어섬
      const min = this.groupMinSize();
      board.width = Math.max(min.width, width);
      board.height = Math.max(min.height, height);
      this.updateGroupFiles(board);
      return;
    }
    const min = board.kind === 'timeline' ? this.timelineMinSize() : this.calendarMinSize();
    if (board.kind === 'timeline') {                                // 직접 작성 모드: 만든 칸이 잘리지 않게 칸 끝까지만 줄어듦
      const length = this.timelineVertical(board) ? height : width;  // 세로 막대는 아래 끝을 끌어 길이를 바꿈
      board.width = Math.max(min.width, length, board.mode === 'direct' ? this.timelineSegmentsWidth(board) : 0);
      this.requestBoardsRefresh();
      return;
    }
    board.width = Math.max(min.width, width);
    board.height = Math.max(min.height, this.calendarStoredHeight(board, height));   // 6줄인 달 · 한 주 보기에서도 세로가 가로와 같은 감도로
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
      el.classList.toggle('picked', !!board.pinned && this.multiSelected(board.id));
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
  // 캘린더 · 연대표마다 자기 층 (8칸): 판 = 밴드 + 8 × 차례 + 4, 붙은 쪽지 = 그 바로 위 +1 ~ +3 (board-notes.js applyNoteLayer),
  //   연대표 막대 위에 얹은 쪽지 = 판 바로 아래 −1 ~ −4 (막대를 쪽지보다 위에 그려 끼워 놓은 것처럼)
  //   → 다른 쪽지 · 사진 · 파일 · 파일 묶음 · 다른 판이 판과 붙은 쪽지 사이에 끼지 않음 (지나가면 판과 쪽지가 함께 가려짐)
  //   차례: 판끼리의 순서 (layer-order.js — 우클릭 › 순서, 60 까지 — 파일 묶음 1000 아래)
  //   밴드: 보통 500 — 고정한 쪽지 · 사진(100) · 고정한 파일 묶음(110 ~ 490) 앞, 파일 묶음(1000 ~) · 연결선 · 쪽지 뒤 (사용자 요청)
  //         고른 판 90000 (붙은 쪽지와 함께 맨 앞). 잠근 판은 고르지 않으니 늘 500 층
  boardLayer(board) {
    const rank = Math.min(60, Math.max(0, this.layerZ('board', board)));
    return (this.boardSelected(board) ? 90000 : 500) + rank * 8 + 4;
  },

  // 고른 캘린더의 크기 조절 손잡이를 모든 것보다 위에 하나 더 (styles/boards.css .board-resize-float)
  //   고른 판도 고른 파일 묶음보다는 아래라 모서리에 겹치면 판의 손잡이를 못 잡음. 고른 판 하나만 (마지막으로 고른 것)
  //   연대표는 막대 끝 길이 손잡이라 따로 띄우지 않음
  updateBoardResizeFloat() {
    const board = [...this.selection].reverse().map(id => this.boards.find(b => b.id === id))
      .find(b => b && b.kind === 'calendar' && !b.pinned);
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

  // ---- 어두운 배경일 때 — 캘린더 종이가 살짝 덜 흰색 (가이드 12-2. 종이라서 어두워지지는 않음. 막대 · 나사 · 걸이는 그대로) ----
  boardTone() {
    return this.settings && this.settings.theme === 'dark' ? 'dark' : 'light';
  },

  // 배경 테마가 바뀌면 따라 바꿈 (settings.js applySettings)
  updateBoardTones() {
    if (!this.boards) return;
    this.boards.forEach(board => {
      if (board.kind === 'group') return;
      const el = document.getElementById(board.id);
      if (el) el.classList.toggle('tone-dark', this.boardTone(board) === 'dark');
    });
  },

  // ---- 판 메뉴 (판 우클릭) ----
  //   date: 우클릭한 캘린더 날짜 칸 ('YYYY-MM-DD') — 맨 위에 '이 날짜 표시 ›' (day-marks.js)
  openBoardMenu(board, x, y, date = null) {
    if (board.kind === 'group') {                                   // 파일 묶음 메뉴 (groups.js)
      this.openContextMenu(this.groupMenuItems(board), x, y);
      return;
    }
    const timeline = board.kind === 'timeline';
    const items = [{ icon: 'edit.svg', label: t('menu.rename'), action: () => this.renameBoard(board) }];
    if (board.kind === 'calendar' && date && !board.pinned) items.unshift(...this.dayMarkMenuItems(board, date), { separator: true });
    if (board.kind === 'calendar') {
      // 가이드 12-3: 이름 바꾸기 · 오늘로 이동 · 주 시작 요일 › · 보기 › (한 달 · 한 주) · 띠 색 › · ─ · 판 잠금 · 판 지우기
      items.push({ icon: 'menu-today.svg', label: t('menu.goToday'), action: () => this.calendarGoToday(board) });
      items.push({
        icon: 'menu-weekstart.svg', label: t('menu.weekStart'), arrow: true,
        submenu: [0, 1].map(day => ({
          label: t(day === 0 ? 'weekStart.sun' : 'weekStart.mon'),
          current: board.weekStart === day,
          action: () => this.setCalendarWeekStart(board, day),
        })),
      });
      items.push({
        icon: 'menu-view.svg', label: t('menu.calView'), arrow: true,
        submenu: ['month', 'week'].map(view => ({
          label: t(`calView.${view}`), current: board.view === view, action: () => this.setCalendarViewMode(board, view),
        })),
      });
      items.push({
        icon: 'palette.svg', label: t('menu.bandColor'), arrow: true,
        submenu: Object.keys(CALENDAR_BANDS).map(key => ({
          label: t(`band.${key}`), swatch: CALENDAR_BANDS[key], current: board.bandColor === key, action: () => this.setCalendarBand(board, key),
        })),
      });
      items.push({ separator: true });
      items.push({ icon: 'pin.svg', label: t(board.pinned ? 'menu.unlockBoard' : 'menu.lockBoard'), action: () => this.toggleBoardLock(board) });
    } else {
      // 이름 바꾸기 · 시간 축 › · 방향 › (가로 · 세로) · 캘린더 연동 · 오늘로 이동 · ─ · 막대 잠금 · 막대 지우기
      //   눈금 단위(연 · 월 · 일)는 설정 › 판 › 연대표 눈금 단위 에서만 (사용자 요청)
      items.push({
        icon: 'menu-axis.svg', label: t('menu.axis'), arrow: true,
        submenu: ['direct', 'calendar'].map(mode => ({
          label: t(`axis.${mode}`), current: board.mode === mode, action: () => this.setTimelineMode(board, mode),
        })),
      });
      const dir = this.timelineVertical(board) ? 'v' : 'h';
      items.push({
        icon: 'menu-scale.svg', label: t('menu.tlDir'), arrow: true,
        submenu: ['h', 'v'].map(d => ({
          label: t(`tlDir.${d}`), current: dir === d, action: () => this.setTimelineDir(board, d),
        })),
      });
      if (board.mode === 'calendar') {
        items.push(this.timelineLinkMenuItem(board));
        items.push({ icon: 'menu-today.svg', label: t('menu.goToday'), action: () => this.timelineGoToday(board) });
      }
      items.push({ separator: true });
      items.push({ icon: 'pin.svg', label: t(board.pinned ? 'menu.unlockRail' : 'menu.lockRail'), action: () => this.toggleBoardLock(board) });
    }
    items.push({ icon: 'trash.svg', label: t(timeline ? 'menu.deleteRail' : 'menu.deleteBoard'), action: () => this.deleteBoard(board), danger: true });
    this.openContextMenu(items, x, y);
  },

  // 캘린더 연동 — 캘린더가 하나면 켜고 끄기, 여럿이면 옆 목록에서 고름
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

  // 이름 바꾸기 — 캘린더 색 띠 · 연대표 이름 꼬리표 · 묶음 머리의 이름 자리에서 바로 씀 (Enter 끝 · Esc 취소)
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
    if (board.kind === 'group') this.updateGroupFiles(board);        // 잠근 묶음은 맨 뒤 층 — 든 파일도 그 층으로 (든 파일은 그대로 옮길 수 있음)
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

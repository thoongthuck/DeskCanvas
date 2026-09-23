// 파일 묶음 — 파일 아이콘을 담는 큰 포스트잇 (메모장.md Phase 4 '포스트잇 그룹핑')
//   판(boards.js)의 한 종류(kind: 'group')라서 판처럼 쪽지 · 파일보다 아래에 깔림
//   머리를 잡고 끌면 묶음이 옮겨지고 담긴 파일도 함께 움직임. 오른쪽 아래 접힌 모서리로 크기를 바꿈
//   담긴 파일은 묶음 안 칸에 차례로 놓임 (묶음의 fileIds 순서). 파일을 끌어다 놓으면 놓은 칸에 끼워 넣음
//   담긴 파일의 x · y 는 늘 보이는 칸 자리로 맞춰 둠 → 찾기 · 미니맵 · 저장 · 묶음 풀기가 그대로 씀
//   진짜 폴더가 아니라 화면에서만 묶음 (파일은 옮기지 않음)
//   접으면 머리 한 줄만 남고 담긴 파일 그림이 작게 늘어섬 (그 자리에서 다시 펼침 — 창을 여는 폴더와 다름)
//   누르면 선택 (가이드 4장: 머리 아이콘 note-selected.svg + 파란 테두리). 어디를 잡아도 옮겨짐
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { ICON_DIR, ICON_GRID, NOTE_COLORS } from './constants.js';
import { t } from './i18n.js';
import { fallbackIcon, usableIcon } from './file-icon.js';

const HEAD = 54;                                   // 머리: 위 여백 15 + 아이콘 24 + 15
const PAD = { left: 14, right: 14, bottom: 30 };   // 아래는 접힌 모서리(28) 자리
const CELL = { width: ICON_GRID.width, height: ICON_GRID.height };   // 바탕화면 격자와 같은 칸 (92 × 108)
const MIN_COLS = 2;
const START = { cols: 4, rows: 2 };                // 새 묶음 크기 (4칸 × 2줄)
const SLIDE_MS = 180;                              // 칸이 밀리고 당겨지는 움직임 (styles.css .file-icon.settling)
const FOLD_MS = 220;                               // 접고 펼 때 높이가 바뀌는 움직임 (styles/groups.css .folding)
const PEEK = 6;                                    // 접었을 때 머리에 보이는 파일 그림 수 (나머지는 +N)

const div = (className) => {
  const el = document.createElement('div');
  el.className = className;
  return el;
};

export const groupMethods = {
  newGroupData() {
    return {
      width: PAD.left + PAD.right + START.cols * CELL.width,
      height: HEAD + START.rows * CELL.height + PAD.bottom,
      color: 'yellow',
      collapsed: false,                            // 접어서 머리 한 줄만
      fileIds: [],
    };
  },

  normalizeGroup(board) {
    const min = this.groupMinSize();
    const start = this.newGroupData();
    if (typeof board.width !== 'number' || !(board.width >= min.width)) board.width = start.width;
    if (typeof board.height !== 'number' || !(board.height >= min.height)) board.height = start.height;
    if (!NOTE_COLORS[board.color]) board.color = 'yellow';
    board.collapsed = !!board.collapsed;
    board.fileIds = Array.isArray(board.fileIds) ? [...new Set(board.fileIds.filter(id => typeof id === 'string'))] : [];
    return board;
  },

  groupMinSize() {
    return { width: PAD.left + PAD.right + MIN_COLS * CELL.width, height: HEAD + CELL.height + PAD.bottom };
  },

  fileGroups() {
    return this.boards.filter(b => b.kind === 'group');
  },

  // 파일이 든 묶음 (없으면 null)
  fileGroup(file) {
    return this.boards.find(b => b.kind === 'group' && b.fileIds.includes(file.id)) || null;
  },

  groupMembers(group) {
    return group.fileIds.map(id => this.files.find(f => f.id === id)).filter(Boolean);
  },

  // 묶음 목록에서 없어진 파일 · 두 묶음에 겹친 파일을 뺌 (불러오기 · 되돌리기 · 바탕화면 파일이 사라진 뒤)
  cleanGroupMembership() {
    const known = new Set(this.files.map(f => f.id));
    const seen = new Set();
    this.fileGroups().forEach(g => {
      g.fileIds = g.fileIds.filter(id => known.has(id) && !seen.has(id) && seen.add(id));
    });
  },

  // 잠근 묶음에 든 파일은 못 옮김
  fileLocked(file) {
    const group = this.fileGroup(file);
    return !!(group && group.pinned);
  },

  // ---- 칸 배치 ----
  // 열 수는 묶음 폭으로, 줄 수는 담긴 파일 수로 (끄는 동안 끼워 넣을 빈칸 gap 도 한 칸). 높이는 파일이 다 들어가게 늘어남
  groupLayout(group) {
    const cols = Math.max(1, Math.floor((group.width - PAD.left - PAD.right) / CELL.width));
    if (group.collapsed) return { cols, rows: 0, gap: -1, collapsed: true, height: HEAD };   // 접으면 머리 한 줄
    const gap = this.groupGap && this.groupGap.groupId === group.id ? this.groupGap.index : -1;
    const rows = Math.max(1, Math.ceil((group.fileIds.length + (gap >= 0 ? 1 : 0)) / cols));
    return { cols, rows, gap, height: Math.max(group.height, HEAD + rows * CELL.height + PAD.bottom) };
  },

  groupSize(group) {
    return { width: group.width, height: this.groupLayout(group).height };
  },

  // 묶음 안 v 번째 칸에 놓일 파일의 왼쪽 위 (월드 좌표)
  groupCell(group, layout, v, file) {
    return {
      x: group.x + PAD.left + (v % layout.cols) * CELL.width + (CELL.width - file.width) / 2,
      y: group.y + HEAD + Math.floor(v / layout.cols) * CELL.height + (CELL.height - file.height) / 2,
    };
  },

  // 묶음에 든 파일의 자리 { group, x, y } — 묶음 밖이면 null. 접힌 묶음이면 { hidden: true } (머리 자리)
  fileSlot(file) {
    const group = this.fileGroup(file);
    if (!group) return null;
    const layout = this.groupLayout(group);
    if (layout.collapsed) return { group, hidden: true, x: group.x + PAD.left, y: group.y };
    const k = group.fileIds.indexOf(file.id);
    return { group, ...this.groupCell(group, layout, layout.gap >= 0 && k >= layout.gap ? k + 1 : k, file) };
  },

  // ---- 그리기 ----
  renderGroup(board, el) {
    Object.keys(NOTE_COLORS).forEach(c => el.classList.toggle(`note-${c}`, c === board.color));
    el.classList.toggle('collapsed', !!board.collapsed);
    const count = board.fileIds.length;

    // 머리: [묶음 아이콘] 이름 · 개수 (접으면 파일 그림) … [접기] [⋯]  (잡고 끌면 묶음이 옮겨짐)
    const head = div('board-head group-head');
    const icon = document.createElement('img');
    icon.className = 'group-icon';
    icon.src = `${ICON_DIR}${this.groupSelected(board) ? 'note-selected.svg' : 'note-group.svg'}`;
    icon.alt = '';
    icon.draggable = false;
    const name = this.boardNameElement(board, t('group.untitled'), 'group-title');
    name.classList.toggle('untitled', !board.title);
    const countEl = div('group-count');
    countEl.textContent = count ? t('group.count', { n: count }) : '';
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'group-more';
    more.title = t('group.more');
    more.innerHTML = `<img src="${ICON_DIR}note-more.svg" alt="" draggable="false">`;
    more.addEventListener('click', (e) => {
      e.stopPropagation();
      const r = more.getBoundingClientRect();
      this.openBoardMenu(board, r.left, r.bottom + 4);
    });
    const toggle = document.createElement('button');                // 접기 · 펼치기 (펼친 동안 ⌄, 접으면 ›)
    toggle.type = 'button';
    toggle.className = 'group-toggle';
    toggle.title = t(board.collapsed ? 'group.expand' : 'group.collapse');
    toggle.innerHTML = `<img src="${ICON_DIR}arrow-right.svg" alt="" draggable="false">`;
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleGroupCollapse(board);
    });
    head.addEventListener('dblclick', (e) => {                       // 머리 두 번 누르기 = 접기 · 펼치기 (이름은 이름 바꾸기)
      if (e.target.closest('.board-name, button, input')) return;
      this.toggleGroupCollapse(board);
    });
    head.append(icon, name, countEl);
    if (board.collapsed && count) head.append(this.groupPeek(board));
    head.append(div('board-spacer'), toggle, more);

    // 몸통: 파일이 놓이는 칸 (비었으면 안내)
    const body = div('group-body');
    if (!count) {
      const hint = div('group-empty');
      hint.textContent = t('group.hint');
      body.appendChild(hint);
    }
    el.append(head, body);
  },

  // 접었을 때 머리에 늘어서는 파일 그림 (앞에서부터 PEEK 개 + 나머지 수). 포스트잇 위라 늘 밝은 배경용 기본 그림
  groupPeek(group) {
    const peek = div('group-peek');
    const members = this.groupMembers(group);
    members.slice(0, PEEK).forEach(file => {
      const img = document.createElement('img');
      img.src = usableIcon(file.icon) ? file.icon : fallbackIcon(file, false);
      img.alt = '';
      img.title = file.name;
      img.draggable = false;
      peek.appendChild(img);
    });
    if (members.length > PEEK) {
      const rest = div('group-peek-more');
      rest.textContent = `+${members.length - PEEK}`;
      peek.appendChild(rest);
    }
    return peek;
  },

  // ---- 선택 · 접기 ----
  // 잠근 묶음은 쪽지처럼 선택 표시를 하지 않음
  groupSelected(group) {
    return this.selectedId === group.id && !group.pinned;
  },

  // 선택이 바뀌면 (notes.js updateSelection): 파란 테두리 + 머리 아이콘을 선택 아이콘으로
  updateGroupSelection() {
    this.fileGroups().forEach(g => {
      const el = document.getElementById(g.id);
      if (!el) return;
      const selected = this.groupSelected(g);
      el.classList.toggle('selected', selected);
      const icon = el.querySelector('.group-icon');
      if (icon) icon.src = `${ICON_DIR}${selected ? 'note-selected.svg' : 'note-group.svg'}`;
    });
  },

  toggleGroupCollapse(group) {
    this.record();
    this.setGroupCollapsed(group, !group.collapsed);
    this.scheduleSave();
  },

  // 접으면 담긴 파일은 숨고 머리 한 줄로 줄어듦, 펴면 칸이 다시 보임 (높이가 부드럽게 바뀜)
  setGroupCollapsed(group, collapsed) {
    if (!!group.collapsed === collapsed) return;
    group.collapsed = collapsed;
    group.updatedAt = Date.now();
    const el = document.getElementById(group.id);
    if (el) {
      el.classList.add('folding');
      clearTimeout(el.foldTimer);                                    // 묶음마다 따로 (여러 개를 잇달아 접어도)
      el.foldTimer = setTimeout(() => el.classList.remove('folding'), FOLD_MS);
    }
    this.refreshGroup(group);
    if (!collapsed) {                                                // 펼치면 파일이 살짝 내려오며 나타남
      this.groupMembers(group).forEach(file => {
        const fileEl = document.getElementById(file.id);
        if (!fileEl) return;
        fileEl.classList.remove('group-appear');
        void fileEl.offsetWidth;
        fileEl.classList.add('group-appear');
        setTimeout(() => fileEl.classList.remove('group-appear'), FOLD_MS + 60);
      });
    }
  },

  // 찾기로 파일에 갈 때: 접힌 묶음에 들어 있으면 펼침
  revealFileInGroup(file) {
    const group = this.fileGroup(file);
    if (!group || !group.collapsed) return;
    this.setGroupCollapsed(group, false);
    this.scheduleSave();
  },

  // 묶음에 든 파일 자리를 다시 맞춤 (묶음을 옮기거나 · 크기를 바꾸거나 · 칸이 바뀐 뒤). slide: 칸으로 미끄러지듯
  updateGroupFiles(group, { slide = false } = {}) {
    this.groupMembers(group).forEach(file => {
      const el = document.getElementById(file.id);
      if (!el) return;
      if (slide) this.slideFile(el);
      this.updateFilePosition(el, file);
    });
    const el = document.getElementById(group.id);
    if (el) this.updateBoardPosition(el, group);         // 줄 수가 바뀌면 높이도
  },

  // 담긴 파일 수 · 안내가 바뀐 뒤: 머리 · 몸통을 다시 그리고 칸도 맞춤
  refreshGroup(group, options) {
    this.renderBoard(group);
    this.updateGroupFiles(group, options);
  },

  refreshGroups() {
    this.fileGroups().forEach(g => this.refreshGroup(g));
  },

  slideFile(el) {
    el.classList.add('settling');
    this.settleTimers = this.settleTimers || {};
    clearTimeout(this.settleTimers[el.id]);
    this.settleTimers[el.id] = setTimeout(() => el.classList.remove('settling'), SLIDE_MS);
  },

  // ---- 끌어서 넣고 빼기 (drag.js 가 부름) ----
  // 끌기 시작: 묶음에 든 파일이면 꺼냄 (남은 파일은 앞으로 당겨짐)
  liftFileFromGroup(drag) {
    const file = drag.item;
    const group = this.fileGroup(file);
    if (!group) return;
    group.fileIds = group.fileIds.filter(id => id !== file.id);
    drag.fromGroup = group.id;
    const el = document.getElementById(file.id);
    if (el) this.updateFilePosition(el, file);           // 묶음 표시를 떼고, 있던 자리에서 마우스를 따라감
    this.refreshGroup(group, { slide: true });
  },

  // 그 자리(월드 좌표)에 놓인 파일 묶음 — 위에 놓인(나중에 만든) 묶음부터, 잠근 묶음은 빼고
  groupAt(wx, wy) {
    const groups = this.fileGroups();
    for (let i = groups.length - 1; i >= 0; i--) {
      const g = groups[i];
      if (g.pinned) continue;
      const size = this.groupSize(g);
      if (wx >= g.x && wy >= g.y && wx <= g.x + size.width && wy <= g.y + size.height) return g;
    }
    return null;
  },

  // 끄는 동안: 마우스 아래 묶음에 끼워 넣을 빈칸을 만들어 둠 (나머지 파일은 한 칸씩 비켜남)
  updateGroupDropTarget(drag, clientX, clientY) {
    const wx = (clientX - this.panX) / this.zoom;
    const wy = (clientY - this.panY) / this.zoom;
    const g = this.groupAt(wx, wy);
    const target = g ? { groupId: g.id, index: this.groupDropIndex(g, wx, wy) } : null;
    const before = this.groupGap;
    if ((!before && !target) || (before && target && before.groupId === target.groupId && before.index === target.index)) return;
    this.groupGap = target;
    drag.groupTarget = target;
    const old = before && this.findBoard(before.groupId);
    if (old && (!target || target.groupId !== old.id)) this.showGroupDrop(old, false);
    if (target) this.showGroupDrop(this.findBoard(target.groupId), true);
  },

  showGroupDrop(group, on) {
    const el = document.getElementById(group.id);
    if (el) el.classList.toggle('drop-target', on);
    this.updateGroupFiles(group, { slide: true });
  },

  // 마우스가 있는 칸 = 끼워 넣을 차례 (맨 뒤보다 뒤는 맨 뒤). 접힌 묶음은 맨 뒤로
  groupDropIndex(group, wx, wy) {
    if (group.collapsed) return group.fileIds.length;
    const { cols } = this.groupLayout(group);
    const col = Math.min(cols - 1, Math.max(0, Math.floor((wx - group.x - PAD.left) / CELL.width)));
    const row = Math.max(0, Math.floor((wy - group.y - HEAD) / CELL.height));
    return Math.min(row * cols + col, group.fileIds.length);
  },

  // 놓았을 때: 묶음 위면 그 차례에 넣고 칸으로 미끄러져 들어감 → true (아니면 false — 낱개 파일로 남음)
  settleFileInGroup(file, drag) {
    const target = drag.groupTarget;
    this.groupGap = null;
    document.querySelectorAll('.board-group.drop-target').forEach(el => el.classList.remove('drop-target'));
    const group = target && this.findBoard(target.groupId);
    if (!group) return false;
    group.fileIds.splice(Math.min(target.index, group.fileIds.length), 0, file.id);
    const el = document.getElementById(file.id);
    if (el) this.slideFile(el);
    this.refreshGroup(group);
    return true;
  },

  // ---- 메뉴에서 ----
  // 바탕 메뉴 › 쪽지 추가 › 파일 묶음 — 우클릭한 자리에 빈 묶음 (바로 이름 쓰기)
  addGroupAt(at) {
    const group = this.addBoardAt(at, 'group');
    this.renameBoard(group);
    return group;
  },

  // 파일 메뉴 › 묶음에 넣기 › (묶음) — 그 묶음 맨 뒤로 미끄러져 들어감
  moveFileToGroup(file, group) {
    this.record();
    const from = this.fileGroup(file);
    if (from) from.fileIds = from.fileIds.filter(id => id !== file.id);
    group.fileIds.push(file.id);
    const el = document.getElementById(file.id);
    if (el) this.slideFile(el);
    if (from) this.refreshGroup(from, { slide: true });
    this.refreshGroup(group);
    this.scheduleSave();
  },

  // 파일 메뉴 › 묶음에 넣기 › 새 묶음 — 파일이 있던 자리(묶음에 들어 있었으면 그 묶음 오른쪽)에 새 묶음을 만들어 첫 칸에
  newGroupWithFile(file) {
    this.record();
    const from = this.fileGroup(file);
    const at = from
      ? { x: from.x + from.width + 24, y: from.y }
      : { x: file.x - PAD.left - (CELL.width - file.width) / 2, y: file.y - HEAD - (CELL.height - file.height) / 2 };
    if (from) from.fileIds = from.fileIds.filter(id => id !== file.id);
    const group = this.newBoard('group', at);
    group.fileIds.push(file.id);
    this.boards.push(group);
    this.createBoardElement(group);
    const el = document.getElementById(file.id);
    if (el) this.slideFile(el);
    if (from) this.refreshGroup(from, { slide: true });
    this.updateGroupFiles(group);
    this.scheduleSave();
    this.renameBoard(group);
  },

  // 파일 메뉴 › 묶음에서 빼기 — 묶음 바로 아래 빈자리로
  takeFileOutOfGroup(file) {
    const group = this.fileGroup(file);
    if (!group) return;
    this.record();
    group.fileIds = group.fileIds.filter(id => id !== file.id);
    const y = group.y + this.groupSize(group).height + 16;
    let x = group.x + PAD.left + (CELL.width - file.width) / 2;
    const busy = (px) => this.files.some(f => f !== file && !this.fileGroup(f)
      && Math.abs(f.x - px) < CELL.width / 2 && Math.abs(f.y - y) < CELL.height / 2);
    for (let k = 0; k < 60 && busy(x); k++) x += CELL.width;
    file.x = x;
    file.y = y;
    const el = document.getElementById(file.id);
    if (el) {
      this.slideFile(el);
      this.updateFilePosition(el, file);
    }
    if (this.gridSnapOn()) this.settleFileInGrid(file);
    this.refreshGroup(group, { slide: true });
    this.scheduleSave();
  },

  // 묶음 풀기 — 포스트잇만 없애고 파일은 보이던 자리에 그대로 남김 (파일은 지우지 않음)
  ungroup(group) {
    this.record();
    group.collapsed = false;                             // 접힌 채 풀어도 파일은 펼친 칸 자리에
    const members = this.groupMembers(group);
    members.forEach(file => {
      const slot = this.fileSlot(file);
      if (slot) {
        file.x = slot.x;
        file.y = slot.y;
      }
    });
    this.boards = this.boards.filter(b => b.id !== group.id);
    const el = document.getElementById(group.id);
    if (el) el.remove();
    members.forEach(file => {
      const fileEl = document.getElementById(file.id);
      if (fileEl) this.updateFilePosition(fileEl, file);
    });
    this.scheduleSave();
  },

  setGroupColor(group, color) {
    if (group.color === color) return;
    this.record();
    group.color = color;
    group.updatedAt = Date.now();
    this.renderBoard(group);
    this.scheduleSave();
  },

  // 판 메뉴(boards.js)의 묶음 항목: 이름 바꾸기 · 색상 › · 묶음 잠금 · ─ · 묶음 풀기
  groupMenuItems(group) {
    return [
      { icon: 'edit.svg', label: t('menu.rename'), action: () => this.renameBoard(group) },
      {
        icon: 'palette.svg', label: t('menu.groupColor'), arrow: true,
        submenu: Object.keys(NOTE_COLORS).map(c => ({
          label: t(`color.${c}`), swatch: NOTE_COLORS[c].bg, current: group.color === c, action: () => this.setGroupColor(group, c),
        })),
      },
      { icon: 'chevron-down.svg', label: t(group.collapsed ? 'menu.expandGroup' : 'menu.collapseGroup'), action: () => this.toggleGroupCollapse(group) },
      { icon: 'pin.svg', label: t(group.pinned ? 'menu.unlockGroup' : 'menu.lockGroup'), action: () => this.toggleBoardLock(group) },
      { separator: true },
      { icon: 'menu-ungroup.svg', label: t('menu.ungroup'), action: () => this.ungroup(group) },
    ];
  },

  // 파일 메뉴의 묶음 항목: 묶음에 넣기 › (다른 묶음 · 새 묶음) · 묶음에서 빼기
  fileGroupMenuItems(file) {
    const current = this.fileGroup(file);
    if (current && current.pinned) return [];
    const groups = this.fileGroups();
    const label = (g) => g.title || (groups.length > 1 ? t('group.untitledN', { n: groups.indexOf(g) + 1 }) : t('group.untitled'));
    const items = [{
      icon: 'add-group.svg', label: t('menu.putInGroup'), arrow: true,
      submenu: groups.filter(g => g !== current && !g.pinned)
        .map(g => ({ label: label(g), action: () => this.moveFileToGroup(file, g) }))
        .concat([{ label: t('menu.newGroup'), action: () => this.newGroupWithFile(file) }]),
    }];
    if (current) items.push({ icon: 'menu-ungroup.svg', label: t('menu.leaveGroup'), action: () => this.takeFileOutOfGroup(file) });
    return items;
  },

  // 격자 모드: 묶음이 차지한 격자 칸 (낱개 파일을 그 칸에 두지 않음)
  groupGridCells() {
    const cells = new Set();
    this.fileGroups().forEach(g => {
      const size = this.groupSize(g);
      const from = this.iconCell(g.x, g.y);
      const to = this.iconCell(g.x + size.width, g.y + size.height);
      for (let col = from.col - 1; col <= to.col + 1; col++) {
        for (let row = from.row - 1; row <= to.row + 1; row++) {
          const p = this.cellPos(col, row);
          if (p.x + ICON_GRID.width > g.x && p.x < g.x + size.width && p.y + ICON_GRID.height > g.y && p.y < g.y + size.height) {
            cells.add(`${col},${row}`);
          }
        }
      }
    });
    return cells;
  },

  // 새 바탕화면 파일을 놓을 때: 묶음 위는 피함
  inAnyGroup(x, y, width, height) {
    return this.fileGroups().some(g => {
      const size = this.groupSize(g);
      return x < g.x + size.width && x + width > g.x && y < g.y + size.height && y + height > g.y;
    });
  },
};

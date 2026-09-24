// 파일 아이콘 — 파일 추가 · 바탕화면 폴더와 맞추기 · 탐색기에서 끌어다 놓기 · 휴지통으로 보내기
//   파일 묶음(포스트잇)에 넣고 빼기는 groups.js
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { t } from './i18n.js';
import { fallbackIcon, usableIcon } from './file-icon.js';
import { ICON_GRID } from './constants.js';

export const fileMethods = {
  // 파일 추가: 파일을 골라 바탕화면 아이콘으로 (더블클릭하면 열림)
  async addFileAt(at) {
    this.log('파일 추가 누름');
    if (!window.canvasAPI || !window.canvasAPI.pickFile) {
      this.log('파일 추가 못 함: canvasAPI.pickFile 없음');
      return;
    }
    let picked;
    try {
      picked = await window.canvasAPI.pickFile(t('dialog.pickFile'));
      this.log(`파일 고르기 끝: ${picked ? picked.path : '취소'}`);
    } catch (err) {
      this.log(`파일 추가 실패: ${err && err.message}`);
      this.showToast(`파일을 넣지 못했어요: ${err && err.message}`);
      return;
    }
    if (!picked) return;                                  // 취소
    this.record();
    const spot = this.gridSnapOn() ? this.snapFilePos(at.x, at.y) : at;
    const file = {
      id: this.newId('file'),
      x: spot.x, y: spot.y, width: 80, height: 100,
      name: picked.name,
      path: picked.path,
      icon: picked.icon || null,          // 없으면 file-icon.js 가 대신 그림
      isDir: false,
      source: 'link',
    };
    this.files.push(file);
    this.createFileElement(file);
    this.scheduleSave();
  },

  createFileElement(file) {
    const el = document.createElement('div');
    el.className = 'file-icon';
    el.id = file.id;
    el.innerHTML = `
      <div class="file-icon-symbol"></div>
      <div class="file-icon-name"></div>
    `;
    const symbol = el.querySelector('.file-icon-symbol');
    const img = document.createElement('img');       // 윈도우 미리보기 · 아이콘, 없으면 기본 그림 (file-icon.js)
    img.className = 'file-icon-img';
    img.alt = '';
    img.draggable = false;
    if (usableIcon(file.icon)) img.src = file.icon;
    else this.useFallbackIcon(img, file);
    img.addEventListener('error', () => {            // 깨진 그림도 기본 그림으로
      if (!img.classList.contains('fallback')) this.useFallbackIcon(img, file);
    });
    symbol.appendChild(img);
    el.querySelector('.file-icon-name').textContent = file.name;
    el.title = file.path || file.name;

    // 더블클릭: 기본 프로그램으로 열기
    el.addEventListener('dblclick', async () => {
      if (!file.path || !window.canvasAPI || !window.canvasAPI.openPath) return;
      const result = await window.canvasAPI.openPath(file.path);
      if (result !== true) alert(t('alert.openFail', { path: file.path }));
    });

    // 우클릭: 윈도우 탐색기 메뉴 + 앱 줄 (여럿 고른 것 가운데 하나면 고른 파일 모두, menus.js)
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (el.classList.contains('renaming')) return;
      this.ensureSelected(file.id);
      this.openFileContextMenu(file, e.clientX, e.clientY);
    });

    // 누르면 선택 + 끌어서 옮기기 (잠근 묶음에 든 파일은 선택 · 열기만). Ctrl · Shift: 여러 개 고르기 (selection.js)
    el.addEventListener('mousedown', (e) => {
      const canDrag = this.pressSelect(e, file.id, !this.fileLocked(file));
      if (e.button !== 0) return;
      e.preventDefault();
      if (!canDrag || this.fileLocked(file)) return;
      this.startItemDrag(e, 'file', file);
    });

    this.uiLayer.appendChild(el);
    this.updateFilePosition(el, file);
  },

  // 기본 그림 — 배경 테마가 '어둡게'면 어두운 배경용 그림 (파일 묶음 안은 밝은 종이 위라 늘 밝은 배경용)
  useFallbackIcon(img, file) {
    img.classList.add('fallback');
    img.src = fallbackIcon(file, this.settings && this.settings.theme === 'dark' && !this.fileGroup(file));
  },

  // 파일 묶음에 넣거나 뺐을 때 (view.js updateFilePosition)
  refreshFallbackIcon(el, file) {
    const img = el.querySelector('.file-icon-img.fallback');
    if (img) this.useFallbackIcon(img, file);
  },

  // 배경 테마를 바꾸면 기본 그림도 밝은 · 어두운 것으로 바꿈 (settings.js)
  refreshFallbackIcons() {
    this.files.forEach(file => {
      const img = document.querySelector(`#${CSS.escape(file.id)} .file-icon-img.fallback`);
      if (img) this.useFallbackIcon(img, file);
    });
  },

  // 파일 추가 · 끌어다 놓기로 넣은 파일(바탕화면 밖): 그림이 없으면 켤 때 다시 물어봄
  //   (예전에 윈도우 기본 그림만 받았던 실행 파일 등 — 지금은 파일 속 아이콘을 꺼내 올 수 있음, main.js)
  async refreshAddedFileIcons() {
    if (!window.canvasAPI || !window.canvasAPI.describePaths) return;
    const targets = this.files.filter(f => f.source !== 'desktop' && f.path && !usableIcon(f.icon));
    if (!targets.length) return;
    let items = [];
    try {
      items = await window.canvasAPI.describePaths(targets.map(f => f.path));
    } catch (_) {
      return;
    }
    const key = (p) => String(p || '').toLowerCase();
    let changed = false;
    items.forEach(item => {
      if (!item.icon) return;
      targets.filter(f => key(f.path) === key(item.path)).forEach(file => {
        file.icon = item.icon;
        this.rerenderFile(file);
        changed = true;
      });
    });
    if (changed) this.scheduleSave({ system: true });
  },

  // 파일 이름 바꾸기 — 아이콘 아래 이름 자리에서 바로 (윈도우 우클릭 메뉴 '이름 바꾸기' · 빈 바탕 메뉴로 새로 만든 것)
  //   Enter · 바깥 누르기: 바꿈, Esc: 그만. 확장자 앞까지 골라 둠. 바로 가기(.lnk · .url)는 보이는 이름만 바꿈
  //   바탕화면 감시가 먼저 알려 와도 같은 아이콘으로 알아보도록 경로를 먼저 바꿔 두고, 실패하면 되돌림
  startFileRename(file) {
    const el = document.getElementById(file.id);
    const label = el && el.querySelector('.file-icon-name');
    if (!label || !file.path || !window.canvasAPI || !window.canvasAPI.renamePath || el.classList.contains('renaming')) return;
    if (this.finishRename) this.finishRename(true);                    // 다른 파일 이름 칸이 열려 있으면 먼저 마무리
    const base = String(file.path).split(/[\\/]/).pop();
    const hiddenExt = /\.(lnk|url)$/i.test(base) ? base.slice(base.lastIndexOf('.')) : '';
    const input = document.createElement('input');
    input.className = 'file-rename-input';
    input.value = file.name;
    input.spellcheck = false;
    label.textContent = '';
    label.appendChild(input);
    el.classList.add('renaming');
    input.focus();
    const dot = file.isDir || hiddenExt ? -1 : file.name.lastIndexOf('.');
    input.setSelectionRange(0, dot > 0 ? dot : file.name.length);
    input.addEventListener('mousedown', (e) => e.stopPropagation());     // 칸 안을 눌러도 아이콘이 끌리지 않게
    input.addEventListener('dblclick', (e) => e.stopPropagation());      // 파일이 열리지 않게

    let done = false;
    const finish = async (commit) => {
      if (done) return;
      done = true;
      if (this.finishRename === finish) this.finishRename = null;
      el.classList.remove('renaming');
      const value = input.value.trim();
      input.remove();
      label.textContent = file.name;
      if (!commit || !value || value === file.name) return;
      const oldPath = file.path;
      const oldName = file.name;
      const newBase = value + hiddenExt;
      file.path = oldPath.slice(0, oldPath.length - base.length) + newBase;
      file.name = value;
      label.textContent = value;
      el.title = file.path;
      const result = await window.canvasAPI.renamePath(oldPath, newBase);
      if (result && result.ok) {
        file.path = result.path;
        this.scheduleSave();
        return;
      }
      file.path = oldPath;
      file.name = oldName;
      label.textContent = oldName;
      el.title = oldPath;
      this.showToast(result && result.reason === 'exists' ? t('toast.renameExists') : t('toast.renameFail', { msg: (result && result.reason) || '' }));
    };
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
    this.finishRename = finish;
  },

  // 빈 바탕 윈도우 메뉴로 무언가 한 뒤 (새 폴더 · 새로 만들기 › · 붙여넣기 …) — 잠깐 동안 새로 생기는 파일은 누른 자리에 놓고,
  //   하나만 생겼고 '새 …' 이름이면 이름 바꾸기 칸을 띄움 (탐색기처럼)
  expectNewDesktopItems(at) {
    this.pendingNewAt = { at, until: Date.now() + 6000, count: 0 };
  },

  // 빈 바탕 메뉴 '새로 고침' — 바탕화면 폴더를 다시 읽음
  async refreshDesktop() {
    if (!window.canvasAPI || !window.canvasAPI.listDesktop) return;
    try {
      this.syncDesktop(await window.canvasAPI.listDesktop());
    } catch (err) {
      console.error('바탕화면 폴더를 읽지 못했어요:', err);
    }
  },

  // ---- 바탕화면 폴더 ----
  async loadDesktop() {
    if (!window.canvasAPI || !window.canvasAPI.listDesktop) return;
    try {
      this.syncDesktop(await window.canvasAPI.listDesktop());
    } catch (err) {
      console.error('바탕화면 폴더를 읽지 못했어요:', err);
    }
    window.canvasAPI.onDesktopChanged((list) => this.syncDesktop(list));
  },

  // 바탕화면 폴더 내용에 맞춰 아이콘을 더하고 빼기 (옮겨 둔 자리는 유지)
  syncDesktop(list) {
    const key = (p) => String(p || '').toLowerCase();
    const current = new Map(list.map(item => [key(item.path), item]));
    let changed = false;

    const restoring = this.restoringPaths || new Set();              // 휴지통에서 되살리는 중 (history.js)
    this.files = this.files.filter(f => {
      if (f.source !== 'desktop' || current.has(key(f.path)) || restoring.has(key(f.path))) return true;
      const el = document.getElementById(f.id);
      if (el) el.remove();
      this.selection.delete(f.id);
      changed = true;
      return false;
    });

    const pending = this.pendingNewAt && Date.now() < this.pendingNewAt.until ? this.pendingNewAt : null;
    const created = [];
    list.forEach(item => {
      const existing = this.files.find(f => key(f.path) === key(item.path));
      if (existing) {
        if (existing.source !== 'desktop' || existing.name !== item.name || (item.icon && existing.icon !== item.icon)) {
          existing.source = 'desktop';
          existing.name = item.name;
          if (item.icon) existing.icon = item.icon;
          this.rerenderFile(existing);
          changed = true;
        }
        return;
      }
      let slot;
      if (pending) {                                   // 빈 바탕 메뉴로 만든 것 — 누른 자리부터 4개씩 줄지어
        const i = pending.count++;
        slot = { x: pending.at.x + (i % 4) * ICON_GRID.width, y: pending.at.y + Math.floor(i / 4) * ICON_GRID.height };
        if (this.gridSnapOn()) slot = this.snapFilePos(slot.x, slot.y);
      } else {
        slot = this.nextDesktopSlot();
      }
      const file = {
        id: this.newId('file'),
        x: slot.x, y: slot.y, width: 80, height: 100,
        name: item.name,
        path: item.path,
        icon: item.icon || null,
        isDir: !!item.isDir,
        source: 'desktop',
      };
      this.files.push(file);
      this.createFileElement(file);
      if (pending) created.push(file);
      changed = true;
    });
    if (created.length === 1 && /^(새 |New )/.test(created[0].name)) {
      this.pendingNewAt = null;
      requestAnimationFrame(() => this.startFileRename(created[0]));
    }

    if (changed) {
      this.cleanGroupMembership();                     // 사라진 파일은 파일 묶음에서도 뺌
      this.refreshGroups();
      this.scheduleSave({ system: true });             // 바탕화면이 바뀐 것은 사용자가 고친 것이 아님
    }
  },

  // 윈도우 바탕화면처럼 왼쪽 위부터 위→아래, 다음 줄로 빈 칸 찾기
  // ── 격자 모드 (바탕 우클릭 메뉴) — 파일 아이콘이 기존 바탕화면처럼 칸에 맞춰 움직임 ──
  gridSnapOn() {
    return !!(this.settings && this.settings.gridSnap);
  },

  // 캔버스 좌표 → 칸 번호 / 칸 번호 → 캔버스 좌표
  iconCell(x, y) {
    return {
      col: Math.round((x - ICON_GRID.left) / ICON_GRID.width),
      row: Math.round((y - ICON_GRID.top) / ICON_GRID.height),
    };
  },
  cellPos(col, row) {
    return { x: ICON_GRID.left + col * ICON_GRID.width, y: ICON_GRID.top + row * ICON_GRID.height };
  },
  snapFilePos(x, y) {
    const cell = this.iconCell(x, y);
    return this.cellPos(cell.col, cell.row);
  },

  // 이미 찬 칸이면 가장 가까운 빈 칸으로 (안쪽에서 바깥으로 한 겹씩)
  //   원래 0 이상 칸(바탕화면 왼쪽 위 안쪽)에 있던 아이콘은 음수 칸(화면 위 · 왼쪽 밖)으로 보내지 않음
  freeCellNear(col, row, taken) {
    if (!taken.has(`${col},${row}`)) return { col, row };
    const minCol = Math.min(0, col);
    const minRow = Math.min(0, row);
    for (let ring = 1; ring < 40; ring++) {
      let best = null, bestDist = Infinity;
      for (let dc = -ring; dc <= ring; dc++) {
        for (let dr = -ring; dr <= ring; dr++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;   // 그 겹의 테두리만
          const c = col + dc, r = row + dr;
          if (c < minCol || r < minRow || taken.has(`${c},${r}`)) continue;
          const dist = dc * dc + dr * dr * 1.2;                          // 가로로 먼저 퍼지게
          if (dist < bestDist) { bestDist = dist; best = { col: c, row: r }; }
        }
      }
      if (best) return best;
    }
    return { col, row };
  },

  // 켤 때: 모든 파일 아이콘을 지금 자리에서 가장 가까운 칸으로 (파일 묶음에 든 파일은 묶음 칸 그대로)
  snapAllFilesToGrid() {
    const taken = this.groupGridCells();                 // 묶음이 차지한 칸에는 두지 않음
    this.files.filter(f => !this.fileGroup(f))
      .sort((a, b) => (a.y - b.y) || (a.x - b.x))        // 왼쪽 위부터 자리를 잡아야 덜 밀림
      .forEach(file => {
        const near = this.iconCell(file.x, file.y);
        const cell = this.freeCellNear(near.col, near.row, taken);
        taken.add(`${cell.col},${cell.row}`);
        const pos = this.cellPos(cell.col, cell.row);
        file.x = pos.x;
        file.y = pos.y;
        this.updateItemPosition('file', file);
      });
  },

  // 끌어서 놓은 뒤: 그 칸에 다른 아이콘이 있으면 옆 빈 칸으로 (파일 묶음이 차지한 칸도 피함)
  settleFileInGrid(file) {
    const taken = this.groupGridCells();
    this.files.forEach(f => {
      if (f.id === file.id || this.fileGroup(f)) return;
      const c = this.iconCell(f.x, f.y);
      taken.add(`${c.col},${c.row}`);
    });
    const near = this.iconCell(file.x, file.y);
    const cell = this.freeCellNear(near.col, near.row, taken);
    const pos = this.cellPos(cell.col, cell.row);
    if (pos.x === file.x && pos.y === file.y) return;
    const el = document.getElementById(file.id);
    if (el) {                                   // 놓은 자리에서 칸으로 살짝 미끄러져 들어감
      el.classList.add('settling');
      clearTimeout(this.settleTimers && this.settleTimers[file.id]);
      this.settleTimers = this.settleTimers || {};
      this.settleTimers[file.id] = setTimeout(() => el.classList.remove('settling'), 180);
    }
    file.x = pos.x;
    file.y = pos.y;
    this.updateItemPosition('file', file);
  },

  toggleGridSnap() {
    const on = !this.gridSnapOn();
    if (on) {
      this.record();                       // 되돌리기로 원래 자리로 돌아갈 수 있게
      this.updateSetting('gridSnap', true);
      this.snapAllFilesToGrid();
      this.scheduleSave();
    } else {
      this.updateSetting('gridSnap', false);
    }
    this.showToast(on ? t('toast.gridOn') : t('toast.gridOff'));
  },

  nextDesktopSlot() {
    const { width: CELL_W, height: CELL_H, left: LEFT, top: TOP } = ICON_GRID;
    const rows = Math.max(1, Math.floor((window.innerHeight - TOP * 2) / CELL_H));
    const taken = (x, y) =>
      this.files.some(f => Math.abs(f.x - x) < CELL_W / 2 && Math.abs(f.y - y) < CELL_H / 2) ||
      this.notes.some(n => x < n.x + n.width && x + 80 > n.x && y < n.y + n.height && y + 100 > n.y) ||
      this.inAnyGroup(x, y, 80, 100);
    for (let col = 0; col < 500; col++) {
      for (let row = 0; row < rows; row++) {
        const x = LEFT + col * CELL_W, y = TOP + row * CELL_H;
        if (!taken(x, y)) return { x, y };
      }
    }
    return { x: LEFT, y: TOP };
  },

  rerenderFile(file) {
    const el = document.getElementById(file.id);
    if (el) el.remove();
    this.createFileElement(file);
    this.updateSelection();
  },

  // 휴지통으로 보내기 (바탕화면 폴더의 진짜 파일 — 되돌리기로는 못 살림)
  // 바탕화면 파일 여럿을 휴지통으로 (Delete 키) — 못 보낸 것은 알림으로
  //   undoEntry: 이 일을 담은 되돌리기 단계 (지우기 전 스냅숏) — 보낸 경로를 적어 두면 Ctrl+Z 로 휴지통에서 되살림 (history.js)
  async trashDesktopFiles(files, { undoEntry = null } = {}) {
    if (!window.canvasAPI || !window.canvasAPI.trashPath) return;
    const failed = [];
    const trashed = [];
    for (const file of files) {
      const result = await window.canvasAPI.trashPath(file.path);
      if (result === true) {
        trashed.push(file.path);
        this.deleteFile(file.id, { undoable: false });
      } else {
        failed.push(file.name);
      }
    }
    this.markTrashStep(undoEntry, trashed);
    if (failed.length) this.showToast(t('toast.trashFail', { name: failed.join(', ') }));
  },

  // 앱 메뉴 '휴지통으로 보내기' (윈도우 메뉴를 못 띄울 때) — Ctrl+Z 로 되살림
  async trashDesktopFile(file) {
    this.record();
    await this.trashDesktopFiles([file], { undoEntry: this.undoStack[this.undoStack.length - 1] });
  },

  // 탐색기에서 끌어다 놓은 파일 → 놓은 자리에 아이콘 (이미 있으면 그 자리로 옮김)
  //   파일 묶음 위에 놓으면 놓은 칸부터 차례로 그 묶음에 들어감 (groups.js)
  async handleFileDrop(e) {
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault();
    if (!window.canvasAPI || !window.canvasAPI.getPathForFile) return;
    const paths = [...e.dataTransfer.files].map(f => window.canvasAPI.getPathForFile(f)).filter(Boolean);
    if (!paths.length) return;
    const items = await window.canvasAPI.describePaths(paths);
    if (!items.length) return;
    this.placeDroppedFiles(items, { x: (e.clientX - this.panX) / this.zoom, y: (e.clientY - this.panY) / this.zoom });
  },

  // 끌어다 놓은 파일들을 at(월드 좌표)부터 4개씩 줄지어 놓음 — 파일 묶음 위면 놓은 칸부터 그 묶음에
  placeDroppedFiles(items, at) {
    this.record();
    const group = this.groupAt(at.x, at.y);
    let index = group ? this.groupDropIndex(group, at.x, at.y) : 0;
    const changedGroups = new Set(group ? [group] : []);
    items.forEach((item, i) => {
      let x = at.x + (i % 4) * ICON_GRID.width;
      let y = at.y + Math.floor(i / 4) * ICON_GRID.height;
      if (this.gridSnapOn() && !group) ({ x, y } = this.snapFilePos(x, y));
      const existing = this.files.find(f => String(f.path).toLowerCase() === item.path.toLowerCase());
      const file = existing || {
        id: this.newId('file'),
        x, y, width: 80, height: 100,
        name: item.name,
        path: item.path,
        icon: item.icon || null,
        isDir: !!item.isDir,
        source: 'link',
      };
      if (existing) {
        existing.x = x;
        existing.y = y;
      } else {
        this.files.push(file);
      }
      // 있던 묶음에서 빼고 (놓은 묶음이 있으면 그 칸에 끼워 넣음)
      const from = existing && this.fileGroup(existing);
      if (from) {
        if (from === group && from.fileIds.indexOf(file.id) < index) index--;
        from.fileIds = from.fileIds.filter(id => id !== file.id);
        changedGroups.add(from);
      }
      if (group) group.fileIds.splice(Math.min(index++, group.fileIds.length), 0, file.id);
      if (existing) this.rerenderFile(existing);
      else this.createFileElement(file);
    });
    changedGroups.forEach(g => this.refreshGroup(g));
    this.scheduleSave();
  },

  deleteFile(id, { undoable = true } = {}) {
    if (undoable) this.record();
    const file = this.files.find(f => f.id === id);
    const group = file && this.fileGroup(file);
    this.files = this.files.filter(f => f.id !== id);
    const el = document.getElementById(id);
    if (el) el.remove();
    this.selection.delete(id);
    if (group) {                                       // 파일 묶음: 뒤 파일이 한 칸씩 당겨짐
      group.fileIds = group.fileIds.filter(x => x !== id);
      this.refreshGroup(group, { slide: true });
    }
    this.scheduleSave();
  },
};

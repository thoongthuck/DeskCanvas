// 파일 아이콘 — 파일 추가 · 바탕화면 폴더와 맞추기 · 탐색기에서 끌어다 놓기 · 휴지통으로 보내기 · 잠금
//   잠근 파일(pinned): 자리를 지킴 — 끌면 화면 이동 · 여럿 끌 때 안 따라옴 (selection.js movableEntry) · Delete 로 안 지움 (groups.js fileLocked)
//     정렬 기준 › · 격자 맞추기에서 제자리 (다른 아이콘이 그 칸을 비켜 감) · 묶음에 넣기 · 쪽지로 바꾸기 메뉴 없음. 열기 · 이름 바꾸기는 그대로
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
      this.log(`파일 고르기 끝: ${picked ? '고름' : '취소'}`);   // 경로는 적지 않음 (main.js logName)
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
    el.classList.toggle('locked', !!file.pinned);     // 잠근 파일: 왼쪽 아래 작은 자물쇠 (styles.css)
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

    // 파일 위에 잠깐 머물면 윈도우 메뉴를 미리 받아 둠 (main.js prepMenu) — 파일 메뉴는 만드는 데 0.15~0.25초라
    //   누르고 떼는 사이(0.1초쯤)만으로는 모자람. 끄는 중 · 이름 바꾸는 중에는 안 함
    let hoverTimer = null;
    el.addEventListener('mouseenter', () => {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        if (file.path && !this.drag && !this.isDragging && !el.classList.contains('renaming')) this.prefetchNativeMenu(this.fileMenuPaths(file));
      }, 50);
    });
    el.addEventListener('mouseleave', () => clearTimeout(hoverTimer));

    // 우클릭: 윈도우 탐색기 메뉴 + 앱 줄 (여럿 고른 것 가운데 하나면 고른 파일 모두, menus.js)
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (el.classList.contains('renaming')) return;
      this.ensureSelected(file.id);
      this.openFileContextMenu(file, e.clientX, e.clientY);
    });

    // 누르면 선택 + 끌어서 옮기기 (잠근 묶음에 든 파일도 — 잠금은 묶음 자체만). Ctrl · Shift: 여러 개 고르기 (selection.js)
    //   잠근 파일은 고르기만 — 끌면 화면 이동 (쪽지 · 사진의 고정과 같음, boards.js startGrabPan)
    el.addEventListener('mousedown', (e) => {
      const canDrag = this.pressSelect(e, file.id);
      if (e.button === 2 && file.path && !el.classList.contains('renaming')) this.prefetchNativeMenu(this.fileMenuPaths(file));   // 메뉴는 뗄 때 뜸 — 그 전에 만들기 시작
      if (e.button !== 0) return;
      e.preventDefault();
      if (file.pinned) {
        this.startGrabPan(e);
        return;
      }
      if (!canDrag) return;
      this.startItemDrag(e, 'file', file);
    });

    this.uiLayer.appendChild(el);
    this.updateFilePosition(el, file);
  },

  // 파일 잠금 · 풀기 (파일 메뉴 · 여러 개 메뉴 — selection.js setSelectionPinned)
  toggleFileLock(file) {
    this.record();
    file.pinned = !file.pinned;
    this.restackLock('file', file);                     // 나중에 잠근 것이 잠근 것들 가운데 위 (layer-order.js)
    const el = document.getElementById(file.id);
    if (el) el.classList.toggle('locked', file.pinned);
    this.scheduleSave();
  },

  // 기본 그림 — 배경 테마가 '어둡게'면 어두운 배경용 그림. 파일 묶음 안은 묶음 종이 색을 따름 (어두운 색으로 고른 묶음만 어두운 배경용)
  useFallbackIcon(img, file) {
    img.classList.add('fallback');
    const group = this.fileGroup(file);
    img.src = fallbackIcon(file, group ? this.groupIsDark(group) : !!this.canvasDark);   // 바탕이 어두우면 (background.js)
  },

  // 하나만 고른 파일은 두 줄을 넘는 이름을 끝까지 펼쳐 보임 (윈도우 바탕화면처럼 — 여럿 고르거나 안 고르면 두 줄에서 …)
  //   펼친 만큼(월드 px)을 el.nameExtra 에 적어 두면 view.js updateFilePosition 이 칸을 그만큼 아래로 늘림 → 파란 칸이 이름을 다 덮음
  //   고르기가 바뀔 때 (notes.js updateSelection) · 이름을 바꾼 뒤 부름
  updateFileNameOpen() {
    const id = this.selection.size === 1 ? [...this.selection][0] : null;
    document.querySelectorAll('.file-icon.name-open').forEach(el => {
      if (el.id === id) return;
      el.classList.remove('name-open');
      el.nameExtra = 0;
      const file = this.files.find(f => f.id === el.id);
      if (file) this.updateFilePosition(el, file);
    });
    const file = id ? this.files.find(f => f.id === id) : null;
    const el = file && document.getElementById(file.id);
    if (!el) return;
    const label = el.querySelector('.file-icon-name');
    el.classList.remove('name-open');                                 // 줄인 채로 재고
    const hidden = label && !el.classList.contains('renaming') ? (label.scrollHeight - label.clientHeight) / this.zoom : 0;
    const extra = hidden > 1 ? Math.ceil(hidden) : 0;
    el.classList.toggle('name-open', extra > 0);
    if (el.nameExtra === extra) return;
    el.nameExtra = extra;
    this.updateFilePosition(el, file);
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
    this.updateFileNameOpen();                                         // 펼친 긴 이름은 접고 이름 칸만
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
      const reopen = () => this.updateFileNameOpen();               // 고른 채면 바뀐 이름 길이로 다시 펼침
      if (!commit || !value || value === file.name) return reopen();
      const oldPath = file.path;
      const oldName = file.name;
      const newBase = value + hiddenExt;
      file.path = oldPath.slice(0, oldPath.length - base.length) + newBase;
      file.name = value;
      label.textContent = value;
      el.title = file.path;
      reopen();
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
      reopen();
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
  //   group: 새로 생긴 파일을 넣을 묶음 id (캔버스 Ctrl+V 로 묶음 하나를 붙여넣을 때 — clipboard.js)
  expectNewDesktopItems(at, group = null) {
    this.pendingNewAt = { at, until: Date.now() + 6000, count: 0, group };
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
  //   list 가 없으면 (폴더를 못 읽음 — main.js listDesktop) 아무것도 하지 않음 — 빈 목록으로 보고 아이콘 배치를 다 지우지 않게
  //   목록에서 사라진 파일은 바로 빼지 않고 2초 뒤 다시 읽어 그때도 없을 때만 뺌 (confirm) — 다른 프로그램이 저장하는 순간 등
  //     잠깐 안 보인 파일의 자리 · 묶음 · 잠금 · 연결선이 날아가지 않게
  //   그때 같은 종류의 파일이 막 새로 생겼으면 (하나씩) 이름만 바뀐 것으로 보고 원래 아이콘이 이어받음 (탐색기에서 이름 바꾸기 등)
  syncDesktop(list, { confirm = false } = {}) {
    if (!Array.isArray(list)) return;
    const key = (p) => String(p || '').toLowerCase();
    const current = new Map(list.map(item => [key(item.path), item]));
    let changed = false;

    const restoring = this.restoringPaths || new Set();              // 휴지통에서 되살리는 중 (history.js)
    const gone = this.files.filter(f => f.source === 'desktop' && !current.has(key(f.path)) && !restoring.has(key(f.path)));
    if (gone.length && !confirm) {
      clearTimeout(this.desktopRecheck);
      this.desktopRecheck = setTimeout(async () => {
        try {
          this.syncDesktop(await window.canvasAPI.listDesktop(), { confirm: true });
        } catch (_) {}
      }, 2000);
    }
    if (gone.length && confirm) {
      const adds = this.recentDesktopAdds || new Map();
      const extOf = (p) => {
        const name = String(p || '').split(/[\\/]/).pop();
        const i = name.lastIndexOf('.');
        return i > 0 ? name.slice(i).toLowerCase() : '';
      };
      const kindOf = (f) => (f.isDir ? 'dir' : `file${extOf(f.path)}`);
      const fresh = this.files.filter(f => f.source === 'desktop' && current.has(key(f.path)) && Date.now() - (adds.get(f.id) || 0) < 15000);
      const renamed = new Set();
      gone.forEach(old => {
        const kind = kindOf(old);
        const same = fresh.filter(f => kindOf(f) === kind);
        if (same.length !== 1 || gone.filter(g => kindOf(g) === kind).length !== 1) return;
        const f = same[0];
        old.path = f.path;                                         // 원래 아이콘이 새 이름을 맡음 — 자리 · 묶음 · 잠금 · 연결선 · 순서 그대로
        old.name = f.name;
        if (f.icon) old.icon = f.icon;
        this.files = this.files.filter(x => x !== f);
        const el = document.getElementById(f.id);
        if (el) el.remove();
        this.selection.delete(f.id);
        renamed.add(old);
        this.rerenderFile(old);
      });
      this.files = this.files.filter(f => {
        if (!gone.includes(f) || renamed.has(f)) return true;
        const el = document.getElementById(f.id);
        if (el) el.remove();
        this.selection.delete(f.id);
        return false;
      });
      changed = true;
    }

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
      (this.recentDesktopAdds = this.recentDesktopAdds || new Map()).set(file.id, Date.now());   // 이름만 바뀐 파일 알아보기 (위 confirm)
      if (pending) created.push(file);
      changed = true;
    });
    if (created.length === 1 && /^(새 |New )/.test(created[0].name)) {
      this.pendingNewAt = null;
      requestAnimationFrame(() => this.startFileRename(created[0]));
    }
    const intoGroup = pending && pending.group && created.length ? this.findBoard(pending.group) : null;
    if (intoGroup && intoGroup.kind === 'group') this.moveFilesToGroup(created, intoGroup);   // 붙여넣은 묶음 속으로

    if (changed) {
      this.cleanGroupMembership();                     // 사라진 파일은 파일 묶음에서도 뺌
      this.refreshGroups();
      this.scheduleSave({ system: true });             // 바탕화면이 바뀐 것은 사용자가 고친 것이 아님
    }
  },

  // 바탕 우클릭 '붙여넣기' · '바로 가기 붙여넣기' — 클립보드의 파일을 바탕화면 폴더로 (main.js paste-files)
  //   새로 생긴 아이콘은 우클릭한 자리에 (expectNewDesktopItems)
  async pasteDesktopFiles(link, at, group = null) {
    const api = window.canvasAPI;
    if (!api || !api.pasteFiles) return;
    if (at) this.expectNewDesktopItems(at, group);
    await api.pasteFiles(link);
  },

  // 바탕 우클릭 '정렬 기준 ›' — 묶음에 들지 않은 파일 아이콘을 왼쪽 위부터 위→아래로 줄 세움 (윈도우 바탕화면처럼)
  //   key: name(이름) · size(크기) · type(항목 유형) · date(수정한 날짜 — 새것 먼저). 폴더가 먼저. 파일 묶음이 차지한 칸은 비움
  //   잠근 파일은 제자리 — 그 칸도 비워 둠
  async arrangeDesktopFiles(key) {
    const files = this.files.filter(f => !this.fileGroup(f) && !f.pinned);
    if (!files.length) return;
    const api = window.canvasAPI;
    const stats = key !== 'name' && api && api.fileStats ? await api.fileStats(files.map(f => f.path)) : [];
    const statOf = new Map((stats || []).map(st => [st.path, st]));
    const collator = new Intl.Collator(this.settings && this.settings.language === 'en' ? 'en' : 'ko', { numeric: true, sensitivity: 'base' });
    const dir = (f) => (f.isDir || (statOf.get(f.path) || {}).isDir ? 1 : 0);
    const ext = (f) => (dir(f) ? '' : (/\.([^.\\/]+)$/.exec(f.name || '') || [])[1] || '').toLowerCase();
    const num = (f, k) => (statOf.get(f.path) || {})[k] || 0;
    const byName = (a, b) => collator.compare(a.name || '', b.name || '');
    const compare = {
      name: byName,
      size: (a, b) => (num(b, 'size') - num(a, 'size')) || byName(a, b),
      type: (a, b) => collator.compare(ext(a), ext(b)) || byName(a, b),
      date: (a, b) => (num(b, 'mtime') - num(a, 'mtime')) || byName(a, b),
    }[key] || byName;
    files.sort((a, b) => (dir(b) - dir(a)) || compare(a, b));

    this.record();
    const taken = this.lockedFileCells(this.groupGridCells());
    const rows = Math.max(1, Math.floor((window.innerHeight - ICON_GRID.top) / ICON_GRID.height));
    let col = 0, row = 0;
    files.forEach(file => {
      while (taken.has(`${col},${row}`)) {
        row++;
        if (row >= rows) { row = 0; col++; }
      }
      const pos = this.cellPos(col, row);
      file.x = pos.x;
      file.y = pos.y;
      taken.add(`${col},${row}`);
      this.updateItemPosition('file', file);
      row++;
      if (row >= rows) { row = 0; col++; }
    });
    this.scheduleSave();
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

  // 잠근 낱개 파일이 놓인 칸 (taken 에 더해서 돌려줌) — 정렬 · 격자 맞추기에서 다른 아이콘이 그 칸을 비켜 감
  lockedFileCells(taken = new Set()) {
    this.files.forEach(f => {
      if (!f.pinned || this.fileGroup(f)) return;
      const c = this.iconCell(f.x, f.y);
      taken.add(`${c.col},${c.row}`);
    });
    return taken;
  },

  // 켤 때: 모든 파일 아이콘을 지금 자리에서 가장 가까운 칸으로 (파일 묶음에 든 파일은 묶음 칸 그대로 · 잠근 파일은 제자리)
  snapAllFilesToGrid() {
    const taken = this.lockedFileCells(this.groupGridCells());   // 묶음이 차지한 칸 · 잠근 파일 칸에는 두지 않음
    this.files.filter(f => !this.fileGroup(f) && !f.pinned)
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
    // 켜고 끈 알림은 띄우지 않음 (메뉴의 체크 표시로 — 사용자 요청)
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

  // ---- 폴더에 넣기 — 파일 아이콘을 폴더 아이콘 위에 끌어다 놓으면 진짜 파일이 그 폴더로 옮겨짐 (윈도우 바탕화면처럼) ----
  //   옮기는 것: 바탕화면에 있는 파일 · 폴더 (끌어온 파일 아이콘은 다른 곳에 있는 파일이라 옮기지 않음). 여럿을 함께 끌면 함께
  //   같은 이름이 폴더에 이미 있으면 덮어쓰지 않고 제자리로 돌려놓음. Ctrl+Z 로 폴더에서 다시 꺼냄 (history.js moved)
  // 그 자리(월드 좌표)의 폴더 아이콘 — skip: 끄는 중인 것들 (자기 자신 위에는 못 놓음)
  //   낱개 폴더(묶음보다 앞 층)는 아이콘 자리로, 파일 묶음에 든 폴더는 그 칸의 가운데로 (groups.js groupFolderAt — 접은 묶음 속은 빼고)
  folderAt(wx, wy, skip) {
    for (let i = this.files.length - 1; i >= 0; i--) {
      const f = this.files[i];
      if (!f.isDir || !f.path || skip.has(f.id) || this.fileGroup(f)) continue;
      const r = this.itemRect('file', f);
      if (wx >= r.x && wy >= r.y && wx <= r.x + r.width && wy <= r.y + r.height) return f;
    }
    const group = this.groupAt(wx, wy);
    const inside = group ? this.groupFolderAt(group, wx, wy) : null;
    return inside && !skip.has(inside.id) ? inside : null;
  },

  // 끄는 동안: 마우스 아래 폴더 아이콘을 파랗게 — 반환: 폴더 위인지 (그동안 파일 묶음에는 끼워 넣지 않음 — drag.js)
  updateFolderDropTarget(drag, clientX, clientY) {
    const dragged = [drag.item, ...(drag.followers || []).filter(f => f.kind === 'file').map(f => f.item)];
    const wx = (clientX - this.panX) / this.zoom;
    const wy = (clientY - this.panY) / this.zoom;
    const folder = drag.item.source === 'desktop' ? this.folderAt(wx, wy, new Set(dragged.map(f => f.id))) : null;
    if ((drag.folderTarget || null) !== folder) {
      this.clearFolderDropTarget(drag);
      drag.folderTarget = folder;
      const el = folder && document.getElementById(folder.id);
      if (el) el.classList.add('drop-folder');
    }
    return !!folder;
  },

  clearFolderDropTarget(drag) {
    const el = drag.folderTarget && document.getElementById(drag.folderTarget.id);
    if (el) el.classList.remove('drop-folder');
    drag.folderTarget = null;
  },

  // 놓았을 때: 폴더 위면 그 폴더로 옮김 → true (아니면 false). 함께 끈 파일도 같이
  settleFilesInFolder(file, drag) {
    const folder = drag.folderTarget;
    this.clearFolderDropTarget(drag);
    if (!folder) return false;
    const entries = [{ item: file, x0: drag.x0, y0: drag.y0 }, ...(drag.followers || []).filter(f => f.kind === 'file')];
    const home = new Map(entries.map(en => [en.item.id, { x: en.x0, y: en.y0 }]));
    const files = entries.map(en => en.item).filter(f => f.source === 'desktop' && f !== folder);
    this.moveFilesIntoFolder(files, folder, { undoEntry: this.undoStack[this.undoStack.length - 1], home, fromGroup: drag.fromGroup, fromIndex: drag.fromIndex });
    return true;
  },

  // 진짜 파일을 폴더로 옮기고 (main.js move-paths) 아이콘을 뺌. 못 옮긴 것은 끌기 전 자리로 되돌리고 알림
  //   undoEntry: 이 끌기의 되돌리기 단계 — 옮긴 경로를 적어 두어 Ctrl+Z 로 다시 꺼냄
  async moveFilesIntoFolder(files, folder, { undoEntry = null, home = new Map(), fromGroup = null, fromIndex = -1 } = {}) {
    const api = window.canvasAPI;
    if (!api || !api.movePaths || !files.length) return;
    const dir = String(folder.path).replace(/[\\/]+$/, '');
    const key = (p) => String(p || '').toLowerCase();
    const pairs = files.map(f => ({ from: f.path, to: `${dir}\\${String(f.path).split(/[\\/]/).pop()}` }));
    let result = { done: [], failed: pairs.map(p => ({ from: p.from, reason: 'error' })) };
    try {
      result = await api.movePaths(pairs);
    } catch (_) {}
    const moved = new Set((result.done || []).map(d => key(d.from)));
    const stayed = [];
    files.forEach(f => {
      if (moved.has(key(f.path))) {
        this.deleteFile(f.id, { undoable: false });
        return;
      }
      const at = home.get(f.id);                       // 못 옮긴 것: 끌기 전 자리로 (묶음에서 꺼냈으면 다시 그 묶음의 그 칸에)
      if (at) {
        f.x = at.x;
        f.y = at.y;
      }
      const group = fromGroup && f.id === files[0].id ? this.findBoard(fromGroup) : null;
      if (group && !group.fileIds.includes(f.id)) {
        group.fileIds.splice(fromIndex >= 0 ? Math.min(fromIndex, group.fileIds.length) : group.fileIds.length, 0, f.id);
      }
      const el = document.getElementById(f.id);
      if (el) this.updateFilePosition(el, f);
      stayed.push(f);
    });
    if (stayed.length) {
      this.refreshGroups();
      const reasons = new Map((result.failed || []).map(x => [key(x.from), x.reason]));
      const all = (r) => stayed.every(f => reasons.get(key(f.path)) === r);
      // copied: 다른 드라이브의 폴더로 사본은 다 옮겼는데 원본을 다 지우지 못함 (main.js moveOne) — 사본이 있다고 알려 줌
      const msg = all('exists') ? 'toast.moveExists' : all('copied') ? 'toast.moveCopied' : 'toast.moveFail';
      this.showToast(t(msg, { name: stayed.map(f => f.name).join(', '), folder: folder.name }));
    }
    this.markMoveStep(undoEntry, result.done || []);
    this.scheduleSave();
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
      if (existing && existing.pinned) return;          // 이미 있는 잠근 파일은 제자리 그대로
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

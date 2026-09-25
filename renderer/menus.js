// 우클릭 메뉴 — 쪽지 메뉴 · 사진 메뉴 · 파일 메뉴 · 캔버스 메뉴(쪽지 추가/판 추가) · 템플릿 · 스타일 창
//   파일 · 빈 바탕 우클릭은 윈도우 탐색기 메뉴 (main.js · native/desktop-bridge.ps1), 캔버스 메뉴는 빈 바탕 두 번 누르기
//   설정 · 종료는 트레이(알림 영역 아이콘) 메뉴에 (main.js)
//   판 메뉴는 boards.js, 사진 틀 고르는 창은 photo-frame.js
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { ICON_DIR } from './constants.js';
import { t } from './i18n.js';

export const menuMethods = {
  // 빈 바탕 우클릭: 윈도우 11 바탕화면 메뉴 모양 (main.js · menu-layout.js) — 못 띄우면 캔버스 메뉴
  //   윈도우가 앱에 주는 바탕 메뉴에는 '새로 만들기 ›' · 디스플레이 설정 · 개인 설정 뿐이라, 탐색기 바탕 메뉴의 나머지는 앱이 채움:
  //     붙여넣기 · 바로 가기 붙여넣기 (클립보드의 파일 → 바탕화면), 보기 › (캔버스 격자 · 자 · 원점), 정렬 기준 › (파일 아이콘 줄 세우기),
  //     새로 고침, 실행 취소 (앱 되돌리기 — 휴지통으로 보낸 파일도 되살림)
  //   role: 윈도우 11 메뉴에서의 자리 (menu-layout.js)
  //   캔버스 메뉴(쪽지 추가 · 판 추가 …)는 빈 바탕을 두 번 눌러서 (app.js)
  async handleContextMenu(e) {
    e.preventDefault();
    const x = e.clientX, y = e.clientY;
    const at = { x: (x - this.panX) / this.zoom, y: (y - this.panY) / this.zoom };
    const api = window.canvasAPI;
    let clip = { files: [] };
    try { if (api && api.clipboardFiles) clip = await api.clipboardFiles(); } catch (_) {}
    const hasFiles = !!(clip && clip.files && clip.files.length);
    const s = this.settings;
    const toggle = (key) => () => this.updateSetting(key, !this.settings[key]);
    const shown = await this.showNativeMenu([], [
      { role: 'paste', label: t('menu.paste'), disabled: !hasFiles, action: () => this.pasteDesktopFiles(false, at) },
      {
        role: 'view', label: t('menu.view'), submenu: [
          { label: t('view.gridSnap'), current: !!s.gridSnap, action: toggle('gridSnap') },
          { label: t('row.grid'), current: !!s.showGrid, action: toggle('showGrid') },
          { label: t('row.align'), current: s.alignGuides !== false, action: toggle('alignGuides') },
          { separator: true },
          ...this.homeMenuItems().map(({ icon, ...rest }) => rest),     // 하위 목록의 다른 줄처럼 그림 없이
        ],
      },
      {
        role: 'sort', label: t('menu.sortBy'),
        submenu: ['name', 'size', 'type', 'date'].map(key => ({ label: t(`sort.${key}`), action: () => this.arrangeDesktopFiles(key) })),
      },
      { role: 'refresh', label: t('menu.refresh'), action: () => this.refreshDesktop() },
      { role: 'pastelink', label: t('menu.pasteShortcut'), disabled: !hasFiles, action: () => this.pasteDesktopFiles(true, at) },
      { role: 'undo', label: t('menu.undo'), key: 'Ctrl+Z', disabled: !this.undoStack.length, action: () => this.undo() },
    ], { at });
    if (!shown) this.openDesktopMenu(x, y);
  },

  // 원점 줄 — 원점으로 · 지금 화면을 원점으로 · (정해 두었으면) 원점 처음대로 (view.js)
  homeMenuItems() {
    const items = [
      { icon: 'style-reset.svg', label: t('menu.goHome'), key: 'Ctrl+0', action: () => this.goHome() },
      { icon: 'pin.svg', label: t('menu.setHome'), action: () => this.setHomeHere() },
    ];
    if (this.home) items.push({ icon: 'set-reset.svg', label: t('menu.resetHome'), action: () => this.resetHome() });
    return items;
  },

  // 윈도우 메뉴로 띄우기 (main.js 'shell-menu') — 앱 메뉴 줄(글자 · 하위 목록 · 할 일)을 윈도우 메뉴 줄로 바꿔 위에 붙임
  //   file: 그 파일의 '이름 바꾸기'를 앱이 받음, at: 빈 바탕 메뉴로 새로 만든 파일을 놓을 자리
  //   반환: 띄웠으면 true, 못 띄웠으면 false (그때는 앱 메뉴로)
  async showNativeMenu(paths, items, { file = null, at = null } = {}) {
    const api = window.canvasAPI;
    if (!api || !api.shellMenu) return false;
    // 윈도우에서 우클릭 한 번에 contextmenu 가 두 번 오기도 함 → 메뉴를 부르는 중(닫힐 때까지)에 온 것은 버림 (메뉴가 두 번 뜨지 않게)
    if (this.nativeMenuBusy) return true;
    this.nativeMenuBusy = true;
    try {
      return await this.showNativeMenuNow(paths, items, { file, at });
    } finally {
      this.nativeMenuBusy = false;
    }
  },

  async showNativeMenuNow(paths, items, { file, at }) {
    const api = window.canvasAPI;
    this.closeMenus();
    const lines = [];
    const actions = new Map();
    let next = 1;
    const walk = (list, parent) => list.forEach(item => {
      if (item.separator) {
        lines.push({ id: next++, parent, label: '', flags: 's' });
        return;
      }
      if (!item.label || item.styleFor || item.panel) return;        // 옆 창이 열리는 줄은 윈도우 메뉴에 못 넣음
      const id = next++;
      lines.push({
        id, parent, label: item.label, flags: (item.disabled ? 'd' : '') + (item.current ? 'c' : ''),
        role: item.role || '', icon: item.icon || '', key: item.key || '',      // 윈도우 11 모양 메뉴의 자리 · 아이콘 · 단축키 글자
      });
      if (item.submenu) walk(item.submenu, id);
      else if (item.action) actions.set(id, item.action);
    });
    walk(items, 0);
    const before = paths.length ? this.snapshot() : null;           // 윈도우 메뉴로 지우면 이 모습으로 되돌림 (history.js)
    let reply = null;
    try {
      reply = await api.shellMenu(paths, lines);
    } catch (_) {
      return false;
    }
    if (!reply) return false;
    if (reply.kind === 'shell' && reply.verb === 'delete' && before) {
      const key = (p) => String(p).toLowerCase();
      const asked = new Set(paths.map(key));
      const desktop = this.files.filter(f => f.source === 'desktop' && asked.has(key(f.path))).map(f => f.path);
      if (desktop.length) this.pushUndoSnapshot(this.markSnapshot(before, 'restore', desktop));
    }
    if (reply.kind === 'app') actions.get(reply.id)?.();
    else if (reply.kind === 'rename' && file) this.startFileRename(file);
    else if (reply.kind === 'shell' && at) this.expectNewDesktopItems(at);
    return true;
  },

  // 쪽지 우클릭 또는 더보기(…)
  openNoteMenu(note, x, y) {
    const items = [
      { icon: 'edit.svg', label: t('menu.edit'), action: () => this.editNote(note) },
      { icon: 'copy.svg', label: t('menu.copy'), action: () => this.duplicateNote(note) },
      { icon: 'pin.svg', label: note.pinned ? t('menu.unpin') : t('menu.pin'), action: () => this.togglePin(note) },
    ];
    if (note.type === 'text' || note.type === 'checklist') {
      items.push(note.image
        ? { icon: 'add-image.svg', label: t('menu.removePhoto'), action: () => this.removeNotePhoto(note) }
        : { icon: 'add-image.svg', label: t('menu.addPhoto'), action: () => this.pickNotePhoto(note) });
    }
    const linkView = this.noteLinkMenuItem(note);          // 글에 인터넷 주소가 있으면: 링크 보기 › 영상 · 사진 바로 보기 · 링크만
    if (linkView) items.push(linkView);
    items.push(...this.linkMenuItems(note.id));            // 연결선 잇기 · 지우기 (links.js)
    items.push({ separator: true });
    items.push({ icon: 'palette.svg', label: t('menu.style'), styleFor: note, arrow: true });
    items.push({ separator: true });
    items.push({ icon: 'trash.svg', label: t('menu.delete'), action: () => this.deleteNote(note.id), danger: true });
    this.openContextMenu(items, x, y);
  },

  // 바탕에 붙인 사진 우클릭 (가이드 13-3) — 영상이면 맨 위에 재생 · 소리 (가이드 17장)
  openPhotoMenu(photo, x, y) {
    const hasCaption = this.photoHasCaptionRoom(photo) && !!photo.caption;    // 종이 · 테이프 · 압정 틀의 캡션
    const video = photo.media === 'video';
    this.openContextMenu([
      ...(video ? [
        { icon: photo.paused ? 'video-play.svg' : 'video-pause.svg', label: t(photo.paused ? 'video.play' : 'video.pause'), action: () => this.toggleVideoPlay(photo.id) },
        { icon: photo.muted ? 'video-sound.svg' : 'video-mute.svg', label: t(photo.muted ? 'video.soundOn' : 'video.soundOff'), action: () => this.toggleVideoSound(photo.id) },
        { separator: true },
        { icon: 'add-video.svg', label: t('menu.replaceVideo'), action: () => this.replaceVideo(photo) },
      ] : [
        { icon: 'add-image.svg', label: t('menu.replacePhoto'), action: () => this.replacePhotoImage(photo) },
      ]),
      hasCaption
        ? { icon: 'edit.svg', label: t('menu.removeCaption'), action: () => this.removePhotoCaption(photo) }
        : { icon: 'edit.svg', label: t('menu.addCaption'), action: () => this.editPhotoCaption(photo) },
      { icon: 'palette.svg', label: t('menu.frame'), arrow: true, panel: (menu, row) => this.openFramePanel(menu, row, photo) },
      { icon: 'pin.svg', label: photo.pinned ? t('menu.unpin') : t('menu.pin'), action: () => this.togglePhotoPin(photo) },
      ...this.linkMenuItems(photo.id),
      { separator: true },
      { icon: 'trash.svg', label: t('menu.delete'), action: () => this.deletePhoto(photo.id), danger: true },
    ], x, y);
  },

  // 파일 아이콘 우클릭: 윈도우 탐색기 메뉴 (열기 · 복사 · 삭제 · 이름 바꾸기 · 속성 …) 위에 앱 줄 (묶음 · 연결선)
  //   여럿 골랐으면 같은 폴더에 있는 고른 파일 모두. 윈도우 메뉴를 못 띄우면 앱 메뉴
  async openFileContextMenu(file, x, y) {
    const multi = this.multiSelected(file.id);
    const shown = file.path && await this.showNativeMenu(this.fileMenuPaths(file), multi ? this.selectionMenuItems() : this.fileMenuItems(file), { file });
    if (shown) return;
    if (multi) this.openSelectionMenu(x, y);
    else this.openFileMenu(file, x, y);
  },

  // 파일 메뉴가 다룰 파일들 — 그 파일, 여럿 골랐으면 같은 폴더에 있는 고른 파일 모두
  fileMenuPaths(file) {
    const folder = (p) => String(p || '').replace(/[\\/][^\\/]*$/, '').toLowerCase();
    const paths = [file.path];
    if (this.multiSelected(file.id)) {
      this.selectedEntries().forEach(en => {
        if (en.kind === 'file' && en.item !== file && en.item.path && folder(en.item.path) === folder(file.path)) paths.push(en.item.path);
      });
    }
    return paths;
  },

  // 오른쪽 단추를 누르는 순간 — 뗄 때 뜰 윈도우 메뉴를 다리가 미리 만들게 (main.js prepMenu). paths: 비었으면 바탕 빈 곳
  prefetchNativeMenu(paths) {
    const api = window.canvasAPI;
    if (api && api.menuPrefetch) api.menuPrefetch(paths);
  },

  // 앱 파일 메뉴 — 윈도우 메뉴를 못 띄울 때 (바탕화면 파일은 휴지통으로 보내기도)
  openFileMenu(file, x, y) {
    this.openContextMenu(this.fileMenuItems(file, { fallback: true }), x, y);
  },

  // 파일 메뉴의 앱 줄 — 묶음에 넣기 › · 묶음에서 빼기 (groups.js) · 연결선 잇기 · 지우기 (links.js)
  //   끌어다 놓은 파일(바탕화면 밖)은 '아이콘 지우기' (파일은 그대로). 지우기 · 휴지통은 윈도우 메뉴에 있음
  //   fallback: 윈도우 메뉴를 못 띄울 때 — 바탕화면 파일은 휴지통으로 보내기도
  fileMenuItems(file, { fallback = false } = {}) {
    const items = [...this.fileGroupMenuItems(file), ...this.linkMenuItems(file.id)];
    const remove = file.source !== 'desktop'
      ? { icon: 'close.svg', label: t('menu.removeIcon'), action: () => this.deleteFile(file.id) }
      : fallback ? { icon: 'trash.svg', label: t('menu.trash'), action: () => this.trashDesktopFile(file), danger: true } : null;
    if (remove) items.push({ separator: true }, remove);
    return items;
  },

  // 쪽지·사진·파일 메뉴 틀 (디자인/팝업/팝업.png)
  openContextMenu(items, x, y) {
    this.closeMenus();

    const menu = document.createElement('div');
    menu.id = 'context-menu';
    menu.style.position = 'fixed';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.zIndex = '2000';

    items.forEach(item => {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'context-menu-separator';
        menu.appendChild(sep);
        return;
      }
      const btn = document.createElement('div');
      btn.className = 'context-menu-item' + (item.danger ? ' danger' : '');

      const img = document.createElement('img');
      img.className = 'context-menu-icon';
      img.src = ICON_DIR + item.icon;
      img.alt = '';
      img.draggable = false;

      const labelSpan = document.createElement('span');
      labelSpan.className = 'context-menu-label';
      labelSpan.textContent = item.label;

      btn.appendChild(img);
      btn.appendChild(labelSpan);

      if (item.arrow) {
        const arrow = document.createElement('img');
        arrow.className = 'context-menu-arrow';
        arrow.src = `${ICON_DIR}chevron.svg`;
        arrow.alt = '';
        arrow.draggable = false;
        btn.appendChild(arrow);
      }

      if (item.styleFor) {
        // 스타일 변경: 마우스를 올리거나 누르면 옆에 스타일 창
        const open = () => { this.closeContextSubmenu(); this.openStylePanel(menu, btn, item.styleFor); };
        btn.addEventListener('mouseenter', open);
        btn.addEventListener('click', open);
      } else if (item.panel) {
        // 틀 바꾸기처럼 옆에 창이 열리는 줄
        const open = () => { this.closeContextSubmenu(); item.panel(menu, btn); };
        btn.addEventListener('mouseenter', open);
        btn.addEventListener('click', open);
      } else if (item.submenu) {
        // 주 시작 요일 › · 교시 수 › — 옆에 고르는 목록
        const open = () => this.openContextSubmenu(menu, btn, item.submenu);
        btn.addEventListener('mouseenter', open);
        btn.addEventListener('click', open);
      } else {
        btn.addEventListener('mouseenter', () => { this.closeStylePanel(); this.closeContextSubmenu(); });
        btn.addEventListener('click', () => {
          this.closeMenus();
          item.action();
        });
      }
      menu.appendChild(btn);
    });

    document.body.appendChild(menu);
    this.keepInWindow(menu);
    this.watchOutsideClick();
  },

  // 우클릭 메뉴의 하위 목록 (같은 모양, 지금 값은 밝게)
  openContextSubmenu(menu, anchor, items) {
    const old = document.getElementById('context-submenu');
    if (old && old.anchorRow === anchor) return;
    this.closeStylePanel();
    this.closeContextSubmenu();
    const sub = document.createElement('div');
    sub.id = 'context-submenu';
    sub.style.position = 'fixed';
    sub.style.zIndex = '2001';
    sub.anchorRow = anchor;
    items.forEach(item => {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'context-menu-separator';
        sub.appendChild(sep);
        return;
      }
      const row = document.createElement('div');
      row.className = 'context-menu-item' + (item.current ? ' open' : '') + (item.disabled ? ' disabled' : '');
      if (item.swatch) {                                  // 색 고르기: 이름 앞에 그 색 동그라미
        const dot = document.createElement('span');
        dot.className = 'context-menu-swatch';
        dot.style.background = item.swatch;
        row.appendChild(dot);
      }
      const label = document.createElement('span');
      label.className = 'context-menu-label';
      label.textContent = item.label;
      row.appendChild(label);
      row.addEventListener('click', () => {
        if (item.disabled) return;
        this.closeMenus();
        item.action();
      });
      sub.appendChild(row);
    });
    document.body.appendChild(sub);
    const m = menu.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    const p = sub.getBoundingClientRect();
    let left = m.right + 6;
    if (left + p.width > window.innerWidth - 4) left = m.left - 6 - p.width;
    sub.style.left = `${left}px`;
    sub.style.top = `${Math.max(4, Math.min(a.top - 8, window.innerHeight - p.height - 4))}px`;
    anchor.classList.add('open');
  },

  closeContextSubmenu() {
    const sub = document.getElementById('context-submenu');
    if (!sub) return;
    if (sub.anchorRow) sub.anchorRow.classList.remove('open');
    sub.remove();
  },

  // ---- 캔버스 메뉴 (가이드 6장) — 빈 바탕 두 번 누르기 (설정 · 종료는 트레이 메뉴로 옮김) ----
  openDesktopMenu(x, y) {
    this.closeMenus();
    // 새 쪽지·파일이 놓일 자리 = 우클릭한 곳 (캔버스 좌표)
    const at = { x: (x - this.panX) / this.zoom, y: (y - this.panY) / this.zoom };
    const menu = this.buildPopup('desktop-menu', [
      { icon: 'add-note.svg', label: t('menu.addNote'), arrow: true,
        onHover: () => { if (!document.getElementById('add-menu')) this.closeAddMenu(); },
        onClick: (row) => this.openAddMenu(menu, row, at) },
      { icon: 'add-board.svg', label: t('menu.addBoard'), arrow: true,
        onHover: () => { if (!document.getElementById('board-add-menu')) this.closeAddMenu(); },
        onClick: (row) => this.openBoardAddMenu(menu, row, at) },
      { icon: this.gridSnapOn() ? 'checkbox-checked.svg' : 'checkbox.svg', label: t('menu.gridMode'), current: this.gridSnapOn(),
        onHover: () => this.closeAddMenu(), onClick: () => { this.closeMenus(); this.toggleGridSnap(); } },
      ...this.homeMenuItems().map(item => ({
        icon: item.icon, label: item.label, onHover: () => this.closeAddMenu(), onClick: () => { this.closeMenus(); item.action(); },
      })),
    ]);
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    this.keepInWindow(menu);
    this.watchOutsideClick();
  },

  // '쪽지 추가'를 누르면 오른쪽에 추가 팝업
  openAddMenu(parent, row, at) {
    if (document.getElementById('add-menu')) return;
    this.closeAddMenu();
    row.classList.add('open');            // 열려 있는 동안 '쪽지 추가' 줄은 호버 배경 유지
    const menu = this.buildPopup('add-menu', [
      { icon: 'add-memo.svg', label: t('menu.addMemo'), onClick: () => { this.closeMenus(); this.addNoteAt(at); } },
      { icon: 'add-image.svg', label: t('menu.addImage'), onClick: () => { this.closeMenus(); this.addImageAt(at); } },
      { icon: 'add-video.svg', label: t('menu.addVideo'), onClick: () => { this.closeMenus(); this.addVideoAt(at); } },
      { icon: 'add-file.svg', label: t('menu.addFile'), onClick: () => { this.closeMenus(); this.addFileAt(at); } },
      { icon: 'add-group.svg', label: t('menu.addGroup'), onClick: () => { this.closeMenus(); this.addGroupAt(at); } },
      { separator: true },
      { icon: 'add-template.svg', label: t('menu.template'), arrow: true, onHover: (r) => this.openTemplateMenu(menu, r, at), onClick: (r) => this.openTemplateMenu(menu, r, at) },
    ]);
    this.placeBeside(menu, parent);
  },

  // '템플릿 ›' 하위 팝업 (가이드 8-2)
  openTemplateMenu(parent, row, at) {
    if (document.getElementById('template-menu')) return;
    row.classList.add('open');
    const menu = this.buildPopup('template-menu', [
      { icon: 'add-code.svg', label: t('menu.codeDark'), onClick: () => { this.closeMenus(); this.addTemplateAt(at, 'codeDark'); } },
      { icon: 'add-code.svg', label: t('menu.codeLight'), onClick: () => { this.closeMenus(); this.addTemplateAt(at, 'codeLight'); } },
      { icon: 'add-markdown.svg', label: t('menu.markdown'), onClick: () => { this.closeMenus(); this.addTemplateAt(at, 'markdown'); } },
      { icon: 'add-meeting.svg', label: t('menu.meeting'), onClick: () => { this.closeMenus(); this.addTemplateAt(at, 'meeting'); } },
    ]);
    this.placeBeside(menu, parent);
  },

  // '판 추가'를 누르면 오른쪽에 캘린더 · 시간표 (가이드 12-1)
  openBoardAddMenu(parent, row, at) {
    if (document.getElementById('board-add-menu')) return;
    this.closeAddMenu();
    row.classList.add('open');
    const menu = this.buildPopup('board-add-menu', [
      { icon: 'add-calendar.svg', label: t('menu.calendar'), onClick: () => { this.closeMenus(); this.addBoardAt(at, 'calendar'); } },
      { icon: 'add-timeline.svg', label: t('menu.timeline'), onClick: () => { this.closeMenus(); this.addBoardAt(at, 'timeline'); } },
    ]);
    this.placeBeside(menu, parent);
  },

  closeAddMenu() {
    ['add-menu', 'template-menu', 'board-add-menu'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
    document.querySelectorAll('#desktop-menu .popup-item.open, #add-menu .popup-item.open').forEach(r => r.classList.remove('open'));
  },

  // 팝업을 다른 팝업 오른쪽에 붙임 (자리가 없으면 왼쪽)
  placeBeside(menu, parent) {
    const m = parent.getBoundingClientRect();
    const p = menu.getBoundingClientRect();
    let left = m.right + 6;
    if (left + p.width > window.innerWidth - 4) left = m.left - 6 - p.width;
    const top = Math.min(Math.max(4, m.top), window.innerHeight - p.height - 4);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  },

  // 바탕화면 메뉴·추가 팝업 공통 틀
  buildPopup(id, items) {
    const menu = document.createElement('div');
    menu.id = id;
    menu.className = 'popup-menu';
    items.forEach(item => {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'popup-separator';
        menu.appendChild(sep);
        return;
      }
      const row = document.createElement('div');
      row.className = 'popup-item' + (item.current ? ' open' : '') + (item.danger ? ' danger' : '');
      if (item.icon) {
        const img = document.createElement('img');
        img.className = 'popup-icon';
        img.src = ICON_DIR + item.icon;
        img.alt = '';
        img.draggable = false;
        row.appendChild(img);
      }
      const label = document.createElement('span');
      label.className = 'popup-label';
      label.textContent = item.label;
      row.appendChild(label);
      if (item.arrow) {
        const arrow = document.createElement('img');
        arrow.className = 'popup-arrow';
        arrow.src = `${ICON_DIR}chevron.svg`;
        arrow.alt = '';
        arrow.draggable = false;
        row.appendChild(arrow);
      }
      if (item.onHover) row.addEventListener('mouseenter', () => item.onHover(row));
      if (item.onClick) row.addEventListener('click', () => item.onClick(row));
      menu.appendChild(row);
    });
    document.body.appendChild(menu);
    return menu;
  },

  // 메뉴 바깥을 누르면 모든 메뉴 닫기
  watchOutsideClick() {
    if (this.menuOutsideHandler) document.removeEventListener('mousedown', this.menuOutsideHandler, true);
    this.menuOutsideHandler = (ev) => {
      const inside = ev.target.closest && ev.target.closest('#context-menu, #context-submenu, #style-panel, #desktop-menu, #add-menu, #template-menu, #board-add-menu, #code-lang-menu, #settings-dropdown');
      if (!inside) this.closeMenus();
    };
    const handler = this.menuOutsideHandler;
    setTimeout(() => {
      if (this.menuOutsideHandler === handler) document.addEventListener('mousedown', handler, true);
    }, 0);
  },

  // 설정 창 드롭다운 — 팝업 메뉴 틀을 그대로 씀 (가이드 7장 권장)
  openDropdown(anchor, items, onPick) {
    this.closeMenus();
    const menu = this.buildPopup('settings-dropdown', items.map(item => ({
      label: item.label,
      current: item.current,
      onClick: () => {
        this.closeMenus();
        onPick(item.value);
      },
    })));
    menu.classList.add('settings-popup');
    const r = anchor.getBoundingClientRect();
    menu.style.minWidth = `${r.width}px`;
    menu.style.left = `${r.left}px`;
    menu.style.top = `${r.bottom + 4}px`;
    this.keepInWindow(menu);
    this.watchOutsideClick();
  },

  closeMenus() {
    this.closeContextSubmenu();
    ['context-menu', 'desktop-menu', 'add-menu', 'template-menu', 'board-add-menu', 'code-lang-menu', 'settings-dropdown'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
    this.closeStylePanel();
    if (this.menuOutsideHandler) {
      document.removeEventListener('mousedown', this.menuOutsideHandler, true);
      this.menuOutsideHandler = null;
    }
  },

  // 화면 밖으로 나가지 않게 위치 보정
  keepInWindow(el) {
    const r = el.getBoundingClientRect();
    if (r.right > window.innerWidth - 4) el.style.left = `${Math.max(4, window.innerWidth - r.width - 4)}px`;
    if (r.bottom > window.innerHeight - 4) el.style.top = `${Math.max(4, window.innerHeight - r.height - 4)}px`;
  },
};

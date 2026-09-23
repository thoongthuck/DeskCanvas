// 우클릭 메뉴 — 쪽지 메뉴 · 사진 메뉴 · 파일 메뉴 · 바탕화면 메뉴(쪽지 추가/판 추가/설정/종료) · 템플릿 · 스타일 창
//   판 메뉴는 boards.js, 사진 틀 고르는 창은 photo-frame.js
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { ICON_DIR } from './constants.js';
import { t } from './i18n.js';

export const menuMethods = {
  // 빈 바탕에서 우클릭: 바탕화면 메뉴
  handleContextMenu(e) {
    e.preventDefault();
    this.openDesktopMenu(e.clientX, e.clientY);
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
    items.push({ separator: true });
    items.push({ icon: 'palette.svg', label: t('menu.style'), styleFor: note, arrow: true });
    items.push({ separator: true });
    items.push({ icon: 'trash.svg', label: t('menu.delete'), action: () => this.deleteNote(note.id), danger: true });
    this.openContextMenu(items, x, y);
  },

  // 바탕에 붙인 사진 우클릭 (가이드 13-3)
  openPhotoMenu(photo, x, y) {
    const hasCaption = photo.frame === 'paper' && !!photo.caption;
    this.openContextMenu([
      { icon: 'add-image.svg', label: t('menu.replacePhoto'), action: () => this.replacePhotoImage(photo) },
      hasCaption
        ? { icon: 'edit.svg', label: t('menu.removeCaption'), action: () => this.removePhotoCaption(photo) }
        : { icon: 'edit.svg', label: t('menu.addCaption'), action: () => this.editPhotoCaption(photo) },
      { icon: 'palette.svg', label: t('menu.frame'), arrow: true, panel: (menu, row) => this.openFramePanel(menu, row, photo) },
      { icon: 'pin.svg', label: photo.pinned ? t('menu.unpin') : t('menu.pin'), action: () => this.togglePhotoPin(photo) },
      { separator: true },
      { icon: 'trash.svg', label: t('menu.delete'), action: () => this.deletePhoto(photo.id), danger: true },
    ], x, y);
  },

  // 파일 아이콘 우클릭: 묶음에 넣기 › · 묶음에서 빼기 (groups.js) · ─ ·
  //   바탕화면 폴더 파일은 휴지통으로, 끌어다 놓은 아이콘은 아이콘만 지우기
  openFileMenu(file, x, y) {
    const item = file.source === 'desktop'
      ? { icon: 'trash.svg', label: t('menu.trash'), action: () => this.trashDesktopFile(file), danger: true }
      : { icon: 'trash.svg', label: t('menu.removeIcon'), action: () => this.deleteFile(file.id), danger: true };
    const groupItems = this.fileGroupMenuItems(file);
    this.openContextMenu(groupItems.length ? [...groupItems, { separator: true }, item] : [item], x, y);
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

  // ---- 바탕화면 메뉴 (가이드 6장) ----
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
      { icon: 'style-reset.svg', label: t('menu.goHome'), onHover: () => this.closeAddMenu(), onClick: () => { this.closeMenus(); this.goHome(); } },
      { separator: true },
      { icon: 'settings.svg', label: t('menu.settings'), onHover: () => this.closeAddMenu(), onClick: () => { this.closeMenus(); this.openSettings(); } },
      { separator: true },
      { icon: 'power.svg', label: t('menu.quit'), onHover: () => this.closeAddMenu(), onClick: () => { this.closeMenus(); this.requestQuit(); } },
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

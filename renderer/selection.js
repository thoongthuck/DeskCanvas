// 여러 개 선택 — 쪽지 · 사진 · 파일 아이콘 · 파일 묶음을 한꺼번에 고르고 · 옮기고 · 묶고 · 지우기
//   고르기: Ctrl · Shift 를 누른 채 누르면 하나씩 더하거나 빼기
//           Ctrl · Shift 를 누른 채 빈 곳을 끌면 네모에 걸친 것 모두 (그냥 끌면 예전처럼 화면 이동) · Ctrl+A 모두
//   고른 것 가운데 하나를 끌면 모두 함께 옮겨짐 — 판에 붙은 쪽지 · 고정한 것 · 묶음 안 파일(묶음이 옮김)은 제자리
//   파일을 여럿 끌어 파일 묶음 위에 놓으면 한꺼번에 들어감 (groups.js settleFileInGroup)
//   고른 것 위에서 우클릭: 새 묶음으로 묶기(Ctrl+G) · 묶음에 넣기 › · 연결선으로 잇기(Ctrl+L) · 지우기 · 선택 해제
//   Delete: 고른 쪽지 · 사진 지우기, 고른 묶음은 풀기 (파일 아이콘은 그대로 — 되돌리기 한 번에). Esc: 선택 풀기
//   this.selection (Set) 이 고른 것 전부. 예전 코드의 this.selectedId 는 '마지막으로 고른 것' (app.js)
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { t } from './i18n.js';

const MARQUEE_MIN = 3;                              // 이보다 작게 끌면 네모로 고르지 않음 (그냥 누르기)

export const selectionMethods = {
  // 여러 개를 고른 상태에서 그중 하나인지
  multiSelected(id) {
    return this.selection.size > 1 && this.selection.has(id);
  },

  // 누를 때 (mousedown) — 반환: 이어서 끌기를 시작해도 되는지
  //   Ctrl · Shift + 왼쪽 누르기: 더하거나 빼기 (뺐으면 끌지 않음)
  //   이미 고른 것 중 하나: 그대로 둠 (모두 함께 끌 수 있게) — 끌지 않고 떼면 그것 하나만 고름 (drag.js)
  //   그 밖: 그것 하나만. eligible = false (고정한 것 등): 더하기 없이 그것 하나만
  pressSelect(e, id, eligible = true) {
    this.narrowTo = null;
    const adding = e.button === 0 && (e.ctrlKey || e.shiftKey || e.metaKey);
    if (adding && eligible) {
      if (this.selection.has(id)) {
        this.selection.delete(id);
        this.updateSelection();
        return false;
      }
      this.selection.add(id);
      this.updateSelection();
      return true;
    }
    if (this.multiSelected(id)) {
      if (e.button === 0) this.narrowTo = id;
      return true;
    }
    this.selectItem(id);
    return true;
  },

  // 우클릭: 이미 고른 것 중 하나면 그대로 (여러 개 메뉴), 아니면 그것만
  ensureSelected(id) {
    if (!this.selection.has(id)) this.selectItem(id);
  },

  // 반환: 풀 것이 있었는지 (Esc 가 씀)
  clearSelection() {
    if (!this.selection.size) return false;
    this.selection.clear();
    this.updateSelection();
    return true;
  },

  // id → { kind, item } (판 가운데는 파일 묶음만 고를 수 있음)
  itemById(id) {
    const note = this.notes.find(n => n.id === id);
    if (note) return { kind: 'note', item: note };
    const photo = this.photos.find(p => p.id === id);
    if (photo) return { kind: 'photo', item: photo };
    const file = this.files.find(f => f.id === id);
    if (file) return { kind: 'file', item: file };
    const group = this.boards.find(b => b.id === id && b.kind === 'group');
    if (group) return { kind: 'board', item: group };
    return null;
  },

  selectedEntries() {
    return [...this.selection].map(id => this.itemById(id)).filter(Boolean);
  },

  // 함께 옮길 수 있는 것 — 판에 붙은 쪽지 · 고정한 것 · 묶음 안 파일(묶음이 옮김) · 잠근 묶음은 제자리
  movableEntry(kind, item) {
    if (kind === 'note') return !item.pinned && !item.boardId;
    if (kind === 'photo') return !item.pinned;
    if (kind === 'file') return !this.fileGroup(item);
    if (kind === 'board') return item.kind === 'group' && !item.pinned;
    return false;
  },

  // 끌기 시작 (drag.js startItemDrag): 여럿을 골랐고 잡은 것이 옮길 수 있으면, 나머지도 같은 만큼 따라오게
  followersFor(kind, item) {
    if (!this.multiSelected(item.id) || !this.movableEntry(kind, item)) return [];
    return this.selectedEntries()
      .filter(en => en.item !== item && this.movableEntry(en.kind, en.item))
      .map(en => ({ ...en, x0: en.item.x, y0: en.item.y }));
  },

  // Ctrl+A — 보이는 것 모두 (다른 달에 붙어 숨은 쪽지 · 접은 묶음 속 파일 · 고정한 것 빼고)
  selectAll() {
    this.selection.clear();
    this.notes.forEach(n => { if (!n.pinned && !this.noteBoardState(n).hidden) this.selection.add(n.id); });
    this.photos.forEach(p => { if (!p.pinned) this.selection.add(p.id); });
    this.files.forEach(f => {
      const slot = this.fileSlot(f);
      if (!(slot && slot.hidden)) this.selection.add(f.id);
    });
    this.fileGroups().forEach(g => { if (!g.pinned) this.selection.add(g.id); });
    this.updateSelection();
  },

  // ---- 네모로 고르기 (Ctrl · Shift + 빈 곳 끌기, view.js) ----
  startMarquee(e) {
    e.preventDefault();
    const base = new Set(this.selection);                // 누르기 전에 고른 것에 더해 감
    const x0 = e.clientX;
    const y0 = e.clientY;
    const box = document.createElement('div');
    box.id = 'marquee';
    document.body.appendChild(box);
    let last = null;
    let frame = null;
    const apply = () => {
      frame = null;
      if (!last || Math.hypot(last.x - x0, last.y - y0) < MARQUEE_MIN) return;
      const left = Math.min(x0, last.x);
      const top = Math.min(y0, last.y);
      const width = Math.abs(last.x - x0);
      const height = Math.abs(last.y - y0);
      Object.assign(box.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`, display: 'block' });
      const rect = { x: (left - this.panX) / this.zoom, y: (top - this.panY) / this.zoom, width: width / this.zoom, height: height / this.zoom };
      this.selection.clear();
      base.forEach(id => this.selection.add(id));
      this.itemsInRect(rect).forEach(id => this.selection.add(id));
      this.updateSelection();
    };
    const move = (ev) => {
      last = { x: ev.clientX, y: ev.clientY };
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      if (frame) cancelAnimationFrame(frame);
      apply();
      box.remove();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  },

  // 네모(월드 좌표)에 든 것 — 쪽지 · 사진 · 파일은 조금이라도 걸치면 (윈도우 바탕화면처럼),
  //   파일 묶음은 크니까 네모 안에 다 들어와야 (옆 파일을 고르다 묶음까지 딸려 오지 않게)
  itemsInRect(r) {
    const touches = (b) => b.x < r.x + r.width && b.x + b.width > r.x && b.y < r.y + r.height && b.y + b.height > r.y;
    const inside = (b) => b.x >= r.x && b.y >= r.y && b.x + b.width <= r.x + r.width && b.y + b.height <= r.y + r.height;
    const ids = [];
    this.notes.forEach(n => { if (!n.pinned && !this.noteBoardState(n).hidden && touches(this.itemRect('note', n))) ids.push(n.id); });
    this.photos.forEach(p => { if (!p.pinned && touches(this.itemRect('photo', p))) ids.push(p.id); });
    this.files.forEach(f => {
      const slot = this.fileSlot(f);
      if (!(slot && slot.hidden) && touches(this.itemRect('file', f))) ids.push(f.id);
    });
    this.fileGroups().forEach(g => { if (!g.pinned && inside(this.itemRect('board', g))) ids.push(g.id); });
    return ids;
  },

  // ---- 여러 개 메뉴 (고른 것 위에서 우클릭) ----
  openSelectionMenu(x, y) {
    const entries = this.selectedEntries();
    const files = entries.filter(en => en.kind === 'file' && !this.fileLocked(en.item)).map(en => en.item);
    const removable = entries.filter(en => (en.kind === 'note' || en.kind === 'photo') && !en.item.pinned);
    const groups = this.fileGroups().filter(g => !g.pinned);
    const items = [];
    if (files.length) {
      items.push({ icon: 'add-group.svg', label: t('menu.groupSelected', { n: files.length }), action: () => this.groupSelectedFiles() });
      if (groups.length) {
        items.push({
          icon: 'add-group.svg', label: t('menu.putInGroup'), arrow: true,
          submenu: groups.map(g => ({ label: this.groupLabel(g), action: () => this.moveFilesToGroup(files, g) })),
        });
      }
    }
    if (entries.length > 1) {                               // 처음 고른 것에 나머지를 잇기 (links.js)
      items.push({ icon: 'menu-connect.svg', label: t('menu.connectSelected', { n: entries.length }), action: () => this.connectSelection() });
    }
    if (removable.length) {
      if (items.length) items.push({ separator: true });
      items.push({ icon: 'trash.svg', label: t('menu.deleteSelected', { n: removable.length }), danger: true, action: () => this.deleteSelection() });
    }
    if (items.length) items.push({ separator: true });
    items.push({ icon: 'close.svg', label: t('menu.clearSelection', { n: entries.length }), action: () => this.clearSelection() });
    this.openContextMenu(items, x, y);
  },

  // 고른 파일들로 새 묶음 (Ctrl+G · 여러 개 메뉴)
  groupSelectedFiles() {
    const files = this.selectedEntries().filter(en => en.kind === 'file' && !this.fileLocked(en.item)).map(en => en.item);
    if (!files.length) return false;
    this.newGroupWithFiles(files);
    return true;
  },

  // 고른 쪽지 · 사진 지우기 (Delete 는 고른 묶음도 풀기) — 되돌리기 한 번에 모두 돌아옴
  deleteSelection({ includeGroups = false } = {}) {
    const entries = this.selectedEntries();
    const notes = entries.filter(en => en.kind === 'note' && !en.item.pinned);
    const photos = entries.filter(en => en.kind === 'photo' && !en.item.pinned);
    const groups = includeGroups ? entries.filter(en => en.kind === 'board' && !en.item.pinned) : [];
    if (!notes.length && !photos.length && !groups.length) return false;
    this.record();
    this.batching = true;                                      // 안에서 부르는 record() 는 건너뜀 (history.js)
    try {
      notes.forEach(en => this.deleteNote(en.item.id));
      photos.forEach(en => this.deletePhoto(en.item.id));
      groups.forEach(en => this.ungroup(en.item));
    } finally {
      this.batching = false;
    }
    this.clearSelection();
    return true;
  },
};

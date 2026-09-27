// 단축키와 붙여넣기 — Ctrl+Z · Ctrl+Shift+Z · Ctrl+S · Ctrl+F · Ctrl+M · Ctrl+A · Ctrl+G · Ctrl+L · F2 · Delete · Shift+Enter(글자칸에서) · Ctrl+C · Ctrl+V · Esc
//   캔버스 오브젝트 복사 · 붙여넣기는 clipboard.js
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { t } from './i18n.js';
import { IS_MAC } from './constants.js';

export const keyboardMethods = {
  setupKeyboard() {
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    document.addEventListener('paste', (e) => this.handlePaste(e));
    document.addEventListener('mousemove', (e) => { this.lastMouse = { x: e.clientX, y: e.clientY }; }, { passive: true });
  },

  // 글자를 입력하고 있는 중인지 (그때는 단축키를 가로채지 않음)
  isTyping(target) {
    return !!(target && target.matches && target.matches('input, textarea') && !target.readOnly);
  },

  handleKeyDown(e) {
    if (e.isComposing || e.keyCode === 229) return;
    const ctrl = e.ctrlKey || (IS_MAC && e.metaKey);
    const key = (e.key || '').toLowerCase();

    if (key === 'escape') {
      if (this.cancelLinking()) { e.preventDefault(); return; }     // 연결선 잇는 중 (links.js)
      if (this.closeSearch()) { e.preventDefault(); return; }
      if (this.calendarFan) { e.preventDefault(); this.collapseCalendarFan(); return; }
      if (this.settingsOpen) { e.preventDefault(); this.closeSettings(); return; }
      if (document.getElementById('context-menu') || document.getElementById('desktop-menu')) { this.closeMenus(); return; }
      if (this.editingId) { e.preventDefault(); this.stopEditing(); return; }
      if (this.selectedLinkId) { e.preventDefault(); this.selectLink(null); return; }
      if (this.clearSelection()) e.preventDefault();                // 고른 것 풀기
      return;
    }
    if (this.settingsOpen) return;

    const typing = this.isTyping(e.target);

    if (ctrl && key === 'z') {
      if (typing) return;                        // 글자칸 안에서는 글자 되돌리기(브라우저 기본)
      e.preventDefault();
      if (e.shiftKey) this.redo(); else this.undo();
      return;
    }
    if (ctrl && key === 'y') {
      if (typing) return;
      e.preventDefault();
      this.redo();
      return;
    }
    if (ctrl && key === 's') {
      e.preventDefault();
      this.saveNow();
      return;
    }
    if (ctrl && key === 'f') {                            // 찾기 (쪽지 · 파일 이름)
      e.preventDefault();
      this.openSearch();
      return;
    }
    if (ctrl && key === 'a' && !typing) {                 // 모두 고르기 (글자칸에서는 글자 전체 고르기)
      e.preventDefault();
      this.selectAll();
      return;
    }
    if (ctrl && key === 'c' && !typing && this.selection.size) {   // 고른 것 복사 (clipboard.js) — 고른 글자가 있으면 글자 복사
      const picked = window.getSelection && String(window.getSelection() || '');
      if (!picked && this.copySelection()) e.preventDefault();
      return;
    }
    if (ctrl && !typing && (e.code === 'BracketRight' || e.code === 'BracketLeft')) {   // 순서: ] 앞으로 · [ 뒤로, Shift 는 맨 끝까지 (layer-order.js)
      e.preventDefault();
      const up = e.code === 'BracketRight';
      this.reorderSelection(e.shiftKey ? (up ? 'front' : 'back') : (up ? 'forward' : 'backward'));
      return;
    }
    if (ctrl && key === 'g' && !typing) {                 // 고른 파일을 새 묶음으로
      e.preventDefault();
      this.groupSelectedFiles();
      return;
    }
    if (ctrl && key === 'l' && !typing) {                 // 처음 고른 것에 나머지를 연결선으로 (links.js)
      e.preventDefault();
      this.connectSelection();
      return;
    }
    if (ctrl && key === 'm') {                            // 미니맵 켜기 · 끄기
      e.preventDefault();
      this.toggleMinimap();
      return;
    }
    if (ctrl && (key === '0' || key === 'home')) {        // 원점으로 (정해 둔 화면 · 없으면 처음 자리 100%, view.js)
      e.preventDefault();
      this.goHome();
      return;
    }
    if (key === 'f2' && !typing) {                         // 고른 것 이름 바꾸기 (윈도우 바탕화면처럼)
      if (this.renameSelected()) e.preventDefault();
      return;
    }
    if (key === 'delete' && !typing) {
      if (this.deleteSelectedItem()) e.preventDefault();
    }
  },

  // F2: 마지막으로 고른 것 이름 바꾸기 — 파일은 이름 칸, 파일 묶음은 이름, 쪽지는 제목 고치기, 사진 · 영상은 캡션
  renameSelected() {
    const board = this.selectedId && this.boards.find(b => b.id === this.selectedId);
    if (board) {                                           // 캘린더 · 연대표 · 파일 묶음 — 판 이름
      this.renameBoard(board);
      return true;
    }
    const entry = this.selectedId && this.itemById(this.selectedId);
    if (!entry) return false;
    const { kind, item } = entry;
    if (kind === 'file') this.startFileRename(item);
    else if (kind === 'board') this.renameBoard(item);
    else if (kind === 'note') this.startEditing(item, item.type === 'markdown' ? '' : 'note-title');   // 마크다운 셀은 제목 칸 없음 — 본문
    else if (kind === 'photo') this.editPhotoCaption(item);
    else return false;
    return true;
  },

  // Delete: 고른 연결선 지우기, 아니면 고른 쪽지·사진 지우기 · 파일 묶음은 풀기 · 캘린더 · 연대표 판 지우기 · 바탕화면 파일은 휴지통으로
  //   (끌어온 파일은 아이콘만 빼기, 고정된 것은 그대로 — selection.js)
  deleteSelectedItem() {
    if (this.selectedLinkId) return this.deleteLink(this.selectedLinkId);
    return this.deleteSelection({ includeBoards: true, includeFiles: true });
  },

  // 붙여넣을 자리 = 마우스가 있는 곳
  pasteAt() {
    const p = this.lastMouse || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    return { x: (p.x - this.panX) / this.zoom, y: (p.y - this.panY) / this.zoom };
  },

  // Ctrl+V — 캔버스에서 복사해 둔 것이 먼저 (그 뒤로 클립보드가 그대로일 때, clipboard.js)
  //   아니면 사진 → 사진 붙이기 (수정 중인 쪽지면 쪽지 사진) · 글 → 새 쪽지 · 탐색기에서 복사한 파일 → 바탕화면에
  async handlePaste(e) {
    if (this.settingsOpen) return;
    const data = e.clipboardData;
    if (!data) return;
    const typing = this.isTyping(e.target);
    const at = this.pasteAt();

    // 클립보드 내용은 이 순간에만 읽을 수 있어서 먼저 꺼내 둠
    const imageItem = [...(data.items || [])].find(i => i.kind === 'file' && i.type.startsWith('image/'));
    const imageFile = imageItem ? imageItem.getAsFile() : null;
    const text = data.getData('text/plain');
    const editingNote = this.editingId ? this.notes.find(n => n.id === this.editingId) : null;
    if (!typing) e.preventDefault();

    if (!typing && this.canvasClip && await this.canvasClipCurrent()) {
      this.pasteCanvasClip(at);
      return;
    }

    if (imageFile) {
      if (typing) e.preventDefault();
      const url = await this.saveImageBlob(imageFile);
      if (!url) return;
      if (editingNote) this.setNotePhoto(editingNote, url);           // 수정 중인 쪽지에 사진 넣기
      else await this.addPhotoAt(at, url);                            // 바탕에 사진 붙이기
      return;
    }

    if (typing) return;                                               // 글자칸에서는 그대로 붙여넣기
    if (text && text.trim()) {
      this.addNoteAt(at, { content: text.replace(/\r\n/g, '\n') }, { edit: false });
      return;
    }
    // 탐색기에서 복사한 파일 — 바탕화면 폴더에 붙여넣기 (빈 바탕 우클릭 '붙여넣기' 와 같음)
    const api = window.canvasAPI;
    try {
      const clip = api && api.clipboardFiles ? await api.clipboardFiles() : null;
      if (clip && clip.files && clip.files.length) this.pasteDesktopFiles(false, at);
    } catch (_) {}
  },

  // 붙여넣은 그림을 앱 데이터 폴더에 저장하고 주소를 받음
  async saveImageBlob(file) {
    if (!window.canvasAPI || !window.canvasAPI.saveImageData) return null;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      return await window.canvasAPI.saveImageData(bytes, file.type || 'image/png');
    } catch (err) {
      console.error('붙여넣은 그림을 저장하지 못했어요:', err);
      return null;
    }
  },

  // 코드 칸 복사 버튼
  async copyText(text) {
    try {
      if (window.canvasAPI && window.canvasAPI.copyText) return await window.canvasAPI.copyText(text);
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error('복사하지 못했어요:', err);
      return false;
    }
  },
};

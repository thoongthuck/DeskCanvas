// 단축키와 붙여넣기 — Ctrl+Z · Ctrl+Shift+Z · Ctrl+S · Ctrl+F · Ctrl+M · Ctrl+A · Ctrl+G · Ctrl+L · Delete · Shift+Enter(글자칸에서) · Ctrl+V · Esc
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { t } from './i18n.js';

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
    const ctrl = e.ctrlKey || e.metaKey;
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
    if (ctrl && (key === '0' || key === 'home')) {        // 원점으로 (화면 처음 자리 · 100%)
      e.preventDefault();
      this.goHome();
      return;
    }
    if (key === 'delete' && !typing) {
      if (this.deleteSelectedItem()) e.preventDefault();
    }
  },

  // Delete: 고른 연결선 지우기, 아니면 고른 쪽지·사진 지우기 · 파일 묶음은 풀기 (파일은 그대로).
  //   고정된 것과 파일 아이콘은 그대로 (selection.js)
  deleteSelectedItem() {
    if (this.selectedLinkId) return this.deleteLink(this.selectedLinkId);
    return this.deleteSelection({ includeGroups: true });
  },

  // 붙여넣을 자리 = 마우스가 있는 곳
  pasteAt() {
    const p = this.lastMouse || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    return { x: (p.x - this.panX) / this.zoom, y: (p.y - this.panY) / this.zoom };
  },

  async handlePaste(e) {
    if (this.settingsOpen) return;
    const data = e.clipboardData;
    if (!data) return;

    const imageItem = [...(data.items || [])].find(i => i.kind === 'file' && i.type.startsWith('image/'));
    const editingNote = this.editingId ? this.notes.find(n => n.id === this.editingId) : null;

    if (imageItem) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      const url = file ? await this.saveImageBlob(file) : null;
      if (!url) return;
      if (editingNote) this.setNotePhoto(editingNote, url);           // 수정 중인 쪽지에 사진 넣기
      else await this.addPhotoAt(this.pasteAt(), url);                // 바탕에 사진 붙이기
      return;
    }

    if (this.isTyping(e.target)) return;                              // 글자칸에서는 그대로 붙여넣기
    const text = data.getData('text/plain');
    if (!text || !text.trim()) return;
    e.preventDefault();
    this.addNoteAt(this.pasteAt(), { content: text.replace(/\r\n/g, '\n') }, { edit: false });
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

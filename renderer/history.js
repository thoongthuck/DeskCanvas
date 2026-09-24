// 되돌리기 · 다시 실행 (Ctrl+Z · Ctrl+Shift+Z)
// 방식: 무언가 바뀌기 직전의 쪽지·사진·파일 상태를 통째로 저장해 두었다가 그대로 되돌림
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)

const LIMIT = 100;                      // 기억해 두는 단계 수

export const historyMethods = {
  // 지금 상태 (파일 아이콘 그림은 빼고 — 용량이 크고 되돌릴 필요도 없음)
  snapshot() {
    return JSON.stringify({
      notes: this.notes,
      photos: this.photos,
      boards: this.boards,
      files: this.files.map(({ icon, ...rest }) => rest),
      links: this.links,
    });
  },

  // 바뀌기 직전에 부름
  //   batching: 여러 개를 한꺼번에 지울 때처럼 한 단계로 묶는 동안은 건너뜀 (selection.js)
  record() {
    if (!this.ready || this.batching) return;
    const snap = this.snapshot();
    if (this.undoStack[this.undoStack.length - 1] === snap) return;
    this.undoStack.push(snap);
    if (this.undoStack.length > LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.typingRecorded = false;
  },

  // 새벽에 만든 모듈에서 쓰는 이름 (같은 기능)
  recordHistory() {
    this.record();
    this.lastRecorded = this.undoStack[this.undoStack.length - 1];
  },

  // 색을 고르다 취소해서 바뀐 게 없으면 방금 저장한 단계를 버림
  dropHistoryIfUnchanged() {
    const top = this.undoStack[this.undoStack.length - 1];
    if (top !== undefined && top === this.snapshot()) this.undoStack.pop();
  },

  // 글자를 고치는 동안에는 한 번만 저장 (한 번의 수정 = 한 단계)
  recordTyping() {
    if (this.typingRecorded) return;
    this.record();
    this.typingRecorded = true;
  },

  undo() {
    if (this.editingId) this.stopEditing();
    if (!this.undoStack.length) return false;
    const current = this.snapshot();
    this.applySnapshot(this.undoStack.pop());
    this.redoStack.push(current);
    return true;
  },

  redo() {
    if (this.editingId) this.stopEditing();
    if (!this.redoStack.length) return false;
    const current = this.snapshot();
    this.applySnapshot(this.redoStack.pop());
    this.undoStack.push(current);
    return true;
  },

  applySnapshot(json) {
    const snap = JSON.parse(json);
    const before = this.files;
    const iconOf = new Map(before.map(f => [String(f.path).toLowerCase(), f.icon]));
    const desktopNow = new Map(before.filter(f => f.source === 'desktop').map(f => [String(f.path).toLowerCase(), f]));

    this.notes = (snap.notes || []).map(n => this.normalizeNote(n));
    // 영상의 재생 · 소리는 되돌리기와 상관없이 지금 값 그대로 (photos.js)
    const playing = new Map(this.photos.filter(p => p.media === 'video').map(p => [p.id, { paused: p.paused, muted: p.muted }]));
    this.photos = (snap.photos || []).map(p => this.normalizePhoto({ ...p, ...playing.get(p.id) }));
    this.boards = (snap.boards || []).map(b => this.normalizeBoard(b)).filter(Boolean);

    // 파일 아이콘: 바탕화면에서 이미 사라진 파일은 되살리지 않고, 새로 생긴 파일은 그대로 둠
    const restored = (snap.files || [])
      .filter(f => f.source !== 'desktop' || desktopNow.has(String(f.path).toLowerCase()))
      .map(f => ({ ...f, icon: f.icon || iconOf.get(String(f.path).toLowerCase()) || null }));
    const known = new Set(restored.map(f => String(f.path).toLowerCase()));
    desktopNow.forEach((file, key) => { if (!known.has(key)) restored.push(file); });
    this.files = restored;
    this.links = this.normalizeLinks(snap.links);
    if (!this.links.some(l => l.id === this.selectedLinkId)) this.selectedLinkId = null;

    [...this.selection].forEach(id => { if (!this.findItem(id)) this.selection.delete(id); });
    this.renderAll();
    this.scheduleSave();
  },

  // id 로 쪽지·사진·파일·판 찾기
  findItem(id) {
    return this.notes.find(n => n.id === id)
      || this.photos.find(p => p.id === id)
      || this.files.find(f => f.id === id)
      || this.boards.find(b => b.id === id)
      || null;
  },
};

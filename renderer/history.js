// 되돌리기 · 다시 실행 (Ctrl+Z · Ctrl+Shift+Z)
// 방식: 무언가 바뀌기 직전의 쪽지·사진·파일 상태를 통째로 저장해 두었다가 그대로 되돌림
//   바탕화면 파일을 휴지통으로 보낸 단계는 그 경로를 적어 둠 (restore) → 되돌리면 휴지통에서 원래 자리로 되살리고
//   (자리 · 묶음 · 연결선도 그대로), 다시 실행하면 (retrash) 다시 휴지통으로
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)

import { t } from './i18n.js';

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
    const entry = this.undoStack.pop();
    const restore = JSON.parse(entry).restore || [];
    if (restore.length) this.holdRestoring(restore);         // 되살리는 동안 바탕화면 감시가 아이콘을 지우지 않게
    this.applySnapshot(entry);
    this.redoStack.push(restore.length ? this.markSnapshot(current, 'retrash', restore) : current);
    if (restore.length) this.restoreTrashed(restore);
    return true;
  },

  redo() {
    if (this.editingId) this.stopEditing();
    if (!this.redoStack.length) return false;
    const current = this.snapshot();
    const entry = this.redoStack.pop();
    const retrash = JSON.parse(entry).retrash || [];
    this.applySnapshot(entry);
    this.undoStack.push(retrash.length ? this.markSnapshot(current, 'restore', retrash) : current);
    if (retrash.length) {
      const key = (p) => String(p).toLowerCase();
      const again = new Set(retrash.map(key));
      this.trashDesktopFiles(this.files.filter(f => f.source === 'desktop' && again.has(key(f.path))));
    }
    return true;
  },

  // 스냅숏에 표시 더하기 — restore: 되돌릴 때 휴지통에서 되살릴 경로, retrash: 다시 실행할 때 다시 휴지통으로 보낼 경로
  markSnapshot(json, key, paths) {
    const data = JSON.parse(json);
    data[key] = [...new Set([...(data[key] || []), ...paths])];
    return JSON.stringify(data);
  },

  // 휴지통으로 보낸 단계에 표시 (trashDesktopFiles · 윈도우 메뉴 '삭제') — 그 단계가 아직 되돌리기 목록에 있을 때만
  markTrashStep(entry, paths) {
    if (!entry || !paths.length) return;
    const i = this.undoStack.lastIndexOf(entry);
    if (i >= 0) this.undoStack[i] = this.markSnapshot(entry, 'restore', paths);
  },

  // 미리 떠 둔 스냅숏을 한 단계로 (윈도우 메뉴로 지운 뒤 — 지우기 전 모습)
  pushUndoSnapshot(json) {
    if (!this.ready) return;
    this.undoStack.push(json);
    if (this.undoStack.length > LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.typingRecorded = false;
  },

  holdRestoring(paths) {
    this.restoringPaths = this.restoringPaths || new Set();
    paths.forEach(p => this.restoringPaths.add(String(p).toLowerCase()));
  },

  // 휴지통에서 되살리기 (main.js 'restore-trashed') — 못 되살린 것(휴지통을 비움 · 아주 지움)은 알림, 그리고 바탕화면을 다시 읽음
  async restoreTrashed(paths) {
    this.holdRestoring(paths);
    let failed = paths;
    try {
      const api = window.canvasAPI;
      if (api && api.restoreTrashed) failed = (await api.restoreTrashed(paths)).failed || [];
    } catch (_) {}
    paths.forEach(p => this.restoringPaths.delete(String(p).toLowerCase()));
    if (failed.length) this.showToast(t('toast.restoreFail', { name: failed.map(p => String(p).split(/[\\/]/).pop()).join(', ') }));
    await this.refreshDesktop();
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
    const restoring = this.restoringPaths || new Set();              // 휴지통에서 되살리는 중인 파일은 남겨 둠
    const restored = (snap.files || [])
      .filter(f => f.source !== 'desktop' || desktopNow.has(String(f.path).toLowerCase()) || restoring.has(String(f.path).toLowerCase()))
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

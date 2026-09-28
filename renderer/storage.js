// 저장 — 자동 저장 / Ctrl+S / 종료할 때 확인 / 마지막 작업 공간 불러오기
// 저장 파일: 앱 데이터 폴더의 canvas-state.json (main.js 참고)
import { t } from './i18n.js';

export const storageMethods = {
  getState() {
    return {
      version: 2,
      zoom: this.zoom,
      panX: this.panX,
      panY: this.panY,
      home: this.home,                  // 정해 둔 원점 (없으면 null — view.js)
      notes: this.notes,
      files: this.files,
      photos: this.photos,
      boards: this.boards,
      links: this.liveLinks(),          // 이은 것이 없어진 선은 버림 (links.js)
    };
  },

  // 무언가 바뀔 때마다 부름
  //  - 자동 저장 켜짐: 0.3초 뒤 저장
  //  - 자동 저장 꺼짐: '저장 안 한 변경'으로만 표시 (system: true 는 바탕화면 파일 동기화처럼 사용자가 한 일이 아닌 것)
  scheduleSave({ system = false } = {}) {
    this.requestMinimap();
    this.requestLinks();
    // 캘린더 판과 연동한 연대표는 쪽지를 따라 그려 두므로, 쪽지가 바뀌면 다시 그림
    if (this.boards.some(b => b.kind === 'timeline' && this.linkedCalendar(b))) this.requestBoardsRefresh();
    if (!this.ready) return;
    if (this.settings.autoSave) {
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.persist(), 300);
      return;
    }
    if (!system) this.markDirty();
  },

  markDirty() {
    if (this.dirty) return;
    this.dirty = true;
    this.sendDirty(true);
  },

  // main 이 창을 닫기 전에 '저장할까요?'를 띄울 수 있게 알려 줌 (버튼 글자도 함께)
  sendDirty(dirty) {
    try {
      window.canvasAPI?.setDirty?.(dirty, {
        message: `${t('quit.message')} ${t('quit.detail')}`,
        save: t('quit.save'),
        discard: t('quit.dontSave'),
        cancel: t('quit.cancel'),
      });
    } catch (_) {}
  },

  async persist() {
    if (!this.ready) return false;
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const state = this.getState();
    try {
      if (window.canvasAPI) await window.canvasAPI.saveCanvasState(state);
      else localStorage.setItem('wallpaper-canvas-state', JSON.stringify(state));
      this.dirty = false;
      this.sendDirty(false);
      return true;
    } catch (err) {
      console.error('쪽지 저장 실패:', err);
      return false;
    }
  },

  // 창이 닫히기 직전: 기다리던 저장이 있으면 바로 저장 (자동 저장이 켜져 있을 때만)
  flushSave() {
    if (!this.ready || !this.settings.autoSave || !this.saveTimer) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      if (window.canvasAPI && window.canvasAPI.saveCanvasStateSync) window.canvasAPI.saveCanvasStateSync(this.getState());
      else localStorage.setItem('wallpaper-canvas-state', JSON.stringify(this.getState()));
    } catch (err) {
      console.error('쪽지 저장 실패:', err);
    }
  },

  // 절전 (main.js) — 화면을 내려놓기 전에 main 이 물어봄. 저장까지 마치면 { ok: true }, 안 되면 까닭
  async prepareSleep() {
    if (!this.ready) return { ok: false, reason: '불러오는 중' };
    if (this.editingId) return { ok: false, reason: '글을 쓰는 중' };
    if (this.settings.autoSave) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      if (!(await this.persist())) return { ok: false, reason: '저장 실패' };
    }
    return { ok: true };
  },

  // Ctrl+S
  async saveNow() {
    const ok = await this.persist();
    this.showToast(ok ? t('toast.saved') : '저장에 실패했어요');
  },

  // 종료 — main 이 '저장할까요?'를 띄울 수 있도록 창 닫기를 main 에 맡김
  async requestQuit() {
    if (this.settings.autoSave) this.flushSave();
    if (window.canvasAPI && window.canvasAPI.requestQuit) window.canvasAPI.requestQuit();
    else window.close();
  },

  // main 이 '저장' 을 고르면 저장한 뒤 창을 닫음
  async saveAndQuit() {
    await this.persist();
    if (window.canvasAPI && window.canvasAPI.quitNow) window.canvasAPI.quitNow();
    else window.close();
  },

  // 저장 파일 읽기. 파일이 아직 없으면 예전에 Ctrl+S로 저장해 둔 기록을 한 번 가져옴
  async readSavedState() {
    let data = null;
    let fromLegacy = false;
    if (window.canvasAPI) data = await window.canvasAPI.getCanvasState();
    if (!data && !localStorage.getItem('wallpaper-canvas-migrated')) {
      const legacy = localStorage.getItem('wallpaper-canvas-state');
      if (legacy) {
        data = JSON.parse(legacy);
        fromLegacy = !!window.canvasAPI;
      }
    }
    return { data, fromLegacy };
  },

  applyState(data = {}) {
    this.zoom = typeof data.zoom === 'number' ? data.zoom : 1;
    this.panX = typeof data.panX === 'number' ? data.panX : 0;
    this.panY = typeof data.panY === 'number' ? data.panY : 0;
    this.home = this.normalizeHome(data.home);
    this.notes =(Array.isArray(data.notes) ? data.notes : []).map(n => this.normalizeNote(n));
    this.photos = (Array.isArray(data.photos) ? data.photos : []).map(p => this.normalizePhoto(p));
    this.boards = (Array.isArray(data.boards) ? data.boards : []).map(b => this.normalizeBoard(b)).filter(Boolean);
    this.files = Array.isArray(data.files) ? data.files : [];
    this.links = this.normalizeLinks(data.links);
    this.selectedId = null;
    this.selectedLinkId = null;
    this.renderAll();
    this.laidView = { zoom: this.zoom, panX: this.panX, panY: this.panY };   // 이 화면으로 배치함 (확대 미리 보기의 기준, view.js)
    this.draw();
  },

  // 앱을 켤 때
  async restore() {
    await this.loadSettings();
    let data = null;
    let fromLegacy = false;
    try {
      ({ data, fromLegacy } = await this.readSavedState());
    } catch (err) {
      console.error('쪽지 불러오기 실패:', err);
    }

    // '시작 시 마지막 작업 공간 열기'가 꺼져 있으면: 전 작업 공간을 보관 파일로 옮기고 빈 캔버스로 시작
    if (data && !this.settings.openLastWorkspace) {
      const hasWork = (data.notes && data.notes.length) || (data.photos && data.photos.length) || (data.boards && data.boards.length)
        || (data.files || []).some(f => f.source !== 'desktop');
      try {
        if (hasWork && window.canvasAPI && window.canvasAPI.archiveState) await window.canvasAPI.archiveState();
      } catch (err) {
        console.error('작업 공간을 보관하지 못했어요:', err);
      }
      data = null;
      fromLegacy = false;
    }

    this.applyState(data || {});
    this.ready = true;
    if (fromLegacy) {
      localStorage.setItem('wallpaper-canvas-migrated', '1');
      this.persist();
    }
    await this.loadDesktop();                       // 바탕화면 폴더의 파일 불러오기
    await this.refreshAddedFileIcons();             // 직접 넣은 파일 중 그림이 없는 것은 다시 물어봄
  },
};

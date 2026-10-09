// 화면 — 빈 곳을 끌어 이동, 휠로 확대·축소, 격자 그리기, 쪽지·사진·파일을 화면 좌표에 맞추기
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { IS_MAC, ZOOM_SPEEDS } from './constants.js';
import { t } from './i18n.js';

export const viewMethods = {
  handleCanvasMouseDown(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el && el !== this.canvas) return;
    // (캘린더에서 펼친 쪽지는 app.js 의 문서 전체 mousedown 이 먼저 접음)

    // Ctrl · Shift 를 누른 채 끌면 네모로 여러 개 고르기 (selection.js) — 그냥 끌면 화면 이동
    if (e.button === 0 && (e.ctrlKey || e.shiftKey || (IS_MAC && e.metaKey))) {
      this.startMarquee(e);
      return;
    }

    // 빈 바탕을 누르면 선택 해제
    this.clearSelection();

    if (e.button === 0 && this.viewLocked()) return;  // 화면 잠금 — 끌어도 움직이지 않음
    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
  },

  handleCanvasMouseMove(e) {
    if (!this.isDragging || e.buttons !== 1) return;
    this.panX += e.clientX - this.dragStartX;
    this.panY += e.clientY - this.dragStartY;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.updateUIPositions();
    this.draw();
  },

  handleCanvasMouseUp() {
    if (this.isDragging) this.scheduleSave({ system: true });     // 화면 위치는 '저장 안 한 변경'으로 치지 않음
    this.isDragging = false;
  },

  // 마우스 자리를 중심으로 확대·축소 — 휠을 돌리는 동안은 미리 보기, 멈추면 다시 배치 (previewView)
  //   돌린 만큼 같은 비율로 (휠 한 칸 = 보통 약 10%, 터치패드는 움직인 만큼). 감도는 설정 › 캔버스 (ZOOM_SPEEDS)
  handleZoom(e) {
    e.preventDefault();
    if (this.viewLocked()) return;                    // 화면 잠금 — 확대 · 축소 안 됨
    const oldZoom = this.zoom;
    const worldX = (e.clientX - this.panX) / oldZoom;
    const worldY = (e.clientY - this.panY) / oldZoom;
    const speed = ZOOM_SPEEDS[this.settings && this.settings.zoomSpeed] || 1;
    const px = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 800 : e.deltaY;   // 줄 · 쪽 단위도 픽셀로
    this.zoom = Math.min(3, Math.max(0.1, oldZoom * Math.exp(-px * 0.00095 * speed)));
    if (this.zoom === oldZoom) return;
    this.panX = e.clientX - worldX * this.zoom;
    this.panY = e.clientY - worldY * this.zoom;
    this.previewView();
    this.scheduleSave({ system: true });
  },

  // ---- 확대 · 축소 미리 보기 ----
  // 배율이 바뀔 때마다 쪽지 · 판 · 파일을 다시 배치하면 글자 크기 · 여백이 모두 바뀌어 화면 전체를 다시 짜느라 초당 20장 안팎으로 끊김
  //   → 도는 동안에는 #ui-layer 를 마지막으로 배치한 화면(laidView)에서 지금 화면으로 옮기고 늘리기만 (그래픽 카드가 함 — 글자는 잠깐 흐림)
  //   멈추면 (0.15초) 지금 배율로 한 번 다시 배치 · 쪽지 크기도 다시 맞춤 (commitView). 무언가를 누르면 바로 (app.js — 자리 계산이 맞게)
  //   격자 · 미니맵은 가벼워서 바로 그림. 연결선은 층과 함께 늘어나 있다가 다시 배치할 때 그림 (links.js)
  previewView() {
    const laid = this.laidView;
    if (!laid) {
      this.updateUIPositions();
      this.draw();
      return;
    }
    const k = this.zoom / laid.zoom;
    const layer = this.uiLayer;
    if (this.textColorBar) this.hideTextColorBar();
    layer.style.willChange = 'transform';
    layer.style.transformOrigin = '0 0';
    layer.style.transform = `translate(${this.panX - laid.panX * k}px, ${this.panY - laid.panY * k}px) scale(${k})`;
    this.previewing = true;
    this.draw();
    clearTimeout(this.commitTimer);
    this.commitTimer = setTimeout(() => this.commitView(), 150);
  },

  commitView() {
    clearTimeout(this.commitTimer);
    if (!this.previewing) return;
    this.updateUIPositions();                        // 미리 보기를 걷어 내고 지금 배율로 배치
    if (this.zoom !== this.fitZoom) this.fitAllNotes();
  },

  // ---- 화면 잠금 (설정 · 빈 곳 우클릭 › 보기 › · 캔버스 메뉴) ----
  //   빈 곳 끌기 · 휠 · 고정한 것 끌기로 캔버스가 움직이거나 확대되지 않음. 원점으로 · 미니맵 · 찾기는 그대로 (일부러 옮기는 것)
  //   알림은 띄우지 않음 — 잠겼는지는 메뉴의 체크 표시로
  viewLocked() {
    return !!(this.settings && this.settings.lockView);
  },

  toggleViewLock() {
    this.updateSetting('lockView', !this.viewLocked());
  },

  // 원점 — 정해 둔 화면 (this.home: 화면 왼쪽 위에 오는 캔버스 자리 x · y 와 배율), 없으면 처음 자리 (0, 0 · 100%)
  //   원하는 곳으로 가서 '지금 화면을 원점으로' → 원점으로(Ctrl+0 · 메뉴)가 그 화면으로 감. 저장 파일에 함께 저장 (storage.js)
  //   바탕화면 파일 아이콘의 칸(격자)은 그대로 처음 자리 기준
  homeView() {
    const h = this.home;
    if (!h) return { zoom: 1, panX: 0, panY: 0 };
    return { zoom: h.zoom, panX: -h.x * h.zoom, panY: -h.y * h.zoom };
  },

  // 멀리 갔다가 돌아올 때
  goHome() {
    this.animateView(this.homeView());
  },

  // 지금 보이는 화면을 원점으로
  setHomeHere() {
    const round = (v, d) => Math.round(v * d) / d;
    this.home = { x: round(-this.panX / this.zoom, 10), y: round(-this.panY / this.zoom, 10), zoom: round(this.zoom, 100) };
    this.scheduleSave();
    this.showToast(t('toast.homeSet'));
  },

  // 원점을 처음 자리(0, 0 · 100%)로 되돌림
  resetHome() {
    if (!this.home) return;
    this.home = null;
    this.scheduleSave();
    this.showToast(t('toast.homeReset'));
  },

  // 저장 파일의 원점 — 숫자가 아니거나 배율이 범위(0.1~3) 밖이면 없음으로
  normalizeHome(h) {
    if (!h || typeof h !== 'object') return null;
    const ok = [h.x, h.y, h.zoom].every(v => typeof v === 'number' && Number.isFinite(v));
    return ok && h.zoom >= 0.1 && h.zoom <= 3 ? { x: h.x, y: h.y, zoom: h.zoom } : null;
  },

  // 움직이는 동안은 미리 보기, 끝나면 바로 다시 배치
  animateView(target, ms = 280) {
    cancelAnimationFrame(this.viewAnim);
    const set = (zoom, panX, panY) => { this.zoom = zoom; this.panX = panX; this.panY = panY; };
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      set(target.zoom, target.panX, target.panY);
      this.updateUIPositions();
      this.draw();
      this.scheduleSave({ system: true });
      return;
    }
    const from = { zoom: this.zoom, panX: this.panX, panY: this.panY };
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);                 // 끝에서 부드럽게 멈춤
      set(from.zoom + (target.zoom - from.zoom) * e,
          from.panX + (target.panX - from.panX) * e,
          from.panY + (target.panY - from.panY) * e);
      this.previewView();
      if (p < 1) {
        this.viewAnim = requestAnimationFrame(step);
        return;
      }
      this.commitView();
      this.scheduleSave({ system: true });
    };
    this.viewAnim = requestAnimationFrame(step);
  },

  // 화면을 옮기거나 확대 · 축소할 때마다 — 모두 새 자리 · 크기로
  //   쪽지는 맞춰 둔 크기(fit.js)로 자리만 옮김. 글도 같은 배율로 커지고 작아져서 크기를 다시 잴 필요가 없음
  //   (쪽지마다 글이 넘치는지 재면 화면 전체 배치를 쪽지 수만큼 다시 해서 확대가 초당 20장 안팎으로 끊겼음)
  //   배율이 바뀌었으면 멈춘 뒤 한 번 다시 맞춤 — 글자 크기가 배율에 따라 반올림돼 줄바꿈이 조금 달라질 수 있어서
  updateUIPositions() {
    if (this.textColorBar) this.hideTextColorBar();    // 고른 글자 색 막대는 화면이 움직이면 닫음 (text-color.js)
    this.scheduleWebCheck();                          // 웹 페이지 쪽지: 보이면 불러오고 오래 안 보이면 내려놓음 (web-note.js)
    if (this.previewing) {                            // 확대 · 축소 미리 보기를 걷어 냄 (previewView)
      clearTimeout(this.commitTimer);
      this.previewing = false;
      this.uiLayer.style.transform = '';
      this.uiLayer.style.willChange = '';
    }
    this.laidView = { zoom: this.zoom, panX: this.panX, panY: this.panY };
    this.boards.forEach(board => {
      const el = document.getElementById(board.id);
      if (el) this.updateBoardPosition(el, board);
    });
    this.notes.forEach(note => {
      const el = document.getElementById(note.id);
      if (el) this.updateNotePosition(el, note);
    });
    if (this.zoom !== this.fitZoom) this.scheduleRefit();
    this.photos.forEach(photo => {
      const el = document.getElementById(photo.id);
      if (el) this.updatePhotoPosition(el, photo);
    });
    this.files.forEach(file => {
      const el = document.getElementById(file.id);
      if (el) this.updateFilePosition(el, file);
    });
    this.updateFanOverlay();
  },

  // 확대 · 축소가 멈추면 (0.15초) 쪽지 크기를 다시 맞춤 (fit.js fitAllNotes 가 fitZoom 을 적어 둠)
  scheduleRefit() {
    clearTimeout(this.refitTimer);
    this.refitTimer = setTimeout(() => this.fitAllNotes(), 150);
  },

  updateNotePosition(el, note) {
    const r = this.noteRect(note);                  // 글이 넘쳐 늘어난 크기(fit.js) · 캘린더 칸 자리(calendar.js)
    el.style.left = `${r.x * this.zoom + this.panX}px`;
    el.style.top = `${r.y * this.zoom + this.panY}px`;
    el.style.width = `${r.width * this.zoom}px`;
    el.style.height = `${r.height * this.zoom}px`;
    el.style.setProperty('--zoom', this.zoom);      // 아이콘·글자·여백·접힘도 같은 배율로
    this.applyItemOrder(el, note);                  // 순서 (layer-order.js)
    this.applyBoardState(el, note);
    this.requestLinks();                            // 연결선도 따라감 (links.js)
  },

  // 화면에 차지하는 자리 (월드 좌표) — 찾기 · 미니맵이 씀
  itemRect(kind, item) {
    if (kind === 'note') return this.noteRect(item);
    if (kind === 'photo') return { x: item.x, y: item.y, ...this.photoOuterSize(item) };
    if (kind === 'board') return { x: item.x, y: item.y, ...this.boardSize(item) };
    const slot = kind === 'file' ? this.fileSlot(item) : null;      // 파일 묶음 안의 칸
    return { x: slot ? slot.x : item.x, y: slot ? slot.y : item.y, width: item.width, height: item.height };
  },

  updateFilePosition(el, file) {
    const slot = this.fileSlot(file);                  // 파일 묶음에 들었으면 묶음이 정한 칸 (groups.js)
    if (slot && !slot.hidden) {
      file.x = slot.x;
      file.y = slot.y;
    }
    el.classList.toggle('group-hidden', !!(slot && slot.hidden));   // 접힌 묶음 속
    if (el.classList.contains('in-group') !== !!slot) {
      el.classList.toggle('in-group', !!slot);
      this.refreshFallbackIcon(el, file);             // 묶음 안은 밝은 종이 위라 밝은 배경용 기본 그림
    }
    el.classList.toggle('group-lifted', !!(slot && this.groupSelected(slot.group)));   // 묶음이 골라져 떠오름 (groups.css)
    el.classList.toggle('on-dark', !!(slot && this.groupIsDark(slot.group)));           // 어두운 색 묶음 속 — 밝은 칸 위에
    this.applyItemOrder(el, file);                    // 순서 (layer-order.js)
    this.applyFileLayer(el, file, slot);              // 묶음 속이면 묶음 바로 위 층 (groups.js)
    el.style.left = `${file.x * this.zoom + this.panX}px`;
    el.style.top = `${file.y * this.zoom + this.panY}px`;
    el.style.width = `${file.width * this.zoom}px`;
    el.style.height = `${file.height * this.zoom}px`;
    el.style.setProperty('--zoom', this.zoom);        // 테두리 · 여백도 같은 배율 (styles.css)
    const symbol = el.querySelector('.file-icon-symbol');
    if (symbol) symbol.style.fontSize = `${32 * this.zoom}px`;     // 최소 크기를 두지 않음 —
    const name = el.querySelector('.file-icon-name');              // 두면 많이 줄였을 때 그림이 테두리 밖으로 넘침
    if (name) name.style.fontSize = `${11 * this.zoom}px`;
    this.requestLinks();
  },

  // ---- 캔버스 그리기 ----
  draw() {
    this.ctx.clearRect(0, 0, this.viewWidth, this.viewHeight);
    if (this.settings && this.settings.showGrid) this.drawGrid();
    this.requestMinimap();
  },

  drawGrid() {
    const gap = (this.settings.gridGap || 36) * this.zoom;
    if (gap < 6) return;                            // 너무 촘촘하면 그리지 않음
    const dark = this.settings.theme === 'dark';
    this.ctx.strokeStyle = dark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(31, 47, 69, 0.08)';
    // 선을 실제 화면 픽셀 한 칸에 맞춰야 배율 화면에서도 1px 로 또렷함
    const dpr = this.dpr || 1;
    const snap = (v) => (Math.round(v * dpr) + 0.5) / dpr;
    const w = this.viewWidth, h = this.viewHeight;
    this.ctx.lineWidth = 1 / dpr;
    this.ctx.beginPath();
    for (let x = this.panX % gap; x < w; x += gap) {
      this.ctx.moveTo(snap(x), 0);
      this.ctx.lineTo(snap(x), h);
    }
    for (let y = this.panY % gap; y < h; y += gap) {
      this.ctx.moveTo(0, snap(y));
      this.ctx.lineTo(w, snap(y));
    }
    this.ctx.stroke();
  },

  // 화면 아래에 잠깐 뜨는 알림 (저장했어요 · 복사했어요)
  showToast(text) {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    requestAnimationFrame(() => toast.classList.add('show'));
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.classList.remove('show');
      this.toastTimer = null;
    }, 1500);
  },
};

// 화면 — 빈 곳을 끌어 이동, 휠로 확대·축소, 격자 그리기, 쪽지·사진·파일을 화면 좌표에 맞추기
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { IS_MAC, ZOOM_SPEEDS } from './constants.js';
import { t } from './i18n.js';

const CULL_MARGIN = 1;          // 화면 밖 빼 두기: 창 크기만큼 바깥까지는 그대로 그림 (끌거나 줄여 볼 때 가장자리가 비어 보이지 않게)

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

  // 지금 보이는 화면 — 화면 왼쪽 위에 오는 캔버스 자리 x · y 와 배율 (원점 · 저장한 자리가 이 모양)
  //   vw · vh: 그 화면의 넓이 (월드 px — 저장한 자리 바탕 사진이 깔리는 넓이, background.js)
  currentView() {
    const round = (v, d) => Math.round(v * d) / d;
    return {
      x: round(-this.panX / this.zoom, 10), y: round(-this.panY / this.zoom, 10), zoom: round(this.zoom, 100),
      vw: round(this.viewWidth / this.zoom, 10), vh: round(this.viewHeight / this.zoom, 10),
    };
  },

  // 지금 보이는 화면을 원점으로
  setHomeHere() {
    const { x, y, zoom } = this.currentView();
    this.home = { x, y, zoom };
    this.scheduleSave();
    this.showToast(t('toast.homeSet'));
  },

  // ---- 저장한 자리 (Ctrl + 1~9) — 원점을 여럿 둔 것처럼. this.spots = { '1': { x, y, zoom }, … } (저장 파일에 함께 — storage.js)
  //   Ctrl + 숫자: 그 자리로 (비어 있으면 알림만 — 잘못 눌러 저장되지 않게) · Ctrl + Alt + 숫자: 지금 화면을 저장 (keyboard.js)
  goToSpot(n) {
    const h = this.spots[n];
    if (!h) {
      this.showToast(t('toast.spotEmpty', { n }));
      return;
    }
    this.animateView({ zoom: h.zoom, panX: -h.x * h.zoom, panY: -h.y * h.zoom });
  },

  saveSpot(n) {
    const bg = this.spots[n] && this.spots[n].bg;            // 다시 저장해도 그 자리 바탕 사진은 그대로 (background.js)
    this.spots = { ...this.spots, [n]: { ...this.currentView(), ...(bg ? { bg } : {}) } };
    this.updateSpotBackgrounds();
    if (this.settingsOpen) this.refreshSettingsWindow();
    this.scheduleSave();
    this.showToast(t('toast.spotSaved', { n }));
  },

  // 저장 파일의 자리들 — 1~9 번만, 모양이 맞는 것만 (normalizeHome) · 넓이 vw · vh · 바탕 사진 bg 는 있으면 그대로
  normalizeSpots(spots) {
    const out = {};
    if (!spots || typeof spots !== 'object') return out;
    for (let n = 1; n <= 9; n++) {
      const raw = spots[n];
      const h = this.normalizeHome(raw);
      if (!h) continue;
      if (raw.vw > 0 && raw.vh > 0) Object.assign(h, { vw: raw.vw, vh: raw.vh });
      const bg = raw.bg;
      if (bg && typeof bg.url === 'string' && bg.url) h.bg = { url: bg.url, name: String(bg.name || ''), w: +bg.w || 0, h: +bg.h || 0, thumb: typeof bg.thumb === 'string' ? bg.thumb : '' };
      out[n] = h;
    }
    return out;
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
  //   화면 밖 빼 둔 것: 갈 곳(과 지나는 길)은 미리 그려 둠 — 미리 보기 동안은 다시 배치하지 않아서, 그대로면 도착할 때 갑자기 나타남
  animateView(target, ms = 280) {
    cancelAnimationFrame(this.viewAnim);
    this.commitView();
    {
      // 지나가는 길을 다 그려 둘지: 두 화면이 가까우면 (사이가 화면 하나 넘게 벌어지지 않으면) 둘을 감싼 네모 전부,
      //   멀면 떠나는 화면 · 갈 화면만 — 홈 · 저장한 자리처럼 멀리 갈 때 그 사이의 것을 다 그리면 화면 메모리가 수백 MB 늘었음
      //   (쪽지 600 · 사진 60 을 깐 길: 한 번 갈 때마다 660개를 다 그려 4번 오가면 364 → 668MB). 사이는 눈 깜짝할 새 지나감
      const world = (v) => ({ x: -v.panX / v.zoom, y: -v.panY / v.zoom, width: this.viewWidth / v.zoom, height: this.viewHeight / v.zoom });
      const a = world(this), b = world(target);
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      const union = { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
      const near = union.width <= a.width + b.width + Math.max(a.width, b.width) && union.height <= a.height + b.height + Math.max(a.height, b.height);
      this.keepViewDrawn(near ? [union] : [b]);                 // 떠나는 화면은 cullItem 이 늘 그림 (지금 화면 + 둘레)
      this.updateUIPositions();
    }
    const set = (zoom, panX, panY) => { this.zoom = zoom; this.panX = panX; this.panY = panY; };
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      this.keepViewDrawn(null);
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
      this.keepViewDrawn(null);                         // 도착 — 다시 배치하며 멀어진 것은 다시 빼 둠
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
    this.updateSpotBackgrounds();                     // 저장한 자리 바탕 사진 (background.js)
    this.requestLinks();                              // 연결선 — 이은 것이 다 화면 밖(빼 둔 것)이어도 선은 화면을 지날 수 있음
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
    this.refitTimer = setTimeout(() => {
      this.fitAllNotes();
      this.updateFileNameOpen();                    // 고른 파일의 펼친 이름도 이 배율에서 다시 잼 (아주 작게 줄였을 때 잰 것은 어긋남)
    }, 150);
  },

  // ---- 화면 밖 빼 두기 ----
  // 창에서 멀리(창 크기만큼 넘게) 떨어진 쪽지 · 사진 · 파일은 그리지 않음 (.culled — display: none)
  //   → 놓인 것이 많아도 화면을 끌고 확대하는 비용 · 그리는 데 드는 메모리가 보이는 것만큼만. 가까워지면 그 자리 · 크기로 다시 그림
  //   (update…Position 이 빼 둔 동안은 자리를 적지 않고, 다시 보일 때 처음부터 다 적음. 데이터 · 연결선 · 미니맵 · 찾기는 그대로)
  //   늘 그리는 것: 끄는 중 · 이름 바꾸는 중 · 글 쓰는 중 (웹 페이지 쪽지는 부르는 쪽에서 뺌 — 페이지는 web-note.js 가 따로 내려놓음)
  //   움직이는 동안의 미리 보기(previewView)는 다시 배치하지 않음 → 갈 곳은 cullKeep(월드 네모들)으로 미리 그려 둠 (animateView)
  //   반환: 빼 두었는지 (그러면 부르는 쪽은 자리를 적지 않음)
  cullItem(el, left, top, width, height) {
    const mx = this.viewWidth * CULL_MARGIN;
    const my = this.viewHeight * CULL_MARGIN;
    let out = left > this.viewWidth + mx || top > this.viewHeight + my || left + width < -mx || top + height < -my;
    const keep = this.cullKeep;
    if (out && keep) {                               // 갈 곳 (월드 네모들)
      const z = this.zoom;
      const x = (left - this.panX) / z, y = (top - this.panY) / z;
      out = !keep.some(k => x < k.x + k.width && x + width / z > k.x && y < k.y + k.height && y + height / z > k.y);
    }
    if (out && (el.id === this.editingId || el.classList.contains('dragging') || el.classList.contains('renaming'))) out = false;
    if (el.classList.contains('culled') !== out) {      // class 하나로만 봄 (다른 곳에서 class 를 다시 써도 어긋나지 않게)
      el.classList.toggle('culled', out);
      if (!out && this.refitPending && this.refitPending.has(el.id)) this.scheduleCulledRefit();   // 빼 둔 동안 못 잰 쪽지 크기 (fit.js)
    }
    return out;
  },

  // 빼 둔 동안 크기를 못 잰 쪽지가 다시 보이면 — 다음 장면에서 잼 (자리를 적는 중에 바로 재면 자리 적기가 겹침)
  scheduleCulledRefit() {
    if (this.refitFrame) return;
    this.refitFrame = requestAnimationFrame(() => {
      this.refitFrame = null;
      const ids = [...(this.refitPending || [])];
      ids.forEach(id => {
        const el = document.getElementById(id);
        const note = el && !el.classList.contains('culled') && this.notes.find(n => n.id === id);
        if (!note) return;
        this.refitPending.delete(id);
        this.fitNote(note, el);
      });
    });
  },

  // 갈 곳을 미리 그려 둠 (월드 네모 목록 · 없으면 풂) — 움직이는 동안은 다시 배치하지 않아서 (animateView)
  keepViewDrawn(rects) {
    this.cullKeep = rects && rects.length ? rects : null;
  },

  updateNotePosition(el, note) {
    const r = this.noteRect(note);                  // 글이 넘쳐 늘어난 크기(fit.js) · 캘린더 칸 자리(calendar.js)
    if (note.type !== 'web' && this.cullItem(el, r.x * this.zoom + this.panX, r.y * this.zoom + this.panY, r.width * this.zoom, r.height * this.zoom)) return;
    el.style.left = `${r.x * this.zoom + this.panX}px`;
    el.style.top = `${r.y * this.zoom + this.panY}px`;
    el.style.width = `${r.width * this.zoom}px`;
    el.style.height = `${r.height * this.zoom}px`;
    el.style.setProperty('--zoom', this.zoom);      // 아이콘·글자·여백·접힘도 같은 배율로
    this.applyItemOrder(el, note, 'note');                  // 순서 (layer-order.js)
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
    const extraH = el.nameExtra || 0;
    if (this.cullItem(el, file.x * this.zoom + this.panX, file.y * this.zoom + this.panY, file.width * this.zoom, (file.height + extraH) * this.zoom)) return;   // 화면 밖
    el.classList.toggle('group-hidden', !!(slot && slot.hidden));   // 접힌 묶음 속
    const onDark = !!(slot && this.groupIsDark(slot.group));        // 어두운 색 묶음 속 — 이름을 밝게 (groups.css)
    if (el.classList.contains('in-group') !== !!slot || el.classList.contains('on-dark') !== onDark) {
      el.classList.toggle('in-group', !!slot);
      el.classList.toggle('on-dark', onDark);
      this.refreshFallbackIcon(el, file);             // 묶음 종이 색에 맞는 기본 그림 (files.js useFallbackIcon)
    }
    el.classList.toggle('group-lifted', !!(slot && this.groupSelected(slot.group)));   // 묶음이 골라져 떠오름 (groups.css)
    this.applyItemOrder(el, file, 'file');                    // 순서 (layer-order.js)
    this.applyFileLayer(el, file, slot);              // 묶음 속이면 묶음 바로 위 층 (groups.js)
    el.style.left = `${file.x * this.zoom + this.panX}px`;
    el.style.top = `${file.y * this.zoom + this.panY}px`;
    el.style.width = `${file.width * this.zoom}px`;
    const extra = el.nameExtra || 0;                  // 하나만 고른 파일의 펼친 이름만큼 아래로 (files.js updateFileNameOpen)
    el.style.height = `${(file.height + extra) * this.zoom}px`;
    el.style.setProperty('--name-extra', extra);
    el.style.setProperty('--zoom', this.zoom);        // 테두리 · 여백도 같은 배율 (styles.css)
    const symbol = el.querySelector('.file-icon-symbol');
    if (symbol) symbol.style.fontSize = `${32 * this.zoom}px`;     // 최소 크기를 두지 않음 —
    const name = el.querySelector('.file-icon-name');              // 두면 많이 줄였을 때 그림이 테두리 밖으로 넘침
    if (name) name.style.fontSize = `${11 * this.zoom}px`;
    this.requestLinks();
  },

  // ---- 캔버스 그리기 ----
  draw() {
    this.updateBackgroundPosition();                 // 캔버스와 함께 움직이는 바탕 사진 (background.js)
    this.ctx.clearRect(0, 0, this.viewWidth, this.viewHeight);
    if (this.settings && this.settings.showGrid) this.drawGrid();
    this.requestMinimap();
  },

  drawGrid() {
    const gap = (this.settings.gridGap || 36) * this.zoom;
    if (gap < 6) return;                            // 너무 촘촘하면 그리지 않음
    const dark = this.canvasDark ?? this.settings.theme === 'dark';   // 바탕이 어두우면 밝은 선 (background.js)
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

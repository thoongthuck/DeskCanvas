// 캔버스 바탕 — 테마 색 · 직접 고른 색 · 사진 (설정 › 테마 › 캔버스 바탕)
//   테마 색: 밝게 #F5F5F5 · 어둡게 #1F252C (예전 그대로). 직접 고른 색: settings.bgColor
//   사진: settings.bgImages [{ url, name, w, h, thumb }] — 여러 장이면 슬라이드 쇼 (bgInterval 분마다 · bgOrder 차례대로 · 섞어서)
//     고르면 앱 데이터 폴더(backgrounds)에 넣어 둠. 큰 사진은 줄이고 작은 그림(thumb)도 만들어 둠 (main.js pick-background — 메모리)
//     화면에 고정: 윈도우 배경 화면처럼 — 맞춤 bgFit (채우기 · 맞춤 · 늘이기 · 가운데 · 바둑판식). 남는 곳은 바탕색
//     캔버스와 함께: 바둑판식으로 이어 붙여 화면을 끌거나 확대하면 같이 움직임 (그리기마다 자리 · 크기 — view.js draw)
//     바꿀 때는 두 층(.canvas-bg-layer)을 0.6초 겹쳐 바꾸고 앞 사진은 내려놓음. 캔버스가 다 가려진 동안은 바꾸지 않음
//   저장한 자리 바탕 사진 (spots[n].bg — view.js 저장한 자리): 그 자리 넓이에만 깔리는 사진 (이미지 쪽지처럼 캔버스에 붙음)
//     그 자리로 가면 화면을 꽉 채움. 쪽지 · 사진 · 판보다 뒤 (#ui-layer 안 맨 아래 층). 빈 곳 우클릭 › 보기 › · 설정 › 저장한 자리
//   바탕이 어두우면 (어두운 테마 · 어두운 색 · 사진) 바탕에 바로 놓인 파일 이름 · 격자 · 연결선 · 판 이름을 밝게 (body.canvas-dark)
//     사진 위 파일 이름은 윈도우처럼 흰 글씨에 그림자 (body.bg-photo)
//   창 바탕색 · 윈도우 배경 화면도 같은 색 · 사진으로 (설정 › 일반 › 바탕화면 배경 맞추기 — main.js setDesktopBackground)
//     슬라이드 쇼가 10분보다 자주 바뀌면 윈도우 배경 화면은 처음 사진 그대로 (너무 자주 바꾸지 않게)
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { isDarkColor, isHexColor } from './color.js';
import { t } from './i18n.js';

export const THEME_BG = { light: '#F5F5F5', dark: '#1F252C' };
export const BG_COLORS = ['#E9EEF4', '#F3EEE4', '#E7EFE6', '#F2E8EC', '#2E3D57', '#2A2D33'];   // 바탕색 점 (설정 창)
export const BG_FITS = ['fill', 'fit', 'stretch', 'center', 'tile'];
export const BG_INTERVALS = [0, 1, 10, 30, 60, 1440];     // 슬라이드 쇼 간격 (분, 0 = 바꾸지 않음)
export const BG_MAX_IMAGES = 30;
const BG_FADE_MS = 600;                                   // 슬라이드 쇼 겹쳐 바꾸기 (styles.css .canvas-bg-layer)
const WALL_SYNC_MIN = 10;                                 // 이보다 자주 바뀌는 슬라이드 쇼는 윈도우 배경 화면을 따라 바꾸지 않음 (분)

// 화면에 고정한 사진의 맞춤 → CSS background (크기 · 이어 붙이기 · 자리)
const FIT_CSS = {
  fill: ['cover', 'no-repeat', 'center'],
  fit: ['contain', 'no-repeat', 'center'],
  stretch: ['100% 100%', 'no-repeat', 'center'],
  center: ['auto', 'no-repeat', 'center'],
  tile: ['auto', 'repeat', 'left top'],
};

const cssUrl = (url) => `url("${String(url).replace(/"/g, '%22')}")`;

export const backgroundMethods = {
  // 지금 바탕 { kind: 'theme'|'color'|'image', color, image(그 사진 { url, w, h … }), fit, move, dark }
  backgroundLook() {
    const s = this.settings || {};
    const themeColor = s.theme === 'dark' ? THEME_BG.dark : THEME_BG.light;
    const own = isHexColor(s.bgColor) ? s.bgColor.toUpperCase() : themeColor;
    const list = Array.isArray(s.bgImages) ? s.bgImages : [];
    if (s.bgKind === 'image' && list.length) {
      const image = list[Math.min(Math.max(0, s.bgIndex | 0), list.length - 1)];
      return { kind: 'image', color: own, image, fit: s.bgFit, move: s.bgMove, dark: true };
    }
    if (s.bgKind === 'color') return { kind: 'color', color: own, image: null, dark: isDarkColor(own) };
    return { kind: 'theme', color: themeColor, image: null, dark: s.theme === 'dark' };
  },

  // 설정이 바뀌면 (settings.js applySettings) — 바탕 · 밝기 표시 · 창 바탕색 · 윈도우 배경 화면 · 슬라이드 쇼 시계
  applyBackground() {
    const s = this.settings || {};
    const look = this.backgroundLook();
    const body = document.body;
    this.canvasDark = look.dark;
    body.style.setProperty('--canvas-bg', look.color);
    body.classList.toggle('canvas-dark', look.dark);
    body.classList.toggle('bg-photo', look.kind === 'image');           // (canvas-photo 는 캔버스 위 사진 요소 이름이라 다른 이름)
    if (look.kind === 'image') {
      const [size, repeat, pos] = look.move === 'canvas' ? ['auto', 'repeat', '0 0'] : FIT_CSS[look.fit] || FIT_CSS.fill;
      body.style.setProperty('--canvas-bg-size', size);
      body.style.setProperty('--canvas-bg-repeat', repeat);
      body.style.setProperty('--canvas-bg-pos', pos);
      this.showBackgroundImage(look.image.url);
    } else {
      ['--canvas-bg-size', '--canvas-bg-repeat', '--canvas-bg-pos'].forEach(k => body.style.removeProperty(k));
      this.showBackgroundImage('');
    }
    this.bgPlaced = '';
    this.updateBackgroundPosition();
    this.updateBoardTones?.();                       // 바탕에 놓인 판 이름 · 막대 글자 (boards.js boardTone)
    this.refreshFallbackIcons?.();                   // 파일 기본 그림 — 밝은 · 어두운 바탕용 (files.js)
    this.scheduleSlideshow();
    const api = window.canvasAPI;
    api?.setBackground?.(look.color);                // 창 바탕색 · 바탕화면 층 사진 창 바탕 (main.js)
    let wall = null;
    if (look.kind === 'image') {                     // 자주 바뀌는 슬라이드 쇼면 윈도우 쪽은 처음 맞춘 사진 그대로
      const rapid = (s.bgImages || []).length > 1 && s.bgInterval > 0 && s.bgInterval < WALL_SYNC_MIN;
      const url = rapid && this.wallSynced ? this.wallSynced : look.image.url;
      this.wallSynced = url;
      wall = { url, fit: look.move === 'canvas' ? 'tile' : look.fit };
    }
    api?.setDesktopBackground?.(s.desktopBackground, look.color, wall);
  },

  // 바탕 사진 층 두 장(.canvas-bg-layer) — 새 사진은 다 풀린 뒤 뒤쪽 층에 넣고 겹쳐 바꿈, 앞 사진은 다 바뀐 뒤 내려놓음
  showBackgroundImage(url) {
    const body = document.body;
    let layers = [...document.querySelectorAll('.canvas-bg-layer')];
    if (layers.length !== 2) {
      layers.forEach(el => el.remove());
      layers = [0, 1].map(() => {
        const el = document.createElement('div');
        el.className = 'canvas-bg-layer';
        body.prepend(el);
        return el;
      });
    }
    const front = layers.find(el => el.classList.contains('on'));
    if (!url) {
      layers.forEach(el => { el.classList.remove('on'); el.style.backgroundImage = ''; });
      this.bgShown = '';
      return;
    }
    if (this.bgShown === url && front) return;
    this.bgShown = url;
    const back = layers.find(el => el !== front) || layers[0];
    const swap = () => {
      if (this.bgShown !== url) return;               // 그사이 다른 사진으로 바뀜
      back.style.backgroundImage = cssUrl(url);
      back.classList.add('on');
      if (!front) return;
      front.classList.remove('on');
      clearTimeout(this.bgFadeTimer);
      this.bgFadeTimer = setTimeout(() => { if (!front.classList.contains('on')) front.style.backgroundImage = ''; }, BG_FADE_MS + 100);
    };
    if (!front) {
      swap();
      return;
    }
    const img = new Image();                          // 다 풀린 뒤에 바꿈 (반쯤 그려진 사진이 보이지 않게)
    img.src = url;
    (img.decode ? img.decode() : Promise.resolve()).then(swap, swap);
  },

  // ---- 슬라이드 쇼 ----
  // 사진이 둘 이상이고 간격이 정해져 있으면 그 간격마다 다음 사진 (캔버스가 다 가려져 있으면 다시 보일 때)
  scheduleSlideshow() {
    clearTimeout(this.slideTimer);
    const s = this.settings || {};
    if (s.bgKind !== 'image' || (s.bgImages || []).length < 2 || !(s.bgInterval > 0)) return;
    this.slideTimer = setTimeout(() => this.nextBackground(), s.bgInterval * 60000);
  },

  nextBackground() {
    if (document.hidden) {                            // 가려져 있음 — 보이면 바꿈
      document.addEventListener('visibilitychange', () => this.nextBackground(), { once: true });
      return;
    }
    const s = this.settings;
    const n = (s.bgImages || []).length;
    if (s.bgKind !== 'image' || n < 2) return;
    let next = ((s.bgIndex | 0) + 1) % n;
    if (s.bgOrder === 'shuffle') {
      next = Math.floor(Math.random() * (n - 1));
      if (next >= (s.bgIndex | 0)) next++;
    }
    this.updateSetting('bgIndex', next);              // applyBackground → 겹쳐 바꾸기 · 다음 시계
  },

  // 캔버스와 함께 움직이는 사진 — 화면을 끌거나 확대할 때마다 이어 붙인 사진의 크기 · 자리 (view.js draw · previewView)
  //   사진 한 장 = 사진의 원래 크기(월드 px). 원점(0, 0)에 맞춰 이어 붙임
  updateBackgroundPosition() {
    const s = this.settings || {};
    if (s.bgKind !== 'image' || s.bgMove !== 'canvas') return;
    const look = this.backgroundLook();
    if (!look.image) return;
    const { w, h } = look.image;
    if (!(w > 0 && h > 0)) {
      this.measureBackgroundImage(look.image);
      return;
    }
    const z = this.zoom;
    const key = `${w * z}|${h * z}|${this.panX}|${this.panY}`;
    if (this.bgPlaced === key) return;
    this.bgPlaced = key;
    const body = document.body.style;
    body.setProperty('--canvas-bg-size', `${w * z}px ${h * z}px`);
    body.setProperty('--canvas-bg-pos', `${this.panX}px ${this.panY}px`);
  },

  // 사진 크기를 모르면 (예전에 고른 것) 한 번 읽어 적어 둠
  measureBackgroundImage(image) {
    if (!image || this.bgMeasuring === image.url) return;
    this.bgMeasuring = image.url;
    const img = new Image();
    img.onload = () => {
      image.w = img.naturalWidth;
      image.h = img.naturalHeight;
      this.persistSettings();
      this.bgPlaced = '';
      this.updateBackgroundPosition();
    };
    img.src = image.url;
  },

  // ---- 사진 넣고 빼기 (설정 창) ----
  // '+' — 여러 장을 한 번에 골라 목록 뒤에 (BG_MAX_IMAGES 장까지). 처음 넣으면 사진 바탕으로. 반환: 넣었는지
  async addBackgroundImages() {
    const picked = await this.pickBackgroundFiles(true);
    if (!picked.length) return false;
    const s = this.settings;
    const list = Array.isArray(s.bgImages) ? s.bgImages : [];
    const room = Math.max(0, BG_MAX_IMAGES - list.length);
    if (picked.length > room) this.showToast(t('toast.bgTooMany', { n: BG_MAX_IMAGES }));
    const added = picked.slice(0, room);
    if (!added.length) return false;
    const first = !list.length || s.bgKind !== 'image';
    s.bgImages = [...list, ...added];
    if (first) {
      s.bgKind = 'image';
      s.bgIndex = list.length;                        // 처음이면 새로 넣은 첫 장부터
    }
    this.persistSettings();
    this.applySettings('bgImages');
    return true;
  },

  // 그림 누르기 — 그 사진을 지금 바탕으로 (슬라이드 쇼는 거기서부터)
  selectBackgroundImage(index) {
    this.settings.bgKind = 'image';
    this.settings.bgIndex = index;
    this.persistSettings();
    this.applySettings('bgIndex');
  },

  // ✕ — 목록에서 빼고, 다른 데(저장한 자리)에서 안 쓰면 파일도 지움. 다 빼면 바탕은 테마 색으로
  removeBackgroundImage(index) {
    const s = this.settings;
    const list = [...(s.bgImages || [])];
    const [gone] = list.splice(index, 1);
    if (!gone) return;
    s.bgImages = list;
    if ((s.bgIndex | 0) >= index && s.bgIndex > 0) s.bgIndex--;
    if (!list.length) s.bgKind = 'theme';
    this.persistSettings();
    this.applySettings('bgImages');
    this.releaseBackgroundFile(gone);
  },

  // 바탕 종류 고르기 (설정 창) — 사진인데 아직 넣은 사진이 없으면 먼저 고름 (취소하면 그대로)
  async setBackgroundKind(kind) {
    if (kind === 'image' && !(this.settings.bgImages || []).length) {
      await this.addBackgroundImages();
      return;
    }
    this.updateSetting('bgKind', kind);
  },

  // 고르기 창 (main.js pick-background) → [{ url, name, w, h, thumb }]
  async pickBackgroundFiles(multi) {
    const api = window.canvasAPI;
    if (!api || !api.pickBackground) return [];
    try {
      const picked = await api.pickBackground(t('dialog.pickBackground'), !!multi);
      return (picked || []).map(p => ({ url: p.url, name: p.name || '', w: p.width || 0, h: p.height || 0, thumb: p.thumb || '' }));
    } catch (err) {
      this.showToast(t('toast.bgFail', { msg: (err && err.message) || '' }));
      return [];
    }
  },

  // 더는 아무 데서도 안 쓰는 바탕 사진 파일을 지움 (슬라이드 쇼 목록 · 저장한 자리 둘 다 봄 — main.js 는 backgrounds 폴더 안만 지움)
  releaseBackgroundFile(image) {
    if (!image || !image.url) return;
    const used = (this.settings.bgImages || []).some(i => i.url === image.url)
      || Object.values(this.spots || {}).some(sp => sp && sp.bg && sp.bg.url === image.url);
    if (!used) window.canvasAPI?.removeBackground?.(image.url);
  },

  // ---- 저장한 자리 바탕 사진 ----
  // 그 자리 넓이 (월드 네모) — 저장할 때의 창 크기 (예전에 저장한 자리는 지금 창 크기로)
  spotRect(spot) {
    return {
      x: spot.x, y: spot.y,
      width: spot.vw || this.viewWidth / spot.zoom,
      height: spot.vh || this.viewHeight / spot.zoom,
    };
  },

  // 그 자리(월드 좌표)를 덮는 저장한 자리 번호 — 여럿이면 가장 작은 넓이 (빈 곳 우클릭 메뉴)
  spotAt(at) {
    let best = null;
    Object.keys(this.spots || {}).forEach(n => {
      const r = this.spotRect(this.spots[n]);
      if (at.x < r.x || at.y < r.y || at.x > r.x + r.width || at.y > r.y + r.height) return;
      if (!best || r.width * r.height < best.area) best = { n, area: r.width * r.height };
    });
    return best ? best.n : null;
  },

  async pickSpotBackground(n) {
    if (!this.spots[n]) return;
    const [picked] = await this.pickBackgroundFiles(false);
    if (!picked || !this.spots[n]) return;
    const old = this.spots[n].bg;
    this.spots = { ...this.spots, [n]: { ...this.spots[n], bg: picked } };
    this.scheduleSave();
    this.updateSpotBackgrounds();
    this.releaseBackgroundFile(old);
    if (this.settingsOpen) this.refreshSettingsWindow();
  },

  removeSpotBackground(n) {
    const spot = this.spots[n];
    if (!spot || !spot.bg) return;
    const old = spot.bg;
    const { bg, ...rest } = spot;
    this.spots = { ...this.spots, [n]: rest };
    this.scheduleSave();
    this.updateSpotBackgrounds();
    this.releaseBackgroundFile(old);
    if (this.settingsOpen) this.refreshSettingsWindow();
  },

  // 저장한 자리 지우기 (설정 › 저장한 자리) — 그 바탕 사진도
  removeSpot(n) {
    const spot = this.spots[n];
    if (!spot) return;
    const rest = { ...this.spots };
    delete rest[n];
    this.spots = rest;
    this.scheduleSave();
    this.updateSpotBackgrounds();
    if (spot.bg) this.releaseBackgroundFile(spot.bg);
    if (this.settingsOpen) this.refreshSettingsWindow();
  },

  // 자리 바탕 사진 그리기 — #ui-layer 맨 아래 층 (.spot-bg, 쪽지 · 사진 · 판 뒤). 화면을 옮길 때마다 (view.js updateUIPositions)
  //   창에서 멀리 있으면 그리지 않음
  updateSpotBackgrounds() {
    const layer = this.uiLayer;
    if (!layer) return;
    const want = new Set();
    const z = this.zoom;
    Object.keys(this.spots || {}).forEach(n => {
      const spot = this.spots[n];
      if (!spot || !spot.bg || !spot.bg.url) return;
      const id = `spot-bg-${n}`;
      want.add(id);
      let el = document.getElementById(id);
      if (!el || el.parentNode !== layer) {
        if (el) el.remove();
        el = document.createElement('div');
        el.id = id;
        el.className = 'spot-bg';
        layer.prepend(el);
      }
      if (el.dataset.url !== spot.bg.url) {
        el.dataset.url = spot.bg.url;
        el.style.backgroundImage = cssUrl(spot.bg.url);
      }
      const r = this.spotRect(spot);
      const left = r.x * z + this.panX, top = r.y * z + this.panY, w = r.width * z, h = r.height * z;
      const far = left > this.viewWidth * 2 || top > this.viewHeight * 2 || left + w < -this.viewWidth || top + h < -this.viewHeight;
      el.classList.toggle('culled', far);
      if (far) return;
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
    });
    layer.querySelectorAll(':scope > .spot-bg').forEach(el => { if (!want.has(el.id)) el.remove(); });
  },

  // 빈 곳 우클릭 › 보기 › 에 붙는 줄 — 누른 자리가 저장한 자리 안이면 그 자리 바탕 사진 넣기 · 빼기
  spotMenuItems(at) {
    const n = at && this.spotAt(at);
    if (!n) return [];
    const items = [{ icon: 'add-image.svg', label: t('menu.spotBg', { n }), action: () => this.pickSpotBackground(n) }];
    if (this.spots[n].bg) items.push({ icon: 'close.svg', label: t('menu.spotBgRemove', { n }), action: () => this.removeSpotBackground(n) });
    return items;
  },
};

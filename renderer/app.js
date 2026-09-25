// 무한 캔버스 본체 — 상태(쪽지·사진·파일·화면 위치)를 들고 있고, 마우스·키보드 이벤트를 각 기능에 연결함
//
// 기능별 코드는 옆 파일에 나뉘어 있고, 맨 아래에서 이 클래스에 합쳐짐
//   view.js             화면 이동 · 확대/축소 · 격자 · 위치 맞추기
//   menus.js            우클릭 메뉴 · 템플릿 팝업 · 스타일 창
//   notes.js            쪽지 만들기 · 수정 · 선택 · 고정/스타일/삭제
//   note-body.js        쪽지 본문 (글 · 할 일 · 사진 · 코드 셀 · 마크다운)
//   fit.js              '글자가 넘칠 때' (자동 줄넘김 · 자동 확장)
//   code-cell.js        코드 칸,  syntax.js  글자 색 구분
//   style-panel.js      스타일 창 (쪽지 색 · 글자 색 · 글꼴 · 크기)
//   photos.js           바탕에 붙인 사진 (틀 · 캡션),  photo-frame.js  틀 고르는 창
//   boards.js           판 공통 (옮기기 · 크기 · 메뉴 · 잠금),  board-notes.js  판에 쪽지 붙이기 · 떼기
//   calendar.js         캘린더 판 (겹친 쪽지 펼치기),  timeline.js  연대표 판,  holidays.js  빨간 날
//   groups.js           파일 묶음 (파일 아이콘을 담아 함께 옮기는 포스트잇)
//   drag.js             옮기기 · 크기 조절
//   files.js            파일 아이콘 · 바탕화면 폴더
//   storage.js          저장 · 불러오기 · 종료
//   settings.js         설정값,  settings-window.js  설정 창
//   history.js          되돌리기 · 다시 실행
//   keyboard.js         단축키 · 붙여넣기
//   search.js           찾기 (Ctrl+F),  minimap.js  미니맵 (Ctrl+M)
//   selection.js        여러 개 선택 (Ctrl · Shift + 누르기 · 빈 곳 끌기, Ctrl+A · Ctrl+G)
//   links.js            연결선 (쪽지 · 사진 · 파일 · 파일 묶음 사이 곡선 · 직선 — 마인드맵처럼)
//   align.js            자 (끌 때 다른 것에 맞춰 붙기) · 고른 것 정렬
import { DEFAULT_SETTINGS, ICON_DIR, PRELOAD_ICONS } from './constants.js';
import { viewMethods } from './view.js';
import { menuMethods } from './menus.js';
import { noteMethods } from './notes.js';
import { noteBodyMethods } from './note-body.js';
import { fitMethods } from './fit.js';
import { codeCellMethods } from './code-cell.js';
import { stylePanelMethods } from './style-panel.js';
import { photoMethods } from './photos.js';
import { photoFrameMethods } from './photo-frame.js';
import { boardMethods } from './boards.js';
import { boardNoteMethods } from './board-notes.js';
import { calendarMethods } from './calendar.js';
import { timelineMethods } from './timeline.js';
import { groupMethods } from './groups.js';
import { holidayMethods } from './holidays.js';
import { dragMethods } from './drag.js';
import { fileMethods } from './files.js';
import { storageMethods } from './storage.js';
import { settingsMethods } from './settings.js';
import { settingsWindowMethods } from './settings-window.js';
import { historyMethods } from './history.js';
import { keyboardMethods } from './keyboard.js';
import { searchMethods } from './search.js';
import { minimapMethods } from './minimap.js';
import { selectionMethods } from './selection.js';
import { linkMethods } from './links.js';
import { noteLinkMethods } from './note-links.js';
import { alignMethods } from './align.js';

// 휠을 확대·축소로 가로채지 않는 곳 (여기 안에서는 목록이 그대로 스크롤됨)
const SCROLLABLE_UI = '.settings-overlay, .popup-menu, #style-panel, #search-box, #minimap';

export class InfiniteCanvas {
  constructor() {
    this.canvas = document.getElementById('infinite-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.uiLayer = document.getElementById('ui-layer');

    // 화면 위치 (월드 좌표 → 화면 좌표: x * zoom + panX)
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.home = null;             // 정해 둔 원점 { x, y, zoom } — 없으면 처음 자리 (view.js)
    this.isDragging = false;      // 빈 곳을 끌어 화면 이동 중
    this.dragStartX = 0;
    this.dragStartY = 0;

    // 캔버스 위 물건
    this.notes = [];
    this.photos = [];
    this.fitSizes = new Map();    // 글이 넘쳐 늘어난 크기 (저장하지 않음 — fit.js)
    this.files = [];
    this.boards = [];             // 캘린더 · 연대표 판 · 파일 묶음
    this.groupGap = null;         // 파일을 끄는 동안 묶음에 끼워 넣을 빈칸 { groupId, index } (groups.js)
    this.boardViews = new Map();  // 판마다 보고 있는 달 · 때 (저장하지 않음)
    this.calendarCache = new Map();
    this.timelineLayouts = new Map();   // 연대표마다 걸린 쪽지 층 배치
    this.calendarFan = null;      // 겹친 쪽지를 펼친 날짜 { boardId, date }
    this.holidays = new Map();    // 빨간 날 'YYYY-MM-DD' → 이름 (holidays.js)
    this.minimapOn = false;       // 미니맵 — Ctrl+M 을 눌렀을 때만 (저장하지 않음)
    // 선택 — 고른 것 전부 (쪽지 · 사진 · 파일 · 파일 묶음 id, selection.js)
    //   selectedId 는 마지막으로 고른 것. selectedId 에 넣으면 그것 하나만 고름 (예전 코드와 같게)
    this.selection = new Set();
    Object.defineProperty(this, 'selectedId', {
      get: () => {
        let last = null;
        this.selection.forEach(id => { last = id; });
        return last;
      },
      set: (id) => {
        this.selection.clear();
        if (id) this.selection.add(id);
      },
    });
    this.narrowTo = null;         // 여럿 고른 채 하나를 누름 → 끌지 않고 떼면 그것만 고름
    // 연결선 (links.js) — [{ id, a, b }], 고른 선, 잇는 중
    this.links = [];
    this.selectedLinkId = null;
    this.linking = null;
    this.linkFrame = null;

    // 설정 (실제 값은 restore() 에서 불러옴)
    this.settings = { ...DEFAULT_SETTINGS };
    this.settingsOpen = false;

    // 저장 상태
    this.ready = false;           // 저장된 쪽지를 다 불러오기 전에는 저장하지 않음
    this.saveTimer = null;
    this.dirty = false;           // 자동 저장이 꺼져 있을 때 '저장 안 한 변경'
    this.allowClose = false;

    // 되돌리기
    this.undoStack = [];
    this.redoStack = [];
    this.typingRecorded = false;

    // 끌기·메뉴 상태
    this.drag = null;
    this.justDragged = false;
    this.stylePanel = null;
    this.listMenu = null;
    this.menuOutsideHandler = null;
    this.editingId = null;        // '수정하기'로 글을 고치는 중인 쪽지
    this.lastMouse = null;
    this.toastTimer = null;

    this.init();
  }

  init() {
    this.preloadIcons();
    this.resizeCanvas();
    this.setupEventListeners();
    this.setupKeyboard();
    this.draw();
    this.restore();               // 설정 + 이전 쪽지 불러오기
  }

  // 메뉴 · 판 아이콘을 미리 읽어 둠 — 처음 여는 메뉴에서 아이콘이 늦게 뜨지 않게
  preloadIcons() {
    this.iconCache = PRELOAD_ICONS.map(name => {
      const img = new Image();
      img.src = ICON_DIR + name;
      if (img.decode) img.decode().catch(() => this.log(`아이콘을 못 읽음: ${name}`));
      return img;
    });
  }

  // 배율만 바뀌고 창 크기는 그대로일 때는 resize 가 안 올 수 있어서 따로 지켜봄
  watchPixelRatio() {
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    mq.addEventListener('change', () => {
      this.resizeCanvas();
      this.watchPixelRatio();
    }, { once: true });
  }

  // 문제 찾기용 기록 — main 이 앱 데이터 폴더의 debug-log.txt 에 남긴다 (%APPDATA%\wallpaper-canvas)
  log(text) {
    try { if (window.canvasAPI && window.canvasAPI.log) window.canvasAPI.log(text); } catch (_) {}
  }

  // 화면 배율(125% · 150%)만큼 캔버스 픽셀을 늘려야 격자가 흐리지 않음 — 그리기는 CSS 픽셀 기준 그대로
  resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    this.viewWidth = window.innerWidth;
    this.viewHeight = window.innerHeight;
    this.canvas.width = Math.round(this.viewWidth * dpr);
    this.canvas.height = Math.round(this.viewHeight * dpr);
    this.canvas.style.width = `${this.viewWidth}px`;
    this.canvas.style.height = `${this.viewHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dpr = dpr;
    this.draw();
  }

  setupEventListeners() {
    // 화면에서 난 오류도 기록에 남김
    window.addEventListener('error', (e) => this.log(`화면 오류: ${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`));
    window.addEventListener('unhandledrejection', (e) => this.log(`화면 오류: ${(e.reason && e.reason.message) || e.reason}`));

    // 휠: 어디서 돌려도 화면이 확대·축소됨 (쪽지·사진·파일 위에서도)
    //     단, 설정 창과 우클릭 메뉴 안에서는 원래대로 목록이 스크롤됨
    document.addEventListener('wheel', (e) => {
      if (e.target.closest && e.target.closest(SCROLLABLE_UI)) return;
      this.handleZoom(e);
    }, { passive: false });

    // 빈 곳: 끌면 화면 이동, 우클릭은 바탕화면 메뉴
    this.canvas.addEventListener('mousedown', (e) => this.handleCanvasMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleCanvasMouseMove(e));
    this.canvas.addEventListener('mouseup', () => this.handleCanvasMouseUp());
    this.canvas.addEventListener('contextmenu', (e) => this.handleContextMenu(e));
    this.canvas.addEventListener('mousedown', (e) => { if (e.button === 2) this.prefetchNativeMenu([]); });   // 바탕 메뉴는 보통 미리 만들어져 있음 — 없을 때만 (main.js)
    // 빈 곳을 두 번 누르면 캔버스 메뉴 (쪽지 추가 · 판 추가 …) — 우클릭은 윈도우 바탕화면 메뉴 (menus.js)
    this.canvas.addEventListener('dblclick', (e) => this.openDesktopMenu(e.clientX, e.clientY));

    // 쪽지·사진·파일 끌기 (문서 전체에서 마우스 추적)
    document.addEventListener('mousemove', (e) => this.handleDragMove(e));
    document.addEventListener('mouseup', () => this.handleDragEnd());

    // 창 크기나 화면 배율이 바뀌면 캔버스도 맞춤
    window.addEventListener('resize', () => this.resizeCanvas());
    this.watchPixelRatio();

    // 창이 닫힐 때 마지막 저장 (자동 저장이 꺼져 있으면 main 이 '저장할까요?'를 먼저 물어봄)
    window.addEventListener('beforeunload', () => this.flushSave());
    if (window.canvasAPI && window.canvasAPI.onSaveAndQuit) window.canvasAPI.onSaveAndQuit(() => this.saveAndQuit());
    // 트레이(알림 영역 아이콘) 메뉴에서 온 부탁: 설정 창 열기 · 설정 바꾸기 (main.js)
    if (window.canvasAPI && window.canvasAPI.onOpenSettings) window.canvasAPI.onOpenSettings(() => this.openSettings());
    if (window.canvasAPI && window.canvasAPI.onApplySetting) window.canvasAPI.onApplySetting((key, value) => this.updateSetting(key, value));

    // 탐색기에서 파일 끌어다 놓기 (그냥 두면 창이 그 파일로 넘어가 버리므로 막고 아이콘으로 만듦)
    document.addEventListener('dragover', (e) => {
      if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'link';
      }
    });
    document.addEventListener('drop', (e) => this.handleFileDrop(e));

    // 쪽지를 끌고 난 직후의 클릭은 무시 (체크박스 등이 잘못 눌리지 않게)
    document.addEventListener('click', (e) => {
      if (this.justDragged) {
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);

    // 수정 중인 쪽지 바깥을 누르면 수정 끝
    document.addEventListener('mousedown', (e) => {
      if (!this.editingId) return;
      const el = document.getElementById(this.editingId);
      if (el && el.contains(e.target)) return;
      if (e.target.closest && e.target.closest('#context-menu, #context-submenu, #style-panel, #desktop-menu, #add-menu, #template-menu, #board-add-menu, #code-lang-menu, #settings-dropdown, .settings-overlay')) return;
      this.stopEditing();
    }, true);

    // 캘린더에서 펼친 쪽지: 그 캘린더 밖(다른 쪽지 · 사진 · 파일 · 다른 판 · 빈 바탕)을 누르면 접힘 (calendar.js)
    document.addEventListener('mousedown', (e) => this.collapseFanOnOutside(e), true);

    // 연결선: 선 밖을 누르면 선 선택 풀기 · Alt + 끌기로 잇기 (links.js)
    this.setupLinks();
  }
}

// 기능별 메서드를 한 클래스로 합치기
Object.assign(
  InfiniteCanvas.prototype,
  viewMethods,
  menuMethods,
  noteMethods,
  noteBodyMethods,
  noteLinkMethods,
  fitMethods,
  codeCellMethods,
  stylePanelMethods,
  photoMethods,
  photoFrameMethods,
  boardMethods,
  boardNoteMethods,
  calendarMethods,
  timelineMethods,
  groupMethods,
  holidayMethods,
  dragMethods,
  fileMethods,
  storageMethods,
  settingsMethods,
  settingsWindowMethods,
  historyMethods,
  keyboardMethods,
  searchMethods,
  minimapMethods,
  selectionMethods,
  linkMethods,
  alignMethods,
);

// 여러 파일에서 같이 쓰는 값 — 아이콘 폴더 · 쪽지 색 · 글꼴 · 크기 (code/icons/아이콘_가이드.md 참고)

export const ICON_DIR = './icons/';

// 맥이면 ⌘ 도 Ctrl 처럼 — 윈도우에서는 윈도우 키(metaKey)를 쓰지 않음
//   (Win+D 뒤 윈도우 키가 눌린 채로 남은 것처럼 보일 때 그냥 끌기 · 글자 키가 다르게 동작하지 않게)
export const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || '');

// 쪽지 색상표: 쪽지 배경 / 색 선택 점(스와치). 접힘 파일은 icons/fold-<이름>.svg (가이드 2장)
export const NOTE_COLORS = {
  yellow: { bg: '#FDF2C2', swatch: '#FEEEAB', dot: '#FDE7AE' },
  pink:   { bg: '#FDE0E3', swatch: '#FEC9CB', dot: '#FEAAAD' },
  blue:   { bg: '#DCECFC', swatch: '#BBE0FC', dot: '#98C5FE' },
  green:  { bg: '#E0F4E2', swatch: '#BFEBC8', dot: '#99D3C8' },
  purple: { bg: '#E4E0FC', swatch: '#D5C3FA', dot: '#C5B0FD' },
  gray:   { bg: '#EFF0F0', swatch: '#ECECEE', dot: '#99A5B5' },
};

// 새 쪽지 색을 '랜덤'으로 두었을 때 뽑는 색 (회색 제외)
export const RANDOM_COLORS = ['yellow', 'pink', 'blue', 'green', 'purple'];

// 설정 창 '기본 쪽지 색상'의 점 순서 (가이드 7-5)
export const SETTINGS_COLOR_ORDER = ['yellow', 'pink', 'green', 'purple', 'blue', 'gray'];

// 예전 쪽지 색(#fffacd 등) → 새 색 이름
export const LEGACY_NOTE_COLORS = {
  '#fffacd': 'yellow', '#fff4cc': 'yellow', '#ffcccc': 'pink', '#ffd4e5': 'pink',
  '#ccf2f4': 'blue', '#cce5ff': 'blue', '#d0f5f0': 'green', '#e6d7f0': 'purple',
};

// 스타일 창의 쪽지 색 순서
export const STYLE_COLOR_ORDER = ['yellow', 'pink', 'blue', 'green', 'purple', 'gray'];

// 연결선 색 (가이드 16-2) — 쪽지 색과 같은 이름, 선이라 진하게 (사진 압정 색과 같은 무리).
//   gray 는 기본 선 색 (밝은 · 어두운 배경에 맞춰 styles/links.css 가 정함). 그 밖에 직접 고르기(custom)
export const LINK_COLORS = {
  gray:   null,
  yellow: '#E9B64A',
  pink:   '#EC8595',
  blue:   '#5E9FEC',
  green:  '#5DB585',
  purple: '#9384E8',
};
export const LINK_COLOR_ORDER = ['gray', 'yellow', 'pink', 'blue', 'green', 'purple'];
export const LINK_CUSTOM_DEFAULT = '#E0736C';     // 직접 고르기 창을 처음 열 때

// 쪽지 글자 색 (가이드 8-1)
export const INK_COLORS = {
  default: '#1F2F45',
  gray:    '#6B7280',
  orange:  '#C2410C',
  blue:    '#2563EB',
  green:   '#15803D',
  purple:  '#7C3AED',
};

// 쪽지 글꼴 — 실제 글꼴 값은 styles.css 의 .font-pen · .font-serif · .font-mono (fonts/fonts.css)
export const NOTE_FONTS = ['default', 'pen', 'serif', 'mono'];

// 글자 크기 단계 — 실제 크기는 styles.css 의 .size-s · .size-l · .size-xl
export const NOTE_TEXT_SIZES = ['s', 'm', 'l', 'xl'];

// 새 쪽지 기본 크기 (설정 창 드롭다운)
export const NEW_NOTE_SIZES = {
  small:  { width: 200, height: 150 },
  medium: { width: 240, height: 180 },
  large:  { width: 300, height: 225 },
};

export const GRID_GAPS = [24, 36, 48, 60];
// 확대 · 축소 감도 (설정 › 캔버스) — 휠 한 칸(100)에 보통은 약 10% (view.js handleZoom)
export const ZOOM_SPEEDS = { slowest: 0.5, slow: 0.75, normal: 1, fast: 1.5, fastest: 2 };

// 격자 모드에서 파일 아이콘이 들어가는 칸 — 기존 바탕화면처럼 (설정의 '격자 간격'과는 별개)
export const ICON_GRID = { left: 16, top: 16, width: 92, height: 108 };

export const NOTE_MIN_WIDTH = 160;
export const NOTE_MIN_HEIGHT = 120;
export const NOTE_MAX_AUTO_WIDTH = 720;   // '자동 확장'으로 넓어질 수 있는 한계 (zoom 1 기준)

// 설정 기본값 — '지금 동작대로' (사용자 확인)
export const DEFAULT_SETTINGS = {
  autoSave: true,
  openLastWorkspace: true,
  wallpaperMode: true,       // 바탕화면에 넣기 — 캔버스를 윈도우 바탕화면 층에 (main.js, 메모장.md Phase 5)
  theme: 'light',            // 'light' | 'dark'
  showGrid: false,
  gridGap: 36,
  desktopBackground: true,   // 바탕화면 배경 색 맞추기 — 윈도우 배경 화면을 캔버스 바탕색 단색으로 (main.js, 끄거나 앱을 끄면 원래대로)
  lockView: false,           // 화면 잠금 — 빈 곳 끌기 · 휠로 캔버스가 움직이거나 확대되지 않음 (view.js)
  zoomSpeed: 'normal',       // 확대 · 축소 감도 — ZOOM_SPEEDS 의 이름
  sleepAfter: 5,             // 가려져 있을 때 절전 — 다 가려진 채 이만큼(분) 지나면 캔버스 화면을 내려놓음, 0 = 끔 (main.js)
  gridSnap: false,           // 격자 모드 — 파일 아이콘이 칸에 맞춰 움직임
  alignGuides: true,         // 자 — 끌 때 다른 것의 가장자리 · 가운데에 맞춰 붙음 (align.js)
  calendarView: 'month',     // 새 캘린더 판 보기 — 'month' | 'week' (calendar.js)
  noteLinkView: 'embed',     // 쪽지 속 인터넷 주소 — 'embed'(영상 · 사진 바로 보기) | 'link'(링크만) (note-links.js)
  boardTone: 'theme',        // 새 캘린더 · 연대표 판 색 — 'theme'(배경 테마 따라) | 'light'(흰색) | 'dark'(검은색) (boards.js)
  weekStart: 0,              // 새 캘린더 판 주 시작 요일 — 0 일요일 | 1 월요일
  groupColor: 'yellow',      // 새 파일 묶음 색 (groups.js) — 색 이름 | 'custom'
  groupCustomColor: '#F5D6A8',
  photoFrame: 'paper',       // 새 사진 · 영상 틀 — 'paper' | 'tape' | 'pin' | 'none' (photos.js)
  videoSound: false,         // 새 영상 소리 켜고 시작
  videoAutoplay: true,       // 새 영상 바로 재생 (끄면 멈춘 채로)
  linkStyle: 'curve',        // 연결선 모양 — 'curve' | 'straight' (선마다 따로 정할 수도 있음, links.js)
  noteColor: 'random',       // 'random' | 색 이름 | 'custom'
  noteCustomColor: '#BFD7F5',
  noteSize: 'small',         // NEW_NOTE_SIZES 의 키
  overflow: 'wrap',          // 'wrap'(자동 줄넘김) | 'expand'(자동 확장)
  language: 'ko',            // 'ko' | 'en'
  holidays: true,            // 공휴일 달력 — 빨간 날을 구글 캘린더에서 받아옴 (holidays.js)
  holidayCountry: 'south_korea',
};

// 공휴일 달력 나라 (구글 캘린더 공휴일 달력 이름 — main.js 의 HOLIDAY_REGIONS 와 같게)
export const HOLIDAY_REGIONS = ['south_korea', 'usa', 'japanese', 'china', 'uk'];

// 켤 때 미리 읽어 두는 아이콘 — 메뉴 · 판 · 사진 틀 (처음 여는 메뉴에서 늦게 뜨지 않게)
export const PRELOAD_ICONS = [
  'add-note.svg', 'add-board.svg', 'add-memo.svg', 'add-image.svg', 'add-file.svg', 'add-template.svg',
  'add-code.svg', 'add-markdown.svg', 'add-meeting.svg', 'add-calendar.svg', 'add-timeline.svg',
  'checkbox.svg', 'checkbox-checked.svg', 'style-reset.svg', 'settings.svg', 'power.svg', 'chevron.svg',
  'edit.svg', 'copy.svg', 'pin.svg', 'palette.svg', 'trash.svg',
  'menu-axis.svg', 'menu-scale.svg', 'menu-link.svg', 'menu-today.svg', 'menu-weekstart.svg', 'menu-view.svg',
  'add-group.svg', 'menu-ungroup.svg', 'note-group.svg', 'note-more.svg', 'note-selected.svg', 'chevron-down.svg',
  'menu-connect.svg', 'menu-disconnect.svg', 'menu-align.svg', 'menu-straight.svg', 'note-link.svg',
  'add-video.svg', 'video-play.svg', 'video-pause.svg', 'video-sound.svg', 'video-mute.svg',
  'arrow-left.svg', 'arrow-right.svg', 'board-more.svg', 'plus.svg', 'rail-hook.svg',
  'photo-pin-red.svg', 'photo-pin-yellow.svg', 'photo-pin-blue.svg', 'photo-pin-green.svg',
  'photo-pin-purple.svg', 'photo-pin-gray.svg',
];

// 코드 셀 언어 목록은 renderer/syntax.js 의 CODE_LANGUAGES 에 있습니다.

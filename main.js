const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, nativeImage, screen, net, globalShortcut, Tray, Menu, session, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { execFile, spawn } = require('child_process');
const { buildLayout, cleanText } = require('./menu-layout');

// 앱 본체에서만 쓰는 메모리 치우기 (gc) — 바탕화면 층 사진을 찍고 나면 찍은 그림(화면 크기, 20MB 안팎 두 장)을
//   바로 돌려주려고. 가만두면 한참 뒤에야 치워서 그동안 30MB 가까이 붙잡고 있음 (updateMirror)
let collectGarbage = null;
try {
  require('v8').setFlagsFromString('--expose-gc');
  collectGarbage = require('vm').runInNewContext('gc');
} catch (_) {}

// ── 문제 찾기용 기록 ──────────────────────────────────────────────
// 무슨 일이 있었는지 앱 데이터 폴더의 debug-log.txt 에 남긴다 (%APPDATA%\wallpaper-canvas\debug-log.txt).
// 코드 폴더에는 쓰지 않음 (git 기록에 섞이지 않게). 200KB 가 넘으면 새로 시작한다
function logFile() {
  return path.join(app.getPath('userData'), 'debug-log.txt');
}
function logLine(text) {
  try {
    const file = logFile();
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    if (fs.existsSync(file) && fs.statSync(file).size > 200000) fs.unlinkSync(file);
    fs.appendFileSync(file, `[${stamp}] ${text}\n`, 'utf-8');
  } catch (_) {}
}

// 노트 저장 파일: C:\Users\<사용자>\AppData\Roaming\wallpaper-canvas\canvas-state.json
function getStateFile() {
  return path.join(app.getPath('userData'), 'canvas-state.json');
}

function readState() {
  const file = getStateFile();
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (err) {
    // 파일이 깨졌으면 지우지 않고 옆에 보관해 둔다 (다음 저장 때 덮어쓰지 않도록)
    const backup = file.replace(/\.json$/, `.broken-${Date.now()}.json`);
    try { fs.renameSync(file, backup); } catch (_) {}
    console.error('노트 파일을 읽지 못해 백업했습니다:', backup, err);
    return null;
  }
}

// 임시 파일에 먼저 쓰고 바꿔치기 → 저장 도중 꺼져도 기존 파일이 깨지지 않음
function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, file);
  return true;
}

function writeState(state) {
  return writeJsonAtomic(getStateFile(), state);
}

// 설정 파일: C:\Users\<사용자>\AppData\Roaming\wallpaper-canvas\settings.json
function getSettingsFile() {
  return path.join(app.getPath('userData'), 'settings.json');
}

// 사진을 넣어 두는 폴더 (이미지 추가 · 사진 넣기 · 붙여넣기)
function getImagesDir() {
  const dir = path.join(app.getPath('userData'), 'images');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];
const VIDEO_EXTENSIONS = ['mp4', 'm4v', 'webm', 'mov', 'ogv', 'mkv'];
const VIDEO_COPY_LIMIT = 500 * 1024 * 1024;     // 이보다 큰 영상은 복사하지 않고 원본 자리를 씀

function getVideosDir() {
  const dir = path.join(app.getPath('userData'), 'videos');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function copyImageToStore(src) {
  const dest = path.join(getImagesDir(), `${Date.now()}${path.extname(src).toLowerCase()}`);
  fs.copyFileSync(src, dest);
  return pathToFileURL(dest).href;
}

let mainWindow;

// 창이 덮을 영역 — 주 모니터의 작업 영역 (배율이 적용된 크기라 125% · 150% 화면에서도 딱 맞음)
//   바탕화면 층에 있을 때 · 꺼냈을 때 모두 같은 크기 (크기가 바뀌면 다시 그리는 게 보여서)
//   작업표시줄을 자동 숨김으로 두어 작업 영역이 화면 전체면 1 줄임 — 화면 전체를 덮는 창은 윈도우가 '전체 화면'으로 여겨 작업표시줄을 숨김
function screenArea() {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;
  const full = width === display.bounds.width && height === display.bounds.height;
  return { x, y, width, height: full ? height - 1 : height };
}

// 캔버스 바탕색 — 창 바탕도 같게 (창을 옮기는 동안 한 장면이 비어도 바탕색만 보이게)
const CANVAS_BG = { light: '#F5F5F5', dark: '#1F252C' };
function canvasBackground() {
  try {
    return JSON.parse(fs.readFileSync(getSettingsFile(), 'utf-8')).theme === 'dark' ? CANVAS_BG.dark : CANVAS_BG.light;
  } catch (_) {
    return CANVAS_BG.light;
  }
}

// 해상도 · 배율 · 모니터 구성 · 작업표시줄 위치가 바뀌면 창도 다시 맞춤
function fitWindowToScreen() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (wallpaper.embedded) {                         // 바탕화면 층: 새 크기로 다시 넣음
    embedWindow();
    return;
  }
  const area = screenArea();
  mainWindow.setBounds(area);
  logLine(`화면 크기 맞춤: ${area.width}×${area.height} (${area.x}, ${area.y})`);
  placeMirror();                                    // 바탕화면 층 사진도 새 크기로
}

// ================ 바탕화면 층 (메모장.md Phase 5) ================
// 설정 '바탕화면에 넣기'(기본 켬)면 캔버스를 바탕화면처럼 둠 — 두 가지 방법 중 먼저 되는 것
//   1) 바탕화면 바로 위에 붙잡기 (native/desktop-pin — C++ 모듈, 먼저 씀)
//      캔버스 창은 보통 창 그대로 두고 자리만 '바탕화면 바로 위 · 다른 프로그램 창들 뒤'에 붙잡음.
//      누르면 그대로 맨 앞 창이 되어 키보드 · 한글 조합이 바로 되고, 창을 어디에 넣고 빼지 않으니 화면 전환이 없음.
//      트레이 설정 창 · Ctrl+Alt+D 때만 잠깐 풀어 다른 창들 앞으로 (setPinnedFront)
//   2) 바탕화면 층에 넣기 (native/desktop-bridge.ps1 — 모듈을 못 읽을 때. 아래 설명)
// 설정 '바탕화면에 넣기'(기본 켬)면 캔버스 창을 윈도우 바탕화면 층에 넣음
//   → 다른 프로그램 창은 늘 그 위, '바탕화면 보기'(Win+D)에도 그대로, Alt+Tab 에도 안 나옴
//   자리는 바탕화면 창 안의 맨 위 — 윈도우 아이콘 층보다 위라 윈도우 아이콘은 가려짐 (파일 아이콘은 앱이 직접 그림).
//   탐색기 창은 숨기거나 바꾸지 않으므로 앱이 갑자기 꺼져도 바탕화면은 그대로
//   바탕화면 층의 창에는 키보드가 저절로 오지 않아서, 캔버스를 누를 때마다 키보드를 이 창으로 가져옴 (단축키용).
//   한글 조합은 '맨 앞 창'에서만 글자 자리에 그려져서(아니면 윈도우 조합 상자가 따로 뜸) 글을 쓰는 동안은
//   캔버스를 바탕화면 층에서 들어 올려 맨 앞 창으로 만들되 자리는 다른 창들 뒤 그대로 둠 (lift behind — 화면은 안 바뀜).
//   트레이에서 연 설정 창 · Ctrl+Alt+D 는 다른 창들 앞으로 (lift front). 끝나면 다시 바탕화면 층으로 (holdFront)
//   Ctrl+Alt+D: 캔버스를 다른 창들 앞으로 꺼냄 → 다른 창을 누르거나 한 번 더 누르면 다시 바탕화면 층으로
//     (Ctrl+Alt+Space 는 Claude 앱 등이 이미 씀. 다른 프로그램이 잡고 있으면 다음 후보로)
//   Win32 호출은 native/desktop-bridge.ps1 (윈도우에 들어 있는 PowerShell 의 C# 호출 — 새로 설치할 것 없음).
//   넣지 못하면 예전처럼 맨 위 창으로 씀
const POP_OUT_KEYS = ['Control+Alt+D', 'Control+Alt+W', 'Control+Alt+Q'];
let popOutKey = '';     // 실제로 잡은 단축키 (설정 창 안내에 씀)
const wallpaper = {
  wanted: false,        // 설정: 바탕화면에 넣기
  pinned: false,        // 바탕화면 바로 위에 붙잡아 둠 (방법 1)
  front: false,         // 붙잡은 창을 잠깐 풀어 다른 창들 앞에 꺼내 둔 중 (방법 1)
  embedded: false,      // 지금 바탕화면 층에 들어가 있음
  poppedOut: false,     // 바탕화면 층에서 들어 올린 중 (Ctrl+Alt+D, 또는 글 쓰는 동안 · 설정 창)
  lifted: null,         // 들어 올린 모양: 'front'(다른 창들 앞) · 'behind'(맨 앞 창이지만 다른 창들 뒤)
  autoPopped: false,    // 까닭(holds)이 있어 꺼낸 것 — 까닭이 없어지면 다시 넣음
  holds: new Set(),     // 앞으로 꺼내 둘 까닭: 'editing'(글 쓰는 중) · 'settings'(설정 창)
  deferred: false,      // 설정 창에서 켰음 — 설정 창을 닫으면 바탕화면 층으로 (지금 넣으면 설정 창까지 다른 창들 뒤로 숨음)
  moving: false,        // 넣고 빼는 중 (그 사이에 오는 창 활성 · 비활성은 무시)
  dialogOpen: false,    // 파일 고르기 · 윈도우 우클릭 메뉴가 떠 있는 중 (그동안은 다시 넣지 않음)
  keyboard: null,       // 캔버스를 눌렀을 때 키보드를 가져왔는지 — 'ok' | 'fail' (기록용)
  bridge: null,         // PowerShell 다리 — 한 번 띄워 두고 한 줄씩 명령 · 답
  queue: [],
  buffer: '',
};
let quitting = false;   // 사용자가 끄는 중 (탐색기가 다시 시작돼 창이 사라진 것과 구분)
let shellMenuOpen = false;   // 윈도우 11 모양 메뉴 · 윈도우 메뉴가 떠 있는 중 (다리를 바꿔 타지 않음)

function wallpaperSetting() {
  if (process.platform !== 'win32') return false;
  try {
    return JSON.parse(fs.readFileSync(getSettingsFile(), 'utf-8')).wallpaperMode !== false;
  } catch (_) {
    return true;
  }
}

// ---------------- 방법 1: 바탕화면 바로 위에 붙잡기 ----------------
// 모듈: native/desktop-pin/desktop_pin.node (npm run build:native 로 다시 만듦 — 만든 것도 같이 둠)
let deskPin;            // undefined: 아직 안 읽음 · null: 못 씀 (방법 2 로)
function loadDeskPin() {
  if (deskPin !== undefined) return deskPin;
  deskPin = null;
  if (process.platform !== 'win32') return null;
  try {
    const mod = require('./native/desktop-pin/desktop_pin.node');
    if (typeof mod.pin === 'function') deskPin = mod;
    else logLine('바탕화면 고정 모듈: 함수를 못 찾음 → 바탕화면 층에 넣기로');
  } catch (err) {
    logLine(`바탕화면 고정 모듈을 못 읽음 → 바탕화면 층에 넣기로: ${err && err.message}`);
  }
  return deskPin;
}

function pinWindow() {
  const pin = loadDeskPin();
  if (!pin || !mainWindow || mainWindow.isDestroyed()) return false;
  mainWindow.setAlwaysOnTop(false);
  const ok = pin.pin(mainWindow.getNativeWindowHandle());
  logLine(`바탕화면 바로 위에 붙잡기: ${ok ? 'ok' : 'fail'}`);
  if (!ok) return false;
  wallpaper.pinned = true;
  wallpaper.front = false;
  wallpaper.autoPopped = false;
  refreshTray();
  createMirror();                                   // 바탕화면 층에 캔버스 사진 (아래 mirror)
  return true;
}

function unpinWindow() {
  if (!wallpaper.pinned) return;
  if (deskPin) deskPin.unpin();
  wallpaper.pinned = false;
  wallpaper.front = false;
  wallpaper.autoPopped = false;
  destroyMirror();
}

// 붙잡은 창을 다른 창들 앞으로 꺼내거나 (front — 앞에 있는 동안 맨 위) 다시 바탕화면 바로 위로
//   auto: 까닭(holds)이 있어 꺼냄 — 까닭이 없어지면 다시 내려감
function setPinnedFront(front, auto = false) {
  if (!wallpaper.pinned || !mainWindow || mainWindow.isDestroyed()) return;
  if (front) {
    deskPin.setBottom(false);
    wallpaper.front = true;
    wallpaper.autoPopped = auto;
    mainWindow.setAlwaysOnTop(true);
    mainWindow.show();
    mainWindow.focus();
  } else {
    wallpaper.front = false;
    wallpaper.autoPopped = false;
    deskPin.setBottom(true);                          // 먼저 붙잡고 → 맨 위를 풀면 앞으로 튀어 오르지 않고 바로 바탕화면 위로
    mainWindow.setAlwaysOnTop(false);
  }
  logLine(`붙잡은 캔버스: ${front ? '앞으로 꺼냄' : '바탕화면 바로 위로'}`);
  refreshTray();
}

// 가끔 확인 — 바탕화면과 캔버스 사이에 다른 창이 끼었으면 다시 내림 (모듈이 맨 앞 창이 바뀔 때마다 살피지만 혹시 몰라)
let pinStats = '';      // 지난번 기록한 모듈 횟수 (바뀌면 기록)
function keepPinned() {
  const state = deskPin.state();
  const stats = `바탕화면 보기로 띄움 ${state.raises}번 · 다시 내림 ${state.sinks}번 (알림 ${state.events}번)`;
  if (state.raises !== undefined && stats !== pinStats) {
    if (pinStats) logLine(`붙잡은 캔버스: ${stats}${state.raised ? ' — 지금 바탕화면 보기 중' : ''}`);
    pinStats = stats;
  }
  if (!state.pinned) {
    logLine('바탕화면 고정이 풀려 있음 → 다시 붙잡음');
    pinWindow();
  } else if (!wallpaper.front && !state.raised && !state.rightAboveDesktop) {
    deskPin.setBottom(true);
  }
  keepMirror();
}

// ---------------- 바탕화면 층 사진 (방법 1 과 함께) ----------------
// 붙잡은 캔버스는 보통 창이라, 윈도우가 창들을 잠깐 치우고 바탕화면만 보여 줄 때
//   (Alt+Tab 미리 보기 · 창 맞춰 붙이기 도우미 · 작업 보기 · 화면 가장자리 끌기) 진짜 배경 화면이 보임
//   → 캔버스를 찍은 사진 한 장을 바탕화면 층(윈도우 아이콘 위)에 넣어 둠 (바탕화면 다리의 사진 창 — mirroropen · attach).
//   평소에는 붙잡은 캔버스가 같은 자리에서 덮어 안 보임. 캔버스가 바뀌면 (저장 · 바뀜 알림) 잠시 뒤 다시 찍음
//   사진이라 그 순간에는 영상이 멈춘 모습. 사진은 화면 배율만큼 줄여 보냄 (200% 화면이면 절반 — 잠깐 보이는 것이라 충분)
//   예전에는 Electron 창(mirror.html)이었는데 화면 하나 크기라 GPU · 화면 프로세스가 90MB 가까이 써서 다리 안의 가벼운 창으로
//   hwnd: 사진 창 · child: 그 창을 가진 다리 (다리가 새로 켜지면 창도 같이 사라짐 → 다시 만듦)
const MIRROR_DELAY = 900;             // 마지막으로 바뀐 뒤 이만큼 있다가 찍음
const mirror = { hwnd: '', child: null, ready: false, creating: false, timer: null, busy: false, again: false, color: '' };

async function createMirror() {
  if (mirror.ready || mirror.creating || process.platform !== 'win32' || !mainWindow || mainWindow.isDestroyed()) return;
  const child = startBridge();
  if (!child) return;
  mirror.creating = true;
  try {
    const opened = await bridgeCall('mirroropen');
    const m = /^ok (\d+)/.exec(opened);
    if (!m) {
      logLine(`바탕화면 층 사진 창 못 만듦: ${opened.slice(0, 80)}`);
      return;
    }
    const b = screen.dipToScreenRect(null, screenArea());
    const reply = await bridgeCall(`attach ${m[1]} ${b.x} ${b.y} ${b.width} ${b.height}`);
    logLine(`바탕화면 층 사진 넣기: ${reply.slice(0, 90)}`);
    if (!reply.startsWith('ok')) {
      bridgeCall('mirrorclose', 3000);
      return;
    }
    mirror.hwnd = m[1];
    mirror.child = child;
    mirror.ready = true;
    scheduleMirror(1500);                                        // 켤 때는 캔버스가 파일 · 쪽지를 다 그린 뒤에
    setTimeout(() => { if (mirror.hwnd === m[1]) scheduleMirror(0); }, 5000);
  } finally {
    mirror.creating = false;
  }
}

function destroyMirror() {
  clearTimeout(mirror.timer);
  const had = mirror.ready;
  mirror.hwnd = '';
  mirror.child = null;
  mirror.ready = false;
  if (had && wallpaper.bridge) bridgeCall('mirrorclose', 3000);  // 다리가 없으면 사진 창도 이미 없음
}

// 화면 크기가 바뀜 — 새 자리 · 크기로 다시 넣고 다시 찍음
async function placeMirror() {
  if (!mirror.ready) return;
  const b = screen.dipToScreenRect(null, screenArea());
  await bridgeCall(`attach ${mirror.hwnd} ${b.x} ${b.y} ${b.width} ${b.height}`);
  scheduleMirror(300);
}

// 가끔 확인 (keepPinned) — 다리가 새로 켜졌거나 탐색기가 다시 시작돼 사진 창이 사라졌으면 다시 만듦. 떨어졌으면 다시 넣음
async function keepMirror() {
  if (!wallpaper.pinned) return;
  if (mirror.ready && mirror.child !== wallpaper.bridge) {       // 예전 다리와 함께 사라짐
    mirror.ready = false;
    mirror.hwnd = '';
    mirror.child = null;
  }
  if (!mirror.ready) {
    createMirror();
    return;
  }
  const reply = await bridgeCall(`check ${mirror.hwnd}`, 3000);
  if (reply === 'detached' || reply === 'gone') {
    logLine(`바탕화면 층 사진 창이 ${reply === 'gone' ? '사라짐' : '떨어짐'} → 다시 만듦`);
    destroyMirror();
    createMirror();
  }
}

function scheduleMirror(delay = MIRROR_DELAY) {
  if (!mirror.ready) return;
  clearTimeout(mirror.timer);
  mirror.timer = setTimeout(updateMirror, delay);
}

async function updateMirror() {
  if (!mirror.ready || !mainWindow || mainWindow.isDestroyed()) return;
  if (mirror.busy) {                                 // 찍는 중이면 끝난 뒤 한 번 더
    mirror.again = true;
    return;
  }
  mirror.busy = true;
  try {
    let shot = await mainWindow.webContents.capturePage();     // 다른 창 뒤에 가려져 있어도 찍힘
    if (shot.isEmpty() || !mirror.ready) return;
    const scale = screen.getPrimaryDisplay().scaleFactor || 1;
    if (scale > 1) {
      const size = shot.getSize();
      shot = shot.resize({ width: Math.round(size.width / scale), height: Math.round(size.height / scale), quality: 'good' });
    }
    const file = path.join(app.getPath('userData'), 'desktop-mirror.jpg');
    await fs.promises.writeFile(file, shot.toJPEG(85));
    const color = mirror.color || canvasBackground();
    const reply = await bridgeCall(`mirrorshot ${Buffer.from(file, 'utf8').toString('base64')} ${color}`, 5000);
    if (!reply.startsWith('ok')) logLine(`바탕화면 층 사진 못 바꿈: ${reply.slice(0, 80)}`);
  } catch (err) {
    logLine(`바탕화면 층 사진 못 찍음: ${err && err.message}`);
  } finally {
    if (collectGarbage) setImmediate(() => { try { collectGarbage(); } catch (_) {} });   // 찍은 그림을 바로 돌려줌
    mirror.busy = false;
    if (mirror.again) {
      mirror.again = false;
      scheduleMirror();
    }
  }
}

// ---------------- 방법 2: 바탕화면 층에 넣기 ----------------
// 설치한 앱에서는 코드가 app.asar 한 파일 안에 있음 — 다른 프로그램(PowerShell)이 읽을 파일은
//   app.asar.unpacked 에 풀어 둔 것을 씀 (package.json build.asarUnpack: native/**)
function unpackedPath(p) {
  return p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
}
const BRIDGE_SCRIPT = unpackedPath(path.join(__dirname, 'native', 'desktop-bridge.ps1'));

// 다리 창 프로그램 (.exe) — desktop-bridge.cs 를 한 번 만들어 앱 데이터 폴더에 둠 (소스가 바뀌면 새로)
//   PowerShell(콘솔 프로그램)로 돌리면 윈도우가 표시 언어를 영어로 걸러서 탐색기 메뉴가 'Ne&w' · 'Cu&t' 처럼 나옴
//   → 창 프로그램을 먼저 쓰고, 아직 없으면 PowerShell 로 돌리면서 뒤에서 만듦 (다 되면 쉬는 틈에 바꿔 탐)
const bridgeExe = { path: '', building: false, failed: false };   // failed: 이번에 켠 동안은 창 프로그램을 쓰지 않음 (못 띄웠음)

function bridgeExePath() {
  try {
    const source = fs.readFileSync(path.join(__dirname, 'native', 'desktop-bridge.cs'));
    const hash = require('crypto').createHash('sha1').update(source).digest('hex').slice(0, 10);
    return path.join(app.getPath('userData'), 'bridge', `desktop-bridge-${hash}.exe`);
  } catch (_) {
    return '';
  }
}

function buildBridgeExe(target) {
  if (bridgeExe.building || !target) return;
  bridgeExe.building = true;
  const dir = path.dirname(target);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.readdirSync(dir).filter(n => /^desktop-bridge-.*\.exe$/.test(n) && path.join(dir, n) !== target)   // 예전 것은 지움
      .forEach(n => { try { fs.unlinkSync(path.join(dir, n)); } catch (_) {} });
  } catch (_) {}
  const script = BRIDGE_SCRIPT;
  const temp = target.replace(/\.exe$/, '.building.exe');   // 이름이 .exe 로 끝나야 Add-Type 이 창 프로그램으로 만듦 (아니면 DLL)
  execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Compile', temp],
    { windowsHide: true, timeout: 60000 }, (err) => {
      bridgeExe.building = false;
      try {
        if (err || !fs.existsSync(temp)) throw err || new Error('no output');
        fs.renameSync(temp, target);
        bridgeExe.path = target;
        logLine(`바탕화면 다리 창 프로그램 만듦: ${path.basename(target)}`);
        switchBridgeWhenIdle();
      } catch (e) {
        logLine(`바탕화면 다리 창 프로그램 못 만듦 → PowerShell 로 계속: ${e && e.message}`);
        try { fs.unlinkSync(temp); } catch (_) {}
      }
    });
}

// PowerShell 로 돌던 다리를 쉬는 틈에 끝냄 → 다음 명령부터 창 프로그램 (윈도우 메뉴가 떠 있거나 명령을 기다리는 중이면 나중에)
function switchBridgeWhenIdle(tries = 20) {
  const child = wallpaper.bridge;
  if (!child || child.bridgeKind === 'exe') return;
  if (wallpaper.queue.length || shellMenuOpen) {
    if (tries > 0) setTimeout(() => switchBridgeWhenIdle(tries - 1), 3000);
    return;
  }
  wallpaper.bridge = null;
  try { child.stdin.end(); } catch (_) {}
  startBridge();
}

function startBridge() {
  if (wallpaper.bridge || process.platform !== 'win32') return wallpaper.bridge;
  if (!bridgeExe.path && !bridgeExe.failed) {
    const target = bridgeExePath();
    if (target && fs.existsSync(target)) bridgeExe.path = target;
    else buildBridgeExe(target);
  }
  const script = BRIDGE_SCRIPT;
  let child;
  try {
    child = bridgeExe.path
      ? spawn(bridgeExe.path, [], { windowsHide: true })
      : spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true });
    child.bridgeKind = bridgeExe.path ? 'exe' : 'powershell';
  } catch (err) {
    logLine(`바탕화면 다리 못 띄움: ${err && err.message}`);
    if (bridgeExe.path) {                            // 창 프로그램이 안 되면 이번에는 PowerShell 로만 (다시 찾지 않음)
      try { fs.unlinkSync(bridgeExe.path); } catch (_) {}      // 망가진 파일이면 다음에 켤 때 새로 만듦
      bridgeExe.path = '';
      bridgeExe.failed = true;
      return startBridge();
    }
    return null;
  }
  wallpaper.bridge = child;
  wallpaper.buffer = '';
  wallpaper.queue = [(line) => logLine(`바탕화면 다리 준비: ${line}`)];     // 첫 줄 'ready …'
  child.stdout.on('data', (data) => {
    wallpaper.buffer += data.toString();
    let i;
    while ((i = wallpaper.buffer.indexOf('\n')) >= 0) {
      const line = wallpaper.buffer.slice(0, i).trim();
      wallpaper.buffer = wallpaper.buffer.slice(i + 1);
      if (line.startsWith('evt ')) {                  // 명령과 상관없는 알림
        bridgeEvent(line.slice(4));
        continue;
      }
      const next = wallpaper.queue.shift();
      if (next) next(line);
    }
  });
  child.stderr.on('data', (data) => logLine(`바탕화면 다리 오류: ${String(data).trim().slice(0, 300)}`));
  child.on('error', (err) => {
    logLine(`바탕화면 다리 오류: ${err && err.message}`);
    if (child.bridgeKind === 'exe') {               // 창 프로그램이 안 되면 이번에는 PowerShell 로만
      bridgeExe.path = '';
      bridgeExe.failed = true;
    }
  });
  child.on('exit', (code) => {
    logLine(`바탕화면 다리 끝남 (${code}, ${child.bridgeKind})`);
    if (wallpaper.bridge === child) {
      wallpaper.queue.splice(0).forEach(done => done('fail exit'));
      wallpaper.bridge = null;
    }
  });
  return child;
}

// 다리가 먼저 알려 오는 것 — desktop-restarted: 탐색기가 다시 시작됨 (창이 사라졌으면 'closed' 가 다시 만들고, 남아 있으면 다시 넣음)
function bridgeEvent(name) {
  logLine(`바탕화면 다리 알림: ${name}`);
  if (name === 'desktop-restarted') {
    setTimeout(keepOnDesktop, 1500);
    setTimeout(() => prepMenu([], true), 2500);     // 미리 만든 바탕 메뉴도 새 탐색기로
  }
}

// 다리에 명령 한 줄 → 답 한 줄 (답이 늦으면 'fail timeout')
function bridgeCall(command, timeout = 10000) {
  const child = startBridge();
  if (!child) return Promise.resolve('fail no-bridge');
  return new Promise((resolve) => {
    let done = false;
    const finish = (line) => { if (!done) { done = true; resolve(line); } };
    wallpaper.queue.push(finish);
    setTimeout(() => finish('fail timeout'), timeout);
    try { child.stdin.write(`${command}\n`); } catch (err) { finish(`fail ${err && err.message}`); }
  });
}

function windowHandle() {
  const buf = mainWindow.getNativeWindowHandle();
  return buf.length >= 8 ? buf.readBigUInt64LE(0).toString() : String(buf.readUInt32LE(0));
}

// 다리가 캔버스 창의 자리 · 크기를 바꾸는 명령 (attach · detach · lift — SetWindowPos)
//   창은 resizable: false (화면 끝을 끌어도 크기가 그대로) 인데, 그러면 Electron 이 가장 작은 · 큰 크기를 지금 크기로 묶어
//   다른 프로그램(다리)의 SetWindowPos 로도 크기가 안 바뀜 (화면 크기가 바뀐 뒤 다시 넣을 때) → 그동안만 풀었다가 새 크기로 다시 묶음
async function bridgeResize(command) {
  const win = mainWindow;
  if (win && !win.isDestroyed()) win.setResizable(true);
  try {
    return await bridgeCall(command);
  } finally {
    if (win && !win.isDestroyed()) win.setResizable(false);
  }
}

// 바탕화면 층에 넣기 — 주 모니터의 작업 영역 (들어 올렸을 때와 같은 크기)
async function embedWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const b = screen.dipToScreenRect(null, screenArea());
  const onTop = mainWindow.isAlwaysOnTop();
  wallpaper.moving = true;
  try {
    mainWindow.setAlwaysOnTop(false);
    const reply = await bridgeResize(`attach ${windowHandle()} ${b.x} ${b.y} ${b.width} ${b.height}`);
    logLine(`바탕화면 층에 넣기: ${reply}`);
    if (!reply.startsWith('ok')) {
      if (onTop && mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(true);
      return false;
    }
    wallpaper.embedded = true;
    wallpaper.poppedOut = false;
    wallpaper.lifted = null;
    wallpaper.autoPopped = false;
    return true;
  } finally {
    wallpaper.moving = false;
    refreshTray();
  }
}

// 바탕화면 층에서 꺼내 보통 창으로 — bounds 는 Electron 좌표 (배율 적용)
async function unembedWindow(bounds) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const b = screen.dipToScreenRect(null, bounds);
  wallpaper.moving = true;
  try {
    const reply = await bridgeResize(`detach ${windowHandle()} ${b.x} ${b.y} ${b.width} ${b.height}`);
    logLine(`바탕화면 층에서 꺼냄: ${reply}`);
    wallpaper.embedded = false;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setBounds(bounds);
  } finally {
    wallpaper.moving = false;
    refreshTray();
  }
}

// 보통 창으로 앞에 (예전 방식 — 앞에 있는 동안 맨 위)
function showOnTop() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setAlwaysOnTop(true);
  mainWindow.show();
  mainWindow.focus();
}

// 바탕화면 층에서 들어 올리기 — 크기 · 자리는 그대로, 키보드 · 한글 입력이 되는 맨 앞 창으로 (native/desktop-bridge.ps1 lift)
//   mode 'front': 다른 창들 앞으로, 'behind': 다른 창들 뒤 그대로 (화면이 바뀌지 않음). 반환: 됐는지
async function liftWindow(mode, auto) {
  if (!mainWindow || mainWindow.isDestroyed() || wallpaper.moving) return false;
  const b = screen.dipToScreenRect(null, screenArea());
  wallpaper.moving = true;
  try {
    const reply = await bridgeResize(`lift ${windowHandle()} ${b.x} ${b.y} ${b.width} ${b.height} ${mode}`);
    logLine(`바탕화면 층에서 들어 올림 (${mode}): ${reply.slice(0, 120)}`);
    if (!reply.startsWith('ok')) return false;
    wallpaper.embedded = false;
    wallpaper.poppedOut = true;
    wallpaper.lifted = mode;
    wallpaper.autoPopped = auto;
    return true;
  } finally {
    wallpaper.moving = false;
    refreshTray();
  }
}

// 앞으로 꺼내기 (Ctrl+Alt+D · 트레이) — auto: 까닭(holds)이 있어 꺼냄 (까닭이 없어지면 다시 넣음)
async function popOut(auto = false) {
  if (!wallpaper.embedded || wallpaper.moving) return;
  await liftWindow('front', auto);
}

// 들어 올려 둘 까닭을 더하고 빼기 — 'editing'(preload.js: 글 칸에 초점 → 뒤에 둔 채) · 'settings'(설정 창 → 앞으로)
function holdFront(reason, on) {
  if (on) wallpaper.holds.add(reason);
  else wallpaper.holds.delete(reason);
  if (wallpaper.deferred && !wallpaper.holds.has('settings')) {     // 설정 창에서 켜 둔 것 — 닫았으니 이제 넣음
    wallpaper.deferred = false;
    enterWallpaperWhenFree();
    return;
  }
  syncFront();
}

// 까닭에 맞게 들어 올리거나 다시 넣음 — 단축키로 꺼낸 것은 그대로. 옮기는 사이에 까닭이 바뀌었으면 한 번 더
async function syncFront() {
  if (wallpaper.moving || !wallpaper.wanted || !mainWindow || mainWindow.isDestroyed()) return;
  if (wallpaper.pinned) {                               // 방법 1: 글 쓰기는 까닭이 아님 (붙잡은 채로 한글 조합이 됨)
    if (wallpaper.front && !wallpaper.autoPopped) return;
    const want = wallpaper.holds.has('settings');
    if (want && !wallpaper.front) setPinnedFront(true, true);
    else if (!want && wallpaper.front && !wallpaper.dialogOpen) setPinnedFront(false);
    return;
  }
  if (wallpaper.poppedOut && !wallpaper.autoPopped) return;
  const want = wallpaper.holds.has('settings') ? 'front' : wallpaper.holds.has('editing') ? 'behind' : null;
  let moved = false;
  if (want && want !== wallpaper.lifted && (wallpaper.embedded || wallpaper.poppedOut)) {
    moved = await liftWindow(want, true);
  } else if (!want && wallpaper.poppedOut && !wallpaper.dialogOpen) {
    moved = await embedWindow();
  }
  if (moved) syncFront();
}
ipcMain.on('front-hold', (event, reason, on) => holdFront(String(reason), !!on));

// 색 고르는 창 (input type=color — 글자 색 · 쪽지 색 직접 고르기) — 창이 뜨면 캔버스 창이 포커스를 잃어
//   앞에 꺼낸 캔버스가 바탕화면 층으로 다시 들어가 버림 → 떠 있는 동안은 그대로 두고, 창을 닫아 캔버스가 다시 포커스를 받으면 풂
ipcMain.on('color-dialog', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  wallpaper.dialogOpen = true;
  mainWindow.once('focus', () => {
    wallpaper.dialogOpen = false;
    syncFront();
  });
});

// Ctrl+Alt+D — 꺼내기 · 다시 넣기
async function togglePopOut() {
  if (sleep.asleep) {
    wake('앞으로 꺼내기', () => togglePopOut());
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed() || !wallpaper.wanted || wallpaper.moving) return;
  if (wallpaper.pinned) {
    setPinnedFront(!wallpaper.front);
    return;
  }
  if (wallpaper.embedded) await popOut();
  else if (wallpaper.poppedOut) await embedWindow();
}

// 넣지 못했으면 (탐색기가 막 다시 시작된 때 등) 잠시 뒤 다시 해 봄
function retryEmbed(tries = 5) {
  setTimeout(async () => {
    if (!mainWindow || mainWindow.isDestroyed() || !wallpaper.wanted) return;
    if (wallpaper.pinned || wallpaper.embedded || wallpaper.poppedOut || wallpaper.moving) return;
    if (!(await embedWindow()) && tries > 1) retryEmbed(tries - 1);
  }, 3000);
}

// 바탕화면 층에 붙어 있는지 가끔 확인 — 탐색기가 다시 시작되면 떨어지고, 바탕화면을 새로 고치면 윈도우 아이콘 층이 위로 올라오기도 함
async function keepOnDesktop() {
  if (wallpaper.pinned && mainWindow && !mainWindow.isDestroyed()) {
    keepPinned();
    return;
  }
  if (!wallpaper.embedded || wallpaper.moving || !mainWindow || mainWindow.isDestroyed()) return;
  const reply = await bridgeCall(`check ${windowHandle()}`, 3000);
  if (reply === 'ok raised') logLine('윈도우 아이콘 층이 위로 올라와 캔버스를 다시 맨 위로');
  if (reply !== 'detached' || !wallpaper.embedded || wallpaper.moving) return;
  logLine('바탕화면 층에서 떨어짐 → 다시 넣음');
  wallpaper.embedded = false;
  if (!(await embedWindow())) {
    showOnTop();
    retryEmbed();
  }
}

// 바탕화면 층의 캔버스를 누르면 키보드를 이 창으로 (preload.js 가 누를 때마다 알림) — Delete · Ctrl+Z 같은 단축키용
function claimKeyboard() {
  if (!wallpaper.embedded || wallpaper.moving || !mainWindow || mainWindow.isDestroyed()) return;
  bridgeCall(`focus ${windowHandle()}`, 3000).then((reply) => {
    const state = reply.startsWith('ok') ? 'ok' : 'fail';
    if (state !== wallpaper.keyboard) logLine(`바탕화면 층 키보드: ${reply}`);
    wallpaper.keyboard = state;
  });
}
ipcMain.on('canvas-pressed', claimKeyboard);

// ================ 절전 — 오래 가려져 있으면 캔버스 화면을 내려놓음 (설정 › 일반 › 가려져 있을 때 절전) ================
// 캔버스는 바탕화면이라 거의 늘 다른 창에 가려져 있음 → 다 가려진 채로 정한 시간(기본 5분)이 지나면
//   저장 → 바탕화면 층 사진(mirror)을 새로 찍음 → 캔버스 창 · 우클릭 메뉴 창을 닫아 화면 · GPU 메모리를 돌려줌
//   그동안 바탕화면 자리에는 사진이 보임. 바탕화면이 보이면 (1초마다 다리 uncovered) · 트레이 · 단축키로 다시 엶 (1~2초)
//   안 하는 때: 글을 쓰는 중 · 저장 안 한 변경 (자동 저장 끔) · 소리가 나는 중 (영상 · 웹 페이지 쪽지) · 앞으로 꺼내 둔 중 · 메뉴 · 고르는 창
//   가려졌는지는 화면(preload.js)의 visibilitychange — 크로미움이 창이 다 가려지면 hidden 으로 알림
const sleep = { hidden: false, timer: null, asleep: false, poll: null, since: 0, tempMirror: false };
const SLEEP_WAKE_OPEN = 20;          // 바탕화면이 이만큼(천분율) 보이면 깨움

function sleepAfterMs() {
  try {
    const minutes = JSON.parse(fs.readFileSync(getSettingsFile(), 'utf-8')).sleepAfter;
    if (typeof minutes === 'number' && minutes >= 0) return minutes * 60 * 1000;
  } catch (_) {}
  return 5 * 60 * 1000;
}

function scheduleSleep(delay = sleepAfterMs()) {
  clearTimeout(sleep.timer);
  if (!sleep.hidden || sleep.asleep || !delay) return;
  sleep.timer = setTimeout(trySleep, delay);
}

ipcMain.on('canvas-visibility', (event, hidden) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return;
  sleep.hidden = !!hidden;
  if (sleep.hidden) {
    sleep.since = Date.now();
    scheduleSleep();
  } else {
    clearTimeout(sleep.timer);
  }
});

// 소리가 나는지 — 캔버스(쪽지 속 유튜브 재생기 포함) · 웹 페이지 쪽지
function anyAudible() {
  const { webContents } = require('electron');
  return webContents.getAllWebContents().some(wc => !wc.isDestroyed() && wc.isCurrentlyAudible());
}

async function trySleep() {
  if (sleep.asleep || quitting || !sleep.hidden || !mainWindow || mainWindow.isDestroyed() || process.platform !== 'win32') return;
  const busy = !wallpaper.wanted ? '바탕화면에 넣기 꺼짐'
    : wallpaper.front || wallpaper.poppedOut ? '앞으로 꺼내 둔 중'
    : wallpaper.holds.size || wallpaper.dialogOpen || shellMenuOpen ? '글 · 메뉴 · 고르는 창'
    : unsaved.dirty ? '저장 안 한 변경'
    : anyAudible() ? '소리가 나는 중' : '';
  if (busy) {
    logLine(`절전 미룸: ${busy}`);
    scheduleSleep(60 * 1000);                          // 1분 뒤 다시 봄 (그동안 보이면 취소)
    return;
  }
  let ready;
  try {
    ready = await mainWindow.webContents.executeJavaScript('window.canvasApp ? canvasApp.prepareSleep() : { ok: false, reason: "화면 준비 전" }', true);
  } catch (err) {
    ready = { ok: false, reason: err && err.message };
  }
  if (!ready || !ready.ok) {
    logLine(`절전 미룸: ${(ready && ready.reason) || '?'}`);
    scheduleSleep(60 * 1000);
    return;
  }
  if (!sleep.hidden || !mainWindow || mainWindow.isDestroyed()) return;   // 그사이 보이게 됨
  // 절전 동안 보일 사진 — 붙잡기(방법 1)면 이미 있음, 넣기(방법 2)면 이번만 만듦
  sleep.tempMirror = !mirror.ready;
  if (!mirror.ready) await createMirror();
  if (!mirror.ready) {                                 // 사진 창을 못 만들면 절전하지 않음 (바탕화면이 비어 보이지 않게)
    logLine('절전 미룸: 바탕화면 층 사진 창을 못 만듦');
    scheduleSleep(60 * 1000);
    return;
  }
  clearTimeout(mirror.timer);
  while (mirror.busy) await new Promise(r => setTimeout(r, 50));
  await updateMirror();
  if (!sleep.hidden || !mainWindow || mainWindow.isDestroyed()) return;
  sleep.asleep = true;
  logLine(`절전: 캔버스 화면을 내려놓음 (가려진 지 ${Math.round((Date.now() - sleep.since) / 60000)}분)`);
  if (menuOverlay && !menuOverlay.isDestroyed()) menuOverlay.destroy();   // 우클릭 메뉴 창도 (깨면 다시 만듦)
  mainWindow.destroy();
  if (collectGarbage) setTimeout(() => { try { collectGarbage(); } catch (_) {} }, 1000);
  // GPU 프로세스도 끝냄 — 창이 없어도 그래픽 드라이버 몫 · 캐시로 150MB 넘게 쥐고 있음. 깨면 크로미움이 새로 띄움
  //   (크로미움은 GPU 프로세스가 몇 번 끝나면 하드웨어 가속을 아주 꺼 버려서 그 한도를 풀어 둠 — 아래 disable-gpu-process-crash-limit)
  setTimeout(() => {
    if (!sleep.asleep) return;
    const gpu = app.getAppMetrics().find(m => m.type === 'GPU');
    if (!gpu) return;
    try {
      process.kill(gpu.pid);
      logLine(`절전: GPU 프로세스 끝냄 (${Math.round(gpu.memory.privateBytes / 1024)}MB)`);
    } catch (err) {
      logLine(`절전: GPU 프로세스를 못 끝냄: ${err && err.message}`);
    }
  }, 1500);
  clearInterval(sleep.poll);
  sleep.poll = setInterval(checkWake, 1000);
}

// 바탕화면이 보이는지 1초마다 — 다른 창이 비키거나 최소화되거나 '바탕화면 보기'(Win+D)
async function checkWake() {
  if (!sleep.asleep) return;
  const b = screen.dipToScreenRect(null, screenArea());
  const reply = await bridgeCall(`uncovered ${b.x} ${b.y} ${b.width} ${b.height}`, 3000);
  const m = /^ok (\d+)/.exec(reply);
  if (m && Number(m[1]) >= SLEEP_WAKE_OPEN) wake(`바탕화면이 보임 (${m[1]}‰)`);
}

// 다시 엶 — then: 화면이 다 뜬 뒤 할 일 (트레이 · 단축키로 깨웠을 때 그 일)
function wake(reason, then = null) {
  if (!sleep.asleep) {
    if (then) then();
    return;
  }
  clearInterval(sleep.poll);
  sleep.poll = null;
  sleep.asleep = false;
  sleep.hidden = false;
  logLine(`절전 끝: ${reason}`);
  createWindow();
  const win = mainWindow;
  win.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      if (sleep.tempMirror && !wallpaper.pinned) destroyMirror();       // 넣기(방법 2)에서 절전용으로만 만든 사진 창
      sleep.tempMirror = false;
      if (then && mainWindow === win) then();
    }, 1500);
  });
}

// 시험용 (run-app.js — DESKCANVAS_TEST 일 때만)
if (process.env.DESKCANVAS_TEST) global.__deskCanvasSleep = { trySleep, wake, state: () => ({ ...sleep, window: !!mainWindow }) };

// ================ 윈도우 우클릭 메뉴 ================
// 파일 · 바탕화면 빈 곳을 우클릭하면 윈도우 탐색기 메뉴를 그대로 띄움 (native/desktop-bridge.ps1) — 앱 줄은 위에 붙임
//   paths: 파일들 (같은 폴더) — 비었으면 바탕화면 빈 곳 메뉴. items: [{ id, parent, label, flags }] (id 1~999)
//   반환: { kind: 'app', id } · { kind: 'shell', verb } · { kind: 'rename' } · { kind: 'none' } · null (못 띄움 → 앱 메뉴로)
//   윈도우 11 모양으로 그림 (menu.html · menu-layout.js): 다리가 메뉴를 만들어 두고(menuopen) 줄들을 주면 앱이 그려 고르게 하고,
//   고른 줄을 다리가 실행(menuinvoke). '추가 옵션 표시' 는 같은 메뉴를 예전 모양으로 (menushow). 못 그리면 예전 모양 그대로 (menu)
//   items 의 role · icon · key: 윈도우 11 메뉴의 자리 · 앱 아이콘 · 오른쪽 단축키 글자 (renderer/menus.js)
ipcMain.handle('shell-menu', async (event, paths, items) => {
  if (process.platform !== 'win32' || !startBridge()) return null;
  const clean = (s) => String(s || '').replace(/[\t\r\n]/g, ' ').replace(/&/g, '&&');   // & 는 윈도우 메뉴에서 밑줄 글자
  const list = Array.isArray(items) ? items : [];
  const targets = menuPaths(paths);
  menuPrep.keys.delete(menuKey(targets));             // 미리 만들어 둔 것은 이번 메뉴가 씀 (한 번 쓰면 다리가 버림)
  menuPrep.next = null;                               // 기다리던 미리 만들기는 버림 (메뉴 뒤에 끼어 고른 줄 실행이 늦지 않게)
  const lines = [
    ...targets,
    '--',
    ...list.map(it => [it.id | 0, it.parent | 0, clean(it.label), String(it.flags || '')].join('\t')),
  ];
  const payload = Buffer.from(lines.join('\n'), 'utf8').toString('base64');
  wallpaper.dialogOpen = true;                        // 메뉴가 떠 있는 동안 앞에 꺼낸 캔버스를 다시 넣지 않음
  shellMenuOpen = true;
  let reply;
  try {
    const asked = Date.now();
    const opened = await bridgeCall(`menuopen ${payload}`, 20000);
    let tree = null;
    if (opened.startsWith('ok ')) {
      try { tree = JSON.parse(Buffer.from(opened.slice(3), 'base64').toString('utf8')); } catch (_) {}
    }
    if (tree) logLine(`윈도우 우클릭 메뉴 받음: ${Date.now() - asked}ms (${tree.prep ? '미리 받아 둔 것' : '새로 받음'}, ${targets.length ? `파일 ${targets.length}개` : '바탕'})`);
    if (!tree) {
      logLine(`윈도우 11 모양 메뉴 못 만듦 → 예전 모양: ${opened.slice(0, 80)}`);
      reply = await bridgeCall(`menu ${payload}`, 10 * 60 * 1000);
    } else {
      const appInfo = new Map();
      list.forEach(it => {
        const info = { role: it.role || '', icon: it.icon || '', key: it.key || '' };
        appInfo.set(it.id | 0, info);
        if (list.some(x => (x.parent | 0) === (it.id | 0))) appInfo.set(`sub:${cleanText(clean(it.label)).text}`, info);   // 하위 목록은 글자로
      });
      const choice = await showFluentMenu(buildLayout(tree, appInfo, trayText().more));
      if (choice === null) {
        await bridgeCall('menuclose', 3000);
        reply = 'ok none';
      } else if (choice === -1) {
        reply = await bridgeCall('menushow', 10 * 60 * 1000);      // 추가 옵션 표시 — 예전 모양 메뉴 전체
      } else {
        reply = await bridgeCall(`menuinvoke ${choice}`, 60000);
      }
    }
  } finally {
    wallpaper.dialogOpen = false;
    shellMenuOpen = false;
    setTimeout(() => prepMenu([]), 300);               // 다음 바탕 우클릭을 위해 다시 만들어 둠
  }
  logLine(`윈도우 우클릭 메뉴: ${reply}`);
  if (wallpaper.embedded) claimKeyboard();            // 메뉴가 가져간 키보드를 캔버스로 (붙잡은 창은 다리가 메뉴 전 맨 앞 창으로 되돌려 줌)
  const m = /^ok (\w+) ?(.*)$/.exec(reply);
  // 붙잡은 캔버스: 앱 줄 · 그만둠 · 이름 바꾸기면 키보드를 캔버스로 (윈도우 명령은 열린 창이 맨 앞 창을 가져가게 둠)
  if (wallpaper.pinned && mainWindow && !mainWindow.isDestroyed() && (!m || m[1] !== 'shell')) mainWindow.focus();
  if (!m) return reply.startsWith('fail invoke') ? { kind: 'shell', verb: '' } : null;
  if (m[1] === 'app') return { kind: 'app', id: Number(m[2]) };
  if (m[1] === 'shell') return { kind: 'shell', verb: m[2] === '-' ? '' : m[2] };
  return { kind: m[1] };
});

// ---------------- 미리 만들어 두기 (다리 menuprep) ----------------
// 우클릭(단추를 뗄 때)에 탐색기 메뉴를 새로 만들면 0.1~0.3초 (처음에는 0.7초) 늦게 뜸
//   → 탐색기 줄만 든 메뉴를 다리가 미리 만들어 둠. menuopen 이 같은 대상이면 앱 줄만 위에 넣어 바로 답함
//   바탕 메뉴: 다리가 준비되면 · 메뉴를 쓴 뒤마다 · 10분마다 새로 (새로 깐 프로그램의 줄도 들어오게)
//   파일 메뉴: 파일에서 오른쪽 단추를 누르는 순간 (renderer → menu-prefetch) — 떼기 전에 만들어 둠
//   keys: 다리에 만들어 두라고 한 대상 (다리와 같게 바탕 하나 + 파일은 마지막 것 하나). 다리가 새로 켜지면 비움
const MENU_PREP_REFRESH = 10 * 60 * 1000;
//   busy · next: 한 번에 하나만 만듦 — 파일 위를 지나가며 여러 번 불러도 다리 줄이 밀려 정작 우클릭이 늦지 않게 (마지막 부탁만 남김)
//   warm: 이 다리에서 미리 한 번 만들어 볼 파일 · 폴더 (처음 만드는 파일 메뉴는 탐색기 확장을 읽느라 0.5초쯤) — warmChild: 어느 다리 것인지
const menuPrep = { keys: new Set(), child: null, at: 0, busy: false, next: null, warm: [], warmChild: null };

function menuPaths(paths) {
  return (Array.isArray(paths) ? paths : []).map(p => String(p).replace(/[\r\n]/g, '')).filter(Boolean);
}

function menuKey(paths) {
  return paths.join('\n').toLowerCase();
}

function prepMenu(paths, force = false) {
  if (process.platform !== 'win32' || !mainWindow) return;
  if (menuPrep.busy) {
    menuPrep.next = { paths, force };
    return;
  }
  const child = startBridge();
  if (!child) return;
  if (menuPrep.child !== child) {                    // 새 다리 — 만들어 둔 것이 없음
    menuPrep.child = child;
    menuPrep.keys.clear();
  }
  const targets = menuPaths(paths);
  const key = menuKey(targets);
  if (!force && menuPrep.keys.has(key)) return;
  if (key) [...menuPrep.keys].filter(k => k).forEach(k => menuPrep.keys.delete(k));
  menuPrep.keys.add(key);
  if (!key) menuPrep.at = Date.now();
  menuPrep.busy = true;
  const payload = Buffer.from(targets.join('\n'), 'utf8').toString('base64');
  bridgeCall(`menuprep ${payload}`, 20000).then((reply) => {
    menuPrep.busy = false;
    if (!reply.startsWith('ok')) {
      menuPrep.keys.delete(key);
      logLine(`우클릭 메뉴 미리 만들기 못 함: ${reply.slice(0, 80)}`);
    }
    const next = menuPrep.next;
    menuPrep.next = null;
    if (next && !shellMenuOpen) prepMenu(next.paths, next.force);
    else warmUpNext();                                // 켤 때 미리 읽기는 쉬는 틈에 이어서
  });
}

// 5초마다 — 다리가 떠 있으면 바탕 메뉴가 만들어져 있게 (메뉴가 떠 있는 동안은 그대로)
//   다리가 새로 켜졌으면 바탕화면의 파일 종류(확장자)마다 하나 · 폴더 하나로 메뉴를 한 번씩 만들어 봄
//   (종류마다 처음 만드는 메뉴는 탐색기 확장을 읽느라 0.2~0.5초 — 미리 읽어 두면 첫 우클릭도 빠름)
function keepMenuReady() {
  if (!wallpaper.bridge || shellMenuOpen || menuPrep.busy) return;
  if (menuPrep.warmChild !== wallpaper.bridge) {
    menuPrep.warmChild = wallpaper.bridge;
    menuPrep.warm = warmUpTargets();
  }
  if (warmUpNext()) return;
  prepMenu([], Date.now() - menuPrep.at > MENU_PREP_REFRESH);
}

function warmUpTargets() {
  try {
    const desktop = app.getPath('desktop');
    const seen = new Set();
    const list = [];
    fs.readdirSync(desktop, { withFileTypes: true }).forEach((d) => {
      if (/^desktop\.ini$/i.test(d.name) || d.name.startsWith('~$')) return;
      const kind = d.isDirectory() ? '/' : path.extname(d.name).toLowerCase();
      if (seen.has(kind) || list.length >= 10) return;
      seen.add(kind);
      list.push(path.join(desktop, d.name));
    });
    return list;
  } catch (_) {
    return [];
  }
}

// 미리 읽기 하나 — 바탕 메뉴가 준비돼 있고, 마우스를 올려 미리 받아 둔 파일 메뉴가 없을 때만 (그걸 버리지 않게)
function warmUpNext() {
  if (!menuPrep.warm.length || menuPrep.busy || shellMenuOpen || menuPrep.child !== wallpaper.bridge) return false;
  if (!menuPrep.keys.has('') || [...menuPrep.keys].some(k => k)) return false;
  prepMenu([menuPrep.warm.shift()]);
  menuPrep.keys.clear();                              // 미리 읽기로 만든 것은 쓰려는 게 아님 (다음 파일이 버림)
  menuPrep.keys.add('');
  return true;
}

ipcMain.on('menu-prefetch', (event, paths) => prepMenu(paths));

// ---------------- 윈도우 11 모양 우클릭 메뉴 창 (menu.html · menu-preload.js) ----------------
// 화면 하나를 덮는 투명한 창에 메뉴 판만 그림 — 판 밖을 누르거나 다른 곳으로 가면 닫힘 (윈도우 메뉴처럼)
//   한 번 만들어 숨겨 두고 다시 씀 (처음 우클릭이 늦지 않게). 캔버스 창이 닫히면 같이 닫음
let menuOverlay = null;
let menuResolve = null;
let menuReady = null;

function menuOverlayWindow() {
  if (menuOverlay && !menuOverlay.isDestroyed()) return menuOverlay;
  const win = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    thickFrame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'menu-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win.setAlwaysOnTop(true, 'pop-up-menu');
  win.loadFile('menu.html');
  win.on('closed', () => {
    if (menuOverlay === win) menuOverlay = null;
    finishMenu(null);
  });
  menuOverlay = win;
  return win;
}

// 닫을 때는 먼저 투명하게 → 숨김 (숨긴 창은 마지막 장면을 들고 있다가 다음에 보일 때 잠깐 비침)
function finishMenu(id) {
  const resolve = menuResolve;
  menuResolve = null;
  if (menuOverlay && !menuOverlay.isDestroyed() && menuOverlay.isVisible()) {
    menuOverlay.setOpacity(0);
    menuOverlay.hide();
  }
  if (resolve) resolve(id);
}

ipcMain.on('menu-choice', (event, id) => {
  if (!menuOverlay || event.sender !== menuOverlay.webContents) return;
  finishMenu(id === null || id === undefined ? null : Number(id));
});
ipcMain.on('menu-ready', (event) => {
  if (menuReady && menuOverlay && event.sender === menuOverlay.webContents) menuReady();
});

// 메뉴를 띄우고 고른 줄 id 를 돌려줌 (-1 추가 옵션 표시 · null 그만둠)
async function showFluentMenu(layout) {
  const win = menuOverlayWindow();
  if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
  finishMenu(null);                                          // 떠 있던 것은 닫고
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  const b = display.bounds, w = display.workArea;
  win.setBounds(b);
  const chosen = new Promise(resolve => { menuResolve = resolve; });
  const drawn = new Promise(resolve => {                     // 새 판을 다 그린 뒤에 보여 줌 (지난번 모습이 잠깐 비치지 않게)
    menuReady = resolve;
    setTimeout(resolve, 300);
  });
  win.setOpacity(0);                                         // 투명한 채로 띄워 새 판을 그리게 하고 (숨긴 창은 그리지 않음) → 다 그리면 보이게
  win.showInactive();
  win.webContents.send('menu-open', {
    layout,
    x: point.x - b.x,
    y: point.y - b.y,
    work: { left: w.x - b.x, top: w.y - b.y, right: w.x - b.x + w.width, bottom: w.y - b.y + w.height },
    dark: nativeTheme.shouldUseDarkColors,
  });
  await drawn;
  menuReady = null;
  if (menuResolve && !win.isDestroyed()) {
    win.setOpacity(1);
    win.show();
    win.focus();
  }
  return chosen;
}

// 바탕 우클릭 '붙여넣기' · '바로 가기 붙여넣기' 에 쓸 클립보드 파일 (다리 clipfiles) — { files: [...], move }
async function clipboardFiles() {
  if (process.platform !== 'win32' || !startBridge()) return { files: [], move: false };
  const reply = await bridgeCall('clipfiles', 5000);
  if (!reply.startsWith('ok ')) return { files: [], move: false };
  try {
    return JSON.parse(Buffer.from(reply.slice(3), 'base64').toString('utf8'));
  } catch (_) {
    return { files: [], move: false };
  }
}
ipcMain.handle('clipboard-files', () => clipboardFiles());

// 캔버스 Ctrl+C (renderer/clipboard.js) — 파일은 탐색기처럼 파일로 · 쪽지 글은 글자로 윈도우 클립보드에. 반환: 클립보드 순번 (못 쓰면 null)
//   순번은 클립보드가 바뀔 때마다 오름 → Ctrl+V 때 같으면 그 사이 다른 것을 복사하지 않은 것
ipcMain.handle('canvas-clip-set', async (event, files, text) => {
  const paths = (Array.isArray(files) ? files : []).map(p => String(p).replace(/[\r\n]/g, '')).filter(Boolean);
  const body = String(text || '');
  if (process.platform !== 'win32' || !startBridge()) {
    if (body) clipboard.writeText(body);
    return null;
  }
  const payload = Buffer.from([String(paths.length), ...paths, body].join('\n'), 'utf8').toString('base64');
  const reply = await bridgeCall(`clipset ${payload}`, 5000);
  if (!reply.startsWith('ok ')) {
    logLine(`캔버스 복사를 클립보드에 못 씀: ${reply.slice(0, 80)}`);
    if (body) clipboard.writeText(body);
    return null;
  }
  return Number(reply.slice(3));
});

ipcMain.handle('clipboard-seq', async () => {
  if (process.platform !== 'win32' || !startBridge()) return null;
  const reply = await bridgeCall('clipseq', 3000);
  return reply.startsWith('ok ') ? Number(reply.slice(3)) : null;
});

// 붙여넣기: 탐색기의 '붙여넣기' 그대로 (복사 · 이름 겹침 창) / 바로 가기 붙여넣기: '이름 - 바로 가기.lnk' 를 바탕화면에
ipcMain.handle('paste-files', async (event, link) => {
  const desktop = app.getPath('desktop');
  if (!link) {
    if (!startBridge()) return false;
    const reply = await bridgeCall(`folderverb paste ${Buffer.from(desktop, 'utf8').toString('base64')}`, 5 * 60 * 1000);
    logLine(`바탕화면에 붙여넣기: ${reply}`);
    return reply.startsWith('ok');
  }
  const { files } = await clipboardFiles();
  const word = trayText().shortcut;
  let made = 0;
  files.forEach(target => {
    const base = `${path.basename(target)} - ${word}`;
    let dest = path.join(desktop, `${base}.lnk`);
    for (let n = 2; fs.existsSync(dest) && n < 100; n++) dest = path.join(desktop, `${base} (${n}).lnk`);
    try {
      if (shell.writeShortcutLink(dest, 'create', { target })) made++;
    } catch (err) {
      logLine(`바로 가기 못 만듦: ${err && err.message}`);
    }
  });
  logLine(`바로 가기 붙여넣기: ${made}개`);
  return made > 0;
});

// 정렬 기준 › 크기 · 수정한 날짜 · 항목 유형에 쓸 파일 정보
ipcMain.handle('file-stats', async (event, paths) => {
  const list = Array.isArray(paths) ? paths.slice(0, 5000) : [];
  return Promise.all(list.map(async (p) => {
    try {
      const st = await fs.promises.stat(String(p));
      return { path: p, size: st.size, mtime: st.mtimeMs, isDir: st.isDirectory() };
    } catch (_) {
      return { path: p, size: 0, mtime: 0, isDir: false };
    }
  }));
});

// 파일 이름 바꾸기 (윈도우 우클릭 메뉴 '이름 바꾸기' — 탐색기 대신 앱이 이름 칸을 띄움)
//   같은 폴더 안에서만. 반환: { ok: true, path } · { ok: false, reason: 'name' | 'exists' | 메시지 }
ipcMain.handle('rename-path', async (event, filePath, newName) => {
  const src = String(filePath || '');
  const name = String(newName || '').trim();
  if (!src || !name || /[\\/:*?"<>|]/.test(name) || name === '.' || name === '..') return { ok: false, reason: 'name' };
  const dest = path.join(path.dirname(src), name);
  if (dest === src) return { ok: true, path: src };
  if (dest.toLowerCase() !== src.toLowerCase() && fs.existsSync(dest)) return { ok: false, reason: 'exists' };
  try {
    await fs.promises.rename(src, dest);
    logLine(`이름 바꿈: ${path.basename(src)} → ${name}`);
    return { ok: true, path: dest };
  } catch (err) {
    logLine(`이름 바꾸기 실패: ${err && err.message}`);
    return { ok: false, reason: (err && err.message) || 'error' };
  }
});

// ================ 트레이 (알림 영역 아이콘) ================
// 설정 · 종료는 여기서 (캔버스 메뉴에는 없음). 바탕화면에 넣기 켜고 끄기 · 앞으로 꺼내기도
let tray = null;
const TRAY_TEXT = {
  ko: { tip: '배경화면 캔버스', front: '캔버스 앞으로 꺼내기', back: '바탕화면으로 되돌리기', wallpaper: '바탕화면에 넣기', settings: '설정…', quit: '종료', more: '추가 옵션 표시', shortcut: '바로 가기' },
  en: { tip: 'Wallpaper Canvas', front: 'Bring the canvas forward', back: 'Back to the desktop', wallpaper: 'Live on the desktop', settings: 'Settings…', quit: 'Quit', more: 'Show more options', shortcut: 'Shortcut' },
};

function trayText() {
  try {
    return TRAY_TEXT[JSON.parse(fs.readFileSync(getSettingsFile(), 'utf-8')).language === 'en' ? 'en' : 'ko'];
  } catch (_) {
    return TRAY_TEXT.ko;
  }
}

function createTray() {
  if (tray) return;
  try {
    tray = new Tray(path.join(__dirname, 'icons', process.platform === 'win32' ? 'tray.ico' : 'tray.png'));
  } catch (err) {
    logLine(`트레이 아이콘 못 만듦: ${err && err.message}`);
    return;
  }
  tray.on('click', () => tray.popUpContextMenu());
  refreshTray();
}

function refreshTray() {
  if (!tray || tray.isDestroyed()) return;
  const tx = trayText();
  const key = popOutKey ? popOutKey.replace('Control', 'Ctrl') : undefined;
  tray.setToolTip(tx.tip);
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: wallpaper.poppedOut || wallpaper.front ? tx.back : tx.front, accelerator: key, registerAccelerator: false,
      enabled: wallpaper.wanted && (sleep.asleep || wallpaper.pinned || wallpaper.embedded || wallpaper.poppedOut), click: () => togglePopOut(),
    },
    {
      label: tx.wallpaper, type: 'checkbox', checked: wallpaper.wanted, enabled: process.platform === 'win32',
      click: (item) => applySettingFromTray('wallpaperMode', item.checked),
    },
    { type: 'separator' },
    { label: tx.settings, click: () => openSettingsFromTray() },
    { type: 'separator' },
    { label: tx.quit, click: () => quitFromTray() },
  ]));
}

// 설정값은 화면(settings.js)이 저장하고 적용함 — 트레이는 부탁만
function applySettingFromTray(key, value) {
  wake('트레이', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('apply-setting', key, value);
  });
}

// 설정 창은 캔버스 안에 뜨므로 캔버스를 앞으로 꺼내고 엶 (설정 창을 닫으면 다시 바탕화면 층으로 — settings-window.js)
function openSettingsFromTray() {
  if (sleep.asleep) {
    wake('트레이 › 설정', () => openSettingsFromTray());
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (wallpaper.wanted) holdFront('settings', true);
  else showOnTop();
  mainWindow.webContents.send('open-settings');
}

// 종료 — 창 닫기를 거쳐야 '저장할까요?'를 물어봄
function quitFromTray() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
  else app.quit();
}

// 설정 창에서 켜고 끔 — 끄면 예전처럼 맨 위 창
ipcMain.handle('set-wallpaper-mode', async (event, on) => {
  on = !!on && process.platform === 'win32';
  if (on === wallpaper.wanted) return wallpaper.pinned || wallpaper.embedded;
  wallpaper.wanted = on;
  while (wallpaper.moving) await new Promise(r => setTimeout(r, 50));    // 넣고 빼는 중이면 끝난 뒤에
  if (wallpaper.wanted !== on) return wallpaper.pinned || wallpaper.embedded;   // 그사이 또 바뀜
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (on) {
    if (wallpaper.holds.has('settings')) {            // 설정 창을 보는 중 — 닫을 때 넣음 (holdFront)
      wallpaper.deferred = true;
      logLine('바탕화면에 넣기: 설정 창을 닫으면 넣음');
      return false;
    }
    return enterWallpaper();
  }
  wallpaper.deferred = false;
  unpinWindow();
  if (wallpaper.embedded || wallpaper.poppedOut) await unembedWindow(screenArea());
  wallpaper.poppedOut = false;
  wallpaper.lifted = null;
  wallpaper.autoPopped = false;
  showOnTop();
  refreshTray();
  return false;
});

// 바탕화면 층으로 — 방법 1 (붙잡기) → 방법 2 (넣기) → 조금 뒤 다시 해 봄
async function enterWallpaper() {
  if (pinWindow()) return true;
  if (await embedWindow()) return true;
  retryEmbed();
  return false;
}

// 옮기는 중이면 끝난 뒤에 넣음 (그사이 꺼졌거나 이미 들어갔으면 그만)
async function enterWallpaperWhenFree() {
  while (wallpaper.moving) await new Promise(r => setTimeout(r, 50));
  if (!wallpaper.wanted || wallpaper.deferred || wallpaper.pinned || wallpaper.embedded || wallpaper.poppedOut) return;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  await enterWallpaper();
}

// 테마가 바뀌면 창 바탕색도 (settings.js)
ipcMain.on('set-background', (event, color) => {
  if (mainWindow && !mainWindow.isDestroyed() && /^#[0-9a-f]{6}$/i.test(String(color))) mainWindow.setBackgroundColor(color);
  if (/^#[0-9a-f]{6}$/i.test(String(color))) {                  // 바탕화면 층 사진 창의 바탕색도 (다음 사진과 함께)
    mirror.color = color;
    scheduleMirror();
  }
});

ipcMain.handle('get-wallpaper-state', () => ({ wanted: wallpaper.wanted, embedded: wallpaper.pinned || wallpaper.embedded, key: popOutKey }));

// ---------------- 바탕화면 배경 색 맞추기 (설정 › 일반) ----------------
// 윈도우 배경 화면을 캔버스 바탕색 단색으로 — Win+Tab(작업 보기) · 창 맞춰 붙이기에서 보이는 배경이 캔버스와 같은 색
//   켤 때 원래 배경 화면(그림 · 맞춤 방식 · 배경색)을 앱 데이터 폴더에 적어 두고 (wallpaper-original.json),
//   끄거나 앱을 끌 때 그것으로 되돌림. 앱이 갑자기 꺼져 적어 둔 것이 남아 있으면 다음에 켤 때 그대로 원래 것으로 씀
//   윈도우가 쓰는 캐시 그림(TranscodedWallpaper)이었으면 앱 데이터 폴더에 복사해 둠 (윈도우가 바꿔 쓸 수 있어서)
//   '슬라이드 쇼' · 'Windows 추천' 배경이었으면 되돌릴 때 그때 보이던 그림 한 장으로 돌아감
//   applied: 지금 단색으로 바꿔 둔 색 (없으면 null). 명령은 차례로 (chain)
const desktopBg = { applied: null, chain: Promise.resolve(), restoringOnQuit: false };

function wallpaperBackupFile() {
  return path.join(app.getPath('userData'), 'wallpaper-original.json');
}

async function saveOriginalWallpaper() {
  const file = wallpaperBackupFile();
  if (fs.existsSync(file)) return true;                          // 먼저 적어 둔 것이 진짜 원래 것
  const reply = await bridgeCall('wallget', 5000);
  if (!reply.startsWith('ok ')) return false;
  const [image = '', style = '', tile = '', color = ''] = Buffer.from(reply.slice(3), 'base64').toString('utf8').split('\n');
  let keep = image;
  if (image && /TranscodedWallpaper/i.test(image) && fs.existsSync(image)) {
    keep = path.join(app.getPath('userData'), 'wallpaper-original.jpg');
    try { fs.copyFileSync(image, keep); } catch (_) { keep = image; }
  }
  fs.writeFileSync(file, JSON.stringify({ image: keep, style, tile, color }, null, 2));
  logLine(`원래 배경 화면을 적어 둠: ${path.basename(image) || '(그림 없음)'} · 배경색 ${color}`);
  return true;
}

// on: 켜기 · 끄기, color: 캔버스 바탕색 (#RRGGBB)
function setDesktopBackground(on, color = null) {
  desktopBg.chain = desktopBg.chain.then(async () => {
    if (process.platform !== 'win32' || !startBridge()) return;
    if (on && /^#[0-9a-f]{6}$/i.test(String(color))) {
      if (desktopBg.applied === color.toUpperCase()) return;
      if (!(await saveOriginalWallpaper())) {
        logLine('원래 배경 화면을 못 읽어서 배경 색을 바꾸지 않음');
        return;
      }
      const reply = await bridgeCall(`wallcolor ${color}`, 8000);
      logLine(`배경 화면을 캔버스 색으로: ${color} → ${reply}`);
      if (reply.startsWith('ok')) desktopBg.applied = color.toUpperCase();
      return;
    }
    if (!on) {
      const file = wallpaperBackupFile();
      if (!fs.existsSync(file)) { desktopBg.applied = null; return; }
      let saved = null;
      try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) {}
      if (!saved) return;
      const payload = Buffer.from([saved.image || '', saved.style || '', saved.tile || '', saved.color || ''].join('\n'), 'utf8').toString('base64');
      const reply = await bridgeCall(`wallrestore ${payload}`, 8000);
      logLine(`배경 화면을 원래대로: ${reply}`);
      if (reply.startsWith('ok')) {
        desktopBg.applied = null;
        try { fs.unlinkSync(file); } catch (_) {}
      }
    }
  }).catch((err) => logLine(`배경 화면 바꾸기 오류: ${err && err.message}`));
  return desktopBg.chain;
}

ipcMain.on('set-desktop-background', (event, on, color) => { setDesktopBackground(!!on, color); });

// ---------------- 시작 앱 (윈도우에 로그인하면 켜기) ----------------
// 설정 › 일반 › 시작 앱. 윈도우의 시작 앱 목록(작업 관리자 › 시작 앱 · 윈도우 설정 › 앱 › 시작 프로그램)에 올림
//   켜져 있는지는 윈도우에 등록된 것을 그대로 읽음 (settings.json 에 두지 않음) — 윈도우 쪽에서 끄면 여기도 꺼져 보임
//   설치판은 DeskCanvas.exe, 개발판(npm start)은 electron.exe <코드 폴더> — 등록 이름을 달리 해 서로 덮지 않음
function loginItemOptions() {
  return app.isPackaged
    ? { path: process.execPath, args: [], name: 'DeskCanvas' }
    : { path: process.execPath, args: [app.getAppPath()], name: 'DeskCanvas (dev)' };
}

//   윈도우: openAtLogin 은 앱 id(AppUserModelID) 이름으로 등록된 것만 봐서, 이름을 따로 준 우리 등록은 늘 false 로 나옴
//     → 윈도우 시작 목록(launchItems)에서 우리 이름 · 켜짐(작업 관리자에서 끄지 않음)으로 찾음
function startupState() {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return { available: false, on: false };
  const o = loginItemOptions();
  const s = app.getLoginItemSettings({ path: o.path, args: o.args });
  if (Array.isArray(s.launchItems)) return { available: true, on: s.launchItems.some(i => i.name === o.name && i.enabled) };
  return { available: true, on: !!s.openAtLogin && s.executableWillLaunchAtLogin !== false };
}

ipcMain.handle('get-startup', () => startupState());
ipcMain.handle('set-startup', (event, on) => {
  const o = loginItemOptions();
  try {
    app.setLoginItemSettings({ openAtLogin: !!on, enabled: !!on, path: o.path, args: o.args, name: o.name });
    logLine(`시작 앱: ${on ? '켬' : '끔'} (${o.name})`);
  } catch (err) {
    logLine(`시작 앱 못 바꿈: ${err && err.message}`);
  }
  return startupState();
});

function createWindow() {
  let stamp = '?';
  try { stamp = new Date(fs.statSync(__filename).mtime).toLocaleString('ko-KR'); } catch (_) {}
  logLine(`──── 앱 시작 (main.js 저장 시각 ${stamp}) ────`);

  mainWindow = new BrowserWindow({
    ...screenArea(),              // 주 모니터의 작업 영역 (작업표시줄 뺀 부분) — 해상도 · 배율에 맞춤
    backgroundColor: canvasBackground(),   // 불투명한 창 — 바탕화면 층에서 들고 날 때 한 장면이 비어도 뒤가 비치지 않게
    icon: path.join(__dirname, 'icons', process.platform === 'win32' ? 'app.ico' : 'app.png'),   // 앱 아이콘 (설치판 exe 는 package.json build.win.icon)
    frame: false,
    thickFrame: false,           // 창 틀 · 그림자 · 여닫는 움직임 없음 (불투명 창에 틀이 붙으면 페이지가 안쪽으로 줄어듦)
    hasShadow: false,
    skipTaskbar: true,           // 작업표시줄에 표시 안 함
    minimizable: false,          // '바탕화면 보기'(Win+D) 등에 최소화되지 않게 (바탕화면처럼 남음)
    maximizable: false,
    resizable: false,            // 화면 끝을 끌어도 창 크기가 바뀌지 않게 (크기는 앱이 화면에 맞춤 — fitWindowToScreen)
    alwaysOnTop: !wallpaper.wanted,   // 앞에 있는 동안 맨 위 (바탕화면 층에 넣을 거면 처음부터 풀어 둠)
    focusable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      autoplayPolicy: 'no-user-gesture-required',   // 소리를 켜 둔 영상도 켤 때 바로 재생 (renderer/photos.js)
      webviewTag: true,            // 웹 페이지 쪽지 (renderer/web-note.js) — 붙기 전에 설정을 조임 (setupWebNotes)
      spellcheck: false,           // 맞춤법 검사 안 함 (글 칸마다 이미 끔 — 검사 사전도 불러오지 않게)
    }
  });

  mainWindow.loadFile('index.html');

  // 캔버스 화면은 다른 주소로 넘어가지 않음 — 쪽지 속 링크 · 영상 재생기의 '유튜브에서 보기' 등은 기본 브라우저로
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });

  // 윈도우 준비 완료 후 표시 — 바탕화면에 넣기가 켜져 있으면 바탕화면 층에 넣은 채로 (앞으로 나오지 않게)
  mainWindow.once('ready-to-show', async () => {
    if (process.platform === 'win32') setTimeout(() => { if (mainWindow) menuOverlayWindow(); }, 2000);   // 우클릭 메뉴 창을 미리 (처음 우클릭이 늦지 않게)
    const plain = process.platform === 'win32' ? bridgeCall(`plain ${windowHandle()}`, 3000) : null;   // 윈도우 11 둥근 모서리 · 테두리 · 여닫는 움직임 없앰
    if (wallpaper.wanted) {
      await plain;                                    // 처음 나타날 때부터 움직임 없이
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (pinWindow()) {                              // 방법 1: 바탕화면 바로 위에 붙잡고 보여 줌 (앞으로 나오지 않게)
        mainWindow.showInactive();
        return;
      }
      const ok = await embedWindow();
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (ok) {
        mainWindow.showInactive();
        return;
      }
      retryEmbed();
    }
    showOnTop();
  });

  // 개발 모드에서 DevTools 열기
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // 다른 창이 활성화되면 이 창을 뒤로 보내기 (종료 X) — 앞에 꺼내 둔 캔버스는 다시 바탕화면 층으로
  mainWindow.on('blur', () => {
    if (wallpaper.pinned) {                           // 앞에 꺼내 둔 것만 다시 바탕화면 바로 위로 (창 고르기 · 메뉴가 떠 있는 동안은 그대로)
      if (wallpaper.front && !wallpaper.dialogOpen) setPinnedFront(false);
      return;
    }
    if (wallpaper.embedded || wallpaper.moving) return;
    if (wallpaper.poppedOut) {
      if (!wallpaper.dialogOpen) embedWindow();
      return;
    }
    mainWindow.setAlwaysOnTop(false);
  });

  // 이 창이 다시 포커스를 받으면 앞으로 가기 (바탕화면에 넣기를 켰으면 그대로 — 들어 올린 자리를 지킴)
  mainWindow.on('focus', () => {
    if (wallpaper.wanted || wallpaper.embedded || wallpaper.moving) return;
    mainWindow.setAlwaysOnTop(true);
  });

  // "바탕화면 표시"(Win+D) 등으로 최소화되면 숨지 않고 뒤로만 보냄 (바탕화면 층은 최소화되지 않음)
  mainWindow.on('minimize', () => {
    if (wallpaper.pinned) {                           // 붙잡은 창: 맨 앞 창은 그대로 두고 다시 보이게만
      mainWindow.showInactive();
      if (wallpaper.front) setPinnedFront(false);
      return;
    }
    if (wallpaper.embedded || wallpaper.moving) return;
    // 최소화 이벤트 무시 - 대신 뒤로 보냄 (앞에 꺼내 둔 캔버스는 바탕화면 층으로)
    mainWindow.restore();
    if (wallpaper.poppedOut) {
      embedWindow();
      return;
    }
    mainWindow.setAlwaysOnTop(false);
  });

  // 자동 저장이 꺼져 있고 저장 안 한 변경이 있으면 닫기 전에 물어봄
  mainWindow.on('close', (event) => {
    if (allowClose || !unsaved.dirty) {
      quitting = true;                             // 사용자가 닫음 (탐색기가 다시 시작돼 사라진 것과 구분)
      return;
    }
    event.preventDefault();
    const labels = unsaved.labels || { message: '저장하지 않은 변경 사항이 있어요. 저장할까요?', save: '저장', discard: '저장 안 함', cancel: '취소' };
    const restore = dropAlwaysOnTop();
    let choice;
    try {
      choice = dialog.showMessageBoxSync({
        type: 'question',
        message: labels.message,
        buttons: [labels.save, labels.discard, labels.cancel],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      });
    } finally {
      restore();
    }
    if (choice === 0) {
      mainWindow.webContents.send('save-and-quit');        // 화면이 저장한 뒤 quit-now 를 보냄
    } else if (choice === 1) {
      allowClose = true;
      mainWindow.close();
    }
  });

  // 바탕화면 폴더 변화 감시
  watchDesktop();

  screen.on('display-metrics-changed', fitWindowToScreen);
  screen.on('display-added', fitWindowToScreen);
  screen.on('display-removed', fitWindowToScreen);

  mainWindow.on('closed', () => {
    screen.removeListener('display-metrics-changed', fitWindowToScreen);
    screen.removeListener('display-added', fitWindowToScreen);
    screen.removeListener('display-removed', fitWindowToScreen);
    desktopWatchers.forEach(w => { try { w.close(); } catch (_) {} });
    desktopWatchers = [];
    mainWindow = null;
    if (!sleep.asleep) destroyMirror();            // 바탕화면 층 사진도 (남아 있으면 앱이 끝나지 않음) — 절전이면 그 사진을 보여 줌
    if (menuOverlay && !menuOverlay.isDestroyed()) menuOverlay.destroy();   // 우클릭 메뉴 창도
    wallpaper.pinned = false;                      // 모듈은 창이 사라질 때 스스로 풂
    wallpaper.front = false;
    wallpaper.embedded = false;
    wallpaper.poppedOut = false;
    wallpaper.lifted = null;
    // 바탕화면(탐색기)이 다시 시작되면 바탕화면 층과 함께 창도 사라짐 → 잠시 뒤 다시 만들어 넣음
    clearTimeout(sleep.timer);
    if (wallpaper.wanted && !quitting && !sleep.asleep) {
      logLine('바탕화면이 다시 시작돼 창이 사라짐 → 다시 만듦');
      setTimeout(() => { if (!mainWindow && !quitting) createWindow(); }, 2000);
    }
  });
}

// IPC Handlers
ipcMain.handle('get-canvas-state', async () => {
  const state = readState();
  // 예전에 저장된 파일 항목에 '윈도우 기본 그림'이 남아 있으면 지움 → 화면이 기본 그림(code/icons/file-*.svg)을 씀
  if (state && Array.isArray(state.files)) {
    const generic = await genericIcons();
    let cleared = 0;
    state.files.forEach(file => {
      if (file && generic.has(file.icon)) { file.icon = null; cleared++; }
    });
    if (cleared) logLine(`윈도우 기본 그림 ${cleared}개 → 기본 그림으로`);
  }
  return state;
});

ipcMain.handle('save-canvas-state', async (event, state) => {
  scheduleMirror();                                 // 바탕화면 층 사진도 새로 (저장은 바뀐 뒤 · 화면을 옮긴 뒤 옴)
  return writeState(state);
});

// 이미지 추가: 사진을 골라 앱 데이터 폴더(images)에 복사 → 이미지 메모에 표시할 주소 반환
// (원본을 옮기거나 지워도 메모의 사진은 남음)
// 파일 고르기·저장 확인 같은 윈도우 기본 창은 '항상 맨 위'인 캔버스 창 뒤로 숨어 버린다.
// 그 창이 떠 있는 동안만 맨 위를 풀었다가 되돌린다. (풀지 않으면 눌러도 아무 일 없는 것처럼 보임)
function dropAlwaysOnTop() {
  wallpaper.dialogOpen = true;
  const alive = mainWindow && !mainWindow.isDestroyed();
  const onTop = alive && mainWindow.isAlwaysOnTop();
  if (onTop) {
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setSkipTaskbar(false);        // 뒤로 가더라도 작업표시줄에서 찾아올 수 있게
  }
  logLine(`창 맨 위 고정 ${onTop ? '품' : '원래 꺼져 있었음'}`);
  return () => {
    wallpaper.dialogOpen = false;
    if (onTop && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(true);
      mainWindow.setSkipTaskbar(true);
      mainWindow.focus();
    } else if (wallpaper.pinned && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();                          // 붙잡은 창: 키보드만 캔버스로 (자리는 바탕화면 바로 위 그대로)
    }
    logLine('창 맨 위 고정 되돌림');
  };
}

// 윈도우 기본 '열기' 창 — 부모 창을 달면 그 창(투명 · 항상 맨 위) 뒤에 깔리는 일이 있어 따로 띄운다
async function openFileDialog(options) {
  const restore = dropAlwaysOnTop();
  try {
    logLine(`파일 고르기 창 띄움: ${options.title}`);
    const result = await dialog.showOpenDialog(options);
    logLine(`파일 고르기 결과: ${result.canceled ? '취소' : (result.filePaths[0] || '없음')}`);
    return result;
  } catch (err) {
    logLine(`파일 고르기 실패: ${err && err.message}`);
    throw err;
  } finally {
    restore();
  }
}

ipcMain.handle('pick-image', async (event, title) => {
  const result = await openFileDialog({
    title: title || '이미지 추가',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }],
  });
  if (result.canceled || !result.filePaths.length) return null;
  try {
    const url = copyImageToStore(result.filePaths[0]);
    logLine(`사진 복사 완료: ${url}`);
    return url;
  } catch (err) {
    logLine(`사진 복사 실패: ${err && err.message}`);
    throw err;
  }
});

// 영상 추가: 영상을 골라 앱 데이터 폴더(videos)에 복사 → 영상 주소 반환 (사진과 같이 원본을 옮기거나 지워도 남음)
//   500MB 가 넘는 영상은 복사하지 않고 원본 자리를 가리킴 (복사가 오래 걸리고 자리를 많이 차지해서)
ipcMain.handle('pick-video', async (event, title) => {
  const result = await openFileDialog({
    title: title || '영상 추가',
    properties: ['openFile'],
    filters: [{ name: 'Videos', extensions: VIDEO_EXTENSIONS }],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const src = result.filePaths[0];
  try {
    const size = fs.statSync(src).size;
    if (size > VIDEO_COPY_LIMIT) {
      logLine(`영상이 커서 원본 자리를 씀 (${Math.round(size / 1048576)}MB): ${src}`);
      return pathToFileURL(src).href;
    }
    const dest = path.join(getVideosDir(), `${Date.now()}${path.extname(src).toLowerCase()}`);
    await fs.promises.copyFile(src, dest);
    logLine(`영상 복사 완료: ${dest}`);
    return pathToFileURL(dest).href;
  } catch (err) {
    logLine(`영상 복사 실패: ${err && err.message}`);
    throw err;
  }
});

// 붙여넣기: 클립보드의 사진(캡처 등) 데이터를 images 폴더에 저장
ipcMain.handle('save-image-data', (event, bytes, mime) => {
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp' }[mime] || 'png';
  const dest = path.join(getImagesDir(), `${Date.now()}.${ext}`);
  fs.writeFileSync(dest, Buffer.from(bytes));
  return pathToFileURL(dest).href;
});

// 붙여넣기: 탐색기에서 복사한 사진 파일을 images 폴더로
ipcMain.handle('import-image', (event, filePath) => {
  const src = String(filePath || '');
  const ext = path.extname(src).slice(1).toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(ext) || !fs.existsSync(src)) return null;
  return copyImageToStore(src);
});

// 파일 우클릭 › 이미지 · 영상 쪽지로 바꾸기 (renderer/file-media.js) — 앱 데이터 폴더로 복사한 주소
//   원본은 renderer 가 휴지통으로 보내므로 큰 영상도 원본 자리를 가리키지 않고 늘 복사. 한꺼번에 여럿이라 이름이 겹치지 않게
ipcMain.handle('import-media', async (event, filePath) => {
  const src = String(filePath || '');
  const ext = path.extname(src).slice(1).toLowerCase();
  const media = IMAGE_EXTENSIONS.includes(ext) ? 'image' : VIDEO_EXTENSIONS.includes(ext) ? 'video' : null;
  if (!media || !fs.existsSync(src)) return null;
  const dir = media === 'image' ? getImagesDir() : getVideosDir();
  const dest = path.join(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`);
  try {
    await fs.promises.copyFile(src, dest);
    logLine(`쪽지로 바꾸려고 복사: ${path.basename(src)} → ${dest}`);
    return { url: pathToFileURL(dest).href, media };
  } catch (err) {
    logLine(`쪽지로 바꾸기 복사 실패: ${err && err.message}`);
    return null;
  }
});

// 코드 칸 복사 버튼
ipcMain.handle('copy-text', async (event, text) => {
  await clipboard.writeText(String(text ?? ''));
  return true;
});

// ================ 설정 ================
ipcMain.handle('get-settings', () => {
  try {
    return JSON.parse(fs.readFileSync(getSettingsFile(), 'utf-8'));
  } catch (_) {
    return null;
  }
});

ipcMain.handle('save-settings', (event, settings) => {
  const ok = writeJsonAtomic(getSettingsFile(), settings);
  refreshTray();                                    // 언어 · 바탕화면에 넣기가 바뀌었을 수 있음
  return ok;
});

// ================ 빨간 날 (공휴일) ================
// 구글 캘린더의 나라별 공휴일 달력(공개 ics)을 받아 날짜 → 이름 표로 만들어 둠
//   저장: 앱 데이터 폴더의 holidays/<언어>.<나라>.json — 하루 안에 받은 게 있으면 그걸 씀
//   인터넷이 없거나 못 받으면 마지막으로 받은 자료 (없으면 null → 화면은 주말만 표시)
//   '기념일'(어버이날 · 스승의날 등 쉬지 않는 날)은 빼고 '공휴일'만
const HOLIDAY_REGIONS = ['south_korea', 'usa', 'japanese', 'china', 'uk'];
const HOLIDAY_MAX_AGE = 24 * 60 * 60 * 1000;

function holidayFile(lang, region) {
  const dir = path.join(app.getPath('userData'), 'holidays');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${lang}.${region}.json`);
}

function icsText(value) {
  return String(value || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();
}

// ics 글에서 공휴일만 골라 { 'YYYY-MM-DD': 이름 } 으로 (하루 넘게 이어지는 날도 풀어서)
function parseHolidayIcs(text) {
  const lines = String(text).replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const days = {};
  let event = null;
  const add = (key, name) => {
    if (!days[key]) days[key] = name;
    else if (!days[key].split(' · ').includes(name)) days[key] += ` · ${name}`;
  };
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { event = {}; continue; }
    if (line === 'END:VEVENT') {
      const desc = (event.description || '').split('\n')[0].trim();
      const isPublic = !desc || /^(공휴일|public holiday)/i.test(desc);
      const start = /^(\d{4})(\d{2})(\d{2})/.exec(event.start || '');
      if (isPublic && start && event.summary) {
        const from = new Date(Number(start[1]), Number(start[2]) - 1, Number(start[3]));
        const end = /^(\d{4})(\d{2})(\d{2})/.exec(event.end || '');
        const until = end ? new Date(Number(end[1]), Number(end[2]) - 1, Number(end[3])) : null;
        const count = until ? Math.max(1, Math.round((until - from) / 86400000)) : 1;
        for (let i = 0; i < Math.min(count, 14); i++) {
          const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          add(key, event.summary);
        }
      }
      event = null;
      continue;
    }
    if (!event) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const name = line.slice(0, colon).split(';')[0].toUpperCase();
    const value = line.slice(colon + 1);
    if (name === 'DTSTART') event.start = value;
    else if (name === 'DTEND') event.end = value;
    else if (name === 'SUMMARY') event.summary = icsText(value);
    else if (name === 'DESCRIPTION') event.description = icsText(value);
  }
  return days;
}

ipcMain.handle('get-holidays', async (event, region, lang) => {
  region = HOLIDAY_REGIONS.includes(region) ? region : 'south_korea';
  lang = lang === 'en' ? 'en' : 'ko';
  let file = null;
  let cached = null;
  try {
    file = holidayFile(lang, region);
    cached = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (_) { /* 아직 받은 적 없음 */ }
  if (cached && Date.now() - cached.fetchedAt < HOLIDAY_MAX_AGE) return cached;

  const url = `https://calendar.google.com/calendar/ical/${lang}.${region}%23holiday%40group.v.calendar.google.com/public/basic.ics`;
  try {
    const res = await Promise.race([
      net.fetch(url),
      new Promise((_, reject) => setTimeout(() => reject(new Error('시간 초과')), 15000)),
    ]);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const days = parseHolidayIcs(await res.text());
    if (!Object.keys(days).length) throw new Error('공휴일이 없음');
    const data = { fetchedAt: Date.now(), region, lang, days };
    if (file) writeJsonAtomic(file, data);
    logLine(`공휴일 받아옴: ${lang}.${region} ${Object.keys(days).length}일`);
    return data;
  } catch (err) {
    logLine(`공휴일 못 받아옴 (${lang}.${region}): ${err && err.message} — ${cached ? '지난 자료를 씀' : '주말만 표시'}`);
    return cached;
  }
});

// '시작 시 마지막 작업 공간 열기'가 꺼져 있을 때: 지난 저장 파일을 보관 폴더로 옮김 (최근 10개만 남김)
ipcMain.handle('archive-state', () => {
  const file = getStateFile();
  if (!fs.existsSync(file)) return false;
  const dir = path.join(app.getPath('userData'), 'archive');
  fs.mkdirSync(dir, { recursive: true });
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  fs.renameSync(file, path.join(dir, `canvas-state_${stamp}.json`));
  const kept = fs.readdirSync(dir).filter(n => /^canvas-state_.*\.json$/.test(n)).sort().reverse();
  kept.slice(10).forEach(n => { try { fs.unlinkSync(path.join(dir, n)); } catch (_) {} });
  return true;
});

// 저장 안 한 변경 (자동 저장이 꺼져 있을 때) — 창을 닫을 때 물어볼지 정함
let allowClose = false;
const unsaved = { dirty: false, labels: null };
ipcMain.on('debug-log', (event, text) => logLine(`[화면] ${text}`));
ipcMain.on('set-dirty', (event, dirty, labels) => {
  unsaved.dirty = !!dirty;
  if (labels) unsaved.labels = labels;
  if (dirty) scheduleMirror();                      // 자동 저장을 꺼 두어도 바탕화면 층 사진은 새로
});
// 종료 메뉴: 창 닫기를 main 에서 해야 '저장할까요?'를 거침 (화면에서 window.close() 하면 바로 닫힘)
ipcMain.on('request-quit', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});
ipcMain.on('quit-now', () => {
  allowClose = true;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});

// 내용이 보이는 게 나은 종류 (사진 · 문서 · 영상) — 이것만 탐색기 썸네일을 먼저 쓴다.
// 그 밖은 아이콘을 먼저 쓴다 (실행 파일 · 바로가기는 미리보기가 없고, 폴더는 아이콘이 없을 때 미리보기로 폴더 그림을 받음).
const THUMB_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'heic', 'ico', 'svg', 'psd', 'ai',
  'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'hwp', 'hwpx',
  'mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv',
]);

const iconStats = { icon: 0, thumb: 0, link: 0, none: 0 };

// 그림이 너무 크면 128 까지 줄여서 저장 (바로가기 .ico 는 256 짜리도 있음)
function toDataUrl(img) {
  if (!img || img.isEmpty()) return null;
  const size = img.getSize();
  const big = Math.max(size.width, size.height);
  const out = big > 128 ? img.resize({ width: 128, height: 128, quality: 'better' }) : img;
  return out.toDataURL();
}

// 바로가기(.lnk)·인터넷 바로가기(.url) — 윈도우가 주는 건 '빈 종이 + 화살표' 같은 일반 그림이라
// 바로가기를 풀어서 '가리키는 프로그램'의 아이콘을 가져온다
function iconFileFromUrlShortcut(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    const file = /^IconFile\s*=\s*(.+)$/mi.exec(text);
    const index = /^IconIndex\s*=\s*(-?\d+)/mi.exec(text);
    return file ? { path: file[1].trim(), index: index ? Number(index[1]) : 0 } : null;
  } catch (_) { return null; }
}

// 그림 파일(.ico · .png · .jpg)은 그대로, 그 밖은 파일 아이콘 (실행 파일은 파일 속 아이콘 — shellIcon)
async function iconFromPath(raw, index = 0) {
  if (!raw) return null;
  const target = String(raw).replace(/^"|"$/g, '').trim();
  if (!target || !fs.existsSync(target)) return null;
  if (/\.(ico|png|jpg|jpeg)$/i.test(target)) {       // 아이콘 파일이면 그림을 그대로
    try {
      const url = toDataUrl(nativeImage.createFromPath(target));
      if (url) return url;
    } catch (_) {}
  }
  return shellIcon(target, index);
}

async function shortcutIcon(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  let icon = null;
  let target = null;
  if (ext === '.lnk') {
    try {
      const link = shell.readShortcutLink(filePath);      // 윈도우 전용
      if (link && link.icon) icon = { path: link.icon, index: link.iconIndex || 0 };
      target = (link && link.target) || null;
    } catch (err) {
      logLine(`바로가기 못 읽음: ${path.basename(filePath)} — ${err && err.message}`);
    }
  } else if (ext === '.url') {
    icon = iconFileFromUrlShortcut(filePath);
  }
  if (icon) {
    const url = await ownPicture(await iconFromPath(icon.path, icon.index));
    if (url) return url;
  }
  if (target) {
    let isDir = false;
    try { isDir = fs.statSync(target).isDirectory(); } catch (_) {}
    const url = await ownPicture(isDir ? await shellThumbnail(target) : await iconFromPath(target));   // 폴더는 탐색기 폴더 그림
    if (url) return url;
  }
  if (ext === '.lnk' && !target) {                                // 경로 없는 바로가기: 스토어 앱 · 셸 폴더(내 PC 등)
    return (await ownPicture(await storeAppIcon(filePath))) || ownPicture(await shellFolderIcon(filePath));
  }
  return null;
}

// 바로가기 파일 안의 UTF-16 글자에서 찾기 (글자가 홀수 자리에서 시작하기도 해서 두 번 봄)
function findInShortcut(filePath, pattern) {
  let raw;
  try { raw = fs.readFileSync(filePath); } catch (_) { return null; }
  if (raw.length > 256 * 1024) return null;
  for (const shift of [0, 1]) {
    const m = pattern.exec(raw.subarray(shift).toString('utf16le'));
    if (m) return m;
  }
  return null;
}

// 스토어 앱 바로가기(예: 삼성 노트) — 파일 경로 대신 앱 ID(패키지 가족 이름!앱 이름)가 들어 있어서
// 그 ID로 윈도우에 그림을 물어봄 (shell:AppsFolder\앱 ID → 128 크기 앱 그림)
async function storeAppIcon(filePath) {
  const m = findInShortcut(filePath, /([\w.-]+_[a-z0-9]{13})!([\w.-]+)/i);
  return m ? shellThumbnail(`shell:AppsFolder\\${m[1]}!${m[2]}`) : null;
}

// 셸 폴더 바로가기(내 PC · 휴지통 · 네트워크 등) — 바로가기 안의 ::{CLSID} 로 레지스트리에 적힌 기본 아이콘
// (예: %SystemRoot%\System32\imageres.dll,-109)을 찾아 그 파일 속 아이콘을 꺼냄
async function shellFolderIcon(filePath) {
  const m = findInShortcut(filePath, /::(\{[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\})/i);
  if (!m) return null;
  const value = await registryDefault(`HKCR\\CLSID\\${m[1]}\\DefaultIcon`);
  const icon = value && /^"?([^",]+)"?(?:,\s*(-?\d+))?/.exec(value.replace(/%(\w+)%/g, (_, v) => process.env[v] || ''));
  return icon ? iconFromPath(icon[1], Number(icon[2] || 0)) : null;
}

// 레지스트리 키의 기본값 (윈도우 reg 명령 — 없거나 실패하면 null)
function registryDefault(key) {
  if (process.platform !== 'win32') return Promise.resolve(null);
  return new Promise(resolve => {
    execFile('reg', ['query', key, '/ve'], { windowsHide: true, timeout: 3000 }, (err, stdout) => {
      const m = !err && /REG_(?:EXPAND_)?SZ\s+(.+)/.exec(String(stdout));
      resolve(m ? m[1].trim() : null);
    });
  });
}

async function shellThumbnail(filePath) {
  try {
    const thumb = await nativeImage.createThumbnailFromPath(filePath, { width: 128, height: 128 });
    if (thumb && !thumb.isEmpty()) return thumb.toDataURL();
  } catch (_) { /* 미리보기가 없는 종류 */ }
  return null;
}

// 파일 아이콘 — 실행 파일(.exe · .dll)은 파일 속 아이콘을 먼저 (크고 선명하고, PNG 로만 된 아이콘도 읽힘)
//   index: 바로가기가 고른 아이콘 번호 (0 이상 = 몇 번째, 음수 = 그 번호의 아이콘)
async function shellIcon(filePath, index = 0) {
  if (/\.(exe|dll)$/i.test(filePath)) {
    const own = exeIconImage(filePath, index) || exeIconImage(systemResourceFile(filePath), index);
    if (own) return toDataUrl(own);
    if (index !== 0) return null;                          // 윈도우 아이콘 함수는 번호를 고를 수 없음
  }
  for (const size of ['large', 'normal']) {
    try {
      const url = toDataUrl(await app.getFileIcon(filePath, { size }));
      if (url) return url;
    } catch (err) {
      logLine(`아이콘(${size}) 실패: ${path.basename(filePath)} — ${err && err.message}`);
    }
  }
  return null;
}

// ── 실행 파일(.exe · .dll) 속 아이콘을 직접 꺼냄 ──
// 윈도우 아이콘 함수(app.getFileIcon)는 PNG 로만 된 아이콘 — 256 PNG 한 장뿐인 Electron 앱(위메모 · Lunar Client ·
// TETR.IO), 모든 크기가 PNG 인 로블록스 — 을 읽지 못하고 '기본 실행 파일 그림'을 줌.
// 그래서 파일의 아이콘 묶음(RT_GROUP_ICON)에서 가장 큰 그림을 골라 씀: PNG 는 그대로, 32비트 BMP 는 픽셀을 옮겨 담음.
// 못 읽으면 null (윈도우 아이콘 함수로 넘어감)
const RT_ICON = 3;
const RT_GROUP_ICON = 14;

// 윈도우 10(1903) 뒤로 시스템 DLL(imageres.dll 등)의 아이콘은 %SystemRoot%\SystemResources\<이름>.mun 에 있음
function systemResourceFile(filePath) {
  const mun = path.join(process.env.SystemRoot || 'C:\\Windows', 'SystemResources', `${path.basename(filePath)}.mun`);
  return fs.existsSync(mun) ? mun : null;
}

function readBytes(fd, pos, len) {
  const buf = Buffer.alloc(len);
  if (fs.readSync(fd, buf, 0, len, pos) !== len) throw new Error('short read');
  return buf;
}

function exeIconImage(file, index = 0) {
  if (!file) return null;
  let fd = null;
  try {
    fd = fs.openSync(file, 'r');
    const dos = readBytes(fd, 0, 64);
    if (dos.readUInt16LE(0) !== 0x5a4d) return null;                     // 'MZ'
    const peOff = dos.readUInt32LE(0x3c);
    const coff = readBytes(fd, peOff, 24);
    if (coff.readUInt32LE(0) !== 0x4550) return null;                    // 'PE\0\0'
    const sectionCount = coff.readUInt16LE(6);
    const optSize = coff.readUInt16LE(20);
    const opt = readBytes(fd, peOff + 24, optSize);
    const dirs = opt.readUInt16LE(0) === 0x20b ? 112 : 96;               // 64비트 · 32비트 실행 파일
    if (optSize < dirs + 24) return null;
    const rsrcRva = opt.readUInt32LE(dirs + 16);                         // 세 번째 자료 목록 = 리소스
    if (!rsrcRva) return null;
    const sections = readBytes(fd, peOff + 24 + optSize, sectionCount * 40);
    const toOffset = (rva) => {
      for (let i = 0; i < sectionCount; i++) {
        const s = i * 40;
        const va = sections.readUInt32LE(s + 12);
        const len = Math.max(sections.readUInt32LE(s + 8), sections.readUInt32LE(s + 16));
        if (rva >= va && rva < va + len) return rva - va + sections.readUInt32LE(s + 20);
      }
      throw new Error('bad rva');
    };
    const root = toOffset(rsrcRva);
    const entries = (off) => {                                           // 리소스 목록 한 단계
      const head = readBytes(fd, root + off, 16);
      const count = head.readUInt16LE(12) + head.readUInt16LE(14);
      if (count > 4096) throw new Error('too many');
      const list = readBytes(fd, root + off + 16, count * 8);
      return Array.from({ length: count }, (_, i) => {
        const to = list.readUInt32LE(i * 8 + 4);
        return { id: list.readUInt32LE(i * 8), sub: to >= 0x80000000, off: to & 0x7fffffff };
      });
    };
    const data = (entry) => {                                            // 언어 단계까지 내려가 첫 자료
      let e = entry;
      for (let depth = 0; e && e.sub && depth < 3; depth++) e = entries(e.off)[0];
      if (!e || e.sub) throw new Error('bad entry');
      const d = readBytes(fd, root + e.off, 8);
      const len = d.readUInt32LE(4);
      if (len > 4 * 1024 * 1024) throw new Error('too big');
      return readBytes(fd, toOffset(d.readUInt32LE(0)), len);
    };
    const types = entries(0);
    const groupType = types.find(t => t.id === RT_GROUP_ICON && t.sub);
    const iconType = types.find(t => t.id === RT_ICON && t.sub);
    if (!groupType || !iconType) return null;
    const groups = entries(groupType.off);                               // 윈도우처럼 목록 순서 (이름 → 번호)
    const group = index < 0 ? groups.find(g => g.id === -index) : groups[index];
    if (!group) return null;
    const dir = data(group);
    const icons = entries(iconType.off);
    const choices = [];
    for (let i = 0, count = dir.readUInt16LE(4); i < count && 6 + i * 14 + 14 <= dir.length; i++) {
      const o = 6 + i * 14;
      choices.push({ size: dir[o] || 256, bits: dir.readUInt16LE(o + 6), id: dir.readUInt16LE(o + 12) });
    }
    choices.sort((a, b) => (b.size - a.size) || (b.bits - a.bits));      // 큰 그림부터
    for (const c of choices) {
      const entry = icons.find(e => e.id === c.id);
      const img = entry ? iconImage(data(entry)) : null;
      if (img) return img;
    }
    return null;
  } catch (_) {
    return null;
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

// 아이콘 그림 한 장 → nativeImage. PNG 는 그대로, 32비트 BMP 는 아래→위 줄을 뒤집고
// (알파가 비었으면 투명 가림 AND 를 써서) 미리 곱한 알파의 BGRA 로 옮김. 그 밖(색 수가 적은 옛 그림)은 null
function iconImage(buf) {
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) {
    const img = nativeImage.createFromBuffer(buf);
    return img.isEmpty() ? null : img;
  }
  if (buf.length < 40) return null;
  const header = buf.readUInt32LE(0);
  const width = buf.readInt32LE(4);
  const height = buf.readInt32LE(8) / 2;                                 // 그림 + AND 가림 두 장 높이
  if (buf.readUInt16LE(14) !== 32 || buf.readUInt32LE(16) !== 0) return null;
  if (width <= 0 || width > 512 || height !== width) return null;
  const stride = width * 4;
  const maskStride = ((width + 31) >> 5) * 4;
  if (header + stride * height > buf.length) return null;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) buf.copy(out, y * stride, header + (height - 1 - y) * stride, header + (height - y) * stride);
  let alpha = false;
  for (let i = 3; i < out.length; i += 4) if (out[i]) { alpha = true; break; }
  const mask = header + stride * height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      if (!alpha) {
        const m = mask + (height - 1 - y) * maskStride + (x >> 3);
        out[p + 3] = m < buf.length && (buf[m] & (0x80 >> (x & 7))) ? 0 : 255;
      }
      const a = out[p + 3];
      if (a < 255) {
        out[p] = Math.round(out[p] * a / 255);
        out[p + 1] = Math.round(out[p + 1] * a / 255);
        out[p + 2] = Math.round(out[p + 2] * a / 255);
      }
    }
  }
  const img = nativeImage.createFromBitmap(out, { width, height });
  return img.isEmpty() ? null : img;
}

// 윈도우가 '그림이 없을 때' 대신 붙이는 기본 그림 — 아이콘이 없는 프로그램(.exe) · 모르는 종류 · 확장자 없는 파일 ·
// 바로가기(.lnk) · 인터넷 바로가기(.url) 자체의 그림. 이런 그림이 오면 '그림 없음'으로 치고 화면이 기본 그림
// (code/icons/file-*.svg — renderer/file-icon.js)을 씀.
// 빈 임시 파일에 같은 방법으로 아이콘을 물어서 알아 둠 (윈도우 판 · 테마마다 그림이 달라서 미리 넣어 두지 않음)
let genericIconsPromise = null;
function genericIcons() {
  if (!genericIconsPromise) genericIconsPromise = collectGenericIcons();
  return genericIconsPromise;
}

async function collectGenericIcons() {
  const found = new Set();
  let dir = null;
  try {
    dir = fs.mkdtempSync(path.join(app.getPath('temp'), 'wallpaper-canvas-'));
    const blank = (name, text = '') => {
      const file = path.join(dir, name);
      fs.writeFileSync(file, text);
      return file;
    };
    const samples = [
      blank('blank.exe'),                       // 아이콘이 없는 프로그램
      blank('blank.zzunknown'),                 // 모르는 종류
      blank('blank'),                           // 확장자 없는 파일
      blank('blank.url', '[InternetShortcut]\r\nURL=https://example.com/\r\n'),
    ];
    const link = path.join(dir, 'blank.lnk');
    if (process.platform === 'win32' && shell.writeShortcutLink(link, 'create', { target: samples[0] })) samples.push(link);
    for (const file of samples) {
      for (const size of ['large', 'normal']) {
        try {
          const url = toDataUrl(await app.getFileIcon(file, { size }));
          if (url) found.add(url);
        } catch (_) {}
      }
    }
  } catch (err) {
    logLine(`윈도우 기본 그림 알아 두기 실패: ${err && err.message}`);
  } finally {
    if (dir) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    }
  }
  return found;
}

// 윈도우 기본 그림이면 null (쓸 만한 그림만 통과)
async function ownPicture(url) {
  if (!url) return null;
  return (await genericIcons()).has(url) ? null : url;
}

// 파일 그림 — 종류에 따라 '탐색기 미리보기'와 '파일 아이콘' 중 맞는 쪽을 먼저
async function filePreview(filePath, isDir = false) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const wantThumb = !isDir && THUMB_EXTENSIONS.has(ext);

  if (ext === 'lnk' || ext === 'url') {            // 바로가기: 가리키는 프로그램의 아이콘
    const linked = await ownPicture(await shortcutIcon(filePath));
    if (linked) { iconStats.link++; return linked; }
  }
  if (wantThumb) {
    const thumb = await ownPicture(await shellThumbnail(filePath));
    if (thumb) { iconStats.thumb++; return thumb; }
  }
  const icon = await ownPicture(await shellIcon(filePath));
  if (icon) { iconStats.icon++; return icon; }
  if (!wantThumb) {                                  // 폴더: 탐색기와 같은 폴더 그림 (속 내용이 살짝 비침)
    const thumb = await ownPicture(await shellThumbnail(filePath));
    if (thumb) { iconStats.thumb++; return thumb; }
  }
  iconStats.none++;
  logLine(`그림 없음 → 기본 그림: ${path.basename(filePath)}`);
  return null;
}

// 파일 추가: 파일을 골라 경로·이름·윈도우 아이콘 반환
ipcMain.handle('pick-file', async (event, title) => {
  const result = await openFileDialog({ title: title || '파일 추가', properties: ['openFile'] });
  if (result.canceled || !result.filePaths.length) return null;
  const filePath = result.filePaths[0];
  const icon = await filePreview(filePath);
  logLine(`파일 고름: ${filePath} (그림 ${icon ? icon.length + '자' : '없음 → 기본 그림'})`);
  return { path: filePath, name: path.basename(filePath), icon };
});

// 바탕화면 파일 아이콘 더블클릭: 기본 프로그램으로 열기
// 쪽지 속 링크 → 기본 브라우저 (renderer/note-links.js). 인터넷 주소(http · https)만
ipcMain.handle('open-external', async (event, url) => {
  let u;
  try { u = new URL(String(url)); } catch (_) { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  await shell.openExternal(u.href);
  return true;
});

// 쪽지 속 유튜브 재생기 — 이 앱 화면(file://)은 보낸 곳(Referer)이 없어 유튜브가 재생을 막음 (오류 153)
//   → 유튜브 재생기 요청에만 보낸 곳을 붙임
function allowYouTubeEmbeds() {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/*'] },
    (details, callback) => {
      const headers = details.requestHeaders;
      if (!headers.Referer && !headers.referer) headers.Referer = 'https://wallpaper-canvas.app/';
      callback({ requestHeaders: headers });
    });
}

// ---------------- 웹 페이지 쪽지 (renderer/web-note.js) ----------------
//   <webview> = 캔버스 창 안에서 따로 도는 페이지. 앱과 떨어진 저장소(persist:web) — 로그인 · 쿠키는 여기 남음
//   붙기 전에 조임: preload 없음 · node 없음 · 격리 · http(s) 주소만
//   새 탭으로 여는 링크 → 그 쪽지 안에서, 로그인 창처럼 따로 뜨는 작은 창 → 보통 창으로 (맨 위 — 캔버스 뒤에 숨지 않게)
//   내려받기 → 묻지 않고 '다운로드' 폴더에 (묻는 창이 캔버스 뒤에 숨는 일이 있어서)
//   권한(카메라 · 위치 · 알림 …)은 주지 않음 — 전체 화면 · 복사만
const WEB_PARTITION = 'persist:web';
function setupWebNotes() {
  app.on('web-contents-created', (event, contents) => {
    contents.on('will-attach-webview', (e, webPreferences, params) => {
      delete webPreferences.preload;
      webPreferences.nodeIntegration = false;
      webPreferences.nodeIntegrationInSubFrames = false;
      webPreferences.contextIsolation = true;
      webPreferences.sandbox = true;
      if (params.partition !== WEB_PARTITION || !/^https?:\/\//i.test(params.src || '')) {
        logLine(`웹 페이지 쪽지: 막음 (${params.partition} ${String(params.src).slice(0, 80)})`);
        e.preventDefault();
      }
    });
    if (contents.getType() !== 'webview') return;
    contents.setWindowOpenHandler(({ url, disposition }) => {
      if (!/^https?:\/\//i.test(url)) return { action: 'deny' };
      if (disposition === 'new-window') {
        return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 680, autoHideMenuBar: true, alwaysOnTop: true } };
      }
      contents.loadURL(url).catch(() => {});
      return { action: 'deny' };
    });
  });
  const ses = session.fromPartition(WEB_PARTITION);
  ses.setPermissionRequestHandler((wc, permission, callback) => callback(permission === 'fullscreen' || permission === 'clipboard-sanitized-write'));
  ses.on('will-download', (e, item) => {
    const dir = app.getPath('downloads');
    const ext = path.extname(item.getFilename());
    const base = path.basename(item.getFilename(), ext) || 'download';
    let dest = path.join(dir, base + ext);
    for (let i = 2; fs.existsSync(dest); i++) dest = path.join(dir, `${base} (${i})${ext}`);
    item.setSavePath(dest);
    logLine(`웹 페이지 쪽지: 내려받기 → ${dest}`);
  });
}

// 화면 밖에 오래 있던 페이지를 내려놓기 전에 지금 모습 (renderer/web-note.js unloadWebView) — 작은 JPEG
ipcMain.handle('web-snapshot', async (event, id) => {
  try {
    const { webContents } = require('electron');
    const wc = webContents.fromId(Number(id));
    if (!wc || wc.isDestroyed() || wc.getType() !== 'webview') return null;
    const image = await wc.capturePage();
    if (image.isEmpty()) return null;
    const size = image.getSize();
    const small = size.width > 960 ? image.resize({ width: 960 }) : image;
    return `data:image/jpeg;base64,${small.toJPEG(75).toString('base64')}`;
  } catch (_) {
    return null;
  }
});

ipcMain.handle('open-path', async (event, filePath) => {
  const error = await shell.openPath(filePath);   // 성공하면 빈 문자열
  return error === '' ? true : error;
});

// ================ 바탕화면 폴더 (내 바탕화면 + 모든 사용자 바탕화면) ================
function getDesktopDirs() {
  const dirs = [app.getPath('desktop')];
  const publicDesktop = path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop');
  if (process.platform === 'win32' && fs.existsSync(publicDesktop)) dirs.push(publicDesktop);
  return [...new Set(dirs.map(d => path.resolve(d)))];
}

const SKIP_NAMES = new Set(['desktop.ini', 'thumbs.db']);
const iconCache = new Map();   // 경로|수정시각 → 아이콘

// 파일 하나의 이름·아이콘 (바로가기 .lnk/.url 은 확장자 없이 표시)
async function describePath(filePath) {
  let stat;
  try { stat = fs.statSync(filePath); } catch (_) { return null; }
  const base = path.basename(filePath);
  const ext = path.extname(base).toLowerCase();
  const name = (ext === '.lnk' || ext === '.url') ? base.slice(0, -ext.length) : base;
  const key = `${filePath}|${stat.mtimeMs}`;
  let icon = iconCache.get(key);
  if (icon === undefined) {
    icon = await filePreview(filePath, stat.isDirectory());
    iconCache.set(key, icon);
  }
  return { path: filePath, name, icon, isDir: stat.isDirectory() };
}

async function listDesktop() {
  const items = [];
  iconStats.icon = iconStats.thumb = iconStats.link = iconStats.none = 0;
  for (const dir of getDesktopDirs()) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch (_) { continue; }
    for (const n of names) {
      if (SKIP_NAMES.has(n.toLowerCase()) || n.startsWith('~$') || n.startsWith('.')) continue;
      const info = await describePath(path.join(dir, n));
      if (info) items.push(info);
    }
  }
  if (iconStats.icon + iconStats.thumb + iconStats.none)
    logLine(`바탕화면 ${items.length}개 — 바로가기 ${iconStats.link} · 아이콘 ${iconStats.icon} · 미리보기 ${iconStats.thumb} · 기본 그림 ${iconStats.none}`);
  return items;
}

ipcMain.handle('list-desktop', () => listDesktop());

// 바탕화면 폴더에 파일이 생기거나 지워지면 화면에 알려 줌
let desktopWatchers = [];
function watchDesktop() {
  let timer = null;
  const notify = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('desktop-changed', await listDesktop());
      }
    }, 400);
  };
  for (const dir of getDesktopDirs()) {
    try { desktopWatchers.push(fs.watch(dir, notify)); } catch (_) {}
  }
}

// 휴지통으로 보내기: 바탕화면 폴더 바로 안에 있는 파일만 허용
ipcMain.handle('trash-path', async (event, filePath) => {
  const target = path.resolve(String(filePath || ''));
  const parent = path.dirname(target).toLowerCase();
  if (!getDesktopDirs().some(d => d.toLowerCase() === parent)) {
    return '바탕화면 폴더에 있는 파일만 휴지통으로 보낼 수 있어요.';
  }
  try {
    await shell.trashItem(target);
    return true;
  } catch (err) {
    return String((err && err.message) || err);
  }
});

// 휴지통으로 보낸 바탕화면 파일 되살리기 (화면의 되돌리기, native/desktop-bridge.ps1 restore) — 반환: { failed: [못 되살린 경로] }
ipcMain.handle('restore-trashed', async (event, paths) => {
  const list = (Array.isArray(paths) ? paths : []).map(String);
  if (process.platform !== 'win32') return { failed: list };
  const failed = [];
  for (const p of list) {
    const reply = await bridgeCall(`restore ${Buffer.from(p, 'utf8').toString('base64')}`, 30000);
    logLine(`휴지통에서 되살리기: ${path.basename(p)} → ${reply}`);
    if (!reply.startsWith('ok')) failed.push(p);
  }
  return { failed };
});

// 탐색기에서 끌어다 놓은 파일들의 이름·아이콘
ipcMain.handle('describe-paths', async (event, paths) => {
  const items = [];
  for (const p of Array.isArray(paths) ? paths : []) {
    const info = await describePath(String(p));
    if (info) items.push(info);
  }
  return items;
});

// 창이 닫힐 때 마지막 내용을 확실히 저장하기 위한 동기 저장
ipcMain.on('save-canvas-state-sync', (event, state) => {
  try {
    event.returnValue = writeState(state);
  } catch (err) {
    console.error('노트 저장 실패:', err);
    event.returnValue = false;
  }
});

// 앱은 하나만 — 두 번 켜면 캔버스 두 장이 바탕화면 바로 위 자리를 서로 다투고, 같은 저장 파일에 번갈아 씀
//   (앱 데이터 폴더마다 하나 — 시험용으로 다른 폴더를 쓰면 따로 켜짐)
// (GPU 메모리 한도 force-gpu-mem-available-mb 는 쓰지 않음 — 실제 화면에서 화면 조각이 모자라 일부가 비거나 깜빡이고 느려졌음.
//  메모리는 가려져 있을 때 절전으로 줄임)
// 절전 때 GPU 프로세스를 끝내도 (main.js 절전) 하드웨어 가속을 끄지 않게 — 크로미움은 GPU 프로세스가 몇 번 끝나면 가속을 아주 끔
app.commandLine.appendSwitch('disable-gpu-process-crash-limit');

const firstInstance = app.requestSingleInstanceLock();
if (!firstInstance) app.quit();
app.on('second-instance', () => {
  logLine('앱을 한 번 더 켜려 함 → 이미 켜진 앱을 그대로 씀');
  wake('앱을 한 번 더 켬');
});

app.on('ready', () => {
  if (!firstInstance) return;
  genericIcons();          // 윈도우 기본 그림을 창이 뜨는 동안 미리 알아 둠 (저장된 내용을 불러올 때 씀)
  allowYouTubeEmbeds();
  setupWebNotes();
  wallpaper.wanted = wallpaperSetting();
  if (process.platform === 'win32') startBridge(); // 다리를 창이 뜨는 동안 미리 띄워 둠 (바탕화면 층 · 윈도우 우클릭 메뉴, 준비에 1초쯤)
  if (process.platform === 'win32') {
    popOutKey = POP_OUT_KEYS.find(key => globalShortcut.register(key, togglePopOut)) || '';
    logLine(popOutKey ? `앞으로 꺼내기 단축키: ${popOutKey}` : `앞으로 꺼내기 단축키를 못 잡음 (${POP_OUT_KEYS.join(' · ')} 모두 다른 프로그램이 씀)`);
    setInterval(keepOnDesktop, 5000);
    setInterval(keepMenuReady, 5000);             // 바탕 우클릭 메뉴를 미리 만들어 둠 (다리가 준비되면 · 10분마다 새로)
  }
  createTray();
  createWindow();
});

app.on('before-quit', () => { quitting = true; });
// 끌 때 윈도우 배경 화면을 원래대로 (설정 '바탕화면 배경 색 맞추기' — 되돌린 뒤 다시 끔)
app.on('before-quit', (event) => {
  if (!desktopBg.applied || desktopBg.restoringOnQuit) return;
  event.preventDefault();
  desktopBg.restoringOnQuit = true;
  setDesktopBackground(false).finally(() => app.quit());
});

// 끌 때: 단축키를 풀고 다리를 닫음 (다리는 입력이 끊기면 스스로 끝남)
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (wallpaper.bridge) {
    try { wallpaper.bridge.stdin.end(); } catch (_) {}
  }
});

app.on('window-all-closed', () => {
  if (wallpaper.wanted && !quitting) return;      // 탐색기가 다시 시작된 경우 — 창을 다시 만드는 중
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

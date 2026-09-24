const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, nativeImage, screen, net, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { execFile, spawn } = require('child_process');

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
function screenArea() {
  const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
  return { x, y, width, height };
}

// 해상도 · 배율 · 모니터 구성 · 작업표시줄 위치가 바뀌면 창도 다시 맞춤
function fitWindowToScreen() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (wallpaper.embedded) {                         // 바탕화면 층: 새 크기로 다시 넣음 (모니터 수가 바뀌면 아이콘도)
    embedWindow();
    return;
  }
  const area = screenArea();
  mainWindow.setBounds(area);
  logLine(`화면 크기 맞춤: ${area.width}×${area.height} (${area.x}, ${area.y})`);
}

// ================ 바탕화면 층 (메모장.md Phase 5) ================
// 설정 '바탕화면에 넣기'(기본 켬)면 캔버스 창을 윈도우 바탕화면 층에 넣음
//   → 다른 프로그램 창은 늘 그 위, '바탕화면 보기'(Win+D)에도 그대로, Alt+Tab 에도 안 나옴
//   자리는 바탕화면 창 안의 맨 위 — 윈도우 아이콘 층보다 위라 윈도우 아이콘은 가려짐 (파일 아이콘은 앱이 직접 그림).
//   탐색기 창은 숨기거나 바꾸지 않으므로 앱이 갑자기 꺼져도 바탕화면은 그대로
//   바탕화면 층의 창에는 키보드가 저절로 오지 않아서, 캔버스를 누를 때마다 키보드를 이 창으로 가져옴.
//   그래도 못 가져오는 컴퓨터면 글을 쓰는 동안만 캔버스를 앞으로 꺼냄
//   Ctrl+Alt+D: 캔버스를 다른 창들 앞으로 꺼냄 → 다른 창을 누르거나 한 번 더 누르면 다시 바탕화면 층으로
//     (Ctrl+Alt+Space 는 Claude 앱 등이 이미 씀. 다른 프로그램이 잡고 있으면 다음 후보로)
//   Win32 호출은 native/desktop-bridge.ps1 (윈도우에 들어 있는 PowerShell 의 C# 호출 — 새로 설치할 것 없음).
//   넣지 못하면 예전처럼 맨 위 창으로 씀
const POP_OUT_KEYS = ['Control+Alt+D', 'Control+Alt+W', 'Control+Alt+Q'];
let popOutKey = '';     // 실제로 잡은 단축키 (설정 창 안내에 씀)
const wallpaper = {
  wanted: false,        // 설정: 바탕화면에 넣기
  embedded: false,      // 지금 바탕화면 층에 들어가 있음
  poppedOut: false,     // 앞으로 꺼내 둔 중 (Ctrl+Alt+D, 또는 글 쓰는 동안)
  autoPopped: false,    // 글 쓰는 동안만 꺼낸 것 — 다 쓰면 다시 넣음
  moving: false,        // 넣고 빼는 중 (그 사이에 오는 창 활성 · 비활성은 무시)
  dialogOpen: false,    // 파일 고르기 등 윈도우 창이 떠 있는 중 (그동안은 다시 넣지 않음)
  keyboard: null,       // 캔버스를 눌렀을 때 키보드를 가져왔는지 — 'ok' | 'fail'
  claim: null,          // 키보드 가져오기 (진행 중이면 기다림)
  bridge: null,         // PowerShell 다리 — 한 번 띄워 두고 한 줄씩 명령 · 답
  queue: [],
  buffer: '',
};
let quitting = false;   // 사용자가 끄는 중 (탐색기가 다시 시작돼 창이 사라진 것과 구분)

function wallpaperSetting() {
  if (process.platform !== 'win32') return false;
  try {
    return JSON.parse(fs.readFileSync(getSettingsFile(), 'utf-8')).wallpaperMode !== false;
  } catch (_) {
    return true;
  }
}

function startBridge() {
  if (wallpaper.bridge || process.platform !== 'win32') return wallpaper.bridge;
  const script = path.join(__dirname, 'native', 'desktop-bridge.ps1');
  let child;
  try {
    child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true });
  } catch (err) {
    logLine(`바탕화면 다리 못 띄움: ${err && err.message}`);
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
      const next = wallpaper.queue.shift();
      if (next) next(line);
    }
  });
  child.stderr.on('data', (data) => logLine(`바탕화면 다리 오류: ${String(data).trim().slice(0, 300)}`));
  child.on('error', (err) => logLine(`바탕화면 다리 오류: ${err && err.message}`));
  child.on('exit', (code) => {
    logLine(`바탕화면 다리 끝남 (${code})`);
    wallpaper.queue.splice(0).forEach(done => done('fail exit'));
    if (wallpaper.bridge === child) wallpaper.bridge = null;
  });
  return child;
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

// 바탕화면 층에 넣기 — 주 모니터 전체 (작업표시줄 뒤까지)
async function embedWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const b = screen.dipToScreenRect(null, screen.getPrimaryDisplay().bounds);
  const onTop = mainWindow.isAlwaysOnTop();
  wallpaper.moving = true;
  try {
    mainWindow.setAlwaysOnTop(false);
    const reply = await bridgeCall(`attach ${windowHandle()} ${b.x} ${b.y} ${b.width} ${b.height}`);
    logLine(`바탕화면 층에 넣기: ${reply}`);
    if (!reply.startsWith('ok')) {
      if (onTop && mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(true);
      return false;
    }
    wallpaper.embedded = true;
    wallpaper.poppedOut = false;
    wallpaper.autoPopped = false;
    return true;
  } finally {
    wallpaper.moving = false;
  }
}

// 바탕화면 층에서 꺼내 보통 창으로 — bounds 는 Electron 좌표 (배율 적용)
async function unembedWindow(bounds) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const b = screen.dipToScreenRect(null, bounds);
  wallpaper.moving = true;
  try {
    const reply = await bridgeCall(`detach ${windowHandle()} ${b.x} ${b.y} ${b.width} ${b.height}`);
    logLine(`바탕화면 층에서 꺼냄: ${reply}`);
    wallpaper.embedded = false;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setBounds(bounds);
  } finally {
    wallpaper.moving = false;
  }
}

// 보통 창으로 앞에 (예전 방식 — 앞에 있는 동안 맨 위)
function showOnTop() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setAlwaysOnTop(true);
  mainWindow.show();
  mainWindow.focus();
}

// 앞으로 꺼내기 — auto: 글 쓰는 동안만 (다 쓰면 다시 넣음)
async function popOut(auto = false) {
  if (!wallpaper.embedded || wallpaper.moving) return;
  await unembedWindow(screenArea());
  wallpaper.poppedOut = true;
  wallpaper.autoPopped = auto;
  showOnTop();
}

// Ctrl+Alt+D — 꺼내기 · 다시 넣기
async function togglePopOut() {
  if (!mainWindow || mainWindow.isDestroyed() || !wallpaper.wanted || wallpaper.moving) return;
  if (wallpaper.embedded) await popOut();
  else if (wallpaper.poppedOut) await embedWindow();
}

// 넣지 못했으면 (탐색기가 막 다시 시작된 때 등) 잠시 뒤 다시 해 봄
function retryEmbed(tries = 5) {
  setTimeout(async () => {
    if (!mainWindow || mainWindow.isDestroyed() || !wallpaper.wanted) return;
    if (wallpaper.embedded || wallpaper.poppedOut || wallpaper.moving) return;
    if (!(await embedWindow()) && tries > 1) retryEmbed(tries - 1);
  }, 3000);
}

// 바탕화면 층에 붙어 있는지 가끔 확인 — 탐색기가 다시 시작되면 떨어지고, 바탕화면을 새로 고치면 윈도우 아이콘 층이 위로 올라오기도 함
async function keepOnDesktop() {
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

// 바탕화면 층의 캔버스를 누르면 키보드를 이 창으로 (preload.js 가 누를 때마다 알림)
function claimKeyboard() {
  if (!wallpaper.embedded || wallpaper.moving || !mainWindow || mainWindow.isDestroyed()) return;
  wallpaper.claim = bridgeCall(`focus ${windowHandle()}`, 3000).then((reply) => {
    const state = reply.startsWith('ok') ? 'ok' : 'fail';
    if (state !== wallpaper.keyboard) logLine(`바탕화면 층 키보드: ${reply}`);
    wallpaper.keyboard = state;
  });
}
ipcMain.on('canvas-pressed', claimKeyboard);

// 글 쓰기 시작 · 끝 (preload.js) — 키보드를 못 가져오는 컴퓨터면 쓰는 동안만 앞으로 꺼냄
ipcMain.on('editing', async (event, on) => {
  if (on) {
    if (!wallpaper.embedded || wallpaper.moving) return;
    await wallpaper.claim;
    if (wallpaper.keyboard === 'fail') await popOut(true);
  } else if (wallpaper.autoPopped && wallpaper.poppedOut && !wallpaper.moving) {
    await embedWindow();
  }
});

// 설정 창에서 켜고 끔 — 끄면 예전처럼 맨 위 창
ipcMain.handle('set-wallpaper-mode', async (event, on) => {
  on = !!on && process.platform === 'win32';
  if (on === wallpaper.wanted) return wallpaper.embedded;
  wallpaper.wanted = on;
  while (wallpaper.moving) await new Promise(r => setTimeout(r, 50));    // 넣고 빼는 중이면 끝난 뒤에
  if (wallpaper.wanted !== on) return wallpaper.embedded;                  // 그사이 또 바뀜
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (on) {
    if (await embedWindow()) return true;
    retryEmbed();
    return false;
  }
  if (wallpaper.embedded) await unembedWindow(screenArea());
  wallpaper.poppedOut = false;
  wallpaper.autoPopped = false;
  showOnTop();
  return false;
});

ipcMain.handle('get-wallpaper-state', () => ({ wanted: wallpaper.wanted, embedded: wallpaper.embedded, key: popOutKey }));

function createWindow() {
  let stamp = '?';
  try { stamp = new Date(fs.statSync(__filename).mtime).toLocaleString('ko-KR'); } catch (_) {}
  logLine(`──── 앱 시작 (main.js 저장 시각 ${stamp}) ────`);

  mainWindow = new BrowserWindow({
    ...screenArea(),              // 주 모니터의 작업 영역 (작업표시줄 뺀 부분) — 해상도 · 배율에 맞춤
    transparent: true,
    frame: false,
    hasShadow: false,
    skipTaskbar: true,           // 작업표시줄에 표시 안 함
    alwaysOnTop: !wallpaper.wanted,   // 앞에 있는 동안 맨 위 (바탕화면 층에 넣을 거면 처음부터 풀어 둠)
    focusable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      autoplayPolicy: 'no-user-gesture-required',   // 소리를 켜 둔 영상도 켤 때 바로 재생 (renderer/photos.js)
    }
  });

  mainWindow.loadFile('index.html');

  // 윈도우 준비 완료 후 표시 — 바탕화면에 넣기가 켜져 있으면 바탕화면 층에 넣은 채로 (앞으로 나오지 않게)
  mainWindow.once('ready-to-show', async () => {
    if (wallpaper.wanted) {
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
    if (wallpaper.embedded || wallpaper.moving) return;
    if (wallpaper.poppedOut) {
      if (!wallpaper.dialogOpen) embedWindow();
      return;
    }
    mainWindow.setAlwaysOnTop(false);
  });

  // 이 창이 다시 포커스를 받으면 앞으로 가기 (바탕화면 층에 있을 때는 그대로)
  mainWindow.on('focus', () => {
    if (wallpaper.embedded || wallpaper.moving) return;
    mainWindow.setAlwaysOnTop(true);
  });

  // "바탕화면 표시"(Win+D) 등으로 최소화되면 숨지 않고 뒤로만 보냄 (바탕화면 층은 최소화되지 않음)
  mainWindow.on('minimize', () => {
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
    wallpaper.embedded = false;
    wallpaper.poppedOut = false;
    // 바탕화면(탐색기)이 다시 시작되면 바탕화면 층과 함께 창도 사라짐 → 잠시 뒤 다시 만들어 넣음
    if (wallpaper.wanted && !quitting) {
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

ipcMain.handle('save-settings', (event, settings) => writeJsonAtomic(getSettingsFile(), settings));

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

app.on('ready', () => {
  genericIcons();          // 윈도우 기본 그림을 창이 뜨는 동안 미리 알아 둠 (저장된 내용을 불러올 때 씀)
  wallpaper.wanted = wallpaperSetting();
  if (wallpaper.wanted) startBridge();             // 바탕화면 다리를 창이 뜨는 동안 미리 띄워 둠 (준비에 1초쯤)
  if (process.platform === 'win32') {
    popOutKey = POP_OUT_KEYS.find(key => globalShortcut.register(key, togglePopOut)) || '';
    logLine(popOutKey ? `앞으로 꺼내기 단축키: ${popOutKey}` : `앞으로 꺼내기 단축키를 못 잡음 (${POP_OUT_KEYS.join(' · ')} 모두 다른 프로그램이 씀)`);
    setInterval(keepOnDesktop, 5000);
  }
  createWindow();
});

app.on('before-quit', () => { quitting = true; });

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

const { contextBridge, ipcRenderer, webUtils } = require('electron');

// 바탕화면 층 (main.js Phase 5) — 캔버스를 누르면 키보드를 이 창으로 가져오게 알리고, 글 쓰기를 시작 · 끝내면 알림
//   (글 쓰는 동안은 main.js 가 캔버스를 앞으로 꺼냄 — 바탕화면 층에서는 한글 조합이 글자 자리에 안 보여서)
const TEXT_INPUTS = new Set(['text', 'search', 'url', 'email', 'number', 'password', 'tel']);
function isEditable(el) {
  if (!el) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'WEBVIEW') return true;   // 웹 페이지 쪽지에서 글을 쓸 수도 있음
  return el.tagName === 'INPUT' && TEXT_INPUTS.has(el.type);
}
let editingTimer = null;
window.addEventListener('mousedown', () => ipcRenderer.send('canvas-pressed'), true);
// 절전 (main.js) — 다른 창에 다 가려졌는지 (크로미움이 알려 줌)
document.addEventListener('visibilitychange', () => ipcRenderer.send('canvas-visibility', document.hidden));
window.addEventListener('DOMContentLoaded', () => ipcRenderer.send('canvas-visibility', document.hidden));
window.addEventListener('focusin', (e) => {
  if (!isEditable(e.target)) return;
  clearTimeout(editingTimer);
  ipcRenderer.send('front-hold', 'editing', true);
}, true);
window.addEventListener('focusout', (e) => {
  if (!isEditable(e.target)) return;
  clearTimeout(editingTimer);
  editingTimer = setTimeout(() => {                        // 다른 글 칸으로 옮겨 가는 중이면 끝난 게 아님
    if (!isEditable(document.activeElement)) ipcRenderer.send('front-hold', 'editing', false);
  }, 300);
}, true);

// 화면(renderer)이 쓸 수 있는 기능만 골라서 내보냄
contextBridge.exposeInMainWorld('canvasAPI', {
  // 쪽지 저장 파일
  getCanvasState: () => ipcRenderer.invoke('get-canvas-state'),
  saveCanvasState: (state) => ipcRenderer.invoke('save-canvas-state', state),
  saveCanvasStateSync: (state) => ipcRenderer.sendSync('save-canvas-state-sync', state),
  archiveState: () => ipcRenderer.invoke('archive-state'),
  // 설정
  getSettings: () => ipcRenderer.invoke('get-settings'),
  // 빨간 날 (구글 캘린더 공휴일)
  getHolidays: (region, lang) => ipcRenderer.invoke('get-holidays', region, lang),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  // 종료할 때 저장 확인 (자동 저장이 꺼져 있을 때)
  setDirty: (dirty, labels) => ipcRenderer.send('set-dirty', dirty, labels),
  onSaveAndQuit: (callback) => ipcRenderer.on('save-and-quit', () => callback()),
  requestQuit: () => ipcRenderer.send('request-quit'),
  quitNow: () => ipcRenderer.send('quit-now'),
  // 사진 · 파일 고르기
  pickImage: (title) => ipcRenderer.invoke('pick-image', title),
  pickVideo: (title) => ipcRenderer.invoke('pick-video', title),
  pickFile: (title) => ipcRenderer.invoke('pick-file', title),
  openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),   // 쪽지 속 링크 (http · https 만)
  // 바탕 우클릭 — 클립보드의 파일 · 바탕화면에 붙여넣기(link: 바로 가기로) · 정렬 기준에 쓸 파일 정보
  clipboardFiles: () => ipcRenderer.invoke('clipboard-files'),
  // 캔버스 Ctrl+C · Ctrl+V (renderer/clipboard.js) — 파일 · 글을 윈도우 클립보드에 (반환: 클립보드 순번) · 지금 순번
  canvasClipSet: (files, text) => ipcRenderer.invoke('canvas-clip-set', files, text),
  clipboardSeq: () => ipcRenderer.invoke('clipboard-seq'),
  pasteFiles: (link) => ipcRenderer.invoke('paste-files', !!link),
  fileStats: (paths) => ipcRenderer.invoke('file-stats', paths),
  // 문제 찾기용 기록
  log: (text) => ipcRenderer.send('debug-log', String(text)),
  // 클립보드
  saveImageData: (bytes, mime) => ipcRenderer.invoke('save-image-data', bytes, mime),
  importImage: (filePath) => ipcRenderer.invoke('import-image', filePath),
  importMedia: (filePath) => ipcRenderer.invoke('import-media', filePath),      // 파일 › 이미지 · 영상 쪽지로 바꾸기
  webSnapshot: (id) => ipcRenderer.invoke('web-snapshot', id),                   // 웹 페이지 쪽지를 내려놓기 전 모습
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  // 바탕화면 폴더
  listDesktop: () => ipcRenderer.invoke('list-desktop'),
  onDesktopChanged: (callback) => ipcRenderer.on('desktop-changed', (event, list) => callback(list)),
  trashPath: (filePath) => ipcRenderer.invoke('trash-path', filePath),
  restoreTrashed: (paths) => ipcRenderer.invoke('restore-trashed', paths),
  // 바탕화면 층에 넣기 (Phase 5) · 트레이에서 온 부탁 (설정 창 열기 · 설정 바꾸기)
  setWallpaperMode: (on) => ipcRenderer.invoke('set-wallpaper-mode', !!on),
  getWallpaperState: () => ipcRenderer.invoke('get-wallpaper-state'),
  // 시작 앱 (윈도우에 로그인하면 켜기) — { available, on }
  getStartup: () => ipcRenderer.invoke('get-startup'),
  setStartup: (on) => ipcRenderer.invoke('set-startup', !!on),
  holdFront: (reason, on) => ipcRenderer.send('front-hold', reason, !!on),
  colorDialog: () => ipcRenderer.send('color-dialog'),
  setBackground: (color) => ipcRenderer.send('set-background', color),
  // 윈도우 배경 화면을 캔버스 색 단색으로 · 원래대로 (설정 '바탕화면 배경 색 맞추기', main.js)
  setDesktopBackground: (on, color) => ipcRenderer.send('set-desktop-background', !!on, color),
  onOpenSettings: (callback) => ipcRenderer.on('open-settings', () => callback()),
  onApplySetting: (callback) => ipcRenderer.on('apply-setting', (event, key, value) => callback(key, value)),
  // 윈도우 우클릭 메뉴 · 파일 이름 바꾸기
  shellMenu: (paths, items, waited) => ipcRenderer.invoke('shell-menu', paths, items, waited),   // waited: 메뉴 전에 기다린 ms (기록용)
  menuPrefetch: (paths) => ipcRenderer.send('menu-prefetch', paths),     // 오른쪽 단추를 누르는 순간 — 뗄 때 뜰 메뉴를 미리
  renamePath: (filePath, newName) => ipcRenderer.invoke('rename-path', filePath, newName),
  // 탐색기에서 끌어다 놓기
  getPathForFile: (file) => webUtils.getPathForFile(file),
  describePaths: (paths) => ipcRenderer.invoke('describe-paths', paths),
});

const { contextBridge, ipcRenderer, webUtils } = require('electron');

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
  pickFile: (title) => ipcRenderer.invoke('pick-file', title),
  openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),
  // 문제 찾기용 기록
  log: (text) => ipcRenderer.send('debug-log', String(text)),
  // 클립보드
  saveImageData: (bytes, mime) => ipcRenderer.invoke('save-image-data', bytes, mime),
  importImage: (filePath) => ipcRenderer.invoke('import-image', filePath),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  // 바탕화면 폴더
  listDesktop: () => ipcRenderer.invoke('list-desktop'),
  onDesktopChanged: (callback) => ipcRenderer.on('desktop-changed', (event, list) => callback(list)),
  trashPath: (filePath) => ipcRenderer.invoke('trash-path', filePath),
  // 탐색기에서 끌어다 놓기
  getPathForFile: (file) => webUtils.getPathForFile(file),
  describePaths: (paths) => ipcRenderer.invoke('describe-paths', paths),
});

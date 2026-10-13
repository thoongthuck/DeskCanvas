// 자동 업데이트 — GitHub Releases 에 새 판을 올리면 설치된 앱이 스스로 받아 바꿈 (electron-updater)
//   올리는 것: 릴리스 v<버전> 에 파일 셋 — DeskCanvas-Setup-<버전>.exe · 그 .blockmap · latest.yml  (npm run build → dist 폴더)
//     앱은 가장 새 릴리스의 latest.yml 을 읽어 지금 버전과 견줌 (package.json build.publish — 저장소가 공개여야 함)
//   앱: 켜고 30초 뒤 + 4시간마다 확인 → 새 판이면 뒤에서 내려받음 → 다 받으면 알림 (트레이 · 설정 창 · 캔버스 알림 — main.js)
//       '다시 시작해서 설치'를 누르면 조용히 설치하고 다시 켬. 누르지 않아도 앱을 끌 때 설치됨 (다음에 켜면 새 판)
//       설치 프로그램은 옛 판을 '업데이트'로 지우므로 쪽지 · 설정 · 시작 앱 등록은 그대로 (build/installer.nsh isUpdated)
//   설치 파일로 깐 윈도우 앱에서만 (개발 실행에서는 아무것도 안 함 — status 'unsupported')
//   설정 › 기타 › 자동 업데이트 를 끄면 스스로 확인하지 않음 ('지금 확인'은 그대로 됨)
const { app } = require('electron');

const FIRST_CHECK_MS = 30 * 1000;
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

// log: 기록 한 줄 · isEnabled: 설정이 켜져 있는지 · onChange: 상태가 바뀔 때마다 (상태 사본)
//   상태 status: unsupported · idle · off · checking · latest · downloading · ready · error
function createUpdater({ log, isEnabled, onChange }) {
  const supported = app.isPackaged && process.platform === 'win32';
  const state = { current: app.getVersion(), status: supported ? 'idle' : 'unsupported', next: '', percent: 0, error: '' };
  let autoUpdater = null;

  const snapshot = () => ({ ...state });
  const set = (patch) => {
    Object.assign(state, patch);
    onChange(snapshot());
  };

  if (supported) {
    ({ autoUpdater } = require('electron-updater'));
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = {
      info: (m) => log(`업데이트: ${m}`),
      warn: (m) => log(`업데이트 경고: ${m}`),
      error: (m) => log(`업데이트 오류: ${String(m && m.message || m).split('\n')[0]}`),
      debug: () => {},
    };
    autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: '' }));
    autoUpdater.on('update-available', (info) => set({ status: 'downloading', next: info.version, percent: 0 }));
    autoUpdater.on('update-not-available', () => set({ status: 'latest', next: '' }));
    autoUpdater.on('download-progress', (p) => {
      const percent = Math.floor(p.percent / 5) * 5;          // 5% 씩만 알림 (화면을 너무 자주 다시 그리지 않게)
      if (percent !== state.percent) set({ status: 'downloading', percent });
    });
    autoUpdater.on('update-downloaded', (info) => set({ status: 'ready', next: info.version, percent: 100 }));
    autoUpdater.on('error', (err) => {
      if (state.status === 'ready') return;                    // 이미 받아 둔 것은 그대로
      set({ status: 'error', error: String(err && err.message || err).split('\n')[0] });
    });
  }

  // manual: 설정 창의 '지금 확인' — 자동 업데이트를 꺼 두었어도 확인함
  async function check({ manual = false } = {}) {
    if (!supported) return snapshot();
    if (['checking', 'downloading', 'ready'].includes(state.status)) return snapshot();
    if (!manual && !isEnabled()) {
      if (state.status !== 'off') set({ status: 'off' });
      return snapshot();
    }
    try {
      await autoUpdater.checkForUpdates();
    } catch (_) {
      // 'error' 에서 이미 적음 (인터넷이 없거나 릴리스에 latest.yml 이 없을 때 등)
    }
    return snapshot();
  }

  function start() {
    if (!supported) return;
    setTimeout(() => check(), FIRST_CHECK_MS);
    setInterval(() => check(), CHECK_EVERY_MS);
  }

  // 받아 둔 새 판을 조용히 설치하고 다시 켬 — 부르기 전에 저장을 끝내 둘 것 (설치 프로그램이 앱을 닫음)
  function install() {
    if (!supported || state.status !== 'ready') return false;
    log(`업데이트: ${state.next} 설치하고 다시 시작`);
    autoUpdater.quitAndInstall(true, true);
    return true;
  }

  // 윈도우를 끄거나 로그아웃하는 중에는 끌 때 설치를 하지 않음 (설치가 중간에 끊기지 않게 — 다음에 켜서 끌 때 설치)
  function skipInstallOnQuit() {
    if (autoUpdater) autoUpdater.autoInstallOnAppQuit = false;
  }

  return { state: snapshot, check, start, install, skipInstallOnQuit };
}

module.exports = { createUpdater };

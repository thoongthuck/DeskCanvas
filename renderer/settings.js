// 설정값 — 불러오기 · 저장 · 화면에 적용 (설정 창 화면은 settings-window.js)
// 저장 위치: 앱 데이터 폴더의 settings.json (main.js)
import { DEFAULT_SETTINGS, NEW_NOTE_SIZES, GRID_GAPS, NOTE_COLORS, HOLIDAY_REGIONS } from './constants.js';
import { setLanguage } from './i18n.js';
import { isHexColor } from './color.js';

export const settingsMethods = {
  async loadSettings() {
    let saved = null;
    try {
      if (window.canvasAPI && window.canvasAPI.getSettings) saved = await window.canvasAPI.getSettings();
    } catch (err) {
      console.error('설정을 읽지 못했어요:', err);
    }
    this.settings = this.normalizeSettings(saved);
    this.applySettings();
  },

  normalizeSettings(raw) {
    const saved = raw && typeof raw === 'object' ? raw : {};
    const s = Object.assign({}, DEFAULT_SETTINGS, saved);
    // 예전(짧은) 이름도 받아 줌
    if (saved.autosave !== undefined && saved.autoSave === undefined) s.autoSave = !!saved.autosave;
    if (saved.restoreWorkspace !== undefined && saved.openLastWorkspace === undefined) s.openLastWorkspace = !!saved.restoreWorkspace;
    if (saved.grid !== undefined && saved.showGrid === undefined) s.showGrid = !!saved.grid;
    s.autoSave = !!s.autoSave;
    s.openLastWorkspace = !!s.openLastWorkspace;
    s.wallpaperMode = s.wallpaperMode !== false;
    s.showGrid = !!s.showGrid;
    s.gridSnap = !!s.gridSnap;
    s.alignGuides = s.alignGuides !== false;
    if (s.calendarView !== 'week') s.calendarView = 'month';
    s.weekStart = s.weekStart === 1 ? 1 : 0;
    if (s.groupColor !== 'custom' && !NOTE_COLORS[s.groupColor]) s.groupColor = 'yellow';
    if (!['theme', 'light', 'dark'].includes(s.boardTone)) s.boardTone = 'theme';
    if (s.noteLinkView !== 'link') s.noteLinkView = 'embed';
    if (!isHexColor(s.groupCustomColor)) s.groupCustomColor = DEFAULT_SETTINGS.groupCustomColor;
    if (!['paper', 'tape', 'pin', 'none'].includes(s.photoFrame)) s.photoFrame = 'paper';
    s.videoSound = !!s.videoSound;
    s.videoAutoplay = s.videoAutoplay !== false;
    if (s.linkStyle !== 'straight') s.linkStyle = 'curve';
    s.holidays = !!s.holidays;
    if (!HOLIDAY_REGIONS.includes(s.holidayCountry)) s.holidayCountry = DEFAULT_SETTINGS.holidayCountry;
    delete s.showMinimap;                        // 예전 이름 — 미니맵은 이제 켤 때마다 꺼진 채로
    if (s.theme !== 'dark') s.theme = 'light';
    if (!GRID_GAPS.includes(s.gridGap)) s.gridGap = DEFAULT_SETTINGS.gridGap;
    if (!NEW_NOTE_SIZES[s.noteSize]) s.noteSize = DEFAULT_SETTINGS.noteSize;
    if (s.overflow !== 'expand') s.overflow = 'wrap';
    if (s.language !== 'en') s.language = 'ko';
    if (s.noteColor !== 'random' && s.noteColor !== 'custom' && !NOTE_COLORS[s.noteColor]) s.noteColor = 'random';
    if (!isHexColor(s.noteCustomColor)) s.noteCustomColor = DEFAULT_SETTINGS.noteCustomColor;
    return s;
  },

  updateSetting(key, value) {
    if (this.settings[key] === value) return;
    this.settings[key] = value;
    this.persistSettings();
    this.applySettings(key);
  },

  persistSettings() {
    try {
      if (window.canvasAPI && window.canvasAPI.saveSettings) window.canvasAPI.saveSettings({ ...this.settings });
    } catch (err) {
      console.error('설정을 저장하지 못했어요:', err);
    }
  },

  resetSettings() {
    this.settings = { ...DEFAULT_SETTINGS };
    this.persistSettings();
    this.applySettings();
  },

  // 설정을 화면에 반영 (key 를 주면 그 설정만 바뀐 것)
  applySettings(key) {
    const s = this.settings;
    setLanguage(s.language);
    document.body.classList.toggle('theme-dark', s.theme === 'dark');
    if (!key || key === 'theme') this.updateBoardTones?.();        // 색을 정하지 않은 판은 배경 테마를 따라감 (boards.js)
    document.body.classList.toggle('overflow-expand', s.overflow === 'expand');

    if (key === 'autoSave' && s.autoSave && this.dirty) this.persist();
    if (!key || key === 'wallpaperMode') this.applyWallpaperMode();
    if (!key || key === 'linkStyle') this.requestLinks();
    if (!key || key === 'theme') window.canvasAPI?.setBackground?.(s.theme === 'dark' ? '#1F252C' : '#F5F5F5');   // 창 바탕색도 (main.js)
    if (!key || key === 'language') this.refreshTexts();
    if (!key || key === 'overflow') this.fitAllNotes();
    if (key === 'noteLinkView') this.refreshAllNoteLinks();       // 쪽지 속 주소 보기 방식 (note-links.js)
    if (!key || key === 'theme') this.refreshFallbackIcons();    // 파일 기본 그림도 밝은 · 어두운 것으로
    if (!key || key === 'holidays' || key === 'holidayCountry' || key === 'language') this.loadHolidays();
    this.draw();
    if (this.settingsOpen) this.refreshSettingsWindow();
  },

  // 바탕화면에 넣기 — 창 옮기기는 main.js 가 함 (같은 값이면 아무것도 안 함)
  //   앞으로 꺼내기 단축키는 main.js 가 비어 있는 것을 골라 잡음 → 설정 창 안내에 씀
  applyWallpaperMode() {
    const api = window.canvasAPI;
    if (!api || !api.setWallpaperMode) return;
    api.setWallpaperMode(this.settings.wallpaperMode).catch(() => {});
    if (this.popOutKey !== undefined || !api.getWallpaperState) return;
    this.popOutKey = '';
    api.getWallpaperState().then((state) => {
      this.popOutKey = String((state && state.key) || '').replace('Control', 'Ctrl').split('+').join(' + ');
      if (this.settingsOpen) this.refreshSettingsWindow();
    }).catch(() => {});
  },

  // 언어를 바꾸면 쪽지 안내 문구·시각 표시도 다시
  refreshTexts() {
    this.boards.forEach(board => this.renderBoard(board));
    this.notes.forEach(note => {
      const el = document.getElementById(note.id);
      if (!el) return;
      this.renderNoteBody(note, el);
      this.refreshNote(note, el);
      this.fitNote(note, el);
    });
  },
};

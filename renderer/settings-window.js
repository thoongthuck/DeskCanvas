// 설정 창 — 시안(설정창_미리보기.png)과 가이드 7장 그대로
//   왼쪽 사이드바 + 오른쪽 한 페이지, 누르면 그 자리로 스크롤
//   닫기: 오른쪽 위 X · Esc · 창 밖 클릭
import { ICON_DIR, NOTE_COLORS, SETTINGS_COLOR_ORDER, NEW_NOTE_SIZES, GRID_GAPS, HOLIDAY_REGIONS, ZOOM_SPEEDS } from './constants.js';
import { PHOTO_FRAMES } from './photos.js';
import { t } from './i18n.js';

const SIDEBAR = [
  { icon: 'set-general.svg', label: 'side.general', target: 'section-general' },
  { icon: 'add-image.svg', label: 'side.canvas', target: 'section-canvas' },
  { icon: 'add-file.svg', label: 'side.notes', target: 'section-notes' },
  { icon: 'add-board.svg', label: 'side.boards', target: 'section-boards' },
  { icon: 'add-video.svg', label: 'side.media', target: 'section-media' },
  { icon: 'set-theme.svg', label: 'side.theme', target: 'section-theme' },
  { icon: 'set-language.svg', label: 'side.language', target: 'section-language' },
  { icon: 'set-shortcut.svg', label: 'side.shortcuts', target: 'row-shortcuts' },
  { icon: 'set-reset.svg', label: 'side.reset', target: 'row-reset' },
];

const SHORTCUTS = [
  ['sc.undo', 'Ctrl + Z'],
  ['sc.redo', 'Ctrl + Shift + Z'],
  ['sc.save', 'Ctrl + S'],
  ['sc.paste', 'Ctrl + V'],
  ['sc.delete', 'Delete'],
  ['sc.multiSelect', 'key.ctrlClick'],
  ['sc.marquee', 'key.ctrlDrag'],
  ['sc.selectAll', 'Ctrl + A'],
  ['sc.groupFiles', 'Ctrl + G'],
  ['sc.orderStep', 'Ctrl + ]  /  Ctrl + ['],
  ['sc.orderEnd', 'Ctrl + Shift + ]  /  ['],
  ['sc.canvasMenu', 'key.dblclickEmpty'],
  ['sc.windowsMenu', 'key.rightClick'],
  ['sc.connect', 'key.altDrag'],
  ['sc.noSnap', 'key.altWhileDrag'],
  ['sc.connectSelected', 'Ctrl + L'],
  ['sc.deselect', 'Esc'],
  ['sc.rename', 'F2'],
  ['sc.popOut', 'popOutKey'],               // main.js 가 잡은 단축키 (못 잡았으면 줄을 뺌)
  ['sc.finishEdit', 'Shift + Enter'],
  ['sc.editNote', 'key.dblclick'],
  ['sc.newTodo', 'key.enterTodo'],
  ['sc.zoom', 'key.wheel'],
  ['sc.goHome', 'Ctrl + 0'],
  ['sc.search', 'Ctrl + F'],
  ['sc.minimap', 'Ctrl + M'],
  ['sc.pan', 'key.dragEmpty'],
  ['sc.closeSettings', 'Esc'],
];

export const settingsWindowMethods = {
  openSettings() {
    if (this.settingsOpen) return;
    const overlay = document.createElement('div');
    overlay.className = 'settings-overlay';
    overlay.innerHTML = `
      <div class="settings-window" role="dialog">
        <aside class="settings-sidebar">
          <div class="settings-heading">
            <img class="settings-heading-icon" src="${ICON_DIR}set-general.svg" alt="" draggable="false">
            <span class="settings-heading-text"></span>
          </div>
          <nav class="settings-nav"></nav>
        </aside>
        <div class="settings-content"></div>
        <button class="settings-close" type="button">
          <img src="${ICON_DIR}close.svg" alt="" draggable="false">
        </button>
      </div>
    `;
    overlay.addEventListener('mousedown', (e) => {                 // 창 밖을 누르면 닫기
      if (e.target === overlay) this.closeSettings();
    });
    overlay.querySelector('.settings-close').addEventListener('click', () => this.closeSettings());
    document.body.appendChild(overlay);
    this.settingsOpen = true;
    this.shortcutsOpen = false;
    this.refreshSettingsWindow();
    this.loadStartup();
  },

  closeSettings() {
    const overlay = document.querySelector('.settings-overlay');
    if (overlay) overlay.remove();
    this.closeMenus();
    this.settingsOpen = false;
    window.canvasAPI?.holdFront?.('settings', false);     // 트레이에서 열려 앞으로 꺼냈으면 다시 바탕화면 층으로 (main.js)
  },

  // 설정이 바뀌거나 언어가 바뀌면 창 안을 다시 그림
  refreshSettingsWindow() {
    if (!this.settingsOpen) return;
    const heading = document.querySelector('.settings-heading-text');
    if (heading) heading.textContent = t('set.title');
    document.querySelector('.settings-close')?.setAttribute('title', t('set.close'));
    this.buildSettingsNav();
    if (this.shortcutsOpen) this.buildShortcutScreen();
    else this.buildSettingsContent();
  },

  buildSettingsNav() {
    const nav = document.querySelector('.settings-nav');
    if (!nav) return;
    nav.innerHTML = '';
    SIDEBAR.forEach((item, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'settings-nav-item' + (index === 0 ? ' current' : '');
      btn.dataset.target = item.target;
      btn.innerHTML = `<img class="settings-nav-icon" src="${ICON_DIR}${item.icon}" alt="" draggable="false"><span></span>`;
      btn.querySelector('span').textContent = t(item.label);
      btn.addEventListener('click', () => {
        if (this.shortcutsOpen && item.target !== 'row-shortcuts') {
          this.shortcutsOpen = false;
          this.buildSettingsContent();
        }
        if (item.target === 'row-shortcuts') {
          this.shortcutsOpen = true;
          this.buildShortcutScreen();
          this.markNav(item.target);
          return;
        }
        const content = document.querySelector('.settings-content');
        const target = document.getElementById(item.target);
        if (!content || !target) return;
        this.navLockUntil = Date.now() + 700;
        this.markNav(item.target);
        content.scrollTo({ top: Math.max(0, target.offsetTop - 8), behavior: 'smooth' });
      });
      nav.appendChild(btn);
    });
  },

  markNav(target) {
    document.querySelectorAll('.settings-nav-item').forEach(b => b.classList.toggle('current', b.dataset.target === target));
  },

  // 스크롤에 맞춰 사이드바 선택이 따라가게
  syncSettingsNav() {
    const content = document.querySelector('.settings-content');
    if (!content || this.shortcutsOpen || Date.now() < (this.navLockUntil || 0)) return;
    let current = SIDEBAR[0].target;
    SIDEBAR.forEach(item => {
      const el = document.getElementById(item.target);
      if (el && el.offsetTop - 12 <= content.scrollTop) current = item.target;
    });
    this.markNav(current);
  },

  buildSettingsContent() {
    const content = document.querySelector('.settings-content');
    if (!content) return;
    const s = this.settings;
    content.innerHTML = '';
    content.onscroll = () => this.syncSettingsNav();

    const section = (id, icon, labelKey) => {
      const sec = document.createElement('section');
      sec.className = 'settings-section';
      sec.id = id;
      const head = document.createElement('h2');
      head.className = 'settings-section-head';
      head.innerHTML = `<img class="settings-section-icon" src="${ICON_DIR}${icon}" alt="" draggable="false"><span></span>`;
      head.querySelector('span').textContent = t(labelKey);
      sec.appendChild(head);
      content.appendChild(sec);
      return sec;
    };

    const row = (parent, id, titleKey, descKey, control) => {
      const el = document.createElement('div');
      el.className = 'settings-row';
      el.id = id;
      const text = document.createElement('div');
      text.className = 'settings-row-text';
      const title = document.createElement('div');
      title.className = 'settings-row-title';
      title.textContent = t(titleKey);
      const desc = document.createElement('div');
      desc.className = 'settings-row-desc';
      desc.textContent = t(descKey);
      text.append(title, desc);
      const box = document.createElement('div');
      box.className = 'settings-row-control';
      if (control) box.appendChild(control);
      el.append(text, box);
      parent.appendChild(el);
      return el;
    };

    // 일반
    const general = section('section-general', 'set-general.svg', 'sec.general');
    row(general, 'row-autosave', 'row.autoSave', 'row.autoSave.desc',
      this.buildToggle(s.autoSave, (on) => this.updateSetting('autoSave', on), 'autosave'));
    row(general, 'row-openlast', 'row.openLast', 'row.openLast.desc',
      this.buildToggle(s.openLastWorkspace, (on) => this.updateSetting('openLastWorkspace', on), 'openlast'));
    const startupRow = row(general, 'row-startup', 'row.startup', 'row.startup.desc',
      this.buildToggle(!!(this.startup && this.startup.on), (on) => this.setStartup(on), 'startup'));
    if (this.startup && !this.startup.available) startupRow.hidden = true;
    const wallpaperRow = row(general, 'row-wallpaper', 'row.wallpaper', 'row.wallpaper.desc',
      this.buildToggle(s.wallpaperMode, (on) => this.updateSetting('wallpaperMode', on), 'wallpaper'));
    if (this.popOutKey) {
      wallpaperRow.querySelector('.settings-row-desc').textContent += ' ' + t('row.wallpaper.key', { key: this.popOutKey });
    }
    row(general, 'row-desktopbg', 'row.desktopBg', 'row.desktopBg.desc',
      this.buildToggle(s.desktopBackground, (on) => this.updateSetting('desktopBackground', on), 'desktopbg'));
    row(general, 'row-sleep', 'row.sleep', 'row.sleep.desc',
      this.buildDropdown([0, 1, 5, 15, 30].map(m => ({ label: t(m ? 'sleep.minutes' : 'sleep.off', { n: m }), value: m })), s.sleepAfter,
        (v) => this.updateSetting('sleepAfter', Number(v)), 'sleep'));

    // 캔버스
    const canvas = section('section-canvas', 'add-image.svg', 'sec.canvas');
    row(canvas, 'row-grid', 'row.grid', 'row.grid.desc',
      this.buildToggle(s.showGrid, (on) => this.updateSetting('showGrid', on), 'grid'));
    row(canvas, 'row-align', 'row.align', 'row.align.desc',
      this.buildToggle(s.alignGuides, (on) => this.updateSetting('alignGuides', on), 'align'));
    row(canvas, 'row-linkstyle', 'row.linkStyle', 'row.linkStyle.desc',
      this.buildDropdown([
        { label: t('linkStyle.curve'), value: 'curve' },
        { label: t('linkStyle.straight'), value: 'straight' },
      ], s.linkStyle, (v) => this.updateSetting('linkStyle', v), 'linkstyle'));
    row(canvas, 'row-gridgap', 'row.gridGap', 'row.gridGap.desc',
      this.buildDropdown(GRID_GAPS.map(g => ({ label: `${g} px`, value: g })), s.gridGap,
        (v) => this.updateSetting('gridGap', v), 'gridgap'));
    row(canvas, 'row-lockview', 'row.lockView', 'row.lockView.desc',
      this.buildToggle(s.lockView, (on) => this.updateSetting('lockView', on), 'lockview'));
    row(canvas, 'row-zoomspeed', 'row.zoomSpeed', 'row.zoomSpeed.desc',
      this.buildDropdown(Object.keys(ZOOM_SPEEDS).map(k => ({ label: t(`zoomSpeed.${k}`), value: k })), s.zoomSpeed,
        (v) => this.updateSetting('zoomSpeed', v), 'zoomspeed'));

    // 쪽지
    const notes = section('section-notes', 'add-file.svg', 'sec.notes');
    row(notes, 'row-notecolor', 'row.noteColor', 'row.noteColor.desc', this.buildColorDots());
    row(notes, 'row-groupcolor', 'row.groupColor', 'row.groupColor.desc',
      this.buildColorDots({ key: 'groupColor', customKey: 'groupCustomColor', random: false }));
    row(notes, 'row-notelinks', 'row.noteLinks', 'row.noteLinks.desc',
      this.buildDropdown(['embed', 'link'].map(v => ({ label: t(`linkView.${v}`), value: v })), s.noteLinkView,
        (v) => this.updateSetting('noteLinkView', v), 'notelinks'));
    row(notes, 'row-notesize', 'row.noteSize', 'row.noteSize.desc',
      this.buildDropdown(Object.keys(NEW_NOTE_SIZES).map(key => ({
        label: `${t(`size.${key}`)} (${NEW_NOTE_SIZES[key].width} × ${NEW_NOTE_SIZES[key].height})`, value: key,
      })), s.noteSize, (v) => this.updateSetting('noteSize', v), 'notesize'));
    row(notes, 'row-overflow', 'row.overflow', 'row.overflow.desc',
      this.buildDropdown([
        { label: t('overflow.wrap'), value: 'wrap' },
        { label: t('overflow.expand'), value: 'expand' },
      ], s.overflow, (v) => this.updateSetting('overflow', v), 'overflow'));

    // 판 — 캘린더 · 연대표 · 파일 묶음
    const boards = section('section-boards', 'add-board.svg', 'sec.boards');
    row(boards, 'row-boardtone', 'row.boardTone', 'row.boardTone.desc',
      this.buildDropdown(['theme', 'light', 'dark'].map(v => ({ label: t(`boardTone.${v}`), value: v })), s.boardTone,
        (v) => this.updateSetting('boardTone', v), 'boardtone'));
    row(boards, 'row-calview', 'row.calendarView', 'row.calendarView.desc',
      this.buildDropdown([
        { label: t('calView.month'), value: 'month' },
        { label: t('calView.week'), value: 'week' },
      ], s.calendarView, (v) => this.updateSetting('calendarView', v), 'calview'));
    row(boards, 'row-weekstart', 'row.weekStart', 'row.weekStart.desc',
      this.buildDropdown([
        { label: t('weekStart.sun'), value: 0 },
        { label: t('weekStart.mon'), value: 1 },
      ], s.weekStart, (v) => this.updateSetting('weekStart', v), 'weekstart'));
    row(boards, 'row-holidays', 'row.holidays', 'row.holidays.desc',
      this.buildToggle(s.holidays, (on) => this.updateSetting('holidays', on), 'holidays'));
    row(boards, 'row-holidaycountry', 'row.holidayCountry', 'row.holidayCountry.desc',
      this.buildDropdown(HOLIDAY_REGIONS.map(r => ({ label: t(`region.${r}`), value: r })), s.holidayCountry,
        (v) => this.updateSetting('holidayCountry', v), 'holidaycountry'));

    // 사진 · 영상
    const media = section('section-media', 'add-video.svg', 'sec.media');
    row(media, 'row-photoframe', 'row.photoFrame', 'row.photoFrame.desc',
      this.buildDropdown(['paper', 'tape', 'pin', 'none'].filter(f => PHOTO_FRAMES.includes(f)).map(f => ({ label: t(`frame.${f}`), value: f })),
        s.photoFrame, (v) => this.updateSetting('photoFrame', v), 'photoframe'));
    row(media, 'row-videoautoplay', 'row.videoAutoplay', 'row.videoAutoplay.desc',
      this.buildToggle(s.videoAutoplay, (on) => this.updateSetting('videoAutoplay', on), 'videoautoplay'));
    row(media, 'row-videosound', 'row.videoSound', 'row.videoSound.desc',
      this.buildToggle(s.videoSound, (on) => this.updateSetting('videoSound', on), 'videosound'));

    // 테마
    const theme = section('section-theme', 'set-theme.svg', 'sec.theme');
    row(theme, 'row-theme', 'row.theme', 'row.theme.desc', this.buildThemeButtons(s.theme)).classList.add('tall');

    // 언어
    const language = section('section-language', 'set-language.svg', 'sec.language');
    row(language, 'row-language', 'row.language', 'row.language.desc',
      this.buildDropdown([{ label: '한국어', value: 'ko' }, { label: 'English', value: 'en' }], s.language,
        (v) => this.updateSetting('language', v), 'language'));

    // 기타
    const etc = section('section-etc', 'set-etc.svg', 'sec.etc');
    const arrow = document.createElement('img');
    arrow.className = 'set-link-arrow';
    arrow.src = `${ICON_DIR}chevron.svg`;
    arrow.alt = '';
    arrow.draggable = false;
    const shortcutRow = row(etc, 'row-shortcuts', 'row.shortcuts', 'row.shortcuts.desc', arrow);
    shortcutRow.classList.add('link');
    shortcutRow.addEventListener('click', () => {
      this.shortcutsOpen = true;
      this.buildShortcutScreen();
      this.markNav('row-shortcuts');
    });

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'set-reset-button';
    resetBtn.innerHTML = `<img src="${ICON_DIR}reset-danger.svg" alt="" draggable="false"><span></span>`;
    resetBtn.querySelector('span').textContent = t('reset.button');
    resetBtn.addEventListener('click', () => {
      // 한 번 더 확인 (팝업 메뉴 틀)
      this.openDropdown(resetBtn, [
        { label: t('reset.button'), value: 'yes' },
        { label: t('quit.cancel'), value: 'no' },
      ], (picked) => { if (picked === 'yes') this.resetSettings(); });
    });
    row(etc, 'row-reset', 'row.reset', 'row.reset.desc', resetBtn);

    // 마지막 분류도 사이드바로 눌렀을 때 맨 위까지 올라오도록 아래쪽 여백
    const spacer = document.createElement('div');
    spacer.className = 'settings-spacer';
    content.appendChild(spacer);
    requestAnimationFrame(() => {
      const last = etc.offsetHeight;
      spacer.style.height = `${Math.max(0, content.clientHeight - last - 24)}px`;
    });
  },

  // 단축키 안내 화면 (시안에 없어 같은 모양으로 만듦)
  buildShortcutScreen() {
    const content = document.querySelector('.settings-content');
    if (!content) return;
    content.innerHTML = '';
    content.onscroll = null;

    const back = document.createElement('div');
    back.className = 'settings-section-head settings-back';
    back.innerHTML = `<img class="settings-back-arrow" src="${ICON_DIR}chevron.svg" alt="" draggable="false"><span></span>`;
    back.querySelector('span').textContent = t('row.shortcuts');
    back.addEventListener('click', () => {
      this.shortcutsOpen = false;
      this.buildSettingsContent();
      this.markNav('section-general');
    });
    content.appendChild(back);

    SHORTCUTS.forEach(([labelKey, keys]) => {
      if (keys === 'popOutKey') {
        if (!this.popOutKey) return;
        keys = this.popOutKey;
      }
      const line = document.createElement('div');
      line.className = 'settings-row';
      const text = document.createElement('div');
      text.className = 'settings-row-text';
      const title = document.createElement('div');
      title.className = 'settings-row-title';
      title.textContent = t(labelKey);
      text.appendChild(title);
      const box = document.createElement('div');
      box.className = 'settings-row-control';
      const value = document.createElement('div');
      value.className = 'settings-row-desc';
      value.textContent = keys.includes('.') ? t(keys) : keys;
      box.appendChild(value);
      line.append(text, box);
      content.appendChild(line);
    });
  },

  // ---- 시작 앱 (윈도우에 로그인하면 켜기, main.js) — settings.json 이 아니라 윈도우에 등록된 것을 그대로 보여 줌 ----
  //   윈도우 설정 · 작업 관리자에서 바꿨을 수도 있어 설정 창을 열 때마다 물어봄
  loadStartup() {
    const api = window.canvasAPI;
    if (!api || !api.getStartup) return;
    api.getStartup().then((state) => this.showStartup(state)).catch(() => {});
  },

  setStartup(on) {
    const api = window.canvasAPI;
    if (!api || !api.setStartup) return;
    api.setStartup(on).then((state) => this.showStartup(state)).catch(() => this.loadStartup());
  },

  // 설정 창의 시작 앱 줄을 지금 상태로 (못 바꿨으면 스위치도 되돌아감)
  showStartup(state) {
    this.startup = state || null;
    const rowEl = document.getElementById('row-startup');
    if (!rowEl || !this.startup) return;
    rowEl.hidden = !this.startup.available;
    const btn = rowEl.querySelector('.set-toggle');
    if (!btn) return;
    btn.classList.toggle('on', !!this.startup.on);
    btn.setAttribute('aria-pressed', String(!!this.startup.on));
  },

  // 켜기/끄기
  buildToggle(on, onChange, key = '') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'set-toggle' + (on ? ' on' : '');
    if (key) btn.dataset.setting = key;
    btn.setAttribute('aria-pressed', String(!!on));
    btn.innerHTML = '<span class="set-toggle-knob"></span>';
    btn.addEventListener('click', () => {
      const next = !btn.classList.contains('on');
      btn.classList.toggle('on', next);
      btn.setAttribute('aria-pressed', String(next));
      onChange(next);
    });
    return btn;
  },

  // 밝게 / 어둡게
  buildThemeButtons(theme) {
    const box = document.createElement('div');
    box.className = 'set-theme-buttons';
    [['light', 'theme-light.svg'], ['dark', 'theme-dark.svg']].forEach(([value, icon]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'set-theme-button' + (theme === value ? ' current' : '');
      btn.dataset.setting = `theme-${value}`;
      btn.dataset.value = value;
      btn.innerHTML = `<img src="${ICON_DIR}${icon}" alt="" draggable="false"><span></span>`;
      btn.querySelector('span').textContent = t(`theme.${value}`);
      btn.addEventListener('click', () => {
        box.querySelectorAll('.set-theme-button').forEach(b => b.classList.toggle('current', b === btn));
        this.updateSetting('theme', value);
      });
      box.appendChild(btn);
    });
    return box;
  },

  // 드롭다운
  buildDropdown(options, value, onChange, key = '') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'set-dropdown';
    if (key) btn.dataset.setting = key;
    const current = options.find(o => o.value === value) || options[0];
    btn.innerHTML = `<span class="set-dropdown-label"></span>
      <img class="set-dropdown-arrow" src="${ICON_DIR}chevron-down.svg" alt="" draggable="false">`;
    btn.querySelector('.set-dropdown-label').textContent = current ? current.label : '';
    btn.addEventListener('click', () => {
      this.openDropdown(btn, options.map(o => ({ ...o, current: o.value === value })), (picked) => {
        const next = options.find(o => o.value === picked);
        if (next) btn.querySelector('.set-dropdown-label').textContent = next.label;
        onChange(picked);
      });
    });
    return btn;
  },

  // 기본 색상 점 — 쪽지: 랜덤 + 6색 + 직접 고르기(RGB), 파일 묶음: 6색 + 직접 고르기
  //   key: 설정 이름 (noteColor · groupColor), customKey: 직접 고른 색 (noteCustomColor · groupCustomColor)
  buildColorDots({ key = 'noteColor', customKey = 'noteCustomColor', random = true } = {}) {
    const box = document.createElement('div');
    box.className = 'set-color-dots';
    const s = this.settings;

    if (random) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'set-dot random-dot' + (s[key] === 'random' ? ' current' : '');
      dot.title = t('color.random');
      dot.addEventListener('click', () => this.updateSetting(key, 'random'));
      box.appendChild(dot);
    }

    SETTINGS_COLOR_ORDER.forEach(color => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'set-dot' + (s[key] === color ? ' current' : '');
      dot.dataset.color = color;
      dot.title = t(`color.${color}`);
      dot.style.background = NOTE_COLORS[color].dot;
      dot.addEventListener('click', () => this.updateSetting(key, color));
      box.appendChild(dot);
    });

    box.appendChild(this.createCustomColorDot({
      className: 'set-dot',
      current: s[key] === 'custom',
      value: s[customKey],
      onInput: (hex) => {
        this.settings[customKey] = hex;
        this.settings[key] = 'custom';
        this.persistSettings();
      },
      onDone: () => this.refreshSettingsWindow(),
    }));
    return box;
  },
};

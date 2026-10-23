// 설정 창 — 시안(설정창_미리보기.png)과 가이드 7장 그대로
//   왼쪽 사이드바 + 오른쪽 한 페이지, 누르면 그 자리로 스크롤
//   닫기: 오른쪽 위 X · Esc · 창 밖 클릭
import { ICON_DIR, NOTE_COLORS, SETTINGS_COLOR_ORDER, NEW_NOTE_SIZES, GRID_GAPS, HOLIDAY_REGIONS, ZOOM_SPEEDS, CALENDAR_BANDS, LINK_WIDTH_ORDER } from './constants.js';
import { PHOTO_FRAMES } from './photos.js';
import { t } from './i18n.js';
import { BG_COLORS, BG_FITS, BG_INTERVALS } from './background.js';
import { SHORTCUT_ACTIONS, comboOf, comboLabel } from './shortcuts.js';

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

// 설정 › 단축키 목록 — 할 일 이름(문자열)은 바꿀 수 있는 단축키 (shortcuts.js — 줄을 누르고 새 키), [이름, 키] 는 그대로인 것
const SHORTCUTS = [
  'undo', 'redo', 'save',
  ['sc.paste', 'Ctrl + V'],
  'delete',
  ['sc.multiSelect', 'key.ctrlClick'],
  ['sc.marquee', 'key.ctrlDrag'],
  'selectAll', 'groupFiles', 'forward', 'backward', 'front', 'back',
  ['sc.canvasMenu', 'key.dblclickEmpty'],
  ['sc.windowsMenu', 'key.rightClick'],
  ['sc.connect', 'key.altDrag'],
  ['sc.noSnap', 'key.altWhileDrag'],
  'connect', 'lock',
  ['sc.deselect', 'Esc'],
  'rename',
  ['sc.popOut', 'popOutKey'],               // main.js 가 잡은 단축키 (못 잡았으면 줄을 뺌)
  ['sc.finishEdit', 'Shift + Enter'],
  ['sc.editNote', 'key.dblclick'],
  ['sc.newTodo', 'key.enterTodo'],
  ['sc.tableNext', 'key.tabTable'],
  ['sc.tableNewline', 'key.altEnterTable'],
  ['sc.textStyle', 'key.ctrlBIU'],
  ['sc.zoom', 'key.wheel'],
  'home', 'setHome',
  ['sc.goSpot', 'Ctrl + 1 ~ 9'],
  ['sc.saveSpot', 'Ctrl + Alt + 1 ~ 9'],
  'search', 'minimap',
  ['sc.pan', 'key.dragEmpty'],
  'settings',
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
    this.stopShortcutCapture();                           // 단축키 바꾸기 기다리는 중이었으면 그만
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
    const keepScroll = content.scrollTop;            // 다시 그려도 보던 자리 그대로 (사진을 넣거나 설정을 바꾼 뒤)
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
    row(canvas, 'row-linkwidth', 'row.linkWidth', 'row.linkWidth.desc',
      this.buildDropdown(LINK_WIDTH_ORDER.map(key => ({ label: t(`linkWidth.${key}`), value: key })),
        s.linkWidth, (v) => this.updateSetting('linkWidth', v), 'linkwidth'));
    row(canvas, 'row-gridgap', 'row.gridGap', 'row.gridGap.desc',
      this.buildDropdown(GRID_GAPS.map(g => ({ label: `${g} px`, value: g })), s.gridGap,
        (v) => this.updateSetting('gridGap', v), 'gridgap'));
    row(canvas, 'row-lockview', 'row.lockView', 'row.lockView.desc',
      this.buildToggle(s.lockView, (on) => this.updateSetting('lockView', on), 'lockview'));
    row(canvas, 'row-zoomspeed', 'row.zoomSpeed', 'row.zoomSpeed.desc',
      this.buildDropdown(Object.keys(ZOOM_SPEEDS).map(k => ({ label: t(`zoomSpeed.${k}`), value: k })), s.zoomSpeed,
        (v) => this.updateSetting('zoomSpeed', v), 'zoomspeed'));
    // 저장한 자리 (Ctrl + Alt + 숫자) — 자리마다 가기 · 지우기 (바탕 사진은 테마 칸 — 저장한 자리 바탕 사진)
    const savedSpots = Object.keys(this.spots || {}).sort();
    if (!savedSpots.length) row(canvas, 'row-spots', 'row.spotsEmpty', 'row.spotsEmpty.desc', null);
    savedSpots.forEach(n => {
      const el = row(canvas, `row-spot-${n}`, 'row.spot', 'row.spot.desc', this.buildSpotButtons(n));
      el.querySelector('.settings-row-title').textContent = t('row.spot', { n });
      el.querySelector('.settings-row-desc').textContent = t('row.spot.desc', { n });
    });

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
    row(boards, 'row-calband', 'row.calendarBand', 'row.calendarBand.desc',
      this.buildDropdown(Object.keys(CALENDAR_BANDS).map(v => ({ label: t(`band.${v}`), value: v })), s.calendarBand,
        (v) => this.updateSetting('calendarBand', v), 'calband'));
    row(boards, 'row-tlscale', 'row.timelineScale', 'row.timelineScale.desc',
      this.buildDropdown(['year', 'month', 'day'].map(v => ({ label: t(`scale.${v}`), value: v })), s.timelineScale,
        (v) => this.updateSetting('timelineScale', v), 'tlscale'));
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
    // 캔버스 바탕 — 테마 색 · 직접 고른 색 · 사진 (background.js). 고른 것에 맞는 줄만 보임
    const images = s.bgImages || [];
    const bgKind = s.bgKind === 'image' && images.length ? 'image' : s.bgKind === 'color' ? 'color' : 'theme';
    const kindBox = document.createElement('div');                   // [윈도우 배경 화면 가져오기] [테마 색 ⌄]
    kindBox.className = 'set-bg-kind';
    const fromWindows = document.createElement('button');
    fromWindows.type = 'button';
    fromWindows.className = 'set-mini-button';
    fromWindows.textContent = t('bgKind.fromWindows');
    fromWindows.title = t('bgKind.fromWindows.title');
    fromWindows.addEventListener('click', () => this.importWindowsWallpaper());
    kindBox.append(fromWindows, this.buildDropdown(['theme', 'color', 'image'].map(v => ({ label: t(`bgKind.${v}`), value: v })), bgKind,
      (v) => this.setBackgroundKind(v), 'bgkind'));
    row(theme, 'row-bgkind', 'row.bgKind', 'row.bgKind.desc', kindBox);
    row(theme, 'row-bgcolor', 'row.bgColor', bgKind === 'image' ? 'row.bgColor.photoDesc' : 'row.bgColor.desc',
      this.buildBackgroundDots()).hidden = bgKind === 'theme';
    row(theme, 'row-bgimage', 'row.bgImage', 'row.bgImage.desc', this.buildBackgroundStrip()).hidden = bgKind !== 'image';
    row(theme, 'row-bginterval', 'row.bgInterval', 'row.bgInterval.desc',
      this.buildDropdown(BG_INTERVALS.map(v => ({ label: t(`bgInterval.${v}`), value: v })), s.bgInterval,
        (v) => this.updateSetting('bgInterval', Number(v)), 'bginterval')).hidden = bgKind !== 'image' || images.length < 2;
    row(theme, 'row-bgorder', 'row.bgOrder', 'row.bgOrder.desc',
      this.buildDropdown(['order', 'shuffle'].map(v => ({ label: t(`bgOrder.${v}`), value: v })), s.bgOrder,
        (v) => this.updateSetting('bgOrder', v), 'bgorder')).hidden = bgKind !== 'image' || images.length < 2 || !s.bgInterval;
    row(theme, 'row-bgmove', 'row.bgMove', 'row.bgMove.desc',
      this.buildDropdown(['screen', 'canvas'].map(v => ({ label: t(`bgMove.${v}`), value: v })), s.bgMove,
        (v) => this.updateSetting('bgMove', v), 'bgmove')).hidden = bgKind !== 'image';
    row(theme, 'row-bgfit', 'row.bgFit', 'row.bgFit.desc',
      this.buildDropdown(BG_FITS.map(v => ({ label: t(`bgFit.${v}`), value: v })), s.bgFit,
        (v) => this.updateSetting('bgFit', v), 'bgfit')).hidden = bgKind !== 'image' || s.bgMove === 'canvas';
    // 저장한 자리 바탕 사진 — 머리 줄을 누르면 접었다 폄 (펼친 채인지는 창을 다시 그려도 그대로 — spotBgOpen)
    //   자리마다 사진 고르기 · 윈도우 배경 화면 · 빼기 (background.js). 가기 · 지우기는 캔버스 칸의 저장한 자리 목록에
    const spotIds = Object.keys(this.spots || {}).sort();
    const foldArrow = document.createElement('img');
    foldArrow.className = 'set-link-arrow';
    foldArrow.src = `${ICON_DIR}chevron.svg`;
    foldArrow.alt = '';
    foldArrow.draggable = false;
    const fold = row(theme, 'row-spotbg', 'row.spotBg', 'row.spotBg.desc', foldArrow);
    fold.classList.add('link', 'fold-head');
    fold.classList.toggle('open', !!this.spotBgOpen);
    fold.querySelector('.settings-row-desc').textContent = t('row.spotBg.desc', { n: spotIds.length, m: spotIds.filter(n => this.spots[n].bg).length });
    const subRows = [];
    if (!spotIds.length) subRows.push(row(theme, 'row-spotbg-empty', 'row.spotsEmpty', 'row.spotBgEmpty.desc', null));
    spotIds.forEach(n => {
      const spot = this.spots[n];
      const el = row(theme, `row-spotbg-${n}`, 'row.spot', 'row.spotBgItem.desc', this.buildSpotBgButtons(n));
      el.querySelector('.settings-row-title').textContent = t('row.spot', { n });
      el.querySelector('.settings-row-desc').textContent = t('row.spotBgItem.desc', { bg: (spot.bg && spot.bg.name) || t('spot.noBg') });
      subRows.push(el);
    });
    subRows.forEach(el => { el.classList.add('sub'); el.hidden = !this.spotBgOpen; });
    fold.addEventListener('click', () => {
      this.spotBgOpen = !this.spotBgOpen;
      fold.classList.toggle('open', this.spotBgOpen);
      subRows.forEach(el => { el.hidden = !this.spotBgOpen; });
    });

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
    // 자동 업데이트 — 켜 두면 새 버전을 스스로 받아 둠. 설명 줄에 지금 버전 · 상태, 단추로 지금 확인 · 설치 (paintUpdateRow)
    const updateBox = document.createElement('div');
    updateBox.className = 'set-update';
    const updateBtn = document.createElement('button');
    updateBtn.type = 'button';
    updateBtn.className = 'set-update-button';
    updateBtn.addEventListener('click', () => {
      const api = window.canvasAPI;
      if (!api) return;
      if (this.updateInfo && this.updateInfo.status === 'ready') api.installUpdate();
      else api.checkUpdate();
    });
    updateBox.append(updateBtn, this.buildToggle(s.autoUpdate, (on) => this.updateSetting('autoUpdate', on), 'autoupdate'));
    row(etc, 'row-update', 'row.update', 'update.idle', updateBox);
    this.paintUpdateRow();
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
    content.scrollTop = keepScroll;
    requestAnimationFrame(() => {
      const last = etc.offsetHeight;
      spacer.style.height = `${Math.max(0, content.clientHeight - last - 24)}px`;
      content.scrollTop = keepScroll;
    });
  },

  // 자동 업데이트 상태가 바뀜 (main.js → app.js) — 설정 창이 열려 있으면 그 줄만 다시, 새 판을 다 받았으면 한 번 알림
  onUpdateState(state) {
    const before = this.updateInfo;
    this.updateInfo = state;
    this.paintUpdateRow();
    if (state && state.status === 'ready' && !(before && before.status === 'ready')) this.showToast(t('update.readyToast', { v: state.next }));
  },

  // 설정 › 기타 › 자동 업데이트 줄 — 지금 버전 · 상태 글, 단추 (지금 확인 / 다시 시작해서 설치)
  paintUpdateRow() {
    const el = document.getElementById('row-update');
    if (!el) return;
    const info = this.updateInfo || { status: 'unsupported', current: '' };
    const status = ['unsupported', 'off', 'checking', 'latest', 'downloading', 'ready', 'error'].includes(info.status) ? info.status : 'idle';
    const text = t(`update.${status}`, { v: info.next || '', p: info.percent || 0 });
    el.querySelector('.settings-row-desc').textContent = [info.current ? t('update.version', { v: info.current }) : '', text].filter(Boolean).join(' — ');
    const btn = el.querySelector('.set-update-button');
    btn.hidden = status === 'unsupported';
    btn.disabled = status === 'checking' || status === 'downloading';
    btn.classList.toggle('ready', status === 'ready');
    btn.textContent = t(status === 'ready' ? 'update.install' : 'update.check');
  },

  // 단축키 화면 (시안에 없어 같은 모양으로 만듦) — 바꿀 수 있는 줄은 키 단추를 누르고 새 키를 누르면 바뀜 (shortcuts.js)
  //   바꾼 줄에는 ↺ (처음 키로), 맨 위에 '모두 처음대로'. 그대로인 줄(마우스 · Esc · 붙여넣기 …)은 키 글자만
  buildShortcutScreen() {
    const content = document.querySelector('.settings-content');
    if (!content) return;
    this.stopShortcutCapture();
    const keepScroll = content.scrollTop;            // 키를 바꿔 다시 그려도 보던 자리 그대로
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

    const line = (labelKey, control) => {
      const el = document.createElement('div');
      el.className = 'settings-row';
      const text = document.createElement('div');
      text.className = 'settings-row-text';
      const title = document.createElement('div');
      title.className = 'settings-row-title';
      title.textContent = t(labelKey);
      text.appendChild(title);
      const box = document.createElement('div');
      box.className = 'settings-row-control';
      box.append(...[].concat(control));
      el.append(text, box);
      content.appendChild(el);
      return el;
    };

    // 안내 · 모두 처음대로
    const resetAll = document.createElement('button');
    resetAll.type = 'button';
    resetAll.className = 'set-mini-button';
    resetAll.textContent = t('shortcut.resetAll');
    resetAll.disabled = !Object.keys(this.settings.shortcuts || {}).length;
    resetAll.addEventListener('click', () => this.resetShortcut());
    const intro = line('shortcut.intro', resetAll);
    intro.classList.add('shortcut-intro');
    const introDesc = document.createElement('div');
    introDesc.className = 'settings-row-desc';
    introDesc.textContent = t('shortcut.intro.desc');
    intro.querySelector('.settings-row-text').appendChild(introDesc);

    SHORTCUTS.forEach(entry => {
      if (typeof entry === 'string') {                               // 바꿀 수 있는 것
        const action = SHORTCUT_ACTIONS[entry];
        const keys = this.shortcutKeys(entry);
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'set-key-chip';
        chip.textContent = keys.length ? keys.map(comboLabel).join('  /  ') : t('shortcut.none');
        chip.title = t('shortcut.change');
        chip.addEventListener('click', () => this.startShortcutCapture(entry, chip));
        const parts = [chip];
        if (Array.isArray((this.settings.shortcuts || {})[entry])) {   // 바꾼 것 — 처음 키로
          const undo = document.createElement('button');
          undo.type = 'button';
          undo.className = 'set-key-reset';
          undo.textContent = '↺';
          undo.title = t('shortcut.reset', { keys: action.keys.map(comboLabel).join(' / ') });
          undo.addEventListener('click', () => this.resetShortcut(entry));
          parts.unshift(undo);
        }
        line(action.label, parts).classList.add('shortcut-editable');
        return;
      }
      let [labelKey, keys] = entry;                                 // 그대로인 것
      if (keys === 'popOutKey') {
        if (!this.popOutKey) return;
        keys = this.popOutKey;
      }
      const value = document.createElement('div');
      value.className = 'settings-row-desc';
      value.textContent = keys.includes('.') ? t(keys) : keys;
      line(labelKey, value);
    });
    content.scrollTop = keepScroll;
  },

  // 키 단추를 누름 — 다음에 누르는 키로 바꿈 (Esc: 그만 · 꾸밈 키만 누르면 마저 기다림). 안 되는 키면 알리고 계속 기다림
  //   문서 전체의 키를 먼저 받아서 (잡기 단계) 캔버스 단축키 · 설정 창 닫기(Esc)로 가지 않게
  startShortcutCapture(id, chip) {
    this.stopShortcutCapture();
    const before = chip.textContent;
    chip.classList.add('capturing');
    chip.textContent = t('shortcut.press');
    const onKey = (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        this.buildShortcutScreen();                                  // 그만 — 원래 키 글자로
        return;
      }
      const result = this.setShortcut(id, comboOf(e));
      if (result.error) {
        this.showToast(t(result.error, { key: comboLabel(comboOf(e)) }));
        return;
      }
      if (result.other) this.showToast(t('shortcut.moved', { key: comboLabel(comboOf(e)), other: t(SHORTCUT_ACTIONS[result.other].label) }));
      // 설정이 바뀌어 화면을 다시 그림 (settings.js applySettings → refreshSettingsWindow) — 기다리기도 거기서 끝남
    };
    const stopOutside = (e) => {                                      // 다른 곳을 누르면 그만 (다른 키 단추면 그 단추가 이어서 기다림)
      if (e.target === chip) return;
      this.stopShortcutCapture();
      chip.classList.remove('capturing');
      chip.textContent = before;
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', stopOutside, true);
    this.shortcutCapture = { onKey, stopOutside };
  },

  stopShortcutCapture() {
    const c = this.shortcutCapture;
    if (!c) return;
    document.removeEventListener('keydown', c.onKey, true);
    document.removeEventListener('mousedown', c.stopOutside, true);
    this.shortcutCapture = null;
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

  // 캔버스 바탕색 점 — 고른 색 6가지 + 직접 고르기 (background.js BG_COLORS)
  buildBackgroundDots() {
    const box = document.createElement('div');
    box.className = 'set-color-dots';
    const s = this.settings;
    const now = String(s.bgColor || '').toUpperCase();
    BG_COLORS.forEach(hex => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'set-dot bg-dot' + (now === hex ? ' current' : '');
      dot.style.background = hex;
      dot.title = hex;
      dot.addEventListener('click', () => this.updateSetting('bgColor', hex));
      box.appendChild(dot);
    });
    box.appendChild(this.createCustomColorDot({
      className: 'set-dot',
      current: !BG_COLORS.includes(now),
      value: now || BG_COLORS[0],
      onInput: (hex) => {
        this.settings.bgColor = hex;
        this.persistSettings();
        this.applyBackground();                              // 고르는 동안 바로 보이게 (설정 창은 다 고른 뒤 다시 그림)
      },
      onDone: () => this.refreshSettingsWindow(),
    }));
    return box;
  },

  // 바탕 사진 줄 — 넣은 사진의 작은 그림들 (누르면 지금 바탕 · ✕ 로 빼기) + '+' (여러 장 넣기 — background.js)
  buildBackgroundStrip() {
    const s = this.settings;
    const box = document.createElement('div');
    box.className = 'set-bg-strip';
    (s.bgImages || []).forEach((image, i) => {
      const thumb = document.createElement('button');
      thumb.type = 'button';
      thumb.className = 'set-bg-thumb' + (s.bgKind === 'image' && (s.bgIndex | 0) === i ? ' current' : '');
      thumb.style.backgroundImage = `url("${String(image.thumb || image.url).replace(/"/g, '%22')}")`;
      thumb.title = image.name || '';
      thumb.addEventListener('click', () => this.selectBackgroundImage(i));
      const x = document.createElement('span');
      x.className = 'set-bg-x';
      x.textContent = '×';
      x.title = t('bgImage.remove');
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeBackgroundImage(i);
      });
      thumb.appendChild(x);
      box.appendChild(thumb);
    });
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'set-bg-add';
    add.textContent = '+';
    add.title = t('bgImage.add');
    add.addEventListener('click', () => this.addBackgroundImages());
    box.appendChild(add);
    return box;
  },

  // 저장한 자리 줄의 단추 — 가기 · 바탕 사진… · 사진 빼기(있으면) · 지우기
  buildSpotButtons(n) {
    const box = document.createElement('div');
    box.className = 'set-spot-buttons';
    const button = (key, onClick) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'set-mini-button';
      btn.textContent = t(key);
      btn.addEventListener('click', onClick);
      box.appendChild(btn);
    };
    button('spot.go', () => { this.closeSettings(); this.goToSpot(n); });
    button('spot.remove', () => this.removeSpot(n));
    return box;
  },

  // 테마 › 저장한 자리 바탕 사진의 한 줄 — [지금 사진 작은 그림] 사진 고르기… · 윈도우 배경 화면 · 빼기(있으면)
  buildSpotBgButtons(n) {
    const box = document.createElement('div');
    box.className = 'set-spot-buttons';
    const bg = this.spots[n] && this.spots[n].bg;
    if (bg) {
      const thumb = document.createElement('div');
      thumb.className = 'set-bg-thumb small';
      thumb.style.backgroundImage = `url("${String(bg.thumb || bg.url).replace(/"/g, '%22')}")`;
      thumb.title = bg.name || '';
      box.appendChild(thumb);
    }
    const button = (key, onClick) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'set-mini-button';
      btn.textContent = t(key);
      btn.addEventListener('click', onClick);
      box.appendChild(btn);
    };
    button('spot.bg', () => this.pickSpotBackground(n));
    button('spot.bgWindows', () => this.importSpotWindowsWallpaper(n));
    if (bg) button('spot.bgRemove', () => this.removeSpotBackground(n));
    return box;
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

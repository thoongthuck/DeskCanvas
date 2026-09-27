// 캘린더 날짜 표시 — 빨간 날처럼 아무 날에나 이름 · 색 · 글꼴 (가이드 12-5)
//   날짜 칸 우클릭 › '이 날짜 표시 ›' 옆 창: 이름 칸 · 색 6가지 + 직접 고르기 · 글꼴 4가지 · 표시 지우기
//   표시한 날: 날짜 숫자와 이름이 그 색 · 글꼴로, 칸에 옅은 그 색 바탕 (calendar.js 가 그림, styles/boards.css)
//   캘린더마다 따로 저장 (board.marks = { 'YYYY-MM-DD': { text, color, font } }) — 되돌리기 · 복사 · 붙여넣기에 함께 들어감
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { t } from './i18n.js';

export const MARK_COLORS = {
  red: '#D9646B', orange: '#E08A3C', yellow: '#C9A227', green: '#3E9E6A', blue: '#4A7FD0', purple: '#8B6FD6',
};
export const MARK_FONTS = ['default', 'pen', 'serif', 'mono'];
const MARK_TEXT_MAX = 30;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const HEX = /^#[0-9A-F]{6}$/i;

// 저장된 표시를 믿을 수 있게 (normalizeCalendar)
export function cleanMarks(marks) {
  if (!marks || typeof marks !== 'object') return null;
  const out = {};
  Object.entries(marks).forEach(([key, m]) => {
    if (!DATE_KEY.test(key) || !m || typeof m !== 'object') return;
    out[key] = {
      text: String(m.text || '').slice(0, MARK_TEXT_MAX),
      color: HEX.test(String(m.color)) ? String(m.color).toUpperCase() : MARK_COLORS.red,
      font: MARK_FONTS.includes(m.font) ? m.font : 'default',
    };
  });
  return Object.keys(out).length ? out : null;
}

export const dayMarkMethods = {
  dayMark(board, key) {
    return (board.marks && board.marks[key]) || null;
  },

  setDayMark(board, key, patch, { record = true } = {}) {
    if (record) this.record();
    const current = this.dayMark(board, key) || { text: '', color: MARK_COLORS.red, font: 'default' };
    board.marks = { ...(board.marks || {}), [key]: { ...current, ...patch } };
    board.updatedAt = Date.now();
    this.renderBoard(board);
    this.scheduleSave();
  },

  clearDayMark(board, key) {
    if (!this.dayMark(board, key)) return;
    this.record();
    const marks = { ...board.marks };
    delete marks[key];
    if (Object.keys(marks).length) board.marks = marks;
    else delete board.marks;
    board.updatedAt = Date.now();
    this.renderBoard(board);
    this.scheduleSave();
  },

  // 날짜 칸 우클릭 메뉴 맨 위 (boards.js openBoardMenu)
  dayMarkMenuItems(board, key) {
    const mark = this.dayMark(board, key);
    const items = [{
      icon: 'palette.svg', label: t(mark ? 'mark.edit' : 'mark.add'), arrow: true,
      panel: (menu, row) => this.openDayMarkPanel(menu, row, board, key),
    }];
    if (mark) items.push({ icon: 'close.svg', label: t('mark.remove'), action: () => this.clearDayMark(board, key) });
    return items;
  },

  openDayMarkPanel(menu, anchor, board, key) {
    const id = `${board.id}:${key}`;
    if (this.stylePanel && this.stylePanel.dataset.mark === id) return;
    this.closeStylePanel();
    this.closeContextSubmenu();
    const panel = document.createElement('div');
    panel.id = 'style-panel';                 // 바깥 누르면 닫히기는 스타일 창과 같게
    panel.className = 'day-mark-panel';
    panel.dataset.mark = id;
    document.body.appendChild(panel);
    this.stylePanel = panel;
    this.framePanelAt = { menu, anchor };     // 자리 잡기는 사진 틀 창과 같이 (photo-frame.js placeFramePanel)
    this.renderDayMarkPanel(board, key);
    anchor.classList.add('open');
  },

  renderDayMarkPanel(board, key, { keepFocus = false } = {}) {
    const panel = this.stylePanel;
    if (!panel) return;
    const mark = this.dayMark(board, key) || { text: '', color: MARK_COLORS.red, font: 'default' };
    panel.innerHTML = '';
    const section = (titleKey) => {
      const wrap = document.createElement('div');
      wrap.className = 'style-section';
      const title = document.createElement('div');
      title.className = 'style-title';
      title.textContent = t(titleKey);
      wrap.appendChild(title);
      panel.appendChild(wrap);
      return wrap;
    };
    const apply = (patch) => {
      this.setDayMark(board, key, patch);
      this.renderDayMarkPanel(board, key);
    };

    // 이름 — 고치는 동안은 되돌리기 한 단계 (칸을 떠날 때 바뀐 게 없으면 버림)
    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'day-mark-name';
    name.maxLength = MARK_TEXT_MAX;
    name.placeholder = t('mark.namePlaceholder');
    name.value = mark.text;
    name.addEventListener('focus', () => this.recordHistory());
    name.addEventListener('input', () => this.setDayMark(board, key, { text: name.value }, { record: false }));
    name.addEventListener('blur', () => this.dropHistoryIfUnchanged());
    name.addEventListener('keydown', (e) => {
      e.stopPropagation();                    // 캔버스 단축키(Delete 등)로 가지 않게
      if (e.key === 'Enter' || e.key === 'Escape') this.closeStylePanel();
    });
    section('mark.name').appendChild(name);

    // 색: 6가지 + 직접 고르기
    const colors = document.createElement('div');
    colors.className = 'style-colors';
    Object.entries(MARK_COLORS).forEach(([k, value]) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'style-dot' + (mark.color === value ? ' current' : '');
      dot.style.background = value;
      dot.title = t(`color_${k}`);
      dot.addEventListener('click', () => apply({ color: value }));
      colors.appendChild(dot);
    });
    const custom = !Object.values(MARK_COLORS).includes(mark.color) && !!this.dayMark(board, key);
    colors.appendChild(this.createCustomColorDot({
      className: 'style-dot',
      current: custom,
      value: mark.color,
      onStart: () => this.recordHistory(),
      onInput: (hex) => this.setDayMark(board, key, { color: hex }, { record: false }),
      onDone: () => { this.dropHistoryIfUnchanged(); this.renderDayMarkPanel(board, key); },
    }));
    section('mark.color').appendChild(colors);

    // 글꼴: 쪽지 스타일 창과 같은 네 가지
    const fonts = document.createElement('div');
    fonts.className = 'style-fonts day-mark-fonts';
    const label = { default: 'fontDefault', pen: 'fontPen', serif: 'fontSerif', mono: 'fontMono' };
    MARK_FONTS.forEach(k => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `style-font font-${k}` + (mark.font === k && this.dayMark(board, key) ? ' current' : '');
      card.innerHTML = '<span class="style-font-sample"></span><span class="style-font-name"></span>';
      card.querySelector('.style-font-sample').textContent = mark.text || t('sampleFont');
      card.querySelector('.style-font-sample').style.color = mark.color;
      card.querySelector('.style-font-name').textContent = t(label[k]);
      card.addEventListener('click', () => apply({ font: k }));
      fonts.appendChild(card);
    });
    section('mark.font').appendChild(fonts);

    if (this.dayMark(board, key)) {
      const sep = document.createElement('div');
      sep.className = 'style-separator';
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'style-reset';
      clear.textContent = t('mark.remove');
      clear.addEventListener('click', () => {
        this.clearDayMark(board, key);
        this.closeStylePanel();
      });
      panel.append(sep, clear);
    }
    this.placeFramePanel();
    if (keepFocus) name.focus();
  },
};

// 쪽지 스타일 창 — 쪽지 우클릭 메뉴의 '스타일 변경 ›' 옆에 열림 (code/icons/아이콘_가이드.md 8-1)
//   쪽지 색(6색 + 직접 고르기) · 글자 색 · 글꼴 · 크기 · 기본 스타일로
//   누르는 즉시 그 쪽지에 적용되고 저장됨
import { ICON_DIR, NOTE_COLORS, STYLE_COLOR_ORDER, INK_COLORS, NOTE_FONTS, NOTE_TEXT_SIZES } from './constants.js';
import { t } from './i18n.js';

const FONT_LABEL = { default: 'fontDefault', pen: 'fontPen', serif: 'fontSerif', mono: 'fontMono' };
const SIZE_LABEL = { s: 'sizeS', m: 'sizeM', l: 'sizeL', xl: 'sizeXL' };

export const stylePanelMethods = {
  openStylePanel(menu, anchor, note) {
    if (this.stylePanel && this.stylePanel.dataset.note === note.id) return;
    this.closeStylePanel();
    const panel = document.createElement('div');
    panel.id = 'style-panel';
    panel.dataset.note = note.id;
    document.body.appendChild(panel);
    this.stylePanel = panel;
    this.renderStylePanel(note);

    // 메뉴 오른쪽에 붙이고, 자리가 없으면 왼쪽에
    const m = menu.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    let left = m.right + 6;
    if (left + p.width > window.innerWidth - 4) left = m.left - 6 - p.width;
    const top = Math.min(Math.max(4, a.top - 20), window.innerHeight - p.height - 4);
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    anchor.classList.add('open');
  },

  closeStylePanel() {
    if (this.stylePanel) this.stylePanel.remove();
    this.stylePanel = null;
    this.framePanelAt = null;                 // 사진 틀 고르는 창 (photo-frame.js) 도 같은 자리를 씀
    document.querySelectorAll('#context-menu .context-menu-item.open').forEach(r => r.classList.remove('open'));
  },

  // 창 안을 지금 쪽지 값으로 다시 그림
  renderStylePanel(note) {
    const panel = this.stylePanel;
    if (!panel) return;
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
    const apply = (changes) => {
      this.setNoteStyle(note, changes);
      this.renderStylePanel(note);
    };

    // 쪽지 색: 6색 + 직접 고르기(RGB)
    const colors = document.createElement('div');
    colors.className = 'style-colors';
    STYLE_COLOR_ORDER.forEach(key => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'style-dot' + (note.color === key ? ' current' : '');
      dot.style.background = NOTE_COLORS[key].swatch;
      dot.title = t(`color_${key}`);
      dot.addEventListener('click', () => apply({ color: key }));
      colors.appendChild(dot);
    });
    colors.appendChild(this.createCustomColorDot({
      className: 'style-dot',
      current: note.color === 'custom',
      value: note.customColor || this.settings.noteCustomColor,
      onStart: () => this.recordHistory(),
      onInput: (hex) => this.setNoteStyle(note, { color: 'custom', customColor: hex }, { record: false }),
      onDone: () => { this.dropHistoryIfUnchanged(); this.renderStylePanel(note); },
    }));
    section('styleNoteColor').appendChild(colors);

    // 글자 색: 연한 바탕 원 안에 그 색의 '가'
    const inks = document.createElement('div');
    inks.className = 'style-inks';
    Object.entries(INK_COLORS).forEach(([key, value]) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'style-ink' + (note.ink === key ? ' current' : '');
      dot.style.color = value;
      dot.textContent = t('sampleChar');
      dot.title = t(`ink_${key}`);
      dot.addEventListener('click', () => apply({ ink: key }));
      inks.appendChild(dot);
    });
    section('styleInk').appendChild(inks);

    // 글꼴: 2 × 2 카드
    const fonts = document.createElement('div');
    fonts.className = 'style-fonts';
    NOTE_FONTS.forEach(key => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `style-font font-${key}` + (note.font === key ? ' current' : '');
      card.innerHTML = '<span class="style-font-sample"></span><span class="style-font-name"></span>';
      card.querySelector('.style-font-sample').textContent = t('sampleFont');
      card.querySelector('.style-font-name').textContent = t(FONT_LABEL[key]);
      card.addEventListener('click', () => apply({ font: key }));
      fonts.appendChild(card);
    });
    section('styleFont').appendChild(fonts);

    // 크기: 네 칸 버튼 + 아래 단계 이름
    const sizes = document.createElement('div');
    sizes.className = 'style-sizes';
    const names = document.createElement('div');
    names.className = 'style-size-names';
    NOTE_TEXT_SIZES.forEach(key => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = `style-size size-${key}` + (note.size === key ? ' current' : '');
      cell.textContent = t('sampleChar');
      cell.title = t(SIZE_LABEL[key]);
      cell.addEventListener('click', () => apply({ size: key }));
      sizes.appendChild(cell);
      const name = document.createElement('span');
      name.textContent = t(SIZE_LABEL[key]);
      names.appendChild(name);
    });
    const sizeSection = section('styleSize');
    sizeSection.append(sizes, names);

    // 기본 스타일로: 글꼴 · 크기 · 글자 색만 처음 값으로 (쪽지 색은 그대로)
    const sep = document.createElement('div');
    sep.className = 'style-separator';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'style-reset';
    reset.innerHTML = `<img src="${ICON_DIR}style-reset.svg" alt="" draggable="false"><span></span>`;
    reset.querySelector('span').textContent = t('styleReset');
    reset.addEventListener('click', () => apply({ ink: 'default', font: 'default', size: 'm' }));
    panel.append(sep, reset);
  },

  // '직접 고르기' 색 점: 누르면 색 고르는 창(RGB) — 스타일 창과 설정 창이 같이 씀
  //   onStart: 창을 열 때 · onInput: 고르는 동안 계속 · onDone: 창을 닫을 때
  createCustomColorDot({ className, current, value, onStart, onInput, onDone }) {
    const wrap = document.createElement('label');
    wrap.className = `${className} custom-dot` + (current ? ' current' : '');
    wrap.title = t('colorCustom');
    if (current) wrap.style.setProperty('--custom', value);
    const input = document.createElement('input');
    input.type = 'color';
    input.value = value.toLowerCase();
    input.addEventListener('click', () => { if (onStart) onStart(); });
    input.addEventListener('input', () => {
      const hex = input.value.toUpperCase();
      wrap.classList.add('current');
      wrap.style.setProperty('--custom', hex);
      onInput(hex);
    });
    input.addEventListener('change', () => { if (onDone) onDone(input.value.toUpperCase()); });
    wrap.appendChild(input);
    return wrap;
  },
};

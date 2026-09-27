// 쪽지 스타일 창 — 쪽지 우클릭 메뉴의 '스타일 변경 ›' 옆에 열림 (code/icons/아이콘_가이드.md 8-1)
//   쪽지 색(6색 + 직접 고르기) · 글자 색(6색 + 직접 고르기) · 글꼴 · 크기 · 기본 스타일로
//   글자 색은 쪽지 글 전체 — 글 일부만 칠하려면 고치는 중에 글자를 골라 색 막대로 (text-color.js)
//   누르는 즉시 그 쪽지에 적용되고 저장됨
import { ICON_DIR, NOTE_COLORS, STYLE_COLOR_ORDER, INK_COLORS, NOTE_FONTS } from './constants.js';
import { t } from './i18n.js';

const FONT_LABEL = { default: 'fontDefault', pen: 'fontPen', serif: 'fontSerif', mono: 'fontMono' };

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
    inks.appendChild(this.createCustomColorDot({
      className: 'style-ink',
      current: note.ink === 'custom',
      value: note.inkCustom || '#E11D48',
      onStart: () => this.recordHistory(),
      onInput: (hex) => this.setNoteStyle(note, { ink: 'custom', inkCustom: hex }, { record: false }),
      onDone: () => { this.dropHistoryIfUnchanged(); this.renderStylePanel(note); },
    }));
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

    // 크기: 본문 글자 크기를 pt 로 (제목은 알맞게 조금 크게) — − · 칸 · + (1pt 씩, 칸에는 0.5pt 까지), 6 ~ 72
    //   아래 줄은 자주 쓰는 크기 바로 고르기
    const pt = Math.round(this.notePt(note) * 100) / 100;
    const setPt = (value) => {
      const n = Math.round(Math.min(72, Math.max(6, Number(value))) * 2) / 2;
      if (Number.isFinite(n)) apply({ pt: n });
      else this.renderStylePanel(note);
    };
    const ptRow = document.createElement('div');
    ptRow.className = 'style-pt';
    const step = (text, title, delta) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'style-pt-step';
      btn.textContent = text;
      btn.title = t(title);
      btn.addEventListener('click', () => setPt(Math.round(pt) + delta));
      return btn;
    };
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'style-pt-input';
    input.min = '6';
    input.max = '72';
    input.step = '0.5';
    input.value = String(pt);
    input.addEventListener('change', () => setPt(input.value));
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();                               // 캔버스 단축키로 가지 않게
      if (e.key === 'Enter') input.blur();
    });
    const unit = document.createElement('span');
    unit.className = 'style-pt-unit';
    unit.textContent = 'pt';
    ptRow.append(step('−', 'ptDown', -1), input, unit, step('+', 'ptUp', 1));
    const presets = document.createElement('div');
    presets.className = 'style-pt-presets';
    [9, 10, 12, 14, 18, 24].forEach(value => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'style-pt-preset' + (Math.abs(pt - value) < 0.01 ? ' current' : '');
      chip.textContent = String(value);
      chip.addEventListener('click', () => setPt(value));
      presets.appendChild(chip);
    });
    section('styleSize').append(ptRow, presets);

    // 기본 스타일로: 글꼴 · 크기 · 글자 색만 처음 값으로 (쪽지 색은 그대로)
    const sep = document.createElement('div');
    sep.className = 'style-separator';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'style-reset';
    reset.innerHTML = `<img src="${ICON_DIR}style-reset.svg" alt="" draggable="false"><span></span>`;
    reset.querySelector('span').textContent = t('styleReset');
    reset.addEventListener('click', () => apply({ ink: 'default', font: 'default', size: 'm', pt: null }));
    panel.append(sep, reset);
  },

  // '직접 고르기' 색 점: 누르면 색 고르는 창(RGB) — 스타일 창 · 설정 창 · 글자 색 막대가 같이 씀
  //   onStart: 창을 열 때 · onInput: 고르는 동안 계속 · onDone: 창을 닫을 때
  //   onCancel: 바꾸지 않고 닫았을 때 (취소 · 같은 색 그대로 확인) — 창이 닫혀 캔버스 창이 다시 포커스를 받는 것으로 앎
  //   창이 떠 있는 동안은 main.js 가 앞에 꺼낸 캔버스를 바탕화면 층에 다시 넣지 않음 (color-dialog)
  createCustomColorDot({ className, current, value, onStart, onInput, onDone, onCancel }) {
    const wrap = document.createElement('label');
    wrap.className = `${className} custom-dot` + (current ? ' current' : '');
    wrap.title = t('colorCustom');
    if (current) wrap.style.setProperty('--custom', value);
    const input = document.createElement('input');
    input.type = 'color';
    input.value = value.toLowerCase();
    let changed = false;
    input.addEventListener('click', () => {
      changed = false;
      if (onStart) onStart();
      window.canvasAPI?.colorDialog?.();
      if (onCancel) {
        window.addEventListener('focus', () => setTimeout(() => { if (!changed) onCancel(); }, 150), { once: true });
      }
    });
    input.addEventListener('input', () => {
      changed = true;
      const hex = input.value.toUpperCase();
      wrap.classList.add('current');
      wrap.style.setProperty('--custom', hex);
      onInput(hex);
    });
    input.addEventListener('change', () => {
      changed = true;
      if (onDone) onDone(input.value.toUpperCase());
    });
    wrap.appendChild(input);
    return wrap;
  },
};

// 쪽지 스타일 창 — 쪽지 우클릭 메뉴의 '스타일 변경 ›' 옆에 열림 (code/icons/아이콘_가이드.md 8-1)
//   쪽지 색(6색 + 직접 고르기) · 글자 색(6색 + 직접 고르기) · 글꼴 · 크기 · 글 정렬 · 기본 스타일로
//   글 정렬은 제목 · 본문 · 할 일 · 마크다운 · 표 칸이 같이 (코드 · 웹 페이지 쪽지는 없음 — styles.css .align-*)
//   글자 색은 쪽지 글 전체 — 글 일부만 칠하려면 고치는 중에 글자를 골라 색 막대로 (text-color.js)
//   누르는 즉시 그 쪽지에 적용되고 저장됨
//   쪽지를 여럿 골랐으면 (여러 개 메뉴 — selection.js) 고른 쪽지 모두에 한꺼번에. 고른 표시(●)는 모두 같은 값일 때만
import { ICON_DIR, NOTE_COLORS, STYLE_COLOR_ORDER, INK_COLORS, NOTE_FONTS, NOTE_ALIGNS } from './constants.js';
import { t } from './i18n.js';

const FONT_LABEL = { default: 'fontDefault', pen: 'fontPen', serif: 'fontSerif', mono: 'fontMono' };
const ALIGN_LABEL = { left: 'alignLeft', center: 'alignCenter', right: 'alignRight', justify: 'alignJustify' };

// 정렬 단추 그림 — 네 줄의 길이 · 자리로 (글자 색을 따라감)
const ALIGN_LINES = {
  left:    [[3, 17], [3, 12], [3, 17], [3, 10]],
  center:  [[3, 17], [6, 14], [3, 17], [7, 13]],
  right:   [[3, 17], [8, 17], [3, 17], [10, 17]],
  justify: [[3, 17], [3, 17], [3, 17], [3, 11]],
};
export function alignIcon(key) {
  const lines = ALIGN_LINES[key].map(([x1, x2], i) => `<path d="M${x1} ${4 + i * 4}H${x2}"/>`).join('');
  return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">${lines}</svg>`;
}

export const stylePanelMethods = {
  // target: 쪽지 하나, 또는 여럿 (배열)
  openStylePanel(menu, anchor, target) {
    const notes = Array.isArray(target) ? target : [target];
    const key = notes.map(n => n.id).join(',');
    if (this.stylePanel && this.stylePanel.dataset.note === key) return;
    this.closeStylePanel();
    const panel = document.createElement('div');
    panel.id = 'style-panel';
    panel.dataset.note = key;
    document.body.appendChild(panel);
    this.stylePanel = panel;
    this.renderStylePanel(notes);

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

  // 창 안을 지금 쪽지 값으로 다시 그림 (여럿이면 모두 같은 값일 때만 고른 표시)
  renderStylePanel(target) {
    const panel = this.stylePanel;
    if (!panel) return;
    const notes = Array.isArray(target) ? target : [target];
    const first = notes[0];
    const shared = (key, fallback) => {                    // 모두 같으면 그 값, 섞였으면 undefined
      const value = first[key] ?? fallback;
      return notes.every(n => (n[key] ?? fallback) === value) ? value : undefined;
    };
    // 고른 표시에 쓰는 값 (쪽지 하나면 그 쪽지 그대로)
    const note = { color: shared('color'), ink: shared('ink'), font: shared('font'), customColor: first.customColor, inkCustom: first.inkCustom };
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
      this.setNotesStyle(notes, changes);
      this.renderStylePanel(notes);
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
      onInput: (hex) => this.setNotesStyle(notes, { color: 'custom', customColor: hex }, { record: false }),
      onDone: () => { this.dropHistoryIfUnchanged(); this.renderStylePanel(notes); },
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
      onInput: (hex) => this.setNotesStyle(notes, { ink: 'custom', inkCustom: hex }, { record: false }),
      onDone: () => { this.dropHistoryIfUnchanged(); this.renderStylePanel(notes); },
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
    const pt = Math.round(this.notePt(first) * 100) / 100;   // 여럿이면 첫 쪽지 크기에서 시작
    const samePt = notes.every(n => Math.abs(this.notePt(n) - this.notePt(first)) < 0.01);
    const setPt = (value) => {
      const n = Math.round(Math.min(72, Math.max(6, Number(value))) * 2) / 2;
      if (Number.isFinite(n)) apply({ pt: n });
      else this.renderStylePanel(notes);
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
      chip.className = 'style-pt-preset' + (samePt && Math.abs(pt - value) < 0.01 ? ' current' : '');
      chip.textContent = String(value);
      chip.addEventListener('click', () => setPt(value));
      presets.appendChild(chip);
    });
    section('styleSize').append(ptRow, presets);

    // 글 정렬: 왼쪽 · 가운데 · 오른쪽 · 양쪽 (코드 · 웹 페이지 쪽지는 없음)
    if (notes.some(n => n.type !== 'code' && n.type !== 'web')) {
      const aligns = document.createElement('div');
      aligns.className = 'style-aligns';
      const now = shared('align', 'left');
      NOTE_ALIGNS.forEach(key => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'style-align' + (now === key ? ' current' : '');
        btn.title = t(ALIGN_LABEL[key]);
        btn.innerHTML = alignIcon(key);
        btn.addEventListener('click', () => apply({ align: key }));
        aligns.appendChild(btn);
      });
      section('styleAlign').appendChild(aligns);
    }

    // 기본 스타일로: 글꼴 · 크기 · 글자 색 · 정렬만 처음 값으로 (쪽지 색은 그대로)
    const sep = document.createElement('div');
    sep.className = 'style-separator';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'style-reset';
    reset.innerHTML = `<img src="${ICON_DIR}style-reset.svg" alt="" draggable="false"><span></span>`;
    reset.querySelector('span').textContent = t('styleReset');
    reset.addEventListener('click', () => apply({ ink: 'default', font: 'default', size: 'm', pt: null, align: 'left' }));
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

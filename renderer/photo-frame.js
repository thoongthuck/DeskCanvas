// 사진 틀 고르는 창 — 사진 우클릭 메뉴의 '틀 바꾸기 ›' 옆에 열림 (code/icons/아이콘_가이드.md 13-2)
//   틀 없음 · 종이 틀 · 테이프 · 압정. 테이프·압정을 고르면 아래에서 색과 자리를 고름 (사진마다 저장)
//   누르는 즉시 그 사진에 적용되고 저장됨. 창 틀·점·고르개 모양은 쪽지 스타일 창(style-panel)과 같음
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { ICON_DIR, NOTE_COLORS } from './constants.js';
import { t } from './i18n.js';
import { PHOTO_FRAMES, TAPE_COLORS, TAPE_POSITIONS, PIN_COLORS, PIN_POSITIONS } from './photos.js';

const TILTS = [['left', -2], ['none', 0], ['right', 2]];

export const photoFrameMethods = {
  openFramePanel(menu, anchor, photo) {
    if (this.stylePanel && this.stylePanel.dataset.photo === photo.id) return;
    this.closeStylePanel();
    this.closeContextSubmenu();
    const panel = document.createElement('div');
    panel.id = 'style-panel';                 // 바깥 누르면 닫히기 · 휠 스크롤은 스타일 창과 같게
    panel.className = 'frame-panel';
    panel.dataset.photo = photo.id;
    document.body.appendChild(panel);
    this.stylePanel = panel;
    this.framePanelAt = { menu, anchor };
    this.renderFramePanel(photo);
    anchor.classList.add('open');
  },

  // 메뉴 오른쪽에 붙이고, 자리가 없으면 왼쪽에 (고른 틀에 따라 창 높이가 바뀌어서 그릴 때마다 맞춤)
  placeFramePanel() {
    const panel = this.stylePanel;
    const at = this.framePanelAt;
    if (!panel || !at) return;
    const m = at.menu.getBoundingClientRect();
    const a = at.anchor.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    let left = m.right + 6;
    if (left + p.width > window.innerWidth - 4) left = m.left - 6 - p.width;
    const top = Math.min(Math.max(4, a.top - 8), window.innerHeight - p.height - 4);
    panel.style.left = `${left}px`;
    panel.style.top = `${Math.max(4, top)}px`;
  },

  renderFramePanel(photo) {
    const panel = this.stylePanel;
    if (!panel) return;
    panel.innerHTML = '';
    const apply = (patch) => {
      this.setPhotoFrame(photo, patch);
      this.renderFramePanel(photo);
    };
    const section = (titleKey) => {
      const wrap = document.createElement('div');
      wrap.className = 'style-section frame-section';
      const title = document.createElement('div');
      title.className = 'style-title';
      title.textContent = t(titleKey);
      wrap.appendChild(title);
      panel.appendChild(wrap);
      return wrap;
    };
    const dots = (entries, current, onPick) => {
      const row = document.createElement('div');
      row.className = 'style-colors';
      entries.forEach(([key, color, label]) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'style-dot' + (current === key ? ' current' : '');
        dot.style.background = color;
        dot.title = label;
        dot.addEventListener('click', () => onPick(key));
        row.appendChild(dot);
      });
      return row;
    };
    const segments = (entries, current, onPick) => {
      const row = document.createElement('div');
      row.className = 'frame-segments';
      row.style.gridTemplateColumns = `repeat(${entries.length}, 1fr)`;
      entries.forEach(([key, label]) => {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'frame-segment' + (current === key ? ' current' : '');
        cell.textContent = label;
        cell.addEventListener('click', () => onPick(key));
        row.appendChild(cell);
      });
      return row;
    };

    // 틀 목록 (틀 없음 · 종이 틀 · 테이프 · 압정)
    const list = document.createElement('div');
    list.className = 'frame-options';
    PHOTO_FRAMES.forEach(key => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'frame-option' + (photo.frame === key ? ' current' : '');
      row.textContent = t(`frame.${key}`);
      row.addEventListener('click', () => apply({ frame: key }));
      list.appendChild(row);
    });
    panel.appendChild(list);

    if (photo.frame === 'tape') {
      section('frame.tapeColor').appendChild(dots(
        TAPE_COLORS.map(k => [k, NOTE_COLORS[k].swatch, t(`color_${k}`)]),
        photo.tapeColor, (k) => apply({ tapeColor: k })));
      section('frame.tapePos').appendChild(segments(
        TAPE_POSITIONS.map(k => [k, t(`pos.${k}`)]),
        photo.tapePos, (k) => apply({ tapePos: k })));
    } else if (photo.frame === 'pin') {
      const pins = document.createElement('div');
      pins.className = 'frame-pins';
      Object.keys(PIN_COLORS).forEach(key => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'frame-pin' + (photo.pinColor === key ? ' current' : '');
        btn.title = t(`color_${key}`);
        btn.innerHTML = `<img src="${ICON_DIR}photo-pin-${key}.svg" alt="" draggable="false">`;
        btn.addEventListener('click', () => apply({ pinColor: key }));
        pins.appendChild(btn);
      });
      section('frame.pinColor').appendChild(pins);
      section('frame.pinPos').appendChild(segments(
        PIN_POSITIONS.map(k => [k, t(`pos.${k}`)]),
        photo.pinPos, (k) => apply({ pinPos: k })));
    }

    // 살짝 기울이기 (모든 틀)
    const tiltNow = TILTS.find(([, deg]) => deg === photo.tilt)?.[0] || (photo.tilt < 0 ? 'left' : photo.tilt > 0 ? 'right' : 'none');
    section('frame.tilt').appendChild(segments(
      TILTS.map(([k]) => [k, t(`tilt.${k}`)]),
      tiltNow, (k) => apply({ tilt: TILTS.find(([key]) => key === k)[1] })));

    this.placeFramePanel();
  },
};

// 바탕에 붙인 사진 — 쪽지 없이 사진 한 장 ('쪽지 추가 › 이미지 추가')
//   사진 뒤에 틀을 둠 — 종이 틀(기본) · 테이프 · 압정 · 틀 없음 (code/icons/아이콘_가이드.md 13장)
//   photo.width · height 는 '사진' 크기이고, 틀 여백은 그 둘레에 더해짐 (photo.x · y 는 틀의 왼쪽 위)
//   틀 고르는 창은 photo-frame.js
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { ICON_DIR, NOTE_COLORS } from './constants.js';
import { t } from './i18n.js';

const MAX_SIDE = 360;          // 처음 놓일 때 사진의 가장 긴 변 (zoom 1 기준)
const MIN_SIDE = 60;
const TAPE_LENGTH = 86;        // 테이프 길이 (사진이 작으면 틀 폭의 30%까지 줄임)

export const PHOTO_FRAMES = ['none', 'paper', 'tape', 'pin'];
export const TAPE_COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'gray'];
export const TAPE_POSITIONS = ['center', 'corner', 'corners'];
export const PIN_COLORS = { red: '#E0736C', yellow: '#EBB94F', blue: '#6EA8F0', green: '#6FBF8A', purple: '#9B8BEA', gray: '#9AA3AE' };
export const PIN_POSITIONS = ['center', 'corner'];

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export const photoMethods = {
  newPhoto(extra = {}) {
    return Object.assign({
      id: this.newId('photo'),
      x: 0, y: 0, width: 240, height: 180,
      src: '', pinned: false, updatedAt: Date.now(),
      frame: 'paper',              // 'none' | 'paper' | 'tape' | 'pin'
      caption: '',                 // 종이 틀 아래 손글씨 한 줄
      tapeColor: 'yellow', tapePos: 'center',
      pinColor: 'red', pinPos: 'center',
      tilt: 0,                     // 기울임 (도)
    }, extra);
  },

  normalizePhoto(p) {
    const photo = { ...p };
    photo.src = String(photo.src || '');
    photo.pinned = !!photo.pinned;
    if (typeof photo.width !== 'number') photo.width = 240;
    if (typeof photo.height !== 'number') photo.height = 180;
    if (typeof photo.updatedAt !== 'number') photo.updatedAt = Date.now();
    if (!PHOTO_FRAMES.includes(photo.frame)) photo.frame = 'paper';          // 예전에 넣은 사진도 종이 틀로
    if (typeof photo.caption !== 'string') photo.caption = '';
    if (!TAPE_COLORS.includes(photo.tapeColor)) photo.tapeColor = 'yellow';
    if (!TAPE_POSITIONS.includes(photo.tapePos)) photo.tapePos = 'center';
    if (!PIN_COLORS[photo.pinColor]) photo.pinColor = 'red';
    if (!PIN_POSITIONS.includes(photo.pinPos)) photo.pinPos = 'center';
    photo.tilt = Number.isFinite(photo.tilt) ? Math.max(-3, Math.min(3, photo.tilt)) : 0;
    return photo;
  },

  // 틀 여백 (zoom 1) — 종이 틀: 위·좌·우 14, 아래 46 (글이 없으면 14) / 테이프·압정: 10 / 틀 없음: 0
  photoPadding(photo) {
    if (photo.frame === 'none') return { top: 0, right: 0, bottom: 0, left: 0 };
    if (photo.frame === 'paper') {
      const caption = !!photo.caption || this.captionEditingId === photo.id;
      return { top: 14, right: 14, bottom: caption ? 46 : 14, left: 14 };
    }
    return { top: 10, right: 10, bottom: 10, left: 10 };
  },

  // 틀까지 합친 크기 — 화면에서 차지하는 자리
  photoOuterSize(photo) {
    const p = this.photoPadding(photo);
    return { width: photo.width + p.left + p.right, height: photo.height + p.top + p.bottom };
  },

  // 사진 크기를 실제 그림 비율에 맞춰 정함
  photoSize(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || MAX_SIDE;
        const h = img.naturalHeight || MAX_SIDE;
        const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
        resolve({ width: Math.max(MIN_SIDE, Math.round(w * scale)), height: Math.max(MIN_SIDE, Math.round(h * scale)) });
      };
      img.onerror = () => resolve({ width: 240, height: 180 });
      img.src = src;
    });
  },

  // 이미지 추가: 사진을 골라 바탕에 붙임
  async addImageAt(at) {
    this.log('이미지 추가 누름');
    if (!window.canvasAPI || !window.canvasAPI.pickImage) {
      this.log('이미지 추가 못 함: canvasAPI.pickImage 없음');
      return null;
    }
    try {
      const src = await window.canvasAPI.pickImage(t('dialog.pickImage'));
      this.log(`이미지 고르기 끝: ${src || '취소'}`);
      if (!src) return null;
      const photo = await this.addPhotoAt(at, src);
      this.log(`사진 붙임: ${photo && photo.id}`);
      return photo;
    } catch (err) {
      this.log(`이미지 추가 실패: ${err && err.message}`);
      this.showToast(`사진을 넣지 못했어요: ${err && err.message}`);
      return null;
    }
  },

  async addPhotoAt(at, src) {
    const size = await this.photoSize(src);
    this.record();
    const photo = this.newPhoto({ x: at.x, y: at.y, src, ...size });
    this.photos.push(photo);
    this.createPhotoElement(photo);
    this.selectItem(photo.id);
    this.scheduleSave();
    return photo;
  },

  createPhotoElement(photo) {
    const el = document.createElement('div');
    el.className = 'canvas-photo';
    el.id = photo.id;
    el.innerHTML = `
      <div class="photo-paper">
        <img class="canvas-photo-img" alt="" draggable="false">
        <div class="photo-caption"></div>
      </div>
      <div class="photo-extras"></div>
      <div class="photo-resize"></div>
    `;
    el.querySelector('.canvas-photo-img').src = photo.src;

    el.addEventListener('mousedown', (e) => {
      if (e.target.closest('.photo-caption-input')) return;           // 캡션을 쓰는 중: 글자 고르기
      this.selectItem(photo.id);
      if (e.button !== 0 || photo.pinned) return;
      if (e.target.closest('.photo-resize')) return;
      e.preventDefault();
      this.startItemDrag(e, 'photo', photo);
    });

    // 종이 틀 사진을 두 번 누르면 캡션 쓰기
    el.addEventListener('dblclick', (e) => {
      if (photo.frame !== 'paper' || e.target.closest('.photo-resize, .photo-caption-input')) return;
      e.preventDefault();
      this.editPhotoCaption(photo);
    });

    el.querySelector('.photo-resize').addEventListener('mousedown', (e) => {
      if (e.button !== 0 || photo.pinned) return;
      e.preventDefault();
      e.stopPropagation();
      this.selectItem(photo.id);
      this.startItemResize(e, 'photo', photo);
    });

    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.selectItem(photo.id);
      this.openPhotoMenu(photo, e.clientX, e.clientY);
    });

    this.uiLayer.appendChild(el);
    this.renderPhotoFrame(photo, el);
    this.refreshPhoto(photo, el);
    this.updatePhotoPosition(el, photo);
  },

  // 틀 모양 — 종이 · 캡션 · 테이프 · 압정
  renderPhotoFrame(photo, el = document.getElementById(photo.id)) {
    if (!el) return;
    PHOTO_FRAMES.forEach(f => el.classList.toggle(`frame-${f}`, photo.frame === f));
    const caption = el.querySelector('.photo-caption');
    if (!caption.querySelector('input')) caption.textContent = photo.frame === 'paper' ? photo.caption : '';

    const extras = el.querySelector('.photo-extras');
    extras.innerHTML = '';
    if (photo.frame === 'tape') {
      const color = NOTE_COLORS[photo.tapeColor] || NOTE_COLORS.yellow;
      el.style.setProperty('--tape-bg', hexToRgba(color.swatch, 0.86));
      el.style.setProperty('--tape-line', hexToRgba(color.dot, 0.45));
      const spots = photo.tapePos === 'corners' ? ['left', 'right'] : [photo.tapePos === 'corner' ? 'left' : 'center'];
      spots.forEach(spot => {
        const tape = document.createElement('div');
        tape.className = `photo-tape tape-${spot}`;
        extras.appendChild(tape);
      });
    } else if (photo.frame === 'pin') {
      const pin = document.createElement('img');
      pin.className = `photo-pin pin-${photo.pinPos}`;
      pin.src = `${ICON_DIR}photo-pin-${photo.pinColor}.svg`;
      pin.alt = '';
      pin.draggable = false;
      extras.appendChild(pin);
    }
  },

  refreshPhoto(photo, el = document.getElementById(photo.id)) {
    if (!el) return;
    el.classList.toggle('pinned', !!photo.pinned);
    el.classList.toggle('selected', this.selectedId === photo.id && !photo.pinned);
  },

  updatePhotoPosition(el, photo) {
    const z = this.zoom;
    const pad = this.photoPadding(photo);
    const size = this.photoOuterSize(photo);
    el.style.left = `${photo.x * z + this.panX}px`;
    el.style.top = `${photo.y * z + this.panY}px`;
    el.style.width = `${size.width * z}px`;
    el.style.height = `${size.height * z}px`;
    el.style.setProperty('--zoom', z);
    el.style.setProperty('--pad-top', `${pad.top * z}px`);
    el.style.setProperty('--pad-right', `${pad.right * z}px`);
    el.style.setProperty('--pad-bottom', `${pad.bottom * z}px`);
    el.style.setProperty('--pad-left', `${pad.left * z}px`);
    el.style.setProperty('--tape-len', `${Math.min(TAPE_LENGTH, size.width * 0.3) * z}px`);
    el.style.setProperty('--tilt', `${photo.tilt || 0}deg`);
  },

  // 틀 바꾸기 (틀 · 테이프/압정의 색과 자리 · 기울임)
  setPhotoFrame(photo, patch) {
    this.record();
    Object.assign(photo, patch);
    photo.updatedAt = Date.now();
    const el = document.getElementById(photo.id);
    if (el) {
      this.renderPhotoFrame(photo, el);
      this.updatePhotoPosition(el, photo);
    }
    this.scheduleSave();
  },

  // 사진 바꾸기: 지금 크기(긴 변)는 그대로 두고 새 사진 비율에 맞춤
  async replacePhotoImage(photo) {
    if (!window.canvasAPI || !window.canvasAPI.pickImage) return;
    const src = await window.canvasAPI.pickImage(t('dialog.pickImage'));
    if (!src) return;
    const size = await this.photoSize(src);
    this.record();
    const scale = Math.max(photo.width, photo.height) / Math.max(size.width, size.height);
    photo.src = src;
    photo.width = Math.max(MIN_SIDE, Math.round(size.width * scale));
    photo.height = Math.max(MIN_SIDE, Math.round(size.height * scale));
    photo.updatedAt = Date.now();
    const el = document.getElementById(photo.id);
    if (el) {
      el.querySelector('.canvas-photo-img').src = src;
      this.updatePhotoPosition(el, photo);
    }
    this.scheduleSave();
  },

  // 캡션 넣기: 종이 틀 아래 여백에서 바로 씀 (Enter 끝 · Esc 취소)
  editPhotoCaption(photo) {
    const el = document.getElementById(photo.id);
    if (!el || this.captionEditingId === photo.id) return;
    if (photo.frame !== 'paper') this.setPhotoFrame(photo, { frame: 'paper' });
    this.captionEditingId = photo.id;
    this.renderPhotoFrame(photo, el);
    this.updatePhotoPosition(el, photo);                  // 아래 여백이 46 으로 늘어남

    const caption = el.querySelector('.photo-caption');
    caption.textContent = '';
    const input = document.createElement('input');
    input.className = 'photo-caption-input';
    input.value = photo.caption;
    input.placeholder = t('caption.placeholder');
    input.spellcheck = false;
    input.maxLength = 80;
    caption.appendChild(input);
    input.focus();
    input.select();

    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      this.captionEditingId = null;
      const value = input.value.replace(/\s+/g, ' ').trim();
      if (commit && value !== photo.caption) {
        this.record();
        photo.caption = value;
        photo.updatedAt = Date.now();
        this.scheduleSave();
      }
      input.remove();
      this.renderPhotoFrame(photo, el);
      this.updatePhotoPosition(el, photo);
    };
    input.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
  },

  removePhotoCaption(photo) {
    this.setPhotoFrame(photo, { caption: '' });
  },

  duplicatePhoto(photo) {
    this.record();
    const copy = this.newPhoto({ ...photo, id: this.newId('photo'), x: photo.x + 24, y: photo.y + 24, pinned: false });
    this.photos.push(copy);
    this.createPhotoElement(copy);
    this.selectItem(copy.id);
    this.scheduleSave();
  },

  togglePhotoPin(photo) {
    this.record();
    photo.pinned = !photo.pinned;
    this.refreshPhoto(photo);
    this.scheduleSave();
  },

  deletePhoto(id) {
    this.record();
    this.photos = this.photos.filter(p => p.id !== id);
    const el = document.getElementById(id);
    if (el) el.remove();
    if (this.selectedId === id) this.selectedId = null;
    this.scheduleSave();
  },
};

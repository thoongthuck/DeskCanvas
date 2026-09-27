// 바탕에 붙인 사진 — 쪽지 없이 사진 한 장 ('쪽지 추가 › 이미지 추가')
//   사진 뒤에 틀을 둠 — 종이 틀(기본) · 테이프 · 압정 · 틀 없음 (code/icons/아이콘_가이드.md 13장)
//   영상도 같은 틀에 붙임 ('쪽지 추가 › 영상 추가', photo.media = 'video') — 소리 끈 채 되풀이 재생이 기본,
//     멈춤 · 소리는 저장됨 (되돌리기에는 넣지 않음). 화면 밖에 있거나 캔버스가 다른 창에 가려진 동안은 쉼 (아이콘_가이드.md 17장)
//     쉬는 영상은 잠시 뒤 내려놓음 (재생기 하나가 메모리를 100MB 넘게 씀) — 지금 장면을 작은 그림으로 남기고, 다시 보이면 그 자리부터
//   photo.width · height 는 '사진' 크기이고, 틀 여백은 그 둘레에 더해짐 (photo.x · y 는 틀의 왼쪽 위)
//   틀 고르는 창은 photo-frame.js
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { ICON_DIR, NOTE_COLORS } from './constants.js';
import { t } from './i18n.js';

const MAX_SIDE = 360;          // 처음 놓일 때 사진의 가장 긴 변 (zoom 1 기준)
const MIN_SIDE = 60;
const TAPE_LENGTH = 86;        // 테이프 길이 (사진이 작으면 틀 폭의 30%까지 줄임)
const VIDEO_FALLBACK = { width: 320, height: 180 };   // 영상 크기를 못 읽었을 때 (16:9)
const VIDEO_UNLOAD_AFTER = 5000;   // 쉬기 시작하고 이만큼 지나면 영상을 내려놓음 (잠깐 가렸다 보이는 것은 그대로)
const VIDEO_POSTER_WIDTH = 480;    // 내려놓을 때 남기는 장면 그림의 폭
// 테이프 — 칠은 쪽지 바탕색 .86, 테두리는 같은 색을 진하게 .45 (시안_사진틀 ④에서 잰 값)
export const TAPE_LINES = { yellow: '#CDC074', pink: '#CD9FAB', blue: '#95B5D6', green: '#99C5A9', purple: '#A29FD6', gray: '#B4BCC2' };
const TAPE_SHARE = 0.42;       // 사진이 작으면 테이프를 틀 폭의 이만큼까지 줄임 (시안 썸네일)

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
      caption: '',                 // 틀 아래 손글씨 한 줄 (종이 · 테이프 · 압정 — 틀 없음이면 숨김)
      tapeColor: 'yellow', tapePos: 'center',
      pinColor: 'red', pinPos: 'center',
      tilt: 0,                     // 기울임 (도)
      media: 'image',              // 'image' | 'video'
      muted: true,                 // 영상: 소리 끔
      paused: false,               // 영상: 멈춤
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
    photo.media = photo.media === 'video' ? 'video' : 'image';
    photo.muted = photo.muted !== false;
    photo.paused = !!photo.paused;
    return photo;
  },

  // 틀 여백 (zoom 1) — 종이 틀: 위·좌·우 14, 아래 46 (글이 없으면 14) / 테이프·압정: 10, 캡션이 있으면 아래 42 / 틀 없음: 0
  photoPadding(photo) {
    if (photo.frame === 'none') return { top: 0, right: 0, bottom: 0, left: 0 };
    const caption = this.photoHasCaptionRoom(photo) && (!!photo.caption || this.captionEditingId === photo.id);
    if (photo.frame === 'paper') return { top: 14, right: 14, bottom: caption ? 46 : 14, left: 14 };
    return { top: 10, right: 10, bottom: caption ? 42 : 10, left: 10 };
  },

  // 캡션을 쓸 수 있는 틀 — 흰 테두리가 있는 틀 (종이 · 테이프 · 압정). 틀 없음은 캡션을 넣으면 종이 틀로
  photoHasCaptionRoom(photo) {
    return photo.frame !== 'none';
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
      img.onload = () => resolve(this.fitMediaSize(img.naturalWidth || MAX_SIDE, img.naturalHeight || MAX_SIDE));
      img.onerror = () => resolve({ width: 240, height: 180 });
      img.src = src;
    });
  },

  // 영상도 같은 규칙 (영상 정보만 읽음 — 못 읽으면 16:9)
  videoSize(src) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      let done = false;
      const finish = (size) => {
        if (done) return;
        done = true;
        video.removeAttribute('src');
        video.load();
        resolve(size);
      };
      video.preload = 'metadata';
      video.muted = true;
      video.onloadedmetadata = () => finish(this.fitMediaSize(video.videoWidth || VIDEO_FALLBACK.width, video.videoHeight || VIDEO_FALLBACK.height));
      video.onerror = () => finish({ ...VIDEO_FALLBACK });
      setTimeout(() => finish({ ...VIDEO_FALLBACK }), 8000);
      video.src = src;
    });
  },

  // 가장 긴 변을 MAX_SIDE 로 (작으면 그대로)
  fitMediaSize(w, h) {
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
    return { width: Math.max(MIN_SIDE, Math.round(w * scale)), height: Math.max(MIN_SIDE, Math.round(h * scale)) };
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

  // 영상 추가: 영상을 골라 바탕에 붙임 (틀 · 캡션 · 크기 조절은 사진과 같음)
  async addVideoAt(at) {
    this.log('영상 추가 누름');
    if (!window.canvasAPI || !window.canvasAPI.pickVideo) return null;
    try {
      const src = await window.canvasAPI.pickVideo(t('dialog.pickVideo'));
      this.log(`영상 고르기 끝: ${src || '취소'}`);
      if (!src) return null;
      return await this.addPhotoAt(at, src, { media: 'video' });
    } catch (err) {
      this.log(`영상 추가 실패: ${err && err.message}`);
      this.showToast(t('toast.videoFail', { msg: (err && err.message) || '' }));
      return null;
    }
  },

  // 새 사진 · 영상 — 틀 · 영상 소리 · 바로 재생은 설정 › 사진 · 영상
  //   record · select: 파일을 쪽지로 바꿀 때(file-media.js)는 여럿을 한 단계로 · 끝나고 한꺼번에 고름
  async addPhotoAt(at, src, extra = {}, { record = true, select = true } = {}) {
    const size = extra.media === 'video' ? await this.videoSize(src) : await this.photoSize(src);
    if (record) this.record();
    const s = this.settings || {};
    const defaults = { frame: PHOTO_FRAMES.includes(s.photoFrame) ? s.photoFrame : 'paper' };
    if (extra.media === 'video') Object.assign(defaults, { muted: !s.videoSound, paused: s.videoAutoplay === false });
    const photo = this.newPhoto({ x: at.x, y: at.y, src, ...size, ...defaults, ...extra });
    this.photos.push(photo);
    this.createPhotoElement(photo);
    if (select) this.selectItem(photo.id);
    this.scheduleSave();
    return photo;
  },

  createPhotoElement(photo) {
    const video = photo.media === 'video';
    const el = document.createElement('div');
    el.className = 'canvas-photo' + (video ? ' canvas-video' : '');
    el.id = photo.id;
    el.innerHTML = `
      <div class="photo-paper">
        ${video ? '<video class="canvas-photo-img" loop playsinline preload="auto"></video><div class="video-note"></div>'
                : '<img class="canvas-photo-img" alt="" draggable="false">'}
        <div class="photo-caption"></div>
      </div>
      <div class="photo-extras"></div>
      ${video ? `<div class="video-controls">
        <button type="button" class="video-btn video-play"><img alt="" draggable="false"></button>
        <button type="button" class="video-btn video-sound"><img alt="" draggable="false"></button>
      </div>` : ''}
      <div class="photo-resize"></div>
    `;
    el.querySelector('.canvas-photo-img').src = photo.src;
    if (video) this.setupVideoElement(photo, el);

    el.addEventListener('mousedown', (e) => {
      if (e.target.closest('.photo-caption-input')) return;           // 캡션을 쓰는 중: 글자 고르기
      if (e.target.closest('.video-btn')) return;                     // 영상 재생 · 소리 단추
      const canDrag = this.pressSelect(e, photo.id, !photo.pinned);  // Ctrl · Shift: 여러 개 고르기 (selection.js)
      if (e.button !== 0) return;
      if (e.target.closest('.photo-resize')) return;
      e.preventDefault();
      if (photo.pinned) {                                             // 고정한 사진 · 영상: 끌면 화면 이동 (boards.js startGrabPan)
        this.startGrabPan(e);
        return;
      }
      if (!canDrag) return;
      this.startItemDrag(e, 'photo', photo);
    });

    // 틀이 있는 사진(종이 · 테이프 · 압정)을 두 번 누르면 캡션 쓰기
    el.addEventListener('dblclick', (e) => {
      if (!this.photoHasCaptionRoom(photo) || e.target.closest('.photo-resize, .photo-caption-input')) return;
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
      this.ensureSelected(photo.id);
      if (this.multiSelected(photo.id)) this.openSelectionMenu(e.clientX, e.clientY);   // 여럿 고른 것 가운데 하나
      else this.openPhotoMenu(photo, e.clientX, e.clientY);
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
    if (!caption.querySelector('input')) caption.textContent = this.photoHasCaptionRoom(photo) ? photo.caption : '';

    const extras = el.querySelector('.photo-extras');
    extras.innerHTML = '';
    if (photo.frame === 'tape') {
      const color = NOTE_COLORS[photo.tapeColor] || NOTE_COLORS.yellow;
      el.style.setProperty('--tape-bg', hexToRgba(color.bg, 0.86));
      el.style.setProperty('--tape-line', hexToRgba(TAPE_LINES[photo.tapeColor] || TAPE_LINES.yellow, 0.45));
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
    el.classList.toggle('selected', this.selection.has(photo.id) && !photo.pinned);
  },

  updatePhotoPosition(el, photo) {
    this.applyItemOrder(el, photo);                   // 순서 (layer-order.js)
    const z = this.zoom;
    const pad = this.photoPadding(photo);
    const size = this.photoOuterSize(photo);
    const left = photo.x * z + this.panX;
    const top = photo.y * z + this.panY;
    if (photo.media === 'video') {                  // 화면 밖에 있는 동안은 영상을 쉼
      const visible = left < this.viewWidth && top < this.viewHeight && left + size.width * z > 0 && top + size.height * z > 0;
      if (el.videoVisible !== visible) {
        el.videoVisible = visible;
        this.applyVideoState(photo, el);
      }
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.width = `${size.width * z}px`;
    el.style.height = `${size.height * z}px`;
    el.style.setProperty('--zoom', z);
    el.style.setProperty('--pad-top', `${pad.top * z}px`);
    el.style.setProperty('--pad-right', `${pad.right * z}px`);
    el.style.setProperty('--pad-bottom', `${pad.bottom * z}px`);
    el.style.setProperty('--pad-left', `${pad.left * z}px`);
    el.style.setProperty('--tape-len', `${Math.min(TAPE_LENGTH, size.width * TAPE_SHARE) * z}px`);
    el.style.setProperty('--tilt', `${photo.tilt || 0}deg`);
    this.requestLinks();                            // 연결선도 따라감 (links.js)
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
    this.replacePhotoSource(photo, src, await this.photoSize(src));
  },

  // 영상 바꾸기 — 사진 바꾸기와 같음
  async replaceVideo(photo) {
    if (!window.canvasAPI || !window.canvasAPI.pickVideo) return;
    const src = await window.canvasAPI.pickVideo(t('dialog.pickVideo'));
    if (!src) return;
    this.replacePhotoSource(photo, src, await this.videoSize(src));
  },

  replacePhotoSource(photo, src, size) {
    this.record();
    const scale = Math.max(photo.width, photo.height) / Math.max(size.width, size.height);
    photo.src = src;
    photo.width = Math.max(MIN_SIDE, Math.round(size.width * scale));
    photo.height = Math.max(MIN_SIDE, Math.round(size.height * scale));
    photo.updatedAt = Date.now();
    const el = document.getElementById(photo.id);
    if (el) {
      el.querySelector('.canvas-photo-img').src = src;
      el.videoUnloaded = false;                       // 새 영상은 새로 불러옴 (내려놓았던 장면 · 자리는 버림)
      el.videoResume = 0;
      el.classList.remove('video-broken');
      this.updatePhotoPosition(el, photo);
      if (photo.media === 'video') this.applyVideoState(photo, el);
    }
    this.scheduleSave();
  },

  // ---- 영상 ----
  // 재생 · 소리 단추 (마우스를 올리거나 멈췄을 때 왼쪽 아래에 보임), 못 여는 영상은 안내 글
  setupVideoElement(photo, el) {
    const video = el.querySelector('video');
    video.muted = true;                                 // 소리는 applyVideoState 가 맞춤
    video.addEventListener('error', () => {
      if (el.videoUnloaded) return;                     // 내려놓느라 주소를 뗀 것 — 못 여는 영상이 아님
      el.classList.add('video-broken');
      el.querySelector('.video-note').textContent = t('video.broken');
    });
    video.addEventListener('loadeddata', () => el.classList.remove('video-broken'));
    el.querySelector('.video-play').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleVideoPlay(photo.id);
    });
    el.querySelector('.video-sound').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleVideoSound(photo.id);
    });
    this.applyVideoState(photo, el);
  },

  // 저장된 멈춤 · 소리를 영상에 맞춤 (화면 밖이거나 캔버스가 가려졌으면 쉼 — 쉬는 게 길어지면 내려놓음)
  applyVideoState(photo, el = document.getElementById(photo.id)) {
    const video = el && el.querySelector('video');
    if (!video) return;
    const resting = el.videoVisible === false || document.hidden;
    clearTimeout(el.videoRestTimer);
    if (resting) el.videoRestTimer = setTimeout(() => this.unloadVideo(photo, el), VIDEO_UNLOAD_AFTER);
    else this.reloadVideo(photo, el);
    video.muted = photo.muted;
    const play = !photo.paused && !resting;
    if (play && video.paused) video.play().catch(() => {});
    else if (!play && !video.paused) video.pause();
    el.classList.toggle('video-paused', photo.paused);
    const playBtn = el.querySelector('.video-play');
    const soundBtn = el.querySelector('.video-sound');
    playBtn.querySelector('img').src = `${ICON_DIR}${photo.paused ? 'video-play.svg' : 'video-pause.svg'}`;
    playBtn.title = t(photo.paused ? 'video.play' : 'video.pause');
    soundBtn.querySelector('img').src = `${ICON_DIR}${photo.muted ? 'video-mute.svg' : 'video-sound.svg'}`;
    soundBtn.title = t(photo.muted ? 'video.soundOn' : 'video.soundOff');
  },

  // 쉬는 영상 내려놓기 — 지금 장면을 작은 그림(poster)으로 남기고 영상 주소를 뗌 (재생기가 쓰던 메모리를 돌려줌)
  unloadVideo(photo, el) {
    const video = el.querySelector('video');
    if (!video || el.videoUnloaded || !video.getAttribute('src')) return;
    try {
      if (video.readyState >= 2 && video.videoWidth) {
        const scale = Math.min(1, VIDEO_POSTER_WIDTH / video.videoWidth);
        const shot = document.createElement('canvas');
        shot.width = Math.max(1, Math.round(video.videoWidth * scale));
        shot.height = Math.max(1, Math.round(video.videoHeight * scale));
        shot.getContext('2d').drawImage(video, 0, 0, shot.width, shot.height);
        video.poster = shot.toDataURL('image/jpeg', 0.82);
      }
    } catch (_) {}
    el.videoResume = video.currentTime || 0;
    el.videoUnloaded = true;
    video.pause();
    video.removeAttribute('src');
    video.load();
  },

  // 다시 보이면 불러와 쉬기 전 자리부터
  reloadVideo(photo, el) {
    const video = el.querySelector('video');
    if (!video || !el.videoUnloaded) return;
    el.videoUnloaded = false;
    const at = el.videoResume || 0;
    if (at) {
      video.addEventListener('loadedmetadata', () => {
        try { video.currentTime = video.duration ? at % video.duration : at; } catch (_) {}
      }, { once: true });
    }
    video.src = photo.src;
  },

  // 캔버스가 다른 창에 가려지거나 다시 보일 때 (app.js visibilitychange)
  refreshVideoRest() {
    this.photos.forEach(photo => { if (photo.media === 'video') this.applyVideoState(photo); });
  },

  // 재생 · 멈춤과 소리는 저장하지만 되돌리기에는 넣지 않음 (history.js 도 되돌릴 때 지금 값을 그대로 둠)
  toggleVideoPlay(id) {
    const photo = this.photos.find(p => p.id === id);
    if (!photo) return;
    photo.paused = !photo.paused;
    this.applyVideoState(photo);
    this.scheduleSave({ system: true });
  },

  toggleVideoSound(id) {
    const photo = this.photos.find(p => p.id === id);
    if (!photo) return;
    photo.muted = !photo.muted;
    this.applyVideoState(photo);
    this.scheduleSave({ system: true });
  },

  // 캡션 넣기: 틀 아래 여백에서 바로 씀 (Enter 끝 · Esc 취소) — 테이프 · 압정은 그대로 두고, 틀 없음이면 종이 틀로
  editPhotoCaption(photo) {
    const el = document.getElementById(photo.id);
    if (!el || this.captionEditingId === photo.id) return;
    if (!this.photoHasCaptionRoom(photo)) this.setPhotoFrame(photo, { frame: 'paper' });
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
    delete copy.z;                                    // 순서: 맨 위 (layer-order.js)
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
    this.selection.delete(id);
    this.scheduleSave();
  },
};

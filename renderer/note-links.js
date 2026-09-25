// 쪽지 속 인터넷 주소 — 쪽지 글 밑에 링크 · 영상 · 사진으로 보여 줌
//   보기 방식: '영상 · 사진 바로 보기'(embed) · '링크만'(link)
//     설정 › 쪽지 › 쪽지 속 링크 가 기본, 쪽지마다 우클릭 › 링크 보기 › 로 바꿈 (note.linkView)
//   바로 보기: 유튜브 · 비메오 → 쪽지 안 재생기, 영상 파일 주소(.mp4 …) → 영상, 사진 주소(.png …) → 사진
//             그 밖의 주소는 링크로. 영상 · 사진 밑에도 작은 링크 (누르면 브라우저에서 엶)
//   링크를 누르면 기본 브라우저에서 엶 (main.js open-external — http · https 만)
//   수정을 끝낼 때마다 글에서 주소를 다시 찾음 (notes.js stopEditing). 한 쪽지에 MAX_LINKS 개까지
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { ICON_DIR } from './constants.js';
import { t } from './i18n.js';

const MAX_LINKS = 4;
const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING = /[)\].,;:!?'"」』>]+$/;               // 문장 끝 문장부호는 주소에서 뺌
const VIDEO_EXT = /\.(mp4|m4v|webm|mov|ogv|ogg)(?:[?#]|$)/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif)(?:[?#]|$)/i;

// 유튜브 시작 시각 (t=90 · t=1m30s · start=90) → 초
function youtubeStart(params) {
  const raw = params.get('t') || params.get('start');
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
  return m ? (Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)) : 0;
}

// 주소 하나 → { url, kind: 'youtube' | 'vimeo' | 'video' | 'image' | 'link', embed?, host }
export function classifyLink(url) {
  let u;
  try {
    u = new URL(url);
  } catch (_) {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^www\.|^m\./, '');
  const out = { url: u.href, host, kind: 'link' };
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = /^\/(?:shorts|embed|live|v)\/([^/?#]+)/.exec(u.pathname);
      if (m) id = m[1];
    }
  }
  if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
    const start = youtubeStart(u.searchParams);
    return { ...out, kind: 'youtube', embed: `https://www.youtube-nocookie.com/embed/${id}?rel=0${start ? `&start=${start}` : ''}` };
  }
  if (host === 'vimeo.com') {
    const m = /^\/(\d+)/.exec(u.pathname);
    if (m) return { ...out, kind: 'vimeo', embed: `https://player.vimeo.com/video/${m[1]}` };
  }
  if (VIDEO_EXT.test(u.pathname)) return { ...out, kind: 'video' };
  if (IMAGE_EXT.test(u.pathname)) return { ...out, kind: 'image' };
  return out;
}

// 글에서 주소 찾기 (같은 주소는 한 번, 앞에서부터 MAX_LINKS 개)
export function findLinks(text) {
  const seen = new Set();
  const links = [];
  (String(text || '').match(URL_RE) || []).forEach(raw => {
    const link = classifyLink(raw.replace(TRAILING, ''));
    if (!link || seen.has(link.url) || links.length >= MAX_LINKS) return;
    seen.add(link.url);
    links.push(link);
  });
  return links;
}

export const noteLinkMethods = {
  // 쪽지 글 전부 (제목 · 본문 · 할 일) 에서 주소
  noteLinks(note) {
    if (note.type === 'code') return [];
    const parts = [note.title, note.content, ...(Array.isArray(note.items) ? note.items.map(it => it.text) : [])];
    return findLinks(parts.filter(Boolean).join('\n'));
  },

  // 'embed' · 'link' — 쪽지마다 정한 것, 없으면 설정
  noteLinkView(note) {
    if (note.linkView === 'embed' || note.linkView === 'link') return note.linkView;
    return (this.settings && this.settings.noteLinkView) === 'link' ? 'link' : 'embed';
  },

  setNoteLinkView(note, view) {
    if (this.noteLinkView(note) === view && note.linkView === view) return;
    this.record();
    note.linkView = view;
    this.refreshNoteLinks(note);
    this.touch(note);
  },

  // 쪽지 우클릭 › 링크 보기 › (주소가 있는 쪽지만)
  noteLinkMenuItem(note) {
    if (!this.noteLinks(note).length) return null;
    const current = this.noteLinkView(note);
    return {
      icon: 'menu-link.svg', label: t('menu.linkView'), arrow: true,
      submenu: ['embed', 'link'].map(view => ({
        label: t(`linkView.${view}`), current: current === view, action: () => this.setNoteLinkView(note, view),
      })),
    };
  },

  openLinkExternally(url) {
    if (window.canvasAPI && window.canvasAPI.openExternal) window.canvasAPI.openExternal(url);
  },

  // 쪽지 본문 밑의 링크 칸을 지금 글에 맞게 다시 (쪽지 본문을 다시 그리지 않고)
  refreshNoteLinks(note, el = document.getElementById(note.id)) {
    const body = el && el.querySelector('.note-body');
    if (!body) return;
    body.querySelectorAll(':scope > .note-links').forEach(box => box.remove());
    this.renderNoteLinks(note, body);
    this.fitNote(note, el);
  },

  refreshAllNoteLinks() {
    this.notes.forEach(note => this.refreshNoteLinks(note));
  },

  // 본문 밑에 링크 · 영상 · 사진 (renderNoteBody 가 부름)
  renderNoteLinks(note, body) {
    const links = this.noteLinks(note);
    if (!links.length) return;
    const embed = this.noteLinkView(note) === 'embed';
    const box = document.createElement('div');
    box.className = 'note-links';
    const refit = () => this.fitNote(note);
    links.forEach(link => {
      if (embed && link.kind !== 'link') box.appendChild(this.createLinkEmbed(link, refit));
      box.appendChild(this.createLinkChip(link, embed && link.kind !== 'link'));
    });
    body.appendChild(box);
  },

  // 링크 한 줄 — 누르면 브라우저에서 엶. small: 영상 · 사진 밑에 붙는 작은 줄
  createLinkChip(link, small) {
    const chip = document.createElement('a');
    chip.className = 'note-link-chip' + (small ? ' small' : '');
    chip.href = link.url;
    chip.title = `${t('link.open')}\n${link.url}`;
    chip.draggable = false;
    const icon = document.createElement('img');
    icon.src = `${ICON_DIR}note-link.svg`;
    icon.alt = '';
    icon.draggable = false;
    const text = document.createElement('span');
    const rest = link.url.replace(/^https?:\/\/(www\.|m\.)?/i, '').slice(link.host.length);
    const hostEl = document.createElement('b');
    hostEl.textContent = link.host;
    text.append(hostEl, document.createTextNode(rest.length > 1 ? rest : ''));
    chip.append(icon, text);
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.openLinkExternally(link.url);
    });
    return chip;
  },

  // 영상 · 사진 — 쪽지 너비에 맞춤 (영상 재생기는 16:9, 사진 · 영상 파일은 불러온 뒤 제 비율)
  createLinkEmbed(link, refit) {
    const wrap = document.createElement('div');
    wrap.className = `note-embed note-embed-${link.kind}`;
    if (link.kind === 'youtube' || link.kind === 'vimeo') {
      const frame = document.createElement('iframe');
      frame.src = link.embed;
      frame.loading = 'lazy';
      frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.title = link.host;
      wrap.appendChild(frame);
    } else if (link.kind === 'video') {
      const video = document.createElement('video');
      video.src = link.url;
      video.controls = true;
      video.preload = 'metadata';
      video.playsInline = true;
      video.addEventListener('loadedmetadata', () => {
        if (video.videoWidth && video.videoHeight) wrap.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
        refit();
      });
      video.addEventListener('error', () => { wrap.classList.add('broken'); refit(); });
      wrap.appendChild(video);
    } else {
      const img = document.createElement('img');
      img.src = link.url;
      img.alt = '';
      img.draggable = false;
      img.addEventListener('load', () => { wrap.classList.add('loaded'); refit(); });
      img.addEventListener('error', () => { wrap.classList.add('broken'); refit(); });
      wrap.appendChild(img);
    }
    return wrap;
  },
};

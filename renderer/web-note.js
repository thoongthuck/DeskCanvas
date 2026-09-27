// 웹 페이지 쪽지 — 쪽지 안에 인터넷 페이지 (쪽지 추가 › 웹 페이지)
//   쪽지 종류 'web' + note.url. 본문 = 주소 줄(뒤로 · 새로 고침 · 주소 · 브라우저에서 열기) + 페이지 (<webview>)
//   페이지는 앱과 떨어진 저장소(persist:web)에서 따로 돌아감 — 로그인 · 쿠키가 거기 남음 (main.js setupWebNotes)
//   누르기: 고르지 않은 쪽지는 페이지 위 덮개(web-shield)가 받아 쪽지를 고르고 옮김 · 휠은 캔버스 확대
//           고른 쪽지는 페이지를 바로 누르고 스크롤 · 글 입력 (페이지 안 우클릭은 뒤로 · 복사 · 링크 열기 …)
//   확대 · 축소: 페이지는 쪽지 크기(확대 1 기준)로 그리고 캔버스 배율만큼 줄이고 늘림 → 확대해도 페이지 모양이 그대로
//   메모리: 페이지 하나가 화면 프로세스를 하나 따로 씀 (수십 ~ 수백 MB)
//     화면에 보일 때 불러오고, 화면 밖에 WEB_UNLOAD_AFTER 넘게 있으면 내려놓고 마지막 모습 사진만 남김 → 다시 보이면 다시 불러옴
//     (화면 밖 페이지는 그려지지 않아 그때는 못 찍음 → 보이는 동안 다 불러온 뒤 · WEB_SHOT_EVERY 마다 찍어 둠)
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { t } from './i18n.js';

const WEB_PARTITION = 'persist:web';
const WEB_UNLOAD_AFTER = 60000;        // 화면 밖에 이만큼 있으면 내려놓음
const WEB_VISIBLE_MARGIN = 200;        // 화면 가장자리에서 이만큼 안쪽에 들어오면 미리 불러옴 (px)
const WEB_SHOT_EVERY = 30000;          // 보이는 페이지의 모습을 찍어 두는 틈 (내려놓을 때 남길 사진)

const SVG = {
  back: '<svg viewBox="0 0 20 20"><path d="M12 5L7 10l5 5"/></svg>',
  forward: '<svg viewBox="0 0 20 20"><path d="M8 5l5 5-5 5"/></svg>',
  reload: '<svg viewBox="0 0 20 20"><path d="M15.5 10a5.5 5.5 0 1 1-1.6-3.9"/><path d="M14.5 3v3.5H11"/></svg>',
  open: '<svg viewBox="0 0 20 20"><path d="M11 4h5v5"/><path d="M16 4l-7 7"/><path d="M14 11.5V15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3.5"/></svg>',
};

// 주소 칸에 넣은 글 → 열 주소 (주소처럼 생기지 않았으면 검색)
export function webAddress(input) {
  const text = String(input || '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (!/\s/.test(text) && /^[^./]+(\.[^./]+)+(\/.*)?$|^localhost(:\d+)?(\/.*)?$/i.test(text)) return `https://${text}`;
  return `https://www.google.com/search?q=${encodeURIComponent(text)}`;
}

// 주소 칸에 보일 글 (https:// 와 끝의 / 는 뺌)
const shortUrl = (url) => String(url || '').replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');

export const webNoteMethods = {
  // ---- 본문 (note-body.js renderNoteBody 가 부름) ----
  renderWebBody(note, body) {
    const bar = document.createElement('div');
    bar.className = 'web-bar';
    const button = (kind, titleKey, onClick) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `web-btn web-${kind}`;
      btn.title = t(titleKey);
      btn.innerHTML = SVG[kind];
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
      });
      return btn;
    };
    const address = document.createElement('input');
    address.className = 'web-address';
    address.spellcheck = false;
    address.placeholder = t('web.placeholder');
    address.value = shortUrl(note.url);
    address.addEventListener('focus', () => {
      address.value = note.url || '';
      address.select();
    });
    address.addEventListener('blur', () => { address.value = shortUrl(note.url); });
    address.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        const url = webAddress(address.value);
        if (url) this.navigateWebNote(note, url);
        if (this.editingId === note.id) this.stopEditing();
        else address.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        address.value = note.url || '';
        if (this.editingId === note.id) this.stopEditing();
        else address.blur();
      }
    });
    bar.append(
      button('back', 'web.back', () => { const wv = this.webView(note); if (wv && wv.canGoBack()) wv.goBack(); }),
      button('reload', 'web.reload', () => this.reloadWebNote(note)),
      address,
      button('open', 'web.open', () => { if (note.url) this.openLinkExternally(note.url); }),
    );
    // 주소 줄의 단추 · 주소 칸은 누르는 곳 — 쪽지 옮기기 · 글자칸 막기(notes.js)로 가지 않게 (쪽지 고르기는 selection.js 가 먼저 함)
    bar.addEventListener('mousedown', (e) => {
      if (e.target.closest('.web-btn, .web-address')) e.stopPropagation();
    });

    const box = document.createElement('div');
    box.className = 'web-view-box';
    const hint = document.createElement('div');
    hint.className = 'web-hint';
    hint.textContent = note.url ? '' : t('web.empty');
    const shield = document.createElement('div');
    shield.className = 'web-shield';
    box.append(hint, shield);
    body.append(bar, box);
    this.scheduleWebCheck();
  },

  webView(note) {
    const el = document.getElementById(note.id);
    return el ? el.querySelector('.web-view-box webview') : null;
  },

  // 주소를 바꿈 (주소 칸 · 새 쪽지) — 되돌리기 한 단계
  navigateWebNote(note, url) {
    if (!/^https?:\/\//i.test(url)) return;
    if (url !== note.url) {
      this.record();
      note.url = url;
      this.touch(note);
    }
    const el = document.getElementById(note.id);
    if (!el) return;
    el.querySelector('.web-address').value = shortUrl(url);
    el.querySelector('.web-hint').textContent = '';
    const wv = this.webView(note);
    if (wv) wv.loadURL(url).catch(() => {});
    else this.loadWebView(note, el);
  },

  reloadWebNote(note) {
    const wv = this.webView(note);
    if (wv) wv.reload();
    else if (note.url) this.loadWebView(note);
  },

  // ---- 페이지 불러오기 · 내려놓기 ----
  loadWebView(note, el = document.getElementById(note.id)) {
    if (!el || !note.url || this.webView(note)) return;
    const box = el.querySelector('.web-view-box');
    if (!box) return;
    clearTimeout(el.webRestTimer);
    el.webRestTimer = null;
    const wv = document.createElement('webview');
    wv.setAttribute('partition', WEB_PARTITION);
    wv.setAttribute('allowpopups', '');           // 로그인 창 같은 새 창은 main.js 가 정함 (새 탭 링크는 이 쪽지 안에서)
    wv.setAttribute('src', note.url);
    wv.addEventListener('did-start-loading', () => box.classList.add('loading'));
    wv.addEventListener('did-stop-loading', () => {
      box.classList.remove('loading');
      box.querySelector('.web-poster')?.remove();  // 내려놓을 때 남긴 사진 → 다시 불러왔으니 뗌
      clearTimeout(el.webShotSoon);
      el.webShotSoon = setTimeout(() => this.captureWebShot(note, el), 800);   // 다 그려진 뒤 모습
    });
    if (!this.webShotTimer) this.webShotTimer = setInterval(() => this.captureWebShots(), WEB_SHOT_EVERY);
    const follow = (e) => {                          // 페이지 안에서 옮겨 간 주소를 저장 (되돌리기에는 넣지 않음)
      if (e.isMainFrame === false || !/^https?:\/\//i.test(e.url || '') || e.url === note.url) return;
      note.url = e.url;
      const input = el.querySelector('.web-address');
      if (input && document.activeElement !== input) input.value = shortUrl(e.url);
      this.scheduleSave({ system: true });
    };
    wv.addEventListener('did-navigate', follow);
    wv.addEventListener('did-navigate-in-page', follow);
    wv.addEventListener('page-title-updated', (e) => { el.querySelector('.web-address').title = e.title || ''; });
    wv.addEventListener('did-fail-load', (e) => {
      if (!e.isMainFrame || e.errorCode === -3) return;           // -3: 다른 주소로 가느라 멈춘 것
      this.showWebError(note, el, e.errorDescription || String(e.errorCode));
    });
    wv.addEventListener('did-navigate', () => box.querySelector('.web-error')?.remove());
    wv.addEventListener('focus', () => {                           // 페이지를 누르면 (보통은 고른 뒤라 이미 골라져 있음)
      if (!this.selection.has(note.id)) this.selectItem(note.id);
    });
    wv.addEventListener('context-menu', (e) => this.openWebContextMenu(note, wv, e.params || {}));
    box.insertBefore(wv, box.querySelector('.web-shield'));
  },

  showWebError(note, el, message) {
    const box = el.querySelector('.web-view-box');
    if (!box) return;
    box.querySelector('.web-error')?.remove();
    const err = document.createElement('div');
    err.className = 'web-error';
    const text = document.createElement('div');
    text.textContent = t('web.failed', { msg: message });
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = t('web.retry');
    retry.addEventListener('mousedown', (e) => e.stopPropagation());
    retry.addEventListener('click', (e) => {
      e.stopPropagation();
      err.remove();
      this.reloadWebNote(note);
    });
    err.append(text, retry);
    box.insertBefore(err, box.querySelector('.web-shield'));
  },

  // 보이는 페이지의 지금 모습 (main.js web-snapshot) → el.webShot
  async captureWebShot(note, el) {
    const wv = el && el.querySelector('.web-view-box webview');
    const api = window.canvasAPI;
    if (!wv || !api || !api.webSnapshot || document.hidden || !this.webNoteVisible(note)) return;
    try {
      const shot = await api.webSnapshot(wv.getWebContentsId());
      if (shot) el.webShot = shot;
    } catch (_) {}
  },

  captureWebShots() {
    let loaded = 0;
    this.notes.forEach(note => {
      if (note.type !== 'web' || !this.webView(note)) return;
      loaded++;
      this.captureWebShot(note, document.getElementById(note.id));
    });
    if (!loaded) {                                   // 불러온 페이지가 없으면 멈춤 (다시 불러오면 loadWebView 가 켬)
      clearInterval(this.webShotTimer);
      this.webShotTimer = null;
    }
  },

  // 화면 밖에 오래 있던 페이지 — 떼어 내고 마지막으로 찍어 둔 모습만 남김 (메모리를 돌려줌)
  unloadWebView(note, el) {
    const wv = el && el.querySelector('.web-view-box webview');
    if (!wv) return;
    el.webRestTimer = null;
    clearTimeout(el.webShotSoon);
    const box = wv.parentNode;
    const shot = el.webShot;
    box.querySelector('.web-poster')?.remove();
    if (shot) {
      const poster = document.createElement('img');
      poster.className = 'web-poster';
      poster.src = shot;
      poster.alt = '';
      poster.draggable = false;
      box.insertBefore(poster, box.querySelector('.web-shield'));
    }
    wv.remove();
    box.classList.remove('loading');
  },

  // 화면(+ 조금 밖)에 보이는지 — 캘린더에서 겹쳐 숨은 쪽지는 안 보임
  webNoteVisible(note) {
    const el = document.getElementById(note.id);
    if (!el || !el.isConnected || this.noteBoardState(note).hidden) return false;
    const r = el.getBoundingClientRect();
    const m = WEB_VISIBLE_MARGIN;
    return r.right > -m && r.bottom > -m && r.left < window.innerWidth + m && r.top < window.innerHeight + m
      && r.width > 0 && r.height > 0;
  },

  // 화면이 움직일 때마다 (view.js updateUIPositions) — 조금 모아서 한 번
  scheduleWebCheck() {
    if (this.webCheckTimer) return;
    this.webCheckTimer = setTimeout(() => {
      this.webCheckTimer = null;
      this.refreshWebViews();
    }, 250);
  },

  refreshWebViews() {
    this.notes.forEach(note => {
      if (note.type !== 'web') return;
      const el = document.getElementById(note.id);
      if (!el) return;
      if (this.webNoteVisible(note)) {
        clearTimeout(el.webRestTimer);
        el.webRestTimer = null;
        if (note.url) this.loadWebView(note, el);
      } else if (this.webView(note) && !el.webRestTimer) {
        el.webRestTimer = setTimeout(() => this.unloadWebView(note, el), WEB_UNLOAD_AFTER);
      }
    });
  },

  // ---- 페이지 안 우클릭 ----
  //   x · y 는 페이지 안 자리 (확대 1 기준) → 캔버스 배율을 곱해 화면 자리로
  openWebContextMenu(note, wv, params) {
    const r = wv.getBoundingClientRect();
    const x = r.left + (params.x || 0) * this.zoom;
    const y = r.top + (params.y || 0) * this.zoom;
    const flags = params.editFlags || {};
    const items = [];
    if (params.linkURL && /^https?:\/\//i.test(params.linkURL)) {
      items.push(
        { icon: 'note-link.svg', label: t('web.openLinkHere'), action: () => this.navigateWebNote(note, params.linkURL) },
        { icon: 'note-link.svg', label: t('web.openLinkBrowser'), action: () => this.openLinkExternally(params.linkURL) },
        { icon: 'copy.svg', label: t('web.copyLink'), action: () => window.canvasAPI?.copyText?.(params.linkURL) },
        { separator: true },
      );
    }
    if (params.isEditable) {
      if (flags.canCut) items.push({ icon: 'copy.svg', label: t('web.cut'), action: () => wv.cut() });
      if (flags.canCopy) items.push({ icon: 'copy.svg', label: t('web.copy'), action: () => wv.copy() });
      if (flags.canPaste) items.push({ icon: 'copy.svg', label: t('web.paste'), action: () => wv.paste() });
      items.push({ icon: 'edit.svg', label: t('web.selectAll'), action: () => wv.selectAll() }, { separator: true });
    } else if (params.selectionText) {
      items.push({ icon: 'copy.svg', label: t('web.copy'), action: () => wv.copy() }, { separator: true });
    }
    if (wv.canGoBack()) items.push({ icon: 'arrow-left.svg', label: t('web.back'), action: () => wv.goBack() });
    if (wv.canGoForward()) items.push({ icon: 'arrow-right.svg', label: t('web.forward'), action: () => wv.goForward() });
    items.push(
      { icon: 'style-reset.svg', label: t('web.reload'), action: () => wv.reload() },
      { icon: 'note-link.svg', label: t('web.open'), action: () => { if (note.url) this.openLinkExternally(note.url); } },
    );
    this.ensureSelected(note.id);
    this.openContextMenu(items, x, y);
  },
};

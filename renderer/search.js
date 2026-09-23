// 찾기 — Ctrl+F 로 쪽지(제목 · 본문 · 할 일 · 코드) · 사진 캡션 · 파일 이름을 찾아 그 자리로 이동
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { t } from './i18n.js';

const MAX_RESULTS = 8;

// 쪽지에서 찾을 글 전부 (할 일 목록은 항목 글을 이어 붙임)
function noteText(note) {
  const items = Array.isArray(note.items) ? note.items.map(it => it.text || '').join('\n') : '';
  return `${note.title || ''}\n${note.content || ''}\n${items}`;
}

// 찾은 글자 주변만 잘라서 보여 줌
function snippet(text, query) {
  const flat = text.replace(/\s+/g, ' ').trim();
  const i = flat.toLowerCase().indexOf(query);
  if (i < 0) return flat.slice(0, 60);
  const start = Math.max(0, i - 20);
  return (start > 0 ? '…' : '') + flat.slice(start, start + 60) + (start + 60 < flat.length ? '…' : '');
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 찾은 부분을 굵게
function highlight(text, query) {
  const safe = escapeHtml(text);
  if (!query) return safe;
  const q = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safe.replace(new RegExp(q, 'gi'), m => `<mark>${m}</mark>`);
}

export const searchMethods = {
  openSearch() {
    let box = document.getElementById('search-box');
    if (!box) {
      box = document.createElement('div');
      box.id = 'search-box';
      box.innerHTML = `
        <div class="search-row">
          <input class="search-input" type="text" spellcheck="false">
          <span class="search-count"></span>
        </div>
        <div class="search-results"></div>`;
      document.body.appendChild(box);

      const input = box.querySelector('.search-input');
      input.addEventListener('input', () => this.runSearch(input.value));
      input.addEventListener('keydown', (e) => {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter' || e.key === 'ArrowDown') {
          e.preventDefault();
          this.stepSearch(e.shiftKey && e.key === 'Enter' ? -1 : 1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.stepSearch(-1);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          this.closeSearch();
        }
      });
      box.querySelector('.search-results').addEventListener('mousedown', (e) => {
        const row = e.target.closest('.search-result');
        if (!row) return;
        e.preventDefault();                          // 입력칸 포커스 유지
        this.jumpToResult(Number(row.dataset.index));
      });
    }
    const input = box.querySelector('.search-input');
    input.placeholder = t('search.placeholder');
    box.classList.add('open');
    input.focus();
    input.select();
    this.runSearch(input.value);
  },

  closeSearch() {
    const box = document.getElementById('search-box');
    if (!box || !box.classList.contains('open')) return false;
    box.classList.remove('open');
    box.querySelector('.search-input').blur();
    return true;
  },

  isSearchOpen() {
    const box = document.getElementById('search-box');
    return !!(box && box.classList.contains('open'));
  },

  runSearch(raw) {
    const query = (raw || '').trim().toLowerCase();
    const results = [];
    if (query) {
      this.notes.forEach(note => {
        const text = noteText(note);
        if (!text.toLowerCase().includes(query)) return;
        results.push({
          kind: 'note', item: note,
          label: note.title || snippet(note.content || text, '') || t('search.untitled'),
          detail: snippet(text, query),
        });
      });
      this.photos.forEach(photo => {
        if (!photo.caption || !photo.caption.toLowerCase().includes(query)) return;
        results.push({ kind: 'photo', item: photo, label: photo.caption, detail: t('search.photo') });
      });
      this.files.forEach(file => {
        if (!(file.name || '').toLowerCase().includes(query)) return;
        results.push({ kind: 'file', item: file, label: file.name, detail: t('search.file') });
      });
    }
    this.searchResults = results;
    this.searchIndex = -1;
    this.searchQuery = query;
    this.renderSearchResults();
  },

  renderSearchResults() {
    const box = document.getElementById('search-box');
    if (!box) return;
    const results = this.searchResults || [];
    const list = box.querySelector('.search-results');
    const count = box.querySelector('.search-count');

    if (!this.searchQuery) {
      count.textContent = '';
      list.innerHTML = '';
      return;
    }
    count.textContent = results.length
      ? `${this.searchIndex >= 0 ? this.searchIndex + 1 : 0}/${results.length}`
      : t('search.none');
    list.innerHTML = results.slice(0, MAX_RESULTS).map((r, i) => `
      <div class="search-result${i === this.searchIndex ? ' active' : ''}" data-index="${i}">
        <div class="search-label">${highlight(r.label, this.searchQuery)}</div>
        <div class="search-detail">${highlight(r.detail, this.searchQuery)}</div>
      </div>`).join('');
  },

  // Enter · ↓ 다음,  Shift+Enter · ↑ 이전 (끝에서는 처음으로 돌아감)
  stepSearch(dir) {
    const n = (this.searchResults || []).length;
    if (!n) return;
    const next = this.searchIndex < 0 ? (dir > 0 ? 0 : n - 1) : (this.searchIndex + dir + n) % n;
    this.jumpToResult(next);
  },

  jumpToResult(index) {
    const r = (this.searchResults || [])[index];
    if (!r) return;
    this.searchIndex = index;
    this.renderSearchResults();

    const item = r.item;
    if (r.kind === 'note') this.revealNoteOnBoard(item);   // 캘린더의 다른 달에 붙은 쪽지면 그 달을 펼침
    if (r.kind === 'file') this.revealFileInGroup(item);   // 접힌 파일 묶음 속 파일이면 묶음을 펼침
    const rect = this.itemRect(r.kind, item);
    const zoom = Math.max(this.zoom, 0.8);            // 너무 작게 보고 있었으면 읽을 만큼 키움
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    this.animateView({
      zoom,
      panX: this.viewWidth / 2 - cx * zoom,
      panY: this.viewHeight / 2 - cy * zoom,
    });
    this.selectItem(item.id);

    const el = document.getElementById(item.id);
    if (el) {
      el.classList.remove('search-hit');
      void el.offsetWidth;                            // 같은 쪽지를 다시 찾아도 반짝임이 다시 나오게
      el.classList.add('search-hit');
      clearTimeout(this.searchHitTimer);
      this.searchHitTimer = setTimeout(() => el.classList.remove('search-hit'), 1200);
    }
  },
};

// 고른 글자만 색 바꾸기 — 글 쪽지의 본문 · 할 일 줄 (가이드 8-1)
//   쪽지를 고치는 중에 글자를 끌어 고르고 우클릭하면 작은 색 막대가 뜸: 글자 색 6가지 · 직접 고르기 · 기본 색으로
//     (고른 글자가 없으면 우클릭은 쪽지 메뉴 그대로). 막대 밖을 누르면 닫힘
//   색은 글자 위치로 저장 (note.spans · item.spans = [{ s: 시작, e: 끝, c: '#RRGGBB' }]) — 글을 고치면 위치가 따라 움직이고,
//     색 칠한 글 바로 뒤에 이어 쓰거나 색 칠한 글을 바꿔 쓰면 같은 색 (워드처럼)
//   그리기: 글자칸 뒤에 같은 글을 색을 입혀 그린 층(.ink-mirror)을 두고, 색이 있으면 글자칸 글은 투명 (마크다운 편집기와 같은 방식)
//   쪽지 전체 글자 색(스타일 창)은 따로 — 칠하지 않은 글이 그 색
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { INK_COLORS } from './constants.js';
import { t } from './i18n.js';

const HEX = /^#[0-9A-F]{6}$/i;

// 저장된 색 칸을 믿을 수 있게 — 범위 안 · 겹치지 않게 · 붙은 같은 색은 하나로
export function cleanSpans(spans, length) {
  if (!Array.isArray(spans) || !spans.length) return [];
  const list = spans
    .filter(sp => sp && Number.isInteger(sp.s) && Number.isInteger(sp.e) && HEX.test(String(sp.c)))
    .map(sp => ({ s: Math.max(0, sp.s), e: Math.min(length, sp.e), c: String(sp.c).toUpperCase() }))
    .filter(sp => sp.e > sp.s)
    .sort((a, b) => a.s - b.s);
  const out = [];
  list.forEach(sp => {
    const last = out[out.length - 1];
    if (last && sp.s < last.e) sp = { ...sp, s: last.e };           // 겹치면 앞의 것이 이김
    if (sp.e <= sp.s) return;
    if (last && last.e === sp.s && last.c === sp.c) last.e = sp.e;
    else out.push(sp);
  });
  return out;
}

// 글이 바뀌면 색 칸 위치도 — caret: 바꾼 뒤 글자 커서 자리 (같은 글자가 이어져도 어디를 고쳤는지 알게)
export function shiftSpans(spans, oldText, newText, caret = null) {
  if (!spans || !spans.length || oldText === newText) return spans || [];
  const oldLen = oldText.length;
  const newLen = newText.length;
  let prefix = 0;
  const min = Math.min(oldLen, newLen);
  while (prefix < min && oldText[prefix] === newText[prefix]) prefix++;
  let suffix = 0;
  while (suffix < min - prefix && oldText[oldLen - 1 - suffix] === newText[newLen - 1 - suffix]) suffix++;
  // 커서가 있으면 고친 곳 끝 = 커서 (예: 'aa' 가운데에 'a' 를 넣어도 맞게)
  if (Number.isInteger(caret) && caret >= 0 && caret <= newLen) {
    const tail = newLen - caret;
    if (tail <= oldLen && oldText.slice(oldLen - tail) === newText.slice(caret)) {
      suffix = tail;
      prefix = Math.min(prefix, caret, oldLen - tail);
    }
  }
  const p = prefix;
  const oldEnd = oldLen - suffix;                  // 지운 곳 [p, oldEnd)
  const ins = newLen - suffix - p;                 // 넣은 글 길이
  const removed = oldEnd - p;
  const delta = ins - removed;
  const mapS = (x) => (x < p ? x : x >= oldEnd ? x + delta : p);
  const mapE = (x) => {
    if (x < p) return x;
    if (x === p) return removed === 0 ? p + ins : p;   // 색 칠한 글 바로 뒤에 이어 쓰면 같은 색
    if (x < oldEnd) return p + ins;                     // 색 칠한 글을 바꿔 쓰면 같은 색
    return x + delta;
  };
  return cleanSpans(spans.map(sp => ({ s: mapS(sp.s), e: mapE(sp.e), c: sp.c })), newLen);
}

// [s, e) 를 color 로 (null 이면 색을 뺌 — 쪽지 글자 색으로)
export function paintSpans(spans, s, e, color, length) {
  const out = [];
  (spans || []).forEach(sp => {
    if (sp.e <= s || sp.s >= e) { out.push(sp); return; }
    if (sp.s < s) out.push({ s: sp.s, e: s, c: sp.c });
    if (sp.e > e) out.push({ s: e, e: sp.e, c: sp.c });
  });
  if (color) out.push({ s, e, c: color });
  return cleanSpans(out, length);
}

function inkHtml(text, spans) {
  const esc = (s) => s.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
  let html = '';
  let pos = 0;
  spans.forEach(sp => {
    if (sp.s > pos) html += esc(text.slice(pos, sp.s));
    html += `<span style="color:${sp.c}">${esc(text.slice(sp.s, sp.e))}</span>`;
    pos = sp.e;
  });
  return `${html}${esc(text.slice(pos))}\n`;        // 마지막 빈 줄도 높이를 갖게
}

export const textColorMethods = {
  // 글자칸을 색 층과 함께 감쌈 — access: { spans() → 지금 색 칸, set(spans) }
  inkField(note, ta, access) {
    const wrap = document.createElement('div');
    wrap.className = `ink-field ink-${ta.className}`;
    const mirror = document.createElement('div');
    mirror.className = 'ink-mirror';
    mirror.setAttribute('aria-hidden', 'true');
    wrap.append(mirror, ta);
    const sync = () => { mirror.style.transform = ta.scrollTop ? `translateY(${-ta.scrollTop}px)` : ''; };
    ta.inkAccess = access;
    ta.inkPaint = () => {
      const spans = access.spans();
      const on = spans.length > 0;
      ta.classList.toggle('inked', on);
      mirror.innerHTML = on ? inkHtml(ta.value, spans) : '';
      sync();
    };
    ta.addEventListener('scroll', sync);
    // 고른 글자 위에서 우클릭 → 색 막대 (쪽지 메뉴 대신)
    ta.addEventListener('contextmenu', (e) => {
      const s = ta.selectionStart;
      const end = ta.selectionEnd;
      if (this.editingId !== note.id || ta.readOnly || s === end) return;
      e.preventDefault();
      e.stopPropagation();
      this.closeMenus();
      this.showTextColorBar(note, ta, s, end, { x: e.clientX, y: e.clientY });
    });
    // 고른 것을 풀면 막대도 닫음
    const collapsed = () => {
      const bar = this.textColorBar;
      if (bar && bar.field === ta && !bar.picking && ta.selectionStart === ta.selectionEnd) this.hideTextColorBar();
    };
    ta.addEventListener('keyup', collapsed);
    ta.addEventListener('blur', () => setTimeout(() => {
      if (this.textColorBar && this.textColorBar.field === ta && !this.textColorBar.picking && document.activeElement !== ta) this.hideTextColorBar();
    }, 0));
    ta.inkPaint();
    return wrap;
  },

  // 글을 고칠 때 (note-body.js input) — 색 칸 위치를 따라 옮김
  shiftFieldSpans(ta, oldText) {
    const access = ta.inkAccess;
    if (!access) return;
    const spans = access.spans();
    if (spans.length) access.set(shiftSpans(spans, oldText, ta.value, ta.selectionEnd));
    ta.inkPaint();
  },

  // ---- 색 막대 ----
  //   at: 우클릭한 자리 (막대 왼쪽 위가 그 자리 — 우클릭 메뉴처럼)
  showTextColorBar(note, ta, s, e, at = null) {
    let bar = this.textColorBar;
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'text-color-bar';
      bar.addEventListener('mousedown', (ev) => {       // 글자칸의 고른 글자가 풀리지 않게
        // 직접 고르기: 누르는 순간 글자칸에서 초점이 빠져 막대가 닫히려 함 → 색 창을 여는 중으로 표시 (클릭은 그 뒤에 옴)
        if (ev.target.closest('.custom-dot')) bar.picking = true;
        if (!ev.target.closest('input')) ev.preventDefault();
      });
      document.body.appendChild(bar);
      this.textColorBar = bar;
      // 막대 밖을 누르면 닫힘 (색 고르는 창을 여는 동안은 그대로)
      this.textColorBarOutside = (ev) => {
        if (this.textColorBar && !this.textColorBar.contains(ev.target) && !this.textColorBar.picking) this.hideTextColorBar();
      };
      document.addEventListener('mousedown', this.textColorBarOutside, true);
    }
    bar.note = note;
    bar.field = ta;
    bar.range = { s, e };
    bar.innerHTML = '';
    const apply = (color) => this.applyTextColor(bar.note, bar.field, bar.range.s, bar.range.e, color);
    const title = document.createElement('span');
    title.className = 'text-color-title';
    title.textContent = t('textColor.title');
    bar.appendChild(title);
    Object.entries(INK_COLORS).forEach(([key, value]) => {
      if (key === 'default') return;
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'text-color-dot';
      dot.style.color = value;
      dot.textContent = t('sampleChar');
      dot.title = t(`ink_${key}`);
      dot.addEventListener('click', () => apply(value));
      bar.appendChild(dot);
    });
    // 지난번에 직접 고른 색 — 같은 색을 다시 쓸 때 한 번에 (색 창에서 같은 색으로 확인하면 바뀐 게 없어 알 수 없음)
    const last = this.lastTextColor;
    if (last && !Object.values(INK_COLORS).some(v => v.toUpperCase() === last)) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'text-color-dot';
      dot.style.color = last;
      dot.textContent = t('sampleChar');
      dot.title = last;
      dot.addEventListener('click', () => apply(last));
      bar.appendChild(dot);
    }
    const custom = this.createCustomColorDot({
      className: 'text-color-dot',
      current: false,
      value: last || '#E11D48',
      onStart: () => { bar.picking = true; },
      onInput: () => {},
      onDone: (hex) => {
        bar.picking = false;
        this.lastTextColor = hex;
        apply(hex);
      },
      onCancel: () => {                               // 그냥 닫음 → 막대는 둔 채 글자칸으로 돌아가 고른 글자 그대로
        bar.picking = false;
        if (this.textColorBar !== bar || this.editingId !== bar.note.id) return;
        bar.field.focus();
        bar.field.setSelectionRange(bar.range.s, bar.range.e);
      },
    });
    bar.appendChild(custom);
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'text-color-clear';
    clear.textContent = t('textColor.clear');
    clear.addEventListener('click', () => apply(null));
    bar.appendChild(clear);

    // 자리: 우클릭한 곳 오른쪽 아래 (화면 밖으로 나가면 안쪽으로). 우클릭이 아니면 글자칸 위
    bar.style.display = 'flex';
    const r = ta.getBoundingClientRect();
    const p = at || { x: r.left, y: r.top - 40 };
    const w = bar.offsetWidth;
    const h = bar.offsetHeight;
    bar.style.left = `${Math.max(4, Math.min(window.innerWidth - w - 4, p.x))}px`;
    bar.style.top = `${Math.max(4, Math.min(window.innerHeight - h - 4, p.y + 4))}px`;
  },

  hideTextColorBar() {
    const bar = this.textColorBar;
    if (!bar) return;
    bar.remove();
    this.textColorBar = null;
    if (this.textColorBarOutside) document.removeEventListener('mousedown', this.textColorBarOutside, true);
    this.textColorBarOutside = null;
  },

  applyTextColor(note, ta, s, e, color) {
    if (!ta || !ta.inkAccess || s === e) return;
    this.record();
    ta.inkAccess.set(paintSpans(ta.inkAccess.spans(), s, e, color, ta.value.length));
    ta.inkPaint();
    this.touch(note);
    if (this.editingId === note.id) {
      ta.focus();
      ta.setSelectionRange(s, e);
    }
    this.hideTextColorBar();
  },
};

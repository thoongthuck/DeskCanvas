// 고른 글자만 서식 — 제목 · 본문 · 할 일 줄 · 표 칸 · 마크다운 (가이드 8-1)
//   마크다운은 서식 층 대신 원문에 기호를 넣고 뺌 (아래 '마크다운' · renderer/markdown.js)
//   쪽지를 고치는 중에 글자를 끌어 고르고 우클릭하면 서식 막대가 뜸:
//     굵게 · 기울임 · 밑줄 · 취소선 · 줄 정렬 / 형광펜 · 서식 지우기 / 글자 색 6가지 · 직접 고르기 · 기본 색으로
//     (고른 글자가 없으면 우클릭은 쪽지 메뉴 그대로). 막대 밖을 누르면 닫힘. Ctrl+B · I · U 로도 (고른 채)
//   서식은 글자 위치로 저장 (note.spans · note.titleSpans · item.spans · note.table.spans[행][열]
//     = [{ s: 시작, e: 끝, c?: 글자 색, h?: 형광펜 색, b?: 굵게, i?: 기울임, u?: 밑줄, x?: 취소선, a?: 줄 정렬 }], 겹치지 않는 조각)
//     줄 정렬(a)은 고른 글자가 걸친 줄 전체(줄 끝 줄바꿈까지)에 — 줄의 첫 글자에 붙은 정렬이 그 줄의 정렬
//       글자칸은 한 칸에 정렬이 하나뿐이라 줄마다 다른 정렬은 수정을 마친 뒤(보기)에만 보임 — 고치는 중에는 쪽지 정렬 그대로
//     글을 고치면 위치가 따라 움직이고, 서식 있는 글 바로 뒤에 이어 쓰거나 바꿔 쓰면 같은 서식 (워드처럼)
//   그리기: 글자칸 뒤에 같은 글을 서식을 입혀 그린 층(.ink-mirror)을 두고, 서식이 있으면 글자칸 글은 투명 (마크다운 편집기와 같은 방식)
//     글자칸과 커서 자리가 어긋나지 않게 글자 너비가 바뀌는 서식은 없음 — 굵게는 글자 테두리를 칠해서, 기울임은 똑바른 글자를 기울여서
//     (글자 크기 · 글꼴은 쪽지 전체만 — 스타일 창)
//   쪽지 전체 글자 색(스타일 창)은 따로 — 칠하지 않은 글이 그 색
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { INK_COLORS, NOTE_ALIGNS } from './constants.js';
import { t } from './i18n.js';
import { alignIcon } from './style-panel.js';

const HEX = /^#[0-9A-F]{6}$/i;
const FLAGS = ['b', 'i', 'u', 'x'];                   // 굵게 · 기울임 · 밑줄 · 취소선
const KEYS = ['c', 'h', 'a', ...FLAGS];

// 형광펜 색 (칠한 글 뒤 바탕)
export const HIGHLIGHTS = ['#FDE68A', '#BBF7D0', '#FBCFE8', '#BFDBFE', '#FED7AA'];

// 조각의 서식만 — 올바른 값만 남김
function styleOf(sp) {
  const st = {};
  if (HEX.test(String(sp.c || ''))) st.c = String(sp.c).toUpperCase();
  if (HEX.test(String(sp.h || ''))) st.h = String(sp.h).toUpperCase();
  if (NOTE_ALIGNS.includes(sp.a)) st.a = sp.a;
  FLAGS.forEach(k => { if (sp[k]) st[k] = 1; });
  return st;
}
const sameStyle = (a, b) => KEYS.every(k => (a[k] || null) === (b[k] || null));

// 저장된 서식 조각을 믿을 수 있게 — 범위 안 · 겹치지 않게 · 서식 없는 조각은 버림 · 붙은 같은 서식은 하나로
export function cleanSpans(spans, length) {
  if (!Array.isArray(spans) || !spans.length) return [];
  const list = spans
    .filter(sp => sp && Number.isInteger(sp.s) && Number.isInteger(sp.e))
    .map(sp => ({ s: Math.max(0, sp.s), e: Math.min(length, sp.e), ...styleOf(sp) }))
    .filter(sp => sp.e > sp.s && Object.keys(sp).length > 2)
    .sort((a, b) => a.s - b.s);
  const out = [];
  list.forEach(sp => {
    const last = out[out.length - 1];
    if (last && sp.s < last.e) sp = { ...sp, s: last.e };           // 겹치면 앞의 것이 이김
    if (sp.e <= sp.s) return;
    if (last && last.e === sp.s && sameStyle(last, sp)) last.e = sp.e;
    else out.push(sp);
  });
  return out;
}

// [s, e) 가 모두 그 서식인지 (굵게 단추를 켤지 끌지)
export function spansHave(spans, s, e, key) {
  let covered = 0;
  (spans || []).forEach(sp => { if (sp[key]) covered += Math.max(0, Math.min(sp.e, e) - Math.max(sp.s, s)); });
  return e > s && covered >= e - s;
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
  return cleanSpans(spans.map(sp => ({ ...sp, s: mapS(sp.s), e: mapE(sp.e) })), newLen);
}

// [s, e) 에 서식을 더하거나 뺌 — patch: { c: '#RRGGBB' | null, h, b: 1 | null, … } (null 이면 뺌)
//   예전처럼 색만 주면 (문자열 · null) 글자 색
export function paintSpans(spans, s, e, patch, length) {
  if (typeof patch === 'string' || patch === null) patch = { c: patch };
  const put = (seg) => {
    const o = { ...seg };
    Object.entries(patch).forEach(([k, v]) => { if (v) o[k] = v; else delete o[k]; });
    return o;
  };
  const out = [];
  let cursor = s;
  cleanSpans(spans, length).forEach(sp => {
    if (sp.e <= s || sp.s >= e) { out.push(sp); return; }
    if (sp.s < s) out.push({ ...sp, e: s });
    const a = Math.max(sp.s, s), b = Math.min(sp.e, e);
    if (a > cursor) out.push(put({ s: cursor, e: a }));        // 서식 없던 틈
    out.push(put({ ...sp, s: a, e: b }));
    cursor = b;
    if (sp.e > e) out.push({ ...sp, s: e });
  });
  if (cursor < e) out.push(put({ s: cursor, e }));
  return cleanSpans(out, length);
}

// 줄 [ls, le) 의 정렬 — 그 줄 첫 글자(빈 줄이면 줄바꿈)에 붙은 것, 없으면 null (쪽지 정렬)
export function lineAlignAt(spans, text, pos) {
  const ls = text.lastIndexOf('\n', pos - 1) + 1;
  if (ls >= text.length) return null;
  const sp = (spans || []).find(x => x.s <= ls && x.e > ls);
  return (sp && sp.a) || null;
}

// 고른 [s, e) 가 걸친 줄 전체 — [첫 줄 시작, 마지막 줄 끝의 줄바꿈 다음)
export function lineRange(text, s, e) {
  const ls = text.lastIndexOf('\n', s - 1) + 1;
  const last = e > s ? e - 1 : s;
  const nl = text.indexOf('\n', last);
  return { s: ls, e: nl < 0 ? text.length : nl + 1 };
}

// 서식을 입힌 글 (층 · 연대표 그림이 씀) — lines: 줄마다 따로 (줄 정렬을 보일 때, 수정 중이 아닐 때)
export function inkHtml(text, spans, { lines = false } = {}) {
  if (lines) {
    const out = [];
    let ls = 0;
    text.split('\n').forEach((line) => {
      const le = ls + line.length;
      const align = ls < text.length ? lineAlignAt(spans, text, ls) : null;
      const part = spans.filter(x => x.e > ls && x.s < le)
        .map(x => ({ ...x, s: Math.max(0, x.s - ls), e: Math.min(line.length, x.e - ls) }));
      const inner = line.length ? inkHtml(line, part).slice(0, -1) : '<br>';   // 끝에 붙는 줄바꿈은 뺌
      out.push(`<div class="ink-line"${align ? ` style="text-align:${align}"` : ''}>${inner}</div>`);
      ls = le + 1;
    });
    return out.join('');
  }
  const esc = (s) => s.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
  let html = '';
  let pos = 0;
  spans.forEach(sp => {
    if (sp.s > pos) html += esc(text.slice(pos, sp.s));
    const cls = [sp.b ? 'ink-b' : '', sp.i ? 'ink-i' : '', sp.h ? 'ink-hl' : ''].filter(Boolean).join(' ');
    const css = [];
    if (sp.c) css.push(`color:${sp.c}`);
    if (sp.h) css.push(`background-color:${sp.h}`);
    const deco = [sp.u ? 'underline' : '', sp.x ? 'line-through' : ''].filter(Boolean).join(' ');
    if (deco) css.push(`text-decoration-line:${deco}`);
    html += `<span${cls ? ` class="${cls}"` : ''}${css.length ? ` style="${css.join(';')}"` : ''}>${esc(text.slice(sp.s, sp.e))}</span>`;
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
      // 줄 정렬은 수정 중이 아닐 때만 (고치는 중에는 글자칸 커서와 맞게 한 줄로 흘려 그림)
      const lines = on && this.editingId !== note.id && spans.some(sp => sp.a);
      mirror.innerHTML = on ? inkHtml(ta.value, spans, { lines }) : '';
      sync();
    };
    ta.addEventListener('scroll', sync);
    // Ctrl+B · I · U — 고른 글자 굵게 · 기울임 · 밑줄 (한 번 더 누르면 뺌)
    ta.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.isComposing) return;
      const key = { b: 'b', i: 'i', u: 'u' }[(e.key || '').toLowerCase()];
      if (!key || ta.readOnly || this.editingId !== note.id) return;
      e.preventDefault();
      e.stopPropagation();
      if (ta.selectionStart === ta.selectionEnd) return;
      this.toggleTextStyle(note, ta, ta.selectionStart, ta.selectionEnd, key);
    });
    // 고른 글자 위에서 우클릭 → 서식 막대 (쪽지 메뉴 대신)
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

  // ---- 서식 막대 ----
  //   한 글자칸의 고른 글자 (ta, s, e) · 표에서 고른 여러 칸 (cells: () → [{ ta, s: 0, e: 글 길이 }], table: 표 단추)
  //   · 마크다운 원문의 고른 글자 (md: 글자칸 — 서식 대신 기호를 넣고 뺌, 아래 '마크다운')
  //   단추가 하는 일은 ops 로 (inkOps · mdOps). at: 우클릭한 자리 (막대 왼쪽 위가 그 자리 — 우클릭 메뉴처럼)
  showTextColorBar(note, ta, s, e, at = null, { cells = null, table = null, md = null } = {}) {
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
    bar.field = cells || md ? null : ta;
    bar.range = { s, e };
    bar.cells = cells;
    bar.table = table;
    bar.md = md;
    if (at) bar.at = at;
    bar.innerHTML = '';
    const ops = md ? this.mdOps(bar) : this.inkOps(bar);

    // 첫 줄: 굵게 · 기울임 · 밑줄 · 취소선 | 줄 정렬 (마크다운은 없음)
    const styleRow = document.createElement('div');
    styleRow.className = 'text-style-row';
    [['b', 'B', 'textStyle.bold'], ['i', 'I', 'textStyle.italic'], ['u', 'U', 'textStyle.underline'], ['x', 'S', 'textStyle.strike']].forEach(([key, label, tip]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `text-style-btn text-style-${key}` + (ops.has(key) ? ' current' : '');
      btn.textContent = label;
      btn.title = t(tip);
      btn.addEventListener('click', () => ops.toggle(key));
      styleRow.appendChild(btn);
    });
    if (ops.align) {
      const gap = document.createElement('span');
      gap.className = 'text-style-sep';
      styleRow.appendChild(gap);
      // 줄 정렬 — 고른 글자가 걸친 줄 전체 (지금 줄의 정렬에 표시)
      const nowAlign = ops.alignNow();
      NOTE_ALIGNS.forEach(key => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'text-style-btn text-style-align' + (nowAlign === key ? ' current' : '');
        btn.innerHTML = alignIcon(key);
        btn.title = t(`textStyle.align_${key}`);
        btn.addEventListener('click', () => ops.align(key));
        styleRow.appendChild(btn);
      });
    }
    bar.appendChild(styleRow);

    // 둘째 줄: 형광펜 · 없음 | 서식 지우기
    const hlRow = document.createElement('div');
    hlRow.className = 'text-style-row';
    const hlTitle = document.createElement('span');
    hlTitle.className = 'text-color-title';
    hlTitle.textContent = t('textStyle.highlight');
    hlRow.appendChild(hlTitle);
    HIGHLIGHTS.forEach(hex => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'text-hl-dot' + (ops.hlHas(hex) ? ' current' : '');
      dot.style.background = hex;
      dot.title = t('textStyle.highlight');
      dot.addEventListener('click', () => ops.highlight(hex));
      hlRow.appendChild(dot);
    });
    const noHl = document.createElement('button');
    noHl.type = 'button';
    noHl.className = 'text-hl-dot text-hl-none';
    noHl.title = t('textStyle.noHighlight');
    noHl.addEventListener('click', () => ops.highlight(null));
    hlRow.appendChild(noHl);
    const clearAll = document.createElement('button');
    clearAll.type = 'button';
    clearAll.className = 'text-color-clear text-style-clear-all';
    clearAll.textContent = t('textStyle.clearAll');
    clearAll.addEventListener('click', () => ops.clear());
    hlRow.appendChild(clearAll);
    bar.appendChild(hlRow);

    // 셋째 줄: 글자 색
    const colorRow = document.createElement('div');
    colorRow.className = 'text-style-row';
    bar.appendChild(colorRow);
    const title = document.createElement('span');
    title.className = 'text-color-title';
    title.textContent = t('textColor.title');
    colorRow.appendChild(title);
    Object.entries(INK_COLORS).forEach(([key, value]) => {
      if (key === 'default') return;
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'text-color-dot';
      dot.style.color = value;
      dot.textContent = t('sampleChar');
      dot.title = t(`ink_${key}`);
      dot.addEventListener('click', () => ops.color(value.toUpperCase()));
      colorRow.appendChild(dot);
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
      dot.addEventListener('click', () => ops.color(last));
      colorRow.appendChild(dot);
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
        ops.color(hex);
      },
      onCancel: () => {                               // 그냥 닫음 → 막대는 둔 채 글자칸으로 돌아가 고른 글자 그대로
        bar.picking = false;
        if (this.textColorBar !== bar || this.editingId !== bar.note.id) return;
        this.barDone(bar, { redraw: false });
      },
    });
    colorRow.appendChild(custom);
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'text-color-clear';
    clear.textContent = t('textColor.clear');
    clear.addEventListener('click', () => ops.color(null));
    colorRow.appendChild(clear);

    // 넷째 줄 (표에서 여러 칸을 골랐을 때): 열 너비 같게 · 행 높이 같게 · 칸 비우기 (table-note.js)
    if (table) {
      const tableRow = document.createElement('div');
      tableRow.className = 'text-style-row';
      const tt = document.createElement('span');
      tt.className = 'text-color-title';
      tt.textContent = t('menu.table');
      tableRow.appendChild(tt);
      table.actions.forEach(act => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'text-color-clear text-table-act';
        btn.textContent = t(act.label);
        btn.disabled = !!act.disabled;
        btn.addEventListener('click', () => { if (!act.disabled) act.run(); });
        tableRow.appendChild(btn);
      });
      bar.appendChild(tableRow);
    }

    // 자리: 우클릭한 곳 오른쪽 아래 (화면 밖으로 나가면 안쪽으로). 우클릭이 아니면 글자칸 위 · 다시 그릴 때는 그 자리
    bar.style.display = 'flex';
    const anchor = ops.anchor();
    const r = anchor ? anchor.getBoundingClientRect() : { left: 100, top: 100 };
    const p = at || bar.at || { x: r.left, y: r.top - 76 };
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

  // 서식 층이 있는 글자칸들(본문 · 제목 · 할 일 · 표 칸)의 막대 단추
  inkOps(bar) {
    const targets = () => this.barTargets(bar);
    const spansOf = (x) => x.ta.inkAccess.spans();
    const all = (test) => {
      const list = targets();
      return list.length > 0 && list.every(test);
    };
    const edit = (fn) => this.barEdit(bar, fn);
    return {
      has: (key) => all(x => spansHave(spansOf(x), x.s, x.e, key)),
      toggle: (key) => { if (this.toggleInk(bar.note, targets(), key)) this.barDone(bar); },
      alignNow: () => {
        const f = targets()[0];
        return (f && lineAlignAt(spansOf(f), f.ta.value, f.s)) || bar.note.align || 'left';
      },
      align: (key) => { if (this.alignInk(bar.note, targets(), key)) this.barDone(bar); },
      hlHas: (hex) => all(x => spansOf(x).some(sp => sp.h === hex && sp.s <= x.s && sp.e >= x.e)),
      highlight: (hex) => edit((x, sp) => paintSpans(sp, x.s, x.e, { h: hex }, x.ta.value.length)),
      color: (hex) => edit((x, sp) => paintSpans(sp, x.s, x.e, { c: hex }, x.ta.value.length)),
      clear: () => edit((x, sp) => {                  // 글자 서식 · 걸친 줄의 정렬까지
        const len = x.ta.value.length;
        const r = lineRange(x.ta.value, x.s, x.e);
        return paintSpans(paintSpans(sp, x.s, x.e, { c: null, h: null, b: null, i: null, u: null, x: null }, len), r.s, r.e, { a: null }, len);
      }),
      anchor: () => bar.field || (targets()[0] && targets()[0].ta),
    };
  },

  // 막대가 다룰 글 — 한 글자칸의 고른 글자, 또는 고른 여러 칸의 글 전체 (빈 칸은 서식을 둘 글자가 없어 빠짐)
  barTargets(bar) {
    if (bar.cells) return bar.cells().filter(x => x.ta && x.ta.inkAccess && x.e > x.s);
    return bar.field && bar.field.inkAccess ? [{ ta: bar.field, s: bar.range.s, e: bar.range.e }] : [];
  },

  // 막대에서 고친 뒤 — 글자칸이면 고른 글자 그대로 커서를 돌려주고, 막대를 새 값으로
  barDone(bar, { redraw = true } = {}) {
    const field = bar.field || bar.md;
    if (field && this.editingId === bar.note.id) {
      field.focus();
      field.setSelectionRange(bar.range.s, bar.range.e);
    }
    if (redraw && this.textColorBar === bar) {
      this.showTextColorBar(bar.note, bar.field, bar.range.s, bar.range.e, null, {
        cells: bar.cells, md: bar.md,
        table: bar.cells && bar.table && bar.table.refresh ? bar.table.refresh() : bar.table,
      });
    }
  },

  barEdit(bar, fn) {
    if (this.editInk(bar.note, this.barTargets(bar), fn)) this.barDone(bar);
  },

  // 여러 글자칸의 서식을 한 번에 — targets: [{ ta, s, e }], fn(x, 지금 서식) → 새 서식 (되돌리기 한 단계)
  editInk(note, targets, fn) {
    const list = (targets || []).filter(x => x.ta && x.ta.inkAccess && x.e > x.s);
    if (!list.length) return false;
    this.record();
    list.forEach(x => {
      x.ta.inkAccess.set(fn(x, x.ta.inkAccess.spans()));
      x.ta.inkPaint();
    });
    this.touch(note);
    return true;
  },

  // 굵게 · 기울임 · 밑줄 · 취소선 — 고른 글자가 모두 그 서식이면 빼고, 아니면 모두에
  toggleInk(note, targets, key) {
    const list = (targets || []).filter(x => x.ta && x.ta.inkAccess && x.e > x.s);
    const on = list.length > 0 && list.every(x => spansHave(x.ta.inkAccess.spans(), x.s, x.e, key));
    return this.editInk(note, list, (x, sp) => paintSpans(sp, x.s, x.e, { [key]: on ? null : 1 }, x.ta.value.length));
  },

  // 줄 정렬 — 고른 글자가 걸친 줄 전체에. 쪽지 정렬과 같으면 따로 적지 않음 (쪽지 정렬을 따름) · 수정을 마치면 보임
  alignInk(note, targets, align) {
    const same = align === (note.align || 'left');
    const lines = (targets || []).filter(x => x.ta).map(x => ({ ta: x.ta, ...lineRange(x.ta.value, x.s, x.e) }));
    return this.editInk(note, lines, (x, sp) => paintSpans(sp, x.s, x.e, { a: same ? null : align }, x.ta.value.length));
  },

  applyTextColor(note, ta, s, e, color) {
    this.applyTextStyle(note, ta, s, e, { c: color });
  },

  // 고른 글자 [s, e) 에 서식 — 막대는 열어 둔 채 새 값으로 (이어서 다른 서식도 고르게), 고른 글자 그대로
  //   keepSelection: 서식은 [s, e) 에 주되 고른 글자 · 막대는 이 범위로 (줄 정렬 — 줄 전체에 주고 고른 글자는 그대로)
  applyTextStyle(note, ta, s, e, patch, { keepSelection = null } = {}) {
    if (!ta || !ta.inkAccess || s === e) return;
    if (!this.editInk(note, [{ ta, s, e }], (x, sp) => paintSpans(sp, s, e, patch, ta.value.length))) return;
    this.afterFieldInk(note, ta, keepSelection || { s, e });
  },

  // 줄 정렬 — 한 글자칸 (alignInk 참고)
  applyLineAlign(note, ta, s, e, align) {
    if (!this.alignInk(note, [{ ta, s, e }], align)) return;
    this.afterFieldInk(note, ta, { s, e });
  },

  toggleTextStyle(note, ta, s, e, key) {
    if (!this.toggleInk(note, [{ ta, s, e }], key)) return;
    this.afterFieldInk(note, ta, { s, e });
  },

  // 한 글자칸을 고친 뒤 — 고른 글자 그대로, 그 글자칸의 막대가 떠 있으면 새 값으로
  afterFieldInk(note, ta, sel) {
    if (this.editingId === note.id) {
      ta.focus();
      ta.setSelectionRange(sel.s, sel.e);
    }
    const bar = this.textColorBar;
    if (bar && bar.field === ta) this.showTextColorBar(note, ta, sel.s, sel.e);
  },

  // ---- 마크다운: 고른 글자 앞뒤에 기호를 넣고 뺌 (renderer/markdown.js 가 그려 줌) ----
  //   굵게 **글** · 기울임 _글_ · 취소선 ~~글~~ · 밑줄 <u>글</u> · 형광펜 ==글== (다른 색 <mark style="background:#…">)
  //   · 글자 색 <span style="color:#…"> — 다시 누르면 뺌, 서식 지우기는 모두 뺌. 줄 정렬은 없음 (쪽지 정렬)
  //   겹겹이 감싼 기호도 알아봄 (_<u>~~글~~</u>_ 에서 밑줄만 빼기 등 — mdLayers)
  mdOps(bar) {
    const ta = bar.md;
    const layers = () => mdLayers(ta.value, bar.range.s, bar.range.e);
    return {
      has: (key) => layers().some(l => l.kind === key) || mdWrapped(ta.value, bar.range.s, bar.range.e, ...MD_MARKS[key]),
      toggle: (key) => this.mdToggle(bar, key),
      align: null,
      hlHas: (hex) => layers().some(l => l.kind === 'hl' && (l.open.includes(hex) || (hex === HIGHLIGHTS[0] && l.open === '=='))),
      highlight: (hex) => this.mdKind(bar, ['hl'], hex ? (hex === HIGHLIGHTS[0] ? ['==', '=='] : [`<mark style="background:${hex}">`, '</mark>']) : null),
      color: (hex) => this.mdKind(bar, ['c'], hex ? [`<span style="color:${hex}">`, '</span>'] : null),
      clear: () => this.mdKind(bar, ['b', 'i', 'u', 'x', 'hl', 'c'], null),
      anchor: () => ta,
    };
  },

  // 굵게 · 기울임 · 밑줄 · 취소선 — 감싼 겹 가운데 그것이 있으면 그 겹만 빼고, 고른 글자 안쪽 끝에 있으면 빼고, 없으면 감쌈
  mdToggle(bar, key) {
    const ta = bar.md;
    const v = ta.value;
    const { s, e } = bar.range;
    const [open, close] = MD_MARKS[key];
    const layer = mdLayers(v, s, e).find(l => l.kind === key);
    const sel = v.slice(s, e);
    if (layer) {
      const inner = v.slice(layer.a + layer.open.length, layer.b - layer.close.length);
      this.mdReplace(bar, layer.a, layer.b, inner, { s: s - layer.open.length, e: e - layer.open.length });
    } else if (sel.length >= open.length + close.length && sel.startsWith(open) && sel.endsWith(close)) {
      const inner = sel.slice(open.length, sel.length - close.length);
      this.mdReplace(bar, s, e, inner, { s, e: s + inner.length });
    } else {
      this.mdReplace(bar, s, e, open + sel + close, { s: s + open.length, e: e + open.length });
    }
  },

  // 형광펜 · 글자 색 · 전부 — 그 종류의 겹을 빼고 (고른 글자 안쪽의 같은 기호도), wrap 이 있으면 고른 글자에 바로 감쌈
  mdKind(bar, kinds, wrap) {
    const ta = bar.md;
    const v = ta.value;
    const { s, e } = bar.range;
    const layers = mdLayers(v, s, e);                          // 안쪽 → 바깥쪽
    const A = layers.length ? layers[layers.length - 1].a : s;
    const B = layers.length ? layers[layers.length - 1].b : e;
    const kept = layers.filter(l => !kinds.includes(l.kind));
    let mid = v.slice(s, e);
    kinds.forEach(k => {
      const w = MD_INNER[k];
      if (w) mid = mid.replace(w, '');
    });
    if (kinds.includes('i')) mid = mid.replace(/^_([\s\S]*)_$/, '$1');   // 기울임 _ 는 글 양 끝에 있을 때만 (낱말 속 _ 는 그대로)
    const opens = kept.slice().reverse().map(l => l.open).join('');
    const closes = kept.map(l => l.close).join('');
    const body = wrap ? wrap[0] + mid + wrap[1] : mid;
    const start = A + opens.length + (wrap ? wrap[0].length : 0);
    this.mdReplace(bar, A, B, opens + body + closes, { s: start, e: start + mid.length });
  },

  // 원문 [a, b) 를 text 로 — 되돌리기 한 단계, 고친 뒤 range 를 고름 (md-input 의 input 이 저장 · 다시 그림)
  mdReplace(bar, a, b, text, range) {
    const ta = bar.md;
    if (ta.value.slice(a, b) === text) {
      bar.range = range;
      this.barDone(bar);
      return;
    }
    this.record();
    ta.focus();
    ta.setRangeText(text, a, b, 'end');
    ta.dispatchEvent(new Event('input'));
    bar.range = range;
    this.barDone(bar);
  },

  // 마크다운 글자칸에서 Ctrl+B · I · U
  mdStyleKey(e, note, ta) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.isComposing) return;
    const key = { b: 'b', i: 'i', u: 'u' }[(e.key || '').toLowerCase()];
    if (!key || ta.readOnly || this.editingId !== note.id) return;
    e.preventDefault();
    e.stopPropagation();
    if (ta.selectionStart === ta.selectionEnd) return;
    const bar = this.textColorBar && this.textColorBar.md === ta ? this.textColorBar
      : { note, md: ta, range: { s: ta.selectionStart, e: ta.selectionEnd } };
    bar.range = { s: ta.selectionStart, e: ta.selectionEnd };
    this.mdToggle(bar, key);
  },
};

// 마크다운 서식 기호
const MD_MARKS = { b: ['**', '**'], i: ['_', '_'], u: ['<u>', '</u>'], x: ['~~', '~~'] };
const HEX_ATTR = '#[0-9A-Fa-f]{6}';
// 감싸는 겹의 여는 기호 (앞 글 끝) → 닫는 기호 · 종류 (b 굵게 · i 기울임 · u 밑줄 · x 취소선 · hl 형광펜 · c 글자 색)
const MD_WRAPS = [
  { kind: 'b', open: /\*\*$/, close: '**' },
  { kind: 'x', open: /~~$/, close: '~~' },
  { kind: 'hl', open: /==$/, close: '==' },
  { kind: 'u', open: /<u>$/, close: '</u>' },
  { kind: 'hl', open: new RegExp(`<mark style="background:${HEX_ATTR}">$`), close: '</mark>' },
  { kind: 'c', open: new RegExp(`<span style="color:${HEX_ATTR}">$`), close: '</span>' },
  { kind: 'i', open: /_$/, close: '_' },
];
// 고른 글자 안쪽에서 뺄 기호 (서식 지우기 · 형광펜 · 색을 바꿀 때)
const MD_INNER = {
  b: /\*\*/g,
  x: /~~/g,
  u: /<\/?u>/g,
  hl: new RegExp(`==|<mark(?: style="background:${HEX_ATTR}")?>|</mark>`, 'g'),
  c: new RegExp(`<span style="color:${HEX_ATTR}">|</span>`, 'g'),
};

// 고른 [s, e) 를 바로 감싼 겹들 — 안쪽부터 [{ kind, open, close, a, b }] ([a, b) = 여는 기호 ~ 닫는 기호 끝)
function mdLayers(v, s, e) {
  const layers = [];
  let a = s, b = e;
  for (let guard = 0; guard < 12; guard++) {
    const before = v.slice(0, a);
    const after = v.slice(b);
    let hit = null;
    for (const w of MD_WRAPS) {
      const m = w.open.exec(before);
      if (m && after.startsWith(w.close)) { hit = { kind: w.kind, open: m[0], close: w.close }; break; }
    }
    if (!hit) break;
    a -= hit.open.length;
    b += hit.close.length;
    layers.push({ ...hit, a, b });
  }
  return layers;
}

// 고른 [s, e) 가 open … close 로 감싸였는지 (바깥 · 안쪽 끝 둘 다 봄)
function mdWrapped(v, s, e, open, close) {
  if (v.slice(s - open.length, s) === open && v.slice(e, e + close.length) === close) return true;
  const sel = v.slice(s, e);
  return sel.length >= open.length + close.length && sel.startsWith(open) && sel.endsWith(close);
}

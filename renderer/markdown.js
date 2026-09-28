// 마크다운 → 꾸며진 HTML (쪽지 안에서만 씀 · 가이드 8-2)
// 지원: # 제목, - 목록, 1. 번호, **굵게**, *기울임* · _기울임_, ~~취소선~~, ==형광펜==, `코드`, > 인용, - [ ] 할 일, --- 구분선
//   서식 막대가 넣는 태그도 (이 모양 그대로만 — 다른 HTML 은 글자로): <u>밑줄</u>, <mark style="background:#RRGGBB">형광펜</mark>,
//   <span style="color:#RRGGBB">글자 색</span> (renderer/text-color.js 마크다운)
// 할 일 체크박스에는 원문 줄 번호(data-line)를 넣어 두고, 누르면 원문의 [ ] ↔ [x] 를 바꿈
import { ICON_DIR } from './constants.js';

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// 한 줄 안의 `코드` · **굵게** · *기울임*
function inline(text) {
  const codes = [];
  let s = String(text).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;                 // 코드는 먼저 빼 두고 마지막에 되돌림
  });
  s = escapeHtml(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^A-Za-z0-9_])_([^_\n]+)_(?![A-Za-z0-9_])/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  s = s.replace(/==([^=]+)==/g, '<mark>$1</mark>');
  // 서식 막대의 태그 (escapeHtml 뒤라 &lt; &quot; 모양) — 정해진 모양 · 색 값이고 여는 · 닫는 짝이 맞을 때만 되살림
  s = s.replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g, '<u>$1</u>');
  s = s.replace(/&lt;mark style=&quot;background:(#[0-9A-Fa-f]{6})&quot;&gt;([\s\S]*?)&lt;\/mark&gt;/g, '<mark style="background:$1">$2</mark>');
  s = s.replace(/&lt;span style=&quot;color:(#[0-9A-Fa-f]{6})&quot;&gt;([\s\S]*?)&lt;\/span&gt;/g, '<span style="color:$1">$2</span>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${escapeHtml(codes[Number(i)])}</code>`);
  return s;
}

const TASK_RE = /^\s*[-*]\s+\[([ xX])\]\s?(.*)$/;

export function renderMarkdown(src) {
  const lines = String(src || '').split('\n');
  const out = [];
  let list = null;          // 'ul' | 'ol' | null
  let quote = [];

  const closeList = () => { if (list) { out.push(list === 'ol' ? '</ol>' : '</ul>'); list = null; } };
  const flushQuote = () => {
    if (!quote.length) return;
    out.push(`<blockquote>${quote.map(inline).join('<br>')}</blockquote>`);
    quote = [];
  };
  const openList = (kind) => {
    if (list === kind) return;
    closeList();
    out.push(kind === 'ol' ? '<ol>' : (kind === 'tasks' ? '<ul class="md-tasks">' : '<ul>'));
    list = kind;
  };

  lines.forEach((raw, index) => {
    const line = raw.replace(/\s+$/, '');
    const task = TASK_RE.exec(line);
    if (task) {
      flushQuote();
      openList('tasks');
      const done = task[1].toLowerCase() === 'x';
      out.push(`<li class="md-task${done ? ' done' : ''}">`
        + `<img class="md-check" src="${ICON_DIR}${done ? 'checkbox-checked.svg' : 'checkbox.svg'}" data-line="${index}" alt="" draggable="false">`
        + `<span>${inline(task[2])}</span></li>`);
      return;
    }
    let m;
    if (/^\s*---+\s*$/.test(line)) {
      flushQuote(); closeList();
      out.push('<hr>');
    } else if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) {
      flushQuote(); closeList();
      const level = m[1].length <= 2 ? 2 : 3;
      out.push(`<div class="md-h${level}">${inline(m[2])}</div>`);
    } else if ((m = /^\s*>\s?(.*)$/.exec(line))) {
      closeList();
      quote.push(m[1]);
    } else if ((m = /^\s*[-*](?:\s+(.*))?$/.exec(line))) {
      flushQuote(); openList('ul');
      out.push(`<li>${inline(m[1] || '')}</li>`);
    } else if ((m = /^\s*(\d+)[.)](?:\s+(.*))?$/.exec(line))) {
      flushQuote(); openList('ol');
      out.push(`<li>${inline(m[2] || '')}</li>`);
    } else if (line.trim() === '') {
      flushQuote(); closeList();
    } else {
      flushQuote(); closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  });
  flushQuote();
  closeList();
  return out.join('');
}

// 할 일 체크박스를 눌렀을 때: 원문에서 그 줄의 [ ] ↔ [x] 를 바꿔 돌려줌
export function toggleTaskLine(src, lineIndex) {
  const lines = String(src || '').split('\n');
  const line = lines[lineIndex];
  if (line === undefined) return src;
  const m = TASK_RE.exec(line);
  if (!m) return src;
  lines[lineIndex] = m[1].toLowerCase() === 'x'
    ? line.replace(/\[[xX]\]/, '[ ]')
    : line.replace(/\[ \]/, '[x]');
  return lines.join('\n');
}

// 수정 중 원문 보기 — 마크다운 기호에만 색을 입힘 (가이드 8-2: #9A6B12)
export function highlightMarkdownSource(src) {
  return String(src || '').split('\n').map(line => {
    let out = escapeHtml(line);
    out = out.replace(/^(\s*)(#{1,6}|&gt;|[-*]\s\[[ xX]\]|[-*]|\d+[.)])(\s|$)/,
      (_, space, mark, tail) => `${space}<span class="md-sym">${mark}</span>${tail}`);
    out = out.replace(/^(\s*)(---+)(\s*)$/, (_, a, mark, b) => `${a}<span class="md-sym">${mark}</span>${b}`);
    out = out.replace(/(\*\*|\*|`|~~|==)/g, '<span class="md-sym">$1</span>');
    // 서식 막대의 태그도 기호 색으로
    out = out.replace(/(&lt;\/?(?:u|mark|span)(?: style=&quot;[^&]*&quot;)?&gt;)/g, '<span class="md-sym">$1</span>');
    return out || ' ';
  }).join('\n');
}

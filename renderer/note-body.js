// 쪽지 본문 — 글 · 할 일 · 사진 · 코드 셀 · 마크다운 (가이드 8-2)
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { ICON_DIR } from './constants.js';
import { t } from './i18n.js';
import { renderMarkdown, highlightMarkdownSource, toggleTaskLine } from './markdown.js';

export const noteBodyMethods = {
  renderNoteBody(note, el = document.getElementById(note.id)) {
    if (!el) return;
    const body = el.querySelector('.note-body');
    body.innerHTML = '';

    if (note.type === 'code') {                      // 코드 쪽지는 코드 칸이 본문 전체
      this.renderCodeBody(note, body);
      return;
    }
    if (note.type === 'web') {                       // 웹 페이지 쪽지는 주소 줄 + 페이지가 본문 전체 (web-note.js)
      this.renderWebBody(note, body);
      return;
    }

    const content = this.buildNoteContent(note);
    if (note.image) {
      // 사진을 넣은 쪽지: 사진 + 내용 — 배치는 왼쪽(기본) · 오른쪽 · 위 · 아래 · 배경 (note.imageLayout, styles.css)
      const wrap = document.createElement('div');
      wrap.className = `note-photo-body layout-${note.imageLayout || 'left'}`;
      const photo = document.createElement('img');
      photo.className = 'note-photo';
      photo.src = note.image;
      photo.alt = '';
      photo.draggable = false;
      photo.addEventListener('load', () => this.fitNote(note));
      const column = document.createElement('div');
      column.className = 'note-photo-content';
      column.appendChild(content);
      wrap.append(photo, column);
      body.appendChild(wrap);
    } else {
      body.appendChild(content);
    }
    this.renderNoteLinks(note, body);                // 글 속 인터넷 주소 → 링크 · 영상 · 사진 (note-links.js)
  },

  buildNoteContent(note) {
    if (note.type === 'checklist') {
      if (!note.items.length) note.items.push({ id: this.newId('item'), text: '', done: false });
      const list = document.createElement('div');
      list.className = 'note-checklist';
      note.items.forEach(item => list.appendChild(this.createCheckItem(note, item)));
      return list;
    }
    if (note.type === 'markdown') return this.createMarkdownBody(note);
    if (note.type === 'table') return this.createTableBody(note);      // 표 (table-note.js)
    return this.createNoteTextarea(note);
  },

  // 글자칸 공통: 수정 중 Shift+Enter 로 수정 끝내기
  bindFieldKeys(field) {
    field.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        this.stopEditing();
      }
    });
  },

  // 글 쪽지 본문 — 고른 글자 색(note.spans)을 그리는 층과 함께 (text-color.js)
  createNoteTextarea(note) {
    const ta = document.createElement('textarea');
    ta.className = 'note-text';
    ta.placeholder = t('note.text');
    ta.spellcheck = false;
    ta.rows = 1;
    ta.value = note.content || '';
    ta.readOnly = this.editingId !== note.id;
    ta.addEventListener('input', () => {
      this.recordTyping();
      const before = note.content || '';
      note.content = ta.value;
      this.shiftFieldSpans(ta, before);             // 색 칠한 글자 자리도 따라 옮김
      this.touch(note);
      this.fitNote(note);
    });
    this.bindFieldKeys(ta);
    return this.inkField(note, ta, {
      spans: () => note.spans || [],
      set: (spans) => {
        if (spans.length) note.spans = spans;
        else delete note.spans;
      },
    });
  },

  // 할 일 한 줄: 체크박스(누르면 완료 ↔ 미완료) + 글자
  createCheckItem(note, item) {
    const row = document.createElement('div');
    row.className = 'check-item';
    const box = document.createElement('img');
    box.className = 'check-box';
    box.alt = '';
    box.draggable = false;
    const input = document.createElement('textarea');
    input.className = 'check-text';
    input.rows = 1;
    input.spellcheck = false;
    const paint = () => {
      row.classList.toggle('done', item.done);
      box.src = ICON_DIR + (item.done ? 'checkbox-checked.svg' : 'checkbox.svg');
    };
    paint();
    input.value = item.text;
    input.placeholder = t('note.todo');
    input.readOnly = this.editingId !== note.id;
    row.append(box, this.inkField(note, input, {        // 고른 글자 색 (item.spans, text-color.js)
      spans: () => item.spans || [],
      set: (spans) => {
        if (spans.length) item.spans = spans;
        else delete item.spans;
      },
    }));

    box.addEventListener('click', () => {
      this.record();
      item.done = !item.done;
      paint();
      this.touch(note);
    });
    input.addEventListener('input', () => {
      this.recordTyping();
      const before = item.text;
      item.text = input.value.replace(/\n/g, ' ');
      if (input.value !== item.text) input.value = item.text;
      this.shiftFieldSpans(input, before);          // 색 칠한 글자 자리도 따라 옮김
      this.touch(note);
      this.fitNote(note);
    });
    input.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return;                 // 한글 조합 중에는 무시
      if (e.key === 'Enter' && e.shiftKey) {                          // Shift+Enter: 수정 끝내기
        e.preventDefault();
        this.stopEditing();
      } else if (e.key === 'Enter') {                                 // Enter: 아래에 새 할 일
        e.preventDefault();
        this.recordTyping();
        const next = { id: this.newId('item'), text: '', done: false };
        note.items.splice(note.items.indexOf(item) + 1, 0, next);
        const nextRow = this.createCheckItem(note, next);
        row.after(nextRow);
        nextRow.querySelector('.check-text').focus();
        this.touch(note);
        this.fitNote(note);
      } else if (e.key === 'Backspace' && input.value === '' && note.items.length > 1) {
        e.preventDefault();                                           // 빈 줄에서 Backspace: 줄 지우기
        this.recordTyping();
        note.items.splice(note.items.indexOf(item), 1);
        const target = (row.previousElementSibling || row.nextElementSibling)?.querySelector('.check-text');
        row.remove();
        if (target) {
          target.focus();
          target.setSelectionRange(target.value.length, target.value.length);
        }
        this.touch(note);
        this.fitNote(note);
      }
    });
    return row;
  },

  // ---- 마크다운 (가이드 8-2) ----
  //  보기: 꾸며진 모습 · 수정 중: 원문 (기호에만 색)
  createMarkdownBody(note) {
    if (this.editingId !== note.id) {
      const view = document.createElement('div');
      view.className = 'md-view';
      view.innerHTML = renderMarkdown(note.content);
      view.querySelectorAll('.md-check').forEach(box => {
        box.addEventListener('click', (e) => {
          e.stopPropagation();
          this.record();
          note.content = toggleTaskLine(note.content, Number(box.dataset.line));
          this.renderNoteBody(note);
          this.touch(note);
          this.fitNote(note);
        });
      });
      return view;
    }

    // 수정 중: 글자 색을 입힌 <pre> 위에 투명한 <textarea> 를 겹침
    const editor = document.createElement('div');
    editor.className = 'md-editor';
    const pre = document.createElement('pre');
    pre.className = 'md-highlight';
    pre.setAttribute('aria-hidden', 'true');
    const ta = document.createElement('textarea');
    ta.className = 'md-input';
    ta.spellcheck = false;
    ta.value = note.content || '';
    const paint = () => { pre.innerHTML = highlightMarkdownSource(ta.value) + '\n'; };
    const sync = () => { pre.style.transform = `translateY(${-ta.scrollTop}px)`; };
    paint();
    ta.addEventListener('input', () => {
      this.recordTyping();
      note.content = ta.value;
      paint();
      sync();
      this.touch(note);
      this.fitNote(note);
    });
    ta.addEventListener('scroll', sync);
    ta.addEventListener('keydown', (e) => this.handleMarkdownKey(e, ta));
    ta.addEventListener('keydown', (e) => this.mdStyleKey(e, note, ta));           // Ctrl+B · I · U (text-color.js)
    // 고른 글자 위 우클릭 → 서식 막대 (기호를 넣고 뺌 — text-color.js 마크다운)
    ta.addEventListener('contextmenu', (e) => {
      const s = ta.selectionStart, end = ta.selectionEnd;
      if (this.editingId !== note.id || ta.readOnly || s === end) return;
      e.preventDefault();
      e.stopPropagation();
      this.closeMenus();
      this.showTextColorBar(note, null, s, end, { x: e.clientX, y: e.clientY }, { md: ta });
    });
    this.bindFieldKeys(ta);
    editor.append(pre, ta);
    return editor;
  },

  // 마크다운 편집: Enter 를 누르면 목록·인용·할 일 기호를 다음 줄에도 이어 씀
  //  (execCommand 로 넣어야 글자칸의 Ctrl+Z 되돌리기에 들어감)
  handleMarkdownKey(e, field) {
    if (field.readOnly || e.isComposing || e.keyCode === 229) return;
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey) return;
    const value = field.value;
    const start = field.selectionStart;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const line = value.slice(lineStart, start);
    const m = /^(\s*)([-*]\s\[[ xX]\]\s|[-*]\s|\d+[.)]\s|>\s?)/.exec(line);
    if (!m) return;
    e.preventDefault();
    const marker = m[2].replace(/\[[xX]\]/, '[ ]');               // 할 일은 빈 네모로 이어 씀
    const insert = (text) => {
      if (!document.execCommand('insertText', false, text)) {
        field.setRangeText(text, field.selectionStart, field.selectionEnd, 'end');
        field.dispatchEvent(new Event('input'));
      }
    };
    if (line.trim() === m[2].trim()) {                              // 빈 목록 줄에서 Enter → 기호 지우기
      field.setSelectionRange(lineStart, start);
      if (!document.execCommand('delete')) {
        field.setRangeText('', lineStart, start, 'start');
        field.dispatchEvent(new Event('input'));
      }
      insert('\n');
      return;
    }
    let next = marker;
    if (/^\d+[.)]\s$/.test(marker)) {                              // 번호 목록은 숫자를 하나 올림
      const num = parseInt(marker, 10) + 1;
      next = marker.replace(/^\d+/, String(num));
    }
    insert('\n' + m[1] + next);
  },
};

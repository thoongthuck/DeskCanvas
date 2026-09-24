// 쪽지 — 만들기 · 화면에 그리기 · 수정 상태 · 선택 · 복사/고정/스타일/삭제
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import {
  ICON_DIR, NOTE_COLORS, LEGACY_NOTE_COLORS, RANDOM_COLORS, INK_COLORS,
  NOTE_FONTS, NOTE_TEXT_SIZES, NEW_NOTE_SIZES,
} from './constants.js';
import { t, formatClock } from './i18n.js';
import { customFoldImage, isHexColor, isDarkColor } from './color.js';
import { CODE_LANGUAGES } from './syntax.js';
import { buildTemplate } from './templates.js';

// 쪽지 요소에 잠깐 붙었다 떨어지는 표시 — refreshNote 가 class 를 다시 쓸 때도 남김
//   fan-anim: 캘린더에서 펼치기 · 접기 움직임 (calendar.js) · search-hit: 찾기로 간 쪽지 반짝임 (search.js)
const PASSING_CLASSES = ['fan-anim', 'search-hit'];

export const noteMethods = {
  newId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  },

  // 새 쪽지 기본값 (색·크기는 설정 창에서 정한 값)
  newNote(extra = {}) {
    const s = this.settings;
    const size = NEW_NOTE_SIZES[s.noteSize] || NEW_NOTE_SIZES.small;
    let color = s.noteColor;
    let customColor = '';
    if (color === 'random') color = RANDOM_COLORS[Math.floor(Math.random() * RANDOM_COLORS.length)];
    if (color === 'custom') customColor = s.noteCustomColor;
    if (!NOTE_COLORS[color] && color !== 'custom') color = 'yellow';
    return Object.assign({
      id: this.newId('note'),
      x: 0,
      y: 0,
      width: size.width,
      height: size.height,
      color,                 // 색 이름 또는 'custom'
      customColor,           // 'custom' 일 때 쓰는 #rrggbb
      title: '',
      content: '',
      type: 'text',          // 'text' | 'checklist' | 'code' | 'markdown'
      items: [],             // 할 일 목록 [{ id, text, done }]
      image: '',             // 쪽지에 넣은 사진 주소
      pinned: false,
      font: 'default',       // 스타일: 글꼴
      size: 'm',             // 스타일: 글자 크기 단계
      ink: 'default',        // 스타일: 글자 색
      codeLang: 'python',    // 코드 쪽지의 언어
      codeTheme: 'dark',     // 코드 칸 밝기
      updatedAt: Date.now(),
    }, extra);
  },

  // 메모 추가: 우클릭한 자리에 새 쪽지, 바로 제목 입력
  addNoteAt(at, extra = {}, { edit = true } = {}) {
    this.record();
    const note = this.newNote(Object.assign({ x: at.x, y: at.y }, extra));
    this.notes.push(note);
    this.createNoteElement(note);
    this.scheduleSave();
    if (edit) {
      this.startEditing(note);
      this.typingRecorded = true;   // 새 쪽지 + 바로 쓴 글은 되돌리기 한 단계로
    } else {
      this.selectItem(note.id);
    }
    return note;
  },

  // 템플릿 추가 (코드 셀 · 마크다운 노트 · 회의록)
  addTemplateAt(at, kind) {
    return this.addNoteAt(at, buildTemplate(kind), { edit: true });
  },

  // 저장된 쪽지(예전 형식 포함)를 지금 형식으로 맞춤
  normalizeNote(n) {
    const note = { ...n };
    if (note.color === 'custom') {
      if (!isHexColor(note.customColor)) note.color = 'yellow';
    } else if (!NOTE_COLORS[note.color]) {
      note.color = LEGACY_NOTE_COLORS[String(note.color || '').toLowerCase()] || 'yellow';
    }
    if (!isHexColor(note.customColor)) note.customColor = '';
    if (note.color !== 'custom') note.customColor = '';
    if (typeof note.title !== 'string') note.title = '';
    if (typeof note.content !== 'string') note.content = '';
    if (typeof note.image !== 'string') note.image = '';
    if (note.type === 'image') note.type = 'text';                    // 예전 '이미지 메모' → 사진이 든 글 쪽지
    if (!['text', 'checklist', 'code', 'markdown'].includes(note.type)) note.type = 'text';
    if (!Array.isArray(note.items)) note.items = [];
    note.items = note.items.map(it => ({ id: it.id || this.newId('item'), text: String(it.text || ''), done: !!it.done }));
    note.pinned = !!note.pinned;
    if (!NOTE_FONTS.includes(note.font)) note.font = 'default';
    if (!NOTE_TEXT_SIZES.includes(note.size)) note.size = 'm';
    if (!INK_COLORS[note.ink]) note.ink = 'default';
    if (note.lang && !note.codeLang) note.codeLang = note.lang;      // 예전 이름
    delete note.lang;
    if (!CODE_LANGUAGES[note.codeLang]) note.codeLang = 'python';
    if (note.codeTheme !== 'light') note.codeTheme = 'dark';
    if (typeof note.updatedAt !== 'number') {
      const made = Number(String(note.id).split('-')[1]);             // id 안의 만든 시각
      note.updatedAt = Number.isFinite(made) && made > 0 ? made : Date.now();
    }
    if (typeof note.width !== 'number') note.width = 200;
    if (typeof note.height !== 'number') note.height = 150;
    // 판에 붙은 쪽지 (board-notes.js) — 캘린더 날짜 또는 연대표 칸 자리가 있어야 함
    const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(note.date || '');
    const hasSegment = typeof note.segmentId === 'string' && Number.isFinite(note.ratio);
    if (typeof note.boardId !== 'string' || (!hasDate && !hasSegment)) {
      this.detachNoteFields(note);
    } else {
      if (!hasDate) delete note.date;
      if (!hasSegment) { delete note.segmentId; delete note.ratio; }
      else note.ratio = Math.min(1, Math.max(0, note.ratio));
      if (typeof note.boardAt !== 'number') note.boardAt = 0;
    }
    delete note.pinColor;                                             // 예전 동그란 핀 색 (더 이상 안 씀)
    return note;
  },

  createNoteElement(note) {
    const el = document.createElement('div');
    el.className = 'sticky-note';
    el.id = note.id;
    el.innerHTML = `
      <div class="note-header">
        <img class="note-state-icon" alt="" draggable="false">
        <img class="note-more" src="${ICON_DIR}note-more.svg" alt="" draggable="false">
      </div>
      <textarea class="note-title" rows="1" spellcheck="false"></textarea>
      <div class="note-body"></div>
      <div class="note-time"></div>
      <div class="note-resize"></div>
    `;

    // 제목
    const title = el.querySelector('.note-title');
    title.value = note.title || '';
    title.addEventListener('input', () => {
      this.recordTyping();
      note.title = title.value.replace(/\n/g, ' ');
      if (title.value !== note.title) title.value = note.title;
      this.touch(note);
      this.fitNote(note, el);
    });
    title.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (e.shiftKey) { this.stopEditing(); return; }                 // Shift+Enter: 수정 끝내기
      const next = el.querySelector('.note-text, .check-text, .code-input, .md-input');
      if (next) { next.focus(); next.setSelectionRange(0, 0); }
    });

    // 누르면 선택 + 어디를 잡아도 옮기기
    //  - 체크박스·마크다운 할 일은 체크만 (쪽지 선택·옮기기 없음)
    //  - 아이콘·접힌 모서리·코드 칸 버튼은 제외 (누르는 기능)
    //  - 수정 중인 쪽지의 글자칸은 제외 (글자 고르기·커서)
    //  - 고정된 쪽지는 못 옮김
    el.addEventListener('mousedown', (e) => {
      if (e.target.closest('.check-box, .md-check, .code-copy, .code-lang')) return;
      const editing = this.editingId === note.id;
      const onText = e.target.matches('input, textarea');
      if (!editing && onText) e.preventDefault();                     // 보통 상태: 글자칸에 커서가 생기지 않게
      const canDrag = this.pressSelect(e, note.id, !note.pinned);   // Ctrl · Shift: 여러 개 고르기 (selection.js)

      if (e.button !== 0 || this.noteLocked(note)) return;           // 고정한 쪽지 · 잠근 판의 쪽지
      if (e.target.closest('.note-state-icon, .note-more, .note-resize')) return;
      if (editing && onText) return;
      e.preventDefault();
      if (!canDrag) return;
      this.syncNoteSlotPosition(note);                                // 캘린더 칸에 붙은 쪽지: 보이는 자리에서 끌기 시작
      this.startItemDrag(e, 'note', note);
    });

    // 더블클릭 → 바로 수정 (누른 글자칸에 커서)
    el.addEventListener('dblclick', (e) => {
      if (e.target.closest('.check-box, .md-check, .note-state-icon, .note-more, .note-resize, .code-copy, .code-lang')) return;
      if (this.editingId === note.id) return;
      e.preventDefault();
      const field = e.target.closest('.note-title, .note-text, .check-text') || null;
      this.startEditing(note, field ? field.className.split(' ')[0] : '');
    });

    // 캘린더 칸에 겹쳐 쌓인 맨 위 쪽지를 누르면 → 그 날짜 쪽지들이 둥글게 펼쳐짐 (calendar.js)
    el.addEventListener('click', (e) => {
      if (e.target.closest('.check-box, .md-check, .note-state-icon, .note-more, .note-resize, .code-copy, .code-lang')) return;
      if (this.editingId === note.id || !note.date || e.ctrlKey || e.shiftKey) return;   // Ctrl · Shift 는 여러 개 고르기
      const board = this.noteBoard(note);
      if (!board || board.kind !== 'calendar' || !el.classList.contains('stack-top') || el.classList.contains('fanned')) return;
      if (this.dateStack(board.id, note.date).length > 1) this.toggleCalendarFan(board, note.date);
    });

    // 우클릭 → 이 쪽지의 메뉴 (여럿 고른 것 가운데 하나면 여러 개 메뉴)
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.ensureSelected(note.id);
      if (this.multiSelected(note.id)) this.openSelectionMenu(e.clientX, e.clientY);
      else this.openNoteMenu(note, e.clientX, e.clientY);
    });

    // 헤더 왼쪽 아이콘: 텍스트 ↔ 체크리스트 (수정 중에만)
    el.querySelector('.note-state-icon').addEventListener('click', () => {
      if (this.editingId === note.id) this.toggleNoteType(note);
    });

    // 헤더 오른쪽 더보기(…): 우클릭 메뉴를 그 자리에서
    const more = el.querySelector('.note-more');
    more.addEventListener('click', (e) => {
      e.stopPropagation();
      this.selectItem(note.id);                       // 여럿 골랐어도 … 는 이 쪽지 메뉴
      const r = more.getBoundingClientRect();
      this.openNoteMenu(note, r.left, r.bottom + 4);
    });

    // 오른쪽 아래 접힌 모서리를 잡고 크기 조절 (고정된 쪽지는 못 바꿈)
    el.querySelector('.note-resize').addEventListener('mousedown', (e) => {
      if (e.button !== 0 || note.pinned) return;
      e.preventDefault();
      e.stopPropagation();
      this.selectItem(note.id);
      this.startItemResize(e, 'note', note);
    });

    this.uiLayer.appendChild(el);
    this.renderNoteBody(note, el);
    this.refreshNote(note, el);
    this.updateNotePosition(el, note);
    this.fitNote(note, el);        // 크기는 내용에 맞춰 (설정: 글자가 넘칠 때)
  },

  // 헤더 왼쪽 아이콘: 고정됨 > 사진 > 종류
  noteIcon(note) {
    if (note.pinned) return 'note-pinned.svg';
    if (note.type === 'code') return 'note-code.svg';
    if (note.type === 'markdown') return 'note-markdown.svg';
    if (note.image) return 'note-image.svg';
    if (note.type === 'checklist') return 'note-checklist.svg';
    return 'note-text.svg';
  },

  // 색·스타일·상태·아이콘·시각을 지금 값에 맞춤 (크기·글꼴 값은 styles.css 의 class 가 가지고 있음)
  refreshNote(note, el = document.getElementById(note.id)) {
    if (!el) return;
    const selected = this.selection.has(note.id) && !note.pinned;    // 고정된 쪽지는 선택 표시를 하지 않음
    const editing = this.editingId === note.id;
    const custom = note.color === 'custom' && isHexColor(note.customColor);
    // 잠깐 붙는 표시(펼치기 · 접기 움직임, 찾기 반짝임)는 선택 · 수정 상태가 바뀌어도 끝까지 이어지게 남김
    const passing = PASSING_CLASSES.filter(c => el.classList.contains(c));
    el.className = ['sticky-note',
      custom ? 'note-custom' : `note-${note.color}`,
      `type-${note.type}`,
      `size-${note.size}`,
      `font-${note.font}`,
      `ink-${note.ink}`,
      note.pinned ? 'pinned' : '',
      selected ? 'selected' : '',
      editing ? 'editing' : '',
      note.image ? 'has-photo' : '',
      custom && isDarkColor(note.customColor) ? 'note-dark' : '',
      ...passing,
    ].filter(Boolean).join(' ');
    this.applyBoardState(el, note);                   // 캘린더 칸에 붙은 쪽지: 칸 크기 · 겹침 · 숨김 (calendar.js)

    // 직접 고른 색: 배경과 접힌 모서리를 그 자리에서 만들어 넣음
    if (custom) {
      el.style.setProperty('--note-bg', note.customColor);
      el.style.setProperty('--fold-img', customFoldImage(note.customColor));
    } else {
      el.style.removeProperty('--note-bg');
      el.style.removeProperty('--fold-img');
    }
    if (note.ink !== 'default') el.style.setProperty('--ink', INK_COLORS[note.ink]);
    else el.style.removeProperty('--ink');

    el.querySelectorAll('.note-title, .note-text, .check-text, .code-input, .md-input')
      .forEach(input => { input.readOnly = !editing; });
    const title = el.querySelector('.note-title');
    if (title) title.placeholder = t('note.title');
    const more = el.querySelector('.note-more');
    if (more) more.alt = t('note.more');

    const canToggle = editing && (note.type === 'text' || note.type === 'checklist');
    const icon = this.noteIcon(note);
    const img = el.querySelector('.note-state-icon');
    if (img.getAttribute('src') !== ICON_DIR + icon) img.src = ICON_DIR + icon;
    img.classList.toggle('clickable', canToggle);
    img.title = canToggle ? t('note.toggleType') : '';

    el.querySelector('.note-time').textContent = formatClock(note.updatedAt);
  },

  // 내용이 바뀌었을 때: 고친 시각 갱신 + 저장
  touch(note) {
    note.updatedAt = Date.now();
    const el = document.getElementById(note.id);
    if (el) el.querySelector('.note-time').textContent = formatClock(note.updatedAt);
    this.scheduleSave();
  },

  toggleNoteType(note) {
    if (note.type !== 'text' && note.type !== 'checklist') return;    // 코드·마크다운 쪽지는 종류 전환 없음
    this.record();
    if (note.type === 'checklist') {
      // 체크리스트 → 텍스트: 할 일을 한 줄씩
      note.content = note.items.map(it => it.text).filter(t2 => t2.trim() !== '').join('\n');
      note.items = [];
      note.type = 'text';
    } else {
      // 텍스트 → 체크리스트: 한 줄 = 할 일 하나 (앞의 -, • 는 떼어냄)
      note.items = (note.content || '').split('\n')
        .map(text => text.replace(/^\s*([-*•□☐]\s*)?/, '').trim())
        .filter(Boolean)
        .map(text => ({ id: this.newId('item'), text, done: false }));
      note.content = '';
      note.type = 'checklist';
    }
    this.renderNoteBody(note);
    this.refreshNote(note);
    this.touch(note);
  },

  // ---- 우클릭 메뉴 동작 ----
  editNote(note) {                        // 수정하기
    this.startEditing(note);
  },

  // 수정 상태: 글자칸을 입력 가능하게 하고 커서를 넣음
  startEditing(note, preferField = '') {
    if (this.editingId && this.editingId !== note.id) this.stopEditing();
    this.editingId = note.id;
    this.selectedId = note.id;
    this.typingRecorded = false;
    const el = document.getElementById(note.id);
    if (el && (note.type === 'code' || note.type === 'markdown')) this.renderNoteBody(note, el);
    this.updateSelection();
    if (!el) return;
    const target = el.querySelector(preferField ? `.${preferField}` : 'nothing')
      || (!note.title ? el.querySelector('.note-title') : null)
      || el.querySelector('.code-input, .md-input')
      || (note.type === 'checklist' ? [...el.querySelectorAll('.check-text')].pop() : el.querySelector('.note-text'))
      || el.querySelector('.note-title');
    this.focusField(target);
    this.fitNote(note, el);
  },

  focusField(field) {
    if (!field) return;
    field.focus();
    if (field.setSelectionRange) field.setSelectionRange(field.value.length, field.value.length);
  },

  stopEditing() {
    const id = this.editingId;
    this.editingId = null;
    this.typingRecorded = false;
    const note = this.notes.find(n => n.id === id);
    if (note) {
      const el = document.getElementById(note.id);
      if (note.type === 'code' || note.type === 'markdown') this.renderNoteBody(note, el);
      this.refreshNote(note, el);
      this.fitNote(note, el);
    }
    const active = document.activeElement;
    if (active && active.blur && active !== document.body) active.blur();
  },

  duplicateNote(note) {                   // 복사하기: 살짝 옆에 같은 쪽지
    this.record();
    const copy = JSON.parse(JSON.stringify(note));
    copy.id = this.newId('note');
    copy.x += 24;
    copy.y += 24;
    copy.pinned = false;
    copy.items = copy.items.map(it => ({ ...it, id: this.newId('item') }));
    copy.updatedAt = Date.now();
    if (copy.boardId) copy.boardAt = Date.now();        // 캘린더 칸: 같은 날짜 맨 위에
    this.notes.push(copy);
    this.createNoteElement(copy);
    this.selectItem(copy.id);
    if (copy.boardId) this.refreshAllBoards();
    this.scheduleSave();
  },

  togglePin(note) {                       // 고정하기 / 고정 해제하기
    this.record();
    note.pinned = !note.pinned;
    this.refreshNote(note);
    this.scheduleSave();
  },

  // 스타일 변경 — 색 / 글자 색 / 글꼴 / 크기
  setNoteColor(note, key, customHex = '') {
    this.record();
    note.color = key;
    note.customColor = key === 'custom' ? customHex : '';
    this.refreshNote(note);
    this.touch(note);
  },

  setNoteStyle(note, patch, { record = true } = {}) {
    if (record) this.record();
    Object.assign(note, patch);
    this.refreshNote(note);
    this.fitNote(note);
    this.touch(note);
  },

  resetNoteStyle(note) {                  // '기본 스타일로' — 글꼴·크기·글자 색만 되돌림 (쪽지 색은 그대로)
    this.setNoteStyle(note, { font: 'default', size: 'm', ink: 'default' });
  },

  // 사진 넣기 / 빼기
  async pickNotePhoto(note) {
    if (!window.canvasAPI || !window.canvasAPI.pickImage) return;
    const image = await window.canvasAPI.pickImage(t('dialog.pickImage'));
    if (!image) return;
    this.setNotePhoto(note, image);
  },

  setNotePhoto(note, url) {
    this.record();
    note.image = url;
    if (note.width < 300) note.width = 300;
    if (note.height < 220) note.height = 220;
    this.renderNoteBody(note);
    this.refreshNote(note);
    this.touch(note);
    this.fitNote(note);
    this.restoreEditFocus(note);
  },

  removeNotePhoto(note) {
    this.record();
    note.image = '';
    this.renderNoteBody(note);
    this.refreshNote(note);
    this.touch(note);
    this.fitNote(note);
    this.restoreEditFocus(note);
  },

  // 본문을 다시 그린 뒤, 수정 중이던 쪽지에 커서를 되돌림
  restoreEditFocus(note) {
    if (this.editingId !== note.id) return;
    const el = document.getElementById(note.id);
    if (!el) return;
    this.focusField(el.querySelector('.note-text, .code-input, .md-input')
      || [...el.querySelectorAll('.check-text')].pop()
      || el.querySelector('.note-title'));
  },

  // ---- 선택 ----
  // 그것 하나만 고름 (여러 개 선택은 selection.js)
  selectItem(id) {
    if (this.selection.size === 1 && this.selection.has(id)) return;
    this.selectedId = id;
    this.updateSelection();
  },

  updateSelection() {
    this.notes.forEach(note => this.refreshNote(note));
    this.photos.forEach(photo => this.refreshPhoto(photo));
    document.querySelectorAll('.file-icon').forEach(el => {
      el.classList.toggle('selected', this.selection.has(el.id));
    });
    this.updateGroupSelection();                    // 파일 묶음 (groups.js)
    this.updateBoardSelection();                    // 캘린더 · 연대표 (boards.js)
    this.requestLinks();                            // 고른 것에 이은 선은 진하게 (links.js)
  },

  deleteNote(id) {
    this.record();
    if (this.editingId === id) this.editingId = null;
    const boardId = (this.notes.find(n => n.id === id) || {}).boardId;
    this.notes = this.notes.filter(n => n.id !== id);
    const el = document.getElementById(id);
    if (el) el.remove();
    this.selection.delete(id);
    if (boardId) this.refreshAllBoards();              // 캘린더 칸의 장수 · 겹침 · 연대표 층
    this.scheduleSave();
  },

  // 되돌리기 뒤처럼 전부 다시 그려야 할 때
  renderAll() {
    this.uiLayer.innerHTML = '';
    this.calendarCache.clear();
    this.timelineLayouts.clear();
    this.cleanGroupMembership();                   // 파일 묶음: 없어진 파일 · 두 묶음에 겹친 파일 정리
    this.boards.forEach(board => this.createBoardElement(board));   // 판은 맨 아래 (판끼리는 나중 판이 위)
    this.notes.forEach(note => this.createNoteElement(note));
    this.photos.forEach(photo => this.createPhotoElement(photo));
    this.files.forEach(file => this.createFileElement(file));
    this.updateSelection();
    this.requestLinks();                           // 연결선 층도 판 바로 뒤에 다시 (links.js)
  },
};

// 표 쪽지 — 쪽지 추가 › 표. 칸마다 글을 쓰고, 행 · 열을 넣고 뺌 (styles/table-note.css)
//   note.table = { rows: [['제목', …], ['', …], …], widths?, heights? } — 첫 행은 머리 행 (굵게). 모든 행의 칸 수는 같음
//     widths: 열 너비 비율 (합 1 — 없으면 똑같이), heights: 행 높이 (월드 px, 0 = 글에 맞게 — 없으면 모두 글에 맞게)
//     spans: 칸마다 고른 글자 서식 [행][열] (text-color.js — 없으면 서식 없음)
//   안쪽 선을 끌면 칸 크기: 세로 선은 양옆 열이 너비를 주고받고, 가로 선은 그 위 행 높이 (쪽지도 같이) — startTableBorderDrag
//   수정 중: Tab / Shift+Tab 옆 칸 (마지막 칸에서 Tab 은 새 행) · Enter 아래 칸 (마지막 행이면 새 행)
//            ↑ ↓ 위 · 아래 칸 (칸 안 첫 줄 · 마지막 줄에서) · Alt+Enter 칸 안에서 줄 바꾸기 · Shift+Enter 수정 끝내기
//            오른쪽 · 아래 가장자리의 + — 누르면 열 · 행 하나, 누른 채 끌면 끄는 만큼 늘고 되돌아오면 줄어듦 (startTableAddDrag)
//   우클릭 › 표 › 위 · 아래에 행 추가 · 왼쪽 · 오른쪽에 열 추가 · 행 · 열 삭제 (누른 칸 기준)
//   표는 쪽지를 가득 채움 — 쪽지를 크게 하면 행 · 열이 늘어남, 표보다 작게는 못 줄임 (fit.js)
//   행 · 열을 넣고 빼면 칸 크기는 그대로 두고 쪽지가 한 행 · 한 열만큼 커지고 작아짐
//   (새 표 · 표에 딱 맞은 쪽지는 표 높이를 따라 저절로 — 정한 높이를 가장 작게 두어서)
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { t } from './i18n.js';
import { NOTE_MIN_WIDTH, NOTE_MIN_HEIGHT } from './constants.js';
import { cleanSpans } from './text-color.js';

const MAX_ROWS = 60;
const MAX_COLS = 20;
const MAX_WIDTH = 2400;          // 열을 넣어 넓어질 수 있는 한계 (fit.js 와 같게)
const MAX_HEIGHT = 4000;         // 행을 넣어 높아질 수 있는 한계

// 붙여 넣은 글 → 칸 (탭 · 줄로 나눔, 따옴표로 감싼 칸 안의 탭 · 줄 · "" 도 — 엑셀에서 복사한 것)
function parseTsv(text) {
  const src = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

// 새 표 — 머리 행 + 두 행, 세 열
export function newTable(rows = 3, cols = 3) {
  return { rows: Array.from({ length: rows }, () => Array(cols).fill('')) };
}

export const tableNoteMethods = {
  // 저장된 표를 지금 형식으로 — 글자만, 칸 수를 맞추고 너무 크면 자름
  normalizeTable(table) {
    let rows = table && Array.isArray(table.rows) ? table.rows : [];
    rows = rows.slice(0, MAX_ROWS).map(r => (Array.isArray(r) ? r : []).slice(0, MAX_COLS).map(c => String(c ?? '')));
    const cols = Math.max(1, ...rows.map(r => r.length));
    if (!rows.length) return newTable();
    const out = { rows: rows.map(r => r.concat(Array(cols - r.length).fill(''))) };
    // 칸 크기 — 수가 맞고 값이 올바를 때만 (아니면 버리고 똑같이 · 글에 맞게)
    const w = table.widths;
    if (Array.isArray(w) && w.length === cols && w.every(v => Number.isFinite(v) && v > 0)) {
      const sum = w.reduce((a, b) => a + b, 0);
      out.widths = w.map(v => +(v / sum).toFixed(4));
    }
    const h = table.heights;
    if (Array.isArray(h) && h.length === out.rows.length && h.every(v => Number.isFinite(v) && v >= 0 && v < 4000)) {
      if (h.some(v => v > 0)) out.heights = h.map(v => +v.toFixed(1));
    }
    const sp = table.spans;
    if (Array.isArray(sp) && sp.length === out.rows.length && sp.every(r => Array.isArray(r) && r.length === cols)) {
      const clean = out.rows.map((row, r) => row.map((text, c) => {
        const list = cleanSpans(sp[r][c], text.length);
        return list.length ? list : null;
      }));
      if (clean.some(r => r.some(Boolean))) out.spans = clean;
    }
    return out;
  },

  // 표를 글자로 — 칸은 탭, 행은 줄 (엑셀 · 한글에 붙여넣으면 표가 됨 · 찾기)
  tableText(note) {
    const rows = note.table && note.table.rows ? note.table.rows : [];
    return rows.map(r => r.map(c => String(c).replace(/[\t\n]/g, ' ')).join('\t')).join('\n');
  },

  addTableNoteAt(at) {
    // 높이는 가장 작게 — 표 높이에 딱 맞게 늘어난 채로 시작 (fit.js)
    return this.addNoteAt(at, { type: 'table', width: 340, height: NOTE_MIN_HEIGHT, table: newTable() }, { edit: true });
  },

  // ---- 그리기 ----
  createTableBody(note) {
    const wrap = document.createElement('div');
    wrap.className = 'note-table-wrap';
    wrap.tabIndex = -1;                                // 여러 칸을 고른 동안 키보드를 받음
    wrap.addEventListener('keydown', (e) => this.handleTableSelKey(e, note));
    wrap.addEventListener('paste', (e) => {
      if (!this.tableSelFor(note)) return;
      e.preventDefault();
      e.stopPropagation();                             // 캔버스 붙여넣기(쪽지 · 사진)로 가지 않게
      this.pasteTableText(note, e.clipboardData ? e.clipboardData.getData('text/plain') : '');
    });
    const table = document.createElement('table');
    table.className = 'note-table';
    const rows = note.table.rows;
    table.style.setProperty('--cols', rows[0].length);    // 열이 많으면 쪽지보다 넓어짐 (table-note.css)
    // 안쪽 선 끌기 — 칸 글자칸이나 쪽지보다 먼저 받음 (선 가까이에서만)
    table.addEventListener('mousedown', (e) => {
      const hit = e.button === 0 && !note.pinned ? this.tableBorderAt(table, e) : null;
      if (hit) this.startTableBorderDrag(e, note, hit, table);
    }, true);
    table.addEventListener('mousemove', (e) => {
      if (document.body.classList.contains('table-drag-row') || document.body.classList.contains('table-drag-col')) return;
      const hit = !note.pinned ? this.tableBorderAt(table, e) : null;
      table.style.cursor = hit ? (hit.axis === 'col' ? 'col-resize' : 'row-resize') : '';
    });
    table.addEventListener('mouseleave', () => { table.style.cursor = ''; });
    rows.forEach((row, r) => {
      const tr = table.insertRow();
      row.forEach((text, c) => {
        const td = tr.insertCell();
        td.appendChild(this.createTableCell(note, r, c));
        // 늘어난 칸의 빈 곳을 눌러도 그 칸 글자칸으로 (수정 중)
        td.addEventListener('mousedown', (e) => {
          if (e.target !== td || e.button !== 0 || e.shiftKey || this.editingId !== note.id) return;
          e.preventDefault();
          this.focusTableCell(note, r, c);
        });
      });
    });
    this.applyTableSizes(table, note);
    // 여러 칸 고르기 — 다시 그려도 고른 칸 그대로 (표 크기 안으로)
    const sel = this.tableSelFor(note);
    if (sel) this.setTableSel(note, sel.r0, sel.c0, sel.r1, sel.c1);
    this.paintTableSel(note, table);
    table.addEventListener('mousedown', (e) => this.startTableCellSelect(e, note, table));
    // 고른 칸 위 우클릭 → 서식 막대 (고른 칸 밖이면 고르기를 풀고 보통대로)
    table.addEventListener('contextmenu', (e) => {
      const now = this.tableSelFor(note);
      const td = now && e.target.closest('td');
      if (!td) return;
      const p = this.tableCellOf(td);
      const R = this.tableSelRect(now);
      if (p.r < R.r0 || p.r > R.r1 || p.c < R.c0 || p.c > R.c1) {
        this.clearTableSel();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      this.closeMenus();
      this.showTableRangeBar(note, { x: e.clientX, y: e.clientY });
    }, true);
    const addCol = document.createElement('button');
    addCol.type = 'button';
    addCol.className = 'table-add table-add-col';
    addCol.title = t('table.addCol');
    addCol.textContent = '+';
    addCol.addEventListener('mousedown', (e) => this.startTableAddDrag(e, note, 'col'));
    const addRow = document.createElement('button');
    addRow.type = 'button';
    addRow.className = 'table-add table-add-row';
    addRow.title = t('table.addRow');
    addRow.textContent = '+';
    addRow.addEventListener('mousedown', (e) => this.startTableAddDrag(e, note, 'row'));
    wrap.append(table, addCol, addRow);
    return wrap;
  },

  createTableCell(note, r, c) {
    const t = note.table;
    const ta = document.createElement('textarea');
    ta.className = 'table-cell';
    ta.rows = 1;
    ta.spellcheck = false;
    ta.value = note.table.rows[r][c];
    ta.readOnly = this.editingId !== note.id;
    ta.dataset.r = r;
    ta.dataset.c = c;
    ta.addEventListener('input', () => {
      this.recordTyping();
      const before = note.table.rows[r][c];
      note.table.rows[r][c] = ta.value;
      this.shiftFieldSpans(ta, before);              // 서식 칠한 글자 자리도 따라 옮김
      this.touch(note);
      this.fitNote(note);
    });
    ta.addEventListener('keydown', (e) => this.handleTableKey(e, note, r, c));
    // 우클릭 › 표 › 가 이 칸을 기준으로 (쪽지 우클릭 메뉴가 바로 뒤에 열림 — notes.js)
    ta.addEventListener('contextmenu', () => { this.tableMenuCell = { id: note.id, r, c, at: Date.now() }; });
    ta.addEventListener('focus', () => { this.tableMenuCell = { id: note.id, r, c, at: Date.now() }; });
    // 고른 글자 서식 (굵게 · 색 …) — 서식 층과 함께 (text-color.js)
    return this.inkField(note, ta, {
      spans: () => (t.spans && t.spans[r] && t.spans[r][c]) || [],
      set: (list) => {
        if (!t.spans) t.spans = t.rows.map(row => row.map(() => null));
        t.spans[r][c] = list.length ? list : null;
        if (!t.spans.some(row => row.some(Boolean))) delete t.spans;
      },
    });
  },

  // 수정 중인 표에서 (r, c) 칸으로 — 없으면 가장 가까운 칸
  focusTableCell(note, r, c, caret = 'end') {
    const el = document.getElementById(note.id);
    if (!el) return;
    const rows = note.table.rows;
    r = Math.max(0, Math.min(rows.length - 1, r));
    c = Math.max(0, Math.min(rows[0].length - 1, c));
    const cell = el.querySelector(`.table-cell[data-r="${r}"][data-c="${c}"]`);
    if (!cell) return;
    cell.focus();
    const at = caret === 'start' ? 0 : cell.value.length;
    cell.setSelectionRange(at, at);
  },

  handleTableKey(e, note, r, c) {
    const ta = e.target;
    if (ta.readOnly || e.isComposing || e.keyCode === 229) return;   // 한글 조합 중에는 무시
    const rows = note.table.rows;
    const lastRow = r === rows.length - 1, lastCol = c === rows[0].length - 1;
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        if (c > 0) this.focusTableCell(note, r, c - 1);
        else if (r > 0) this.focusTableCell(note, r - 1, rows[0].length - 1);
      } else if (!lastCol) {
        this.focusTableCell(note, r, c + 1);
      } else if (!lastRow) {
        this.focusTableCell(note, r + 1, 0);
      } else {
        this.insertTableRow(note, rows.length, 0);             // 마지막 칸에서 Tab: 새 행
      }
    } else if (e.key === 'Enter' && e.altKey) {                   // 칸 안에서 줄 바꾸기
      e.preventDefault();
      if (!document.execCommand('insertText', false, '\n')) {
        ta.setRangeText('\n', ta.selectionStart, ta.selectionEnd, 'end');
        ta.dispatchEvent(new Event('input'));
      }
    } else if (e.key === 'Enter' && e.shiftKey) {                 // 수정 끝내기
      e.preventDefault();
      this.stopEditing();
    } else if (e.key === 'Enter' && !e.ctrlKey) {
      e.preventDefault();
      if (!lastRow) this.focusTableCell(note, r + 1, c);
      else this.insertTableRow(note, rows.length, c);            // 마지막 행에서 Enter: 새 행
    } else if (e.key === 'ArrowUp' && r > 0 && !ta.value.slice(0, ta.selectionStart).includes('\n')) {
      e.preventDefault();
      this.focusTableCell(note, r - 1, c);
    } else if (e.key === 'ArrowDown' && !lastRow && !ta.value.slice(ta.selectionEnd).includes('\n')) {
      e.preventDefault();
      this.focusTableCell(note, r + 1, c);
    }
  },

  // ---- 행 · 열 넣고 빼기 (되돌리기 한 단계씩) ----
  //   focusCol: 넣은 행에서 커서를 둘 열 (수정 중일 때)
  insertTableRow(note, at, focusCol = 0) {
    const rows = note.table.rows;
    if (rows.length >= MAX_ROWS) return;
    const grow = this.tableStretched(note) ? this.tableRowHeight(note) : 0;   // 늘려 둔 표: 한 행만큼 쪽지도
    this.record();
    rows.splice(at, 0, Array(rows[0].length).fill(''));
    if (note.table.heights) note.table.heights.splice(at, 0, 0);    // 새 행은 글에 맞게
    if (note.table.spans) note.table.spans.splice(at, 0, Array(rows[0].length).fill(null));
    if (grow) this.setTableHeight(note, note.height + grow);
    this.redrawTable(note, at, focusCol);
  },

  insertTableCol(note, at) {
    const rows = note.table.rows;
    if (rows[0].length >= MAX_COLS) return;
    const colW = this.tableColWidth(note);
    const px = this.tableColPx(note);
    this.record();
    rows.forEach(r => r.splice(at, 0, ''));
    if (note.table.spans) note.table.spans.forEach(r => r.splice(at, 0, null));
    if (note.table.widths) this.setTableColPx(note, [...px.slice(0, at), colW, ...px.slice(at)]);   // 다른 열 너비는 그대로
    this.setTableWidth(note, this.noteSize(note).width + colW);   // 열 너비는 그대로 — 쪽지가 한 열만큼 넓어짐
    this.redrawTable(note, 0, at);
  },

  deleteTableRow(note, r) {
    const rows = note.table.rows;
    if (rows.length <= 1) return;
    const shrink = this.tableStretched(note) ? this.tableRowHeight(note, r) : 0;   // 늘려 둔 표: 그 행만큼 쪽지도
    this.record();
    rows.splice(r, 1);
    if (note.table.heights) note.table.heights.splice(r, 1);
    if (note.table.spans) note.table.spans.splice(r, 1);
    if (shrink) this.setTableHeight(note, note.height - shrink);
    this.redrawTable(note, Math.min(r, rows.length - 1), 0);
  },

  deleteTableCol(note, c) {
    const rows = note.table.rows;
    if (rows[0].length <= 1) return;
    const px = this.tableColPx(note);
    const colW = px[c] || this.tableColWidth(note);
    this.record();
    rows.forEach(r => r.splice(c, 1));
    if (note.table.spans) note.table.spans.forEach(r => r.splice(c, 1));
    if (note.table.widths) this.setTableColPx(note, px.filter((_, i) => i !== c));
    this.setTableWidth(note, this.noteSize(note).width - colW);   // 쪽지도 그 열만큼 좁아짐
    this.redrawTable(note, 0, Math.min(c, rows[0].length - 1));
  },

  // 지금 한 열의 너비 (월드 좌표) — 화면에 그려진 표에서 잼
  tableColWidth(note) {
    const el = document.getElementById(note.id);
    const table = el && el.querySelector('.note-table');
    const cols = note.table.rows[0].length;
    const w = table ? table.getBoundingClientRect().width / this.zoom : this.noteSize(note).width - 40;
    return Math.max(24, w / cols);
  },

  // 열마다 지금 너비 (월드 좌표) — 화면에 그려진 첫 행에서
  tableColPx(note) {
    const el = document.getElementById(note.id);
    const tr = el && el.querySelector('.note-table tr');
    if (!tr) return note.table.rows[0].map(() => this.tableColWidth(note));
    return [...tr.cells].map(td => td.getBoundingClientRect().width / this.zoom);
  },

  // 열 너비(월드 좌표) 목록 → 비율로 저장
  setTableColPx(note, px) {
    const sum = px.reduce((a, b) => a + b, 0) || 1;
    note.table.widths = px.map(v => +(v / sum).toFixed(4));
  },

  // 정한 열 너비 · 행 높이를 그린 표에 (열 = <col> 비율, 행 = 최소 높이 — 글이 더 길면 늘어남)
  applyTableSizes(table, note) {
    const { widths, heights } = note.table;
    let group = table.querySelector('colgroup');
    if (widths) {
      if (!group) {
        group = document.createElement('colgroup');
        table.prepend(group);
      }
      while (group.children.length < widths.length) group.appendChild(document.createElement('col'));
      while (group.children.length > widths.length) group.lastChild.remove();
      widths.forEach((w, i) => { group.children[i].style.width = `${(w * 100).toFixed(3)}%`; });
    } else if (group) {
      group.remove();
    }
    [...table.rows].forEach((tr, i) => {
      const h = heights && heights[i];
      tr.style.height = h ? `calc(${h}px * var(--z))` : '';
    });
  },

  // 누른 자리가 안쪽 선 가까이인지 — { axis: 'col', index: 왼쪽 열 } · { axis: 'row', index: 위 행 } · null
  //   글자칸 위는 아님 (글 고르기 · 커서). 선 양쪽 4px (칸 안 여백 자리)
  tableBorderAt(table, e) {
    if (e.target.closest && e.target.closest('.table-cell, .ink-field')) return null;
    const near = 4;
    const first = table.rows[0];
    if (!first) return null;
    const box = table.getBoundingClientRect();
    if (e.clientY >= box.top && e.clientY <= box.bottom) {
      const cells = [...first.cells];
      for (let c = 0; c < cells.length - 1; c++) {
        if (Math.abs(e.clientX - cells[c].getBoundingClientRect().right) <= near) return { axis: 'col', index: c };
      }
    }
    if (e.clientX >= box.left && e.clientX <= box.right) {
      const trs = [...table.rows];
      for (let r = 0; r < trs.length - 1; r++) {
        if (Math.abs(e.clientY - trs[r].getBoundingClientRect().bottom) <= near) return { axis: 'row', index: r };
      }
    }
    return null;
  },

  // 안쪽 선 끌기 — 세로 선: 양옆 열이 너비를 주고받음 (표 너비 그대로), 가로 선: 위 행 높이 (늘려 둔 표면 쪽지도 그만큼)
  //   되돌리기는 끌기 한 번에 한 단계 (바뀐 게 없으면 버림)
  startTableBorderDrag(e, note, hit, table) {
    e.preventDefault();
    e.stopPropagation();
    const z = this.zoom;
    const t = note.table;
    const cls = hit.axis === 'col' ? 'table-drag-col' : 'table-drag-row';
    document.body.classList.add(cls);
    this.record();
    const before = JSON.stringify([t.widths, t.heights, note.height]);
    let move;
    if (hit.axis === 'col') {
      const px = [...table.rows[0].cells].map(td => td.getBoundingClientRect().width / z);
      const c = hit.index;
      const pair = px[c] + px[c + 1];
      const min = Math.min(24, pair / 2);
      move = (ev) => {
        const w = Math.max(min, Math.min(pair - min, px[c] + (ev.clientX - e.clientX) / z));
        const next = px.slice();
        next[c] = w;
        next[c + 1] = pair - w;
        this.setTableColPx(note, next);
        this.applyTableSizes(table, note);
        this.fitNote(note);
      };
    } else {
      const hs = [...table.rows].map(tr => tr.getBoundingClientRect().height / z);
      const r = hit.index;
      const stretched = this.tableStretched(note);
      const startNoteH = note.height;
      // 늘려 둔 표는 모든 행을 지금 높이로 고정 (한 행만 고정하면 남는 높이가 다른 행으로 몰려 튀어서)
      if (stretched) t.heights = hs.map(h => +h.toFixed(1));
      else if (!t.heights) t.heights = hs.map(() => 0);
      move = (ev) => {
        const h = Math.max(12, hs[r] + (ev.clientY - e.clientY) / z);
        t.heights[r] = +h.toFixed(1);
        if (stretched) this.setTableHeight(note, startNoteH + h - hs[r]);
        this.applyTableSizes(table, note);
        this.fitNote(note);
      };
    }
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.classList.remove(cls);
      if (t.heights && !t.heights.some(v => v > 0)) delete t.heights;
      if (JSON.stringify([t.widths, t.heights, note.height]) === before) this.dropHistoryIfUnchanged();
      else this.touch(note);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  },

  // 쪽지가 정한 너비 — 표가 넓어 늘어나 있던 너비(fit.js)에서 이어서 (한계 안에서)
  setTableWidth(note, width) {
    note.width = Math.round(Math.max(NOTE_MIN_WIDTH, Math.min(MAX_WIDTH, width)));
  },

  setTableHeight(note, height) {
    note.height = Math.round(Math.max(NOTE_MIN_HEIGHT, Math.min(MAX_HEIGHT, height)));
  },

  // 쪽지를 표보다 크게 늘려 둔 것인지 — 그때는 정한 높이가 크기를 정함 (표에 딱 맞은 쪽지는 fit.js 가 늘림)
  tableStretched(note) {
    return this.noteSize(note).height <= note.height + 0.5;
  },

  // 한 행의 높이 (월드 좌표) — r 이 없으면 가장 낮은 행 (빈 행 하나만큼)
  tableRowHeight(note, r = -1) {
    const el = document.getElementById(note.id);
    const trs = el ? [...el.querySelectorAll('.note-table tr')] : [];
    if (!trs.length) return 28;
    const h = r >= 0 && trs[r] ? trs[r].getBoundingClientRect().height : Math.min(...trs.map(tr => tr.getBoundingClientRect().height));
    return h / this.zoom;
  },

  // + 를 누른 채 끌기 — 아래(오른쪽)로 끄는 만큼 행(열)이 늘고, 되돌아오면 줄어듦
  //   줄일 때는 끝에 붙은 빈 행 · 열만 (글이 든 칸은 끌어서 지우지 않음 — 지우기는 우클릭 › 표 ›)
  //   한 칸 = 표에서 가장 낮은 행 높이 · 열 최소 너비(64px). 끌지 않고 떼면 하나 추가. 되돌리기는 끌기 한 번에 한 단계
  startTableAddDrag(e, note, axis) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = document.getElementById(note.id);
    const rows = note.table.rows;
    const size = () => (axis === 'row' ? rows.length : rows[0].length);
    const max = axis === 'row' ? MAX_ROWS : MAX_COLS;
    const heights = [...el.querySelectorAll('.note-table tr')].map(tr => tr.getBoundingClientRect().height);
    const colW = this.tableColWidth(note);              // 열은 이 너비 그대로 — 쪽지가 열 수만큼 넓어지고 좁아짐
    const step = axis === 'row' ? Math.max(12, Math.min(...heights)) : Math.max(24, colW * this.zoom);
    const start = axis === 'row' ? e.clientY : e.clientX;
    const startCount = size();
    const startWidth = this.noteSize(note).width;
    const startBase = note.width;                        // 제자리로 돌아오면 정한 너비 · 높이도 그대로 (되돌리기 단계가 남지 않게)
    const startBaseH = note.height;
    const stretched = axis === 'row' && this.tableStretched(note);   // 늘려 둔 표: 행 높이 그대로 쪽지가 한 행씩
    const startPx = this.tableColPx(note);                // 정한 열 너비가 있으면 새 열은 평균 너비로
    const startWidths = note.table.widths;
    const startHeights = note.table.heights;
    let moved = false;
    const cursor = axis === 'row' ? 'table-drag-row' : 'table-drag-col';
    document.body.classList.add(cursor);
    this.record();                                   // 끌기 한 번 = 되돌리기 한 단계 (바뀐 게 없으면 끝에서 버림)
    const lastEmpty = () => (axis === 'row'
      ? rows[rows.length - 1].every(c => !c.trim())
      : rows.every(r => !r[r.length - 1].trim()));
    const move = (ev) => {
      const d = (axis === 'row' ? ev.clientY : ev.clientX) - start;
      if (!moved && Math.abs(d) < 4) return;
      moved = true;
      const want = Math.max(1, Math.min(max, startCount + Math.round(d / step)));
      let changed = false;
      while (size() < want) {
        if (axis === 'row') {
          rows.push(Array(rows[0].length).fill(''));
          if (note.table.heights) note.table.heights.push(0);
          if (note.table.spans) note.table.spans.push(Array(rows[0].length).fill(null));
        } else {
          rows.forEach(r => r.push(''));
          if (note.table.spans) note.table.spans.forEach(r => r.push(null));
        }
        changed = true;
      }
      while (size() > want && size() > 1 && lastEmpty()) {
        if (axis === 'row') {
          rows.pop();
          if (note.table.heights) note.table.heights.pop();
          if (note.table.spans) note.table.spans.pop();
        } else {
          rows.forEach(r => r.pop());
          if (note.table.spans) note.table.spans.forEach(r => r.pop());
        }
        changed = true;
      }
      if (!changed) return;
      if (axis === 'col' && startWidths) {
        const n = size();
        if (n === startCount) note.table.widths = startWidths;
        else this.setTableColPx(note, n > startCount ? [...startPx, ...Array(n - startCount).fill(colW)] : startPx.slice(0, n));
      }
      if (axis === 'row' && startHeights && size() === startCount) note.table.heights = startHeights;
      if (axis === 'col') {
        if (size() === startCount) note.width = startBase;
        else this.setTableWidth(note, startWidth + (size() - startCount) * colW);
      } else if (stretched) {
        if (size() === startCount) note.height = startBaseH;
        else this.setTableHeight(note, startBaseH + (size() - startCount) * step / this.zoom);
      }
      this.renderNoteBody(note);
      this.fitNote(note);
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.classList.remove(cursor);
      if (!moved) {                                  // 누르기만: 하나 추가
        this.dropHistoryIfUnchanged();
        if (axis === 'row') this.insertTableRow(note, rows.length);
        else this.insertTableCol(note, rows[0].length);
        return;
      }
      if (size() === startCount) {                   // 늘렸다가 다시 줄여 제자리
        this.dropHistoryIfUnchanged();
        return;
      }
      this.touch(note);
      if (this.editingId === note.id) {
        if (axis === 'row') this.focusTableCell(note, rows.length - 1, 0, 'start');
        else this.focusTableCell(note, 0, rows[0].length - 1, 'start');
      }
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  },

  // 표를 다시 그리고 크기를 맞춤 — 수정 중이면 (r, c) 칸에 커서
  redrawTable(note, r, c) {
    this.renderNoteBody(note);
    this.touch(note);
    this.fitNote(note);
    if (this.editingId === note.id) this.focusTableCell(note, r, c);
  },

  // 쪽지 우클릭 메뉴의 '표 ›' — 누른 칸(없으면 마지막 칸) 기준
  tableMenuItems(note) {
    const rows = note.table.rows;
    const hit = this.tableMenuCell;
    const fresh = hit && hit.id === note.id && Date.now() - hit.at < 1500;
    const r = fresh ? Math.min(hit.r, rows.length - 1) : rows.length - 1;
    const c = fresh ? Math.min(hit.c, rows[0].length - 1) : rows[0].length - 1;
    const full = { rows: rows.length >= MAX_ROWS, cols: rows[0].length >= MAX_COLS };
    return [{
      icon: 'add-table.svg', label: t('menu.table'), arrow: true,
      submenu: [
        { label: t('table.rowAbove'), disabled: full.rows, action: () => this.insertTableRow(note, r, c) },
        { label: t('table.rowBelow'), disabled: full.rows, action: () => this.insertTableRow(note, r + 1, c) },
        { label: t('table.colLeft'), disabled: full.cols, action: () => this.insertTableCol(note, c) },
        { label: t('table.colRight'), disabled: full.cols, action: () => this.insertTableCol(note, c + 1) },
        { separator: true },
        { label: t('table.deleteRow'), disabled: rows.length <= 1, action: () => this.deleteTableRow(note, r) },
        { label: t('table.deleteCol'), disabled: rows[0].length <= 1, action: () => this.deleteTableCol(note, c) },
        { separator: true },
        { label: t('table.equalColsAll'), disabled: rows[0].length <= 1, action: () => this.equalizeTableCols(note) },
        { label: t('table.equalRowsAll'), disabled: rows.length <= 1, action: () => this.equalizeTableRows(note) },
      ],
    }];
  },

  // ---- 여러 칸 고르기 (수정 중) ----
  //   칸에서 누른 채 다른 칸으로 끌면 네모로 고름 · Shift+누르기도 — 고른 칸은 파랗게 (table-note.css .cell-selected)
  //   고른 채: 우클릭 → 서식 막대 (고른 칸 글 전체에 · 열 너비 같게 · 행 높이 같게 · 칸 비우기)
  //            Delete · Backspace 비우기 · Ctrl+C · X 복사 · 잘라내기 (탭 · 줄 — 엑셀 · 한글과 주고받음) · Ctrl+V 붙여넣기
  //            Ctrl+B · I · U 서식 · Ctrl+A 모든 칸 · Shift+화살표 늘리기 · 화살표 · Esc · Enter 칸 하나로 · 글자를 치면 그 칸을 새로
  //   고른 동안 키보드는 표(wrap, tabindex -1)가 받음 — 캔버스 단축키(Delete 로 쪽지 지우기 · 화살표로 옮기기)로 가지 않게
  tableSelFor(note) {
    const sel = this.tableSel;
    return sel && sel.id === note.id ? sel : null;
  },

  tableSelRect(sel) {
    return { r0: Math.min(sel.r0, sel.r1), r1: Math.max(sel.r0, sel.r1), c0: Math.min(sel.c0, sel.c1), c1: Math.max(sel.c0, sel.c1) };
  },

  // 고르기 (r0, c0) 시작 칸 → (r1, c1) 끝 칸 — 표 안으로 맞춤
  setTableSel(note, r0, c0, r1, c1) {
    const rows = note.table.rows;
    const cr = (r) => Math.max(0, Math.min(rows.length - 1, r));
    const cc = (c) => Math.max(0, Math.min(rows[0].length - 1, c));
    this.tableSel = { id: note.id, r0: cr(r0), c0: cc(c0), r1: cr(r1), c1: cc(c1) };
    this.paintTableSel(note);
  },

  // 고른 칸 표시 (그려진 표에)
  paintTableSel(note, table = null) {
    if (!table) {
      const el = document.getElementById(note.id);
      table = el && el.querySelector('.note-table');
    }
    if (!table) return;
    const sel = this.tableSelFor(note);
    const R = sel ? this.tableSelRect(sel) : null;
    table.classList.toggle('cell-range', !!sel);
    [...table.rows].forEach((tr, r) => [...tr.cells].forEach((td, c) => {
      td.classList.toggle('cell-selected', !!R && r >= R.r0 && r <= R.r1 && c >= R.c0 && c <= R.c1);
    }));
  },

  // 고르기를 풂 — focusCell: 끝 칸에 커서
  clearTableSel(focusCell = false) {
    const sel = this.tableSel;
    if (!sel) return;
    this.tableSel = null;
    const note = this.notes.find(n => n.id === sel.id);
    if (!note) return;
    this.paintTableSel(note);
    if (focusCell && this.editingId === note.id) this.focusTableCell(note, sel.r1, sel.c1);
  },

  // 고른 칸의 글자칸들 — 서식 막대 · Ctrl+B 가 씀 (칸 글 전체)
  tableSelCells(note) {
    const sel = this.tableSelFor(note);
    const el = document.getElementById(note.id);
    if (!sel || !el) return [];
    const R = this.tableSelRect(sel);
    const out = [];
    el.querySelectorAll('.table-cell').forEach(ta => {
      const r = Number(ta.dataset.r), c = Number(ta.dataset.c);
      if (r >= R.r0 && r <= R.r1 && c >= R.c0 && c <= R.c1) out.push({ ta, s: 0, e: ta.value.length, r, c });
    });
    return out;
  },

  // 표 칸 자리 (그려진 td → 행 · 열)
  tableCellOf(td) {
    return { r: td.parentNode.rowIndex, c: td.cellIndex };
  },

  focusTableWrap(note) {
    const el = document.getElementById(note.id);
    const wrap = el && el.querySelector('.note-table-wrap');
    if (wrap) wrap.focus({ preventScroll: true });
  },

  // 칸을 누름 — 다른 칸으로 끌면 여러 칸 고르기, Shift 면 커서 칸부터 여기까지
  startTableCellSelect(e, note, table) {
    if (e.button !== 0 || this.editingId !== note.id) return;
    const td = e.target.closest('td');
    if (!td || !table.contains(td)) return;
    if (!e.target.closest('.table-cell')) e.stopPropagation();   // 칸 여백을 눌러도 쪽지가 끌려가지 않게 (수정 중)
    const at = this.tableCellOf(td);
    const sel = this.tableSelFor(note);
    if (e.shiftKey) {
      const active = document.activeElement;
      const from = sel ? { r: sel.r0, c: sel.c0 }
        : active && active.classList && active.classList.contains('table-cell') && active.closest('.sticky-note') === document.getElementById(note.id)
          ? { r: Number(active.dataset.r), c: Number(active.dataset.c) } : null;
      if (from) {
        e.preventDefault();
        this.setTableSel(note, from.r, from.c, at.r, at.c);
        this.focusTableWrap(note);
        return;
      }
    }
    if (sel) this.clearTableSel();
    const move = (ev) => {
      const hit = document.elementFromPoint(ev.clientX, ev.clientY);
      const td2 = hit && hit.closest ? hit.closest('td') : null;
      if (!td2 || !table.contains(td2)) return;
      const p = this.tableCellOf(td2);
      const now = this.tableSelFor(note);
      if (!now && p.r === at.r && p.c === at.c) return;          // 아직 한 칸 안 — 글자 고르기 그대로
      if (!now) {                                                 // 다른 칸으로 넘어감 → 칸 고르기
        const active = document.activeElement;
        if (active && active.setSelectionRange) active.setSelectionRange(active.selectionEnd, active.selectionEnd);
        this.focusTableWrap(note);
      }
      if (!now || now.r1 !== p.r || now.c1 !== p.c) this.setTableSel(note, at.r, at.c, p.r, p.c);
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  },

  handleTableSelKey(e, note) {
    const sel = this.tableSelFor(note);
    if (!sel) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const key = (e.key || '').toLowerCase();
    if (ctrl && ['z', 'y', 's', 'f'].includes(key)) return;      // 되돌리기 · 저장 · 찾기는 캔버스로
    e.stopPropagation();                                          // Delete 로 쪽지 지우기 · 화살표로 옮기기 등이 가지 않게
    const rows = note.table.rows;
    const arrows = { arrowup: [-1, 0], arrowdown: [1, 0], arrowleft: [0, -1], arrowright: [0, 1] };
    if (e.isComposing || e.keyCode === 229) {                     // 한글을 치기 시작 — 끝 칸으로 돌려보냄
      const { r1, c1 } = sel;
      this.clearTableSel();
      this.focusTableCell(note, r1, c1);
    } else if (key === 'escape') {
      e.preventDefault();
      this.clearTableSel(true);
    } else if (key === 'delete' || key === 'backspace') {
      e.preventDefault();
      this.clearTableCells(note);
    } else if (ctrl && (key === 'c' || key === 'x')) {
      e.preventDefault();
      this.copyTableSel(note);
      if (key === 'x') this.clearTableCells(note);
    } else if (ctrl && key === 'a') {
      e.preventDefault();
      this.setTableSel(note, 0, 0, rows.length - 1, rows[0].length - 1);
    } else if (ctrl && ['b', 'i', 'u'].includes(key)) {
      e.preventDefault();
      this.toggleInk(note, this.tableSelCells(note), key);
      this.redrawTableBar(note);
    } else if (arrows[key]) {
      e.preventDefault();
      const [dr, dc] = arrows[key];
      if (e.shiftKey) this.setTableSel(note, sel.r0, sel.c0, sel.r1 + dr, sel.c1 + dc);
      else {
        const r = Math.max(0, Math.min(rows.length - 1, sel.r1 + dr));
        const c = Math.max(0, Math.min(rows[0].length - 1, sel.c1 + dc));
        this.clearTableSel();
        this.focusTableCell(note, r, c);
      }
    } else if (key === 'tab' || key === 'enter' || key === 'f2') {
      e.preventDefault();
      this.clearTableSel(true);
    } else if (!ctrl && !e.altKey && e.key.length === 1) {       // 글자를 치면 끝 칸을 그 글자로 새로 (엑셀처럼)
      e.preventDefault();
      const { r1, c1 } = sel;
      this.clearTableSel();
      this.focusTableCell(note, r1, c1);
      const ta = document.activeElement;
      if (ta && ta.classList.contains('table-cell')) {
        ta.select();
        if (!document.execCommand('insertText', false, e.key)) {
          ta.setRangeText(e.key, 0, ta.value.length, 'end');
          ta.dispatchEvent(new Event('input'));
        }
      }
    }
  },

  // 고른 칸 비우기 (글 · 서식) — 되돌리기 한 단계
  clearTableCells(note) {
    const sel = this.tableSelFor(note);
    if (!sel) return;
    const R = this.tableSelRect(sel);
    const t = note.table;
    let any = false;
    for (let r = R.r0; r <= R.r1; r++) for (let c = R.c0; c <= R.c1; c++) {
      if (t.rows[r][c] || (t.spans && t.spans[r][c])) any = true;
    }
    if (!any) return;
    this.record();
    for (let r = R.r0; r <= R.r1; r++) for (let c = R.c0; c <= R.c1; c++) {
      t.rows[r][c] = '';
      if (t.spans) t.spans[r][c] = null;
    }
    if (t.spans && !t.spans.some(row => row.some(Boolean))) delete t.spans;
    this.redrawTableKeepSel(note);
  },

  // 고른 칸을 글자로 — 칸은 탭, 행은 줄 (탭 · 줄 · 따옴표가 든 칸은 따옴표로 감쌈 — 엑셀과 같게)
  tableSelText(note) {
    const sel = this.tableSelFor(note);
    if (!sel) return '';
    const R = this.tableSelRect(sel);
    const q = (v) => (/[\t\n"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = [];
    for (let r = R.r0; r <= R.r1; r++) lines.push(note.table.rows[r].slice(R.c0, R.c1 + 1).map(q).join('\t'));
    return lines.join('\n');
  },

  copyTableSel(note) {
    const text = this.tableSelText(note);
    const api = window.canvasAPI;
    if (api && api.copyText) api.copyText(text);
    else if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
  },

  // 붙여넣기 — 한 칸짜리 글이면 고른 칸 모두에, 여러 칸이면 고른 곳 왼쪽 위부터 (모자라면 행 · 열을 늘림)
  pasteTableText(note, text) {
    const sel = this.tableSelFor(note);
    if (!sel || typeof text !== 'string' || !text) return;
    const grid = parseTsv(text);
    const R = this.tableSelRect(sel);
    const t = note.table;
    this.record();
    if (grid.length === 1 && grid[0].length === 1) {
      for (let r = R.r0; r <= R.r1; r++) for (let c = R.c0; c <= R.c1; c++) this.setTableCellText(note, r, c, grid[0][0]);
    } else {
      const needRows = Math.min(MAX_ROWS, R.r0 + grid.length);
      const needCols = Math.min(MAX_COLS, R.c0 + Math.max(...grid.map(g => g.length)));
      this.growTable(note, needRows, needCols);
      grid.forEach((line, i) => line.forEach((v, j) => {
        const r = R.r0 + i, c = R.c0 + j;
        if (r < t.rows.length && c < t.rows[0].length) this.setTableCellText(note, r, c, v);
      }));
      this.tableSel = { id: note.id, r0: R.r0, c0: R.c0, r1: Math.min(t.rows.length - 1, R.r0 + grid.length - 1),
        c1: Math.min(t.rows[0].length - 1, R.c0 + Math.max(...grid.map(g => g.length)) - 1) };
    }
    if (t.spans && !t.spans.some(row => row.some(Boolean))) delete t.spans;
    this.redrawTableKeepSel(note);
  },

  setTableCellText(note, r, c, text) {
    note.table.rows[r][c] = String(text);
    if (note.table.spans) note.table.spans[r][c] = null;           // 붙여 넣은 칸은 서식 없이
  },

  // 행 · 열을 이 수까지 늘림 (끝에 빈 칸) — 늘린 열만큼 쪽지도 넓게, 크기 · 서식 목록도 같이
  growTable(note, rowCount, colCount) {
    const t = note.table;
    const colW = this.tableColWidth(note);
    const px = this.tableColPx(note);
    const addCols = Math.max(0, colCount - t.rows[0].length);
    while (t.rows.length < rowCount) {
      t.rows.push(Array(t.rows[0].length).fill(''));
      if (t.heights) t.heights.push(0);
      if (t.spans) t.spans.push(Array(t.rows[0].length).fill(null));
    }
    for (let k = 0; k < addCols; k++) {
      t.rows.forEach(r => r.push(''));
      if (t.spans) t.spans.forEach(r => r.push(null));
    }
    if (addCols) {
      if (t.widths) this.setTableColPx(note, [...px, ...Array(addCols).fill(colW)]);
      this.setTableWidth(note, this.noteSize(note).width + addCols * colW);
    }
  },

  // 고른 열의 너비를 똑같이 (그 열들 너비의 평균 — 표 너비 그대로)
  equalizeTableCols(note, c0 = 0, c1 = note.table.rows[0].length - 1) {
    if (c1 <= c0) return;
    const px = this.tableColPx(note);
    const avg = px.slice(c0, c1 + 1).reduce((a, b) => a + b, 0) / (c1 - c0 + 1);
    this.record();
    this.setTableColPx(note, px.map((w, i) => (i >= c0 && i <= c1 ? avg : w)));
    this.redrawTableKeepSel(note);
  },

  // 고른 행의 높이를 똑같이 — 평균, 글이 더 긴 행이 있으면 그 높이 (늘려 둔 표면 쪽지도 그만큼)
  equalizeTableRows(note, r0 = 0, r1 = note.table.rows.length - 1) {
    if (r1 <= r0) return;
    const el = document.getElementById(note.id);
    const table = el && el.querySelector('.note-table');
    if (!table) return;
    const z = this.zoom;
    const trs = [...table.rows];
    const hs = trs.map(tr => tr.getBoundingClientRect().height / z);
    const need = trs.map(tr => Math.max(...[...tr.cells].map(td => {
      const cs = getComputedStyle(td);
      const inner = td.firstElementChild ? td.firstElementChild.getBoundingClientRect().height : 0;
      return (inner + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)) / z;
    })));
    const pick = hs.slice(r0, r1 + 1);
    const target = Math.max(pick.reduce((a, b) => a + b, 0) / pick.length, ...need.slice(r0, r1 + 1));
    const stretched = this.tableStretched(note);
    const startH = note.height;
    const t = note.table;
    this.record();
    if (stretched || !t.heights) t.heights = stretched ? hs.map(h => +h.toFixed(1)) : hs.map(() => 0);
    let delta = 0;
    for (let r = r0; r <= r1; r++) {
      delta += target - hs[r];
      t.heights[r] = +target.toFixed(1);
    }
    if (stretched) this.setTableHeight(note, startH + delta);
    this.redrawTableKeepSel(note);
  },

  // 표를 다시 그리고 크기를 맞춤 — 칸 고르기는 그대로 (키보드도 표가 계속 받음)
  redrawTableKeepSel(note) {
    this.renderNoteBody(note);
    this.touch(note);
    this.fitNote(note);
    if (this.tableSelFor(note) && this.editingId === note.id) this.focusTableWrap(note);
    this.redrawTableBar(note);
  },

  // 고른 칸의 서식 막대 (text-color.js) — 넷째 줄에 표 단추
  showTableRangeBar(note, at = null) {
    this.showTextColorBar(note, null, 0, 0, at, { cells: () => this.tableSelCells(note), table: this.tableBarInfo(note) });
  },

  tableBarInfo(note) {
    const sel = this.tableSelFor(note);
    const R = sel ? this.tableSelRect(sel) : null;
    return {
      refresh: () => this.tableBarInfo(note),
      actions: [
        { label: 'table.equalCols', disabled: !R || R.c0 === R.c1, run: () => this.equalizeTableCols(note, R.c0, R.c1) },
        { label: 'table.equalRows', disabled: !R || R.r0 === R.r1, run: () => this.equalizeTableRows(note, R.r0, R.r1) },
        { label: 'table.clearCells', disabled: !R, run: () => this.clearTableCells(note) },
      ],
    };
  },

  redrawTableBar(note) {
    const bar = this.textColorBar;
    if (bar && bar.cells && bar.note === note && this.tableSelFor(note)) {
      this.showTextColorBar(note, null, 0, 0, null, { cells: bar.cells, table: this.tableBarInfo(note) });
    }
  },

  // 연대표에 걸린 쪽지의 모습 (timeline.js) — 고칠 수 없는 표
  tableMirror(note) {
    const table = document.createElement('table');
    table.className = 'note-table';
    table.style.setProperty('--cols', note.table.rows[0].length);
    note.table.rows.forEach(row => {
      const tr = table.insertRow();
      row.forEach(text => {
        const cell = document.createElement('div');
        cell.className = 'table-cell';
        cell.textContent = text;
        tr.insertCell().appendChild(cell);
      });
    });
    this.applyTableSizes(table, note);
    const wrap = document.createElement('div');
    wrap.className = 'note-table-wrap';
    wrap.appendChild(table);
    return wrap;
  },
};

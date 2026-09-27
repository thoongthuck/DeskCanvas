// 판에 붙은 쪽지 — 캘린더 칸 · 연대표 걸이 공통 (자리 계산 · 끌어서 붙이기 · 떼기)
//   캘린더:  note.boardId + note.date ('YYYY-MM-DD')
//   연대표:  캘린더 모드는 note.date, 직접 작성 모드는 note.segmentId + note.ratio (칸 안 위치 0~1)
//   note.boardAt = 붙인 시각 (한 날짜에 여러 장이면 가장 최근이 맨 위)
//   판별 자리 계산은 calendar.js (calendarNoteSlot · calendarDropAt) · timeline.js (timelineNoteSlot · timelineDropAt)
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { parseKey } from './calendar.js';

const BOARD_FIELDS = ['boardId', 'date', 'boardAt', 'segmentId', 'ratio'];
const FREE = { onBoard: false, hidden: false, buried: false, top: false, fanned: false, rot: 0, dx: 0, dy: 0 };

export const boardNoteMethods = {
  noteBoard(note) {
    return note.boardId ? this.findBoard(note.boardId) : null;
  },

  detachNoteFields(note) {
    BOARD_FIELDS.forEach(key => delete note[key]);
  },

  // 판에 붙은 쪽지의 자리 (월드 좌표). 판이 지금 보여 주지 않는 자리면 { offView: true }
  noteBoardSlot(note) {
    const board = this.noteBoard(note);
    if (!board) return null;
    if (board.kind === 'calendar') return this.calendarNoteSlot(board, note);
    if (board.kind === 'timeline') return this.timelineNoteSlot(board, note);
    return null;
  },

  // 화면에 그릴 쪽지 자리 · 크기 — 판에 붙었으면 판이 정한 자리, 끄는 중이면 떼기 전 크기 그대로
  noteRect(note) {
    const d = this.drag;
    if (d && d.item === note && d.carry) return { x: note.x, y: note.y, width: d.carry.width, height: d.carry.height };
    const anim = this.fanAnims && this.fanAnims.get(note.id);   // 펼치거나 접히는 중 (calendar.js animateFan)
    if (anim) return anim;
    const slot = this.noteBoardSlot(note);
    if (slot && !slot.offView) return { x: slot.x, y: slot.y, width: slot.width, height: slot.height };
    const size = this.noteSize(note);
    return { x: note.x, y: note.y, width: size.width, height: size.height };
  },

  noteBoardState(note) {
    const d = this.drag;
    if (d && d.item === note && d.carry) return { ...FREE, onBoard: true, top: true };
    const slot = this.noteBoardSlot(note);
    if (!slot) return FREE;
    if (slot.offView) return { ...FREE, onBoard: true, hidden: true };
    return {
      onBoard: true,
      hidden: !!slot.buried,
      buried: !!slot.buried,
      top: slot.top !== false,
      fanned: !!slot.fanned,
      rot: slot.rot || 0,
      dx: slot.dx || 0,
      dy: slot.dy || 0,
    };
  },

  isNoteOnBoard(note) {
    return this.noteBoardState(note).onBoard;
  },

  // 연대표에 걸린 쪽지 (끄는 중이 아닐 때)
  isNoteOnTimeline(note) {
    const board = this.noteBoard(note);
    return !!(board && board.kind === 'timeline' && !(this.drag && this.drag.item === note && this.drag.carry));
  },

  // 쪽지 요소에 판 상태 표시 (칸 크기 · 숨김 · 겹침 · 펼침)
  //   펼친 쪽지가 접히는 동안(fan-anim)은 맨 아래로 숨을 쪽지도 보이게 둠 → 다 접힌 뒤 calendar.js 가 다시 부름
  applyBoardState(el, note) {
    const s = this.noteBoardState(note);
    el.classList.toggle('on-board', s.onBoard);
    el.classList.toggle('board-hidden', s.hidden && !(s.buried && el.classList.contains('fan-anim')));
    el.classList.toggle('stack-top', s.top);
    el.classList.toggle('fanned', s.fanned);
    el.classList.toggle('locked', !note.pinned && this.noteLocked(note));
    this.applyNoteLayer(el, note, s.onBoard);
    if (s.rot || s.dx || s.dy) {
      el.style.setProperty('--stack-rot', `${s.rot}deg`);
      el.style.setProperty('--stack-dx', `${s.dx}px`);
      el.style.setProperty('--stack-dy', `${s.dy}px`);
    } else {
      ['--stack-rot', '--stack-dx', '--stack-dy'].forEach(v => el.style.removeProperty(v));
    }
  },

  // 판에 붙은 쪽지는 그 판 바로 위 층 — 판의 층(boards.js boardLayer)을 --layer 로 넣으면
  //   styles/boards.css 가 +1 (겹친 쪽지) · +2 (맨 위 쪽지) · +3 (고른 쪽지) 로 씀. 판에서 떼면 보통 층으로
  applyNoteLayer(el, note, onBoard = this.noteBoardState(note).onBoard) {
    const board = onBoard ? this.noteBoard(note) : null;
    const layer = board && board.kind !== 'group' ? String(this.boardLayer(board)) : '';
    if (el.style.getPropertyValue('--layer') === layer) return;
    if (layer) el.style.setProperty('--layer', layer);
    else el.style.removeProperty('--layer');
  },

  // 고정한 쪽지 · 잠근 판에 붙은 쪽지는 못 옮김
  noteLocked(note) {
    if (note.pinned) return true;
    const board = this.noteBoard(note);
    return !!(board && board.pinned);
  },

  // 끌기 시작 전: 판에 붙은 쪽지의 x · y 를 보이는 자리로 (끄는 동안 마우스를 따라가게)
  syncNoteSlotPosition(note) {
    const slot = this.noteBoardSlot(note);
    if (slot && !slot.offView) {
      note.x = slot.x;
      note.y = slot.y;
    }
  },

  // 실제로 끌기 시작하면 판에서 떼어 냄 (끄는 동안은 떼기 전 크기 그대로)
  liftNoteFromBoard(drag) {
    const note = drag.item;
    if (!note.boardId) return;
    const rect = drag.carrySize || this.noteRect(note);
    drag.carry = { width: rect.width, height: rect.height };
    drag.fromBoard = note.boardId;
    this.detachNoteFields(note);
    const el = document.getElementById(note.id);
    if (el) el.classList.remove('fan-anim');           // 펼치는 중이어도 끌면 마우스를 바로 따라오게
    this.refreshNote(note);
    this.refreshAllBoards();
  },

  // 판을 모두 다시 그리고 모든 쪽지 자리를 맞춤 (붙이기 · 떼기 · 달 이동 · 모드 변경 뒤)
  //   passive: 저절로 다시 그릴 때 — 이름 · 칸 이름을 고치는 중인 판은 건드리지 않음 (글자칸이 사라지지 않게)
  refreshAllBoards({ passive = false } = {}) {
    const typing = passive && document.activeElement && document.activeElement.matches('input, textarea') ? document.activeElement : null;
    const render = (b) => {
      const el = document.getElementById(b.id);
      if (typing && el && el.contains(typing)) return;
      this.renderBoard(b, el);
    };
    this.boards.filter(b => b.kind === 'calendar').forEach(render);
    this.boards.filter(b => b.kind === 'timeline').forEach(render);   // 연대표는 캘린더 쪽지도 함께 걸어서 나중에
    this.boards.filter(b => b.kind === 'group').forEach(render);
    this.notes.forEach(note => {
      const el = document.getElementById(note.id);
      if (el) this.updateNotePosition(el, note);
    });
    this.fileGroups().forEach(g => this.updateGroupFiles(g));
    this.updateFanOverlay();
  },

  // 판을 옮기거나 크기를 바꾸는 동안: 붙은 쪽지 · 펼친 표시가 판을 따라감
  //   (연동한 캘린더 쪽지를 연대표에 비춘 그림자는 판 요소 안에 있어서 저절로 따라감)
  updateBoardNotes(board) {
    if (board.kind === 'group') {                                   // 파일 묶음: 담긴 파일이 따라감 (groups.js)
      this.updateGroupFiles(board);
      return;
    }
    this.notes.forEach(note => {
      if (note.boardId !== board.id) return;
      const el = document.getElementById(note.id);
      if (el) this.updateNotePosition(el, note);
    });
    this.updateFanOverlay();
  },

  // 여러 번 불려도 다음 화면에 한 번만 다시 그림
  requestBoardsRefresh() {
    if (this.boardsRefreshFrame) return;
    this.boardsRefreshFrame = requestAnimationFrame(() => {
      this.boardsRefreshFrame = null;
      this.refreshAllBoards({ passive: true });
    });
  },

  // 끄는 동안: 마우스 아래 캘린더 칸 · 연대표 걸 자리를 표시
  updateBoardDropTarget(drag, clientX, clientY) {
    const wx = (clientX - this.panX) / this.zoom;
    const wy = (clientY - this.panY) / this.zoom;
    let target = null;
    for (const board of this.boards) {
      if (board.pinned || board.kind === 'group') continue;           // 파일 묶음에는 쪽지를 붙이지 않음
      const hit = board.kind === 'calendar' ? this.calendarDropAt(board, wx, wy) : this.timelineDropAt(board, wx, wy);
      if (hit) {
        target = { board, ...hit };
        break;
      }
    }
    const key = target ? `${target.board.id}|${target.key}` : '';
    if (key !== (drag.dropKey || '')) {
      drag.dropKey = key;
      drag.dropTarget = target;
      this.clearBoardDropTarget();
      if (target && target.board.kind === 'calendar') this.showCalendarDropHint(target);
      if (target && target.board.kind === 'timeline') this.showTimelineDropHint(target);
    }
    if (target && target.board.kind === 'timeline') this.moveTimelineBalloon(target, drag);
  },

  clearBoardDropTarget() {
    document.querySelectorAll('.cal-cell.drop-target').forEach(c => c.classList.remove('drop-target'));
    document.querySelectorAll('.tl-hint').forEach(h => h.remove());
    const balloon = document.getElementById('tl-balloon');
    if (balloon) balloon.remove();
  },

  // 놓았을 때: 칸 · 걸 자리 위면 거기에 붙이고, 아니면 보통 쪽지로 (원래 크기)
  settleNoteOnBoard(note, drag) {
    this.clearBoardDropTarget();
    const target = drag.dropTarget;
    if (target) {
      if (target.board.kind === 'calendar') {
        note.boardId = target.board.id;
        note.date = target.date;
      } else {
        this.hangNoteOnTimeline(note, target.board, target);
      }
      note.boardAt = Date.now();
    }
    const el = document.getElementById(note.id);
    if (el) {
      this.refreshNote(note, el);
      this.fitNote(note, el);
    }
    this.refreshAllBoards();
  },

  // 찾기 등으로 쪽지에 갈 때: 판이 다른 달 · 다른 때를 보고 있으면 그 자리를 펼침
  revealNoteOnBoard(note) {
    const board = this.noteBoard(note);
    if (!board) return;
    const slot = this.noteBoardSlot(note);
    if (!slot || !slot.offView) return;
    if (board.kind === 'calendar') this.setCalendarView(board, parseKey(note.date));
    else this.revealOnTimeline(board, note);
  },
};

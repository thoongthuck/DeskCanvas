// 끌기 — 쪽지 · 사진 · 파일 아이콘 · 판 옮기기, 접힌 모서리(쪽지)·모서리(사진 · 판)로 크기 조절
//   쪽지를 캘린더 칸 위에 놓으면 그 날짜에 붙고, 칸에서 끌어내면 떨어짐 (calendar.js)
//   파일을 파일 묶음 위에 놓으면 그 칸에 들어가고, 묶음 밖으로 끌어내면 빠짐 (groups.js)
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { NOTE_MIN_WIDTH, NOTE_MIN_HEIGHT } from './constants.js';

const PHOTO_MIN = 60;

export const dragMethods = {
  startItemDrag(e, kind, item) {
    this.drag = {
      mode: 'move', kind, item,
      startX: e.clientX, startY: e.clientY,
      offX: e.clientX - (item.x * this.zoom + this.panX),
      offY: e.clientY - (item.y * this.zoom + this.panY),
      moved: false,
    };
  },

  startItemResize(e, kind, item) {
    const el = document.getElementById(item.id);
    // 쪽지는 보이는 크기(글이 넘쳐 늘어난 크기)부터, 사진은 틀을 뺀 사진 크기 · 판은 저장된 크기부터
    const rect = kind === 'note' && el ? el.getBoundingClientRect() : null;
    const groupSize = kind === 'board' && item.kind === 'group' ? this.groupSize(item) : null;   // 파일이 차서 늘어난 높이부터
    this.drag = {
      mode: 'resize', kind, item,
      startX: e.clientX, startY: e.clientY,
      startW: rect ? rect.width / this.zoom : item.width,
      startH: rect ? rect.height / this.zoom : groupSize ? groupSize.height : item.height,
      ratio: item.height / Math.max(1, item.width),
      moved: false,
    };
  },

  handleDragMove(e) {
    const d = this.drag;
    if (!d) return;
    if (d.mode === 'move' && !d.moved
      && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 3) return;   // 그냥 클릭은 흔들리지 않게
    if (!d.moved) {
      this.record();                                                           // 되돌리기용으로 바뀌기 전 상태 저장
      if (d.kind === 'note' && d.mode === 'move') this.liftNoteFromBoard(d);  // 캘린더 칸에서 떼어 냄
      if (d.kind === 'file' && d.mode === 'move') this.liftFileFromGroup(d);  // 파일 묶음에서 꺼냄
    }
    d.moved = true;

    if (d.mode === 'move') {
      d.item.x = (e.clientX - d.offX - this.panX) / this.zoom;
      d.item.y = (e.clientY - d.offY - this.panY) / this.zoom;
    } else if (d.kind === 'photo') {
      const width = Math.max(PHOTO_MIN, d.startW + (e.clientX - d.startX) / this.zoom);
      d.item.width = width;
      d.item.height = Math.max(PHOTO_MIN, width * d.ratio);                    // 사진은 비율 유지
    } else if (d.kind === 'board') {
      this.resizeBoard(d.item, d.startW + (e.clientX - d.startX) / this.zoom, d.startH + (e.clientY - d.startY) / this.zoom);
    } else {
      d.item.width = Math.max(NOTE_MIN_WIDTH, d.startW + (e.clientX - d.startX) / this.zoom);
      d.item.height = Math.max(NOTE_MIN_HEIGHT, d.startH + (e.clientY - d.startY) / this.zoom);
    }
    this.updateItemPosition(d.kind, d.item);
    if (d.kind === 'note' && d.mode === 'move') this.updateBoardDropTarget(d, e.clientX, e.clientY);
    if (d.kind === 'file' && d.mode === 'move') this.updateGroupDropTarget(d, e.clientX, e.clientY);
    this.requestMinimap();
  },

  handleDragEnd() {
    const drag = this.drag;
    if (!drag) return;
    const { kind, item, moved } = drag;
    this.drag = null;
    if (moved && kind === 'note' && drag.mode === 'move') this.settleNoteOnBoard(item, drag);   // 칸에 붙이기 · 떼기
    if (moved) {
      // 파일 묶음 위면 그 칸으로. 아니면 격자 모드일 때 놓은 자리의 칸에 맞춤 (찬 칸이면 가까운 빈 칸으로)
      if (kind === 'file' && drag.mode === 'move' && !this.settleFileInGroup(item, drag) && this.gridSnapOn()) {
        this.settleFileInGrid(item);
      }
      this.dropHistoryIfUnchanged();          // 제자리로 돌아왔으면 되돌리기 한 단계로 치지 않음
      this.scheduleSave();
      // 끌고 난 직후 마우스를 뗀 곳에서 클릭이 일어나지 않게
      this.justDragged = true;
      setTimeout(() => { this.justDragged = false; }, 0);
    }
  },

  updateItemPosition(kind, item) {
    const el = document.getElementById(item.id);
    if (!el) return;
    if (kind === 'note') this.updateNotePosition(el, item);
    else if (kind === 'photo') this.updatePhotoPosition(el, item);
    else if (kind === 'board') {
      this.updateBoardPosition(el, item);
      this.updateBoardNotes(item);                   // 붙은 쪽지도 함께 움직임 (board-notes.js)
    } else this.updateFilePosition(el, item);
  },
};

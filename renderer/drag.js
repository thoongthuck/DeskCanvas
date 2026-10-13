// 끌기 — 쪽지 · 사진 · 파일 아이콘 · 판 옮기기, 접힌 모서리(쪽지)·모서리(사진 · 판)로 크기 조절
//   쪽지를 캘린더 칸 위에 놓으면 그 날짜에 붙고, 칸에서 끌어내면 떨어짐 (calendar.js)
//   파일을 파일 묶음 위에 놓으면 그 칸에 들어가고, 묶음 밖으로 끌어내면 빠짐 (groups.js)
//   파일을 폴더 아이콘 위에 놓으면 진짜 파일이 그 폴더로 옮겨짐 (files.js moveFilesIntoFolder)
//   여러 개를 골랐으면 (selection.js) 잡은 것과 함께 나머지도 같은 만큼 옮겨짐 (followers)
//   옮기거나 크기를 바꿀 때 다른 것의 가장자리 · 가운데에 맞춰 붙음 (자, align.js)
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { NOTE_MIN_WIDTH, NOTE_MIN_HEIGHT } from './constants.js';

const PHOTO_MIN = 60;
const RESIZE_SLACK = 4;                  // 쪽지 크기 조절: 세로로 이만큼은 움직여야 '아래로 끌었다'고 봄 (옆으로 끌 때 손 떨림)

export const dragMethods = {
  startItemDrag(e, kind, item) {
    this.drag = {
      mode: 'move', kind, item,
      startX: e.clientX, startY: e.clientY,
      offX: e.clientX - (item.x * this.zoom + this.panX),
      offY: e.clientY - (item.y * this.zoom + this.panY),
      x0: item.x, y0: item.y,
      followers: this.followersFor(kind, item),       // 함께 고른 것 — 같은 만큼 따라옴
      narrowTo: this.narrowTo,                        // 여럿 고른 채 눌렀음 → 끌지 않고 떼면 이것만 고름
      moved: false,
    };
    this.narrowTo = null;
  },

  startItemResize(e, kind, item) {
    const el = document.getElementById(item.id);
    // 쪽지는 보이는 크기(글이 넘쳐 늘어난 크기)부터, 사진은 틀을 뺀 사진 크기 · 판은 저장된 크기부터
    const rect = kind === 'note' && el ? el.getBoundingClientRect() : null;
    const groupSize = kind === 'board' && item.kind === 'group' ? this.groupSize(item) : null;   // 파일이 차서 늘어난 높이부터
    const pad = kind === 'note' ? this.noteEditPad(item) : 0;   // 고치는 중인 표: + 단추 자리는 빼고 (table-note.js)
    // 캘린더 · 연대표: 보이는 크기부터 (캘린더는 줄 수에 따라 높이가 다름 · 세로 연대표는 막대 길이가 세로로) → resizeBoard 가 바꿔 적음
    const boardSize = kind === 'board' && item.kind !== 'group' ? this.boardSize(item) : null;
    this.drag = {
      mode: 'resize', kind, item,
      startX: e.clientX, startY: e.clientY,
      startW: rect ? rect.width / this.zoom - pad : boardSize ? boardSize.width : item.width,
      startH: rect ? rect.height / this.zoom - pad : groupSize ? groupSize.height : boardSize ? boardSize.height : item.height,
      storedH: item.height,                    // 쪽지: 정해 둔 높이 (보이는 높이는 글 · 링크 영상에 맞춰 더 늘어나 있을 수 있음 — fit.js)
      ratio: item.height / Math.max(1, item.width),
      followers: [],
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
    document.body.classList.add('pointer-busy');                              // 쪽지 속 영상 재생기가 마우스를 가로채지 않게 (styles/note-links.css)
    if (d.mode === 'move') this.markDragging(d, true);                        // 끄는 것은 다른 쪽지 · 사진 · 파일 앞으로 (판에서 떼면 다시 그려져서 매번)

    if (d.mode === 'move') {
      d.item.x = (e.clientX - d.offX - this.panX) / this.zoom;
      d.item.y = (e.clientY - d.offY - this.panY) / this.zoom;
      const dx = d.item.x - d.x0;
      const dy = d.item.y - d.y0;
      d.followers.forEach(f => {                                              // 여러 개: 같은 만큼
        f.item.x = f.x0 + dx;
        f.item.y = f.y0 + dy;
      });
      this.snapDrag(d, e);                                                     // 자: 다른 것에 맞춰 붙음 (align.js)
      d.followers.forEach(f => this.updateItemPosition(f.kind, f.item));
    } else if (d.kind === 'photo') {
      const width = Math.max(PHOTO_MIN, d.startW + (e.clientX - d.startX) / this.zoom);
      d.item.width = width;
      d.item.height = Math.max(PHOTO_MIN, width * d.ratio);                    // 사진은 비율 유지
      const snap = this.snapResize(d, e);
      if (snap && snap.dw) {
        d.item.width = Math.max(PHOTO_MIN, width + snap.dw);
        d.item.height = Math.max(PHOTO_MIN, d.item.width * d.ratio);
      }
    } else if (d.kind === 'board') {
      const w = d.startW + (e.clientX - d.startX) / this.zoom;
      const h = d.startH + (e.clientY - d.startY) / this.zoom;
      this.resizeBoard(d.item, w, h);
      const snap = this.snapResize(d, e);
      if (snap && (snap.dw || snap.dh)) this.resizeBoard(d.item, w + snap.dw, h + snap.dh);
    } else {
      d.item.width = Math.max(NOTE_MIN_WIDTH, d.startW + (e.clientX - d.startX) / this.zoom);
      // 세로: 아래로 끌면 보이는 높이부터 (손잡이가 마우스를 따라옴). 옆으로만 끌거나 위로 끌면 정해 둔 높이부터 —
      //   글 · 링크 영상에 맞춰 늘어나 있던 만큼을 정한 높이로 굳히지 않음. 굳히면 넓혔다 좁힐 때마다 쪽지가 길어지기만 했음
      //   (영상 칸은 16:9 라 넓히면 커지고, 다시 좁혀도 그 높이가 남았음). 이제 너비에 맞춰 다시 줄어듦
      const dy = (e.clientY - d.startY) / this.zoom;
      d.item.height = Math.max(NOTE_MIN_HEIGHT, (dy > RESIZE_SLACK ? d.startH : d.storedH) + dy);
      const snap = this.snapResize(d, e);
      if (snap && (snap.dw || snap.dh)) {
        d.item.width = Math.max(NOTE_MIN_WIDTH, d.item.width + snap.dw);
        d.item.height = Math.max(NOTE_MIN_HEIGHT, d.item.height + snap.dh);
      }
    }
    // 쪽지 크기 조절: 맞춘 크기(글이 넘쳐 늘어난 크기, fit.js)도 새 크기로 다시 맞춤
    //   (자리만 옮기면 맞춰 둔 예전 크기로 그려져서 글이 넘친 쪽지는 끌어도 크기가 안 바뀌었음)
    if (d.kind === 'note' && d.mode === 'resize') this.fitNote(d.item);
    else this.updateItemPosition(d.kind, d.item);
    // 판에 붙이기는 쪽지 하나만 끌 때 (여럿을 함께 끌면 그냥 옮기기만)
    if (d.kind === 'note' && d.mode === 'move' && !d.followers.length) this.updateBoardDropTarget(d, e.clientX, e.clientY);
    if (d.kind === 'file' && d.mode === 'move') {
      const onFolder = this.updateFolderDropTarget(d, e.clientX, e.clientY);      // 폴더 아이콘 위 — 그 폴더에 넣기 (files.js)
      this.updateGroupDropTarget(d, e.clientX, e.clientY, onFolder);             // 폴더 위에서는 묶음에 끼워 넣지 않음
    }
    this.requestMinimap();
  },

  handleDragEnd() {
    const drag = this.drag;
    if (!drag) return;
    const { kind, item, moved } = drag;
    this.drag = null;
    document.body.classList.remove('pointer-busy');
    if (moved && drag.mode === 'move') this.markDragging(drag, false);
    if (!moved && drag.narrowTo) this.selectItem(drag.narrowTo);   // 여럿 고른 채 하나를 그냥 눌렀으면 그것만 고름
    const followers = drag.followers || [];
    if (moved && kind === 'note' && drag.mode === 'move' && !followers.length) this.settleNoteOnBoard(item, drag);   // 칸에 붙이기 · 떼기
    if (moved) {
      // 파일 묶음 위면 그 칸으로 (함께 끈 파일도). 아니면 격자 모드일 때 놓은 자리의 칸에 맞춤 (찬 칸이면 가까운 빈 칸으로)
      if (drag.mode === 'move') {
        const foldered = kind === 'file' && this.settleFilesInFolder(item, drag);   // 폴더 위면 그 폴더로 (진짜 파일을 옮김)
        const grouped = kind === 'file' && (this.settleFileInGroup(item, drag) || foldered);
        if (!grouped && this.gridSnapOn()) {
          [{ kind, item }, ...followers].filter(en => en.kind === 'file').forEach(en => this.settleFileInGrid(en.item));
        }
      }
      this.dropHistoryIfUnchanged();          // 제자리로 돌아왔으면 되돌리기 한 단계로 치지 않음
      this.scheduleSave();
      // 끌고 난 직후 마우스를 뗀 곳에서 클릭이 일어나지 않게
      this.justDragged = true;
      setTimeout(() => { this.justDragged = false; }, 0);
    }
  },

  // 끄는 동안 맨 앞에 (판은 빼고 — 판이 올라오면 붙은 쪽지를 가림)
  markDragging(d, on) {
    [{ kind: d.kind, item: d.item }, ...(d.followers || [])].forEach(en => {
      if (en.kind === 'board') return;
      const el = document.getElementById(en.item.id);
      if (el && el.classList.contains('dragging') !== on) el.classList.toggle('dragging', on);
    });
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

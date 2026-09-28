// 복사 · 붙여넣기 (Ctrl+C · Ctrl+V) — 캔버스 오브젝트
//   Ctrl+C: 고른 쪽지 · 사진 · 영상 · 판(캘린더 · 연대표 · 파일 묶음)과, 양 끝을 함께 고른 연결선을 앱 안에 복사해 둠 (this.canvasClip)
//     파일 아이콘(묶음에 든 파일 포함)은 윈도우 클립보드에 파일로 — 탐색기 · 다른 폴더에도 붙여넣을 수 있게
//     쪽지 글은 윈도우 클립보드에 글자로 — 다른 프로그램에 붙여넣으면 글이 들어감
//   Ctrl+V: 그 뒤로 클립보드가 그대로면 (윈도우 클립보드 순번이 같음 — main.js clipboard-seq) 복사해 둔 것을 마우스 자리에
//     서로의 자리 · 연결선은 그대로, 판에 붙은 쪽지는 판도 함께 복사했을 때만 붙은 채로. 붙여넣은 것을 고름 (맨 앞으로)
//     파일은 바탕화면 폴더에 '붙여넣기' (탐색기처럼 '- 복사본') — 묶음 하나만 복사했으면 붙여넣은 파일이 새 묶음 속으로 (files.js)
//     클립보드가 바뀌었으면 원래대로 (keyboard.js handlePaste — 사진은 사진으로, 글은 새 쪽지로, 탐색기에서 복사한 파일은 바탕화면에)
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)

const clone = (v) => JSON.parse(JSON.stringify(v));

export const clipboardMethods = {
  // Ctrl+C — 반환: 복사한 것이 있었는지
  copySelection() {
    const notes = [];
    const photos = [];
    const boards = [];
    const filePaths = [];
    const rects = [];
    let looseFiles = 0;
    this.selection.forEach(id => {
      const note = this.notes.find(n => n.id === id);
      if (note) {
        const r = this.noteRect(note);
        notes.push({ data: clone(note), rect: r });
        rects.push(r);
        return;
      }
      const photo = this.photos.find(p => p.id === id);
      if (photo) {
        photos.push(clone(photo));
        rects.push(this.itemRect('photo', photo));
        return;
      }
      const board = this.boards.find(b => b.id === id);
      if (board) {
        boards.push(clone(board));
        rects.push(this.itemRect('board', board));
        if (board.kind === 'group') this.groupMembers(board).forEach(f => { if (f.path) filePaths.push(f.path); });
        return;
      }
      const file = this.files.find(f => f.id === id);
      if (file && file.path) {
        filePaths.push(file.path);
        looseFiles++;
      }
    });
    const paths = [...new Set(filePaths)];
    if (!notes.length && !photos.length && !boards.length && !paths.length) return false;

    const ids = new Set([...notes.map(n => n.data.id), ...photos.map(p => p.id), ...boards.map(b => b.id)]);
    const links = this.links.filter(l => ids.has(l.a) && ids.has(l.b)).map(clone);
    const origin = rects.length
      ? { x: Math.min(...rects.map(r => r.x)), y: Math.min(...rects.map(r => r.y)) }
      : { x: 0, y: 0 };
    const groups = boards.filter(b => b.kind === 'group');
    this.canvasClip = {
      notes, photos, boards, links, origin,
      hasFiles: paths.length > 0,
      fileGroupId: groups.length === 1 && !looseFiles ? groups[0].id : null,   // 붙여넣은 파일이 들어갈 묶음 (복사한 쪽 id)
      seq: null,
    };
    const clip = this.canvasClip;
    const text = notes.map(n => this.noteClipText(n.data)).filter(Boolean).join('\n\n');
    const api = window.canvasAPI;
    if (api && api.canvasClipSet) {
      api.canvasClipSet(paths, text).then((seq) => { if (this.canvasClip === clip) clip.seq = seq; }).catch(() => {});
    }
    return true;
  },

  // 쪽지를 글자로 — 제목 · 본문 · 할 일 (다른 프로그램에 붙여넣을 때)
  noteClipText(note) {
    const parts = [];
    if (note.title) parts.push(note.title);
    if (note.content) parts.push(note.content);
    if (note.type === 'web' && note.url) parts.push(note.url);         // 웹 페이지 쪽지는 주소
    if (note.type === 'table' && note.table) parts.push(this.tableText(note));   // 표는 탭 · 줄로 (엑셀 · 한글에서 표가 됨)
    if (Array.isArray(note.items) && note.items.length) {
      parts.push(note.items.map(it => `${it.done ? '[x]' : '[ ]'} ${it.text || ''}`).join('\n'));
    }
    return parts.join('\n');
  },

  // 복사해 둔 뒤로 클립보드가 그대로인지 (다른 곳에서 무엇을 복사했으면 그것을 붙여넣음)
  async canvasClipCurrent() {
    const clip = this.canvasClip;
    if (!clip) return false;
    const api = window.canvasAPI;
    if (!api || !api.clipboardSeq) return true;
    try {
      const seq = await api.clipboardSeq();
      return clip.seq === null || seq === null || seq === clip.seq;
    } catch (_) {
      return true;
    }
  },

  // Ctrl+V — at: 붙여넣을 자리 (캔버스 좌표, 복사한 것들의 왼쪽 위가 여기로)
  pasteCanvasClip(at) {
    const clip = this.canvasClip;
    if (!clip) return false;
    this.record();
    const dx = at.x - clip.origin.x;
    const dy = at.y - clip.origin.y;
    const idMap = new Map();
    const pasted = [];

    clip.boards.forEach(src => {
      const b = clone(src);
      b.id = this.newId('board');
      delete b.z;                                        // 순서: 그 무리 맨 위 (layer-order.js)
      b.x += dx;
      b.y += dy;
      b.pinned = false;
      if (b.kind === 'group') b.fileIds = [];
      b.updatedAt = Date.now();
      const board = this.normalizeBoard(b);
      idMap.set(src.id, board.id);
      this.boards.push(board);
      this.createBoardElement(board);
      pasted.push(board.id);
    });

    clip.notes.forEach(({ data, rect }) => {
      const n = clone(data);
      n.id = this.newId('note');
      delete n.z;
      n.pinned = false;
      n.items = (Array.isArray(n.items) ? n.items : []).map(it => ({ ...it, id: this.newId('item') }));
      n.updatedAt = Date.now();
      if (n.boardId && idMap.has(n.boardId)) {
        n.boardId = idMap.get(n.boardId);                // 함께 복사한 판에 붙은 채로
        n.boardAt = Date.now();
      } else {
        this.detachNoteFields(n);                        // 판 없이 복사 — 보이던 자리에 떼어 냄
        n.x = rect.x + dx;
        n.y = rect.y + dy;
      }
      const note = this.normalizeNote(n);
      idMap.set(data.id, note.id);
      this.notes.push(note);
      this.createNoteElement(note);
      pasted.push(note.id);
    });

    clip.photos.forEach(src => {
      const p = clone(src);
      p.id = this.newId('photo');
      delete p.z;
      p.x += dx;
      p.y += dy;
      p.pinned = false;
      p.updatedAt = Date.now();
      const photo = this.normalizePhoto(p);
      idMap.set(src.id, photo.id);
      this.photos.push(photo);
      this.createPhotoElement(photo);
      pasted.push(photo.id);
    });

    clip.links.forEach(src => {
      const a = idMap.get(src.a);
      const b = idMap.get(src.b);
      if (a && b) this.links.push({ ...clone(src), id: this.newId('link'), a, b });
    });

    if (clip.hasFiles) {                                 // 파일은 바탕화면 폴더에 (탐색기의 붙여넣기) — 새로 생긴 아이콘은 이 자리에
      const group = clip.fileGroupId && idMap.get(clip.fileGroupId);
      this.pasteDesktopFiles(false, at, group || null);
    }

    if (clip.boards.length) this.refreshAllBoards();
    this.selection.clear();                              // 붙여넣은 것을 고름 (마지막 것이 selectedId)
    pasted.forEach(id => this.selection.add(id));
    this.updateSelection();
    this.requestLinks();
    this.scheduleSave();
    return true;
  },
};

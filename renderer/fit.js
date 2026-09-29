// 글이 넘칠 때 쪽지 크기 맞추기 (설정 → 쪽지 → 글이 넘칠 때)
//   자동 줄넘김: 너비는 그대로, 글이 다음 줄로 넘어가고 쪽지가 아래로 길어짐
//   자동 확장:   한 줄은 그대로 두고 쪽지가 옆으로 넓어짐 (줄이 많아지면 아래로도)
// 사용자가 접힌 모서리로 정한 크기(note.width · height)보다 작아지지는 않음
// 맞춘 크기는 저장하지 않고 this.fitSizes 에만 둠 (글을 지우면 원래 크기로 돌아감)
// 코드 쪽지는 크기 그대로 두고 코드 칸 안에서 스크롤. 캘린더 칸에 붙은 쪽지는 칸 크기 그대로
// 표 쪽지는 설정과 상관없이 표가 다 들어가게 — 옆으로도 (table-note.js). 표는 쪽지를 가득 채움 (정한 크기가 크면 행 · 열이 늘어남)
//   고치는 동안은 + 단추 자리만큼 쪽지를 오른쪽 · 아래로 더 늘림 (표 크기는 그대로 — + 가 사라지면 쪽지가 줄어듦)
// 연대표에 걸린 쪽지는 보통 쪽지처럼 맞추고, 크기가 바뀌면 층을 다시 나눔
import { NOTE_MAX_AUTO_WIDTH } from './constants.js';

const TABLE_MAX_WIDTH = 2400;                    // 표 쪽지가 열 때문에 넓어질 수 있는 한계 (zoom 1 기준)

// 넘친 만큼 재는 곳
const WIDE_FIELDS = '.note-title, .note-text, .check-text, .md-view, .md-input, .note-table-wrap, .ink-field.rich';
const TALL_FIELDS = '.note-text, .note-checklist, .md-view, .md-input, .note-table-wrap, .ink-field.rich';
// 고른 글자 크기가 보이는 동안(.ink-field.rich)은 서식 층이 자리를 차지하고 글자칸은 숨어 있음 — 그 글자칸은 재지 않음
const measured = (f) => !(f.matches('textarea') && f.closest('.ink-field.rich'));

export const fitMethods = {
  // 화면에 그릴 쪽지 크기 (월드 좌표)
  noteSize(note) {
    return this.fitSizes.get(note.id) || { width: note.width, height: note.height };
  },

  fitNote(note, el = document.getElementById(note.id)) {
    if (!el || !this.settings) return;
    const before = this.fitSizes.get(note.id);
    this.fitSizes.delete(note.id);
    this.updateNotePosition(el, note);           // 자리·크기를 화면 배율에 맞춤 (확대·축소·화면 이동도 여기로 옴)
    const onTimeline = this.isNoteOnTimeline(note);
    if (note.type === 'code' || note.type === 'web') return;   // 코드 · 웹 페이지 쪽지는 늘어나지 않고 안에서 스크롤
    if (!onTimeline && this.isNoteOnBoard(note)) return;   // 캘린더 칸에 붙은 쪽지 · 끄는 중인 쪽지는 크기 그대로
    this.fitNoteSize(note, el);
    const after = this.fitSizes.get(note.id);
    const sameSize = (a, b) => (!a && !b) || (a && b && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5);
    if (onTimeline && !sameSize(before, after)) this.requestBoardsRefresh();
  },

  fitNoteSize(note, el) {
    const z = this.zoom;
    const table = note.type === 'table';
    const pad = this.noteEditPad(note);             // 표를 고치는 동안 + 단추 자리 (table-note.js)
    let width = note.width + pad;
    let height = note.height + pad;
    if (pad) {
      this.fitSizes.set(note.id, { width, height });
      this.updateNotePosition(el, note);
    }

    // 자동 확장이거나 표: 옆으로 넘친 만큼 넓힘 (자동 줄넘김인 표는 표만 봄 — 긴 제목으로는 넓어지지 않게)
    const wide = this.settings.overflow === 'expand' ? WIDE_FIELDS : table ? '.note-table-wrap' : null;
    if (wide) {
      let extra = 0;
      el.querySelectorAll(wide).forEach(f => { if (measured(f)) extra = Math.max(extra, f.scrollWidth - f.clientWidth); });
      if (extra > 1) {
        width = Math.min(table ? TABLE_MAX_WIDTH + pad : NOTE_MAX_AUTO_WIDTH, note.width + pad + extra / z + 2);
        this.fitSizes.set(note.id, { width, height });
        this.updateNotePosition(el, note);
      }
    }

    // 글 밑에 링크 · 영상이 붙은 쪽지 (note-links.js): 링크 칸이 쪽지 밖으로 넘친 만큼 + 그 때문에 글칸이 눌려 안에 숨은 만큼
    //   — 둘은 따로라 더하고, 늘린 뒤 긴 주소의 줄바꿈이 달라질 수 있어 넘치지 않을 때까지 몇 번 더 잼
    //   표도 같게 — 정한 높이가 작으면 머리 · 제목이 넘친 만큼과 표가 눌린 만큼이 따로라서
    const withLinks = !!el.querySelector('.note-links');
    const addUp = withLinks || table;
    for (let pass = 0; pass < (addUp ? 3 : 1); pass++) {
      const boxY = Math.max(0, el.scrollHeight - el.clientHeight);
      let fieldY = 0;
      el.querySelectorAll(TALL_FIELDS).forEach(f => { if (measured(f)) fieldY = Math.max(fieldY, f.scrollHeight - f.clientHeight); });
      const extraY = addUp ? boxY + fieldY : Math.max(boxY, fieldY);
      if (extraY <= 1) break;
      height += extraY / z + 2;
      this.fitSizes.set(note.id, { width, height });
      this.updateNotePosition(el, note);
    }
  },

  // fitZoom: 이 배율에서 맞춤 — 화면을 옮기기만 할 때는 다시 재지 않음 (view.js updateUIPositions)
  fitAllNotes() {
    clearTimeout(this.refitTimer);
    this.fitZoom = this.zoom;
    this.notes.forEach(note => this.fitNote(note));
  },
};

// 자 (맞춰 붙기) — 쪽지 · 사진 · 파일 · 판을 끌거나 크기를 바꿀 때 다른 것의 가장자리 · 가운데에 맞춰 딱 붙음
//   맞추는 선: 세로(왼쪽 · 가운데 · 오른쪽), 가로(위 · 가운데 · 아래). 화면에서 6px 안이면 붙음. 화면에 보이는 것하고만
//   안내선은 그리지 않음 (정신 사나워서 — 사용자 요청으로 뺌)
//   여러 개를 함께 끌면 그 묶음 전체 네모로 맞춤. 끄는 도중 Alt 를 누르고 있으면 붙지 않음. 설정 '자 (맞춰 붙기)'
//   고른 것 정렬 (여러 개 메뉴 › 정렬): 왼쪽 · 가로 가운데 · 오른쪽 · 위 · 세로 가운데 · 아래 맞춤, 가로 · 세로 간격 같게
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { t } from './i18n.js';

const SNAP_PX = 6;             // 이만큼(화면 픽셀) 가까우면 붙음

// 네모 셋의 기준선: [왼쪽, 가운데, 오른쪽] · [위, 가운데, 아래]
const xs = (r) => [r.x, r.x + r.width / 2, r.x + r.width];
const ys = (r) => [r.y, r.y + r.height / 2, r.y + r.height];

export const alignMethods = {
  alignOn() {
    return !this.settings || this.settings.alignGuides !== false;
  },

  // 맞출 상대 — 끄는 것들 말고 화면에 보이는 것 (숨은 쪽지 · 접힌 묶음 속 파일 · 함께 움직이는 묶음 속 파일은 빼고)
  alignTargets(moving) {
    const skip = new Set(moving.map(en => en.item.id));
    const movingBoards = new Set();
    moving.forEach(en => {
      if (en.kind !== 'board') return;
      movingBoards.add(en.item.id);
      if (en.item.kind === 'group') en.item.fileIds.forEach(id => skip.add(id));   // 묶음 속 파일은 묶음과 함께 움직임
    });
    this.notes.forEach(n => { if (n.boardId && movingBoards.has(n.boardId)) skip.add(n.id); });   // 판에 붙은 쪽지도
    const z = this.zoom;
    const view = { x: -this.panX / z, y: -this.panY / z, width: this.viewWidth / z, height: this.viewHeight / z };
    const onScreen = (r) => r.x < view.x + view.width && r.x + r.width > view.x && r.y < view.y + view.height && r.y + r.height > view.y;
    const rects = [];
    const add = (kind, item) => {
      if (skip.has(item.id)) return;
      const r = this.itemRect(kind, item);
      if (r && r.width > 0 && onScreen(r)) rects.push(r);
    };
    this.notes.forEach(n => { if (!this.noteBoardState(n).hidden) add('note', n); });
    this.photos.forEach(p => add('photo', p));
    this.files.forEach(f => {
      const slot = this.fileSlot(f);
      if (!(slot && slot.hidden)) add('file', f);
    });
    this.boards.forEach(b => add('board', b));
    return rects;
  },

  // 가장 가까운 기준선 — { diff, value } (없으면 null)
  closestLine(mine, targets, pick) {
    const limit = SNAP_PX / this.zoom;
    let best = null;
    mine.forEach(m => {
      targets.forEach(r => pick(r).forEach(v => {
        const diff = v - m;
        if (Math.abs(diff) <= limit && (!best || Math.abs(diff) < Math.abs(best.diff))) best = { diff, value: v };
      }));
    });
    return best;
  },

  // 끄는 동안 (drag.js) — 끄는 것들을 맞춰 옮김
  snapDrag(d, e) {
    const moving = [{ kind: d.kind, item: d.item }, ...d.followers];
    if (!this.alignOn() || e.altKey || (this.gridSnapOn() && moving.every(en => en.kind === 'file'))) return;
    const box = this.unionRect(moving.map(en => this.itemRect(en.kind, en.item)));
    if (!box) return;
    const targets = this.alignTargets(moving);
    const sx = this.closestLine(xs(box), targets, xs);
    const sy = this.closestLine(ys(box), targets, ys);
    const dx = sx ? sx.diff : 0;
    const dy = sy ? sy.diff : 0;
    if (dx || dy) {
      moving.forEach(en => {
        en.item.x += dx;
        en.item.y += dy;
      });
    }
  },

  // 크기 바꾸는 동안 — 오른쪽 · 아래 가장자리를 맞춤 (사진은 비율 그대로라 가로만)
  snapResize(d, e) {
    if (!this.alignOn() || e.altKey) return null;
    const r = this.itemRect(d.kind, d.item);
    const targets = this.alignTargets([{ kind: d.kind, item: d.item }]);
    const pickX = (t) => [t.x, t.x + t.width];
    const pickY = (t) => [t.y, t.y + t.height];
    const sx = this.closestLine([r.x + r.width], targets, pickX);
    const sy = d.kind === 'photo' ? null : this.closestLine([r.y + r.height], targets, pickY);
    return { dw: sx ? sx.diff : 0, dh: sy ? sy.diff : 0 };
  },

  unionRect(rects) {
    const list = rects.filter(Boolean);
    if (!list.length) return null;
    const x = Math.min(...list.map(r => r.x));
    const y = Math.min(...list.map(r => r.y));
    return { x, y, width: Math.max(...list.map(r => r.x + r.width)) - x, height: Math.max(...list.map(r => r.y + r.height)) - y };
  },

  // ---- 고른 것 정렬 (여러 개 메뉴 › 정렬) ----
  alignMenuItems() {
    const n = this.selectedEntries().filter(en => this.movableEntry(en.kind, en.item)).length;
    if (n < 2) return [];
    const items = [
      { label: t('align.left'), action: () => this.alignSelection('left') },
      { label: t('align.hcenter'), action: () => this.alignSelection('hcenter') },
      { label: t('align.right'), action: () => this.alignSelection('right') },
      { separator: true },
      { label: t('align.top'), action: () => this.alignSelection('top') },
      { label: t('align.vcenter'), action: () => this.alignSelection('vcenter') },
      { label: t('align.bottom'), action: () => this.alignSelection('bottom') },
    ];
    if (n >= 3) {
      items.push({ separator: true });
      items.push({ label: t('align.spaceH'), action: () => this.alignSelection('spaceH') });
      items.push({ label: t('align.spaceV'), action: () => this.alignSelection('spaceV') });
    }
    return [{ icon: 'menu-align.svg', label: t('menu.align'), arrow: true, submenu: items }];
  },

  // 고른 것 가운데 옮길 수 있는 것만 (판에 붙은 쪽지 · 고정한 것 · 묶음 속 파일은 제자리) — 되돌리기 한 번에
  alignSelection(how) {
    const list = this.selectedEntries()
      .filter(en => this.movableEntry(en.kind, en.item))
      .map(en => ({ ...en, r: this.itemRect(en.kind, en.item) }));
    if (list.length < 2) return false;
    const box = this.unionRect(list.map(en => en.r));
    this.record();
    const place = (en, x, y) => {
      en.item.x += x - en.r.x;
      en.item.y += y - en.r.y;
    };
    if (how === 'spaceH' || how === 'spaceV') {
      const h = how === 'spaceH';
      const sorted = [...list].sort((a, b) => (h ? a.r.x - b.r.x : a.r.y - b.r.y));
      const total = sorted.reduce((sum, en) => sum + (h ? en.r.width : en.r.height), 0);
      const gap = ((h ? box.width : box.height) - total) / (sorted.length - 1);
      let at = h ? box.x : box.y;
      sorted.forEach(en => {
        if (h) place(en, at, en.r.y);
        else place(en, en.r.x, at);
        at += (h ? en.r.width : en.r.height) + gap;
      });
    } else {
      list.forEach(en => {
        const r = en.r;
        const x = how === 'left' ? box.x : how === 'hcenter' ? box.x + (box.width - r.width) / 2 : how === 'right' ? box.x + box.width - r.width : r.x;
        const y = how === 'top' ? box.y : how === 'vcenter' ? box.y + (box.height - r.height) / 2 : how === 'bottom' ? box.y + box.height - r.height : r.y;
        place(en, x, y);
      });
    }
    list.forEach(en => this.updateItemPosition(en.kind, en.item));
    this.scheduleSave();
    return true;
  },
};

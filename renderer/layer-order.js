// 순서 (레이어) — 겹친 것 가운데 무엇이 위에 올지 정함
//   우클릭 › 순서 › 맨 앞으로 · 앞으로 · 뒤로 · 맨 뒤로 / Ctrl+] · Ctrl+[ · Ctrl+Shift+] · Ctrl+Shift+[
//   무리마다 따로 순서 (item.z — 저장됨, 작을수록 뒤):
//     'fg'    쪽지 · 사진 · 영상 · 파일 — 늘 판 · 파일 묶음 · 연결선보다 위 (styles.css .sticky-note 등: 10000 + 순서)
//     'board' 캘린더 · 연대표끼리 — 붙은 쪽지는 판 바로 위라 판과 함께 움직임 (boards.js boardLayer)
//     'group' 파일 묶음끼리 — 담긴 파일은 묶음 바로 위라 묶음과 함께 움직임 (groups.js groupLayer)
//   → 순서를 어떻게 바꿔도 판과 붙은 쪽지 사이 · 묶음과 담긴 파일 사이에는 아무것도 끼지 않음
//   판에 붙은 쪽지 · 묶음 속 파일은 따로 바꾸지 않음 (판 · 묶음이 바꿈). 고정한 것은 늘 맨 뒤라 빠짐
//   앞으로 · 뒤로 = 겹친 것 하나를 넘어감 (겹치지 않은 것과 바꿔 봐야 보이는 게 같아서)
//   고른 것은 고른 동안 맨 앞으로 떠오름 — 고르기를 풀면 여기서 정한 순서로
//   z 는 불러올 때(renderAll)마다 0, 1, 2 … 로 다시 매김. 새로 만든 것 · 붙여넣은 것은 그 무리 맨 위
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { t } from './i18n.js';

const SETS = ['fg', 'board', 'group'];

export const layerOrderMethods = {
  // 이 무리의 것 전부 { kind, item } — 처음 매길 때 순서 (예전 모습 그대로: 파일 < 쪽지 < 사진, 판 · 묶음은 만든 순서)
  layerEntries(set) {
    if (set === 'fg') {
      return [
        ...this.files.map(item => ({ kind: 'file', item })),
        ...this.notes.map(item => ({ kind: 'note', item })),
        ...this.photos.map(item => ({ kind: 'photo', item })),
      ];
    }
    return this.boards.filter(b => (set === 'group') === (b.kind === 'group')).map(item => ({ kind: 'board', item }));
  },

  layerSetOf(kind, item) {
    if (kind === 'board') return item.kind === 'group' ? 'group' : 'board';
    return 'fg';
  },

  // 불러올 때 (notes.js renderAll) — 없는 것은 뒤에, 있는 것은 그 순서대로 0, 1, 2 …
  normalizeLayerOrder() {
    this.layerTop = {};
    SETS.forEach(set => {
      const list = this.layerEntries(set)
        .map((en, i) => ({ en, key: typeof en.item.z === 'number' && Number.isFinite(en.item.z) ? en.item.z : Infinity, i }))
        .sort((a, b) => (a.key - b.key) || (a.i - b.i));
      list.forEach(({ en }, i) => { en.item.z = i; });
      this.layerTop[set] = list.length - 1;
    });
  },

  // 순서 값 — 아직 없으면(새로 만든 것) 그 무리 맨 위
  layerZ(set, item) {
    if (!this.layerTop) this.layerTop = { fg: -1, board: -1, group: -1 };
    if (typeof item.z !== 'number' || !Number.isFinite(item.z)) item.z = ++this.layerTop[set];
    else if (item.z > this.layerTop[set]) this.layerTop[set] = item.z;
    return item.z;
  },

  // 쪽지 · 사진 · 파일 요소에 순서 (CSS 가 --order 로 층을 셈) — 자리를 옮길 때마다 불려서 바뀐 때만 씀
  applyItemOrder(el, item) {
    const z = String(this.layerZ('fg', item));
    if (el.dataset.order === z) return;
    el.dataset.order = z;
    el.style.setProperty('--order', z);
  },

  // 순서를 바꾼 뒤 모두 다시 (판 · 묶음 층은 선택 표시와 함께 다시 셈)
  applyAllOrder() {
    [...this.notes, ...this.photos, ...this.files].forEach(item => {
      const el = document.getElementById(item.id);
      if (el) this.applyItemOrder(el, item);
    });
    this.updateGroupSelection();
    this.updateBoardSelection();
  },

  // 순서를 바꿀 수 있는 것 — 판에 붙은 쪽지 · 묶음 속 파일 · 고정한 것 · 잠근 판은 빠짐
  canReorder(kind, item) {
    if (!item || item.pinned) return false;
    if (kind === 'note') return !item.boardId;
    if (kind === 'file') return !this.fileGroup(item);
    return kind === 'photo' || kind === 'board';
  },

  // 캘린더 · 연대표도 (selection.js itemById 는 파일 묶음만 판으로 셈)
  layerEntryById(id) {
    const found = this.itemById(id);
    if (found) return found;
    const board = this.boards.find(b => b.id === id);
    return board ? { kind: 'board', item: board } : null;
  },

  // 순서를 바꿀 대상 — id 를 주면 (여럿 고른 것 가운데 하나가 아니면) 그것 하나, 아니면 고른 것
  reorderEntries(id = null) {
    const ids = id && !this.multiSelected(id) ? [id] : [...this.selection];
    return ids.map(x => this.layerEntryById(x)).filter(en => en && this.canReorder(en.kind, en.item));
  },

  //   바뀐 게 없으면 (겹친 것이 없어 앞으로 · 뒤로 갈 곳이 없음 · 이미 맨 앞) 되돌리기에 넣지 않음
  reorderSelection(op, id = null) {
    const entries = this.reorderEntries(id);
    if (!entries.length) return;
    const bySet = new Map();
    entries.forEach(en => {
      const set = this.layerSetOf(en.kind, en.item);
      if (!bySet.has(set)) bySet.set(set, new Set());
      bySet.get(set).add(en.item);
    });
    const before = new Map();
    bySet.forEach((targets, set) => this.layerEntries(set).forEach(en => before.set(en.item, this.layerZ(set, en.item))));
    bySet.forEach((targets, set) => this.reorderSet(set, targets, op));
    const after = [...before.keys()].map(item => [item, item.z]);
    if (after.every(([item, z]) => before.get(item) === z)) return;
    after.forEach(([item]) => { item.z = before.get(item); });   // 되돌리기에는 바꾸기 전 모습을
    this.record();
    after.forEach(([item, z]) => { item.z = z; });
    this.applyAllOrder();
    this.scheduleSave();
  },

  // 한 무리 안에서 순서 바꾸기 — 고른 것끼리의 순서는 그대로
  reorderSet(set, targets, op) {
    const list = this.layerEntries(set).sort((a, b) => this.layerZ(set, a.item) - this.layerZ(set, b.item));
    const isTarget = (en) => targets.has(en.item);
    let next;
    if (op === 'front') next = [...list.filter(en => !isTarget(en)), ...list.filter(isTarget)];
    else if (op === 'back') next = [...list.filter(isTarget), ...list.filter(en => !isTarget(en))];
    else {
      next = list.slice();
      const rect = (en) => this.itemRect(en.kind, en.item);
      const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      // 넘어갈 상대: 고른 것이 아니고, 순서를 바꿀 수 있고(판에 붙은 쪽지 · 고정한 것 등은 다른 층이라 넘어가 봐야 같음), 겹친 것
      const passable = (en, r) => !isTarget(en) && this.canReorder(en.kind, en.item) && overlaps(r, rect(en));
      if (op === 'forward') {
        for (let i = next.length - 1; i >= 0; i--) {             // 위의 것부터 — 옮겨도 아래 칸들은 그대로
          const en = next[i];
          if (!isTarget(en)) continue;
          const r = rect(en);
          let j = i + 1;
          while (j < next.length && !passable(next[j], r)) j++;
          if (j >= next.length) continue;
          next.splice(i, 1);
          next.splice(j, 0, en);                                  // 빼고 나면 j - 1 이 넘어갈 상대 → 그 바로 위
        }
      } else if (op === 'backward') {
        for (let i = 0; i < next.length; i++) {                  // 아래의 것부터
          const en = next[i];
          if (!isTarget(en)) continue;
          const r = rect(en);
          let j = i - 1;
          while (j >= 0 && !passable(next[j], r)) j--;
          if (j < 0) continue;
          next.splice(i, 1);
          next.splice(j, 0, en);                                  // 넘어갈 상대 바로 아래
        }
      }
    }
    next.forEach((en, i) => { en.item.z = i; });
    this.layerTop[set] = next.length - 1;
  },

  // 우클릭 메뉴의 '순서 ›' — 바꿀 수 있는 것이 없으면 []
  //   id: 이 오브젝트의 메뉴 (여럿 고른 것 가운데 하나면 고른 것 모두)
  layerMenuItems(id = null) {
    if (!this.reorderEntries(id).length) return [];
    const row = (op, key) => ({ label: t(`order.${op}`), key, action: () => this.reorderSelection(op, id) });
    return [{
      icon: 'menu-order.svg', label: t('menu.order'), arrow: true,
      submenu: [row('front', 'Ctrl+Shift+]'), row('forward', 'Ctrl+]'), row('backward', 'Ctrl+['), row('back', 'Ctrl+Shift+[')],
    }];
  },
};

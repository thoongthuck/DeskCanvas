// 미니맵 — Ctrl+M 을 눌렀을 때만 나타남 (다시 누르면 사라짐 · 앱을 켜면 늘 꺼진 채로)
//   캔버스에 놓인 것 전부와 지금 보는 화면(파란 네모)을 작게 그림. 누르거나 끌면 그 자리로 화면이 옮겨감
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { NOTE_COLORS } from './constants.js';
import { t } from './i18n.js';

const MAP = { width: 220, height: 150, pad: 10 };

export const minimapMethods = {
  toggleMinimap() {
    this.minimapOn = !this.minimapOn;
    this.syncMinimap();
  },

  // 켜 둔 상태에 맞춰 미니맵을 만들거나 없앰
  syncMinimap() {
    const on = !!this.minimapOn;
    let box = document.getElementById('minimap');
    if (!on) {
      if (box) box.remove();
      return;
    }
    if (!box) {
      box = document.createElement('div');
      box.id = 'minimap';
      box.title = t('minimap.label');
      const canvas = document.createElement('canvas');
      box.appendChild(canvas);
      document.body.appendChild(box);
      box.addEventListener('mousedown', (e) => this.startMinimapDrag(e));
      box.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    this.requestMinimap();
  },

  // 여러 번 불려도 한 화면에 한 번만 그림
  requestMinimap() {
    if (!this.minimapOn || this.minimapFrame) return;
    this.minimapFrame = requestAnimationFrame(() => {
      this.minimapFrame = null;
      this.drawMinimap();
    });
  },

  // 지금 보는 화면 (월드 좌표)
  viewportRect() {
    return {
      x: -this.panX / this.zoom,
      y: -this.panY / this.zoom,
      width: (this.viewWidth || window.innerWidth) / this.zoom,
      height: (this.viewHeight || window.innerHeight) / this.zoom,
    };
  },

  minimapItems() {
    const items = [];
    this.boards.forEach(b => items.push(b.kind === 'group'              // 파일 묶음은 포스트잇 색으로
      ? { kind: 'note', rect: this.itemRect('board', b), color: this.groupCustomColor(b) || (NOTE_COLORS[b.color] || NOTE_COLORS.yellow).swatch }
      : { kind: 'board', rect: this.itemRect('board', b) }));
    this.files.forEach(f => {
      const slot = this.fileSlot(f);
      if (!(slot && slot.hidden)) items.push({ kind: 'file', rect: this.itemRect('file', f) });   // 접힌 묶음 속은 빼고
    });
    this.photos.forEach(p => items.push({ kind: 'photo', rect: this.itemRect('photo', p) }));
    this.notes.forEach(n => {
      if (this.noteBoardState(n).hidden) return;                 // 다른 달에 붙은 쪽지 · 겹쳐 숨은 쪽지
      const color = n.color === 'custom' && n.customColor ? n.customColor : (NOTE_COLORS[n.color] || NOTE_COLORS.yellow).swatch;
      items.push({ kind: 'note', rect: this.itemRect('note', n), color });
    });
    return items;
  },

  // 월드 좌표 ↔ 미니맵 좌표 (놓인 것 전부 + 지금 화면이 들어가게)
  minimapMapping(items) {
    const view = this.viewportRect();
    let x1 = view.x, y1 = view.y, x2 = view.x + view.width, y2 = view.y + view.height;
    items.forEach(({ rect: r }) => {
      x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y);
      x2 = Math.max(x2, r.x + r.width); y2 = Math.max(y2, r.y + r.height);
    });
    const w = Math.max(1, x2 - x1), h = Math.max(1, y2 - y1);
    const scale = Math.min((MAP.width - MAP.pad * 2) / w, (MAP.height - MAP.pad * 2) / h);
    return {
      scale,
      offX: (MAP.width - w * scale) / 2 - x1 * scale,
      offY: (MAP.height - h * scale) / 2 - y1 * scale,
    };
  },

  drawMinimap() {
    const box = document.getElementById('minimap');
    const canvas = box && box.querySelector('canvas');
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(MAP.width * dpr)) {
      canvas.width = Math.round(MAP.width * dpr);
      canvas.height = Math.round(MAP.height * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, MAP.width, MAP.height);

    const items = this.minimapItems();
    const m = (this.minimapDrag && this.minimapDrag.mapping) || this.minimapMapping(items);
    const box2 = (r) => {
      const w = Math.max(2, r.width * m.scale);
      const h = Math.max(2, r.height * m.scale);
      return [r.x * m.scale + m.offX, r.y * m.scale + m.offY, w, h];
    };

    items.forEach(item => {
      const [x, y, w, h] = box2(item.rect);
      if (item.kind === 'board') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      } else {
        ctx.fillStyle = item.kind === 'note' ? item.color
          : item.kind === 'photo' ? '#E8E4DC'
          : 'rgba(255, 255, 255, 0.45)';
        ctx.fillRect(x, y, w, h);
      }
    });

    const [vx, vy, vw, vh] = box2(this.viewportRect());
    ctx.fillStyle = 'rgba(90, 152, 254, 0.14)';
    ctx.fillRect(vx, vy, vw, vh);
    ctx.strokeStyle = '#5A98FE';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vx + 0.75, vy + 0.75, Math.max(1, vw - 1.5), Math.max(1, vh - 1.5));
  },

  // 누르거나 끌면 그 자리가 화면 가운데로 (끄는 동안은 축척을 고정해서 흔들리지 않게)
  startMinimapDrag(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const box = document.getElementById('minimap');
    const mapping = this.minimapMapping(this.minimapItems());
    this.minimapDrag = { mapping };
    const moveTo = (ev) => {
      const r = box.getBoundingClientRect();
      const wx = (ev.clientX - r.left - mapping.offX) / mapping.scale;
      const wy = (ev.clientY - r.top - mapping.offY) / mapping.scale;
      this.panX = this.viewWidth / 2 - wx * this.zoom;
      this.panY = this.viewHeight / 2 - wy * this.zoom;
      this.updateUIPositions();
      this.draw();
    };
    const up = () => {
      document.removeEventListener('mousemove', moveTo);
      document.removeEventListener('mouseup', up);
      this.minimapDrag = null;
      this.requestMinimap();
      this.scheduleSave({ system: true });
    };
    document.addEventListener('mousemove', moveTo);
    document.addEventListener('mouseup', up);
    moveTo(e);
  },
};

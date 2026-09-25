// 윈도우 11 모양 우클릭 메뉴 — 그리기 · 마우스 · 키보드 (menu.html)
//   main 이 보내는 것: { layout: { top, list }, x, y (누른 자리), work (이 창 안에서 작업 영역), dark }
//   돌려주는 것: menuHost.choose(id) — 줄 id · -1 (추가 옵션 표시) · null (그만둠)
(() => {
  'use strict';

  const CHEVRON = '\uE76C';
  const CHECK = '\uE73E';
  const SUB_DELAY = 250;          // 하위 목록 줄에 머물면 이만큼 뒤 열림

  let work = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  let panels = [];                // [0] 본 메뉴, [1…] 열린 하위 목록
  let done = false;
  let subTimer = null;

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  function finish(id) {
    if (done) return;
    done = true;
    clearTimeout(subTimer);
    window.menuHost.choose(id);
    panels.forEach(p => p.node.remove());
    panels = [];
  }

  // 글자에서 바로 누르기 글자에 <u> (키보드로 쓸 때만 밑줄)
  function labelNode(text, access) {
    const span = el('span', 'label');
    const i = access ? text.toUpperCase().indexOf(access) : -1;
    if (i < 0) {
      span.textContent = text;
      return span;
    }
    span.append(text.slice(0, i), el('u', '', text[i]), text.slice(i + 1));
    return span;
  }

  function iconNode(entry) {
    const box = el('span', 'icon');
    if (entry.chk) box.appendChild(el('span', 'glyph', entry.radio ? '●' : CHECK));
    else if (entry.glyph) box.appendChild(el('span', 'glyph', entry.glyph));
    else if (entry.appIcon || entry.img) {
      const img = el('img', entry.appIcon ? 'app' : '');
      img.src = entry.appIcon ? `icons/${entry.appIcon}` : entry.img;
      img.alt = '';
      img.draggable = false;
      box.appendChild(img);
    }
    return box;
  }

  // 판 하나 (본 메뉴 · 하위 목록)
  function buildPanel(entries, level, top) {
    const node = el('div', 'panel' + (level ? ' sub' : ''));
    const rows = [];
    if (top && top.length) {
      const bar = el('div', 'bar' + (top.length <= 2 ? ' labels' : ''));
      top.forEach(entry => {
        const b = el('button');
        b.type = 'button';
        b.title = entry.text;
        b.disabled = !!entry.dis;
        b.appendChild(el('span', 'glyph', entry.glyph || ''));
        if (top.length <= 2) b.appendChild(el('span', '', entry.text));
        b.addEventListener('click', () => { if (!entry.dis) finish(entry.id); });
        bar.appendChild(b);
        rows.push({ node: b, entry, bar: true });
      });
      node.appendChild(bar);
    }
    entries.forEach(entry => {
      if (entry.sep) {
        if (node.lastChild && !node.lastChild.classList.contains('sep') && !node.lastChild.classList.contains('bar')) node.appendChild(el('div', 'sep'));
        return;
      }
      const row = el('div', 'item' + (entry.dis ? ' off' : ''));
      row.append(iconNode(entry), labelNode(entry.text, entry.access));
      if (entry.sub && entry.sub.length) row.appendChild(el('span', 'arrow glyph', CHEVRON));
      else if (entry.key) row.appendChild(el('span', 'key', entry.key));
      const info = { node: row, entry };
      rows.push(info);
      row.addEventListener('mouseenter', () => hoverRow(level, info));
      row.addEventListener('mouseup', (e) => {
        if (e.button !== 0 && e.button !== 2) return;
        activate(level, info);
      });
      node.appendChild(row);
    });
    while (node.lastChild && node.lastChild.classList.contains('sep')) node.lastChild.remove();
    node.addEventListener('mousedown', (e) => e.stopPropagation());
    node.addEventListener('mouseup', (e) => e.stopPropagation());
    return { node, rows, level, focus: -1, owner: null };
  }

  // 판을 자리에 — 누른 자리 오른쪽 아래, 모자라면 왼쪽 · 위로 (윈도우 메뉴처럼)
  function placeMain(panel, x, y) {
    document.body.appendChild(panel.node);
    const w = panel.node.offsetWidth, h = panel.node.offsetHeight;
    let left = x, top = y, up = false;
    if (left + w > work.right) left = Math.max(work.left, x - w);
    if (top + h > work.bottom) {
      top = Math.max(work.top, y - h);
      up = true;
    }
    panel.node.style.left = `${left}px`;
    panel.node.style.top = `${top}px`;
    if (up) panel.node.classList.add('up');
    requestAnimationFrame(() => panel.node.classList.add('shown'));
  }

  function placeSub(panel, rowNode, parentNode) {
    document.body.appendChild(panel.node);
    const r = rowNode.getBoundingClientRect();
    const p = parentNode.getBoundingClientRect();
    const w = panel.node.offsetWidth, h = panel.node.offsetHeight;
    let left = p.right - 4;
    if (left + w > work.right) left = Math.max(work.left, p.left - w + 4);
    let top = r.top - 5;
    if (top + h > work.bottom) top = Math.max(work.top, work.bottom - h);
    panel.node.style.left = `${left}px`;
    panel.node.style.top = `${top}px`;
    requestAnimationFrame(() => panel.node.classList.add('shown'));
  }

  function closeFrom(level) {
    while (panels.length > level) {
      const p = panels.pop();
      p.node.remove();
      if (p.owner) p.owner.node.classList.remove('open');
    }
  }

  function openSub(level, info, focusFirst) {
    if (!info.entry.sub || info.entry.dis) return;
    const existing = panels[level + 1];
    if (existing && existing.owner === info) {
      if (focusFirst) setFocus(level + 1, firstEnabled(existing, 0, 1));
      return;
    }
    closeFrom(level + 1);
    const panel = buildPanel(info.entry.sub, level + 1, null);
    panel.owner = info;
    info.node.classList.add('open');
    panels.push(panel);
    placeSub(panel, info.node, panels[level].node);
    if (focusFirst) setFocus(level + 1, firstEnabled(panel, 0, 1));
  }

  function hoverRow(level, info) {
    clearTimeout(subTimer);
    const panel = panels[level];
    if (!panel) return;
    setFocus(level, panel.rows.indexOf(info), true);
    if (info.entry.sub && !info.entry.dis) subTimer = setTimeout(() => openSub(level, info, false), SUB_DELAY);
    else subTimer = setTimeout(() => closeFrom(level + 1), SUB_DELAY);
  }

  function activate(level, info) {
    if (!info || info.entry.dis) return;
    if (info.entry.sub) {
      clearTimeout(subTimer);
      openSub(level, info, false);
      return;
    }
    finish(info.entry.id);
  }

  // ---- 키보드 ----
  function setFocus(level, index, byMouse) {
    const panel = panels[level];
    if (!panel) return;
    panel.rows.forEach((r, i) => r.node.classList.toggle('focus', i === index && !byMouse));
    panel.focus = index;
    panels.forEach((p, l) => { if (l > level) p.focus = -1; });
  }

  function firstEnabled(panel, from, step) {
    const n = panel.rows.length;
    for (let k = 0; k < n; k++) {
      const i = ((from + k * step) % n + n) % n;
      if (!panel.rows[i].entry.dis) return i;
    }
    return -1;
  }

  window.addEventListener('keydown', (e) => {
    if (!panels.length) return;
    document.body.classList.add('keys');
    const level = panels.length - 1;
    const panel = panels[level];
    const cur = panel.rows[panel.focus];
    if (e.key === 'Escape') {
      e.preventDefault();
      if (level > 0) closeFrom(level);
      else finish(null);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const from = panel.focus < 0 ? (step > 0 ? 0 : panel.rows.length - 1) : panel.focus + step;
      setFocus(level, firstEnabled(panel, from, step));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (cur && cur.entry.sub) openSub(level, cur, true);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (level > 0) closeFrom(level);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (cur && cur.entry.sub) openSub(level, cur, true);
      else if (cur) activate(level, cur);
    } else if (e.key.length === 1) {               // 바로 누르기 글자 (새로 만들기(&W) 의 W)
      const k = e.key.toUpperCase();
      const hit = panel.rows.find(r => !r.entry.dis && r.entry.access === k);
      if (hit) {
        e.preventDefault();
        if (hit.entry.sub) openSub(level, hit, true);
        else activate(level, hit);
      }
    }
  });

  // 판 밖을 누르면 닫힘 (오른쪽 단추도)
  window.addEventListener('mousedown', () => finish(null));
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('blur', () => finish(null));

  window.menuHost.onOpen((data) => {
    panels.forEach(p => p.node.remove());
    panels = [];
    done = false;
    document.body.classList.toggle('dark', !!data.dark);
    document.body.classList.remove('keys');
    if (data.work) work = data.work;
    const main = buildPanel(data.layout.list || [], 0, data.layout.top || []);
    panels.push(main);
    placeMain(main, data.x, data.y);
    requestAnimationFrame(() => requestAnimationFrame(() => window.menuHost.ready()));   // 그린 뒤에 보여 달라고
    window.focus();
  });
})();

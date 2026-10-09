/* ===== 파일 묶음 풀기 · 묶기 애니메이션 (+ 사진 · 영상 · 판 지우기 · 추가) =====
   renderer/groups.js를 고치지 않고, 화면(#ui-layer)에서 묶음이 생기고 사라지는 것만 지켜보다가 재생합니다.
   - 묶음(.board-group)이 지워지면 → 지워진 묶음을 잠깐 되살려 풀기(group-unwrap)를 보여준 뒤 없앰
     (데이터에서 지우고 저장하는 일은 groups.js가 이미 끝낸 뒤라 영향 없음)
   - 같은 때에 묶음에서 풀려난 파일(.file-icon에서 in-group이 떨어진 것)은 → 내려앉기(file-settle)
   - 사진 · 영상(.canvas-photo)과 캘린더 · 연대표 판(.board)이 지워질 때도 같은 풀기로 사라짐
   - 웹 페이지 쪽지(.sticky-note.type-web)도 지울 때는 사진과 같게 (접힌 모서리는 그대로 — item-vanish).
   - 표 쪽지(.sticky-note.type-table)는 지울 때 파일 묶음 풀기와 똑같이 (접힌 모서리가 펴지며 사라짐 — group-unwrap, 사용자 요청).
     나타날 때는 다른 쪽지처럼 note-animations.js 의 붙이기
   - 묶음 · 사진 · 영상 · 판이 새로 생기면 → 풀기를 거꾸로 한 묶기(group-wrap)로 나타남
     (renderer/photos.js · boards.js 도 고치지 않음. 쪽지는 note-animations.js의 붙이기 · 떼기)

   재생하지 않는 경우
   - 지우고 바로 다시 그릴 때 (되돌리기 · 다시 그리기 등) — 한 번 화면에 나왔던 id 는 다시 나와도 묶기 없음
   - 앱을 켤 때 저장된 것을 불러오는 동안 (처음 클릭·키 입력 전)
   - Windows에서 '애니메이션 효과'를 꺼 둔 경우 (동작 줄이기)

   빼려면 index.html에서 이 파일과 group-animations.css를 불러오는 두 줄을 지우면 됩니다.

   이 파일이 기대는 이름 — index.html · renderer에 있음. 바뀌면 오류 없이 애니메이션이 멈춥니다
   - #ui-layer    : 묶음·파일이 들어가는 칸 (index.html)
   - .board-group : 묶음 요소의 class (renderer/groups.js)
   - .board       : 판 요소의 class — 묶음도 판이라 board-group 이 함께 붙음 (renderer/boards.js)
   - .canvas-photo: 사진 · 영상 요소의 class (renderer/photos.js)
   - .sticky-note.type-web : 웹 페이지 쪽지 (renderer/notes.js), el.webShot = 마지막으로 찍어 둔 모습 (renderer/web-note.js)
   - .file-icon   : 파일 아이콘 요소의 class, 묶음에 들어 있는 동안 in-group (renderer/view.js)
   - 요소의 id = 묶음 · 사진 · 판 id (지웠다가 다시 그린 것인지 구분할 때 씀) */
(() => {
  'use strict';

  const UNWRAP = { name: 'group-unwrap', ms: 300, easing: 'cubic-bezier(.3, 0, .25, 1)' };
  const VANISH = { name: 'item-vanish', ms: 300, easing: 'cubic-bezier(.3, 0, .25, 1)' };   // 풀기에서 모서리 펴기만 뺀 것 (웹 페이지 쪽지)
  const WRAP = { name: 'group-wrap', ms: 340, easing: 'cubic-bezier(.25, .7, .35, 1)' };
  const SETTLE = { name: 'file-settle', ms: 280, easing: 'cubic-bezier(.25, .7, .35, 1)' };
  const SETTLE_STAGGER_MS = 20;      // 담긴 파일이 왼쪽 위부터 차례로 내려앉음
  const SETTLE_STAGGER_MAX = 180;

  const layer = document.getElementById('ui-layer');
  if (!layer || typeof MutationObserver === 'undefined') return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ghosts = new WeakSet();      // 풀기 중인(데이터에서는 이미 지워진) 묶음
  const seen = new Set();            // 한 번 화면에 나왔던 묶음 · 사진 · 판 id — 다시 그려진 것은 묶기 없음

  // 사용자가 처음 조작하기 전(= 앱을 켜서 불러오는 중)에는 묶기를 재생하지 않음 (note-animations.js와 같게)
  let userActive = false;
  const markActive = () => { userActive = true; };
  for (const type of ['pointerdown', 'keydown', 'contextmenu', 'wheel']) {
    window.addEventListener(type, markActive, { capture: true, passive: true });
  }

  const isGroup = (node) => node.nodeType === 1 && node.classList && node.classList.contains('board-group');
  // 풀기로 사라지는 것: 묶음 · 사진 · 영상 · 캘린더 · 연대표 판
  const vanishes = (node) => node.nodeType === 1 && node.classList
    && (node.classList.contains('board') || node.classList.contains('canvas-photo'));
  const isWebNote = (node) => node.nodeType === 1 && node.classList
    && node.classList.contains('sticky-note') && node.classList.contains('type-web');
  const isTableNote = (node) => node.nodeType === 1 && node.classList
    && node.classList.contains('sticky-note') && node.classList.contains('type-table');
  const isFile = (node) => node.nodeType === 1 && node.classList && node.classList.contains('file-icon');
  const hadInGroup = (value) => typeof value === 'string' && value.split(/\s+/).includes('in-group');

  // 인라인 style로 재생 → renderer가 className을 다시 써도 끊기지 않음
  function run(el, anim, delayMs = 0) {
    el.style.animation = `${anim.name} ${anim.ms}ms ${anim.easing} ${delayMs}ms both`;
    const playing = el.getAnimations().find(a => a.animationName === anim.name);
    if (!playing) return Promise.resolve();
    return playing.finished.then(() => {}, () => {});     // 끝나거나 취소되면
  }

  // 묶음: 지워진 자리에 잠깐 되살려 풀기를 보여 줌
  function unwrap(el, parent, next) {
    ghosts.add(el);
    el.removeAttribute('id');                    // groups.js가 이 묶음을 다시 찾지 않도록
    el.classList.remove('selected', 'drop-target', 'dragging', 'editing');
    el.querySelectorAll('video').forEach(v => v.pause());   // 지운 영상은 멈춘 장면으로 사라짐
    const web = isWebNote(el);
    if (web) {
      // 웹 페이지: 되살리면 페이지를 새로 불러오므로 뗌 — 마지막으로 찍어 둔 모습을 대신 둠 (web-note.js unloadWebView 와 같게)
      el.querySelectorAll('webview').forEach(w => {
        if (el.webShot && !w.parentNode.querySelector('.web-poster')) {
          const poster = document.createElement('img');
          poster.className = 'web-poster';
          poster.src = el.webShot;
          poster.alt = '';
          w.parentNode.insertBefore(poster, w);
        }
        w.remove();
      });
      el.classList.remove('editing');
    }
    el.inert = true;                             // 클릭·포커스 안 됨
    el.setAttribute('aria-hidden', 'true');
    el.dataset.leaving = '1';                    // 사라지는 중 — note-animations.js 가 새 쪽지로 보고 붙이기를 덮어쓰지 않게 (웹 페이지 쪽지)
    el.style.pointerEvents = 'none';
    parent.insertBefore(el, next && next.parentNode === parent ? next : null);
    run(el, web ? VANISH : UNWRAP).then(() => el.remove());
  }

  // 새로 생긴 묶음 · 사진 · 영상 · 판: 풀기를 거꾸로 — 살짝 큰 채 나타나며 모서리가 접히고 벽에 붙음
  function wrap(el) {
    run(el, WRAP).then(() => {
      if (el.style.animationName === WRAP.name) el.style.removeProperty('animation');
    });
  }

  // 파일: 묶음이 사라진 자리에서 벽에 내려앉음
  function settle(el, order) {
    const delay = Math.min(order * SETTLE_STAGGER_MS, SETTLE_STAGGER_MAX);
    run(el, SETTLE, delay).then(() => {
      if (el.style.animationName === SETTLE.name) el.style.removeProperty('animation');
    });
  }

  const observer = new MutationObserver((records) => {
    const removed = [];
    const added = [];
    const released = new Set();

    for (const r of records) {
      if (r.type === 'childList') {
        for (const n of r.removedNodes) {
          if ((vanishes(n) || isWebNote(n) || isTableNote(n)) && !ghosts.has(n)) removed.push({ el: n, parent: r.target, next: r.nextSibling });
        }
        for (const n of r.addedNodes) {
          if (vanishes(n) && !ghosts.has(n) && !n.dataset.leaving) added.push(n);
        }
      } else if (r.type === 'attributes' && isFile(r.target)) {
        // 묶음에서 풀려난 파일 = in-group 이 떨어진 것 (renderer/view.js updateFilePosition)
        if (hadInGroup(r.oldValue) && !r.target.classList.contains('in-group')) released.add(r.target);
      }
    }
    // 새로 생긴 것: 처음 보는 id 만 묶기 (다시 그린 것 · 자리만 옮긴 것 · 되돌리기로 돌아온 것은 그대로)
    for (const el of added) {
      if (!el.id || seen.has(el.id)) continue;
      seen.add(el.id);
      if (userActive && !reduceMotion.matches && el.isConnected) wrap(el);
    }
    if (reduceMotion.matches || !removed.length) return;

    let played = false;
    for (const { el, parent, next } of removed) {
      if (el.isConnected) continue;                               // 자리만 옮긴 경우
      if (el.id && document.getElementById(el.id)) continue;      // 지우고 바로 다시 그린 경우 (되돌리기 등)
      if (!parent.isConnected) continue;
      const group = isGroup(el);
      unwrap(el, parent, next);
      if (group) played = true;                                   // 풀려난 파일 내려앉기는 묶음을 풀 때만
    }
    if (!played || !released.size) return;

    // 왼쪽 위부터 차례로
    const files = [...released].filter(el => el.isConnected);
    files.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return (ra.top - rb.top) || (ra.left - rb.left);
    });
    files.forEach((el, i) => settle(el, i));
  });

  layer.querySelectorAll('.board, .canvas-photo').forEach(el => { if (el.id) seen.add(el.id); });
  observer.observe(layer, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
    attributeOldValue: true,
  });
})();

/* ===== 파일 묶음 풀기 애니메이션 =====
   renderer/groups.js를 고치지 않고, 화면(#ui-layer)에서 묶음이 사라지는 것만 지켜보다가 재생합니다.
   - 묶음(.board-group)이 지워지면 → 지워진 묶음을 잠깐 되살려 풀기(group-unwrap)를 보여준 뒤 없앰
     (데이터에서 지우고 저장하는 일은 groups.js가 이미 끝낸 뒤라 영향 없음)
   - 같은 때에 묶음에서 풀려난 파일(.file-icon에서 in-group이 떨어진 것)은 → 내려앉기(file-settle)

   재생하지 않는 경우
   - 지우고 바로 다시 그릴 때 (되돌리기 · 다시 그리기 등)
   - Windows에서 '애니메이션 효과'를 꺼 둔 경우 (동작 줄이기)

   빼려면 index.html에서 이 파일과 group-animations.css를 불러오는 두 줄을 지우면 됩니다.

   이 파일이 기대는 이름 — index.html · renderer에 있음. 바뀌면 오류 없이 애니메이션이 멈춥니다
   - #ui-layer    : 묶음·파일이 들어가는 칸 (index.html)
   - .board-group : 묶음 요소의 class (renderer/groups.js)
   - .file-icon   : 파일 아이콘 요소의 class, 묶음에 들어 있는 동안 in-group (renderer/view.js)
   - 묶음 요소의 id = 묶음 id (지웠다가 다시 그린 것인지 구분할 때 씀) */
(() => {
  'use strict';

  const UNWRAP = { name: 'group-unwrap', ms: 300, easing: 'cubic-bezier(.3, 0, .25, 1)' };
  const SETTLE = { name: 'file-settle', ms: 280, easing: 'cubic-bezier(.25, .7, .35, 1)' };
  const SETTLE_STAGGER_MS = 20;      // 담긴 파일이 왼쪽 위부터 차례로 내려앉음
  const SETTLE_STAGGER_MAX = 180;

  const layer = document.getElementById('ui-layer');
  if (!layer || typeof MutationObserver === 'undefined') return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ghosts = new WeakSet();      // 풀기 중인(데이터에서는 이미 지워진) 묶음

  const isGroup = (node) => node.nodeType === 1 && node.classList && node.classList.contains('board-group');
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
    el.classList.remove('selected', 'drop-target');
    el.inert = true;                             // 클릭·포커스 안 됨
    el.setAttribute('aria-hidden', 'true');
    el.style.pointerEvents = 'none';
    parent.insertBefore(el, next && next.parentNode === parent ? next : null);
    run(el, UNWRAP).then(() => el.remove());
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
    const released = new Set();

    for (const r of records) {
      if (r.type === 'childList') {
        for (const n of r.removedNodes) {
          if (isGroup(n) && !ghosts.has(n)) removed.push({ el: n, parent: r.target, next: r.nextSibling });
        }
      } else if (r.type === 'attributes' && isFile(r.target)) {
        // 묶음에서 풀려난 파일 = in-group 이 떨어진 것 (renderer/view.js updateFilePosition)
        if (hadInGroup(r.oldValue) && !r.target.classList.contains('in-group')) released.add(r.target);
      }
    }
    if (reduceMotion.matches || !removed.length) return;

    let played = false;
    for (const { el, parent, next } of removed) {
      if (el.isConnected) continue;                               // 자리만 옮긴 경우
      if (el.id && document.getElementById(el.id)) continue;      // 지우고 바로 다시 그린 경우 (되돌리기 등)
      if (!parent.isConnected) continue;
      unwrap(el, parent, next);
      played = true;
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

  observer.observe(layer, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
    attributeOldValue: true,
  });
})();

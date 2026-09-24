/* ===== 포스트잇 붙이기 · 떼기 애니메이션 =====
   renderer.js를 고치지 않고, 화면(#ui-layer)에 노트가 생기고 지워지는 것만 지켜보다가 재생합니다.
   - 새 노트가 생기면 → 붙이기 (note-animations.css의 note-stick)
   - 노트가 지워지면 → 지워진 노트를 잠깐 화면에 되살려 떼기(note-peel)를 보여준 뒤 없앰
     (데이터 삭제와 저장은 renderer.js가 이미 끝낸 뒤라 영향 없음)
   - 파일 묶음이 없어지면 (묶음 풀기 · 지우기) → 묶음 포스트잇도 같은 떼기
     노트와 달리 앞으로 끌어내지 않고 제자리(파일 아래)에서 떼어짐 → 담겨 있던 파일은 그대로 보임

   재생하지 않는 경우
   - 앱을 켤 때 저장된 노트를 불러오는 동안 (처음 클릭·키 입력 전)
   - 같은 노트를 지웠다가 바로 다시 그릴 때 (불러오기 등)
   - Windows에서 '애니메이션 효과'를 꺼 둔 경우 (동작 줄이기)

   빼려면 index.html에서 이 파일과 note-animations.css를 불러오는 두 줄을 지우면 됩니다.

   이 파일이 기대는 이름 — index.html · renderer.js에 있음. 바뀌면 오류 없이 애니메이션이 멈춥니다
   - #ui-layer    : 노트가 들어가는 칸 (index.html)
   - .sticky-note : 노트 요소의 class (renderer.js)
   - .board-group : 파일 묶음 요소의 class (renderer/groups.js · styles/groups.css — 접힌 모서리도 --fold 로 그림)
   - 노트 · 묶음 요소의 id = 그 id (지웠다가 다시 그린 것인지 구분할 때 씀) */
(() => {
  'use strict';

  const STICK = { name: 'note-stick', ms: 450, easing: 'cubic-bezier(.25, .7, .35, 1)' };
  const PEEL  = { name: 'note-peel',  ms: 280, easing: 'ease' };   // 떼기 0.16초 → 바로 흐려짐 0.12초 (구간별 속도는 CSS에서)
  const PEEL_STAGGER_MS  = 35;    // 여러 장을 한꺼번에 지울 때 한 장씩 조금씩 늦게
  const PEEL_STAGGER_MAX = 280;
  const GROUP_PEEL_FOLD_MAX = 88;  // 묶음은 크니까 모서리가 너무 크게 들리지 않게 (배율 1 기준 px)

  const layer = document.getElementById('ui-layer');
  if (!layer || typeof MutationObserver === 'undefined') return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ghosts = new WeakSet();          // 떼기 중인(데이터에서는 이미 지워진) 노트

  // 사용자가 처음 조작하기 전(= 앱을 켜서 불러오는 중)에는 붙이기를 재생하지 않음
  let userActive = false;
  const markActive = () => { userActive = true; };
  for (const type of ['pointerdown', 'keydown', 'contextmenu', 'wheel']) {
    window.addEventListener(type, markActive, { capture: true, passive: true });
  }

  const isNote = (node) => node.nodeType === 1 && node.classList.contains('sticky-note');
  const isGroup = (node) => node.nodeType === 1 && node.classList.contains('board-group');

  // 인라인 style로 재생 → renderer.js가 className을 다시 써도 끊기지 않음
  function run(el, anim, delayMs = 0) {
    el.style.animation = `${anim.name} ${anim.ms}ms ${anim.easing} ${delayMs}ms both`;
    const playing = el.getAnimations().find(a => a.animationName === anim.name);
    if (!playing) return Promise.resolve();
    return playing.finished.then(() => {}, () => {});   // 끝나거나 취소되면
  }

  function stick(el) {
    run(el, STICK).then(() => {
      if (el.style.animationName === STICK.name) el.style.removeProperty('animation');
    });
  }

  function peel(el, parent, next, order) {
    const group = isGroup(el);
    ghosts.add(el);
    el.removeAttribute('id');                    // renderer.js가 이 노트를 다시 찾지 않도록
    el.classList.remove('selected', 'drop-target');
    el.inert = true;                             // 클릭·포커스 안 됨
    el.setAttribute('aria-hidden', 'true');
    el.style.pointerEvents = 'none';
    if (!group) el.style.zIndex = '50';          // 노트: 화면 앞쪽으로 떼어 내므로 다른 노트 위로 (묶음은 제자리 — 풀린 파일 아래)
    parent.insertBefore(el, next && next.parentNode === parent ? next : null);

    const size = Math.min(el.offsetWidth, el.offsetHeight);
    let fold = size * 0.45;                                                   // 모서리가 들린 정도
    if (group) fold = Math.min(fold, GROUP_PEEL_FOLD_MAX * (parseFloat(getComputedStyle(el).getPropertyValue('--z')) || 1));
    el.style.setProperty('--peel-fold', Math.round(fold) + 'px');

    const delay = Math.min(order * PEEL_STAGGER_MS, PEEL_STAGGER_MAX);
    run(el, PEEL, delay).then(() => el.remove());
  }

  const observer = new MutationObserver((records) => {
    const removed = [];
    const added = [];
    for (const r of records) {
      for (const n of r.removedNodes) {
        if ((isNote(n) || isGroup(n)) && !ghosts.has(n)) removed.push({ el: n, parent: r.target, next: r.nextSibling });
      }
      for (const n of r.addedNodes) {
        if (isNote(n) && !ghosts.has(n)) added.push(n);
      }
    }
    if (reduceMotion.matches || (!removed.length && !added.length)) return;

    const removedIds = new Set(removed.map(x => x.el.id).filter(Boolean));

    let order = 0;
    for (const { el, parent, next } of removed) {
      if (el.isConnected) continue;                               // 자리만 옮긴 경우
      if (el.id && document.getElementById(el.id)) continue;      // 지우고 바로 다시 그린 경우
      if (!parent.isConnected) continue;
      peel(el, parent, next, order++);
    }

    if (!userActive) return;
    for (const el of added) {
      if (!el.isConnected || removedIds.has(el.id)) continue;     // 다시 그린 노트
      stick(el);
    }
  });

  observer.observe(layer, { childList: true, subtree: true });
})();

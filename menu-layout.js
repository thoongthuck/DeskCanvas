// 윈도우 11 모양 우클릭 메뉴 — 줄 배치 (main.js 가 부름, 그리기는 menu.html)
//   윈도우가 앱에게 주는 탐색기 메뉴는 예전 모양 목록 하나뿐이라 (새 모양 메뉴는 탐색기만 띄울 수 있음),
//   그 줄들을 윈도우 11 처럼 다시 늘어놓음:
//     위 단추 줄 — 잘라내기 · 복사 · 붙여넣기 · 이름 바꾸기 · 공유 · 삭제
//     목록 — 윈도우 11 에 나오는 줄만, 윈도우 11 순서로 (아이콘은 Segoe Fluent Icons 글꼴)
//     맨 아래 '추가 옵션 표시' — 예전 모양 메뉴 전체 (menushow)
//   윈도우 11 이 '추가 옵션 표시' 안에만 두는 줄 (예전 방식 확장 — 반디집 · Git …, 보내기, 액세스 권한 부여, 이전 버전 복원 …) 은 목록에서 뺌
//   입력 tree: 다리 menuopen 의 줄 { id, text, key, verb, dis, chk, radio, icon, sub } — 1~999 는 앱 줄, 1000~ 은 탐색기 줄
//   입력 appInfo: 앱 줄 id → { role, icon } (renderer/menus.js)
//     role: paste · view · sort · refresh · pastelink · undo (바탕) / app (파일 — 연결 프로그램 뒤에)
//   반환: { file, top: [칸], list: [칸 · { sep: true }] } — 칸 = { id, text, key, glyph?, img?, appIcon?, dis?, chk?, radio?, sub? }
//     id: 고르면 돌려줄 값 (-1 = 추가 옵션 표시)

const GLYPH = {
  cut: '\uE8C6', copy: '\uE8C8', paste: '\uE77F', rename: '\uE8AC', share: '\uE72D', delete: '\uE74D',
  open: '\uE8E5', openwith: '\uE7AC', favorite: '\uE734', copyaspath: '\uE71B', properties: '\uE90F',
  new: '\uECC8', display: '\uE7F4', personalize: '\uE771',
  view: '\uE80A', sort: '\uE8CB', refresh: '\uE72C', pastelink: '\uE71B', undo: '\uE7A7', more: '\uE8A7',
};

// 위 단추 줄 (윈도우 11 순서)
const TOP_VERBS = ['cut', 'copy', 'paste', 'rename', 'Windows.ModernShare', 'delete'];
const TOP_GLYPH = { cut: 'cut', copy: 'copy', paste: 'paste', rename: 'rename', 'Windows.ModernShare': 'share', delete: 'delete' };

// 목록에 두는 탐색기 줄 (verb → 모양)
const LIST_VERBS = {
  open: 'open', pintohomefile: 'favorite', copyaspath: 'copyaspath', properties: 'properties',
  Display: 'display', Personalize: 'personalize',
};
const GUID_VERB = /^\{[0-9A-F-]{36}\}$/i;       // 앱 패키지로 붙은 명령 (Copilot · 메모장에서 편집 …) — 윈도우 11 메뉴에도 나옴

// '새로 만들기(&W)' → 글자 '새로 만들기', 바로 누르기 글자 'W'
function cleanText(text) {
  const raw = String(text || '');
  const access = /&([^&])/.exec(raw);
  const clean = raw.replace(/\s*\(&[^)]\)\s*$/, '').replace(/&&/g, '\u0000').replace(/&/g, '').replace(/\u0000/g, '&').trim();
  return { text: clean, access: access ? access[1].toUpperCase() : '' };
}

function hasVerb(items, verb) {
  return (items || []).some(it => it.verb === verb || hasVerb(it.sub, verb));
}

// 하위 목록 줄은 그대로 (아이콘 · 체크만 옮김) — 앱 줄은 오른쪽 단축키 글자도 (appInfo)
function subEntries(items, appInfo = new Map()) {
  return (items || []).map(it => {
    if (it.sep) return { sep: true };
    const { text, access } = cleanText(it.text);
    const info = appInfo.get(it.id);
    return {
      id: it.id, text, access, key: it.key || (info && info.key) || '', img: it.icon || '', dis: !!it.dis, chk: !!it.chk, radio: !!it.radio,
      sub: it.sub ? subEntries(it.sub, appInfo) : undefined,
    };
  });
}

// 줄 하나 → 칸
function entry(it, glyph, appInfo) {
  const { text, access } = cleanText(it.text);
  const info = appInfo.get(it.id);
  const e = {
    id: it.id, text, access, key: it.key || (info && info.key) || '', dis: !!it.dis, chk: !!it.chk, radio: !!it.radio,
  };
  if (glyph) e.glyph = GLYPH[glyph];
  else if (info && info.icon) e.appIcon = info.icon;
  else if (it.icon) e.img = it.icon;
  if (it.sub) e.sub = subEntries(it.sub, appInfo);
  return e;
}

const APP_ROLES = ['paste', 'view', 'sort', 'refresh', 'pastelink', 'undo'];   // 윈도우 11 자리가 정해진 앱 줄 (바탕)

// 앱 하위 목록 줄은 다리가 id 를 주지 않아 (0) 글자로 찾음 — appInfo 의 'sub:<글자>'
//   moreLabel: 맨 아래 '추가 옵션 표시' 글자
function buildLayout(tree, appInfo = new Map(), moreLabel = '추가 옵션 표시') {
  const items = (tree && tree.items) || [];
  const isFile = !!(tree && tree.file);
  const top = [];
  const app = { paste: null, view: null, sort: null, refresh: null, pastelink: null, undo: null, other: [] };
  const found = { open: null, openwith: null, new: null, favorite: null, copyaspath: null, properties: null, display: null, personalize: null };
  const packaged = [];

  items.forEach(it => {
    if (it.sep) return;
    // 앱 줄 (1~999) · 앱 하위 목록 (id 0 인데 하위 줄이 앱 줄)
    const appSub = !it.id && it.sub && it.sub.some(s => s.id > 0 && s.id < 1000);
    if ((it.id > 0 && it.id < 1000) || appSub) {
      const info = appInfo.get(it.id) || appInfo.get(`sub:${cleanText(it.text).text}`) || {};
      const role = APP_ROLES.includes(info.role) ? info.role : null;
      const e = entry(it, role, new Map([...appInfo, [it.id, info]]));    // 하위 줄의 단축키 글자도 찾게 전체를 넘김
      if (role) app[role] = e;
      else app.other.push(e);
      return;
    }
    if (TOP_VERBS.includes(it.verb)) {
      top.push({ ...entry(it, TOP_GLYPH[it.verb], appInfo), order: TOP_VERBS.indexOf(it.verb) });
      return;
    }
    if (it.sub && hasVerb(it.sub, 'NewFolder')) { found.new = entry(it, 'new', appInfo); return; }
    if (it.sub && hasVerb(it.sub, 'openas')) { found.openwith = entry(it, 'openwith', appInfo); return; }
    if (LIST_VERBS[it.verb]) { found[LIST_VERBS[it.verb]] = entry(it, LIST_VERBS[it.verb], appInfo); return; }
    if (it.verb && GUID_VERB.test(it.verb)) packaged.push(entry(it, null, appInfo));
    // 그 밖 (예전 방식 확장 · 보내기 · 액세스 권한 · 이전 버전 · 바로 가기 만들기 …) 은 '추가 옵션 표시' 에만
  });

  if (app.paste) top.push({ ...app.paste, order: TOP_VERBS.indexOf('paste') });
  top.sort((a, b) => a.order - b.order);
  top.forEach(e => { delete e.order; });

  const list = [];
  const group = (...entries) => {
    const real = entries.flat().filter(Boolean);
    if (!real.length) return;
    if (list.length) list.push({ sep: true });
    list.push(...real);
  };
  if (isFile) {
    group(found.open, found.openwith);
    group(app.other);
    group(packaged);
    group(found.favorite, found.copyaspath, found.properties);
  } else {
    group(app.view, app.sort, app.refresh);
    group(app.pastelink, app.undo, found.new);
    group(found.display, found.personalize);
    group(app.other);
    group(packaged);
  }
  group({ id: -1, text: moreLabel, access: '', key: 'Shift+F10', glyph: GLYPH.more });   // 예전 모양 메뉴 전체
  return { file: isFile, top, list };
}

module.exports = { buildLayout, cleanText, GLYPH };

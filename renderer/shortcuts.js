// 단축키 바꾸기 — 설정 › 단축키에서 줄을 누르고 새 키를 누르면 그 키로 (settings-window.js buildShortcutScreen)
//   바꾼 것만 settings.shortcuts 에 { 할 일: ['Ctrl+Shift+L'] } 로 저장 (빈 목록 = 키 없음). 처음 것으로 돌리면 지움
//   키 이름: 'Ctrl+Alt+Shift+키' — 키는 자판 자리 이름(code)으로 봄 (한글 · 영문 배열이 달라도 같은 자리)
//   바꿀 수 있는 것: SHORTCUT_ACTIONS (키보드로 하는 일). 그대로인 것: 마우스로 하는 일 · Esc · 복사 · 붙여넣기 · 잘라내기 ·
//     Ctrl (+ Alt) + 1~9 (저장한 자리) · 글자칸 · 표 안의 키 · 캔버스를 앞으로 꺼내는 단축키 (main.js — 윈도우 전체에서 받음)
//   새 키는 Ctrl 이나 Alt 를 함께 눌러야 함 (글자를 쓸 때 가로채지 않게) — F1 ~ F24 · Delete · Insert · Home · End · PageUp · PageDown 은 혼자도
//   다른 일이 쓰던 키면 그 일에서는 뺌 (알림으로 알려 줌)
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { IS_MAC } from './constants.js';

// 할 일 → { 이름(i18n), 처음 키 }  — 이 차례로 설정 › 단축키 에 보임 (그대로인 줄과 섞어서 — settings-window.js SHORTCUTS)
export const SHORTCUT_ACTIONS = {
  undo: { label: 'sc.undo', keys: ['Ctrl+Z'] },
  redo: { label: 'sc.redo', keys: ['Ctrl+Shift+Z', 'Ctrl+Y'] },
  save: { label: 'sc.save', keys: ['Ctrl+S'] },
  delete: { label: 'sc.delete', keys: ['Delete'] },
  selectAll: { label: 'sc.selectAll', keys: ['Ctrl+A'] },
  groupFiles: { label: 'sc.groupFiles', keys: ['Ctrl+G'] },
  forward: { label: 'sc.forward', keys: ['Ctrl+]'] },
  backward: { label: 'sc.backward', keys: ['Ctrl+['] },
  front: { label: 'sc.front', keys: ['Ctrl+Shift+]'] },
  back: { label: 'sc.back', keys: ['Ctrl+Shift+['] },
  connect: { label: 'sc.connectSelected', keys: ['Ctrl+L'] },
  lock: { label: 'sc.lockSelected', keys: ['Ctrl+Shift+L'] },
  rename: { label: 'sc.rename', keys: ['F2'] },
  home: { label: 'sc.goHome', keys: ['Ctrl+0', 'Ctrl+Home'] },
  setHome: { label: 'sc.setHome', keys: ['Ctrl+Alt+0'] },
  search: { label: 'sc.search', keys: ['Ctrl+F'] },
  minimap: { label: 'sc.minimap', keys: ['Ctrl+M'] },
  settings: { label: 'sc.openSettings', keys: ['Ctrl+,'] },
};

// 자판 자리 이름 → 키 이름 (글자 · 숫자 · F 키 말고)
const CODE_KEYS = {
  BracketLeft: '[', BracketRight: ']', Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Semicolon: ';', Quote: "'",
  Backquote: '`', Minus: '-', Equal: '=', Space: 'Space', Enter: 'Enter', NumpadEnter: 'Enter', Tab: 'Tab', Escape: 'Esc',
  Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
};
const ALONE_OK = /^(F([1-9]|1[0-9]|2[0-4])|Delete|Insert|Home|End|PageUp|PageDown)$/;   // Ctrl · Alt 없이도 되는 키
const FIXED = new Set(['Ctrl+C', 'Ctrl+V', 'Ctrl+X', 'Ctrl+Shift+V', 'Alt+F4', 'Alt+Tab', 'Ctrl+Alt+Delete', 'Ctrl+Esc']);   // 늘 원래 일

// 누른 키 → 'Ctrl+Shift+L' (꾸밈 키만 눌렀거나 모르는 키면 '')
export function comboOf(e) {
  const code = e.code || '';
  let key = '';
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^(Digit|Numpad)[0-9]$/.test(code)) key = code.slice(-1);
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) key = code;
  else key = CODE_KEYS[code] || '';
  if (!key) return '';
  const mods = [];
  if (e.ctrlKey || (IS_MAC && e.metaKey)) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  return [...mods, key].join('+');
}

// 'Ctrl+Shift+L' → 'Ctrl + Shift + L' (설정 창에 보일 글자)
export const comboLabel = (combo) => String(combo || '').split('+').join(' + ');

export const shortcutMethods = {
  // 이 일의 지금 키 목록 — 바꾼 것 (settings.shortcuts) · 없으면 처음 것
  shortcutKeys(id) {
    const own = this.settings && this.settings.shortcuts && this.settings.shortcuts[id];
    return Array.isArray(own) ? own : SHORTCUT_ACTIONS[id].keys;
  },

  // 메뉴에 보일 키 (첫째 키 · 키가 없으면 '') — menus.js · selection.js · layer-order.js
  shortcutHint(id) {
    return this.shortcutKeys(id)[0] || '';
  },

  // 누른 키 → 할 일 이름 (없으면 null). 설정이 바뀌면 (settings.shortcuts 를 새로 바꿔 넣음) 표를 다시 만듦
  shortcutAction(combo) {
    if (!combo) return null;
    const own = this.settings && this.settings.shortcuts;
    if (!this.shortcutTable || this.shortcutTableFor !== own) {
      const table = new Map();
      Object.keys(SHORTCUT_ACTIONS).forEach(id => this.shortcutKeys(id).forEach(k => { if (!table.has(k)) table.set(k, id); }));
      this.shortcutTable = table;
      this.shortcutTableFor = own;
    }
    return this.shortcutTable.get(combo) || null;
  },

  // 새 키로 바꾸기 — 반환: { error: 알림 이름 } (안 바꿈) · { other: 빼앗긴 일 이름 | null }
  setShortcut(id, combo) {
    const parts = String(combo || '').split('+');
    const key = parts[parts.length - 1];
    if (!combo || !key) return { error: 'shortcut.badKey' };
    if (!parts.includes('Ctrl') && !parts.includes('Alt') && !ALONE_OK.test(key)) return { error: 'shortcut.needMod' };
    const spot = /^Ctrl(\+Alt)?\+[1-9]$/.test(combo);                      // 저장한 자리 (keyboard.js)
    const popOut = String(this.popOutKey || '').split(' + ').join('+');     // 캔버스를 앞으로 꺼내기 (main.js — 윈도우 전체)
    if (FIXED.has(combo) || spot || (popOut && combo === popOut)) return { error: 'shortcut.reserved' };
    const next = { ...(this.settings.shortcuts || {}) };
    const other = Object.keys(SHORTCUT_ACTIONS).find(o => o !== id && this.shortcutKeys(o).includes(combo)) || null;
    if (other) next[other] = this.shortcutKeys(other).filter(k => k !== combo);
    next[id] = [combo];
    this.saveShortcuts(next);
    return { other };
  },

  // 처음 키로 — id 가 없으면 모두
  resetShortcut(id = null) {
    if (!id) {
      this.saveShortcuts({});
      return;
    }
    const next = { ...(this.settings.shortcuts || {}) };
    delete next[id];
    this.saveShortcuts(next);
  },

  // 처음 것과 같은 것은 적어 두지 않고 저장 (설정 창도 다시 그림 — settings.js updateSetting)
  saveShortcuts(next) {
    const same = (a, b) => a.length === b.length && a.every((k, i) => k === b[i]);
    Object.keys(next).forEach(id => {
      if (!SHORTCUT_ACTIONS[id] || same(next[id], SHORTCUT_ACTIONS[id].keys)) delete next[id];
    });
    this.updateSetting('shortcuts', next);
  },
};

// 저장된 값 다듬기 (settings.js normalizeSettings) — 아는 일 · 글자 목록만
export function normalizeShortcuts(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  Object.keys(SHORTCUT_ACTIONS).forEach(id => {
    if (Array.isArray(raw[id])) out[id] = raw[id].filter(k => typeof k === 'string' && k && k.length < 40).slice(0, 4);
  });
  return out;
}

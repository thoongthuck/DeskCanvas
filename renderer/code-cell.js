// 코드 쪽지 — 코드 칸 (위쪽 띠: 언어 이름 · 복사 버튼 / 줄 번호 / 글자 색)
//
// 글자 색을 입힌 <pre> 위에 투명한 <textarea> 를 겹쳐 둠
//   - 보이는 글자는 <pre>, 커서·글자 고르기·입력은 <textarea>
//   - textarea 를 스크롤하면 pre 와 줄 번호도 같이 움직임
// 수정 중에는 띠의 언어 이름을 눌러 언어를 바꿀 수 있음
import { ICON_DIR } from './constants.js';
import { t } from './i18n.js';
import { CODE_LANGUAGES, highlight } from './syntax.js';

export const codeCellMethods = {
  renderCodeBody(note, body) {
    const theme = note.codeTheme === 'light' ? 'light' : 'dark';
    const cell = document.createElement('div');
    cell.className = `code-cell code-${theme}`;
    cell.innerHTML = `
      <div class="code-strip">
        <button class="code-lang" type="button"></button>
        <button class="code-copy" type="button"><img alt="" draggable="false"></button>
      </div>
      <div class="code-area">
        <div class="code-gutter"><pre class="code-lines"></pre></div>
        <div class="code-editor">
          <pre class="code-highlight" aria-hidden="true"></pre>
          <textarea class="code-input" spellcheck="false" wrap="off" autocomplete="off"></textarea>
        </div>
      </div>
    `;
    const langButton = cell.querySelector('.code-lang');
    const copyButton = cell.querySelector('.code-copy');
    const copyIcon = copyButton.querySelector('img');
    const lines = cell.querySelector('.code-lines');
    const pre = cell.querySelector('.code-highlight');
    const input = cell.querySelector('.code-input');

    langButton.textContent = (CODE_LANGUAGES[note.codeLang] || CODE_LANGUAGES.python).label;
    copyIcon.src = `${ICON_DIR}code-copy-${theme}.svg`;
    copyButton.title = t('copyCode');
    input.value = note.content || '';
    input.readOnly = this.editingId !== note.id;

    const paint = () => {
      // 끝이 줄바꿈이면 textarea 는 빈 줄을 하나 더 보여 주므로 pre 도 맞춤
      pre.innerHTML = highlight(input.value, note.codeLang) + '\n';
      const count = input.value.split('\n').length;
      lines.textContent = Array.from({ length: count }, (_, i) => i + 1).join('\n');
    };
    const sync = () => {
      pre.style.transform = `translate(${-input.scrollLeft}px, ${-input.scrollTop}px)`;
      lines.style.transform = `translateY(${-input.scrollTop}px)`;
    };
    paint();

    input.addEventListener('input', () => {
      this.recordTyping();
      note.content = input.value;
      paint();
      sync();
      this.touch(note);
      this.fitNote(note);
    });
    input.addEventListener('scroll', sync);
    input.addEventListener('keydown', (e) => this.handleCodeKey(e, note, input));

    // 복사: 코드 전체 → 1.5초 동안 체크 표시
    copyButton.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (window.canvasAPI && window.canvasAPI.copyText) await window.canvasAPI.copyText(note.content || '');
      else await navigator.clipboard.writeText(note.content || '');
      copyIcon.src = `${ICON_DIR}code-copied-${theme}.svg`;
      copyButton.title = t('copied');
      clearTimeout(copyButton._timer);
      copyButton._timer = setTimeout(() => {
        copyIcon.src = `${ICON_DIR}code-copy-${theme}.svg`;
        copyButton.title = t('copyCode');
      }, 1500);
    });

    // 언어 이름: 수정 중에만 눌러서 바꾸기
    langButton.addEventListener('click', (e) => {
      if (this.editingId !== note.id) return;
      e.stopPropagation();
      this.openCodeLanguageMenu(note, langButton);
    });

    body.appendChild(cell);
  },

  // 코드 칸 글쇠: Tab = 들여쓰기, Shift+Tab = 내어쓰기, Enter = 윗줄 들여쓰기 유지
  // (execCommand 로 넣어야 Ctrl+Z 글자 되돌리기에 들어감)
  handleCodeKey(e, note, input) {
    if (input.readOnly || e.isComposing || e.keyCode === 229) return;
    const indentSize = (CODE_LANGUAGES[note.codeLang] || CODE_LANGUAGES.python).indent;
    const unit = ' '.repeat(indentSize);
    const { selectionStart: start, selectionEnd: end, value } = input;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const insert = (text) => {
      if (!document.execCommand('insertText', false, text)) {
        input.setRangeText(text, input.selectionStart, input.selectionEnd, 'end');
        input.dispatchEvent(new Event('input'));
      }
    };

    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      insert(unit);
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      const lead = value.slice(lineStart).match(/^ */)[0].length;
      const remove = Math.min(lead, indentSize);
      if (!remove) return;
      input.setSelectionRange(lineStart, lineStart + remove);
      if (!document.execCommand('delete')) {
        input.setRangeText('', lineStart, lineStart + remove, 'start');
        input.dispatchEvent(new Event('input'));
      }
      input.setSelectionRange(Math.max(lineStart, start - remove), Math.max(lineStart, end - remove));
    } else if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      const line = value.slice(lineStart, start);
      let indent = line.match(/^\s*/)[0];
      if (/[:{[(]\s*$/.test(line)) indent += unit;                   // 블록이 열리는 줄 다음은 한 칸 더
      insert('\n' + indent);
    }
  },

  // 언어 고르기 (팝업 메뉴 틀)
  openCodeLanguageMenu(note, anchor) {
    this.closeMenus();
    const menu = this.buildPopup('code-lang-menu', Object.entries(CODE_LANGUAGES).map(([key, lang]) => ({
      label: lang.label,
      current: key === note.codeLang,
      onClick: () => {
        this.closeMenus();
        if (key === note.codeLang) return;
        this.recordHistory();
        note.codeLang = key;
        this.renderNoteBody(note);
        this.refreshNote(note);
        this.touch(note);
        const input = document.querySelector(`#${CSS.escape(note.id)} .code-input`);
        if (input && this.editingId === note.id) this.focusField(input);
      },
    })));
    menu.classList.add('popup-compact');
    const r = anchor.getBoundingClientRect();
    menu.style.left = r.left + 'px';
    menu.style.top = (r.bottom + 4) + 'px';
    this.keepInWindow(menu);
    this.watchOutsideClick();
  },
};

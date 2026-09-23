// 코드 칸 글자 색 (문법 구분) — 예약어 · 함수 이름 · 숫자 · 문자열 · 연산자 · 주석
//   highlight(code, lang) → 색을 입힌 HTML (tok-kw · tok-fn · tok-num · tok-str · tok-op · tok-com)
//   색 값은 styles/code-markdown.css (어둡게 · 밝게 칸마다 따로)

const words = (text) => new Set(text.split(/\s+/).filter(Boolean));

const JS_WORDS = 'break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return super switch this throw try typeof var void while with yield async await static get set null undefined true false';
const C_WORDS = 'auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while bool true false NULL';

// 언어별 규칙: 예약어 · 한 줄 주석 · 여러 줄 주석 · 문자열 따옴표
export const CODE_LANGUAGES = {
  python: {
    label: 'Python', indent: 4,
    keywords: words('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case'),
    line: ['#'], quotes: ['"""', "'''", '"', "'"],
  },
  javascript: {
    label: 'JavaScript', indent: 2, keywords: words(JS_WORDS),
    line: ['//'], block: ['/*', '*/'], quotes: ['"', "'", '`'],
  },
  typescript: {
    label: 'TypeScript', indent: 2,
    keywords: words(JS_WORDS + ' interface type enum implements namespace declare abstract private protected public readonly as keyof any number string boolean unknown never'),
    line: ['//'], block: ['/*', '*/'], quotes: ['"', "'", '`'],
  },
  java: {
    label: 'Java', indent: 4,
    keywords: words('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static super switch synchronized this throw throws transient try void volatile while true false null var record'),
    line: ['//'], block: ['/*', '*/'], quotes: ['"', "'"],
  },
  c: {
    label: 'C', indent: 4, keywords: words(C_WORDS), preprocessor: true,
    line: ['//'], block: ['/*', '*/'], quotes: ['"', "'"],
  },
  cpp: {
    label: 'C++', indent: 4, preprocessor: true,
    keywords: words(C_WORDS + ' class namespace template typename public private protected virtual override new delete this using nullptr try catch throw friend operator explicit constexpr std string vector'),
    line: ['//'], block: ['/*', '*/'], quotes: ['"', "'"],
  },
  csharp: {
    label: 'C#', indent: 4,
    keywords: words('abstract as base bool break byte case catch char class const continue decimal default delegate do double else enum event explicit extern false finally float for foreach if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sealed short static string struct switch this throw true try typeof uint ulong using var virtual void while async await'),
    line: ['//'], block: ['/*', '*/'], quotes: ['"', "'"],
  },
  go: {
    label: 'Go', indent: 4,
    keywords: words('break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var true false nil'),
    line: ['//'], block: ['/*', '*/'], quotes: ['"', "'", '`'],
  },
  rust: {
    label: 'Rust', indent: 4,
    keywords: words('as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while'),
    line: ['//'], block: ['/*', '*/'], quotes: ['"'],
  },
  sql: {
    label: 'SQL', indent: 2, ignoreCase: true,
    keywords: words('select from where insert into values update set delete create table drop alter add join left right inner outer on as and or not null is in like between group by order having limit offset distinct count sum avg min max primary key foreign references index view union all case when then else end asc desc exists'),
    line: ['--'], block: ['/*', '*/'], quotes: ["'", '"'],
  },
  bash: {
    label: 'Bash', indent: 2,
    keywords: words('if then else elif fi for while until do done case esac function in return export local echo exit source'),
    line: ['#'], quotes: ['"', "'"],
  },
  html: { label: 'HTML', indent: 2, mode: 'html' },
  css: { label: 'CSS', indent: 2, mode: 'css' },
  json: { label: 'JSON', indent: 2, mode: 'json' },
  text: { label: 'Text', indent: 4, mode: 'text' },
};

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const span = (cls, text) => (cls ? `<span class="tok-${cls}">${escapeHtml(text)}</span>` : escapeHtml(text));

const NUMBER = /^(0[xX][0-9a-fA-F_]+|\d[\d_]*(\.\d+)?([eE][+-]?\d+)?)/;
const IDENT = /^[A-Za-z_$][\w$]*/;
const OPERATOR = /^(=>|===|!==|==|!=|<=|>=|&&|\|\||\*\*|\/\/|->|::|[-+*/%=<>!&|^~?])/;

// 문자열: 여는 따옴표부터 닫는 따옴표까지 (한 줄 따옴표는 줄 끝에서 끝남)
function readString(code, i, quote) {
  const multiline = quote.length === 3 || quote === '`';
  let j = i + quote.length;
  while (j < code.length) {
    if (code[j] === '\\') { j += 2; continue; }
    if (code.startsWith(quote, j)) return j + quote.length;
    if (!multiline && code[j] === '\n') return j;
    j++;
  }
  return code.length;
}

function highlightGeneric(code, lang) {
  let out = '';
  let i = 0;
  let lineStart = true;
  while (i < code.length) {
    const rest = code.slice(i);
    const ch = code[i];

    if (lang.preprocessor && lineStart && ch === '#') {         // C/C++ #include 같은 줄
      const end = code.indexOf('\n', i);
      const stop = end === -1 ? code.length : end;
      out += span('kw', code.slice(i, stop));
      i = stop;
      continue;
    }
    const line = (lang.line || []).find(mark => rest.startsWith(mark));
    if (line) {
      const end = code.indexOf('\n', i);
      const stop = end === -1 ? code.length : end;
      out += span('com', code.slice(i, stop));
      i = stop;
      continue;
    }
    if (lang.block && rest.startsWith(lang.block[0])) {
      const end = code.indexOf(lang.block[1], i + lang.block[0].length);
      const stop = end === -1 ? code.length : end + lang.block[1].length;
      out += span('com', code.slice(i, stop));
      i = stop;
      continue;
    }
    const quote = (lang.quotes || []).find(q => rest.startsWith(q));
    if (quote) {
      const stop = readString(code, i, quote);
      out += span('str', code.slice(i, stop));
      i = stop;
      lineStart = false;
      continue;
    }
    const prev = i > 0 ? code[i - 1] : '';
    const num = /[\w$]/.test(prev) ? null : rest.match(NUMBER);
    if (num) {
      out += span('num', num[0]);
      i += num[0].length;
      lineStart = false;
      continue;
    }
    const id = rest.match(IDENT);
    if (id) {
      const word = id[0];
      const isKeyword = lang.keywords && lang.keywords.has(lang.ignoreCase ? word.toLowerCase() : word);
      const isCall = /^\s*\(/.test(code.slice(i + word.length));
      out += span(isKeyword ? 'kw' : isCall ? 'fn' : null, word);
      i += word.length;
      lineStart = false;
      continue;
    }
    const op = rest.match(OPERATOR);
    if (op) {
      out += span('op', op[0]);
      i += op[0].length;
      lineStart = false;
      continue;
    }
    out += escapeHtml(ch);
    if (ch === '\n') lineStart = true;
    else if (!/\s/.test(ch)) lineStart = false;
    i++;
  }
  return out;
}

function highlightHtml(code) {
  return code.replace(/(<!--[\s\S]*?(?:-->|$))|(<\/?)([\w-]+)([^>]*)(\/?>)?|([^<]+)/g, (m, comment, open, tag, attrs, close, text) => {
    if (comment) return span('com', comment);
    if (text !== undefined) return escapeHtml(text);
    const attrHtml = (attrs || '').replace(/([\w-:@]+)(\s*=\s*)?("[^"]*"?|'[^']*'?|[^\s"'>]+)?|(\s+)|(.)/g,
      (a, name, eq, value, space, other) => {
        if (space) return space;
        if (other) return escapeHtml(other);
        return span('fn', name) + (eq ? span('op', eq) : '') + (value ? span('str', value) : '');
      });
    return span('kw', open + tag) + attrHtml + (close ? span('kw', close) : '');
  });
}

function highlightCss(code) {
  return code.replace(/(\/\*[\s\S]*?(?:\*\/|$))|("[^"\n]*"?|'[^'\n]*'?)|(@[\w-]+)|(#[0-9a-fA-F]{3,8}\b)|(-?\d*\.?\d+(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?)|([\w-]+)(?=\s*:(?!:))|(!important)|([{}:;,>+~])/g,
    (m, comment, str, at, hex, num, prop, imp, punct) => {
      if (comment) return span('com', comment);
      if (str) return span('str', str);
      if (at) return span('kw', at);
      if (hex) return span('num', hex);
      if (num) return span('num', num);
      if (prop) return span('fn', prop);
      if (imp) return span('kw', imp);
      if (punct) return span('op', punct);
      return escapeHtml(m);
    });
}

function highlightJson(code) {
  return code.replace(/("(?:\\.|[^"\\\n])*"?)(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],:])|([^"\d{}[\],:tfn-]+|.)/g,
    (m, str, colon, num, lit, punct, other) => {
      if (str) return colon ? span('fn', str) + span('op', colon) : span('str', str);
      if (num) return span('num', num);
      if (lit) return span('kw', lit);
      if (punct) return span('op', punct);
      return escapeHtml(m);
    });
}

export function highlight(code, langName) {
  const lang = CODE_LANGUAGES[langName] || CODE_LANGUAGES.text;
  if (lang.mode === 'text') return escapeHtml(code);
  if (lang.mode === 'html') return highlightHtml(code);
  if (lang.mode === 'css') return highlightCss(code);
  if (lang.mode === 'json') return highlightJson(code);
  return highlightGeneric(code, lang);
}

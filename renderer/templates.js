// 쪽지 템플릿 — 코드 셀 · 마크다운 노트 · 회의록 (가이드 8-2)
// 내용은 '틀만' 채웁니다 (사용자 확인). 크기는 시안 그대로 320 × 272.
import { getLanguage } from './i18n.js';

function today() {
  const d = new Date();
  return getLanguage() === 'en'
    ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export const TEMPLATES = {
  codeDark: () => ({
    type: 'code', codeLang: 'python', codeTheme: 'dark', color: 'gray',
    width: 320, height: 272, title: '', content: '',
  }),
  codeLight: () => ({
    type: 'code', codeLang: 'javascript', codeTheme: 'light', color: 'blue',
    width: 320, height: 272, title: '', content: '',
  }),
  markdown: () => ({
    type: 'markdown', color: 'yellow',
    width: 320, height: 272, title: '', content: '# 제목\n',
  }),
  meeting: () => ({                       // 마크다운 셀이라 제목 칸 대신 본문 맨 위 '# 회의록'
    type: 'markdown', color: 'green',
    width: 320, height: 272, title: '',
    content: getLanguage() === 'en'
      ? `# Meeting notes\n**Date** ${today()} · **Attendees** \n### Agenda\n1. \n### To-do\n- [ ] `
      : `# 회의록\n**날짜** ${today()} · **참석** \n### 안건\n1. \n### 할 일\n- [ ] `,
  }),
};

// 웹 페이지 쪽지 (web-note.js) — 주소는 만들고 바로 넣음
export const WEB_NOTE = () => ({
  type: 'web', url: '', color: 'gray', width: 480, height: 360, title: '', content: '',
});

export function buildTemplate(kind) {
  const make = TEMPLATES[kind];
  return make ? make() : {};
}

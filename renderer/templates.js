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
  meeting: () => ({
    type: 'markdown', color: 'green',
    width: 320, height: 272,
    title: getLanguage() === 'en' ? 'Meeting notes' : '회의록',
    content: getLanguage() === 'en'
      ? `**Date** ${today()} · **Attendees** \n### Agenda\n1. \n### To-do\n- [ ] `
      : `**날짜** ${today()} · **참석** \n### 안건\n1. \n### 할 일\n- [ ] `,
  }),
};

export function buildTemplate(kind) {
  const make = TEMPLATES[kind];
  return make ? make() : {};
}

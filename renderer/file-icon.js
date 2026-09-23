// 파일 아이콘 — 윈도우가 미리보기(썸네일)도 아이콘도 주지 못할 때 쓰는 기본 그림 (code/icons/아이콘_가이드.md 14장)
//   종류별 11가지: code/icons/file-<종류>.svg (밝은 배경) · file-<종류>-dark.svg (배경 테마 '어둡게')
//   아이콘이 없는 프로그램 · 모르는 종류에 윈도우가 붙이는 기본 그림은 main.js 가 미리 걸러서 null 로 줌
import { ICON_DIR } from './constants.js';

// 확장자 → 종류
const KINDS = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tif', 'tiff', 'heic'],
  video: ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'webm'],
  audio: ['mp3', 'wav', 'flac', 'm4a', 'ogg'],
  sheet: ['xlsx', 'xls', 'xlsm', 'csv', 'tsv'],
  slide: ['pptx', 'ppt', 'key'],
  doc: ['docx', 'doc', 'hwp', 'hwpx', 'pdf', 'txt', 'md', 'rtf'],
  code: ['py', 'js', 'ts', 'jsx', 'tsx', 'java', 'c', 'h', 'cpp', 'cs', 'go', 'rs', 'rb', 'php', 'html', 'css', 'json', 'xml', 'yml', 'yaml', 'sh', 'bat', 'ipynb'],
  zip: ['zip', '7z', 'rar', 'tar', 'gz'],
  app: ['exe', 'msi', 'lnk', 'url', 'appx'],
};

// 이름 · 경로의 확장자로 종류를 정함 (바탕화면 바로가기는 이름에 .lnk 가 없어서 경로를 먼저 봄)
export function fileKind(name = '', isDir = false) {
  if (isDir) return 'folder';
  const base = String(name).split(/[\\/]/).pop();
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
  for (const kind of Object.keys(KINDS)) if (KINDS[kind].includes(ext)) return kind;
  return 'file';
}

// 파일 하나에 쓸 기본 그림 — 종류 이름이 그림 파일 이름과 1:1 (그 밖 → other)
export function fallbackIcon(file = {}, dark = false) {
  const kind = fileKind(file.path || file.name, file.isDir);
  const name = kind === 'file' ? 'other' : kind;
  return `${ICON_DIR}file-${name}${dark ? '-dark' : ''}.svg`;
}

// 윈도우가 준 그림이 쓸 만한지 (빈 PNG 는 'data:image/png;base64,' 처럼 아주 짧다)
export function usableIcon(icon) {
  return typeof icon === 'string' && icon.startsWith('data:') && icon.length > 64;
}

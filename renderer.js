// 다용도 배경화면 — 화면(렌더러) 시작 파일
// 실제 코드는 renderer/ 폴더에 기능별로 나뉘어 있음 (목록은 renderer/app.js 맨 위)
import { InfiniteCanvas } from './renderer/app.js';

function start() {
  window.canvasApp = new InfiniteCanvas();   // 개발자 도구(F12)에서 canvasApp 으로 상태 확인 가능
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', start);
} else {
  start();
}

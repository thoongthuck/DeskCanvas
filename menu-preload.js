// 윈도우 11 모양 우클릭 메뉴 창의 다리 (menu.html ↔ main.js)
//   main 이 { layout, x, y, work, dark } 를 보내면 그리고, 고르면 { id } (추가 옵션 표시는 -1, 그만두면 null) 를 돌려줌
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('menuHost', {
  onOpen: (callback) => ipcRenderer.on('menu-open', (event, data) => callback(data)),
  choose: (id) => ipcRenderer.send('menu-choice', id === undefined ? null : id),
  ready: () => ipcRenderer.send('menu-ready'),          // 새 판을 다 그림 → main 이 창을 보여 줌
});

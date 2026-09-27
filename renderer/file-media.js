// 파일 → 이미지 · 영상 쪽지 (파일 우클릭 › 이미지 쪽지로 바꾸기 · 영상 쪽지로 바꾸기)
//   사진 · 영상 파일을 앱 데이터 폴더로 복사해 (main.js import-media) 아이콘 자리에 사진 · 영상으로 (photos.js)
//     틀 · 소리 · 바로 재생은 새로 넣는 사진 · 영상과 같게 (설정 › 사진 · 영상)
//   바탕화면 파일은 휴지통으로 — Ctrl+Z 한 번이면 쪽지가 빠지고 파일이 휴지통에서 돌아옴 (history.js)
//   탐색기에서 끌어다 놓은 아이콘은 아이콘만 뗌 (파일은 그 자리 그대로)
//   여럿 고른 채로 우클릭하면 고른 것 가운데 사진 · 영상 파일을 한꺼번에
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)
import { t } from './i18n.js';

// main.js 의 IMAGE_EXTENSIONS · VIDEO_EXTENSIONS 와 같게 (앱이 보여 줄 수 있는 것만)
const MEDIA_EXT = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'],
  video: ['mp4', 'm4v', 'webm', 'mov', 'ogv', 'mkv'],
};

export const fileMediaMethods = {
  // 'image' | 'video' | null
  fileMediaKind(file) {
    if (!file || file.isDir || !file.path) return null;
    const ext = ((/\.([^.\\/]+)$/.exec(file.path) || [])[1] || '').toLowerCase();
    return Object.keys(MEDIA_EXT).find(kind => MEDIA_EXT[kind].includes(ext)) || null;
  },

  // 파일 메뉴 줄 (파일 하나 · 여럿 — menus.js fileMenuItems · selection.js) — 바꿀 것이 없으면 []
  fileMediaMenuItems(files) {
    const media = files.filter(f => !this.fileLocked(f) && this.fileMediaKind(f));
    if (!media.length) return [];
    const kinds = new Set(media.map(f => this.fileMediaKind(f)));
    const key = kinds.size > 1 ? 'menu.toMediaNote' : kinds.has('video') ? 'menu.toVideoNote' : 'menu.toImageNote';
    return [{
      icon: kinds.has('image') ? 'add-image.svg' : 'add-video.svg',
      label: media.length > 1 ? `${t(key)} (${media.length})` : t(key),
      action: () => this.convertFilesToMedia(media),
    }];
  },

  async convertFilesToMedia(files) {
    const api = window.canvasAPI;
    if (!api || !api.importMedia) return;
    // 먼저 복사 (캔버스는 그대로) — 아이콘 자리는 지금 보이는 곳 (묶음 속이면 그 칸)
    const ready = [];
    const failed = [];
    for (const file of files) {
      const rect = this.itemRect('file', file);
      let media = null;
      try { media = await api.importMedia(file.path); } catch (_) {}
      if (media && media.url) ready.push({ file, media, at: { x: rect.x, y: rect.y } });
      else failed.push(file.name);
    }
    if (failed.length) this.showToast(t('toast.toMediaFail', { name: failed.join(', ') }));
    if (!ready.length) return;

    this.record();                                      // 되돌리기 한 번 = 쪽지 빼고 파일 되살림
    const entry = this.undoStack[this.undoStack.length - 1];
    const made = [];
    const desktop = [];
    for (const { file, media, at } of ready) {
      const photo = await this.addPhotoAt(at, media.url, { media: media.media }, { record: false, select: false });
      made.push(photo.id);
      if (file.source === 'desktop') desktop.push(file);
      else this.deleteFile(file.id, { undoable: false });
    }
    if (desktop.length) await this.trashDesktopFiles(desktop, { undoEntry: entry });
    this.selection.clear();
    made.forEach(id => this.selection.add(id));
    this.updateSelection();
  },
};

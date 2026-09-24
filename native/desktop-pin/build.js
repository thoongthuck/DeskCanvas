// 바탕화면 고정 모듈 빌드 — node native/desktop-pin/build.js  (npm run build:native)
//   윈도우 SDK 없이 MSVC 컴파일러만으로 (Visual Studio 의 'C++ 데스크톱 개발' 도구)
//   1) vswhere 로 MSVC 의 cl · lib · link 를 찾고
//   2) kernel32 · user32 import 라이브러리를 .def 로 만들고 (SDK 의 .lib 대신)
//   3) desktop_pin.cc → desktop_pin.node (C 런타임 없이, N-API 는 실행 파일에서 찾아 씀)
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const OUT = path.join(HERE, 'build');
const IMPORTS = {
  kernel32: ['GetModuleHandleW', 'GetProcAddress', 'GetTickCount64'],
  user32: ['FindWindowW', 'FindWindowExW', 'EnumWindows', 'GetWindow', 'GetWindowLongPtrW', 'SetWindowLongPtrW',
    'SetWindowPos', 'IsWindow', 'IsWindowVisible', 'CallWindowProcW', 'SetWinEventHook', 'UnhookWinEvent', 'GetForegroundWindow',
    'GetDesktopWindow', 'SetTimer', 'KillTimer'],
};

function msvcBin() {
  const vswhere = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  const root = execFileSync(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], { encoding: 'utf8' }).trim();
  if (!root) throw new Error('Visual Studio C++ 도구를 찾지 못했어요');
  const tools = path.join(root, 'VC', 'Tools', 'MSVC');
  const version = fs.readdirSync(tools).sort().pop();
  return path.join(tools, version, 'bin', 'Hostx64', 'x64');
}

function run(exe, args) {
  execFileSync(exe, args, { cwd: OUT, stdio: 'inherit' });
}

const TARGET = path.join(HERE, 'desktop_pin.node');
const FRESH = path.join(OUT, 'desktop_pin.node');

// 켜져 있는 앱은 모듈 파일을 잡고 있어 덮어쓸 수 없음 → 원래 파일을 build/ 로 옮겨 두고 (켜진 앱은 그대로 씀) 새 파일을 놓음
//   옮겨 둔 옛 파일은 다음 빌드 때 지움 (아직 쓰는 중이면 남겨 둠). 새 모듈은 앱을 다시 켜야 쓰임
function install() {
  try {
    fs.copyFileSync(FRESH, TARGET);
    return;
  } catch (err) {
    if (err.code !== 'EBUSY' && err.code !== 'EPERM') throw err;
  }
  const old = path.join(OUT, `desktop_pin.old-${Date.now()}.node`);
  fs.renameSync(TARGET, old);
  fs.copyFileSync(FRESH, TARGET);
  console.log('켜져 있는 앱이 쓰던 모듈은 옮겨 둠 — 앱을 다시 켜면 새 모듈을 씀');
}

const bin = msvcBin();
fs.mkdirSync(OUT, { recursive: true });
fs.readdirSync(OUT).filter(n => n.startsWith('desktop_pin.old-')).forEach((n) => {
  try { fs.unlinkSync(path.join(OUT, n)); } catch (_) {}
});
Object.entries(IMPORTS).forEach(([dll, names]) => {
  fs.writeFileSync(path.join(OUT, `${dll}.def`), `LIBRARY ${dll}.dll\r\nEXPORTS\r\n${names.map(n => `  ${n}`).join('\r\n')}\r\n`);
  run(path.join(bin, 'lib.exe'), ['/nologo', `/def:${dll}.def`, '/machine:x64', `/out:${dll}.lib`]);
});
run(path.join(bin, 'cl.exe'), ['/nologo', '/c', '/O1', '/GS-', '/Zl', '/GR-', '/EHs-c-', '/std:c++17', '/utf-8',
  path.join(HERE, 'desktop_pin.cc'), '/Fo:desktop_pin.obj']);
run(path.join(bin, 'link.exe'), ['/nologo', '/DLL', '/NOENTRY', '/NODEFAULTLIB', '/MACHINE:X64',
  `/OUT:${FRESH}`, '/IMPLIB:desktop_pin.lib', 'desktop_pin.obj', 'kernel32.lib', 'user32.lib']);
install();
console.log('만듦:', TARGET);

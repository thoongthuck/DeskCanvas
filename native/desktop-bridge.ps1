# 바탕화면 다리 (Phase 5) — 윈도우와 이야기하는 부분 (main.js 가 PowerShell 로 한 번 띄워 두고 한 줄씩 명령)
#   바탕화면 층:  attach <hwnd> <x> <y> <w> <h> · detach <hwnd> <x> <y> <w> <h> · lift <hwnd> <x> <y> <w> <h> <front|behind>
#                 focus <hwnd> · check <hwnd> · plain <hwnd>
#   윈도우 메뉴:  menu <base64> (탐색기 우클릭 메뉴를 띄움) · menutest <base64> (띄우지 않고 줄만 알려 줌 — 시험용)
#                 menuopen <base64> (메뉴를 만들어 두고 줄 · 하위 목록 · 그림을 JSON 으로 — 앱이 윈도우 11 모양으로 그림)
#                 menuprep <base64 경로들> (탐색기 줄만 든 메뉴를 미리 — 비었으면 바탕화면 빈 곳. 같은 대상의 menuopen 이 바로 답함)
#                 → menuinvoke <id> (고른 줄 실행) · menushow (예전 모양 메뉴로 띄움 — '추가 옵션 표시') · menuclose (그만둠)
#   휴지통:       restore <base64 경로> (휴지통에서 그 자리로 되살림 — 탐색기 '복원'과 같음, 앱의 되돌리기)
#   배경 화면:    wallget (지금 배경 화면 — 그림 · 맞춤 · 바둑판 · 배경색) · wallcolor <#색> (단색으로) · wallrestore <base64> (원래대로)
#   클립보드:     clipfiles (복사한 파일 목록) · clipset <base64> (캔버스 Ctrl+C — 파일 · 글) · clipseq (클립보드 순번)
#   바탕화면 층 사진: mirroropen (사진 창을 만들고 hwnd — attach 로 넣음) · mirrorshot <base64 jpg> <#색> · mirrorclose
#   절전:         uncovered <x> <y> <w> <h> (그 넓이에서 바탕화면이 보이는 몫, 천분율 — ok 0 ~ ok 1000)
#   살펴보기:    info <hwnd> · layout · hit <x> <y>
#   답은 명령마다 한 줄 (ok … / fail …). 명령과 상관없이 오는 알림은 'evt …' 로 시작 (evt desktop-restarted: 탐색기가 다시 시작됨)
#   x y w h 는 화면 픽셀 (Electron 의 screen.dipToScreenRect 값)
#   넣는 자리: 윈도우 아이콘 층(SHELLDLL_DefView)을 가진 바탕화면 창의 자식, 그 안의 맨 위
#     (윈도우 11 24H2 뒤로는 Progman, 그 전에는 Progman 이나 WorkerW)
#     → 다른 프로그램 창들 아래 · 윈도우 아이콘 위. 파일 아이콘은 앱이 직접 그리므로 윈도우 아이콘은 가려져도 됨
#     탐색기 창은 숨기거나 바꾸지 않음 — 앱이 갑자기 꺼져도 바탕화면은 그대로 돌아옴
#   숨은 창 하나로 메시지를 돌림 (탐색기 메뉴의 '보내기 ›' · '새로 만들기 ›' 같은 하위 목록이 그려지고, 다른 프로그램이 기다리지 않게)
#   C# 본체는 desktop-bridge.cs. -Compile <exe> 를 주면 창 프로그램으로 만들기만 함 (main.js 가 처음 켤 때 한 번 — 앱 데이터 폴더)
param([string]$Compile = '')
$ErrorActionPreference = 'Stop'
$source = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'desktop-bridge.cs'), [System.Text.Encoding]::UTF8)
$refs = 'System.Windows.Forms', 'System.Drawing', 'Microsoft.CSharp', 'System.Core'
if ($Compile) {
  Add-Type -ReferencedAssemblies $refs -TypeDefinition $source -OutputAssembly $Compile -OutputType WindowsApplication
  exit 0
}
Add-Type -ReferencedAssemblies $refs -TypeDefinition $source
[DesktopBridge]::Run()

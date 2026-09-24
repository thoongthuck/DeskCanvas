# 바탕화면 다리 (Phase 5) — Electron 창을 윈도우 바탕화면 층에 넣고 빼는 Win32 호출
#   main.js 가 이 스크립트를 PowerShell 로 한 번 띄워 두고, 한 줄씩 명령을 보냄 (답도 한 줄):
#     attach <hwnd> <x> <y> <w> <h> · detach <hwnd> <x> <y> <w> <h> · focus <hwnd> · check <hwnd> · info <hwnd> · layout · hit <x> <y>
#   x y w h 는 화면 픽셀 (Electron 의 screen.dipToScreenRect 값). 답은 ok … / fail …
#   넣는 자리: 윈도우 아이콘 층(SHELLDLL_DefView)을 가진 바탕화면 창의 자식, 그 안의 맨 위
#     (윈도우 11 24H2 뒤로는 Progman, 그 전에는 Progman 이나 WorkerW)
#     → 다른 프로그램 창들 아래 · 윈도우 아이콘 위. 파일 아이콘은 앱이 직접 그리므로 윈도우 아이콘은 가려져도 됨
#     탐색기 창은 숨기거나 바꾸지 않음 — 앱이 갑자기 꺼져도 바탕화면은 그대로 돌아옴
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class DesktopBridge {
  delegate bool EnumProc(IntPtr hwnd, IntPtr lParam);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindowW(string cls, string title);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindowExW(IntPtr parent, IntPtr after, string cls, string title);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
  [DllImport("user32.dll")] static extern IntPtr SetParent(IntPtr child, IntPtr parent);
  [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr hwnd);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
  [DllImport("user32.dll")] static extern IntPtr GetWindowLongPtrW(IntPtr hwnd, int index);
  [DllImport("user32.dll")] static extern IntPtr SetWindowLongPtrW(IntPtr hwnd, int index, IntPtr value);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int w, int h, uint flags);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool ScreenToClient(IntPtr hwnd, ref POINT p);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out RECT r);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr hwnd, uint cmd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassNameW(IntPtr hwnd, StringBuilder sb, int max);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr ctx);
  [DllImport("user32.dll")] static extern IntPtr ChildWindowFromPointEx(IntPtr parent, POINT p, uint flags);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, IntPtr pid);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);
  [DllImport("user32.dll")] static extern IntPtr SetFocus(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint tid, ref GUITHREADINFO info);
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] struct GUITHREADINFO {
    public int cbSize, flags;
    public IntPtr hwndActive, hwndFocus, hwndCapture, hwndMenuOwner, hwndMoveSize, hwndCaret;
    public RECT rcCaret;
  }

  const int GWL_STYLE = -16, GWL_EXSTYLE = -20;
  const long WS_CHILD = 0x40000000L, WS_POPUP = 0x80000000L;
  const long WS_EX_NOREDIRECTIONBITMAP = 0x00200000L;
  const uint GW_HWNDNEXT = 2, GW_HWNDPREV = 3, GW_CHILD = 5, GA_ROOT = 2;
  const uint SWP_NOSIZE = 0x1, SWP_NOMOVE = 0x2, SWP_NOACTIVATE = 0x10, SWP_FRAMECHANGED = 0x20, SWP_SHOWWINDOW = 0x40;
  static readonly IntPtr HWND_TOP = IntPtr.Zero, HWND_NOTOPMOST = new IntPtr(-2);

  static long savedStyle;     // 보통 창일 때의 모양 — 꺼낼 때 되돌림

  public static void Init() {
    // 좌표는 실제 화면 픽셀로 (배율 125% · 150% 에서도 Electron 이 준 값과 같게)
    try { SetThreadDpiAwarenessContext(new IntPtr(-4)); } catch { }
  }

  static string Cls(IntPtr h) { var sb = new StringBuilder(256); GetClassNameW(h, sb, 256); return sb.ToString(); }
  static long Style(IntPtr h) { return GetWindowLongPtrW(h, GWL_STYLE).ToInt64(); }
  static long ExStyle(IntPtr h) { return GetWindowLongPtrW(h, GWL_EXSTYLE).ToInt64(); }

  // 바탕화면의 창들: Progman · 윈도우 아이콘 층(SHELLDLL_DefView) · 그 층을 가진 창(넣을 곳)
  static IntPtr Progman() { return FindWindowW("Progman", null); }
  static IntPtr DefView() {
    IntPtr progman = Progman();
    if (progman == IntPtr.Zero) return IntPtr.Zero;
    IntPtr dv = FindWindowExW(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
    if (dv != IntPtr.Zero) return dv;
    IntPtr found = IntPtr.Zero;                                        // 옛 방식: 아이콘 층이 WorkerW 안에 있기도 함
    EnumWindows((top, l) => {
      IntPtr d = FindWindowExW(top, IntPtr.Zero, "SHELLDLL_DefView", null);
      if (d != IntPtr.Zero) { found = d; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  static IntPtr Host() {
    IntPtr dv = DefView();
    return dv != IntPtr.Zero ? GetParent(dv) : IntPtr.Zero;
  }

  public static string Layout() {
    IntPtr p = Progman();
    if (p == IntPtr.Zero) return "no-progman";
    IntPtr host = Host();
    return string.Format("progman={0} raised={1} defview={2} host={3}[{4}]",
      p, (ExStyle(p) & WS_EX_NOREDIRECTIONBITMAP) != 0, DefView(), host, Cls(host));
  }

  public static string Info(long h) {
    IntPtr hwnd = new IntPtr(h);
    if (!IsWindow(hwnd)) return "gone";
    RECT r; GetWindowRect(hwnd, out r);
    IntPtr prev = GetWindow(hwnd, GW_HWNDPREV), next = GetWindow(hwnd, GW_HWNDNEXT);
    return string.Format("parent={0}[{1}] prev={2}[{3}] next={4}[{5}] vis={6} rect={7},{8},{9},{10} style=0x{11:X} ex=0x{12:X}",
      GetParent(hwnd), Cls(GetParent(hwnd)), prev, Cls(prev), next, Cls(next), IsWindowVisible(hwnd),
      r.L, r.T, r.R - r.L, r.B - r.T, Style(hwnd), ExStyle(hwnd));
  }

  // 그 자리(화면 픽셀)를 누르면 바탕화면 창 안의 어느 창이 받는지 (다른 프로그램 창은 빼고)
  public static string Hit(int x, int y) {
    IntPtr host = Host();
    POINT p = new POINT { X = x, Y = y };
    ScreenToClient(host, ref p);
    IntPtr h = ChildWindowFromPointEx(host, p, 0x1 | 0x2);
    return string.Format("hit={0}[{1}]", h, Cls(h));
  }

  // 바탕화면 층에 넣기 — x y w h 는 화면 픽셀 (주 모니터 전체)
  public static string Attach(long h, int x, int y, int w, int hgt) {
    IntPtr hwnd = new IntPtr(h);
    if (!IsWindow(hwnd)) return "fail gone";
    IntPtr host = Host();
    if (host == IntPtr.Zero) return "fail no-desktop";
    if (GetParent(hwnd) != host) {
      if ((Style(hwnd) & WS_CHILD) == 0) savedStyle = Style(hwnd);
      SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
      SetWindowLongPtrW(hwnd, GWL_STYLE, new IntPtr((savedStyle & ~WS_POPUP) | WS_CHILD));
      SetParent(hwnd, host);
    }
    POINT p = new POINT { X = x, Y = y };
    ScreenToClient(host, ref p);
    SetWindowPos(hwnd, HWND_TOP, p.X, p.Y, w, hgt, SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW);
    return "ok " + Info(h);
  }

  // 바탕화면 층에서 꺼내 보통 창으로
  public static string Detach(long h, int x, int y, int w, int hgt) {
    IntPtr hwnd = new IntPtr(h);
    if (!IsWindow(hwnd)) return "fail gone";
    if ((Style(hwnd) & WS_CHILD) == 0) return "ok already";
    SetParent(hwnd, IntPtr.Zero);
    long style = savedStyle != 0 ? savedStyle : ((Style(hwnd) & ~WS_CHILD) | WS_POPUP);
    SetWindowLongPtrW(hwnd, GWL_STYLE, new IntPtr(style));
    SetWindowPos(hwnd, HWND_TOP, x, y, w, hgt, SWP_FRAMECHANGED | SWP_SHOWWINDOW);
    return "ok " + Info(h);
  }

  // 바탕화면 층의 창을 누른 뒤 키보드가 그 창으로 오게 — 바탕화면이 맨 앞 창일 때만
  //   (바탕화면 층의 창은 눌러도 키보드가 저절로 오지 않음. 같은 입력 줄에 잠깐 붙어 초점만 옮김)
  public static string Focus(long h) {
    IntPtr hwnd = new IntPtr(h);
    if (!IsWindow(hwnd)) return "fail gone";
    uint tid = GetWindowThreadProcessId(hwnd, IntPtr.Zero);
    var info = new GUITHREADINFO();
    info.cbSize = Marshal.SizeOf(typeof(GUITHREADINFO));
    if (GetGUIThreadInfo(tid, ref info) && info.hwndFocus == hwnd) return "ok already";
    IntPtr fg = GetForegroundWindow();
    if (fg != GetAncestor(hwnd, GA_ROOT)) return "fail foreground=" + Cls(fg);
    uint me = GetCurrentThreadId();
    bool attached = AttachThreadInput(me, tid, true);
    SetFocus(hwnd);
    if (attached) AttachThreadInput(me, tid, false);
    GetGUIThreadInfo(tid, ref info);
    return (info.hwndFocus == hwnd ? "ok" : "fail") + " focus=" + Cls(info.hwndFocus) + " attached=" + attached;
  }

  // 바탕화면 층에 잘 붙어 있는지 — 탐색기가 다시 시작되면 떨어지고, 바탕화면을 새로 고치면 아이콘 층이 위로 올라오기도 함
  public static string Check(long h) {
    IntPtr hwnd = new IntPtr(h);
    if (!IsWindow(hwnd)) return "gone";
    IntPtr host = Host();
    if (host == IntPtr.Zero || GetParent(hwnd) != host) return "detached";
    if (GetWindow(host, GW_CHILD) != hwnd) {
      SetWindowPos(hwnd, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
      return "ok raised";
    }
    return "ok";
  }
}
"@
[DesktopBridge]::Init()
[Console]::Out.WriteLine('ready ' + [DesktopBridge]::Layout())
[Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }                                          # 앱이 꺼짐
  $p = $line.Trim().Split(' ')
  try {
    switch ($p[0]) {
      'layout' { $out = [DesktopBridge]::Layout() }
      'hit'    { $out = [DesktopBridge]::Hit([int]$p[1], [int]$p[2]) }
      'info'   { $out = [DesktopBridge]::Info([long]$p[1]) }
      'attach' { $out = [DesktopBridge]::Attach([long]$p[1], [int]$p[2], [int]$p[3], [int]$p[4], [int]$p[5]) }
      'detach' { $out = [DesktopBridge]::Detach([long]$p[1], [int]$p[2], [int]$p[3], [int]$p[4], [int]$p[5]) }
      'focus'  { $out = [DesktopBridge]::Focus([long]$p[1]) }
      'check'  { $out = [DesktopBridge]::Check([long]$p[1]) }
      default  { $out = 'fail unknown' }
    }
  } catch { $out = 'fail ' + $_.Exception.Message }
  [Console]::Out.WriteLine($out)
  [Console]::Out.Flush()
}

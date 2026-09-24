# 바탕화면 다리 (Phase 5) — 윈도우와 이야기하는 부분 (main.js 가 PowerShell 로 한 번 띄워 두고 한 줄씩 명령)
#   바탕화면 층:  attach <hwnd> <x> <y> <w> <h> · detach <hwnd> <x> <y> <w> <h> · lift <hwnd> <x> <y> <w> <h> <front|behind>
#                 focus <hwnd> · check <hwnd> · plain <hwnd>
#   윈도우 메뉴:  menu <base64> (탐색기 우클릭 메뉴를 띄움) · menutest <base64> (띄우지 않고 줄만 알려 줌 — 시험용)
#   휴지통:       restore <base64 경로> (휴지통에서 그 자리로 되살림 — 탐색기 '복원'과 같음, 앱의 되돌리기)
#   살펴보기:    info <hwnd> · layout · hit <x> <y>
#   답은 명령마다 한 줄 (ok … / fail …). 명령과 상관없이 오는 알림은 'evt …' 로 시작 (evt desktop-restarted: 탐색기가 다시 시작됨)
#   x y w h 는 화면 픽셀 (Electron 의 screen.dipToScreenRect 값)
#   넣는 자리: 윈도우 아이콘 층(SHELLDLL_DefView)을 가진 바탕화면 창의 자식, 그 안의 맨 위
#     (윈도우 11 24H2 뒤로는 Progman, 그 전에는 Progman 이나 WorkerW)
#     → 다른 프로그램 창들 아래 · 윈도우 아이콘 위. 파일 아이콘은 앱이 직접 그리므로 윈도우 아이콘은 가려져도 됨
#     탐색기 창은 숨기거나 바꾸지 않음 — 앱이 갑자기 꺼져도 바탕화면은 그대로 돌아옴
#   숨은 창 하나로 메시지를 돌림 (탐색기 메뉴의 '보내기 ›' · '새로 만들기 ›' 같은 하위 목록이 그려지고, 다른 프로그램이 기다리지 않게)
$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System.Windows.Forms, Microsoft.CSharp, System.Core -TypeDefinition @"
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

[ComImport, Guid("000214E6-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IShellFolder {
  [PreserveSig] int ParseDisplayName(IntPtr hwnd, IntPtr pbc, [MarshalAs(UnmanagedType.LPWStr)] string name, IntPtr pchEaten, out IntPtr ppidl, IntPtr pdwAttributes);
  [PreserveSig] int EnumObjects(IntPtr hwnd, int flags, out IntPtr ppenum);
  [PreserveSig] int BindToObject(IntPtr pidl, IntPtr pbc, ref Guid riid, out IntPtr ppv);
  [PreserveSig] int BindToStorage(IntPtr pidl, IntPtr pbc, ref Guid riid, out IntPtr ppv);
  [PreserveSig] int CompareIDs(IntPtr lParam, IntPtr pidl1, IntPtr pidl2);
  [PreserveSig] int CreateViewObject(IntPtr hwndOwner, ref Guid riid, out IntPtr ppv);
  [PreserveSig] int GetAttributesOf(uint cidl, IntPtr apidl, ref uint rgfInOut);
  [PreserveSig] int GetUIObjectOf(IntPtr hwndOwner, uint cidl, [MarshalAs(UnmanagedType.LPArray)] IntPtr[] apidl, ref Guid riid, IntPtr rgfReserved, out IntPtr ppv);
  [PreserveSig] int GetDisplayNameOf(IntPtr pidl, uint flags, IntPtr pName);
  [PreserveSig] int SetNameOf(IntPtr hwnd, IntPtr pidl, [MarshalAs(UnmanagedType.LPWStr)] string name, uint flags, out IntPtr ppidlOut);
}

[StructLayout(LayoutKind.Sequential)] public struct BridgePoint { public int X, Y; }

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public struct CMINVOKECOMMANDINFOEX {
  public int cbSize;
  public uint fMask;
  public IntPtr hwnd;
  public IntPtr lpVerb;
  [MarshalAs(UnmanagedType.LPStr)] public string lpParameters;
  [MarshalAs(UnmanagedType.LPStr)] public string lpDirectory;
  public int nShow;
  public uint dwHotKey;
  public IntPtr hIcon;
  [MarshalAs(UnmanagedType.LPStr)] public string lpTitle;
  public IntPtr lpVerbW;
  [MarshalAs(UnmanagedType.LPWStr)] public string lpParametersW;
  [MarshalAs(UnmanagedType.LPWStr)] public string lpDirectoryW;
  [MarshalAs(UnmanagedType.LPWStr)] public string lpTitleW;
  public BridgePoint ptInvoke;
}

[ComImport, Guid("000214E4-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IContextMenu {
  [PreserveSig] int QueryContextMenu(IntPtr hmenu, uint indexMenu, uint idCmdFirst, uint idCmdLast, uint uFlags);
  [PreserveSig] int InvokeCommand(ref CMINVOKECOMMANDINFOEX pici);
  [PreserveSig] int GetCommandString(UIntPtr idCmd, uint uType, IntPtr pReserved, IntPtr pszName, uint cchMax);
}

[ComImport, Guid("000214F4-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IContextMenu2 {
  [PreserveSig] int QueryContextMenu(IntPtr hmenu, uint indexMenu, uint idCmdFirst, uint idCmdLast, uint uFlags);
  [PreserveSig] int InvokeCommand(ref CMINVOKECOMMANDINFOEX pici);
  [PreserveSig] int GetCommandString(UIntPtr idCmd, uint uType, IntPtr pReserved, IntPtr pszName, uint cchMax);
  [PreserveSig] int HandleMenuMsg(uint uMsg, IntPtr wParam, IntPtr lParam);
}

[ComImport, Guid("BCFCE0A0-EC17-11D0-8D10-00A0C90F2719"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IContextMenu3 {
  [PreserveSig] int QueryContextMenu(IntPtr hmenu, uint indexMenu, uint idCmdFirst, uint idCmdLast, uint uFlags);
  [PreserveSig] int InvokeCommand(ref CMINVOKECOMMANDINFOEX pici);
  [PreserveSig] int GetCommandString(UIntPtr idCmd, uint uType, IntPtr pReserved, IntPtr pszName, uint cchMax);
  [PreserveSig] int HandleMenuMsg(uint uMsg, IntPtr wParam, IntPtr lParam);
  [PreserveSig] int HandleMenuMsg2(uint uMsg, IntPtr wParam, IntPtr lParam, out IntPtr plResult);
}

public class DesktopBridge : Form {
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
  [DllImport("user32.dll")] static extern bool ScreenToClient(IntPtr hwnd, ref BridgePoint p);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out RECT r);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr hwnd, uint cmd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassNameW(IntPtr hwnd, StringBuilder sb, int max);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr ctx);
  [DllImport("user32.dll")] static extern IntPtr ChildWindowFromPointEx(IntPtr parent, BridgePoint p, uint flags);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, IntPtr pid);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);
  [DllImport("user32.dll")] static extern IntPtr SetFocus(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint tid, ref GUITHREADINFO info);
  [DllImport("user32.dll")] static extern bool PostMessageW(IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern uint RegisterWindowMessageW(string name);
  [DllImport("user32.dll")] static extern IntPtr CreatePopupMenu();
  [DllImport("user32.dll")] static extern bool DestroyMenu(IntPtr menu);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool AppendMenuW(IntPtr menu, uint flags, UIntPtr id, string text);
  [DllImport("user32.dll")] static extern int GetMenuItemCount(IntPtr menu);
  [DllImport("user32.dll")] static extern uint GetMenuItemID(IntPtr menu, int pos);
  [DllImport("user32.dll")] static extern IntPtr GetSubMenu(IntPtr menu, int pos);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetMenuStringW(IntPtr menu, uint item, StringBuilder text, int max, uint flags);
  [DllImport("user32.dll")] static extern uint TrackPopupMenuEx(IntPtr menu, uint flags, int x, int y, IntPtr hwnd, IntPtr tpm);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out BridgePoint p);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("shell32.dll")] static extern int SHGetDesktopFolder(out IntPtr folder);
  [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern int SHParseDisplayName(string name, IntPtr pbc, out IntPtr pidl, uint sfgaoIn, out uint sfgaoOut);
  [DllImport("shell32.dll")] static extern int SHBindToParent(IntPtr pidl, ref Guid riid, out IntPtr ppv, out IntPtr pidlLast);
  [DllImport("ole32.dll")] static extern void CoTaskMemFree(IntPtr pv);
  [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] struct GUITHREADINFO {
    public int cbSize, flags;
    public IntPtr hwndActive, hwndFocus, hwndCapture, hwndMenuOwner, hwndMoveSize, hwndCaret;
    public RECT rcCaret;
  }

  const int GWL_STYLE = -16, GWL_EXSTYLE = -20;
  const long WS_CHILD = 0x40000000L, WS_POPUP = 0x80000000L;
  const long WS_EX_NOREDIRECTIONBITMAP = 0x00200000L, WS_EX_NOACTIVATE = 0x08000000L, WS_EX_TOOLWINDOW = 0x00000080L;
  const uint GW_HWNDNEXT = 2, GW_HWNDPREV = 3, GW_CHILD = 5, GA_ROOT = 2;
  const uint SWP_NOSIZE = 0x1, SWP_NOMOVE = 0x2, SWP_NOACTIVATE = 0x10, SWP_FRAMECHANGED = 0x20, SWP_SHOWWINDOW = 0x40;
  static readonly IntPtr HWND_TOP = IntPtr.Zero, HWND_NOTOPMOST = new IntPtr(-2);
  const uint WM_APP_COMMAND = 0x8001, WM_APP_QUIT = 0x8002, WM_NULL = 0;
  const int WM_INITMENUPOPUP = 0x117, WM_DRAWITEM = 0x2B, WM_MEASUREITEM = 0x2C, WM_MENUCHAR = 0x120;
  const uint MF_STRING = 0, MF_GRAYED = 1, MF_CHECKED = 8, MF_POPUP = 0x10, MF_SEPARATOR = 0x800, MF_BYPOSITION = 0x400;
  const uint TPM_RIGHTBUTTON = 0x2, TPM_RETURNCMD = 0x100;
  const uint CMF_NORMAL = 0, CMF_CANRENAME = 0x10, CMF_EXTENDEDVERBS = 0x100;
  const uint CMIC_MASK_UNICODE = 0x4000, CMIC_MASK_PTINVOKE = 0x20000000, CMIC_MASK_SHIFT_DOWN = 0x10000000, CMIC_MASK_CONTROL_DOWN = 0x40000000;
  const uint GCS_VERBW = 4;
  const uint SHELL_FIRST = 1000, SHELL_LAST = 0x7FFF;          // 앱 줄은 1~999, 탐색기 줄은 1000~
  static readonly Guid IID_IShellFolder = new Guid("000214E6-0000-0000-C000-000000000046");
  static readonly Guid IID_IContextMenu = new Guid("000214E4-0000-0000-C000-000000000046");

  readonly ConcurrentQueue<string> inbox = new ConcurrentQueue<string>();
  IntPtr me;                    // 이 숨은 창 (메뉴 주인)
  uint taskbarCreated;          // 탐색기가 다시 시작되면 모든 맨 위 창에 오는 알림
  bool busy;                    // 명령 하나를 하는 중 (메뉴가 떠 있는 동안 다음 명령이 끼어들지 않게)
  IContextMenu2 menu2;
  IContextMenu3 menu3;
  static long savedStyle;       // 보통 창일 때의 모양 — 꺼낼 때 되돌림
  static long savedExStyle = -1;

  public static void Run() {
    // 좌표는 실제 화면 픽셀로 (배율 125% · 150% · 200% 에서도 Electron 이 준 값과 같게)
    try { SetThreadDpiAwarenessContext(new IntPtr(-4)); } catch { }
    var bridge = new DesktopBridge();
    bridge.Start();
    Application.Run();
  }

  void Start() {
    ShowInTaskbar = false;
    FormBorderStyle = FormBorderStyle.None;
    me = Handle;                                              // 창만 만들고 보이지 않음
    taskbarCreated = RegisterWindowMessageW("TaskbarCreated");
    Write("ready " + DesktopLayout());
    var reader = new Thread(() => {
      string line;
      while ((line = Console.In.ReadLine()) != null) {
        inbox.Enqueue(line);
        PostMessageW(me, WM_APP_COMMAND, IntPtr.Zero, IntPtr.Zero);
      }
      PostMessageW(me, WM_APP_QUIT, IntPtr.Zero, IntPtr.Zero);   // 앱이 꺼짐
    });
    reader.IsBackground = true;
    reader.Start();
  }

  static void Write(string line) {
    Console.Out.WriteLine(line);
    Console.Out.Flush();
  }

  protected override void WndProc(ref Message m) {
    if (m.Msg == WM_APP_COMMAND) {
      if (busy) return;                                       // 메뉴의 메시지 돌림 안에서 온 것 — 끝나고 이어서
      string line;
      if (inbox.TryDequeue(out line)) {
        busy = true;
        string reply;
        try { reply = Command(line); } catch (Exception e) { reply = "fail " + e.Message.Replace('\n', ' ').Replace('\r', ' '); }
        busy = false;
        Write(reply);
      }
      if (!inbox.IsEmpty) PostMessageW(me, WM_APP_COMMAND, IntPtr.Zero, IntPtr.Zero);
      return;
    }
    if (m.Msg == WM_APP_QUIT) { Application.ExitThread(); return; }
    if (taskbarCreated != 0 && m.Msg == taskbarCreated) Write("evt desktop-restarted");
    // 탐색기 메뉴의 하위 목록 ('보내기 ›' · '연결 프로그램 ›' · '새로 만들기 ›') 그리기는 그 메뉴에 맡김
    if (menu3 != null && (m.Msg == WM_INITMENUPOPUP || m.Msg == WM_DRAWITEM || m.Msg == WM_MEASUREITEM || m.Msg == WM_MENUCHAR)) {
      IntPtr result;
      if (menu3.HandleMenuMsg2((uint)m.Msg, m.WParam, m.LParam, out result) == 0) { m.Result = result; return; }
    } else if (menu2 != null && (m.Msg == WM_INITMENUPOPUP || m.Msg == WM_DRAWITEM || m.Msg == WM_MEASUREITEM)) {
      if (menu2.HandleMenuMsg((uint)m.Msg, m.WParam, m.LParam) == 0) { m.Result = IntPtr.Zero; return; }
    }
    base.WndProc(ref m);
  }

  string Command(string line) {
    string[] p = line.Trim().Split(' ');
    switch (p[0]) {
      case "layout": return DesktopLayout();
      case "hit": return Hit(int.Parse(p[1]), int.Parse(p[2]));
      case "info": return Info(long.Parse(p[1]));
      case "attach": return Attach(long.Parse(p[1]), int.Parse(p[2]), int.Parse(p[3]), int.Parse(p[4]), int.Parse(p[5]));
      case "detach": return Detach(long.Parse(p[1]), int.Parse(p[2]), int.Parse(p[3]), int.Parse(p[4]), int.Parse(p[5]));
      case "lift": return Lift(long.Parse(p[1]), int.Parse(p[2]), int.Parse(p[3]), int.Parse(p[4]), int.Parse(p[5]), p.Length > 6 && p[6] == "behind");
      case "plain": return Plain(long.Parse(p[1]));
      case "focus": return FocusCanvas(long.Parse(p[1]));
      case "check": return Check(long.Parse(p[1]));
      case "menu": return ShellMenu(p.Length > 1 ? p[1] : "", true);
      case "menutest": return ShellMenu(p.Length > 1 ? p[1] : "", false);
      case "restore": return Restore(Encoding.UTF8.GetString(Convert.FromBase64String(p.Length > 1 ? p[1] : "")));
      default: return "fail unknown";
    }
  }

  static string Cls(IntPtr h) { var sb = new StringBuilder(256); GetClassNameW(h, sb, 256); return sb.ToString(); }
  static long Style(IntPtr h) { return GetWindowLongPtrW(h, GWL_STYLE).ToInt64(); }
  static long ExStyle(IntPtr h) { return GetWindowLongPtrW(h, GWL_EXSTYLE).ToInt64(); }

  // ================ 바탕화면 층 ================
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

  static string DesktopLayout() {
    IntPtr p = Progman();
    if (p == IntPtr.Zero) return "no-progman";
    IntPtr host = Host();
    return string.Format("progman={0} raised={1} defview={2} host={3}[{4}]",
      p, (ExStyle(p) & WS_EX_NOREDIRECTIONBITMAP) != 0, DefView(), host, Cls(host));
  }

  static string Info(long h) {
    IntPtr hwnd = new IntPtr(h);
    if (!IsWindow(hwnd)) return "gone";
    RECT r; GetWindowRect(hwnd, out r);
    IntPtr prev = GetWindow(hwnd, GW_HWNDPREV), next = GetWindow(hwnd, GW_HWNDNEXT);
    return string.Format("parent={0}[{1}] prev={2}[{3}] next={4}[{5}] vis={6} rect={7},{8},{9},{10} style=0x{11:X} ex=0x{12:X} fg={13}",
      GetParent(hwnd), Cls(GetParent(hwnd)), prev, Cls(prev), next, Cls(next), IsWindowVisible(hwnd),
      r.L, r.T, r.R - r.L, r.B - r.T, Style(hwnd), ExStyle(hwnd), GetForegroundWindow() == hwnd);
  }

  // 화면을 채우는 캔버스 창을 '움직임 없는 도구 창'으로 — 바탕화면 층에서 들고 날 때 아무것도 보이지 않게
  //   윈도우 11 둥근 모서리 · 1px 테두리 없음, 창 열기 · 닫기 움직임(DWM) 없음,
  //   도구 창(WS_EX_TOOLWINDOW)이라 보통 창이 되는 순간에도 작업표시줄 단추 · Alt+Tab 에 나오지 않음
  static string Plain(long h) {
    IntPtr hwnd = new IntPtr(h);
    if (!IsWindow(hwnd)) return "fail gone";
    int round = 1, border = unchecked((int)0xFFFFFFFE), still = 1, noPeek = 1;
    try {
      DwmSetWindowAttribute(hwnd, 33, ref round, 4);     // DWMWA_WINDOW_CORNER_PREFERENCE = 둥글게 하지 않음
      DwmSetWindowAttribute(hwnd, 34, ref border, 4);    // DWMWA_BORDER_COLOR = 없음
      DwmSetWindowAttribute(hwnd, 3, ref still, 4);      // DWMWA_TRANSITIONS_FORCEDISABLED = 움직임 없음
      DwmSetWindowAttribute(hwnd, 12, ref noPeek, 4);    // DWMWA_EXCLUDED_FROM_PEEK = 바탕화면 엿보기 때도 보임 (캔버스가 곧 바탕화면)
    } catch { }
    if ((ExStyle(hwnd) & WS_EX_TOOLWINDOW) == 0) SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new IntPtr(ExStyle(hwnd) | WS_EX_TOOLWINDOW));
    if (savedExStyle >= 0) savedExStyle |= WS_EX_TOOLWINDOW;
    return "ok";
  }

  // 바탕화면 창 바로 위 (다른 프로그램 창들 뒤) — 그 자리에 두려면 바로 위 창을 기준으로 넣음
  static IntPtr AboveDesktop(IntPtr self) {
    IntPtr desk = Host();
    if (desk == IntPtr.Zero) desk = Progman();
    IntPtr prev = GetWindow(desk, GW_HWNDPREV);
    while (prev == self) prev = GetWindow(prev, GW_HWNDPREV);
    return prev;
  }

  // 바탕화면 층에서 들어 올려 '맨 앞 창'으로 — 키보드 · 한글 입력(글자 자리 조합)이 되는 보통 창. 크기 · 자리는 그대로
  //   front: 다른 창들 앞으로 (설정 창 · 단축키)
  //   behind: 맨 앞 창이지만 자리는 다른 창들 뒤, 바탕화면 바로 위 (글 쓰는 동안 — 화면은 그대로)
  //     눌러도 앞으로 올라오지 않게 WS_EX_NOACTIVATE (이미 맨 앞 창이라 키보드는 그대로). 올렸다 내리기를 한 번에 해서 보이지 않게
  static string Lift(long h, int x, int y, int w, int hgt, bool behind) {
    IntPtr hwnd = new IntPtr(h);
    if (!IsWindow(hwnd)) return "fail gone";
    Plain(h);                                                     // 보통 창이 되기 전에 도구 창 · 움직임 없음으로
    if ((Style(hwnd) & WS_CHILD) != 0) {
      SetParent(hwnd, IntPtr.Zero);
      long style = savedStyle != 0 ? savedStyle : ((Style(hwnd) & ~WS_CHILD) | WS_POPUP);
      SetWindowLongPtrW(hwnd, GWL_STYLE, new IntPtr(style));
    }
    if (savedExStyle < 0) savedExStyle = ExStyle(hwnd) & ~WS_EX_NOACTIVATE;
    SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new IntPtr(savedExStyle));
    IntPtr place = behind ? AboveDesktop(hwnd) : HWND_TOP;
    SetWindowPos(hwnd, place, x, y, w, hgt, SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW);
    IntPtr fg = GetForegroundWindow();
    uint fgThread = fg != IntPtr.Zero ? GetWindowThreadProcessId(fg, IntPtr.Zero) : 0;
    uint self = GetCurrentThreadId();
    bool attached = fgThread != 0 && fgThread != self && AttachThreadInput(self, fgThread, true);
    SetForegroundWindow(hwnd);
    if (behind) {
      SetWindowPos(hwnd, AboveDesktop(hwnd), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
      SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new IntPtr(savedExStyle | WS_EX_NOACTIVATE));
    }
    if (attached) AttachThreadInput(self, fgThread, false);
    return "ok " + Info(h);
  }

  // 그 자리(화면 픽셀)를 누르면 바탕화면 창 안의 어느 창이 받는지 (다른 프로그램 창은 빼고)
  static string Hit(int x, int y) {
    IntPtr host = Host();
    BridgePoint p = new BridgePoint { X = x, Y = y };
    ScreenToClient(host, ref p);
    IntPtr h = ChildWindowFromPointEx(host, p, 0x1 | 0x2);
    return string.Format("hit={0}[{1}]", h, Cls(h));
  }

  // 바탕화면 층에 넣기 — x y w h 는 화면 픽셀 (주 모니터 전체)
  static string Attach(long h, int x, int y, int w, int hgt) {
    IntPtr hwnd = new IntPtr(h);
    if (!IsWindow(hwnd)) return "fail gone";
    IntPtr host = Host();
    if (host == IntPtr.Zero) return "fail no-desktop";
    if (savedExStyle >= 0) SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new IntPtr(savedExStyle));   // 들어 올릴 때 붙인 표시를 뗌
    if (GetParent(hwnd) != host) {
      if ((Style(hwnd) & WS_CHILD) == 0) savedStyle = Style(hwnd);
      SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
      SetWindowLongPtrW(hwnd, GWL_STYLE, new IntPtr((savedStyle & ~WS_POPUP) | WS_CHILD));
      SetParent(hwnd, host);
    }
    BridgePoint p = new BridgePoint { X = x, Y = y };
    ScreenToClient(host, ref p);
    SetWindowPos(hwnd, HWND_TOP, p.X, p.Y, w, hgt, SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW);
    return "ok " + Info(h);
  }

  // 바탕화면 층에서 꺼내 보통 창으로
  static string Detach(long h, int x, int y, int w, int hgt) {
    IntPtr hwnd = new IntPtr(h);
    if (!IsWindow(hwnd)) return "fail gone";
    if (savedExStyle >= 0) SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new IntPtr(savedExStyle));
    if ((Style(hwnd) & WS_CHILD) == 0) return "ok already";
    SetParent(hwnd, IntPtr.Zero);
    long style = savedStyle != 0 ? savedStyle : ((Style(hwnd) & ~WS_CHILD) | WS_POPUP);
    SetWindowLongPtrW(hwnd, GWL_STYLE, new IntPtr(style));
    SetWindowPos(hwnd, HWND_TOP, x, y, w, hgt, SWP_FRAMECHANGED | SWP_SHOWWINDOW);
    return "ok " + Info(h);
  }

  // 바탕화면 층의 창을 누른 뒤 키보드가 그 창으로 오게 — 바탕화면이 맨 앞 창일 때만
  //   (바탕화면 층의 창은 눌러도 키보드가 저절로 오지 않음. 같은 입력 줄에 잠깐 붙어 초점만 옮김)
  static string FocusCanvas(long h) {
    IntPtr hwnd = new IntPtr(h);
    if (!IsWindow(hwnd)) return "fail gone";
    uint tid = GetWindowThreadProcessId(hwnd, IntPtr.Zero);
    var info = new GUITHREADINFO();
    info.cbSize = Marshal.SizeOf(typeof(GUITHREADINFO));
    if (GetGUIThreadInfo(tid, ref info) && info.hwndFocus == hwnd) return "ok already";
    IntPtr fg = GetForegroundWindow();
    if (fg != GetAncestor(hwnd, GA_ROOT)) return "fail foreground=" + Cls(fg);
    uint self = GetCurrentThreadId();
    bool attached = AttachThreadInput(self, tid, true);
    SetFocus(hwnd);
    if (attached) AttachThreadInput(self, tid, false);
    GetGUIThreadInfo(tid, ref info);
    return (info.hwndFocus == hwnd ? "ok" : "fail") + " focus=" + Cls(info.hwndFocus) + " attached=" + attached;
  }

  // 바탕화면 층에 잘 붙어 있는지 — 탐색기가 다시 시작되면 떨어지고, 바탕화면을 새로 고치면 아이콘 층이 위로 올라오기도 함
  static string Check(long h) {
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

  // ================ 휴지통에서 되살리기 ================
  // 원래 자리가 path 인 것 가운데 가장 최근에 버린 것을 되살림 (탐색기 휴지통의 '복원' = undelete)
  //   이미 그 자리에 있으면 ok exists, 휴지통에 없으면 (비웠거나 Shift+Delete 로 아주 지움) fail not-found
  static string Restore(string path) {
    if (System.IO.File.Exists(path) || System.IO.Directory.Exists(path)) return "ok exists";
    string dir = System.IO.Path.GetDirectoryName(path);
    string name = System.IO.Path.GetFileName(path);
    string stem = System.IO.Path.GetFileNameWithoutExtension(path);
    dynamic shell = Activator.CreateInstance(Type.GetTypeFromProgID("Shell.Application"));
    dynamic bin = shell.NameSpace(10);                                    // 10 = 휴지통
    dynamic best = null;
    DateTime bestAt = DateTime.MinValue;
    foreach (dynamic item in bin.Items()) {
      string from = Convert.ToString(item.ExtendedProperty("System.Recycle.DeletedFrom"));
      if (!string.Equals(from, dir, StringComparison.OrdinalIgnoreCase)) continue;
      string shown = Convert.ToString(item.Name);                         // 확장자 숨김 설정이면 확장자 없이 보임
      if (!string.Equals(shown, name, StringComparison.OrdinalIgnoreCase) && !string.Equals(shown, stem, StringComparison.OrdinalIgnoreCase)) continue;
      object at = item.ExtendedProperty("System.Recycle.DateDeleted");
      DateTime when = at is DateTime ? (DateTime)at : DateTime.MinValue;
      if (best == null || when > bestAt) { best = item; bestAt = when; }
    }
    if (best == null) return "fail not-found";
    best.InvokeVerb("undelete");
    return System.IO.File.Exists(path) || System.IO.Directory.Exists(path) ? "ok" : "fail not-restored";
  }

  // ================ 윈도우 우클릭 메뉴 ================
  // 요청 (base64, UTF-8): 파일 경로 줄들 (같은 폴더 — 없으면 바탕화면 빈 곳 메뉴), "--" 줄,
  //   앱 줄들 "id<TAB>부모id<TAB>글자<TAB>표시" (id 1~999, 부모 0 = 맨 위, 표시: s 구분선 · d 흐림 · c 체크)
  //   앱 줄을 위에, 탐색기 줄을 그 아래에 둠
  // 답: ok app <id> · ok shell <verb> (탐색기가 한 일) · ok rename (이름 바꾸기 — 앱이 직접) · ok none · fail …
  //   menutest 는 띄우지 않고 "ok <base64: 줄 글자들>" 만 (시험용)
  string ShellMenu(string payload, bool show) {
    string text = Encoding.UTF8.GetString(Convert.FromBase64String(payload));
    string[] lines = text.Replace("\r", "").Split('\n');
    var paths = new List<string>();
    int i = 0;
    for (; i < lines.Length && lines[i] != "--"; i++) if (lines[i].Length > 0) paths.Add(lines[i]);
    var items = new List<string[]>();
    for (i++; i < lines.Length; i++) if (lines[i].Length > 0) items.Add(lines[i].Split('\t'));

    IntPtr menu = CreatePopupMenu();
    IContextMenu cm = null;
    try {
      var popups = new Dictionary<string, IntPtr>();
      popups["0"] = menu;
      foreach (var it in items) {
        string id = it[0], parent = it.Length > 1 ? it[1] : "0", label = it.Length > 2 ? it[2] : "", flags = it.Length > 3 ? it[3] : "";
        IntPtr target;
        if (!popups.TryGetValue(parent, out target)) continue;
        if (flags.Contains("s")) { AppendMenuW(target, MF_SEPARATOR, UIntPtr.Zero, null); continue; }
        uint f = (flags.Contains("d") ? MF_GRAYED : 0) | (flags.Contains("c") ? MF_CHECKED : 0);
        if (items.Exists(x => x.Length > 1 && x[1] == id)) {
          IntPtr sub = CreatePopupMenu();
          popups[id] = sub;
          AppendMenuW(target, MF_POPUP | f, (UIntPtr)(ulong)sub.ToInt64(), label);
        } else {
          AppendMenuW(target, MF_STRING | f, (UIntPtr)uint.Parse(id), label);
        }
      }

      cm = paths.Count > 0 ? FileMenu(paths) : BackgroundMenu();
      bool extended = (GetAsyncKeyState(0x10) & 0x8000) != 0;       // Shift: 숨은 줄까지 (탐색기와 같게)
      if (cm != null) {
        if (GetMenuItemCount(menu) > 0) AppendMenuW(menu, MF_SEPARATOR, UIntPtr.Zero, null);
        cm.QueryContextMenu(menu, (uint)GetMenuItemCount(menu), SHELL_FIRST, SHELL_LAST,
          CMF_NORMAL | (paths.Count > 0 ? CMF_CANRENAME : 0) | (extended ? CMF_EXTENDEDVERBS : 0));
        menu2 = cm as IContextMenu2;
        menu3 = cm as IContextMenu3;
      }
      if (!show) return "ok " + Convert.ToBase64String(Encoding.UTF8.GetBytes(Describe(menu, cm, 0)));

      BridgePoint pt;
      GetCursorPos(out pt);
      IntPtr before = GetForegroundWindow();
      TakeForeground(before);
      uint cmd = TrackPopupMenuEx(menu, TPM_RETURNCMD | TPM_RIGHTBUTTON, pt.X, pt.Y, me, IntPtr.Zero);
      PostMessageW(me, WM_NULL, IntPtr.Zero, IntPtr.Zero);
      if (cmd == 0 || cmd < SHELL_FIRST) {
        if (before != IntPtr.Zero && before != me) SetForegroundWindow(before);   // 메뉴 전 창으로 되돌림
        return cmd == 0 ? "ok none" : "ok app " + cmd;
      }
      string verb = Verb(cm, cmd - SHELL_FIRST);
      if (verb == "rename") {
        if (before != IntPtr.Zero && before != me) SetForegroundWindow(before);
        return "ok rename";
      }
      var ici = new CMINVOKECOMMANDINFOEX();
      ici.cbSize = Marshal.SizeOf(typeof(CMINVOKECOMMANDINFOEX));
      ici.fMask = CMIC_MASK_UNICODE | CMIC_MASK_PTINVOKE;
      if ((GetAsyncKeyState(0x11) & 0x8000) != 0) ici.fMask |= CMIC_MASK_CONTROL_DOWN;
      if ((GetAsyncKeyState(0x10) & 0x8000) != 0) ici.fMask |= CMIC_MASK_SHIFT_DOWN;
      ici.hwnd = me;
      ici.lpVerb = new IntPtr(cmd - SHELL_FIRST);
      ici.lpVerbW = new IntPtr(cmd - SHELL_FIRST);
      ici.nShow = 1;
      ici.ptInvoke = pt;
      int hr = cm.InvokeCommand(ref ici);
      return (hr == 0 ? "ok shell " : "fail invoke " + hr + " ") + (verb.Length > 0 ? verb : "-");
    } finally {
      menu2 = null;
      menu3 = null;
      DestroyMenu(menu);
      if (cm != null) Marshal.ReleaseComObject(cm);
    }
  }

  // 파일들의 탐색기 메뉴 — 같은 폴더의 파일만 (앱이 골라서 보냄)
  IContextMenu FileMenu(List<string> paths) {
    var pidls = new List<IntPtr>();
    var children = new List<IntPtr>();
    IShellFolder parent = null;
    try {
      foreach (var path in paths) {
        IntPtr pidl;
        uint attrs;
        if (SHParseDisplayName(path, IntPtr.Zero, out pidl, 0, out attrs) != 0 || pidl == IntPtr.Zero) continue;
        pidls.Add(pidl);
        IntPtr folderPtr, child;
        Guid iid = IID_IShellFolder;
        if (SHBindToParent(pidl, ref iid, out folderPtr, out child) != 0) continue;
        if (parent == null) parent = (IShellFolder)Marshal.GetObjectForIUnknown(folderPtr);
        Marshal.Release(folderPtr);
        children.Add(child);
      }
      if (parent == null || children.Count == 0) return null;
      IntPtr cmPtr;
      Guid iidCm = IID_IContextMenu;
      if (parent.GetUIObjectOf(me, (uint)children.Count, children.ToArray(), ref iidCm, IntPtr.Zero, out cmPtr) != 0) return null;
      var cm = (IContextMenu)Marshal.GetObjectForIUnknown(cmPtr);
      Marshal.Release(cmPtr);
      return cm;
    } finally {
      foreach (var p in pidls) CoTaskMemFree(p);
      if (parent != null) Marshal.ReleaseComObject(parent);
    }
  }

  // 바탕화면 빈 곳 메뉴 (새로 만들기 › · 붙여넣기 · 디스플레이 설정 · 개인 설정 …)
  IContextMenu BackgroundMenu() {
    IntPtr deskPtr;
    if (SHGetDesktopFolder(out deskPtr) != 0) return null;
    var desk = (IShellFolder)Marshal.GetObjectForIUnknown(deskPtr);
    Marshal.Release(deskPtr);
    try {
      IntPtr cmPtr;
      Guid iid = IID_IContextMenu;
      if (desk.CreateViewObject(me, ref iid, out cmPtr) != 0) return null;
      var cm = (IContextMenu)Marshal.GetObjectForIUnknown(cmPtr);
      Marshal.Release(cmPtr);
      return cm;
    } finally {
      Marshal.ReleaseComObject(desk);
    }
  }

  // 메뉴를 띄우기 전에 이 숨은 창을 맨 앞 창으로 — 그래야 메뉴 밖을 누르면 메뉴가 닫힘
  void TakeForeground(IntPtr before) {
    uint fgThread = before != IntPtr.Zero ? GetWindowThreadProcessId(before, IntPtr.Zero) : 0;
    uint self = GetCurrentThreadId();
    bool attached = fgThread != 0 && fgThread != self && AttachThreadInput(self, fgThread, true);
    SetForegroundWindow(me);
    if (attached) AttachThreadInput(self, fgThread, false);
  }

  static string Verb(IContextMenu cm, uint offset) {
    IntPtr buf = Marshal.AllocHGlobal(1024);
    try {
      Marshal.WriteInt16(buf, 0);
      if (cm.GetCommandString(new UIntPtr(offset), GCS_VERBW, IntPtr.Zero, buf, 500) != 0) return "";
      return Marshal.PtrToStringUni(buf) ?? "";
    } catch { return ""; }
    finally { Marshal.FreeHGlobal(buf); }
  }

  // menutest: 줄 글자 (하위 목록은 › 뒤에), 탐색기 줄은 [verb]
  static string Describe(IntPtr menu, IContextMenu cm, int depth) {
    var sb = new StringBuilder();
    int n = GetMenuItemCount(menu);
    for (int k = 0; k < n; k++) {
      var t = new StringBuilder(256);
      GetMenuStringW(menu, (uint)k, t, 256, MF_BYPOSITION);
      uint id = GetMenuItemID(menu, k);
      IntPtr sub = GetSubMenu(menu, k);
      if (sb.Length > 0) sb.Append(" | ");
      if (t.Length == 0 && sub == IntPtr.Zero) { sb.Append("---"); continue; }
      sb.Append(t.ToString());
      if (cm != null && id >= SHELL_FIRST && id != 0xFFFFFFFF) sb.Append(" [" + Verb(cm, id - SHELL_FIRST) + "]");
      else if (id != 0xFFFFFFFF && id < SHELL_FIRST) sb.Append(" #" + id);
      if (sub != IntPtr.Zero && depth < 1) sb.Append(" › (" + Describe(sub, cm, depth + 1) + ")");
    }
    return sb.ToString();
  }
}
"@
[DesktopBridge]::Run()

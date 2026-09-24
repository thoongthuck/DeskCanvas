// 바탕화면 고정 모듈 (메모장.md Phase 5 — C++ addon)
//   캔버스 창을 '바탕화면 바로 위 · 다른 프로그램 창들 뒤'에 붙잡아 둠. 창은 보통 창 그대로라
//   누르면 바로 쓰는 창(활성 창)이 되고 한글 조합도 글자 자리에 그려짐 — 바탕화면 층에 넣고 빼는 전환이 없음
//   방법: 캔버스 창의 창 메시지를 창 안에서 가로챔 (서브클래싱)
//     WM_WINDOWPOSCHANGING — 앞으로 올라오려 하면 (누르기 · 활성 · 맨 위 고정 무엇이든) 자리를 바탕화면 바로 위로 고침
//     창 쌓임 순서가 바뀌거나 맨 앞 창이 바뀌면 (WinEvent) 바탕화면 바로 위인지 살펴 다시 내려감
//   '바탕화면 보기'(Win+D): 바탕화면 창(Progman)이 보통 창들 맨 위로 올라와 캔버스를 덮음
//     → 그동안만 캔버스를 맨 위 고정으로 띄움 (Rainmeter 와 같은 방법). 보통 창들 맨 위로 올리는 것은
//       맨 앞이 아닌 앱에게 윈도우가 막아서 (맨 앞 창인 바탕화면 뒤로 들어감) 맨 위 고정이어야 함
//     바탕화면 보기가 끝나면 (다른 창이 맨 앞 · 바탕화면이 다시 내려감) 맨 위 고정을 풀고 바탕화면 바로 위로
//   setBottom(false) 이면 잠깐 풀어 둠 — 트레이에서 연 설정 창 · Ctrl+Alt+D 로 앞으로 꺼낼 때
//
// 윈도우 SDK 없이 빌드함 (이 PC 에는 MSVC 컴파일러만 있음 — build.js):
//   windows.h 대신 쓰는 것만 여기 적고, kernel32 · user32 함수는 build.js 가 만든 import 라이브러리로,
//   N-API 함수는 실행 파일(electron.exe)에서 이름으로 찾아 씀 → Electron 을 올려도 다시 빌드할 필요 없음

typedef void* HWND;
typedef void* HMODULE;
typedef void* HWINEVENTHOOK;
typedef long long LONG_PTR;
typedef unsigned long long WPARAM;
typedef long long LPARAM;
typedef long long LRESULT;
typedef unsigned int UINT;
typedef int BOOL;
typedef unsigned long DWORD;
typedef long LONG;
typedef decltype(sizeof(0)) size_t;
typedef LRESULT (*WNDPROC)(HWND, UINT, WPARAM, LPARAM);
typedef BOOL (*WNDENUMPROC)(HWND, LPARAM);
typedef void (*WINEVENTPROC)(HWINEVENTHOOK, DWORD, HWND, LONG, LONG, DWORD, DWORD);
typedef unsigned long long UINT_PTR;
typedef void (*TIMERPROC)(HWND, UINT, UINT_PTR, DWORD);

struct WINDOWPOS { HWND hwnd; HWND hwndInsertAfter; int x; int y; int cx; int cy; UINT flags; };

extern "C" {
__declspec(dllimport) HWND FindWindowW(const wchar_t*, const wchar_t*);
__declspec(dllimport) HWND FindWindowExW(HWND, HWND, const wchar_t*, const wchar_t*);
__declspec(dllimport) BOOL EnumWindows(WNDENUMPROC, LPARAM);
__declspec(dllimport) HWND GetWindow(HWND, UINT);
__declspec(dllimport) LONG_PTR GetWindowLongPtrW(HWND, int);
__declspec(dllimport) LONG_PTR SetWindowLongPtrW(HWND, int, LONG_PTR);
__declspec(dllimport) BOOL SetWindowPos(HWND, HWND, int, int, int, int, UINT);
__declspec(dllimport) BOOL IsWindow(HWND);
__declspec(dllimport) BOOL IsWindowVisible(HWND);
__declspec(dllimport) LRESULT CallWindowProcW(WNDPROC, HWND, UINT, WPARAM, LPARAM);
__declspec(dllimport) HWINEVENTHOOK SetWinEventHook(DWORD, DWORD, HMODULE, WINEVENTPROC, DWORD, DWORD, DWORD);
__declspec(dllimport) BOOL UnhookWinEvent(HWINEVENTHOOK);
__declspec(dllimport) HWND GetForegroundWindow();
__declspec(dllimport) HWND GetDesktopWindow();
__declspec(dllimport) UINT_PTR SetTimer(HWND, UINT_PTR, UINT, TIMERPROC);
__declspec(dllimport) BOOL KillTimer(HWND, UINT_PTR);
__declspec(dllimport) unsigned long long GetTickCount64();
__declspec(dllimport) HMODULE GetModuleHandleW(const wchar_t*);
__declspec(dllimport) void* GetProcAddress(HMODULE, const char*);
}

const UINT WM_WINDOWPOSCHANGING = 0x0046, WM_NCDESTROY = 0x0082;
const UINT SWP_NOSIZE = 0x1, SWP_NOMOVE = 0x2, SWP_NOZORDER = 0x4, SWP_NOACTIVATE = 0x10;
const UINT GW_HWNDPREV = 3, GW_OWNER = 4;
const int GWLP_WNDPROC = -4, GWL_EXSTYLE = -20;
const LONG_PTR WS_EX_TOPMOST = 0x8;
const HWND HWND_TOP = nullptr, HWND_TOPMOST = reinterpret_cast<HWND>(-1), HWND_NOTOPMOST = reinterpret_cast<HWND>(-2);
const UINT RECHECK_MS = 400;
const DWORD EVENT_SYSTEM_FOREGROUND = 3, EVENT_OBJECT_REORDER = 0x8004;
const DWORD WINEVENT_OUTOFCONTEXT = 0, WINEVENT_SKIPOWNPROCESS = 2;
const int SETTLES_PER_SECOND = 20;       // 다른 프로그램이 같은 자리를 다투면 끝없이 주고받지 않게

// ---------------- N-API (node_api.h 대신 쓰는 것만) ----------------
typedef struct napi_env__* napi_env;
typedef struct napi_value__* napi_value;
typedef struct napi_callback_info__* napi_callback_info;
typedef int napi_status;
typedef napi_value (*napi_callback)(napi_env, napi_callback_info);
struct napi_property_descriptor {
  const char* utf8name; napi_value name; napi_callback method; napi_callback getter; napi_callback setter;
  napi_value value; int attributes; void* data;
};

static napi_status (*p_define_properties)(napi_env, napi_value, size_t, const napi_property_descriptor*);
static napi_status (*p_get_cb_info)(napi_env, napi_callback_info, size_t*, napi_value*, napi_value*, void**);
static napi_status (*p_get_buffer_info)(napi_env, napi_value, void**, size_t*);
static napi_status (*p_get_value_bool)(napi_env, napi_value, bool*);
static napi_status (*p_get_boolean)(napi_env, bool, napi_value*);
static napi_status (*p_get_undefined)(napi_env, napi_value*);
static napi_status (*p_create_object)(napi_env, napi_value*);
static napi_status (*p_set_named_property)(napi_env, napi_value, const char*, napi_value);
static napi_status (*p_create_int32)(napi_env, int, napi_value*);

template <typename T>
static bool Load(T& fn, const char* name) {
  fn = reinterpret_cast<T>(GetProcAddress(GetModuleHandleW(nullptr), name));
  return fn != nullptr;
}

// ---------------- 붙잡기 ----------------
static HWND g_hwnd = nullptr;          // 붙잡은 캔버스 창
static WNDPROC g_prev = nullptr;       // 원래 창 메시지 처리 (Electron · Chromium)
static bool g_bottom = true;           // true: 바탕화면 바로 위에 붙잡음, false: 잠깐 풀어 둠
static HWINEVENTHOOK g_hook = nullptr;          // 맨 앞 창이 바뀜
static HWINEVENTHOOK g_reorderHook = nullptr;   // 창 쌓임 순서가 바뀜
static bool g_raised = false;                   // 바탕화면 보기(Win+D) 동안 맨 위 고정으로 띄워 둠
static unsigned long long g_settleSecond = 0;   // 자리 맞추기 횟수 세기 (1초씩)
static int g_settleCount = 0;
static int g_events = 0, g_sinks = 0, g_raises = 0;   // 기록용 — 받은 알림 · 다시 내림 · 바탕화면 보기로 띄움
static UINT_PTR g_timer = 0;             // 맨 앞 창이 바뀐 뒤 한 번 더 살피기

// 윈도우 아이콘 층(SHELLDLL_DefView)을 가진 바탕화면 창 — 윈도우 11 24H2 뒤로는 Progman, 그 전에는 Progman 이나 WorkerW
static BOOL FindDefViewHost(HWND top, LPARAM out) {
  if (FindWindowExW(top, nullptr, L"SHELLDLL_DefView", nullptr)) {
    *reinterpret_cast<HWND*>(out) = top;
    return 0;
  }
  return 1;
}

static HWND DesktopHost() {
  HWND progman = FindWindowW(L"Progman", nullptr);
  if (progman && FindWindowExW(progman, nullptr, L"SHELLDLL_DefView", nullptr)) return progman;
  HWND found = nullptr;
  EnumWindows(FindDefViewHost, reinterpret_cast<LPARAM>(&found));
  return found ? found : progman;
}

static bool IsTopmost(HWND h) {
  return (GetWindowLongPtrW(h, GWL_EXSTYLE) & WS_EX_TOPMOST) != 0;
}

// 바탕화면 창 위로 처음 보이는 창 (자기 · 보이지 않는 창은 건너뜀 — 입력기 창 등)
static HWND FirstAbove(HWND desk, HWND self) {
  HWND prev = GetWindow(desk, GW_HWNDPREV);
  while (prev && (prev == self || !IsWindowVisible(prev))) prev = GetWindow(prev, GW_HWNDPREV);
  return prev;
}

// 바탕화면 바로 위 자리 — *after 밑에 넣으면 됨. 바탕화면 창을 못 찾으면 false
//   바탕화면 위로 처음 보이는 창 밑. 그 창이 맨 위 고정 창이면 (바탕화면 위로 보통 창이 없음) 보통 창들 맨 위
static bool AboveDesktop(HWND self, HWND* after) {
  HWND desk = DesktopHost();
  if (!desk) return false;
  HWND first = FirstAbove(desk, self);
  if (first && !IsTopmost(first)) *after = first;
  else *after = IsTopmost(self) ? HWND_NOTOPMOST : HWND_TOP;
  return true;
}

static void Sink(HWND hwnd) {
  HWND after;
  if (AboveDesktop(hwnd, &after)) SetWindowPos(hwnd, after, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
}

// 바탕화면과 캔버스 사이에 보이는 창이 없는지
static bool RightAboveDesktop() {
  HWND desk = DesktopHost();
  if (!g_hwnd || !desk) return false;
  HWND prev = GetWindow(desk, GW_HWNDPREV);
  while (prev && prev != g_hwnd && !IsWindowVisible(prev)) prev = GetWindow(prev, GW_HWNDPREV);
  return prev == g_hwnd;
}

// 캔버스가 바탕화면 창보다 밑에 있음 — 평소에는 없는 일. '바탕화면 보기'(Win+D)가 바탕화면 창을 보통 창들 맨 위로 올린 때
static bool BelowDesktop(HWND desk) {
  for (HWND h = GetWindow(desk, GW_HWNDPREV); h; h = GetWindow(h, GW_HWNDPREV)) {
    if (h == g_hwnd) return false;
  }
  return true;
}

// 바탕화면 보기가 이어지는 중인지 — 바탕화면 위로 보통 창이 없고, 맨 앞 창이 바탕화면 · 캔버스 · 맨 위 고정 창(시작 메뉴 · 작업표시줄 등)
static bool StillShowingDesktop(HWND desk) {
  HWND first = FirstAbove(desk, g_hwnd);
  if (first && !IsTopmost(first)) return false;              // 다른 창이 바탕화면 위로 올라옴 (작업표시줄에서 연 창 등)
  HWND fg = GetForegroundWindow();
  return !fg || fg == desk || fg == g_hwnd || GetWindow(fg, GW_OWNER) == g_hwnd || IsTopmost(fg);
}

// 캔버스를 제자리로 — 알림 · 잠시 뒤 살피기 · setBottom 에서 부름
//   평소: 바탕화면 바로 위 (사이에 창이 끼었으면 다시 내림)
//   바탕화면 보기: 맨 위 고정으로 바탕화면 창 위에 띄움 → 끝나면 풀고 바탕화면 바로 위로
static void Settle() {
  if (!g_hwnd || !g_bottom) return;
  if (!IsWindowVisible(g_hwnd)) {                            // 아직 안 보이는 창 (처음 띄우기 전) — 자리만 잡아 둠
    Sink(g_hwnd);
    return;
  }
  HWND desk = DesktopHost();
  if (!desk) return;
  if (g_raised) {
    if (StillShowingDesktop(desk)) return;
    g_raised = false;                                        // PinProc 이 자리를 바탕화면 바로 위로 고침
    SetWindowPos(g_hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    return;
  }
  if (BelowDesktop(desk)) {
    g_raised = true;
    g_raises++;
    SetWindowPos(g_hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    return;
  }
  if (!RightAboveDesktop()) {
    g_sinks++;
    Sink(g_hwnd);
  }
}

static void Release();

static LRESULT PinProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
  if (msg == WM_WINDOWPOSCHANGING && g_bottom && lp) {
    WINDOWPOS* pos = reinterpret_cast<WINDOWPOS*>(lp);
    if (!(pos->flags & SWP_NOZORDER)) {                 // 쌓임 순서를 바꾸려 함
      HWND after;
      if (g_raised) pos->hwndInsertAfter = HWND_TOPMOST;           // 바탕화면 보기 동안은 맨 위 고정 그대로
      else if (AboveDesktop(hwnd, &after)) pos->hwndInsertAfter = after;   // 평소: 바탕화면 바로 위로
      else pos->flags |= SWP_NOZORDER;
    }
  }
  WNDPROC prev = g_prev;
  if (msg == WM_NCDESTROY) Release();                   // 창이 사라짐 — 원래대로
  return CallWindowProcW(prev, hwnd, msg, wp, lp);
}

static void Recheck(HWND, UINT, UINT_PTR, DWORD) {
  if (g_timer) KillTimer(nullptr, g_timer);
  g_timer = 0;
  Settle();
}

static void RecheckLater() {
  if (!g_timer) g_timer = SetTimer(nullptr, 0, RECHECK_MS, Recheck);
}

// 창 쌓임 순서가 바뀜 (최상위 창들 — 알림의 창이 데스크톱 창)
//   Win+D: 맨 앞 창이 바탕화면이 된 뒤 조금 늦게 바탕화면 창이 올라오는데, 그때 오는 알림이 이것
//   다른 프로그램이 같은 자리를 다투면 끝없이 주고받지 않게 1초에 몇 번까지만 (넘으면 잠시 뒤 한 번)
static void OnReorder(HWINEVENTHOOK, DWORD, HWND hwnd, LONG, LONG, DWORD, DWORD) {
  if (!g_hwnd || !g_bottom || hwnd != GetDesktopWindow()) return;
  g_events++;
  unsigned long long now = GetTickCount64();
  if (now - g_settleSecond >= 1000) {
    g_settleSecond = now;
    g_settleCount = 0;
  }
  if (++g_settleCount > SETTLES_PER_SECOND) {
    RecheckLater();
    return;
  }
  Settle();
}

// 맨 앞 창이 바뀜 (Win+D · 바탕화면 누르기 · 다른 창 누르기) — 바탕화면이 조금 늦게 움직이기도 해서 잠시 뒤 한 번 더
static void OnForeground(HWINEVENTHOOK, DWORD, HWND, LONG, LONG, DWORD, DWORD) {
  if (!g_hwnd || !g_bottom) return;
  g_events++;
  Settle();
  RecheckLater();
}

static void Release() {
  if (g_hook) UnhookWinEvent(g_hook);
  if (g_reorderHook) UnhookWinEvent(g_reorderHook);
  g_hook = nullptr;
  g_reorderHook = nullptr;
  if (g_timer) KillTimer(nullptr, g_timer);
  g_timer = 0;
  if (g_hwnd && g_prev && IsWindow(g_hwnd)
      && GetWindowLongPtrW(g_hwnd, GWLP_WNDPROC) == reinterpret_cast<LONG_PTR>(&PinProc)) {
    SetWindowLongPtrW(g_hwnd, GWLP_WNDPROC, reinterpret_cast<LONG_PTR>(g_prev));
  }
  g_hwnd = nullptr;
  g_prev = nullptr;
  g_raised = false;
}

// ---------------- JS 에서 부르는 것 ----------------
static napi_value Bool(napi_env env, bool b) {
  napi_value v = nullptr;
  p_get_boolean(env, b, &v);
  return v;
}

static napi_value Undefined(napi_env env) {
  napi_value v = nullptr;
  p_get_undefined(env, &v);
  return v;
}

static bool Args(napi_env env, napi_callback_info info, napi_value* argv, size_t want) {
  size_t argc = want;
  return p_get_cb_info(env, info, &argc, argv, nullptr, nullptr) == 0 && argc >= want;
}

// pin(창 핸들 Buffer) — 붙잡기 시작 (BrowserWindow.getNativeWindowHandle())
static napi_value Pin(napi_env env, napi_callback_info info) {
  napi_value argv[1];
  if (!Args(env, info, argv, 1)) return Bool(env, false);
  void* data = nullptr;
  size_t len = 0;
  if (p_get_buffer_info(env, argv[0], &data, &len) != 0 || len < sizeof(HWND)) return Bool(env, false);
  HWND hwnd = *reinterpret_cast<HWND*>(data);
  if (!hwnd || !IsWindow(hwnd)) return Bool(env, false);
  if (g_hwnd != hwnd) {
    Release();
    g_prev = reinterpret_cast<WNDPROC>(SetWindowLongPtrW(hwnd, GWLP_WNDPROC, reinterpret_cast<LONG_PTR>(&PinProc)));
    if (!g_prev) return Bool(env, false);
    g_hwnd = hwnd;
    g_hook = SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND, nullptr, OnForeground, 0, 0, WINEVENT_OUTOFCONTEXT);
    g_reorderHook = SetWinEventHook(EVENT_OBJECT_REORDER, EVENT_OBJECT_REORDER, nullptr, OnReorder, 0, 0,
                                    WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);   // 이 앱이 옮긴 것은 PinProc 이 이미 봄
  }
  g_bottom = true;
  g_raised = false;
  Settle();
  return Bool(env, true);
}

static napi_value Unpin(napi_env env, napi_callback_info) {
  Release();
  return Undefined(env);
}

// setBottom(bool) — true: 바탕화면 바로 위로 (지금 곧 내려감), false: 잠깐 풀어 둠 (앞으로 올라올 수 있음)
static napi_value SetBottom(napi_env env, napi_callback_info info) {
  napi_value argv[1];
  bool on = true;
  if (Args(env, info, argv, 1)) p_get_value_bool(env, argv[0], &on);
  g_bottom = on;
  if (!on) g_raised = false;                             // 앞으로 꺼냄 — main.js 가 맨 위 고정을 직접 다룸
  Settle();
  return Undefined(env);
}

static napi_value Int(napi_env env, int n) {
  napi_value v = nullptr;
  p_create_int32(env, n, &v);
  return v;
}

// state() — { pinned, bottom, raised, rightAboveDesktop, foreground, events, sinks, raises } (시험 · 기록용)
static napi_value State(napi_env env, napi_callback_info) {
  napi_value obj = nullptr;
  p_create_object(env, &obj);
  p_set_named_property(env, obj, "pinned", Bool(env, g_hwnd != nullptr));
  p_set_named_property(env, obj, "bottom", Bool(env, g_bottom));
  p_set_named_property(env, obj, "raised", Bool(env, g_raised));
  p_set_named_property(env, obj, "rightAboveDesktop", Bool(env, RightAboveDesktop()));
  p_set_named_property(env, obj, "foreground", Bool(env, g_hwnd && GetForegroundWindow() == g_hwnd));
  p_set_named_property(env, obj, "events", Int(env, g_events));
  p_set_named_property(env, obj, "sinks", Int(env, g_sinks));
  p_set_named_property(env, obj, "raises", Int(env, g_raises));
  return obj;
}

static void Method(napi_property_descriptor& d, const char* name, napi_callback fn) {
  d.utf8name = name;
  d.name = nullptr;
  d.method = fn;
  d.getter = nullptr;
  d.setter = nullptr;
  d.value = nullptr;
  d.attributes = 0;
  d.data = nullptr;
}

extern "C" __declspec(dllexport) int node_api_module_get_api_version_v1() { return 8; }

extern "C" __declspec(dllexport) napi_value napi_register_module_v1(napi_env env, napi_value exports) {
  if (!Load(p_define_properties, "napi_define_properties") || !Load(p_get_cb_info, "napi_get_cb_info")
      || !Load(p_get_buffer_info, "napi_get_buffer_info") || !Load(p_get_value_bool, "napi_get_value_bool")
      || !Load(p_get_boolean, "napi_get_boolean") || !Load(p_get_undefined, "napi_get_undefined")
      || !Load(p_create_object, "napi_create_object") || !Load(p_set_named_property, "napi_set_named_property")
      || !Load(p_create_int32, "napi_create_int32")) {
    return exports;                                    // N-API 를 못 찾음 — 빈 모듈 (main.js 가 예전 방식으로)
  }
  napi_property_descriptor props[4];
  Method(props[0], "pin", Pin);
  Method(props[1], "unpin", Unpin);
  Method(props[2], "setBottom", SetBottom);
  Method(props[3], "state", State);
  p_define_properties(env, exports, 4, props);
  return exports;
}

; DeskCanvas 설치 프로그램 — electron-builder 가 기본 설치 창(환영 · 사용권 동의 · 설치 방식 · 설치 위치 · 설치 · 마침)에 더하는 것
;   설치: 이미 설치되어 있으면 '업데이트 / 제거' 를 고르는 창 (환영 창 다음)
;   제거: '내 데이터(쪽지 · 설정 · 사진)도 지울지' 고르는 창, 시작 앱 등록 지우기
;   업데이트할 때는 설치 프로그램이 옛 판의 제거 프로그램을 조용히 돌림 (--updated) → 그때는 데이터 · 시작 앱을 건드리지 않음
;   package.json build.nsis.include 로 들어감. 경고도 오류로 치므로(-WX) 쓰지 않는 함수 · 변수가 없게 설치 · 제거를 나눠 둠
!include nsDialogs.nsh
!include LogicLib.nsh

!ifndef BUILD_UNINSTALLER
  Var dcOldDir
  Var dcOldVersion
  Var dcRadioRemove

  ; 페이지 매크로는 설치 창 모양(MUI2)을 읽은 뒤에 들어가므로 함수도 그 안에 둠 (MUI_HEADER_TEXT 를 쓰려고)
  !macro customWelcomePage
    !insertmacro MUI_PAGE_WELCOME
    Page custom dcMaintenancePage dcMaintenanceLeave

  ; 이미 설치되어 있을 때만 보임 — 업데이트(기본) · 제거
  Function dcMaintenancePage
    ReadRegStr $dcOldDir HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${If} $dcOldDir == ""
      ReadRegStr $dcOldDir HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${EndIf}
    ${If} $dcOldDir == ""
    ${OrIfNot} ${FileExists} "$dcOldDir\${UNINSTALL_FILENAME}"
      Abort
    ${EndIf}
    ReadRegStr $dcOldVersion HKCU "${UNINSTALL_REGISTRY_KEY}" DisplayVersion
    ${If} $dcOldVersion == ""
      ReadRegStr $dcOldVersion HKLM "${UNINSTALL_REGISTRY_KEY}" DisplayVersion
    ${EndIf}

    !insertmacro MUI_HEADER_TEXT "이미 설치되어 있어요" "이 컴퓨터에 있는 DeskCanvas $dcOldVersion 을(를) 어떻게 할까요?"
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateRadioButton} 0 8u 100% 14u "업데이트 — 새 판(${VERSION})으로 바꿔요"
    Pop $0
    ${NSD_Check} $0
    ${NSD_CreateLabel} 12u 24u 100% 12u "쪽지 · 설정 · 넣어 둔 사진과 영상은 그대로 남아요."
    Pop $0
    ${NSD_CreateRadioButton} 0 44u 100% 14u "제거 — 이 컴퓨터에서 DeskCanvas 를 지워요"
    Pop $dcRadioRemove
    ${NSD_CreateLabel} 12u 60u 100% 12u "다음 창에서 내 데이터를 남길지 지울지 고를 수 있어요."
    Pop $0
    ${NSD_CreateLabel} 0 88u 100% 12u "설치 위치: $dcOldDir"
    Pop $0
    nsDialogs::Show
  FunctionEnd

  Function dcMaintenanceLeave
    ${NSD_GetState} $dcRadioRemove $0
    ${If} $0 == ${BST_CHECKED}
      ; 제거 프로그램을 띄우고 이 설치 프로그램은 끝냄 (제거 프로그램은 스스로 임시 폴더로 옮겨 돌아감)
      Exec '"$dcOldDir\${UNINSTALL_FILENAME}"'
      Quit
    ${EndIf}
  FunctionEnd
  !macroend
!else
  Var dcDeleteCheck
  Var dcDeleteData

  !macro customUnWelcomePage
    !insertmacro MUI_UNPAGE_WELCOME
    UninstPage custom un.dcDataPage un.dcDataLeave

  ; 내 데이터 — 기본은 남김 (다시 설치하면 이어서 씀)
  Function un.dcDataPage
    !insertmacro MUI_HEADER_TEXT "내 데이터" "쪽지 · 설정 · 사진을 어떻게 할까요?"
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateLabel} 0 0 100% 36u "DeskCanvas 를 지워도 쪽지 · 설정 · 넣어 둔 사진과 영상은 남아 있어서, 다시 설치하면 그대로 이어서 쓸 수 있어요.$\r$\n(저장된 곳: %APPDATA%\${APP_FILENAME})"
    Pop $0
    ${NSD_CreateCheckbox} 0 46u 100% 14u "내 데이터도 모두 지우기 (지우면 되살릴 수 없어요)"
    Pop $dcDeleteCheck
    nsDialogs::Show
  FunctionEnd

  Function un.dcDataLeave
    ${NSD_GetState} $dcDeleteCheck $dcDeleteData
  FunctionEnd
  !macroend

  !macro customUnInstall
    ${IfNot} ${isUpdated}
      ; 설정 › 시작 앱 으로 올려 둔 것 (윈도우 시작 목록)
      DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCT_NAME}"
      DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${PRODUCT_NAME}"
      ${If} $dcDeleteData == ${BST_CHECKED}
        SetShellVarContext current
        RMDir /r "$APPDATA\${APP_FILENAME}"
        !ifdef INSTALL_MODE_PER_ALL_USERS
          SetShellVarContext all
        !endif
      ${EndIf}
    ${EndIf}
  !macroend
!endif

Unicode True
Name "YapCord Setup"

!ifndef OUTPUT_FILE
  !define OUTPUT_FILE "YapCord 1.0.exe"
!endif
!ifndef PAYLOAD_DIR
  !define PAYLOAD_DIR "${__FILEDIR__}/../dist/win-payload"
!endif

OutFile "${OUTPUT_FILE}"
Icon "${__FILEDIR__}/../build/yapcord.ico"
UninstallIcon "${__FILEDIR__}/../build/yapcord.ico"
InstallDir "$LOCALAPPDATA\Programs\YapCord"
RequestExecutionLevel user
ShowInstDetails hide
ShowUnInstDetails hide
SetCompressor /SOLID lzma

!include "MUI2.nsh"

!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\YapCord.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch YapCord"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  MessageBox MB_YESNO|MB_ICONQUESTION "Are you sure you want to install YapCord on this PC?" IDYES install_confirmed
  Abort
install_confirmed:
FunctionEnd

Section "Install"
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File /r "${PAYLOAD_DIR}/*"
  File "${__FILEDIR__}/../build/yapcord.ico"
  CreateDirectory "$SMPROGRAMS\YapCord"
  CreateShortcut "$SMPROGRAMS\YapCord\YapCord.lnk" "$INSTDIR\YapCord.exe" "" "$INSTDIR\yapcord.ico"
  CreateShortcut "$DESKTOP\YapCord.lnk" "$INSTDIR\YapCord.exe" "" "$INSTDIR\yapcord.ico"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YapCord" "DisplayName" "YapCord"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YapCord" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YapCord" "InstallLocation" "$INSTDIR"
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  Delete "$DESKTOP\YapCord.lnk"
  Delete "$SMPROGRAMS\YapCord\YapCord.lnk"
  RMDir "$SMPROGRAMS\YapCord"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YapCord"
  RMDir /r "$INSTDIR"
SectionEnd

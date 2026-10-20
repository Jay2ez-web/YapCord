Unicode True
Name "YapCord 1.0 Setup"

!ifndef OUTPUT_FILE
  !define OUTPUT_FILE "YapCord1.0.exe"
!endif
!ifndef PAYLOAD_DIR
  !define PAYLOAD_DIR "${__FILEDIR__}/../dist/win-payload"
!endif

OutFile "${OUTPUT_FILE}"
Icon "${__FILEDIR__}/../build/yapcord.ico"
UninstallIcon "${__FILEDIR__}/../build/yapcord.ico"
InstallDir "$LOCALAPPDATA\Programs\YapCord1.0"
RequestExecutionLevel user
ShowInstDetails hide
ShowUnInstDetails hide
SetCompressor /SOLID lzma

Var StartMenuFolder

!include "MUI2.nsh"

!define PRODUCT_NAME "YapCord 1.0"
!define PRODUCT_VERSION "1.0.8"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Welcome to YapCord 1.0"
!define MUI_WELCOMEPAGE_TEXT "This setup installs YapCord as a separate desktop app. Its settings and login data use a separate YapCord 1.0 profile. Your regular Yapper and YapCord data are not modified.$\r$\n$\r$\nClick Next to choose where to install YapCord."
!define MUI_DIRECTORYPAGE_TEXT_TOP "Choose the folder where YapCord 1.0 will be installed. This program folder is separate from your user data."
!define MUI_STARTMENUPAGE_DEFAULTFOLDER "YapCord 1.0"
!define MUI_FINISHPAGE_TITLE "YapCord 1.0 is ready"
!define MUI_FINISHPAGE_TEXT "YapCord has been installed. Your YapCord 1.0 profile remains separate from other Yapper/YapCord installations."
!define MUI_FINISHPAGE_RUN "$INSTDIR\YapCord.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch YapCord"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_STARTMENU Application $StartMenuFolder
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

VIProductVersion "1.0.8.0"
VIAddVersionKey /LANG=1033 "ProductName" "YapCord"
VIAddVersionKey /LANG=1033 "FileDescription" "YapCord 1.0 Windows Installer"
VIAddVersionKey /LANG=1033 "FileVersion" "1.0.8"
VIAddVersionKey /LANG=1033 "ProductVersion" "1.0.8"
VIAddVersionKey /LANG=1033 "LegalCopyright" "YapCord contributors"

Section "Install"
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File /r "${PAYLOAD_DIR}/*"
  File "${__FILEDIR__}/../build/yapcord.ico"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  !insertmacro MUI_STARTMENU_WRITE_BEGIN Application
    CreateDirectory "$SMPROGRAMS\$StartMenuFolder"
    CreateShortcut "$SMPROGRAMS\$StartMenuFolder\YapCord.lnk" "$INSTDIR\YapCord.exe" "" "$INSTDIR\yapcord.ico"
    CreateShortcut "$SMPROGRAMS\$StartMenuFolder\Uninstall YapCord.lnk" "$INSTDIR\Uninstall.exe"
  !insertmacro MUI_STARTMENU_WRITE_END
  CreateShortcut "$DESKTOP\YapCord 1.0.lnk" "$INSTDIR\YapCord.exe" "" "$INSTDIR\yapcord.ico"

  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YapCord1.0" "DisplayName" "YapCord 1.0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YapCord1.0" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YapCord1.0" "Publisher" "YapCord"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YapCord1.0" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YapCord1.0" "UninstallString" "$\"$INSTDIR\Uninstall.exe$\""
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YapCord1.0" "DisplayIcon" "$INSTDIR\YapCord.exe"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YapCord1.0" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YapCord1.0" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  Delete "$DESKTOP\YapCord 1.0.lnk"
  !insertmacro MUI_STARTMENU_GETFOLDER Application $StartMenuFolder
  Delete "$SMPROGRAMS\$StartMenuFolder\YapCord.lnk"
  Delete "$SMPROGRAMS\$StartMenuFolder\Uninstall YapCord.lnk"
  RMDir "$SMPROGRAMS\$StartMenuFolder"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YapCord1.0"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir /r "$INSTDIR"
SectionEnd

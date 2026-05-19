@echo off
setlocal EnableDelayedExpansion
title  Restaurant Data Explorer
mode con: cols=72 lines=20

reg add HKCU\Console /v VirtualTerminalLevel /t REG_DWORD /d 1 /f >nul 2>&1
for /f %%E in ('echo prompt $E^| cmd') do set "E=%%E"

set "R=%E%[0m"  & set "B=%E%[1m"  & set "D=%E%[2m"
set "CYN=%E%[96m" & set "GRN=%E%[92m" & set "RED=%E%[91m"

cls
echo.
echo %CYN%%B%  ╔════════════════════════════════════════════════════════════╗%R%
echo %CYN%%B%  ║                                                            ║%R%
echo %CYN%%B%  ║     oo  Restaurant Data Explorer                          ║%R%
echo %CYN%%B%  ║                                                            ║%R%
echo %CYN%%B%  ╚════════════════════════════════════════════════════════════╝%R%
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo %RED%  ✗  Python not found. Run setup.bat first.%R%
    echo.
    pause & exit /b 1
)

streamlit --version >nul 2>&1
if errorlevel 1 (
    echo %RED%  ✗  Streamlit not installed. Run setup.bat first.%R%
    echo.
    pause & exit /b 1
)

echo %GRN%  Launching ...  (press Ctrl+C to stop)%R%
echo.
echo %D%  ────────────────────────────────────────────────────────────%R%
echo.

streamlit run explore.py

@echo off
setlocal EnableDelayedExpansion
title  Restaurant Data Explorer  —  Setup
mode con: cols=72 lines=42

:: ─── Enable ANSI / VT100 (Windows 10+) ───────────────────────────────────
reg add HKCU\Console /v VirtualTerminalLevel /t REG_DWORD /d 1 /f >nul 2>&1
for /f %%E in ('echo prompt $E^| cmd') do set "E=%%E"

set "R=%E%[0m"    & set "B=%E%[1m"   & set "D=%E%[2m"
set "CYN=%E%[96m" & set "GRN=%E%[92m" & set "YLW=%E%[93m"
set "RED=%E%[91m" & set "MGN=%E%[95m" & set "BLU=%E%[94m"
set "WHT=%E%[97m"

:: ─── Header ───────────────────────────────────────────────────────────────
cls
echo.
echo %CYN%%B%  ╔════════════════════════════════════════════════════════════╗%R%
echo %CYN%%B%  ║                                                            ║%R%
echo %CYN%%B%  ║     oo  Restaurant Data Explorer                          ║%R%
echo %CYN%%B%  ║              First-Time Setup                              ║%R%
echo %CYN%%B%  ║                                                            ║%R%
echo %CYN%%B%  ╚════════════════════════════════════════════════════════════╝%R%
echo.
echo %D%  Installs dependencies  •  downloads dataset  •  launches app%R%
echo.
echo %D%  ────────────────────────────────────────────────────────────%R%
echo.

:: ─── STEP 1 — Python check ────────────────────────────────────────────────
echo %YLW%  [1/4]  Checking Python ...%R%
python --version >nul 2>&1
if errorlevel 1 (
    echo %RED%  ✗  Python not found%R%
    echo.
    echo %YLW%  Fix: install Python 3.8+ from  https://www.python.org/downloads/%R%
    echo.
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('python --version 2^>^&1') do set "PYVER=%%v"
echo %GRN%  ✔  %PYVER% detected%R%
echo.

:: ─── STEP 2 — Upgrade pip ─────────────────────────────────────────────────
echo %YLW%  [2/4]  Upgrading pip ...%R%
python -m pip install --upgrade pip --quiet >nul 2>&1
echo %GRN%  ✔  pip is up to date%R%
echo.

:: ─── STEP 3 — Install packages ────────────────────────────────────────────
echo %YLW%  [3/4]  Installing Python packages ...%R%
echo.
echo %D%  ┌────────────────────────────────────────────────────────┐%R%
echo %D%  │  pip output                                            │%R%
echo %D%  └────────────────────────────────────────────────────────┘%R%
echo.

pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo %RED%  ✗  requirements.txt installation failed%R%
    pause & exit /b 1
)

pip install kaggle --quiet
if errorlevel 1 (
    echo.
    echo %RED%  ✗  kaggle package installation failed%R%
    pause & exit /b 1
)

echo.
echo %D%  ────────────────────────────────────────────────────────────%R%
echo %GRN%  ✔  streamlit  pandas  plotly  kaggle — all ready%R%
echo.

:: ─── STEP 4 — Kaggle dataset ──────────────────────────────────────────────
echo %YLW%  [4/4]  Downloading dataset from Kaggle ...%R%
echo.

:: Load credentials from .env
if not exist ".env" (
    echo %RED%  ✗  .env file not found in project directory%R%
    pause & exit /b 1
)
for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    if "%%A"=="KG_USER" set "KG_USER=%%B"
    if "%%A"=="KG_KEY"  set "KG_KEY=%%B"
)
if not defined KG_USER (
    echo %RED%  ✗  KG_USER not found in .env%R%
    pause & exit /b 1
)
if not defined KG_KEY (
    echo %RED%  ✗  KG_KEY not found in .env%R%
    pause & exit /b 1
)

if not exist "%USERPROFILE%\.kaggle" mkdir "%USERPROFILE%\.kaggle"
(echo {"username":"!KG_USER!","key":"!KG_KEY!"}) > "%USERPROFILE%\.kaggle\kaggle.json"
echo %GRN%  ✔  Credentials loaded from .env%R%
echo.

if not exist "Database" mkdir "Database"

echo %D%  Dataset : hashaam101/restaurants-in-us-almost-no-food-chain%R%
echo %D%  Target  : Database\%R%
echo.

:: Animated spinner while kaggle downloads in background
set "OUTFILE=%TEMP%\_rde_kaggle_out.txt"
if exist "%OUTFILE%" del "%OUTFILE%"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$frames = @('|','/','-','\'); $i = 0;" ^
  "$psi = New-Object System.Diagnostics.ProcessStartInfo;" ^
  "$psi.FileName = 'kaggle';" ^
  "$psi.Arguments = 'datasets download hashaam101/restaurants-in-us-almost-no-food-chain --path Database --unzip';" ^
  "$psi.UseShellExecute = $false;" ^
  "$psi.RedirectStandardOutput = $true;" ^
  "$psi.RedirectStandardError = $true;" ^
  "$p = [System.Diagnostics.Process]::Start($psi);" ^
  "while (!$p.HasExited) {" ^
  "  $f = $frames[$i %% 4];" ^
  "  Write-Host (\"`r  [\"+$f+\"]  Downloading ... (this may take a few minutes)\") -NoNewline -ForegroundColor DarkCyan;" ^
  "  Start-Sleep -Milliseconds 120; $i++" ^
  "};" ^
  "$out = $p.StandardOutput.ReadToEnd();" ^
  "$err = $p.StandardError.ReadToEnd();" ^
  "if ($out) { Write-Host '' ; Write-Host $out };" ^
  "if ($err) { Write-Host $err -ForegroundColor DarkYellow };" ^
  "exit $p.ExitCode"

if errorlevel 1 (
    echo.
    echo %RED%  ✗  Dataset download failed — check credentials and internet connection%R%
    echo.
    echo %D%  Tip: run  kaggle datasets download hashaam101/restaurants-in-us-almost-no-food-chain%R%
    echo %D%       manually to see the full error.%R%
    pause & exit /b 1
)

echo.
echo %GRN%  ✔  Dataset downloaded to  Database\%R%
echo.

:: ─── Launch ───────────────────────────────────────────────────────────────
echo %D%  ────────────────────────────────────────────────────────────%R%
echo.
echo %CYN%%B%  Setup complete!  Launching Restaurant Data Explorer ...%R%
echo.
echo %D%  The app will open in your browser automatically.%R%
echo %D%  Press  Ctrl+C  in this window to stop the server.%R%
echo.
echo %D%  ────────────────────────────────────────────────────────────%R%
echo.
timeout /t 2 /nobreak >nul

streamlit run explore.py

@echo off
title LocalLLM Launcher
color 0A
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║            LocalLLM — Starting            ║
echo  ╚══════════════════════════════════════════╝
echo.

:: ─── Paths ─────────────────────────────────────────────────────────────────

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "VENV=%BACKEND%\venv"
set "BACKEND_PORT=8000"
set "FRONTEND_PORT=1420"

:: ─── Prepend CUDA DLL dirs to PATH so llama.dll can find cudart/cublas ──────
:: This runs BEFORE Python starts so the Windows DLL loader can find them.

set "NVIDIA_BASE=%VENV%\Lib\site-packages\nvidia"
if exist "%NVIDIA_BASE%\cuda_runtime\bin"  set "PATH=%NVIDIA_BASE%\cuda_runtime\bin;%PATH%"
if exist "%NVIDIA_BASE%\cublas\bin"         set "PATH=%NVIDIA_BASE%\cublas\bin;%PATH%"
if exist "%NVIDIA_BASE%\cuda_nvrtc\bin"     set "PATH=%NVIDIA_BASE%\cuda_nvrtc\bin;%PATH%"
if exist "%VENV%\Lib\site-packages\llama_cpp\lib" set "PATH=%VENV%\Lib\site-packages\llama_cpp\lib;%PATH%"

:: ─── Kill any previous instances ────────────────────────────────────────────

echo  Cleaning up old processes...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%BACKEND_PORT% " 2^>nul') do (
    taskkill /f /pid %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%FRONTEND_PORT% " 2^>nul') do (
    taskkill /f /pid %%a >nul 2>&1
)

:: ─── Start Python backend ───────────────────────────────────────────────────

echo  [1/2] Starting Python backend on port %BACKEND_PORT%...
start "LocalLLM Backend" /min cmd /k ^
    "cd /d "%BACKEND%" && call venv\Scripts\activate.bat && python -m uvicorn main:app --host 127.0.0.1 --port %BACKEND_PORT% --log-level info"

:: Wait for backend to start
echo  Waiting for backend to initialize...
timeout /t 4 /nobreak > nul

:: Verify backend is up
curl -s -o nul -w "%%{http_code}" http://127.0.0.1:%BACKEND_PORT%/status 2>nul | findstr "200" > nul
if errorlevel 1 (
    echo  WARNING: Backend may not be ready yet — continuing anyway.
) else (
    echo  Backend is online!
)

:: ─── Start Tauri dev ─────────────────────────────────────────────────────────

echo.
echo  [2/2] Starting Tauri app (compiling Rust on first run — please wait)...
echo.

cd /d "%ROOT%"
npm run tauri dev

:: If tauri dev exits, also kill backend
echo.
echo  Tauri exited. Shutting down backend...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%BACKEND_PORT% " 2^>nul') do (
    taskkill /f /pid %%a >nul 2>&1
)
echo  Done.

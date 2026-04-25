@echo off
title LocalLLM — Setup
color 0A
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║          LocalLLM — First-Time Setup     ║
echo  ╚══════════════════════════════════════════╝
echo.
echo  This will install all Python and Node dependencies.
echo  Make sure you have:
echo    [1] Python 3.10+ in PATH
echo    [2] Node.js 18+ in PATH
echo    [3] Rust toolchain (rustup)
echo    [4] CUDA Toolkit 12.x installed
echo.
pause

:: ─── Python backend ────────────────────────────────────────────────────────

echo.
echo [1/4] Setting up Python 3.11 Virtual Environment and dependencies...
cd /d "%~dp0backend"
if not exist "venv" (
    echo Creating Python 3.11 venv...
    py -3.11 -m venv venv
    if errorlevel 1 ( echo ERROR: Failed to create venv with Python 3.11 & pause & exit /b 1 )
)

call venv\Scripts\activate.bat
pip install -r requirements.txt
pip install nvidia-cuda-runtime-cu12 nvidia-cublas-cu12
if errorlevel 1 ( echo  ERROR: pip install failed & pause & exit /b 1 )

:: ─── llama-cpp-python CUDA wheel ───────────────────────────────────────────
:: Change cu121 → cu122 or cu124 if your CUDA version differs

echo.
echo [2/4] Installing llama-cpp-python with CUDA (cu124, 0.3.4)...
echo  (This may take a few minutes — downloading a ~400MB wheel)
pip install llama-cpp-python==0.3.4 --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu124/ --force-reinstall --no-cache-dir
if errorlevel 1 (
    echo  WARNING: CUDA wheel failed. Trying CPU-only fallback...
    pip install llama-cpp-python==0.3.4 --force-reinstall --no-cache-dir
)

:: Copy CUDA DLLs into llama_cpp\lib so Windows DLL loader finds them
echo  Copying CUDA runtime DLLs into llama_cpp\lib...
set "SP=%~dp0backend\venv\Lib\site-packages"
if exist "%SP%\nvidia\cuda_runtime\bin" xcopy /Y /Q "%SP%\nvidia\cuda_runtime\bin\*.dll" "%SP%\llama_cpp\lib\"
if exist "%SP%\nvidia\cublas\bin"       xcopy /Y /Q "%SP%\nvidia\cublas\bin\*.dll"       "%SP%\llama_cpp\lib\"
if exist "%SP%\nvidia\cuda_nvrtc\bin"   xcopy /Y /Q "%SP%\nvidia\cuda_nvrtc\bin\*.dll"   "%SP%\llama_cpp\lib\"

:: ─── Node / npm ─────────────────────────────────────────────────────────────

echo.
echo [3/4] Installing Node dependencies...
cd /d "%~dp0"
npm install
if errorlevel 1 ( echo  ERROR: npm install failed & pause & exit /b 1 )

:: ─── Tauri Rust build ───────────────────────────────────────────────────────

echo.
echo [4/4] Building Tauri (first build compiles Rust — ~5-10 min)...
echo  You can skip this and use 'npm run tauri dev' instead.
echo.
set /p BUILD_TAURI="Build production .exe now? (y/N): "
if /i "%BUILD_TAURI%"=="y" (
    npm run tauri build
    if errorlevel 1 ( echo  Tauri build failed — check Rust toolchain & pause )
    else ( echo  Build complete! Find .exe in src-tauri\target\release\ )
)

echo.
echo  ✓ Setup complete!
echo  Run 'start.bat' to launch LocalLLM.
echo.
pause

@echo off
echo ==========================================
echo   Pulnazorat - Local Launcher
echo ==========================================

cd /d "%~dp0"

if not exist node_modules (
    echo Installing dependencies...
    call npm install
)

echo.
echo Building Frontend...
call npm run build

echo.
echo ==========================================
echo   Starting Server...
echo   Open http://localhost:3000 in your browser
echo ==========================================
call npm start

pause

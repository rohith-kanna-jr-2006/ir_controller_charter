@echo off
REM Backend startup script for Indian Railways Controller (Windows)

echo Starting MongoDB Backend Server...
echo ====================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if errorlevel 1 (
    echo Error: Node.js is not installed or not in PATH
    echo Install Node.js from: https://nodejs.org/
    pause
    exit /b 1
)

echo Starting server...
call npm run server:dev
pause

@echo off
title Surya PM Portal V2.0 Launcher
echo ====================================================================
echo   Surya PM Portal & Operating System - V2.0 Platform Foundation
echo ====================================================================
echo Checking local environment...

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH. Please install Node.js 18+.
    pause
    exit /b 1
)

echo Starting V2.0 Express Backend and Vite Frontend Server...
echo Portal URL: http://localhost:3000/PM-Portal/index.html
echo API URL:    http://localhost:3000/api/v1/health
echo.

start "" "http://localhost:3000/PM-Portal/index.html"
npm run dev

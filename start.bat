@echo off
title ShopAgent Launcher
echo ========================================================
echo          Starting ShopAgent (Backend + Frontend)
echo ========================================================
echo.

cd /d "%~dp0"

REM Check if frontend dependencies exist, install if missing
if not exist "web\node_modules\" (
    echo [Setup] Installing frontend dependencies first...
    cd web
    call npm install
    cd ..
)

echo [1/2] Launching Backend API on http://localhost:8000 ...
start "ShopAgent Backend (Port 8000)" cmd /k "cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

echo [2/2] Launching Web Application on http://localhost:3000 ...
start "ShopAgent Frontend (Port 3000)" cmd /k "cd web && npm run dev"

echo.
echo ========================================================
echo   ShopAgent is starting!
echo   - Web UI:      http://localhost:3000
echo   - Backend API: http://localhost:8000
echo   - API Docs:    http://localhost:8000/docs
echo ========================================================
echo.
pause

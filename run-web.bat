@echo off
title ShopAgent Web
cd /d "%~dp0\web"

if not exist "node_modules\" (
    echo [Setup] Installing frontend dependencies...
    call npm install
)

echo Starting ShopAgent Next.js Frontend on http://localhost:3000 ...
npm run dev
pause

@echo off
title ShopAgent Web
cd /d "%~dp0\web"
echo Starting ShopAgent Next.js Frontend on http://localhost:3000 ...
npm run dev
pause

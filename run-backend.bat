@echo off
title ShopAgent Backend
cd /d "%~dp0\backend"
echo Starting ShopAgent Backend API on http://localhost:8000 ...
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
pause

@echo off
cd /d "%~dp0"
echo ========================================================
echo Starting MinerU Web Studio...
echo Opening browser at http://127.0.0.1:8000
echo ========================================================
start http://127.0.0.1:8000
if exist .venv\Scripts\python.exe (
    .venv\Scripts\python.exe run_web_app.py
) else (
    python run_web_app.py
)
pause

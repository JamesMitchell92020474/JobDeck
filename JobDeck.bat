@echo off
echo Starting PowerShell...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0JobDeck.ps1"
echo.
echo PowerShell exited with code: %errorlevel%
pause

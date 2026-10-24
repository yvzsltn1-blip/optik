@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title Optik Okuyucu - GitHub yedek

echo.
echo Optik Okuyucu - GitHub yedek
echo Klasor: %CD%
echo.

where git >nul 2>&1
if errorlevel 1 goto git_yok

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 goto depo_degil

echo Degisiklikler hazirlaniyor...
git add -A
if errorlevel 1 goto hata

git diff --cached --quiet
if errorlevel 1 goto commit
echo Kaydedilecek yeni degisiklik yok.
goto gonder

:commit
for /f "delims=" %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm"') do set "DAMGA=%%I"
echo Kayit: Yedek %DAMGA%
git commit -m "Yedek %DAMGA%"
if errorlevel 1 goto hata

:gonder
echo.
echo GitHub ile esitleniyor...
git pull --rebase origin main
if errorlevel 1 goto hata
git push origin main
if errorlevel 1 goto hata

echo.
echo Yedek tamam.
echo https://github.com/yvzsltn1-blip/optik
goto bitir

:git_yok
echo HATA: Git bulunamadi. Git for Windows kurulu olmali.
goto bitir

:depo_degil
echo HATA: Bu klasor bir Git deposu degil.
goto bitir

:hata
echo.
echo HATA: Yedek tamamlanamadi. Yukaridaki Git mesajina bakin.
goto bitir

:bitir
echo.
pause
endlocal

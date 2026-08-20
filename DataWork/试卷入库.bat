@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion
:: ==========================================
:: 试卷入库脚本（Windows CMD / 双击运行）
:: ==========================================
:: 用法: 双击运行 或 试卷入库.bat [学科]

set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%.."
set "BACKEND=%PROJECT_ROOT%\backend"

where node >nul 2>&1 || (echo 未找到 Node.js & pause & exit /b 1)

set "PROGRESS_DIR=%SCRIPT_DIR%OutputData"
set "PAPER_ROOT=%SCRIPT_DIR%SourceData"

set "SUBJECT=%~1"
if "%SUBJECT%"=="" (
    echo 用法: 试卷入库.bat [学科]
    echo 示例: 试卷入库.bat 数学
    echo.
    echo 自动发现学科...
    cd /d "%BACKEND%"
    node scripts/import-papers-to-db.mjs --progress-dir "%PROGRESS_DIR%" --paper-root "%PAPER_ROOT%"
) else (
    echo ========================================
    echo 入库: %SUBJECT%
    echo ========================================
    cd /d "%BACKEND%"
    node scripts/import-papers-to-db.mjs --subjects "%SUBJECT%" --progress-dir "%PROGRESS_DIR%" --paper-root "%PAPER_ROOT%"
)
echo.
pause

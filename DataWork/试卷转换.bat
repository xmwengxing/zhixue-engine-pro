@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion
:: ==========================================
:: 试卷转换脚本（Windows CMD / 双击运行）
:: ==========================================
:: 用法: 双击运行 或 试卷转换.bat [学科]

set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%.."
set "BACKEND=%PROJECT_ROOT%\backend"

:: 加载 .env
if exist "%SCRIPT_DIR%.env" (
    for /f "usebackq tokens=1,* delims==" %%a in ("%SCRIPT_DIR%.env") do (
        set "%%a=%%b"
    )
)

:: API Key
if not defined PADDLE_API_KEY (
    echo.
    echo 飞桨 PaddleOCR API Key 未配置
    echo    获取: https://paddleocr.aistudio.com.cn/
    echo    日额度: 20000 页
    echo.
    set /p "KEY=    请输入 API Key（留空跳过）: "
    if defined KEY (
        echo PADDLE_API_KEY=!KEY!> "%SCRIPT_DIR%.env"
        set "PADDLE_API_KEY=!KEY!"
    )
)

:: 路径
set "PAPER_ROOT=%SCRIPT_DIR%SourceData"
set "OUT_DIR=%SCRIPT_DIR%OutputData"

where node >nul 2>&1 || (echo 未找到 Node.js & pause & exit /b 1)

set "SUBJECT=%~1"
if "%SUBJECT%"=="" (
    echo 用法: 试卷转换.bat [学科]
    echo 示例: 试卷转换.bat 数学
    echo.
    echo 自动扫描 SourceData...
    for /d %%D in ("%PAPER_ROOT%\*") do (
        set "SUBJ=%%~nxD"
        echo ========================================
        echo 转换: !SUBJ!
        echo ========================================
        cd /d "%BACKEND%"
        node scripts/convert-papers-batch.mjs --dir "%PAPER_ROOT%" --subject "!SUBJ!" --out "%OUT_DIR%" --progress "%OUT_DIR%\progress-!SUBJ!.json" --limit 99999
    )
    echo.
    echo 转换完成！产物: %OUT_DIR%
) else (
    echo ========================================
    echo 转换: %SUBJECT%
    echo ========================================
    cd /d "%BACKEND%"
    node scripts/convert-papers-batch.mjs --dir "%PAPER_ROOT%" --subject "%SUBJECT%" --out "%OUT_DIR%" --progress "%OUT_DIR%\progress-%SUBJECT%.json" --limit 99999
)
echo.
pause

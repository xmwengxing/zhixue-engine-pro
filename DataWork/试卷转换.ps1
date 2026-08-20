# ==========================================
# 试卷转换脚本（Windows PowerShell / pwsh）
# ==========================================
# 用法: .\试卷转换.ps1 [学科] [选项]
# 示例:
#   .\试卷转换.ps1 数学
#   .\试卷转换.ps1 历史 -Limit 10
#   .\试卷转换.ps1 -All

param(
    [string]$Subject = '',
    [switch]$All,
    [int]$Limit = 99999,
    [switch]$RetryErrors,
    [switch]$OcrOnly,
    [switch]$Help
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$Backend = Join-Path $ProjectRoot "backend"

if ($Help) {
    Write-Host "用法: .\试卷转换.ps1 [学科] [选项]"
    Write-Host "  -All             转换全部学科"
    Write-Host "  -Limit <N>       最大文件数（默认99999）"
    Write-Host "  -RetryErrors     重试失败文件"
    Write-Host "  -OcrOnly         只处理扫描件"
    exit 0
}

# ---------- 加载环境变量 ----------
$EnvFile = Join-Path $ScriptDir ".env"
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | Where-Object { $_ -match '^[^#][^=]+=.+' } | ForEach-Object {
        $k, $v = $_ -split '=', 2
        [Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim(), "Process")
    }
}

# ---------- API Key 管理 ----------
if (-not $env:PADDLE_API_KEY) {
    Write-Host "`n🔑 飞桨 PaddleOCR API Key 未配置" -ForegroundColor Yellow
    Write-Host "   获取地址: https://paddleocr.aistudio.com.cn/"
    Write-Host "   日额度: 20000 页（推荐使用）`n"
    $Key = Read-Host "   请输入 API Key（留空跳过）"
    if ($Key) {
        "PADDLE_API_KEY=$Key" | Out-File -FilePath $EnvFile -Encoding utf8
        Write-Host "   ✅ 已保存到 .env`n" -ForegroundColor Green
        $env:PADDLE_API_KEY = $Key
    } else {
        Write-Host "   ⚠️  跳过`n" -ForegroundColor DarkYellow
    }
}

# ---------- 前置检查 ----------
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ 未找到 Node.js" -ForegroundColor Red; exit 1
}

# ---------- 路径 ----------
$PaperRoot = Join-Path $ScriptDir "SourceData"
$OutDir = Join-Path $ScriptDir "OutputData"
$env:PAPER_ROOT = $PaperRoot
$env:OUT_DIR = $OutDir
$env:OCR_USAGE = Join-Path $OutDir "ocr-usage.json"

# ---------- 学科列表 ----------
$Subjects = @()
if ($All -or (-not $Subject)) {
    if (-not (Test-Path $PaperRoot)) {
        Write-Host "❌ 源数据目录不存在: $PaperRoot" -ForegroundColor Red
        Write-Host "   请将试卷文件放入 SourceData/ 下按学科建子目录"
        exit 1
    }
    $Subjects = Get-ChildItem $PaperRoot -Directory | ForEach-Object { $_.Name }
    if ($Subjects.Count -eq 0) { Write-Host "❌ SourceData 下未找到学科文件夹"; exit 1 }
    Write-Host "📚 发现学科: $($Subjects -join ', ')"
} else {
    $Subjects = @($Subject)
}

# ---------- 执行转换 ----------
Set-Location $Backend
$TotalOk = 0; $TotalQ = 0

foreach ($Subj in $Subjects) {
    Write-Host "`n══════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "📄 开始转换: $Subj" -ForegroundColor Cyan
    Write-Host "══════════════════════════════════════" -ForegroundColor Cyan

    $Args = @("scripts/convert-papers-batch.mjs",
        "--dir", $PaperRoot, "--subject", $Subj,
        "--out", $OutDir, "--progress", (Join-Path $OutDir "progress-$Subj.json"),
        "--limit", $Limit.ToString())
    if ($RetryErrors) { $Args += "--retry-errors" }
    if ($OcrOnly) { $Args += "--ocr-only" }
    node @Args

    if ($Subj -match '数学|物理|化学|生物') {
        if ($env:PADDLE_API_KEY) {
            Write-Host "🔬 公式 OCR: $Subj" -ForegroundColor Magenta
            node scripts/ocr-formulas.mjs --subject $Subj --progress-dir $OutDir --paper-root $PaperRoot --ocr-usage "$OutDir/ocr-usage.json"
        } else {
            Write-Host "⚠️  跳过公式 OCR（未配置 API Key）" -ForegroundColor Yellow
        }
    }

    $PF = Join-Path $OutDir "progress-$Subj.json"
    if (Test-Path $PF) {
        $Prog = Get-Content $PF -Raw | ConvertFrom-Json
        $Props = $Prog.PSObject.Properties | Where-Object { $_.Value.parseStatus -eq 'ok' }
        $Ok = $Props.Count
        $Q = if ($Props) { ($Props | ForEach-Object { $_.Value.questionCount } | Measure-Object -Sum).Sum } else { 0 }
        Write-Host "✅ $Subj: $Ok 文件, $Q 题" -ForegroundColor Green
        $TotalOk += $Ok; $TotalQ += $Q
    }
}

Write-Host "`n══════════════════════════════════════" -ForegroundColor Green
Write-Host "🎉 转换完成 | 文件: $TotalOk | 题数: $TotalQ" -ForegroundColor Green
Write-Host "   产物目录: $OutDir`n"

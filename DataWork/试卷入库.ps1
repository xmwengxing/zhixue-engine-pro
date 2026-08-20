# ==========================================
# 试卷入库脚本（Windows PowerShell / pwsh）
# ==========================================
# 用法: .\试卷入库.ps1 [学科] [选项]
# 示例:
#   .\试卷入库.ps1 数学
#   .\试卷入库.ps1 -All
#   .\试卷入库.ps1 --dry

param(
    [string]$Subject = '',
    [switch]$All,
    [switch]$Dry,
    [switch]$Help
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$Backend = Join-Path $ProjectRoot "backend"

if ($Help) {
    Write-Host "用法: .\试卷入库.ps1 [学科] [选项]"
    Write-Host "  -All    入库全部学科"
    Write-Host "  -Dry    只检查不写库"
    exit 0
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ 未找到 Node.js" -ForegroundColor Red; exit 1
}

# ---------- 路径 ----------
$ProgressDir = Join-Path $ScriptDir "OutputData"
$PaperRoot = Join-Path $ScriptDir "SourceData"

# ---------- 学科列表 ----------
$Subjects = @()
if ($All -or (-not $Subject)) {
    if (-not (Test-Path $ProgressDir)) {
        Write-Host "❌ 产物目录不存在，请先运行试卷转换"; exit 1
    }
    $Subjects = Get-ChildItem $ProgressDir -Filter "progress-*.json" |
        Where-Object { $_.Name -notmatch 'progress-(import|formula)' } |
        ForEach-Object { $_.Name -replace '^progress-|\.json$', '' }
    if ($Subjects.Count -eq 0) { Write-Host "❌ 未找到转换产物"; exit 1 }
    Write-Host "📚 发现学科: $($Subjects -join ', ')"
} else {
    $Subjects = @($Subject)
}

# ---------- 检查产物 ----------
foreach ($Subj in $Subjects) {
    $PF = Join-Path $ProgressDir "progress-$Subj.json"
    if (-not (Test-Path $PF)) {
        Write-Host "⚠️  未找到: $PF（跳过）" -ForegroundColor Yellow; continue
    }
    $Prog = Get-Content $PF -Raw | ConvertFrom-Json
    $Props = $Prog.PSObject.Properties | Where-Object { $_.Value.parseStatus -eq 'ok' }
    $Ok = $Props.Count
    $Q = if ($Props) { ($Props | ForEach-Object { $_.Value.questionCount } | Measure-Object -Sum).Sum } else { 0 }
    Write-Host "  $Subj: $Ok 文件, $Q 题"
}

# ---------- 执行入库 ----------
Set-Location $Backend
$SubjectsStr = $Subjects -join ','
$DryArg = if ($Dry) { '--dry' } else { '' }

Write-Host "`n📥 开始入库..."
node scripts/import-papers-to-db.mjs --subjects $SubjectsStr --progress-dir $ProgressDir --paper-root $PaperRoot $DryArg
Write-Host "`n🎉 入库完成" -ForegroundColor Green

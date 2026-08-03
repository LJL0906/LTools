# ============================================================================
# LTools 一键发布脚本
#
# 用法:
#   powershell -ExecutionPolicy Bypass -File release.ps1 0.1.2
#   powershell -ExecutionPolicy Bypass -File release.ps1 0.1.2 -DryRun
#
# 前置条件:
#   1. gh CLI 已安装并登录: gh auth login
#   2. git 工作区干净（有未提交改动会中止）
#
# 流程:
#   [1] 校验版本号并更新 tauri.conf.json + package.json
#   [2] git 提交版本号改动并推送 main
#   [3] 检查 tag 冲突，打 tag 并推送（触发 Actions）
#   [4] 等待 GitHub Actions 构建完成（成功才继续）
#   [5] 把 Actions 生成的 Draft Release 发布（draft=false）
#   [6] 验证 latest.json 与 Release 资产
# ============================================================================

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Version,

    [switch]$DryRun,
    [switch]$SkipPush,   # 已推送过 tag，只做等待+发布（调试用）
    [switch]$Force       # 跳过 git 工作区干净检查
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RootDir

# gh 的 PATH 修复（winget 安装后可能不在当前会话 PATH）
$ghCandidates = @("$env:ProgramFiles\GitHub CLI\gh.exe", "$env:LOCALAPPDATA\Programs\GitHub CLI\gh.exe")
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    foreach ($c in $ghCandidates) { if (Test-Path $c) { $env:PATH = "$(Split-Path $c);$env:PATH"; break } }
}

function Step([string]$msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Ok([string]$msg) { Write-Host "  OK: $msg" -ForegroundColor Green }
function Fail([string]$msg) { Write-Host "  失败: $msg" -ForegroundColor Red; exit 1 }
function Guard([scriptblock]$sb, [string]$err) {
    & $sb | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail $err }
}
function RunOrDry([string]$desc, [scriptblock]$sb) {
    if ($DryRun) { Write-Host "  [dry-run] $desc" -ForegroundColor Yellow }
    else { Write-Host "  -> $desc"; & $sb; if ($LASTEXITCODE -ne 0) { Fail $desc } }
}

# ---------------------------------------------------------------- 前置检查
Step "[0] 环境与参数检查"

if ($Version -notmatch '^\d+\.\d+\.\d+$') { Fail "版本号格式应为 x.y.z，收到: $Version" }

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { Fail "未找到 gh CLI，请先安装: winget install GitHub.cli，然后 gh auth login" }

# GH_TOKEN 无效会导致 gh 一直失败，检测并临时清掉（仅本进程生效）
if ($env:GH_TOKEN) {
    $env:GH_TOKEN = $null
    Write-Host "  已临时忽略 GH_TOKEN 环境变量（gh 优先使用它，若有残留 token 建议在系统环境变量中删除）" -ForegroundColor DarkYellow
}

gh auth status 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "gh 未登录，请先运行: gh auth login" }
Ok "gh 已登录"

# 新版本必须高于已正式发布的最新版本（防止误打旧 tag）
$latestTag = gh release list --exclude-drafts --limit 1 --json tagName --jq '.[0].tagName' 2>$null
if ($LASTEXITCODE -eq 0 -and $latestTag) {
    $latestVer = $latestTag.TrimStart('v')
    if ($latestVer -match '^\d+\.\d+\.\d+$' -and [version]$Version -le [version]$latestVer) {
        Fail "新版本 $Version 不高于已发布的 $latestTag，请换版本号"
    }
    Write-Host "  已发布最新: $latestTag"
}

if (-not $Force) {
    $dirty = git status --porcelain
    if ($LASTEXITCODE -ne 0) { Fail "git status 执行失败" }
    if ($dirty) {
        Write-Host "  未提交的改动如下（如需忽略请加 -Force 参数）:" -ForegroundColor DarkYellow
        $dirty | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkYellow }
        Fail "工作区不干净，请先提交或 stash"
    }
}
Ok "git 工作区干净"

# ---------------------------------------------------------------- [1] 版本号
Step "[1] 更新版本号 -> $Version"

$tauriCfg = Join-Path $RootDir "src-tauri\tauri.conf.json"
$pkgJson  = Join-Path $RootDir "package.json"
foreach ($f in @($tauriCfg, $pkgJson)) { if (-not (Test-Path $f)) { Fail "缺少文件: $f" } }

$tauriText = Get-Content $tauriCfg -Raw
$pkgText   = Get-Content $pkgJson -Raw
if ($tauriText -notmatch '"version"\s*:\s*"[\d.]+"') { Fail "tauri.conf.json 中未找到 version 字段" }
if ($pkgText   -notmatch '"version"\s*:\s*"[\d.]+"') { Fail "package.json 中未找到 version 字段" }
$tauriOld = $Matches[0]
if ($pkgText -match '"version"\s*:\s*"([\d.]+)"') { $pkgOld = $Matches[1] }

$newTauriText = $tauriText -replace '"version"\s*:\s*"[\d.]+"', ('"version": "' + $Version + '"')
$newPkgText   = $pkgText   -replace '"version"\s*:\s*"[\d.]+"', ('"version": "' + $Version + '"')

# 防止 -replace 意外改掉其他字段（tauri.conf.json 里 version 只有顶层一处，已正则校验）
# 注意：必须用无 BOM 的 UTF-8 写入，否则 node/serde_json 解析 JSON 会失败
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
RunOrDry "写入 $tauriCfg"   { [System.IO.File]::WriteAllText($tauriCfg, $newTauriText, $utf8NoBom) }
RunOrDry "写入 $pkgJson"    { [System.IO.File]::WriteAllText($pkgJson, $newPkgText, $utf8NoBom) }
Write-Host "  版本号: tauri.conf.json $tauriOld -> $Version; package.json $pkgOld -> $Version"

# ---------------------------------------------------------------- [2] 提交推送
Step "[2] 提交版本号改动并推送 main"

RunOrDry "git add $tauriCfg $pkgJson" {
    git add "$tauriCfg" "$pkgJson"
}
RunOrDry "git commit -m release: v$Version" {
    git commit -m "release: v$Version"
}
if (-not $DryRun) {
    git push origin main
    if ($LASTEXITCODE -ne 0) { Fail "推送 main 失败（网络/凭据问题？）" }
    Ok "main 已推送"
}

# ---------------------------------------------------------------- [3] tag
Step "[3] 打 tag v$Version 并推送"

if (-not $SkipPush) {
    $remoteTag = git ls-remote --tags origin "refs/tags/v$Version"
    if ($LASTEXITCODE -eq 0 -and $remoteTag) { Fail "远端已存在 tag v$Version，请换版本号" }
    $localTag = git tag -l "v$Version"
    if ($localTag) { Fail "本地已存在 tag v$Version，请换版本号" }
}
RunOrDry "git tag v$Version" { git tag "v$Version" }
if (-not $DryRun -and -not $SkipPush) {
    git push origin "v$Version"
    if ($LASTEXITCODE -ne 0) { Fail "推送 tag 失败" }
    Ok "tag 已推送，Actions 已触发"
}

if ($DryRun) { Write-Host "`n[dry-run] 演练完成，未做任何实际改动。" -ForegroundColor Yellow; exit 0 }

# ---------------------------------------------------------------- [4] 等待 Actions
Step "[4] 等待 Actions 构建完成（最长 30 分钟）"

$headSha = (git rev-parse HEAD).Trim()
$runId = $null
$deadline = (Get-Date).AddMinutes(30)

# 等待 workflow run 出现（推送后有几秒延迟）
while (-not $runId -and (Get-Date) -lt $deadline) {
    $runs = gh run list --workflow release.yml --limit 1 --json databaseId,status,headSha 2>$null
    if ($LASTEXITCODE -eq 0 -and $runs) {
        $run = $runs | ConvertFrom-Json | Select-Object -First 1
        if ($run -and $run.headSha -eq $headSha) { $runId = $run.databaseId }
    }
    if (-not $runId) { Start-Sleep 10 }
}
if (-not $runId) { Fail "未找到本次提交 ($($headSha.Substring(0,7))) 触发的 workflow run" }
Write-Host "  找到 workflow run #$runId"

do {
    $state = gh run view $runId --json status,conclusion --jq '"\(.status) \(.conclusion)"' 2>$null
    Write-Host "  构建状态: $state" -ForegroundColor DarkGray
    if ($state -like "completed*") { break }
    if ((Get-Date) -gt $deadline) { Fail "等待超时（30 分钟），请到 Actions 页检查: https://github.com/LJL0906/LTools/actions" }
    Start-Sleep 20
} while ($true)

if ($state -notlike "completed success*") { Fail "Actions 构建未成功（$state），请到 Actions 页查看日志" }
Ok "Actions 构建成功"

# ---------------------------------------------------------------- [5] 发布 Draft
Step "[5] 发布 Draft Release"

# 等待 draft release 创建（tauri-action 上传完资产后创建）
$relExists = $false
$deadline2 = (Get-Date).AddMinutes(5)
while (-not $relExists -and (Get-Date) -lt $deadline2) {
    gh release view "v$Version" --json isDraft --jq '.isDraft' 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $relExists = $true } else { Start-Sleep 10 }
}
if (-not $relExists) { Fail "Release v$Version 未创建，请检查 Actions 日志" }

$draft = gh release view "v$Version" --json isDraft --jq '.isDraft'
if ($draft -eq "true") {
    gh release edit "v$Version" --draft=false
    if ($LASTEXITCODE -ne 0) { Fail "发布 Draft 失败" }
    Ok "Draft 已发布"
} else {
    Ok "Release 已是正式状态"
}

# ---------------------------------------------------------------- [6] 验证
Step "[6] 验证 Release 与更新端点"

$info = gh release view "v$Version" --json isDraft,assets --jq '{draft:.isDraft, assets:[.assets[].name]}'
$assetCount = ($info | ConvertFrom-Json).assets.Count
if ($assetCount -lt 5) { Fail "资产不完整，仅有 $assetCount 个（期望 >=5：exe/msi/sig/sig/latest.json）" }
Ok "资产完整（$assetCount 个）: $(($info | ConvertFrom-Json).assets -join ', ')"

$json = Invoke-WebRequest -UseBasicParsing "https://github.com/LJL0906/LTools/releases/latest/download/latest.json" -TimeoutSec 30 | Select-Object -ExpandProperty Content
$latestVer = ($json | ConvertFrom-Json).version
if ($latestVer -ne $Version) { Fail "latest.json 版本为 $latestVer，与预期 $Version 不符" }
Ok "latest.json 指向 $latestVer，端点可匿名访问"

Write-Host ""
Write-Host "发布完成: https://github.com/LJL0906/LTools/releases/tag/v$Version" -ForegroundColor Green
Write-Host "更新端点: https://github.com/LJL0906/LTools/releases/latest/download/latest.json" -ForegroundColor Green

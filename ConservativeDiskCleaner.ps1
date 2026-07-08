<# 
.SYNOPSIS
    极度保守的 Windows 磁盘清理助手。

.DESCRIPTION
    默认只扫描并生成报告和计划，不会删除或移动任何文件。
    执行阶段只处理“低风险且明显可再生”的候选项，并要求显式确认。

.EXAMPLE
    .\ConservativeDiskCleaner.ps1 -Mode Scan -Drives C,E -TargetRoot E:\DiskCleanerMoved

.EXAMPLE
    .\ConservativeDiskCleaner.ps1 -Mode Execute -PlanPath .\reports\cleanup-plan.json -ConfirmText I_UNDERSTAND
#>

[CmdletBinding()]
param(
    [ValidateSet("Scan", "Execute")]
    [string]$Mode = "Scan",

    [string[]]$Drives,

    [string]$TargetRoot = "E:\DiskCleanerMoved",

    [string]$ReportRoot,

    [string]$PlanPath,

    [string]$ConfirmText,

    [int]$LargeFileThresholdGB = 2,

    [switch]$IncludeMediumRisk
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($ReportRoot)) {
    $ReportRoot = Join-Path $ScriptDirectory "reports"
}

$ForbiddenPathFragments = @(
    "\Windows\System32",
    "\Windows\SysWOW64",
    "\Program Files",
    "\Program Files (x86)",
    "\ProgramData"
)

$ForbiddenSoftwareProfileFragments = @(
    "\AppData\Roaming\",
    "\Google\Chrome\User Data",
    "\Microsoft\Edge\User Data",
    "\Mozilla\Firefox\Profiles",
    "\Tencent",
    "\QQ",
    "\WeChat",
    "\baidunetdisk",
    "\OneDrive",
    "\iCloudDrive",
    "\WPSDrive"
)

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "  $Title" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
}

function Write-ScanStep {
    param([string]$Message)
    Write-Host "[扫描] $Message" -ForegroundColor DarkCyan
}

function New-ReportDirectory {
    if (-not (Test-Path $ReportRoot)) {
        New-Item -Path $ReportRoot -ItemType Directory -Force | Out-Null
    }

    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $dir = Join-Path $ReportRoot $stamp
    New-Item -Path $dir -ItemType Directory -Force | Out-Null
    return $dir
}

function Normalize-DriveName {
    param([string]$Drive)
    return $Drive.Trim().TrimEnd(":").ToUpperInvariant()
}

function Expand-RequestedDrives {
    if (-not $Drives -or $Drives.Count -eq 0) { return @() }

    @($Drives | ForEach-Object {
        "$_" -split ","
    } | ForEach-Object {
        Normalize-DriveName $_
    } | Where-Object {
        $_
    } | Select-Object -Unique)
}

function Get-TargetDrives {
    $requestedDrives = @(Expand-RequestedDrives)
    if ($requestedDrives.Count -gt 0) {
        foreach ($name in $requestedDrives) {
            $psDrive = Get-PSDrive -Name $name -PSProvider FileSystem -ErrorAction SilentlyContinue
            if ($psDrive) {
                $psDrive
            } else {
                Write-Warning "跳过不存在或不可访问的盘符：$name"
            }
        }
        return
    }

    Get-CimInstance Win32_LogicalDisk |
        Where-Object { $_.DriveType -eq 3 -and $_.DeviceID } |
        ForEach-Object {
            $name = Normalize-DriveName $_.DeviceID
            Get-PSDrive -Name $name -PSProvider FileSystem -ErrorAction SilentlyContinue
        }
}

function Test-IsReparsePoint {
    param([string]$Path)
    try {
        $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
        return [bool]($item.Attributes -band [IO.FileAttributes]::ReparsePoint)
    } catch {
        return $true
    }
}

function Test-PathSafe {
    param([string]$Path)
    try {
        return [bool](Test-Path -LiteralPath $Path -ErrorAction Stop)
    } catch {
        return $false
    }
}

function Test-IsForbiddenPath {
    param([string]$Path)
    $full = [IO.Path]::GetFullPath($Path)

    foreach ($fragment in $ForbiddenPathFragments) {
        if ($full.IndexOf($fragment, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
            return $true
        }
    }

    foreach ($fragment in $ForbiddenSoftwareProfileFragments) {
        if ($full.IndexOf($fragment, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
            return $true
        }
    }

    return $false
}

function Get-ItemSizeBytes {
    param([string]$Path)

    if (-not (Test-PathSafe $Path)) {
        return 0
    }

    try {
        $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
        if (-not $item.PSIsContainer) {
            return [int64]$item.Length
        }

        $sum = Get-ChildItem -LiteralPath $Path -Force -Recurse -File -ErrorAction SilentlyContinue |
            Measure-Object -Property Length -Sum
        if ($sum.Sum) { return [int64]$sum.Sum }
        return 0
    } catch {
        return 0
    }
}

function Get-DirectorySizeBytesShallow {
    param([string]$Path)

    if (-not (Test-PathSafe $Path)) {
        return 0
    }

    try {
        $sum = Get-ChildItem -LiteralPath $Path -Force -File -ErrorAction SilentlyContinue |
            Measure-Object -Property Length -Sum
        if ($sum.Sum) { return [int64]$sum.Sum }
        return 0
    } catch {
        return 0
    }
}

function Get-DirectoryStats {
    param([string]$Path)

    $count = 0
    [int64]$bytes = 0

    if (-not (Test-PathSafe $Path)) {
        return [pscustomobject]@{ Count = 0; Bytes = 0 }
    }

    try {
        Get-ChildItem -LiteralPath $Path -Force -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
            $count++
            $bytes += [int64]$_.Length
        }
    } catch {
        return [pscustomobject]@{ Count = $count; Bytes = $bytes }
    }

    [pscustomobject]@{ Count = $count; Bytes = $bytes }
}

function Convert-BytesToGB {
    param([int64]$Bytes)
    return [math]::Round($Bytes / 1GB, 2)
}

function New-Candidate {
    param(
        [string]$Path,
        [string]$Category,
        [ValidateSet("Delete", "Move", "Skip")]
        [string]$Action,
        [ValidateSet("Low", "Medium", "High")]
        [string]$Risk,
        [string]$Reason,
        [bool]$RequiresConfirmation = $true,
        [bool]$AutoApproved = $false
    )

    if (-not (Test-PathSafe $Path)) {
        return $null
    }

    if (Test-IsReparsePoint $Path) {
        return [pscustomobject]@{
            Path                 = $Path
            SizeBytes            = 0
            SizeGB               = 0
            Category             = "C"
            Action               = "Skip"
            Risk                 = "High"
            Reason               = "重解析点、符号链接或挂载点，禁止自动处理"
            RequiresConfirmation = $true
            AutoApproved         = $false
            TargetPath           = $null
        }
    }

    $size = Get-ItemSizeBytes $Path
    $target = $null
    if ($Action -eq "Move") {
        $driveName = ([IO.Path]::GetPathRoot($Path)).TrimEnd("\").TrimEnd(":")
        $relative = $Path.Substring(3)
        $target = Join-Path $TargetRoot (Join-Path $driveName $relative)
    }

    [pscustomobject]@{
        Path                 = $Path
        SizeBytes            = $size
        SizeGB               = Convert-BytesToGB $size
        Category             = $Category
        Action               = $Action
        Risk                 = $Risk
        Reason               = $Reason
        RequiresConfirmation = $RequiresConfirmation
        AutoApproved         = $AutoApproved
        TargetPath           = $target
    }
}

function Add-CandidateIfExists {
    param(
        [System.Collections.Generic.List[object]]$Candidates,
        [string]$Path,
        [string]$Category,
        [string]$Action,
        [string]$Risk,
        [string]$Reason,
        [bool]$AutoApproved
    )

    $candidate = New-Candidate -Path $Path -Category $Category -Action $Action -Risk $Risk -Reason $Reason -AutoApproved $AutoApproved
    if ($candidate -and $candidate.SizeBytes -gt 0) {
        $Candidates.Add($candidate)
    }
}

function Get-UserProfilesOnDrive {
    param([string]$DriveRoot)
    $usersRoot = Join-Path $DriveRoot "Users"
    if (-not (Test-PathSafe $usersRoot)) { return @() }

    Get-ChildItem -LiteralPath $usersRoot -Directory -Force -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -notin @("Public", "Default", "Default User", "All Users") -and
            -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint)
        }
}

function Find-VirtualDisks {
    param([string[]]$Roots)

    foreach ($root in $Roots) {
        if (-not (Test-PathSafe $root)) { continue }
        Get-ChildItem -LiteralPath $root -Force -Recurse -File -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match "\.(vhd|vhdx|vdi|vmdk)$" -or $_.Name -eq "ext4.vhdx" } |
            ForEach-Object {
                [pscustomobject]@{
                    Path                 = $_.FullName
                    SizeBytes            = [int64]$_.Length
                    SizeGB               = Convert-BytesToGB $_.Length
                    Category             = "C"
                    Action               = "Skip"
                    Risk                 = "High"
                    Reason               = "WSL、Docker 或虚拟机磁盘镜像，仅列出大小，禁止自动处理"
                    RequiresConfirmation = $true
                    AutoApproved         = $false
                    TargetPath           = $null
                }
            }
    }
}

function Find-LargeFiles {
    param([string]$DriveRoot)

    $threshold = [int64]$LargeFileThresholdGB * 1GB
    $found = 0
    $script:__largeFileFoundCount = 0
    $roots = [System.Collections.Generic.List[string]]::new()

    Get-ChildItem -LiteralPath $DriveRoot -Force -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Length -ge $threshold } |
        ForEach-Object {
            $roots.Add($_.FullName)
        }

    foreach ($profile in @(Get-UserProfilesOnDrive $DriveRoot)) {
        foreach ($name in @("Downloads", "Desktop", "Videos", "Documents", "Pictures")) {
            $candidateRoot = Join-Path $profile.FullName $name
            if ((Test-PathSafe $candidateRoot) -and -not (Test-IsReparsePoint $candidateRoot) -and -not (Test-IsForbiddenPath $candidateRoot)) {
                $roots.Add($candidateRoot)
            }
        }
    }

    foreach ($root in $roots) {
        if ($found -ge 200) { break }
        if (Test-Path -LiteralPath $root -PathType Leaf) {
            $items = @(Get-Item -LiteralPath $root -Force -ErrorAction SilentlyContinue)
        } else {
            Write-ScanStep "$DriveRoot 快速查找大文件：$root"
            $items = @(Get-ChildItem -LiteralPath $root -Force -Recurse -File -ErrorAction SilentlyContinue)
        }

        $items |
            Where-Object {
                $_.Length -ge $threshold -and
                -not (Test-IsForbiddenPath $_.FullName) -and
                -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint)
            } |
            Select-Object -First (200 - $found) |
            ForEach-Object {
                $script:__largeFileFoundCount++
                $extension = $_.Extension.ToLowerInvariant()
                $looksLikeMediaOrArchive = $extension -in @(".mp4", ".mov", ".mkv", ".avi", ".zip", ".7z", ".rar", ".iso", ".msi", ".exe")
                [pscustomobject]@{
                    Path                 = $_.FullName
                    SizeBytes            = [int64]$_.Length
                    SizeGB               = Convert-BytesToGB $_.Length
                    Category             = if ($looksLikeMediaOrArchive) { "B" } else { "C" }
                    Action               = "Skip"
                    Risk                 = if ($looksLikeMediaOrArchive) { "Medium" } else { "High" }
                    Reason               = if ($looksLikeMediaOrArchive) { "大型媒体、压缩包或安装包，建议人工判断后移动" } else { "大型文件类型不明确，禁止自动处理" }
                    RequiresConfirmation = $true
                    AutoApproved         = $false
                    TargetPath           = $null
                }
            }
        $found = [int]$script:__largeFileFoundCount
    }
}

function Get-DriveTopDirectories {
    param([string]$DriveRoot)

    Get-ChildItem -LiteralPath $DriveRoot -Directory -Force -ErrorAction SilentlyContinue |
        Where-Object {
            -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -and
            -not (Test-IsForbiddenPath $_.FullName)
        } |
        ForEach-Object {
            $size = Get-DirectorySizeBytesShallow $_.FullName
            [pscustomobject]@{
                Path      = $_.FullName
                SizeBytes = $size
                SizeGB    = Convert-BytesToGB $size
            }
        } |
        Sort-Object SizeBytes -Descending
}

function Scan-Drive {
    param([object]$Drive)

    $driveRoot = "$($Drive.Name):\"
    $candidates = [System.Collections.Generic.List[object]]::new()
    $observations = [System.Collections.Generic.List[object]]::new()

    Write-Host "扫描 $driveRoot ..." -ForegroundColor Yellow
    Write-ScanStep "$driveRoot 读取磁盘空间：已用 $(Convert-BytesToGB $Drive.Used) GB，可用 $(Convert-BytesToGB $Drive.Free) GB"

    Write-ScanStep "$driveRoot 检查根目录临时文件和驱动安装残留"
    Add-CandidateIfExists $candidates (Join-Path $driveRoot "Windows\Temp") "A" "Delete" "Low" "Windows 临时目录，删除时逐项跳过被占用文件" $true
    Add-CandidateIfExists $candidates (Join-Path $driveRoot "AMD") "A" "Delete" "Low" "显卡驱动安装解压残留，通常可再下载" $true
    Add-CandidateIfExists $candidates (Join-Path $driveRoot "NVIDIA") "A" "Delete" "Low" "显卡驱动安装解压残留，通常可再下载" $true

    $profiles = @(Get-UserProfilesOnDrive $driveRoot)
    Write-ScanStep "$driveRoot 找到 $($profiles.Count) 个用户目录"

    foreach ($profile in $profiles) {
        $profilePath = $profile.FullName

        Write-ScanStep "$driveRoot 检查用户目录：$profilePath"
        Write-ScanStep "$profilePath 检查 Temp、CrashDumps、GPU 缓存"
        Add-CandidateIfExists $candidates (Join-Path $profilePath "AppData\Local\Temp") "A" "Delete" "Low" "用户临时目录，逐项删除并跳过被占用文件" $true
        Add-CandidateIfExists $candidates (Join-Path $profilePath "AppData\Local\CrashDumps") "A" "Delete" "Low" "应用崩溃转储，通常无须长期保留" $true
        Add-CandidateIfExists $candidates (Join-Path $profilePath "AppData\Local\NVIDIA\DXCache") "A" "Delete" "Low" "NVIDIA DirectX 着色器缓存，可自动重建" $true
        Add-CandidateIfExists $candidates (Join-Path $profilePath "AppData\Local\NVIDIA\GLCache") "A" "Delete" "Low" "NVIDIA OpenGL 缓存，可自动重建" $true
        Add-CandidateIfExists $candidates (Join-Path $profilePath "AppData\Local\D3DSCache") "A" "Delete" "Low" "Direct3D 缓存，可自动重建" $true

        Write-ScanStep "$profilePath 检查 Python、Node、本地模型缓存"
        Add-CandidateIfExists $candidates (Join-Path $profilePath "AppData\Local\pip\cache") "B" "Move" "Low" "pip 下载缓存，可再生，移动后建立 Junction" $true
        Add-CandidateIfExists $candidates (Join-Path $profilePath "AppData\Local\npm-cache") "B" "Move" "Low" "npm 下载缓存，可再生，移动后建立 Junction" $true
        Add-CandidateIfExists $candidates (Join-Path $profilePath ".conda\pkgs") "B" "Move" "Low" "conda 包缓存，可再生，移动后建立 Junction" $true
        Add-CandidateIfExists $candidates (Join-Path $profilePath "AppData\Local\uv\cache") "B" "Move" "Low" "uv Python 包缓存，可再生，移动后建立 Junction" $true
        Add-CandidateIfExists $candidates (Join-Path $profilePath ".cache\huggingface") "B" "Move" "Low" "Hugging Face 模型缓存，可再下载，移动后建立 Junction" $true
        Add-CandidateIfExists $candidates (Join-Path $profilePath ".ollama\models") "B" "Move" "Medium" "Ollama 本地模型体积较大，移动需确认并确保 Ollama 未运行" $false

        Write-ScanStep "$profilePath 检查下载目录（只列出，不自动处理）"
        Add-CandidateIfExists $candidates (Join-Path $profilePath "Downloads") "B" "Skip" "Medium" "下载目录只列出大小，不自动删除或移动" $false

        Write-ScanStep "$profilePath 查找 WSL / Docker / 虚拟磁盘镜像（只列出）"
        $virtualRoots = @(
            (Join-Path $profilePath "AppData\Local\wsl"),
            (Join-Path $profilePath "AppData\Local\Docker"),
            (Join-Path $profilePath "AppData\Roaming\Docker"),
            (Join-Path $profilePath ".docker")
        )
        Find-VirtualDisks $virtualRoots | ForEach-Object { $observations.Add($_) }
    }

    Write-ScanStep "$driveRoot 查找大文件、安装包、媒体和虚拟磁盘候选（只列出或人工判断）"
    Find-LargeFiles $driveRoot | ForEach-Object { $observations.Add($_) }

    Write-ScanStep "$driveRoot 统计根目录大目录排行"
    $topDirs = @(Get-DriveTopDirectories $driveRoot)
    if ($candidates.Count -eq 0 -and $observations.Count -eq 0) {
        $observations.Add([pscustomobject]@{
            Path                 = $driveRoot
            SizeBytes            = [int64]$Drive.Used
            SizeGB               = Convert-BytesToGB $Drive.Used
            Category             = "C"
            Action               = "Skip"
            Risk                 = "High"
            Reason               = "该盘已完成快速扫描，但未发现可自动清理项；整盘仅作为扫描完成提示，禁止自动处理"
            RequiresConfirmation = $true
            AutoApproved         = $false
            TargetPath           = $null
        })
    }
    Write-ScanStep "$driveRoot 扫描完成：候选 $($candidates.Count) 项，只观察/跳过 $($observations.Count) 项"

    [pscustomobject]@{
        Drive        = $Drive.Name
        Root         = $driveRoot
        FreeGB       = Convert-BytesToGB $Drive.Free
        UsedGB       = Convert-BytesToGB $Drive.Used
        TopDirs      = $topDirs
        Candidates   = @($candidates | Sort-Object SizeBytes -Descending)
        Observations = @($observations | Sort-Object SizeBytes -Descending)
    }
}

function Export-ScanReport {
    param([array]$DriveReports, [string]$ReportDir)

    $allCandidates = @($DriveReports | ForEach-Object { $_.Candidates })
    $allObservations = @($DriveReports | ForEach-Object { $_.Observations })
    $allPlanItems = @($allCandidates + $allObservations | Sort-Object SizeBytes -Descending)
    $allTopDirs = @($DriveReports | ForEach-Object {
        $drive = $_.Drive
        $_.TopDirs | ForEach-Object {
            [pscustomobject]@{
                Drive     = $drive
                Path      = $_.Path
                SizeBytes = $_.SizeBytes
                SizeGB    = $_.SizeGB
            }
        }
    })

    $summaryPath = Join-Path $ReportDir "scan-summary.json"
    $planPath = Join-Path $ReportDir "cleanup-plan.json"
    $candidateCsv = Join-Path $ReportDir "candidates.csv"
    $observationCsv = Join-Path $ReportDir "observations-skip-only.csv"
    $topDirsCsv = Join-Path $ReportDir "top-directories.csv"

    $DriveReports | ConvertTo-Json -Depth 8 | Set-Content -Path $summaryPath -Encoding UTF8
    $allPlanItems | ConvertTo-Json -Depth 5 | Set-Content -Path $planPath -Encoding UTF8
    $allCandidates | Export-Csv -Path $candidateCsv -NoTypeInformation -Encoding UTF8
    $allObservations | Export-Csv -Path $observationCsv -NoTypeInformation -Encoding UTF8
    $allTopDirs | Export-Csv -Path $topDirsCsv -NoTypeInformation -Encoding UTF8

    [pscustomobject]@{
        SummaryPath     = $summaryPath
        PlanPath        = $planPath
        CandidateCsv    = $candidateCsv
        ObservationCsv  = $observationCsv
        TopDirsCsv      = $topDirsCsv
        Candidates      = $allPlanItems
        Observations    = $allObservations
    }
}

function Remove-DirectoryContentsSafely {
    param([string]$Path)

    $deletedFiles = 0
    $skippedFiles = 0
    $deletedDirs = 0
    $skippedDirs = 0

    if (-not (Test-PathSafe $Path)) {
        return [pscustomobject]@{ Status = "不存在"; DeletedFiles = 0; SkippedFiles = 0; DeletedDirs = 0; SkippedDirs = 0 }
    }

    if (Test-IsForbiddenPath $Path -or (Test-IsReparsePoint $Path)) {
        return [pscustomobject]@{ Status = "跳过：禁止路径或重解析点"; DeletedFiles = 0; SkippedFiles = 0; DeletedDirs = 0; SkippedDirs = 0 }
    }

    Write-Host "[执行] 快速清理目录内容：$Path"
    Get-ChildItem -LiteralPath $Path -Force -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            if ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                $skippedDirs++
                return
            }

            if ($_.PSIsContainer) {
                Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction Stop
                $deletedDirs++
            } else {
                Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop
                $deletedFiles++
            }
        } catch {
            if ($_.PSIsContainer) {
                $skippedDirs++
            } else {
                $skippedFiles++
            }
        }
    }

    [pscustomobject]@{
        Status       = "完成"
        DeletedFiles = $deletedFiles
        SkippedFiles = $skippedFiles
        DeletedDirs  = $deletedDirs
        SkippedDirs  = $skippedDirs
    }
}

function Move-DirectoryWithJunction {
    param([string]$SourcePath, [string]$TargetPath)

    if (-not (Test-PathSafe $SourcePath)) {
        return [pscustomobject]@{ Status = "不存在"; Detail = "" }
    }

    if (Test-IsForbiddenPath $SourcePath -or (Test-IsReparsePoint $SourcePath)) {
        return [pscustomobject]@{ Status = "跳过"; Detail = "禁止路径或重解析点" }
    }

    if (Test-PathSafe $TargetPath) {
        return [pscustomobject]@{ Status = "跳过"; Detail = "目标路径已存在：$TargetPath" }
    }

    $targetParent = Split-Path $TargetPath -Parent
    if (-not (Test-PathSafe $targetParent)) {
        New-Item -Path $targetParent -ItemType Directory -Force | Out-Null
    }

    Write-Host "[执行] 复制到目标盘：$SourcePath -> $TargetPath"
    $null = robocopy $SourcePath $TargetPath /E /COPY:DAT /R:1 /W:1 /NP /NFL /NDL /MT:8
    $exitCode = $LASTEXITCODE
    if ($exitCode -ge 8) {
        Remove-Item -LiteralPath $TargetPath -Recurse -Force -ErrorAction SilentlyContinue
        return [pscustomobject]@{ Status = "失败"; Detail = "robocopy 退出码 $exitCode" }
    }

    Write-Host "[执行] 验证复制结果：$TargetPath"
    $sourceStats = Get-DirectoryStats $SourcePath
    $targetStats = Get-DirectoryStats $TargetPath

    if ($sourceStats.Count -ne $targetStats.Count -or $sourceStats.Bytes -ne $targetStats.Bytes) {
        Remove-Item -LiteralPath $TargetPath -Recurse -Force -ErrorAction SilentlyContinue
        return [pscustomobject]@{ Status = "失败"; Detail = "复制验证失败：文件数或大小不一致" }
    }

    try {
        Write-Host "[执行] 删除源目录并建立联接：$SourcePath"
        Remove-Item -LiteralPath $SourcePath -Recurse -Force -ErrorAction Stop
    } catch {
        return [pscustomobject]@{ Status = "部分完成"; Detail = "已复制到目标，但源目录无法删除：$($_.Exception.Message)" }
    }

    $mklinkOutput = cmd /c mklink /J "$SourcePath" "$TargetPath" 2>&1
    if ($LASTEXITCODE -ne 0) {
        return [pscustomobject]@{ Status = "部分完成"; Detail = "已复制并删除源目录，但 Junction 创建失败：$mklinkOutput" }
    }

    [pscustomobject]@{ Status = "完成"; Detail = "Junction -> $TargetPath" }
}

function Invoke-ExecutePlan {
    if (-not $PlanPath) {
        throw "执行模式需要提供 -PlanPath。"
    }

    if ($ConfirmText -ne "I_UNDERSTAND") {
        throw "执行模式需要提供 -ConfirmText I_UNDERSTAND。"
    }

    $plan = Get-Content -Path $PlanPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $items = @($plan) | Where-Object {
        $_.AutoApproved -eq $true -and
        $_.Risk -eq "Low" -and
        $_.Action -in @("Delete", "Move")
    }

    if ($IncludeMediumRisk) {
        $items = @($plan) | Where-Object {
            $_.Action -in @("Delete", "Move") -and
            $_.Risk -in @("Low", "Medium") -and
            $_.Category -in @("A", "B")
        }
    }

    $before = Get-TargetDrives | ForEach-Object {
        [pscustomobject]@{ Drive = $_.Name; FreeGB = Convert-BytesToGB $_.Free }
    }

    $results = [System.Collections.Generic.List[object]]::new()

    foreach ($item in $items) {
        Write-Host "处理：$($item.Path)" -ForegroundColor Yellow
        $actualBefore = 0
        if ($item.SizeBytes) {
            $actualBefore = [int64]$item.SizeBytes
        } else {
            $actualBefore = Get-ItemSizeBytes $item.Path
        }

        if ($item.Action -eq "Delete") {
            $result = Remove-DirectoryContentsSafely $item.Path
        } elseif ($item.Action -eq "Move") {
            $result = Move-DirectoryWithJunction $item.Path $item.TargetPath
        } else {
            continue
        }

        $results.Add([pscustomobject]@{
            Path            = $item.Path
            Action          = $item.Action
            Category        = $item.Category
            Risk            = $item.Risk
            SizeGBBefore    = Convert-BytesToGB $actualBefore
            Status          = $result.Status
            Detail          = $result.Detail
            DeletedFiles    = $result.DeletedFiles
            SkippedFiles    = $result.SkippedFiles
        })
    }

    $after = Get-TargetDrives | ForEach-Object {
        [pscustomobject]@{ Drive = $_.Name; FreeGB = Convert-BytesToGB $_.Free }
    }

    $executionDir = New-ReportDirectory
    $executionReport = Join-Path $executionDir "execution-report.json"
    [pscustomobject]@{
        ExecutedAt     = Get-Date
        PlanPath       = $PlanPath
        TargetRoot     = $TargetRoot
        DiskFreeBefore = $before
        DiskFreeAfter  = $after
        Results        = @($results)
        SkippedHighRisk = @($plan | Where-Object { $_.Risk -eq "High" -or $_.Action -eq "Skip" })
    } | ConvertTo-Json -Depth 7 | Set-Content -Path $executionReport -Encoding UTF8

    Write-Section "执行完成"
    Write-Host "执行报告：$executionReport"
    Write-Host ""
    Write-Host "磁盘空间变化："
    foreach ($driveBefore in $before) {
        $driveAfter = $after | Where-Object Drive -eq $driveBefore.Drive | Select-Object -First 1
        if ($driveAfter) {
            $delta = [math]::Round($driveAfter.FreeGB - $driveBefore.FreeGB, 2)
            Write-Host "  $($driveBefore.Drive): $($driveBefore.FreeGB) GB -> $($driveAfter.FreeGB) GB，变化 $delta GB"
        }
    }
}

function Invoke-Scan {
    $reportDir = New-ReportDirectory
    $drivesToScan = @(Get-TargetDrives)

    if ($drivesToScan.Count -eq 0) {
        throw "未找到可扫描的固定磁盘。"
    }

    Write-Section "扫描开始"
    Write-Host "扫描盘符：$($drivesToScan.Name -join ', ')"
    Write-Host "移动目标根目录：$TargetRoot"
    Write-Host "报告目录：$reportDir"

    $driveReports = @()
    foreach ($drive in $drivesToScan) {
        $driveReports += Scan-Drive $drive
    }

    $exports = Export-ScanReport -DriveReports $driveReports -ReportDir $reportDir

    Write-Section "扫描完成"
    Write-Host "候选清理项：$($exports.Candidates.Count)"
    Write-Host "仅观察/跳过项：$($exports.Observations.Count)"
    Write-Host ""
    Write-Host "报告文件："
    Write-Host "  清理计划 JSON：$($exports.PlanPath)"
    Write-Host "  候选项 CSV：$($exports.CandidateCsv)"
    Write-Host "  跳过项 CSV：$($exports.ObservationCsv)"
    Write-Host "  大目录 CSV：$($exports.TopDirsCsv)"
    Write-Host ""
    Write-Host "执行低风险自动项示例："
    Write-Host "  .\ConservativeDiskCleaner.ps1 -Mode Execute -PlanPath `"$($exports.PlanPath)`" -TargetRoot `"$TargetRoot`" -ConfirmText I_UNDERSTAND"
}

if ($Mode -eq "Scan") {
    Invoke-Scan
} else {
    Invoke-ExecutePlan
}





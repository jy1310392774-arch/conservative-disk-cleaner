# Conservative Disk Cleaner / 极度保守的磁盘清理助手

> A Windows disk cleaner that scans first, explains every candidate, and only cleans what the user explicitly approves.  
> 一个 Windows 磁盘清理工具：先扫描、再分类解释、最后只处理用户明确允许的内容。

## Highlights / 亮点

- **Conservative by design / 极度保守**：system folders, program data, browser profiles, cloud sync folders, databases, WSL/Docker disks, reparse points and drive roots are never cleaned automatically.
- **Multi-drive scanning / 多盘扫描**：scan any fixed drive, not only `C:`.
- **Risk-based plan / 风险分级计划**：items are grouped into low, medium and high risk.
- **Visible progress / 可见进度**：scan and execution logs stream in the UI, with expandable details and copyable logs.
- **Safe execution / 安全执行**：low-risk items are handled by default; medium/high-risk selections require double confirmation and are sent to Recycle Bin.
- **Move or delete / 可移动或回收站删除**：regenerable caches can be moved to another drive with a directory junction, or selected for direct Recycle Bin deletion.

## Screens and UX / 界面与体验

The desktop UI is built with Electron + React, using an Apple HIG-inspired layout and `liquid-glass-react` for glass-style panels.

桌面界面基于 Electron + React，整体参考 Apple HIG，并使用 `liquid-glass-react` 实现玻璃质感卡片。

## Safety Model / 安全模型

The app classifies scan results into:

应用会把扫描结果分为：

- **Low risk / 低风险**：regenerable temp files or caches. These can be executed by the main button.
- **Medium risk / 中风险**：user-owned data or large caches that need manual inspection.
- **High risk / 高风险**：system-like, unknown, virtual disk, root-drive, or large ambiguous items. These are skipped by default.

The app intentionally does **not** automatically touch:

应用默认绝不自动处理：

- `Windows`, `System32`, `SysWOW64`
- `Program Files`, `Program Files (x86)`, `ProgramData`
- unknown application data under `AppData`
- browser profiles, chat records, cloud sync folders
- databases, developer environment configuration, IDE settings
- WSL/Docker/VM virtual disks such as `ext4.vhdx`
- reparse points, symbolic links, junctions, mount points
- drive roots such as `C:\`, `D:\`, `E:\`

## Supported Platform / 支持平台

- Windows 10/11 x64
- PowerShell 5.1+
- No admin permission is required for normal user-cache cleanup, but some protected paths may be skipped by Windows permissions.

支持：

- Windows 10/11 x64
- PowerShell 5.1 或更高版本
- 常规用户缓存清理不需要管理员权限；受系统权限保护的路径会被跳过。

## Download and Run / 下载与运行

For release builds, download the Windows x64 zip package and extract the whole folder.

发行版请下载 Windows x64 压缩包，并完整解压整个文件夹。

Run:

运行：

```text
Conservative Disk Cleaner.exe
```

Do **not** copy only the `.exe`; the packaged folder also contains runtime files and `ConservativeDiskCleaner.ps1`.

不要只单独复制 `.exe`；整个打包目录还包含运行时文件和 `ConservativeDiskCleaner.ps1`。

## Basic Workflow / 基本流程

1. Select one or more drives.
2. Choose a move target, for example `E:\DiskCleanerMoved`.
3. Click **Start Scan / 开始扫描**.
4. Review the cleanup plan.
5. Execute low-risk items, or manually inspect and select other items.

步骤：

1. 选择一个或多个盘符。
2. 设置移动目标，例如 `E:\DiskCleanerMoved`。
3. 点击 **开始扫描**。
4. 查看清理计划。
5. 执行低风险项，或人工检查后勾选其他项目。

## What Actions Mean / 动作说明

- **Delete / 删除**：low-risk cache/temp items are cleaned. Medium/high selected items are moved to Recycle Bin.
- **Move / 移动**：copy to target drive, verify file count and size, remove source, then create a directory junction with `cmd /c mklink /J`.
- **Skip / 跳过**：shown for manual review only; not processed automatically.

说明：

- **删除**：低风险缓存/临时文件会被清理；中高风险勾选项会移入回收站。
- **移动**：复制到目标盘，验证文件数量和大小，删除源目录，再用 `cmd /c mklink /J` 建立目录联接。
- **跳过**：只展示给用户人工判断，默认不处理。

## CLI PowerShell Engine / PowerShell 引擎

The GUI calls the conservative PowerShell engine:

图形界面底层调用这个保守 PowerShell 引擎：

```powershell
.\ConservativeDiskCleaner.ps1 -Mode Scan -Drives C,E -TargetRoot E:\DiskCleanerMoved
```

Execute a reviewed low-risk plan:

执行已检查过的低风险计划：

```powershell
.\ConservativeDiskCleaner.ps1 -Mode Execute `
  -PlanPath ".\reports\20260708-120000\cleanup-plan.json" `
  -TargetRoot E:\DiskCleanerMoved `
  -ConfirmText I_UNDERSTAND
```

## Generated Reports / 生成报告

Each scan creates a timestamped folder under `reports`:

每次扫描会在 `reports` 下生成一个时间戳目录：

- `cleanup-plan.json`：machine-readable cleanup plan / 清理计划
- `candidates.csv`：human-readable candidates / 候选项表格
- `observations-skip-only.csv`：skipped and high-risk observations / 跳过项与高风险观察项
- `top-directories.csv`：top-level directory estimate / 根目录大目录估算
- `scan-summary.json`：full scan summary / 完整扫描摘要

## Build from Source / 从源码构建

Install dependencies:

安装依赖：

```powershell
cd ui
npm install
```

Run in development:

开发模式运行：

```powershell
npm run dev
```

Package Windows x64:

打包 Windows x64：

```powershell
npm run package:win
```

Packaged output:

打包输出：

```text
ui\release\win-unpacked\Conservative Disk Cleaner.exe
```

## Release Packaging / 发行打包

The recommended release artifact is a zip of the entire `win-unpacked` folder:

推荐发行物是完整 `win-unpacked` 文件夹的 zip：

```text
Conservative-Disk-Cleaner-v1.1.2-win-x64.zip
```

## Known Limitations / 已知限制

- The app is intentionally conservative, so it may report less reclaimable space than aggressive cleaners.
- Fast scanning focuses on common cache and large-user-file locations. A future deep-scan mode can be added for slower full-disk discovery.
- The app is not code-signed yet, so Windows SmartScreen may warn on first launch.

限制：

- 本工具刻意保守，因此可释放空间可能少于激进清理工具。
- 默认快速扫描聚焦常见缓存和用户大文件位置；未来可以增加更慢但更全面的深度扫描。
- 当前尚未代码签名，首次运行可能触发 Windows SmartScreen 提示。

## License / 许可证

No license has been selected yet. Add a license before public distribution if you want others to reuse or modify the code.

目前尚未选择开源许可证。如果要公开分发并允许他人复用/修改，请先添加许可证。

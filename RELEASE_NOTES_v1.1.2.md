# Conservative Disk Cleaner v1.1.2 Release Notes

## English

### Fixed

- Replaced multi-drive selection with a single-drive picker.
- The scan command now accepts only one selected drive in both the UI and Electron backend.
- This removes the unreliable multi-drive scan behavior and makes every scan report unambiguous.

### UI

- Added animated gradient background and spotlight glow cards.
- Drive picker keeps the ripple feedback while enforcing one active drive.

### Scan Modes

- **Fast mode** remains the default and scans common caches plus priority user locations.
- **Exact search** recursively searches the selected drive for large files. It is intended for data drives such as `E:` and can take substantially longer.
- Both modes retain the same protected-path and reparse-point exclusions.

## 中文

### 修复

- 将多选盘符改为单选盘符。
- UI 与 Electron 后端都会只接受一个选中的盘符。
- 解决多盘扫描不稳定的问题，确保每次报告都明确对应一个磁盘。

### 界面

- 增加动态渐变背景和聚光玻璃卡片效果。
- 盘符按钮保留水波点击反馈，并始终保持一个盘符处于选中状态。

### 扫描模式

- **快速模式** 保持默认，扫描常见缓存和重点用户目录。
- **精确搜索** 会递归查找所选磁盘的大文件，适合 `E:` 等资料盘，但耗时会明显增加。
- 两种模式都保留相同的受保护路径和重解析点跳过规则。

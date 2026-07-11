# Conservative Disk Cleaner v1.1.3 Release Notes

## English

### Visual refinement

- Added the React Bits `GlassSurface` effect to the control panel, summary cards, and cleanup plan.
- The glass treatment now has a browser-safe fallback, so unsupported SVG backdrop filters degrade to a stable frosted surface.
- Kept the existing gradient background and pointer spotlight effect while avoiding changes to scanning or cleanup behavior.

### Sidebar

- Fixed the collapsed sidebar layout so the application mark remains centered and is not clipped.
- The collapsed icon rail now uses a fixed icon slot without shrinking the logo.

### Validation

- Verified production renderer build with `npm run build`.
- Verified Windows x64 unpacked application packaging with `npm run package:win`.

### Application Uninstall

- Added an installed-applications page that starts only the software's registered Windows uninstaller.
- After the original uninstaller closes, users can review the registered install directory and the matching uninstall registry entry before any cleanup.
- Residual cleanup is opt-in, requires two confirmations, sends directories to Recycle Bin, and never scans AppData or unrelated registry areas.

### Interaction

- Added animated transitions when changing sidebar pages.
- Added pointer-aware border glow to primary interface cards.
- Fixed packaged installed-app discovery by shipping the registry query script outside the application archive; Chinese application names are preserved.

## 中文

### 视觉优化

- 为控制面板、统计卡片和清理计划接入 React Bits `GlassSurface` 玻璃折射效果。
- 增加浏览器兼容降级方案：不支持 SVG 背景滤镜时会自动使用稳定的磨砂玻璃效果。
- 保留原有动态渐变背景与鼠标聚光效果，不改变扫描和清理逻辑。

### 侧边栏

- 修复收起侧边栏时应用图标被裁切的问题，图标会保持居中显示。
- 收起状态的图标区域使用固定宽度，不再压缩 Logo。

### 验证

- 已通过 `npm run build` 生产构建验证。
- 已通过 `npm run package:win` Windows x64 未封装目录打包验证。

### 应用卸载

- 新增已安装应用页面，只启动 Windows 登记的软件原始卸载程序。
- 原始卸载程序结束后，可检查登记的安装目录和对应卸载注册表项，再决定是否清理。
- 残留清理默认不执行，必须勾选并经过两次确认；目录移入回收站，不扫描 AppData 或无关注册表位置。

### 交互优化

- 侧边栏切换页面时加入过渡动画。
- 主界面卡片加入跟随鼠标的边缘高光。
- 将应用查询脚本放在打包程序外部，修复应用列表读取及中文软件名称显示问题。

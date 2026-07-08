# Conservative Disk Cleaner v1.0.0 Release Notes

## English

### Summary

Conservative Disk Cleaner v1.0.0 is the first public-ready Windows desktop release. It provides a cautious disk cleanup workflow: scan first, classify every candidate, then execute only clearly approved actions.

### Features

- Multi-drive scan for fixed Windows disks.
- Risk-based cleanup plan: low, medium, high.
- Apple HIG-inspired Electron + React interface.
- Expandable real-time scan and execution logs.
- Low-risk cleanup execution.
- Optional Recycle Bin deletion for manually selected items.
- Move regenerable caches to a target drive and create directory junctions.
- Explicit skip handling for WSL, Docker, VM disks and drive roots.
- Bilingual documentation in Chinese and English.

### Safety

- Does not automatically process system directories, program data, browser profiles, chat records, cloud sync folders, databases, reparse points or drive roots.
- Medium/high-risk selections require explicit confirmation.
- Drive roots such as `C:\`, `D:\`, `E:\` are blocked from deletion in both UI and backend.

### Known Limitations

- Not code-signed yet; Windows SmartScreen may warn.
- Fast scan mode focuses on common cleanup locations rather than performing a slow exhaustive full-disk scan.

---

## 中文

### 概述

Conservative Disk Cleaner v1.0.0 是第一个可公开发布的 Windows 桌面版本。它采用极度保守的清理流程：先扫描、分类解释，再只执行明确批准的操作。

### 功能

- 支持多个固定磁盘扫描。
- 清理计划按低风险、中风险、高风险分类。
- 基于 Electron + React 的 Apple HIG 风格界面。
- 可展开的实时扫描和执行日志。
- 支持执行低风险清理项。
- 支持将人工勾选项移入回收站。
- 支持把可再生缓存移动到目标盘并建立目录联接。
- 明确跳过 WSL、Docker、虚拟机磁盘和盘符根目录。
- 提供中英双语文档。

### 安全性

- 不会自动处理系统目录、程序数据、浏览器资料、聊天记录、云同步目录、数据库、重解析点或盘符根目录。
- 中高风险项目需要明确确认。
- `C:\`、`D:\`、`E:\` 等盘符根目录在 UI 和后端都禁止删除。

### 已知限制

- 尚未代码签名，Windows SmartScreen 可能提示风险。
- 默认快速扫描聚焦常见可清理位置，不做耗时的全盘深度扫描。

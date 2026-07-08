# Publishing Guide / 发布指南

## English

This repository is prepared for a v1.0.0 release, but the current machine does not have GitHub CLI (`gh`) installed or authenticated.

### Prerequisites

Install GitHub CLI:

```powershell
winget install --id GitHub.cli
```

Login:

```powershell
gh auth login
```

### Create a GitHub repository

Replace `YOUR_NAME` with your GitHub account or organization:

```powershell
cd E:\codex\conservative-disk-cleaner
gh repo create YOUR_NAME/conservative-disk-cleaner --public --source . --remote origin --push
git push origin v1.0.0
```

### Create the v1.0.0 release

```powershell
gh release create v1.0.0 `
  .\release-artifacts\Conservative-Disk-Cleaner-v1.0.0-win-x64.zip `
  .\release-artifacts\Conservative-Disk-Cleaner-v1.0.0-win-x64.zip.sha256 `
  .\release-artifacts\Conservative-Disk-Cleaner-v1.0.0-source.zip `
  .\release-artifacts\Conservative-Disk-Cleaner-v1.0.0-source.zip.sha256 `
  --title "Conservative Disk Cleaner v1.0.0" `
  --notes-file .\RELEASE_NOTES_v1.0.0.md
```

## 中文

本仓库已经准备好 v1.0.0 发行版，但当前电脑没有安装或登录 GitHub CLI (`gh`)。

### 准备

安装 GitHub CLI：

```powershell
winget install --id GitHub.cli
```

登录：

```powershell
gh auth login
```

### 创建 GitHub 仓库

把 `YOUR_NAME` 替换成你的 GitHub 用户名或组织名：

```powershell
cd E:\codex\conservative-disk-cleaner
gh repo create YOUR_NAME/conservative-disk-cleaner --public --source . --remote origin --push
git push origin v1.0.0
```

### 创建 v1.0.0 Release

```powershell
gh release create v1.0.0 `
  .\release-artifacts\Conservative-Disk-Cleaner-v1.0.0-win-x64.zip `
  .\release-artifacts\Conservative-Disk-Cleaner-v1.0.0-win-x64.zip.sha256 `
  .\release-artifacts\Conservative-Disk-Cleaner-v1.0.0-source.zip `
  .\release-artifacts\Conservative-Disk-Cleaner-v1.0.0-source.zip.sha256 `
  --title "Conservative Disk Cleaner v1.0.0" `
  --notes-file .\RELEASE_NOTES_v1.0.0.md
```

const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const devServerUrl = process.env.DISK_CLEANER_DEV_SERVER;

function projectRoot() {
  return path.resolve(__dirname, "..", "..");
}

function runtimeRoot() {
  if (app.isPackaged) {
    return path.dirname(app.getPath("exe"));
  }

  return projectRoot();
}

function scriptPath() {
  return path.join(runtimeRoot(), "ConservativeDiskCleaner.ps1");
}

function reportsRoot() {
  return path.join(runtimeRoot(), "reports");
}

function debugLog(message) {
  if (process.env.DISK_CLEANER_DEBUG !== "1") {
    return;
  }

  try {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    fs.appendFileSync(path.join(runtimeRoot(), "ui-debug.log"), line, "utf8");
  } catch {
    // Debug logging must never stop the app.
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1220,
    height: 780,
    minWidth: 980,
    minHeight: 680,
    title: "极度保守的磁盘清理助手",
    backgroundColor: "#eef1f5",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    debugLog(`did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`);
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    debugLog(`render-process-gone ${JSON.stringify(details)}`);
  });

  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    debugLog(`console level=${level} ${sourceId}:${line} ${message}`);
  });

  win.webContents.on("did-finish-load", async () => {
    try {
      const info = await win.webContents.executeJavaScript(`({
        title: document.title,
        bodyLength: document.body.innerHTML.length,
        rootChildren: document.getElementById("root")?.children.length || 0,
        rootText: document.getElementById("root")?.innerText?.slice(0, 200) || "",
        scripts: Array.from(document.scripts).map((script) => script.src),
        styles: Array.from(document.styleSheets).length
      })`);
      debugLog(`did-finish-load ${JSON.stringify(info)}`);
    } catch (error) {
      debugLog(`did-finish-load inspect failed ${error.message}`);
    }
  });

  if (devServerUrl) {
    debugLog(`loadURL ${devServerUrl}`);
    win.loadURL(devServerUrl);
  } else {
    const indexPath = path.join(__dirname, "..", "dist", "index.html");
    debugLog(`loadFile ${indexPath}`);
    win.loadFile(indexPath);
  }
}

function latestReportDir() {
  const root = reportsRoot();
  if (!fs.existsSync(root)) return null;

  const entries = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const fullPath = path.join(root, entry.name);
      return { fullPath, time: fs.statSync(fullPath).mtimeMs };
    })
    .filter((entry) => fs.existsSync(path.join(entry.fullPath, "cleanup-plan.json")))
    .sort((left, right) => right.time - left.time);

  return entries.length ? entries[0].fullPath : null;
}

function readJson(filePath, fallback) {
  try {
    const content = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

function normalizeArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function loadLatestReport() {
  const dir = latestReportDir();
  return loadReportFromDir(dir);
}

function loadReportFromDir(dir) {
  if (!dir) {
    debugLog("loadLatestReport no report dir");
    return { reportDir: null, candidates: [], observations: [], summary: [] };
  }

  const report = {
    reportDir: dir,
    candidates: normalizeArray(readJson(path.join(dir, "cleanup-plan.json"), [])),
    observations: normalizeArray(readJson(path.join(dir, "scan-summary.json"), []))
      .flatMap((drive) => normalizeArray(drive.Observations)),
    summary: normalizeArray(readJson(path.join(dir, "scan-summary.json"), []))
  };
  debugLog(`loadLatestReport dir=${dir} candidates=${report.candidates.length} observations=${report.observations.length} summary=${report.summary.length}`);
  return report;
}

function reportDirFromOutput(output) {
  const match = String(output || "").match(/报告目录：(.+)\r?\n/);
  if (!match) return null;
  const dir = match[1].trim();
  return fs.existsSync(path.join(dir, "cleanup-plan.json")) ? dir : null;
}

function isDriveRootPath(value) {
  return /^[A-Za-z]:[\\/]?$/.test(String(value || "").trim());
}

function runPowerShell(args, onData) {
  return new Promise((resolve) => {
    const ps = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath(),
      ...args
    ], {
      cwd: runtimeRoot(),
      windowsHide: true
    });

    let output = "";
    ps.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      output += text;
      onData?.(text);
    });

    ps.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      output += text;
      onData?.(text);
    });

    ps.on("close", (code) => {
      resolve({ code, output });
    });
  });
}

ipcMain.handle("disk:listReports", async () => loadLatestReport());

ipcMain.handle("disk:listDrives", async () => {
  const result = await new Promise((resolve) => {
    const ps = spawn("powershell.exe", [
      "-NoProfile",
      "-Command",
      "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 } | Select-Object DeviceID,VolumeName,@{N='SizeGB';E={[math]::Round($_.Size/1GB,2)}},@{N='FreeGB';E={[math]::Round($_.FreeSpace/1GB,2)}} | ConvertTo-Json -Compress"
    ], { windowsHide: true });

    let output = "";
    ps.stdout.on("data", (chunk) => { output += chunk.toString("utf8"); });
    ps.on("close", () => resolve(output));
  });

  try {
    const parsed = JSON.parse(result || "[]");
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [
      { DeviceID: "C:", VolumeName: "", SizeGB: 0, FreeGB: 0 },
      { DeviceID: "E:", VolumeName: "", SizeGB: 0, FreeGB: 0 }
    ];
  }
});

ipcMain.handle("disk:scan", async (event, options) => {
  const args = ["-Mode", "Scan", "-TargetRoot", options.targetRoot || "E:\\DiskCleanerMoved"];
  if (options.drives && options.drives.trim()) {
    const selectedDrive = String(options.drives)
      .split(",")
      .map((drive) => drive.trim())
      .filter(Boolean)
      .at(0);
    if (selectedDrive) {
      args.push("-Drives", selectedDrive);
    }
  }

  const result = await runPowerShell(args, (text) => {
    event.sender.send("disk:log", text);
  });

  const explicitReportDir = reportDirFromOutput(result.output);
  return { ...result, report: explicitReportDir ? loadReportFromDir(explicitReportDir) : loadLatestReport() };
});

ipcMain.handle("disk:executeLowRisk", async (event, options) => {
  const report = loadLatestReport();
  let planPath = options.planPath || (report.reportDir ? path.join(report.reportDir, "cleanup-plan.json") : null);
  if (!planPath || !fs.existsSync(planPath)) {
    return { code: 2, output: "没有找到可执行的 cleanup-plan.json。", report };
  }

  let tempPlanPath = null;
  const excludePaths = Array.isArray(options.excludePaths) ? options.excludePaths.filter(Boolean) : [];
  if (excludePaths.length > 0) {
    const excluded = new Set(excludePaths.map((item) => String(item).toLowerCase()));
    const originalPlan = normalizeArray(readJson(planPath, []));
    const filteredPlan = originalPlan.filter((item) => !excluded.has(String(item.Path || item.path || "").toLowerCase()));
    tempPlanPath = path.join(app.getPath("temp"), `disk-cleaner-plan-${Date.now()}.json`);
    fs.writeFileSync(tempPlanPath, JSON.stringify(filteredPlan, null, 2), "utf8");
    planPath = tempPlanPath;
  }

  const args = [
    "-Mode", "Execute",
    "-PlanPath", planPath,
    "-TargetRoot", options.targetRoot || "E:\\DiskCleanerMoved",
    "-ConfirmText", "I_UNDERSTAND"
  ];

  const result = await runPowerShell(args, (text) => {
    event.sender.send("disk:log", text);
  });

  if (tempPlanPath) {
    try {
      fs.unlinkSync(tempPlanPath);
    } catch {
      // Temporary plan cleanup is best-effort.
    }
  }

  return { ...result, report: loadLatestReport() };
});

ipcMain.handle("disk:deleteSelectedToRecycleBin", async (event, paths) => {
  const selectedPaths = Array.isArray(paths) ? paths.filter((item) => item && !isDriveRootPath(item)) : [];
  if (selectedPaths.length === 0) {
    return { code: 0, output: "没有勾选任何项目。", report: loadLatestReport() };
  }

  const tempJson = path.join(app.getPath("temp"), `disk-cleaner-delete-${Date.now()}.json`);
  fs.writeFileSync(tempJson, JSON.stringify(selectedPaths), "utf8");

  const command = `
    [Console]::OutputEncoding=[System.Text.Encoding]::UTF8;
    Add-Type -AssemblyName Microsoft.VisualBasic;
    $paths = Get-Content -LiteralPath '${tempJson.replace(/'/g, "''")}' -Raw -Encoding UTF8 | ConvertFrom-Json;
    foreach ($target in $paths) {
      try {
        if (-not (Test-Path -LiteralPath $target)) {
          Write-Host "[跳过] 不存在: $target";
          continue;
        }
        $item = Get-Item -LiteralPath $target -Force;
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
          Write-Host "[跳过] 重解析点/链接/挂载点: $target";
          continue;
        }
        if ($item.PSIsContainer) {
          [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($target, 'OnlyErrorDialogs', 'SendToRecycleBin');
        } else {
          [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($target, 'OnlyErrorDialogs', 'SendToRecycleBin');
        }
        Write-Host "[回收站] $target";
      } catch {
        Write-Host "[失败] $target :: $($_.Exception.Message)";
      }
    }
    Remove-Item -LiteralPath '${tempJson.replace(/'/g, "''")}' -Force -ErrorAction SilentlyContinue;
  `;

  const result = await new Promise((resolve) => {
    const ps = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
      cwd: runtimeRoot(),
      windowsHide: true
    });

    let output = "";
    ps.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      output += text;
      event.sender.send("disk:log", text);
    });
    ps.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      output += text;
      event.sender.send("disk:log", text);
    });
    ps.on("close", (code) => resolve({ code, output }));
  });

  return { ...result, report: loadLatestReport() };
});

ipcMain.handle("disk:openReports", async () => {
  fs.mkdirSync(reportsRoot(), { recursive: true });
  await shell.openPath(reportsRoot());
});

ipcMain.handle("disk:openPath", async (_event, targetPath) => {
  if (targetPath) {
    await shell.openPath(targetPath);
  }
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

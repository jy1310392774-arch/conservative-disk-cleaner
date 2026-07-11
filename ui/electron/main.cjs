const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const devServerUrl = process.env.DISK_CLEANER_DEV_SERVER;
const uninstallEntries = new Map();
const uninstallResiduals = new Map();
const installDirectorySizeCache = new Map();

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

function powershellJsonFile(scriptFile) {
  return new Promise((resolve) => {
    const ps = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptFile], { windowsHide: true });
    let output = "";
    let errorOutput = "";
    ps.stdout.on("data", (chunk) => { output += chunk.toString("utf8"); });
    ps.stderr.on("data", (chunk) => { errorOutput += chunk.toString("utf8"); });
    ps.on("close", (code) => {
      try {
        const parsed = JSON.parse(output.replace(/^\uFEFF/, "").trim() || "[]");
        resolve({ entries: Array.isArray(parsed) ? parsed : [parsed], error: null });
      } catch (error) {
        debugLog(`installed application JSON parse failed: ${error.message}; stderr=${errorOutput.slice(0, 400)}`);
        resolve({ entries: [], error: errorOutput.trim() || `Unable to read Windows uninstall entries (exit code ${code ?? 1}).` });
      }
    });
  });
}

function cleanRegistryText(value) {
  return String(value || "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

function expandWindowsEnvironment(value) {
  return String(value || "").replace(/%([^%]+)%/g, (match, name) => process.env[name] || process.env[name.toUpperCase()] || match);
}

function resolveUninstallCommand(value) {
  const command = expandWindowsEnvironment(value).trim();
  if (!command) return null;
  if (command.startsWith('"')) {
    const closingQuote = command.indexOf('"', 1);
    if (closingQuote < 2) return null;
    return { executable: command.slice(1, closingQuote), arguments: command.slice(closingQuote + 1).trim() };
  }

  const executableMatch = command.match(/^(.+?\.(?:exe|com|bat|cmd))(?=\s|$)/i);
  if (executableMatch) {
    return { executable: executableMatch[1].trim(), arguments: command.slice(executableMatch[1].length).trim() };
  }

  const firstSpace = command.search(/\s/);
  return firstSpace < 0
    ? { executable: command, arguments: "" }
    : { executable: command.slice(0, firstSpace), arguments: command.slice(firstSpace).trim() };
}

function startUninstallerWithWindowsShell(uninstallString) {
  const launch = resolveUninstallCommand(uninstallString);
  if (!launch) return Promise.resolve({ code: 2, launched: false, output: "卸载命令为空或格式无效。" });
  if (path.isAbsolute(launch.executable) && !fs.existsSync(launch.executable)) {
    return Promise.resolve({ code: 2, launched: false, output: `卸载程序不存在：${launch.executable}` });
  }

  const workingDirectory = path.isAbsolute(launch.executable) && fs.existsSync(launch.executable)
    ? path.dirname(launch.executable)
    : runtimeRoot();
  const payload = Buffer.from(JSON.stringify({ ...launch, workingDirectory }), "utf8").toString("base64");
  const script = `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;
    $payload = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}')) | ConvertFrom-Json;
    $params = @{ FilePath = [string]$payload.executable; WorkingDirectory = [string]$payload.workingDirectory; PassThru = $true; ErrorAction = 'Stop' };
    if ($payload.arguments) { $params.ArgumentList = [string]$payload.arguments }
    $process = Start-Process @params;
    [pscustomobject]@{ ProcessId = $process.Id } | ConvertTo-Json -Compress;`;
  const encodedCommand = Buffer.from(script, "utf16le").toString("base64");

  return new Promise((resolve) => {
    const ps = spawn("powershell.exe", ["-NoProfile", "-EncodedCommand", encodedCommand], { windowsHide: true });
    let output = "";
    let errorOutput = "";
    ps.stdout.on("data", (chunk) => { output += chunk.toString("utf8"); });
    ps.stderr.on("data", (chunk) => { errorOutput += chunk.toString("utf8"); });
    ps.on("error", (error) => resolve({ code: 1, launched: false, output: error.message }));
    ps.on("close", (code) => {
      if (code === 0) resolve({ code: 0, launched: true, output: output.trim() || "卸载程序已启动。" });
      else resolve({ code: code ?? 1, launched: false, output: errorOutput.trim() || output.trim() || "Windows 无法启动该卸载程序。" });
    });
  });
}

function canTreatAsInstallDirectory(value) {
  const target = String(value || "").trim();
  if (!target || isDriveRootPath(target)) return false;
  try {
    const stat = fs.lstatSync(target);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

async function measureInstallDirectory(rootPath) {
  const normalizedRoot = String(rootPath || "").toLowerCase();
  if (!canTreatAsInstallDirectory(rootPath)) return null;
  if (installDirectorySizeCache.has(normalizedRoot)) return installDirectorySizeCache.get(normalizedRoot);

  const measurement = (async () => {
    const pending = [rootPath];
    let totalBytes = 0;
    while (pending.length) {
      const current = pending.pop();
      let entries;
      try {
        entries = await fs.promises.readdir(current, { withFileTypes: true });
      } catch {
        continue;
      }

      const fileSizes = await Promise.all(entries.map(async (entry) => {
        if (entry.isSymbolicLink()) return 0;
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          pending.push(fullPath);
          return 0;
        }
        if (!entry.isFile()) return 0;
        try {
          return (await fs.promises.stat(fullPath)).size;
        } catch {
          return 0;
        }
      }));
      totalBytes += fileSizes.reduce((sum, size) => sum + size, 0);
    }
    return totalBytes;
  })();

  installDirectorySizeCache.set(normalizedRoot, measurement);
  return measurement;
}

async function listInstalledApplications() {
  const queryScript = app.isPackaged
    ? path.join(runtimeRoot(), "list-installed-apps.ps1")
    : path.join(__dirname, "list-installed-apps.ps1");
  const result = await powershellJsonFile(queryScript);
  const entries = result.entries;
  const seen = new Set();
  uninstallEntries.clear();
  const apps = entries.map((entry, index) => {
    const name = cleanRegistryText(entry.DisplayName);
    const uninstallString = cleanRegistryText(entry.UninstallString);
    if (!name || !uninstallString) return null;
    const key = `${name}|${uninstallString}`.toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
    const id = `app-${Date.now()}-${index}`;
    const estimatedSizeBytes = Number(entry.EstimatedSize) > 0 ? Number(entry.EstimatedSize) * 1024 : null;
    const installLocation = cleanRegistryText(entry.InstallLocation).replace(/^"|"$/g, "");
    const appEntry = {
      id,
      name,
      version: cleanRegistryText(entry.DisplayVersion),
      publisher: cleanRegistryText(entry.Publisher),
      installLocation,
      uninstallString,
      estimatedSizeBytes,
      sizeStatus: estimatedSizeBytes ? "registered" : installLocation ? "pending" : "unknown",
      registryPath: cleanRegistryText(entry.PSPath)
    };
    uninstallEntries.set(id, appEntry);
    return appEntry;
  }).filter(Boolean).sort((left, right) => left.name.localeCompare(right.name));
  return { apps, error: result.error };
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

ipcMain.handle("uninstall:listApps", async () => listInstalledApplications());

ipcMain.handle("uninstall:measureSizes", async (_event, appIds) => {
  const selected = (Array.isArray(appIds) ? appIds : [])
    .map((appId) => uninstallEntries.get(appId))
    .filter((entry) => entry && !entry.estimatedSizeBytes && entry.installLocation);
  const sizes = {};
  let cursor = 0;
  async function worker() {
    while (cursor < selected.length) {
      const entry = selected[cursor++];
      sizes[entry.id] = await measureInstallDirectory(entry.installLocation);
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, selected.length) }, () => worker()));
  return sizes;
});

ipcMain.handle("uninstall:run", async (_event, appId) => {
  const appEntry = uninstallEntries.get(appId);
  if (!appEntry) return { code: 2, output: "The selected application is no longer available. Refresh the list and try again." };
  return startUninstallerWithWindowsShell(appEntry.uninstallString);
});

ipcMain.handle("uninstall:scanResiduals", async (_event, appId) => {
  const appEntry = uninstallEntries.get(appId);
  if (!appEntry) return { code: 2, candidates: [], output: "The selected application is no longer available." };
  const candidates = [];
  if (canTreatAsInstallDirectory(appEntry.installLocation)) {
    candidates.push({ id: "install-directory", kind: "directory", path: appEntry.installLocation, label: "Registered installation directory", risk: "High" });
  }
  if (appEntry.registryPath && /^Microsoft\.PowerShell\.Core\\Registry::HKEY_(LOCAL_MACHINE|CURRENT_USER)\\/i.test(appEntry.registryPath)) {
    candidates.push({ id: "uninstall-registry-key", kind: "registry", path: appEntry.registryPath, label: "Application uninstall registry entry", risk: "High" });
  }
  uninstallResiduals.set(appId, candidates);
  return { code: 0, candidates, output: candidates.length ? "Review the remaining items before selecting any cleanup action." : "No registered installation directory or uninstall registry entry remains." };
});

ipcMain.handle("uninstall:removeResiduals", async (_event, appId, candidateIds) => {
  const candidates = uninstallResiduals.get(appId) || [];
  const selected = new Set(Array.isArray(candidateIds) ? candidateIds : []);
  const output = [];
  for (const candidate of candidates) {
    if (!selected.has(candidate.id)) continue;
    try {
      if (candidate.kind === "directory") {
        if (!canTreatAsInstallDirectory(candidate.path)) {
          output.push(`[Skipped] ${candidate.path}`);
          continue;
        }
        const command = `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($args[0], 'OnlyErrorDialogs', 'SendToRecycleBin')`;
        await new Promise((resolve) => {
          const ps = spawn("powershell.exe", ["-NoProfile", "-Command", command, candidate.path], { windowsHide: true });
          ps.on("close", (code) => resolve(code));
        });
        output.push(`[Recycle Bin] ${candidate.path}`);
      } else if (candidate.kind === "registry" && /^Microsoft\.PowerShell\.Core\\Registry::HKEY_(LOCAL_MACHINE|CURRENT_USER)\\/i.test(candidate.path)) {
        const command = "Remove-Item -LiteralPath $args[0] -Recurse -Force -ErrorAction Stop";
        const code = await new Promise((resolve) => {
          const ps = spawn("powershell.exe", ["-NoProfile", "-Command", command, candidate.path], { windowsHide: true });
          ps.on("close", resolve);
        });
        output.push(code === 0 ? `[Registry removed] ${candidate.path}` : `[Failed] ${candidate.path}`);
      }
    } catch (error) {
      output.push(`[Failed] ${candidate.path}: ${error.message}`);
    }
  }
  return { code: 0, output: output.join("\n") || "No residual items were selected." };
});

ipcMain.handle("disk:scan", async (event, options) => {
  const scanMode = options.scanMode === "Deep" ? "Deep" : "Fast";
  const args = ["-Mode", "Scan", "-ScanMode", scanMode, "-TargetRoot", options.targetRoot || "E:\\DiskCleanerMoved"];
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

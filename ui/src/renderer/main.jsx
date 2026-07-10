import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import LiquidGlass from "liquid-glass-react";
import {
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  HardDrive,
  ListChecks,
  Play,
  RefreshCw,
  ShieldCheck,
  Trash2
} from "lucide-react";
import { RippleButton } from "@/components/ui/ripple-button";
import { BackgroundGradientAnimation } from "@/components/ui/background-gradient-animation";
import { GlowCard } from "@/components/ui/spotlight-card";
import "./styles.css";

const defaultDrives = "";
const defaultTarget = "E:\\DiskCleanerMoved";

function field(item, name) {
  return item?.[name] ?? item?.[name.charAt(0).toLowerCase() + name.slice(1)];
}

function formatGB(value) {
  const number = Number(value || 0);
  return `${number.toFixed(number >= 10 ? 1 : 2)} GB`;
}

function riskLabel(risk) {
  if (risk === "Low") return "低";
  if (risk === "Medium") return "中";
  if (risk === "High") return "高";
  return risk || "未知";
}

function actionLabel(action) {
  if (action === "Delete") return "删除";
  if (action === "Move") return "移动";
  if (action === "Skip") return "跳过";
  return action || "未知";
}

function isSafeExecutable(item) {
  return field(item, "Risk") === "Low" && field(item, "AutoApproved") === true && ["Delete", "Move"].includes(field(item, "Action"));
}

function selectedRiskDeletePaths(selectedRiskDeletes) {
  return Object.entries(selectedRiskDeletes || {})
    .filter(([, selected]) => selected)
    .map(([pathValue]) => pathValue);
}

function uniqueByPath(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${field(item, "Path")}|${field(item, "Risk")}|${field(item, "Action")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function App() {
  const [drives, setDrives] = useState(defaultDrives);
  const [driveOptions, setDriveOptions] = useState([]);
  const [targetRoot, setTargetRoot] = useState(defaultTarget);
  const [report, setReport] = useState({ candidates: [], observations: [], summary: [], reportDir: null });
  const [busy, setBusy] = useState(false);
  const [activeView, setActiveView] = useState("plan");
  const [log, setLog] = useState("");
  const [status, setStatus] = useState("准备就绪");
  const [selectedRiskDeletes, setSelectedRiskDeletes] = useState({});
  const [progressExpanded, setProgressExpanded] = useState(false);
  const [lastRunResult, setLastRunResult] = useState(null);
  const [dialog, setDialog] = useState(null);
  const shellRef = useRef(null);
  const workspaceRef = useRef(null);

  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    requestAnimationFrame(() => {
      workspaceRef.current?.scrollTo({ top: 0, left: 0 });
    });
    window.diskCleaner?.listReports().then((nextReport) => {
      setReport(nextReport);
    });
    window.diskCleaner?.listDrives().then((items) => {
      const options = (items || []).map((drive) => ({
        id: String(drive.DeviceID || "").replace(":", ""),
        label: drive.DeviceID || "",
        name: drive.VolumeName || "",
        free: drive.FreeGB,
        size: drive.SizeGB
      })).filter((drive) => drive.id);
      setDriveOptions(options);
      if (options.length) {
        setDrives((current) => {
          const valid = new Set(options.map((drive) => drive.id));
          const selected = String(current || "").split(",").map((item) => item.trim()).find((item) => valid.has(item));
          return selected || options[0].id;
        });
      }
    });
    return window.diskCleaner?.onLog((text) => {
      setLog((current) => `${current}${text}`);
      requestAnimationFrame(() => {
        shellRef.current?.scrollTo({ top: shellRef.current.scrollHeight, behavior: "smooth" });
      });
    });
  }, []);

  const candidates = uniqueByPath([...(report.candidates || []), ...(report.observations || [])]);
  const observations = report.observations || [];
  const safeItems = candidates.filter(isSafeExecutable);
  const totalSafeGB = safeItems.reduce((sum, item) => sum + Number(item.SizeGB || 0), 0);
  const mediumCount = candidates.filter((item) => field(item, "Risk") === "Medium").length;
  const highCount = candidates.filter((item) => field(item, "Risk") === "High").length;
  const selectedRiskDeleteCount = selectedRiskDeletePaths(selectedRiskDeletes).length;

  const driveSummary = useMemo(() => {
    return (report.summary || []).map((drive) => ({
      name: drive.Drive,
      free: drive.FreeGB,
      used: drive.UsedGB
    }));
  }, [report]);

  function showConfirm({ title = "请确认", message, confirmText = "确定", cancelText = "取消", danger = false }) {
    return new Promise((resolve) => {
      setDialog({
        title,
        message,
        confirmText,
        cancelText,
        danger,
        onConfirm: () => {
          setDialog(null);
          resolve(true);
        },
        onCancel: () => {
          setDialog(null);
          resolve(false);
        }
      });
    });
  }

  function showAlert({ title = "提示", message, confirmText = "知道了" }) {
    return new Promise((resolve) => {
      setDialog({
        title,
        message,
        confirmText,
        alertOnly: true,
        onConfirm: () => {
          setDialog(null);
          resolve(true);
        },
        onCancel: () => {
          setDialog(null);
          resolve(false);
        }
      });
    });
  }

  async function runScan() {
    setBusy(true);
    setStatus("正在扫描磁盘");
    setLog("");
    setLastRunResult(null);
    setProgressExpanded(false);
    setActiveView("plan");
    const result = await window.diskCleaner.scan({ drives, targetRoot });
    setReport(result.report);
    setLastRunResult({ code: result.code, output: result.output || "" });
    const scannedDrives = (result.report?.summary || []).map((drive) => drive.Drive).filter(Boolean).join("、");
    const foundCount = (result.report?.candidates || []).length;
    setStatus(result.code === 0 ? `扫描完成：${scannedDrives || "所选磁盘"}，发现 ${foundCount} 项` : "扫描遇到问题");
    if (result.code !== 0) setProgressExpanded(true);
    if (result.code === 0) {
      workspaceRef.current?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    }
    setBusy(false);
  }

  async function runExecute() {
    const selectedPaths = selectedRiskDeletePaths(selectedRiskDeletes);
    const ok = await showConfirm({
      title: selectedPaths.length ? "执行并处理勾选项" : "执行低风险清理",
      message: selectedPaths.length
        ? `将执行低风险项，并把 ${selectedPaths.length} 个已勾选项目移入回收站。\n\n如果勾选的是“移动”项，它会从默认移动计划中排除，改为直接移入回收站。确认继续？`
        : "将只执行低风险、可再生缓存项。中高风险和跳过项不会处理。确认继续？",
      confirmText: selectedPaths.length ? "执行并移入回收站" : "执行低风险",
      danger: selectedPaths.length > 0
    });
    if (!ok) return;

    if (selectedPaths.length) {
      const second = await showConfirm({
        title: "第二次确认",
        message: "已勾选项目将移入回收站。请确认你已经打开文件夹检查过这些项目。",
        confirmText: "确认移入回收站",
        danger: true
      });
      if (!second) return;
    }

    setBusy(true);
    setStatus(selectedPaths.length ? "正在执行低风险并处理勾选项目" : "正在执行低风险计划");
    setLog("");
    setLastRunResult(null);
    setProgressExpanded(false);

    let result = null;
    if (safeItems.length > 0) {
      result = await window.diskCleaner.executeLowRisk({ targetRoot, excludePaths: selectedPaths });
      setReport(result.report);
      setLastRunResult({ code: result.code, output: result.output || "" });
      if (result.code !== 0) {
        setStatus("执行低风险时遇到问题，已停止处理中/高风险勾选项");
        setProgressExpanded(true);
        setBusy(false);
        return;
      }
    }

    if (selectedPaths.length) {
      result = await window.diskCleaner.deleteSelectedToRecycleBin(selectedPaths);
      setReport(result.report);
      setSelectedRiskDeletes({});
      setLastRunResult({ code: result.code, output: result.output || "" });
      setStatus(result.code === 0 ? "执行与勾选项目处理完成" : "勾选项目处理遇到问题");
      if (result.code !== 0) setProgressExpanded(true);
    } else if (result) {
      setStatus("执行完成");
    } else {
      setStatus("没有可执行的低风险项目");
    }

    setBusy(false);
  }

  async function runDeleteSelectedRiskItems() {
    const selectedPaths = selectedRiskDeletePaths(selectedRiskDeletes);

    if (!selectedPaths.length) {
      await showAlert({ message: "还没有勾选任何中/高风险项目。" });
      return;
    }

    const first = await showConfirm({
      title: "处理勾选项目",
      message: `你将把 ${selectedPaths.length} 个已勾选项目移入回收站。\n\n默认移动项会改为直接删除到回收站，中/高风险项仍需要你人工确认。确认继续？`,
      confirmText: "继续",
      danger: true
    });
    if (!first) return;

    const second = await showConfirm({
      title: "第二次确认",
      message: "请确认你已经打开文件夹检查过这些项目，并愿意把它们移入回收站。",
      confirmText: "移入回收站",
      danger: true
    });
    if (!second) return;

    setBusy(true);
    setStatus("正在处理勾选的中/高风险项目");
    setLog("");
    setLastRunResult(null);
    setProgressExpanded(false);
    const result = await window.diskCleaner.deleteSelectedToRecycleBin(selectedPaths);
    setReport(result.report);
    setSelectedRiskDeletes({});
    setLastRunResult({ code: result.code, output: result.output || "" });
    setStatus(result.code === 0 ? "勾选项目处理完成" : "勾选项目处理遇到问题");
    if (result.code !== 0) setProgressExpanded(true);
    setBusy(false);
  }

  return (
    <main className="app-shell">
      <BackgroundGradientAnimation />
      <aside className="sidebar">
        <div className="app-title">
          <div className="app-mark"><ShieldCheck size={22} /></div>
          <div>
            <h1>磁盘清理</h1>
            <p>极度保守模式</p>
          </div>
        </div>

        <nav className="nav-list">
          <button className={activeView === "plan" ? "active" : ""} onClick={() => setActiveView("plan")}>
            <ListChecks size={18} /> 清理计划
          </button>
          <button className={activeView === "skipped" ? "active" : ""} onClick={() => setActiveView("skipped")}>
            <AlertTriangle size={18} /> 跳过项
          </button>
          <button className={activeView === "log" ? "active" : ""} onClick={() => setActiveView("log")}>
            <HardDrive size={18} /> 运行日志
          </button>
        </nav>

        <button className="ghost-button" onClick={() => window.diskCleaner.openReports()}>
          <FolderOpen size={17} /> 打开报告目录
        </button>
      </aside>

      <section className="workspace" ref={workspaceRef}>
        <header className="toolbar">
          <div>
            <p className="eyebrow">{status}</p>
            <h2>先扫描，再执行</h2>
          </div>
          <div className="toolbar-actions">
            <button className="icon-button" onClick={runScan} disabled={busy} title="扫描">
              <RefreshCw size={18} className={busy ? "spin" : ""} />
            </button>
            <button className="primary-button" onClick={runExecute} disabled={busy || (safeItems.length === 0 && selectedRiskDeleteCount === 0)}>
              <Play size={17} /> {selectedRiskDeleteCount ? `执行并删除勾选 ${selectedRiskDeleteCount} 项` : "执行低风险"}
            </button>
          </div>
        </header>

        <GlassCard className="control-card">
          <label>
            <span>扫描磁盘（单选）</span>
            <DrivePicker options={driveOptions} value={drives} onChange={setDrives} />
          </label>
          <label>
            <span>移动目标</span>
            <input value={targetRoot} onChange={(event) => setTargetRoot(event.target.value)} />
          </label>
          <button className="scan-button" onClick={runScan} disabled={busy}>
            <RefreshCw size={18} className={busy ? "spin" : ""} /> 开始扫描
          </button>
        </GlassCard>

        <section className="metrics">
          <Metric icon={<Trash2 size={19} />} label="低风险可处理" value={formatGB(totalSafeGB)} />
          <Metric icon={<CheckCircle2 size={19} />} label="中风险" value={`${mediumCount} 项`} />
          <Metric icon={<AlertTriangle size={19} />} label="高风险" value={`${highCount} 项`} />
          <Metric icon={<HardDrive size={19} />} label="报告目录" value={report.reportDir ? "已生成" : "未扫描"} />
        </section>

        <ProgressPanel
          log={log}
          busy={busy}
          result={lastRunResult}
          expanded={progressExpanded}
          onToggleExpanded={() => setProgressExpanded((current) => !current)}
        />

        <GlassCard className="content-card" glowColor="orange">
          {activeView === "plan" && (
            <PlanView
              candidates={candidates}
              driveSummary={driveSummary}
              selectedRiskDeletes={selectedRiskDeletes}
              onToggleRiskDelete={toggleRiskDelete}
              onDeleteSelected={runDeleteSelectedRiskItems}
            />
          )}
          {activeView === "skipped" && (
            <SkippedView
              candidates={candidates}
              observations={observations}
              selectedRiskDeletes={selectedRiskDeletes}
              onToggleRiskDelete={toggleRiskDelete}
            />
          )}
          {activeView === "log" && (
            <pre className="log-view" ref={shellRef}>{log || "暂无运行日志。扫描或执行后会显示 PowerShell 输出。"}</pre>
          )}
        </GlassCard>
      </section>
      <ConfirmDialog dialog={dialog} />
    </main>
  );

  async function toggleRiskDelete(item, checked) {
    const risk = field(item, "Risk");
    const action = field(item, "Action");
    const targetPath = field(item, "Path");
    const isLowMove = risk === "Low" && action === "Move";
    if (!targetPath || (risk === "Low" && !isLowMove)) return;

    if (checked) {
      if (isLowMove) {
        const ok = await showConfirm({
          title: "改为直接删除",
          message: `这个项目默认会被移动到目标盘并建立目录联接。\n\n如果勾选“直接删”，执行时会跳过移动，改为移入回收站。\n\n路径：${targetPath}`,
          confirmText: "直接删到回收站",
          danger: false
        });
        if (!ok) return;
      } else {
      const first = await showConfirm({
        title: `勾选${riskLabel(risk)}风险项目`,
        message: `你正在勾选 ${riskLabel(risk)}风险项目。\n\n路径：${targetPath}\n\n这类内容默认禁止自动处理。确认继续勾选？`,
        confirmText: "继续勾选",
        danger: risk === "High"
      });
      if (!first) return;
      const second = await showConfirm({
        title: "第二次确认",
        message: "你确认要把这个项目加入“待删除”选择吗？\n\n只有点击执行按钮并再次确认后，才会移入回收站。",
        confirmText: "加入待删除",
        danger: risk === "High"
      });
      if (!second) return;
      }
    }

    setSelectedRiskDeletes((current) => ({
      ...current,
      [targetPath]: checked
    }));
  }
}

function GlassCard({ children, className = "", glowColor = "blue" }) {
  return (
    <GlowCard className={`glass-card ${className}`} glowColor={glowColor}>
      <LiquidGlass
        className="liquid-bg"
        blurAmount={0.08}
        saturation={120}
        elasticity={0}
        cornerRadius={18}
        overLight
        style={{ position: "absolute", inset: 0, top: "auto", left: "auto", transform: "none", width: "100%", height: "100%" }}
      >
        <span aria-hidden="true" />
      </LiquidGlass>
      <div className="glass-content">{children}</div>
    </GlowCard>
  );
}

function ConfirmDialog({ dialog }) {
  if (!dialog) return null;

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className={dialog.danger ? "confirm-dialog danger" : "confirm-dialog"} role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <h3 id="confirm-dialog-title">{dialog.title}</h3>
        <p>{dialog.message}</p>
        <div className="dialog-actions">
          {!dialog.alertOnly && (
            <button type="button" className="dialog-secondary" onClick={dialog.onCancel}>
              {dialog.cancelText || "取消"}
            </button>
          )}
          <button type="button" className="dialog-primary" onClick={dialog.onConfirm}>
            {dialog.confirmText || "确定"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DrivePicker({ options, value, onChange }) {
  const selected = String(value || "").trim();

  if (!options.length) {
    return <div className="drive-picker loading">正在读取磁盘...</div>;
  }

  return (
    <div className="drive-picker">
      {options.map((drive) => (
        <RippleButton
          type="button"
          key={drive.id}
          className={selected === drive.id ? "selected" : ""}
          rippleColor={selected === drive.id ? "rgba(255,255,255,0.72)" : "rgba(49,80,100,0.22)"}
          onClick={() => onChange(drive.id)}
          title={`${drive.label} ${drive.name} 可用 ${formatGB(drive.free)} / 总计 ${formatGB(drive.size)}`}
        >
          <span>{drive.label}</span>
          <small>{formatGB(drive.free)} 可用</small>
        </RippleButton>
      ))}
    </div>
  );
}

function Metric({ icon, label, value }) {
  return (
    <GlassCard className="metric" glowColor="green">
      <div className="metric-icon">{icon}</div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </GlassCard>
  );
}

function PlanView({ candidates, driveSummary, selectedRiskDeletes, onToggleRiskDelete, onDeleteSelected }) {
  const safe = candidates.filter(isSafeExecutable);
  const medium = candidates.filter((item) => field(item, "Risk") === "Medium");
  const high = candidates.filter((item) => field(item, "Risk") === "High");
  const selectedCount = Object.values(selectedRiskDeletes || {}).filter(Boolean).length;

  return (
    <>
      <div className="section-header">
        <h3>清理计划</h3>
        <div className="section-actions">
          <span>低风险 {safe.length} 项 · 中风险 {medium.length} 项 · 高风险 {high.length} 项</span>
          <button type="button" onClick={onDeleteSelected} disabled={selectedCount === 0}>
            移入回收站 {selectedCount ? `(${selectedCount})` : ""}
          </button>
        </div>
      </div>
      <div className="drive-row">
        {driveSummary.map((drive) => (
          <div className="drive-chip" key={drive.name}>
            <HardDrive size={16} />
            <span>{drive.name} 盘</span>
            <strong>空闲 {formatGB(drive.free)}</strong>
          </div>
        ))}
      </div>
      <RiskGroup title="低风险" description="可再生缓存或临时文件；默认按动作执行，移动项也可勾选“直接删”改为移入回收站。" items={safe} empty="暂无低风险可执行项。" selectedRiskDeletes={selectedRiskDeletes} onToggleRiskDelete={onToggleRiskDelete} />
      <RiskGroup title="中风险" description="需要人工判断，默认不自动处理；可打开文件夹检查后勾选。" items={medium} empty="暂无中风险项。" selectedRiskDeletes={selectedRiskDeletes} onToggleRiskDelete={onToggleRiskDelete} />
      <RiskGroup title="高风险" description="系统、软件数据、虚拟磁盘、游戏资源或未知大文件，只列出不处理；勾选需要双重确认。" items={high} empty="暂无高风险项。" selectedRiskDeletes={selectedRiskDeletes} onToggleRiskDelete={onToggleRiskDelete} />
    </>
  );
}

function ProgressPanel({ log, busy, result, expanded, onToggleExpanded }) {
  const fullText = log || result?.output || "";
  const lines = fullText.split(/\r?\n/).filter(Boolean);
  const visibleLines = expanded ? lines : lines.slice(-4);
  const hasProblem = result && result.code !== 0;
  const linesRef = useRef(null);
  const stickToBottomRef = useRef(true);

  function updateStickiness() {
    const element = linesRef.current;
    if (!element) return;
    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    stickToBottomRef.current = distanceToBottom < 28;
  }

  useEffect(() => {
    const element = linesRef.current;
    if (!element) return;
    if (!expanded || stickToBottomRef.current) {
      requestAnimationFrame(() => {
        element.scrollTop = element.scrollHeight;
      });
    }
  }, [fullText, expanded, visibleLines.length]);

  async function copyLog() {
    try {
      await navigator.clipboard.writeText(fullText || "暂无日志");
    } catch {
      console.warn("复制失败，可以切到“运行日志”手动选择复制。");
    }
  }

  return (
    <section className={expanded ? "progress-card expanded" : "progress-card"}>
      <div className="progress-head">
        <div>
          <span>{busy ? "实时扫描进度" : hasProblem ? `最近任务遇到问题（退出码 ${result.code}）` : "最近扫描输出"}</span>
          {hasProblem && <small>展开可查看完整错误输出</small>}
        </div>
        {busy && <RefreshCw size={15} className="spin" />}
        <div className="progress-actions">
          <button type="button" onClick={copyLog} disabled={!fullText}>复制日志</button>
          <button type="button" onClick={onToggleExpanded}>{expanded ? "收起" : "展开"}</button>
        </div>
      </div>
      <div className="progress-lines" ref={linesRef} onScroll={updateStickiness}>
        {visibleLines.length ? visibleLines.map((line, index) => <p key={`${line}-${index}`}>{line}</p>) : <p>等待扫描输出...</p>}
      </div>
    </section>
  );
}

function RiskGroup({ title, description, items, empty, selectedRiskDeletes = {}, onToggleRiskDelete }) {
  return (
    <section className="risk-group">
      <div className="risk-group-head">
        <div>
          <h4>{title}</h4>
          <p>{description}</p>
        </div>
        <span>{items.length} 项</span>
      </div>
      <ItemTable items={items} empty={empty} compact selectedRiskDeletes={selectedRiskDeletes} onToggleRiskDelete={onToggleRiskDelete} />
    </section>
  );
}

function SkippedView({ candidates, observations, selectedRiskDeletes, onToggleRiskDelete }) {
  const skipped = [
    ...candidates.filter((item) => field(item, "Action") === "Skip" || field(item, "Risk") !== "Low"),
    ...observations
  ].sort((left, right) => Number(right.SizeGB || 0) - Number(left.SizeGB || 0));

  return (
    <>
      <div className="section-header">
        <h3>刻意跳过</h3>
        <span>{skipped.length} 项需要人工判断</span>
      </div>
      <ItemTable items={skipped} empty="暂无跳过项。" selectedRiskDeletes={selectedRiskDeletes} onToggleRiskDelete={onToggleRiskDelete} />
    </>
  );
}

function describeItem(item) {
  const pathValue = String(field(item, "Path") || "");
  const reason = field(item, "Reason") || "";
  const ext = pathValue.includes(".") ? pathValue.split(".").pop().toLowerCase() : "";

  if (pathValue.endsWith("ext4.vhdx") || ["vhd", "vhdx", "vdi", "vmdk"].includes(ext)) {
    return "虚拟磁盘镜像，可能属于 WSL、Docker 或虚拟机，只建议人工处理";
  }
  if (["mp4", "mov", "mkv", "avi"].includes(ext)) return "大型视频/媒体文件";
  if (["zip", "7z", "rar", "iso"].includes(ext)) return "压缩包或镜像文件";
  if (["exe", "msi"].includes(ext)) return "安装程序或安装包";
  if (pathValue.includes("\\SteamLibrary\\") || pathValue.includes("\\steamapps\\")) return "Steam 游戏文件或游戏资源包";
  if (pathValue.includes("\\Downloads")) return "下载目录，需要你确认里面内容是否还要保留";
  if (pathValue.includes("hiberfil.sys")) return "Windows 休眠文件，使用休眠功能时应保留";
  if (pathValue.includes("pagefile.sys")) return "Windows 虚拟内存页面文件，应保留";
  return reason || "类型不明确，建议打开文件夹人工确认";
}

function parentFolderOf(pathValue) {
  const normalized = String(pathValue || "");
  const index = Math.max(normalized.lastIndexOf("\\"), normalized.lastIndexOf("/"));
  return index > 2 ? normalized.slice(0, index) : normalized;
}

function isDriveRootPath(pathValue) {
  return /^[A-Za-z]:[\\/]?$/.test(String(pathValue || "").trim());
}

function ItemTable({ items, empty, compact = false, selectedRiskDeletes = {}, onToggleRiskDelete }) {
  if (!items.length) {
    return <div className={compact ? "empty-state compact" : "empty-state"}>{empty}</div>;
  }

  return (
    <div className={compact ? "table-wrap compact" : "table-wrap"}>
      <table>
        <thead>
          <tr>
            <th>路径</th>
            <th>大小</th>
            <th>动作</th>
            <th>风险</th>
            <th>文件说明</th>
            <th>原因</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={`${field(item, "Path")}-${index}`}>
              <td className="path-cell" title={field(item, "Path")}>{field(item, "Path")}</td>
              <td>{formatGB(field(item, "SizeGB"))}</td>
              <td><span className={`pill action-${field(item, "Action")}`}>{actionLabel(field(item, "Action"))}</span></td>
              <td><span className={`pill risk-${field(item, "Risk")}`}>{riskLabel(field(item, "Risk"))}</span></td>
              <td>{describeItem(item)}</td>
              <td>{field(item, "Reason")}</td>
              <td>
                <div className="row-actions">
                  <button type="button" onClick={() => window.diskCleaner.openPath(parentFolderOf(field(item, "Path")))}>打开</button>
                  {!isDriveRootPath(field(item, "Path")) && (field(item, "Risk") !== "Low" || field(item, "Action") === "Move") && (
                    <label className="delete-check">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedRiskDeletes[field(item, "Path")])}
                        onChange={(event) => onToggleRiskDelete?.(item, event.target.checked)}
                      />
                      {field(item, "Risk") === "Low" && field(item, "Action") === "Move" ? "直接删" : "删除"}
                    </label>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);

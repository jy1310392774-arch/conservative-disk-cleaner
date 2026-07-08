using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;

namespace ConservativeDiskCleaner
{
    internal static class Program
    {
        private const string ScriptName = "ConservativeDiskCleaner.ps1";
        private const string ConfirmText = "I_UNDERSTAND";

        private static int Main(string[] args)
        {
            Console.OutputEncoding = Encoding.UTF8;
            Console.InputEncoding = Encoding.UTF8;
            Console.Title = "极度保守的磁盘清理助手";

            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string scriptPath = Path.Combine(baseDir, ScriptName);

                if (!File.Exists(scriptPath))
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine("找不到清理引擎脚本：");
                    Console.WriteLine(scriptPath);
                    Console.ResetColor();
                    Console.WriteLine();
                    Console.WriteLine("请确认 EXE 和 ConservativeDiskCleaner.ps1 在同一个目录。");
                    Pause();
                    return 2;
                }

                if (args.Length > 0)
                {
                    return RunCommandLine(scriptPath, args);
                }

                return RunInteractive(scriptPath, baseDir);
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("程序异常：");
                Console.WriteLine(ex.Message);
                Console.ResetColor();
                Pause();
                return 1;
            }
        }

        private static int RunInteractive(string scriptPath, string baseDir)
        {
            while (true)
            {
                PrintHeader();
                Console.WriteLine("请选择操作：");
                Console.WriteLine("  1. 扫描所有固定磁盘（只生成报告，不清理）");
                Console.WriteLine("  2. 扫描指定盘符（例如 C,E,F）");
                Console.WriteLine("  3. 执行最新低风险清理计划");
                Console.WriteLine("  4. 打开报告目录");
                Console.WriteLine("  5. 退出");
                Console.WriteLine();
                Console.Write("输入编号：");

                string choice = (Console.ReadLine() ?? "").Trim();
                Console.WriteLine();

                if (choice == "1")
                {
                    string targetRoot = AskTargetRoot();
                    RunPowerShell(scriptPath, "-Mode", "Scan", "-TargetRoot", targetRoot);
                    Pause();
                }
                else if (choice == "2")
                {
                    Console.Write("请输入盘符，多个用英文逗号分隔（例如 C,E）：");
                    string drives = (Console.ReadLine() ?? "").Trim();
                    if (string.IsNullOrWhiteSpace(drives))
                    {
                        Console.WriteLine("未输入盘符，已取消。");
                        Pause();
                        continue;
                    }

                    string targetRoot = AskTargetRoot();
                    RunPowerShell(scriptPath, "-Mode", "Scan", "-Drives", drives, "-TargetRoot", targetRoot);
                    Pause();
                }
                else if (choice == "3")
                {
                    string planPath = FindLatestPlan(baseDir);
                    if (planPath == null)
                    {
                        Console.WriteLine("没有找到 cleanup-plan.json。请先执行扫描。");
                        Pause();
                        continue;
                    }

                    Console.ForegroundColor = ConsoleColor.Yellow;
                    Console.WriteLine("将执行最新计划中的低风险自动项：");
                    Console.WriteLine(planPath);
                    Console.WriteLine();
                    Console.WriteLine("不会执行中风险、高风险或 Skip 项。");
                    Console.ResetColor();
                    Console.Write("确认执行请输入 I_UNDERSTAND：");
                    string confirm = (Console.ReadLine() ?? "").Trim();
                    if (confirm != ConfirmText)
                    {
                        Console.WriteLine("确认文本不匹配，已取消。");
                        Pause();
                        continue;
                    }

                    string targetRoot = AskTargetRoot();
                    RunPowerShell(scriptPath, "-Mode", "Execute", "-PlanPath", planPath, "-TargetRoot", targetRoot, "-ConfirmText", ConfirmText);
                    Pause();
                }
                else if (choice == "4")
                {
                    string reports = Path.Combine(baseDir, "reports");
                    Directory.CreateDirectory(reports);
                    Process.Start("explorer.exe", reports);
                }
                else if (choice == "5")
                {
                    return 0;
                }
                else
                {
                    Console.WriteLine("无效选择。");
                    Pause();
                }
            }
        }

        private static int RunCommandLine(string scriptPath, string[] args)
        {
            string mode = GetOption(args, "--mode") ?? GetOption(args, "-mode");
            string drives = GetOption(args, "--drives") ?? GetOption(args, "-drives");
            string targetRoot = GetOption(args, "--target") ?? GetOption(args, "-target") ?? @"E:\DiskCleanerMoved";
            string planPath = GetOption(args, "--plan") ?? GetOption(args, "-plan");
            string confirm = GetOption(args, "--confirm") ?? GetOption(args, "-confirm");

            if (string.Equals(mode, "scan", StringComparison.OrdinalIgnoreCase))
            {
                if (string.IsNullOrWhiteSpace(drives))
                {
                    return RunPowerShell(scriptPath, "-Mode", "Scan", "-TargetRoot", targetRoot);
                }

                return RunPowerShell(scriptPath, "-Mode", "Scan", "-Drives", drives, "-TargetRoot", targetRoot);
            }

            if (string.Equals(mode, "execute", StringComparison.OrdinalIgnoreCase))
            {
                if (string.IsNullOrWhiteSpace(planPath))
                {
                    Console.WriteLine("执行模式需要 --plan <cleanup-plan.json>。");
                    return 2;
                }

                if (confirm != ConfirmText)
                {
                    Console.WriteLine("执行模式需要 --confirm I_UNDERSTAND。");
                    return 2;
                }

                return RunPowerShell(scriptPath, "-Mode", "Execute", "-PlanPath", planPath, "-TargetRoot", targetRoot, "-ConfirmText", ConfirmText);
            }

            PrintUsage();
            return 2;
        }

        private static int RunPowerShell(string scriptPath, params string[] scriptArgs)
        {
            string powershell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"WindowsPowerShell\v1.0\powershell.exe");
            if (!File.Exists(powershell))
            {
                powershell = "powershell.exe";
            }

            var arguments = new StringBuilder();
            arguments.Append("-NoProfile -ExecutionPolicy Bypass -File ");
            arguments.Append(Quote(scriptPath));

            foreach (string arg in scriptArgs)
            {
                arguments.Append(" ");
                arguments.Append(Quote(arg));
            }

            var startInfo = new ProcessStartInfo
            {
                FileName = powershell,
                Arguments = arguments.ToString(),
                UseShellExecute = false
            };

            using (Process process = Process.Start(startInfo))
            {
                process.WaitForExit();
                return process.ExitCode;
            }
        }

        private static string AskTargetRoot()
        {
            Console.Write(@"移动缓存的目标目录（直接回车默认 E:\DiskCleanerMoved）：");
            string input = (Console.ReadLine() ?? "").Trim().Trim('"');
            return string.IsNullOrWhiteSpace(input) ? @"E:\DiskCleanerMoved" : input;
        }

        private static string FindLatestPlan(string baseDir)
        {
            string reports = Path.Combine(baseDir, "reports");
            if (!Directory.Exists(reports))
            {
                return null;
            }

            return Directory.GetFiles(reports, "cleanup-plan.json", SearchOption.AllDirectories)
                .Select(path => new FileInfo(path))
                .OrderByDescending(file => file.LastWriteTimeUtc)
                .Select(file => file.FullName)
                .FirstOrDefault();
        }

        private static string GetOption(string[] args, string name)
        {
            for (int index = 0; index < args.Length; index++)
            {
                if (!string.Equals(args[index], name, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                if (index + 1 < args.Length)
                {
                    return args[index + 1];
                }
            }

            return null;
        }

        private static string Quote(string value)
        {
            if (value == null)
            {
                return "\"\"";
            }

            return "\"" + value.Replace("\"", "\\\"") + "\"";
        }

        private static void PrintHeader()
        {
            Console.Clear();
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("============================================================");
            Console.WriteLine("  极度保守的磁盘清理助手");
            Console.WriteLine("============================================================");
            Console.ResetColor();
            Console.WriteLine();
            Console.WriteLine("默认原则：先扫描、再看计划、最后才执行。");
            Console.WriteLine("自动执行只处理低风险、可再生缓存。");
            Console.WriteLine();
        }

        private static void PrintUsage()
        {
            Console.WriteLine("用法：");
            Console.WriteLine("  ConservativeDiskCleaner.exe");
            Console.WriteLine("  ConservativeDiskCleaner.exe --mode scan --drives C,E --target E:\\DiskCleanerMoved");
            Console.WriteLine("  ConservativeDiskCleaner.exe --mode execute --plan <cleanup-plan.json> --target E:\\DiskCleanerMoved --confirm I_UNDERSTAND");
        }

        private static void Pause()
        {
            Console.WriteLine();
            Console.Write("按 Enter 继续...");
            Console.ReadLine();
        }
    }
}

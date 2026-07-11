[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$roots = @(
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
)

$apps = Get-ItemProperty -Path $roots -ErrorAction SilentlyContinue |
  Where-Object {
    $_.DisplayName -and
    $_.UninstallString -and
    -not $_.SystemComponent
  } |
  Select-Object DisplayName, DisplayVersion, Publisher, InstallLocation, UninstallString, PSPath

@($apps) | ConvertTo-Json -Compress -Depth 3

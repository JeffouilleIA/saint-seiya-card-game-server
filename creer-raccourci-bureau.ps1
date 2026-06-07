# Cree un raccourci "Saint Seiya Serveur" sur le bureau Windows
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$batPath = Join-Path $projectDir "Lancer Serveur.bat"
$desktop = [Environment]::GetFolderPath("Desktop")
$lnkPath = Join-Path $desktop "Saint Seiya Serveur.lnk"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)
$shortcut.TargetPath = $batPath
$shortcut.WorkingDirectory = $projectDir
$shortcut.WindowStyle = 1
$shortcut.Description = "Lancer Chevalier TCG sur le réseau local (port 3000)"
$shortcut.Save()

Write-Host "Raccourci cree : $lnkPath"

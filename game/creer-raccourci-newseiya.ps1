# Crée un raccourci "NewSeiya" sur le bureau Windows
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$batPath = Join-Path $projectDir "Lancer Chevalier.bat"
$desktop = [Environment]::GetFolderPath("Desktop")
$lnkPath = Join-Path $desktop "NewSeiya.lnk"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)
$shortcut.TargetPath = $batPath
$shortcut.WorkingDirectory = $projectDir
$shortcut.WindowStyle = 1
$shortcut.Description = "Lancer Chevalier TCG (NewSeiya)"
$shortcut.Save()

Write-Host "Raccourci cree : $lnkPath"

# Cr�e un raccourci "Chevalier TCG" sur le bureau Windows
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$batPath = Join-Path $projectDir "Lancer Chevalier.bat"
$desktop = [Environment]::GetFolderPath("Desktop")
$lnkPath = Join-Path $desktop "Chevalier TCG.lnk"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)
$shortcut.TargetPath = $batPath
$shortcut.WorkingDirectory = $projectDir
$shortcut.WindowStyle = 1
$shortcut.Description = "Lancer Chevalier TCG dans Chrome"
$shortcut.Save()

Write-Host "Raccourci cree : $lnkPath"

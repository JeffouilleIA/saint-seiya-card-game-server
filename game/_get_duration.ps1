$p = Join-Path $PSScriptRoot 'sons\AndroNoir1.mp4'
$out = Join-Path $PSScriptRoot '_probe_result.txt'
$exists = Test-Path -LiteralPath $p
$ms = $null
if ($exists) {
    $ffprobe = Get-Command ffprobe -ErrorAction SilentlyContinue
    if ($ffprobe) {
        $dur = & ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 -i $p 2>$null
        if ($dur -match '^\d') { $ms = [math]::Round([double]$dur * 1000) }
    }
    if ($null -eq $ms) {
        Add-Type -AssemblyName presentationCore
        $m = New-Object System.Windows.Media.MediaPlayer
        $m.Open([uri]$p)
        $sw = [Diagnostics.Stopwatch]::StartNew()
        while (-not $m.NaturalDuration.HasTimeSpan -and $sw.ElapsedMilliseconds -lt 8000) {
            Start-Sleep -Milliseconds 50
        }
        if ($m.NaturalDuration.HasTimeSpan) {
            $ms = [math]::Round($m.NaturalDuration.TimeSpan.TotalMilliseconds)
        }
        $m.Close()
    }
}
@("exists=$exists", "ms=$ms", "path=$p") | Set-Content -Path $out -Encoding utf8

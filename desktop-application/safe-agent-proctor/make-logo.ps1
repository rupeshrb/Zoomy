Add-Type -AssemblyName System.Drawing

# Output into the (restructured) desktop app's resources folder.
$outDir = 'C:\Users\E0853922\Jira\project\zoomy\desktop-application\safe-agent-proctor\src\main\resources'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }

function New-RoundRect([double]$x, [double]$y, [double]$w, [double]$h, [double]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $r
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

# Render the Zoomy 4-dot mark at any pixel size onto a transparent bitmap.
function Render-Logo([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  # Four uniformly-rounded color squares (blue / red / green / yellow),
  # transparent background, no tile border. Scales with $size.
  $pad = $size * 0.086
  $gap = $size * 0.055
  $d   = ($size - 2 * $pad - $gap) / 2.0
  $r   = $d * 0.27
  $x0 = $pad
  $x1 = $pad + $d + $gap
  $y0 = $pad
  $y1 = $pad + $d + $gap

  $dots = @(
    @($x0, $y0, '4285f4'),   # top-left  blue
    @($x1, $y0, 'ea4335'),   # top-right red
    @($x0, $y1, '34a853'),   # bottom-left green
    @($x1, $y1, 'fbbc05')    # bottom-right yellow
  )
  foreach ($dot in $dots) {
    $hex = $dot[2]
    $col = [System.Drawing.Color]::FromArgb(255,
      [Convert]::ToInt32($hex.Substring(0,2),16),
      [Convert]::ToInt32($hex.Substring(2,2),16),
      [Convert]::ToInt32($hex.Substring(4,2),16))
    $brush = New-Object System.Drawing.SolidBrush $col
    $rr = New-RoundRect $dot[0] $dot[1] $d $d $r
    $g.FillPath($brush, $rr)
    $brush.Dispose(); $rr.Dispose()
  }
  $g.Dispose()
  return $bmp
}

# ---- 1. Save the master 256px PNG (used as the in-app + taskbar icon) ----
$png = Join-Path $outDir 'zoomy-logo.png'
$master = Render-Logo 256
$master.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
$master.Dispose()
"SAVED $png"

# ---- 2. Build a multi-resolution .ico (PNG-encoded entries) for jpackage ----
# Modern Windows .ico supports PNG-compressed images per entry; we embed the
# common sizes so the exe / shortcut / taskbar all look crisp.
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$pngBlobs = @()
foreach ($s in $sizes) {
  $b = Render-Logo $s
  $ms = New-Object System.IO.MemoryStream
  $b.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngBlobs += ,($ms.ToArray())
  $ms.Dispose(); $b.Dispose()
}

$icoPath = Join-Path $outDir 'zoomy-logo.ico'
$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter $fs

# ICONDIR header
$bw.Write([UInt16]0)                 # reserved
$bw.Write([UInt16]1)                 # type = icon
$bw.Write([UInt16]$sizes.Count)      # image count

# ICONDIRENTRY table — image data starts after header + all 16-byte entries
$offset = 6 + (16 * $sizes.Count)
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $s = $sizes[$i]
  $blob = $pngBlobs[$i]
  $dim = if ($s -ge 256) { 0 } else { $s }   # 0 means 256 in the ICO spec
  $bw.Write([Byte]$dim)                       # width
  $bw.Write([Byte]$dim)                       # height
  $bw.Write([Byte]0)                          # palette count
  $bw.Write([Byte]0)                          # reserved
  $bw.Write([UInt16]1)                        # color planes
  $bw.Write([UInt16]32)                       # bits per pixel
  $bw.Write([UInt32]$blob.Length)             # size of image data
  $bw.Write([UInt32]$offset)                  # offset of image data
  $offset += $blob.Length
}
# Image data blobs
foreach ($blob in $pngBlobs) { $bw.Write($blob) }
$bw.Flush(); $bw.Close(); $fs.Close()
"SAVED $icoPath ($($sizes -join ',') px)"

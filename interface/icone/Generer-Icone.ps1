# Genere prospection.ico (16 a 256 px) : meme dessin que favicon.svg (carre sombre arrondi + enveloppe "+").
param([string]$Sortie)
Add-Type -AssemblyName System.Drawing
function Dessiner([int]$t) {
    $b = New-Object System.Drawing.Bitmap $t, $t, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($b)
    $g.SmoothingMode = "AntiAlias"; $g.PixelOffsetMode = "HighQuality"; $g.Clear([System.Drawing.Color]::Transparent)
    $e = $t / 32.0                                   # unites du favicon (viewBox 32)
    # fond : carre arrondi (rx 7)
    $r = 7 * $e; $fond = New-Object System.Drawing.Drawing2D.GraphicsPath
    $fond.AddArc(0, 0, 2*$r, 2*$r, 180, 90); $fond.AddArc($t-2*$r, 0, 2*$r, 2*$r, 270, 90)
    $fond.AddArc($t-2*$r, $t-2*$r, 2*$r, 2*$r, 0, 90); $fond.AddArc(0, $t-2*$r, 2*$r, 2*$r, 90, 90); $fond.CloseFigure()
    $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 24, 24, 27))), $fond)
    # icone lucide (viewBox 24) placee comme dans le favicon : translate(5,5) scale(0.9166)
    $k = 0.9166 * $e; $o = 5 * $e
    function P($x, $y) { New-Object System.Drawing.PointF ([single]($o + $x * $k)), ([single]($o + $y * $k)) }
    $epais = [Math]::Max(1.2, 2.2 * $k)
    $stylo = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([single]$epais)
    $stylo.StartCap = "Round"; $stylo.EndCap = "Round"; $stylo.LineJoin = "Round"
    # contour : M22 13 V6 a2 2 0 0 0 -2 -2 H4 a2 2 0 0 0 -2 2 v12 c0 1.1 .9 2 2 2 h8
    $c = New-Object System.Drawing.Drawing2D.GraphicsPath
    $c.AddLine((P 22 13), (P 22 6)); $c.AddArc([single]($o + 18*$k), [single]($o + 4*$k), [single](4*$k), [single](4*$k), 0, -90)
    $c.AddLine((P 20 4), (P 4 4)); $c.AddArc([single]($o + 2*$k), [single]($o + 4*$k), [single](4*$k), [single](4*$k), 270, -90)
    $c.AddLine((P 2 6), (P 2 18)); $c.AddArc([single]($o + 2*$k), [single]($o + 16*$k), [single](4*$k), [single](4*$k), 180, -90)
    $c.AddLine((P 4 20), (P 12 20))
    $g.DrawPath($stylo, $c)
    # rabat : m22 7 -8.97 5.7 (arrondi en bas) puis jusqu'a 2 7
    $g.DrawLines($stylo, [System.Drawing.PointF[]]@((P 22 7), (P 13.03 12.7), (P 12 13), (P 10.97 12.7), (P 2 7)))
    # signe + : M19 16 v6 ; M16 19 h6
    $g.DrawLine($stylo, (P 19 16), (P 19 22)); $g.DrawLine($stylo, (P 16 19), (P 22 19))
    $g.Dispose(); return $b
}
$tailles = 16, 24, 32, 48, 64, 256
$images = foreach ($t in $tailles) { $m = New-Object IO.MemoryStream; $bmp = Dessiner $t; $bmp.Save($m, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose(); , $m.ToArray() }
# fichier ICO : en-tete + repertoire + images PNG (format accepte depuis Windows Vista)
$f = New-Object IO.MemoryStream; $w = New-Object IO.BinaryWriter $f
$w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]$tailles.Count)
$decalage = 6 + 16 * $tailles.Count
for ($i = 0; $i -lt $tailles.Count; $i++) {
    $t = $tailles[$i]; $d = if ($t -ge 256) { 0 } else { $t }
    $w.Write([byte]$d); $w.Write([byte]$d); $w.Write([byte]0); $w.Write([byte]0); $w.Write([UInt16]1); $w.Write([UInt16]32)
    $w.Write([UInt32]$images[$i].Length); $w.Write([UInt32]$decalage); $decalage += $images[$i].Length
}
foreach ($img in $images) { $w.Write($img) }
[IO.File]::WriteAllBytes($Sortie, $f.ToArray())
# apercu 256 px pour verification
$bmp = Dessiner 256; $bmp.Save([IO.Path]::ChangeExtension($Sortie, ".apercu.png"), [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
"ok $((Get-Item $Sortie).Length) octets"

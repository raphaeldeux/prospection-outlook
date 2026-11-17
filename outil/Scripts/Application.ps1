# Lance Prospection Outlook comme une application, SANS fenetre noire :
#   - demarre le serveur (Serveur-Interface.ps1) en arriere-plan, son journal va dans Journal\interface.log ;
#   - ouvre l'interface dans une fenetre Edge sans onglets ni barre d'adresse (mode "application") ;
#   - affiche une icone pres de l'horloge : Ouvrir Prospection, Journal, Quitter.
# Le serveur s'arrete seul quelques minutes apres la fermeture de la fenetre ; l'icone disparait alors.
# Un deuxieme lancement (raccourci double-clique) ne demarre rien de plus : il rouvre seulement la fenetre.
#
# Lance par le raccourci "Prospection Outlook" (conhost.exe --headless : aucune console visible) ou par
# Interface.bat. Pour le depannage, "Interface.bat /console" lance le serveur dans une fenetre noire.

param(
    [int]$Port = 8765,
    [switch]$SansFenetre   # ne pas ouvrir la fenetre (redemarrage apres mise a jour : la page ouverte se recharge seule)
)

$ErrorActionPreference = "Stop"
$racine = Split-Path -Parent $PSScriptRoot
$url = "http://localhost:$Port/"
$journal = Join-Path $racine "Journal\interface.log"
$minutesAvantArret = 5
$sansFenetre = $SansFenetre -or $env:PROSPECTION_SANS_NAVIGATEUR -eq "1"
$env:PROSPECTION_SANS_NAVIGATEUR = $null
Add-Type -AssemblyName System.Windows.Forms, System.Drawing

function Test-Serveur {
    # Vrai si un serveur repond sur le port, meme une ancienne version sans /api/ping (reponse d'erreur HTTP)
    try { Invoke-RestMethod "$($url)api/ping" -Headers @{ "X-Prospection" = "1" } -TimeoutSec 3 | Out-Null; return $true }
    catch { return $null -ne $_.Exception.Response }
}

function Open-Fenetre {
    # Edge en mode application (fenetre dediee, icone propre dans la barre des taches) ; a defaut, le navigateur par defaut
    $edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") |
        Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($edge) { Start-Process $edge -ArgumentList "--app=$url", "--window-size=1400,900" }
    else { Start-Process $url }
}

function Show-Erreur([string]$Message) {
    [void][System.Windows.Forms.MessageBox]::Show($Message, "Prospection Outlook", "OK", "Error")
}

# ---------- Une seule instance ----------
$mutex = New-Object System.Threading.Mutex($false, "Local\ProspectionOutlook-$Port")
$proprietaire = $false
try { $proprietaire = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $proprietaire = $true }
if (-not $proprietaire) {
    # Deja lance (ou en train de demarrer) : on attend qu'il reponde et on rouvre seulement la fenetre. Si l'autre
    # lanceur se termine entre-temps (redemarrage apres une mise a jour), on prend sa place.
    for ($i = 0; $i -lt 30 -and -not $proprietaire; $i++) {
        if (Test-Serveur) { if (-not $sansFenetre) { Open-Fenetre }; exit 0 }
        try { $proprietaire = $mutex.WaitOne(500) } catch [System.Threading.AbandonedMutexException] { $proprietaire = $true }
    }
    if (-not $proprietaire) {
        Show-Erreur "Prospection Outlook semble deja lance, mais ne repond pas. Quitte-le avec l'icone pres de l'horloge, puis relance-le."
        exit 1
    }
}

try {
    if (Test-Serveur) {
        # serveur lance a la main (Interface.bat /console) : il n'y a qu'a ouvrir la fenetre
        if (-not $sansFenetre) { Open-Fenetre }
        exit 0
    }

    # ---------- Serveur en arriere-plan, sans fenetre ----------
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "powershell.exe"
    $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\Serveur-Interface.ps1`" -Port $Port -SansNavigateur -ArretSiInactif $minutesAvantArret -Journal `"$journal`""
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $script:serveur = [System.Diagnostics.Process]::Start($psi)

    $pret = $false
    for ($i = 0; $i -lt 60 -and -not $script:serveur.HasExited; $i++) {
        if (Test-Serveur) { $pret = $true; break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $pret) {
        if (-not $script:serveur.HasExited) { Stop-Process -Id $script:serveur.Id -Force -ErrorAction SilentlyContinue }
        Show-Erreur "L'interface n'a pas pu demarrer (le port $Port est peut-etre deja utilise).`n`nDetails dans le journal :`n$journal"
        exit 1
    }
    if (-not $sansFenetre) { Open-Fenetre }

    # ---------- Icone pres de l'horloge ----------
    $fichierIcone = Join-Path $racine "Interface\app\prospection.ico"
    $script:icone = New-Object System.Windows.Forms.NotifyIcon
    $script:icone.Icon = if (Test-Path $fichierIcone) { New-Object System.Drawing.Icon($fichierIcone, 16, 16) } else { [System.Drawing.SystemIcons]::Application }
    $script:icone.Text = "Prospection Outlook"
    $menu = New-Object System.Windows.Forms.ContextMenuStrip
    $ouvrir = $menu.Items.Add("Ouvrir Prospection")
    $ouvrir.Font = New-Object System.Drawing.Font($ouvrir.Font, [System.Drawing.FontStyle]::Bold)
    $ouvrir.add_Click({ Open-Fenetre })
    $menu.Items.Add("Journal").add_Click({ if (Test-Path $journal) { Start-Process notepad.exe -ArgumentList "`"$journal`"" } })
    [void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
    $menu.Items.Add("Quitter").add_Click({
        if (-not $script:serveur.HasExited) { Stop-Process -Id $script:serveur.Id -Force -ErrorAction SilentlyContinue }
        $script:icone.Visible = $false
        [System.Windows.Forms.Application]::Exit()
    })
    $script:icone.ContextMenuStrip = $menu
    $script:icone.add_MouseClick({ param($s, $e) if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) { Open-Fenetre } })
    $script:icone.Visible = $true

    # Le serveur s'est arrete (fenetre fermee depuis un moment, mise a jour, erreur) : l'icone disparait
    $minuteur = New-Object System.Windows.Forms.Timer
    $minuteur.Interval = 2000
    $minuteur.add_Tick({
        if ($script:serveur.HasExited) {
            $script:icone.Visible = $false
            [System.Windows.Forms.Application]::Exit()
        }
    })
    $minuteur.Start()
    [System.Windows.Forms.Application]::Run()
} finally {
    if ($script:icone) { $script:icone.Visible = $false; $script:icone.Dispose() }
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}

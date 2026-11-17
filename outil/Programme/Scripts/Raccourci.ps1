# Cree (ou recree) un raccourci "Prospection Outlook" qui lance l'application sans fenetre noire, avec l'icone
# de l'outil. Utilise par l'installeur (Bureau, menu Demarrer, dossier Prospection), par Deployer.ps1 et par
# Application.ps1 (qui recree celui du dossier Prospection s'il manque ou si le dossier a ete deplace).
#   .\Raccourci.ps1 -Lien "C:\...\Prospection\Prospection Outlook.lnk"
param(
    [Parameter(Mandatory = $true)] [string]$Lien,
    [string]$Dossier = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))   # dossier Prospection
)
$ErrorActionPreference = "Stop"
$lanceur = Join-Path $Dossier "Programme\Scripts\Application.ps1"
$conhost = Join-Path $env:SystemRoot "System32\conhost.exe"
$icone = Join-Path $Dossier "Programme\Interface\app\prospection.ico"
$r = (New-Object -ComObject WScript.Shell).CreateShortcut($Lien)
if (Test-Path $conhost) {
    # conhost --headless : aucune console visible, pas meme un instant
    $r.TargetPath = $conhost
    $r.Arguments = "--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$lanceur`""
} else {
    $r.TargetPath = Join-Path $Dossier "Programme\Interface.bat"
    $r.Arguments = ""
}
$r.WorkingDirectory = $Dossier
$r.IconLocation = if (Test-Path $icone) { "$icone,0" } else { "$env:SystemRoot\System32\shell32.dll,156" }
$r.Description = "Prospection Outlook"
$r.Save()
# Copie l'outil (dossier outil\ du depot) vers un dossier de travail, par exemple ton dossier OneDrive.
#
# Ne touche JAMAIS a tes campagnes : seuls les scripts, les boutons .bat, le LisezMoi, l'interface
# compilee et la campagne modele (_Modele campagne) sont mis a jour.
#
#   .\Deployer.ps1 -Cible "C:\Users\moi\OneDrive\Prospection"
#
# Pour modifier l'interface avant de deployer : cd interface ; npm install ; npm run build

param(
    [Parameter(Mandatory = $true)]
    [string]$Cible
)

$ErrorActionPreference = "Stop"
$source = Join-Path $PSScriptRoot "outil"
if (-not (Test-Path (Join-Path $source "Interface\app\index.html"))) {
    throw "Interface non compilee : lance 'npm run build' dans le dossier interface\ avant de deployer."
}
New-Item -ItemType Directory -Force $Cible | Out-Null

function Copier {
    param([string]$Relatif, [switch]$Miroir)
    $de = Join-Path $source $Relatif
    $vers = Join-Path $Cible $Relatif
    $options = @("/E", "/NFL", "/NDL", "/NJH", "/NJS", "/NP")
    if ($Miroir) { $options[0] = "/MIR" }   # supprime aussi les fichiers devenus inutiles
    & robocopy $de $vers @options | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Echec de la copie de $Relatif (robocopy code $LASTEXITCODE)" }
    Write-Host "  $Relatif"
}

Write-Host "Deploiement vers $Cible :"
Copier "Scripts"
Copier "Interface\app" -Miroir
Copier "Campagnes\_Modele campagne" -Miroir
foreach ($f in Get-ChildItem $source -File) {
    Copy-Item $f.FullName (Join-Path $Cible $f.Name) -Force
    Write-Host "  $($f.Name)"
}
Copy-Item (Join-Path $PSScriptRoot "Installer.bat") (Join-Path $Cible "Installer ou mettre a jour.bat") -Force
Write-Host "  Installer ou mettre a jour.bat"
# version.txt, au meme format que l'installeur : dernier commit touchant outil/ (+local si modifications
# non commitees, pour que l'installeur ne la confonde pas avec la version publiee)
# Les versions publiees sont les tags de release (vX.Y.Z) : version.txt porte le dernier tag si outil/ n'a
# pas change depuis, sinon "<tag>+local" (la page Parametres proposera alors la version publiee).
try {
    # "Continue" : sans tag local, git ecrit sur stderr, ce qui interromprait le bloc avec "Stop"
    $ErrorActionPreference = "Continue"
    & git -C $PSScriptRoot fetch --tags --quiet 2>$null   # tags des releases publiees (hors ligne : ignore)
    $tag = (& git -C $PSScriptRoot describe --tags --abbrev=0 --match "v*" 2>$null)
    $date = (& git -C $PSScriptRoot log -1 --format=%cd --date=format:%d/%m/%Y -- outil).Trim()
    if ($tag) {
        $tag = $tag.Trim()
        $modifie = (& git -C $PSScriptRoot diff --name-only $tag HEAD -- outil) -or (& git -C $PSScriptRoot status --porcelain -- outil)
        $version = if ($modifie) { "$tag+local" } else { $tag }
    } else {
        $version = (& git -C $PSScriptRoot log -1 --format=%h -- outil).Trim() + "+local"
    }
    Set-Content (Join-Path $Cible "version.txt") "$version $date" -Encoding ASCII; Write-Host "  version.txt ($version)"
} catch {
    Write-Host "  version.txt non mis a jour : $($_.Exception.Message)" -ForegroundColor Yellow
}
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force (Join-Path $Cible "Campagnes") | Out-Null
Write-Host "Termine. Tes campagnes n'ont pas ete modifiees."

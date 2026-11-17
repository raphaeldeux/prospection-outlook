# Copie l'outil (dossier outil\ du depot) vers un dossier de travail, par exemple ton dossier OneDrive.
# Meme organisation que l'installeur : a la racine, le raccourci "Prospection Outlook", Campagnes\ et LisezMoi.txt ;
# tout l'outil dans Programme\. Un dossier a l'ancienne organisation est range (Programme\Scripts\Migrer-Dossier.ps1).
#
# Ne touche JAMAIS aux donnees de tes campagnes.
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
if (-not (Test-Path (Join-Path $source "Programme\Interface\app\index.html"))) {
    throw "Interface non compilee : lance 'npm run build' dans le dossier interface\ avant de deployer."
}
New-Item -ItemType Directory -Force $Cible | Out-Null
$ancienneOrganisation = Test-Path (Join-Path $Cible "Scripts\Serveur-Interface.ps1")

Write-Host "Deploiement vers $Cible :"
# Programme\ en miroir (supprime les fichiers devenus inutiles), sauf le journal et les anciens scripts
& robocopy (Join-Path $source "Programme") (Join-Path $Cible "Programme") /MIR /XD Journal "Anciens scripts" /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Echec de la copie de Programme (robocopy code $LASTEXITCODE)" }
Write-Host "  Programme\"
foreach ($f in Get-ChildItem $source -File) {
    Copy-Item $f.FullName (Join-Path $Cible $f.Name) -Force
    Write-Host "  $($f.Name)"
}
Copy-Item (Join-Path $PSScriptRoot "Installer.bat") (Join-Path $Cible "Programme\Installer ou mettre a jour.bat") -Force
Write-Host "  Programme\Installer ou mettre a jour.bat"

# version.txt (Programme\), au meme format que l'installeur. Les versions publiees sont les tags de release
# (vX.Y.Z) : le dernier tag si outil/ n'a pas change depuis, sinon "<tag>+local" (la page Parametres proposera
# alors la version publiee).
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
    Set-Content (Join-Path $Cible "Programme\version.txt") "$version $date" -Encoding ASCII; Write-Host "  version.txt ($version)"
} catch {
    Write-Host "  version.txt non mis a jour : $($_.Exception.Message)" -ForegroundColor Yellow
}
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force (Join-Path $Cible "Campagnes") | Out-Null

if ($ancienneOrganisation) {
    Write-Host "Rangement du dossier (nouvelle organisation) :"
    foreach ($l in @(& (Join-Path $Cible "Programme\Scripts\Migrer-Dossier.ps1") -Dossier $Cible)) { Write-Host "  $l" }
}
& (Join-Path $Cible "Programme\Scripts\Raccourci.ps1") -Lien (Join-Path $Cible "Prospection Outlook.lnk") -Dossier $Cible
Write-Host "  raccourci Prospection Outlook"
Write-Host "Termine. Tes campagnes n'ont pas ete modifiees."
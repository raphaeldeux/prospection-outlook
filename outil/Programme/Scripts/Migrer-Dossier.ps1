# Range un dossier Prospection installe avec une version anterieure a l'organisation actuelle :
#   avant : Scripts\, Interface\, Interface.bat, Suivi des campagnes.bat, version.txt, Journal\,
#           Installer ou mettre a jour.bat et Campagnes\_Modele campagne a la racine, boutons .bat dans les campagnes
#   apres : Prospection Outlook (raccourci), Campagnes\ (tes campagnes uniquement), LisezMoi.txt, Programme\ (l'outil)
# Lance par l'installeur et par Deployer.ps1 APRES la copie de Programme\. Ne touche a aucune donnee de campagne
# (contacts, textes, issues, parametres) : seulement aux fichiers de l'outil. Les fichiers inconnus d'un ancien
# dossier Scripts\ sont deplaces dans Programme\Anciens scripts\ plutot que supprimes.
param([Parameter(Mandatory = $true)] [string]$Dossier)
$ErrorActionPreference = "Stop"
$fait = New-Object System.Collections.Generic.List[string]

function Remove-Element([string]$Chemin, [string]$Libelle) {
    if (-not (Test-Path -LiteralPath $Chemin)) { return }
    try { Remove-Item -LiteralPath $Chemin -Recurse -Force; $fait.Add($Libelle) }
    catch { $fait.Add("$Libelle : impossible a supprimer ($($_.Exception.Message))") }
}

# Ancien dossier Scripts\ : scripts connus supprimes (nouvelle version dans Programme\Scripts), autres deplaces
$anciensScripts = Join-Path $Dossier "Scripts"
if (Test-Path $anciensScripts) {
    $connus = @("Application.ps1", "Build-Mail1.ps1", "Build-Relance.ps1", "Commun.ps1", "Serveur-Interface.ps1", "Suivi-Campagnes.ps1")
    foreach ($s in @(Get-ChildItem $anciensScripts -File)) {
        if ($s.Name -in $connus) { Remove-Item -LiteralPath $s.FullName -Force }
        else {
            $dest = Join-Path $Dossier "Programme\Anciens scripts"
            New-Item -ItemType Directory -Force $dest | Out-Null
            Move-Item -LiteralPath $s.FullName (Join-Path $dest $s.Name) -Force
            $fait.Add("Scripts\$($s.Name) deplace dans Programme\Anciens scripts")
        }
    }
    if (-not (Get-ChildItem $anciensScripts -Force)) { Remove-Element $anciensScripts "ancien dossier Scripts" }
}

Remove-Element (Join-Path $Dossier "Interface") "ancien dossier Interface"
Remove-Element (Join-Path $Dossier "Journal") "ancien journal"
foreach ($n in @("Interface.bat", "Suivi des campagnes.bat", "version.txt")) { Remove-Element (Join-Path $Dossier $n) $n }
Remove-Element (Join-Path $Dossier "Campagnes\_Modele campagne") "Campagnes\_Modele campagne (le modele est dans Programme)"

# Ancien installeur a la racine : s'il est en cours d'execution (cmd le relit a la fin), suppression differee
$installeur = Join-Path $Dossier "Installer ou mettre a jour.bat"
if (Test-Path $installeur) {
    if ($env:INSTALLEUR -and ([IO.Path]::GetFullPath($env:INSTALLEUR) -ieq [IO.Path]::GetFullPath($installeur))) {
        Start-Process cmd.exe -ArgumentList "/c timeout /t 8 /nobreak >nul & del /f /q `"$installeur`"" -WindowStyle Hidden
        $fait.Add("Installer ou mettre a jour.bat (dans quelques secondes ; il est maintenant dans Programme)")
    } else { Remove-Element $installeur "Installer ou mettre a jour.bat (il est maintenant dans Programme)" }
}

# Boutons .bat des campagnes (1 - Mail1.bat ...) : remplaces par l'interface. Supprimes seulement s'ils sont bien
# ceux generes par l'outil (petit fichier qui lance Build-Mail1 / Build-Relance).
$campagnes = Join-Path $Dossier "Campagnes"
$nb = 0
if (Test-Path $campagnes) {
    foreach ($c in @(Get-ChildItem $campagnes -Directory)) {
        foreach ($b in @(Get-ChildItem $c.FullName -File -Filter "*.bat")) {
            if ($b.Name -notmatch '^\d - Mail\d.*\.bat$' -or $b.Length -gt 600) { continue }
            if ((Get-Content -LiteralPath $b.FullName -Raw) -match 'Scripts\\Build-(Mail1|Relance)\.ps1') { Remove-Item -LiteralPath $b.FullName -Force; $nb++ }
        }
    }
}
if ($nb) { $fait.Add("$nb bouton(s) .bat retire(s) des campagnes (tout se fait dans l'application)") }

$fait
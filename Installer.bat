@echo off
rem ==========================================================================================
rem  Installation (ou mise a jour) de l'outil Prospection Outlook - version portable.
rem
rem  Double-clique ce fichier. Rien n'est installe dans Windows : pas de droits administrateur,
rem  pas de programme ajoute. Tout est copie dans un dossier de ton choix.
rem
rem  La fin du fichier (apres le marqueur PS-DEBUT) est un script PowerShell lu et execute par
rem  la commande ci-dessous : le fichier est autonome et peut etre partage seul.
rem ==========================================================================================
setlocal
title Installation de Prospection Outlook
set "INSTALLEUR=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s = [IO.File]::ReadAllText($env:INSTALLEUR); $i = $s.IndexOf('##PS-' + 'DEBUT##'); & ([scriptblock]::Create($s.Substring($i)))"
echo.
pause
exit /b

##PS-DEBUT##
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$depot     = "raphaeldeux/prospection-outlook"
$branche   = "main"
# Variables d'environnement facultatives (installation automatisee / tests) :
#   PROSPECTION_DOSSIER        dossier d'installation (sinon : question)
#   PROSPECTION_DEV            O ou N : outils de developpement (sinon : question)
#   PROSPECTION_SANS_RACCOURCI 1 : ne pas creer de raccourcis
#   PROSPECTION_SANS_MEMOIRE   1 : ne pas memoriser le dossier d'installation
#   PROSPECTION_PROGRAMMES     dossier des programmes portables (defaut : %LOCALAPPDATA%\Programs)
#   PROSPECTION_SOURCE         dossier du code source (defaut : %LOCALAPPDATA%\prospection-outlook)
#   PROSPECTION_SANS_AUTOMAJ   1 : ne pas telecharger la derniere version de l'installeur
$parDefaut = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "Prospection"

function Etape { param([string]$t) Write-Host ""; Write-Host "== $t" -ForegroundColor Cyan }
function Ok    { param([string]$t) Write-Host "   OK  $t" -ForegroundColor Green }
function Info  { param([string]$t) Write-Host "       $t" }
function Alerte { param([string]$t) Write-Host "   /!\ $t" -ForegroundColor Yellow }

function Get-Fichier {
    # Telechargement dans un dossier temporaire neuf, propre a cette installation
    param([string]$Url, [string]$Dossier)
    $nom = [IO.Path]::GetFileName(([Uri]$Url).AbsolutePath)
    if (-not $nom -or $nom -eq $branche) { $nom = "fichier.zip" }
    $dest = Join-Path $Dossier $nom
    Invoke-WebRequest -Uri $Url -OutFile $dest -UseBasicParsing
    return $dest
}

# ---------- 0. Mise a jour de l'installeur lui-meme ----------
# Une ancienne copie de ce fichier (telechargee il y a longtemps, ou deposee dans le dossier installe)
# recupere d'abord la derniere version publiee et l'execute a sa place : les corrections de
# l'installeur profitent ainsi a tout le monde. Sans connexion, cette version-ci est utilisee.
# IMPORTANT : ne jamais modifier les lignes AVANT le marqueur PS-DEBUT (en-tete batch). Le fichier
# peut etre remplace pendant qu'il s'execute ; cmd reprend sa lecture a la meme position et doit y
# retrouver les memes lignes ("echo.", "pause", "exit /b").
if ($env:PROSPECTION_SANS_AUTOMAJ -ne "1") {
    try {
        $marqueur = '##PS-' + 'DEBUT##'
        $distant = (Invoke-WebRequest "https://raw.githubusercontent.com/$depot/$branche/Installer.bat" -UseBasicParsing -TimeoutSec 20).Content
        if ($distant -is [byte[]]) { $distant = [Text.Encoding]::UTF8.GetString($distant) }
        $local = [IO.File]::ReadAllText($env:INSTALLEUR)
        $iD = $distant.IndexOf($marqueur); $iL = $local.IndexOf($marqueur)
        if ($iD -ge 0 -and $iL -ge 0 -and ($distant.Substring($iD) -replace "`r", "") -ne ($local.Substring($iL) -replace "`r", "")) {
            Write-Host "Une version plus recente de l'installeur est disponible : elle est utilisee." -ForegroundColor Cyan
            $env:PROSPECTION_SANS_AUTOMAJ = "1"
            & ([scriptblock]::Create($distant.Substring($iD)))
            return
        }
    } catch {
        # hors ligne ou GitHub indisponible : on continue avec cette version
    }
}

try {
    Write-Host "Installation de Prospection Outlook (version portable)" -ForegroundColor White
    Write-Host "Rien n'est installe dans Windows : tout est copie dans un dossier de ton choix."

    # ---------- 1. Prerequis ----------
    Etape "Verification des prerequis"
    Ok "Windows PowerShell $($PSVersionTable.PSVersion)"
    $outlookCom = Test-Path "Registry::HKEY_CLASSES_ROOT\Outlook.Application\CLSID"
    if ($outlookCom) {
        Ok "Outlook classique est installe"
    } else {
        Alerte "Outlook classique n'a pas ete trouve. L'outil en a besoin pour creer les brouillons."
        Info "Le 'nouvel Outlook' ne convient pas. L'installation continue quand meme."
    }
    $sig = @(Get-ChildItem "$env:APPDATA\Microsoft\Signatures" -Filter *.htm -ErrorAction SilentlyContinue)
    if ($sig.Count -gt 0) { Ok "$($sig.Count) signature(s) Outlook trouvee(s)" }
    else { Alerte "Aucune signature Outlook : cree-en une (Outlook > Fichier > Options > Courrier > Signatures)." }

    # ---------- 2. Dossier d'installation ----------
    # Une installation existante est recherchee, dans cet ordre :
    #   1. le dossier de ce fichier (cas de "Installer ou mettre a jour.bat" dans le dossier installe)
    #   2. le dossier memorise lors de la derniere installation (%LOCALAPPDATA%\ProspectionOutlook)
    #   3. la cible du raccourci "Prospection Outlook" (Bureau ou menu Demarrer)
    # Le dossier par defaut n'est propose que si aucune installation n'est trouvee.
    Etape "Dossier d'installation"
    $memoire = Join-Path $env:LOCALAPPDATA "ProspectionOutlook\installation.txt"
    function Test-Installation { param([string]$D) $D -and (Test-Path (Join-Path $D "Scripts\Serveur-Interface.ps1")) }
    $detecte = $null; $origine = ""
    $ici = Split-Path -Parent $env:INSTALLEUR
    if (Test-Installation $ici) { $detecte = $ici; $origine = "dossier de ce fichier" }
    if (-not $detecte -and (Test-Path $memoire)) {
        $m = ([string](Get-Content $memoire -TotalCount 1 -Encoding UTF8)).Trim()
        if (Test-Installation $m) { $detecte = $m; $origine = "derniere installation" }
    }
    if (-not $detecte) {
        try {
            $wsh = New-Object -ComObject WScript.Shell
            foreach ($lnk in @((Join-Path ([Environment]::GetFolderPath("Desktop")) "Prospection Outlook.lnk"),
                               (Join-Path ([Environment]::GetFolderPath("Programs")) "Prospection Outlook.lnk"))) {
                if (-not (Test-Path $lnk)) { continue }
                $d = Split-Path -Parent $wsh.CreateShortcut($lnk).TargetPath
                if (Test-Installation $d) { $detecte = $d; $origine = "raccourci Prospection Outlook"; break }
            }
        } catch {}
    }

    $dossier = $env:PROSPECTION_DOSSIER
    if (-not $dossier) {
        if ($detecte) {
            Ok "Installation existante trouvee ($origine) :"
            Info $detecte
            $reponse = Read-Host "       Appuie sur Entree pour la mettre a jour, ou tape un autre chemin"
            $dossier = if ($reponse.Trim()) { $reponse.Trim().Trim('"') } else { $detecte }
        } else {
            Info "Dossier propose : $parDefaut"
            $reponse = Read-Host "       Appuie sur Entree pour l'accepter, ou tape un autre chemin"
            $dossier = if ($reponse.Trim()) { $reponse.Trim().Trim('"') } else { $parDefaut }
        }
    }
    $dossier = [IO.Path]::GetFullPath($dossier)
    $miseAJour = Test-Path (Join-Path $dossier "Scripts\Serveur-Interface.ps1")
    New-Item -ItemType Directory -Force $dossier | Out-Null
    if ($miseAJour) { Ok "$dossier (installation existante : mise a jour, tes campagnes sont conservees)" }
    else { Ok $dossier }

    $dev = $env:PROSPECTION_DEV
    if (-not $dev) {
        Write-Host ""
        Info "Outils de developpement (Node.js portable + code source de l'interface) :"
        Info "inutiles pour utiliser l'outil, seulement pour le modifier."
        $dev = Read-Host "       Les installer aussi ? (o/N)"
    }
    $dev = $dev -match '^[oOyY]'

    # ---------- 3. Telechargement de l'outil ----------
    Etape "Telechargement de la derniere version"
    $tmp = Join-Path $env:TEMP ("prospection-install-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
    New-Item -ItemType Directory $tmp | Out-Null
    $zip = Get-Fichier -Url "https://github.com/$depot/archive/refs/heads/$branche.zip" -Dossier $tmp
    $extrait = Join-Path $tmp "extrait"
    Expand-Archive -Path $zip -DestinationPath $extrait
    $racineDepot = (Get-ChildItem $extrait -Directory | Select-Object -First 1).FullName
    $source = Join-Path $racineDepot "outil"
    if (-not (Test-Path (Join-Path $source "Interface\app\index.html"))) { throw "Archive incomplete (interface absente)." }
    $version = ""
    try { $version = (Invoke-RestMethod "https://api.github.com/repos/$depot/commits/$branche" -TimeoutSec 15).sha.Substring(0, 7) } catch {}
    Ok "Version $(if ($version) { $version } else { 'courante' }) telechargee"

    # ---------- 4. Copie (sans toucher aux campagnes) ----------
    Etape "Installation des fichiers"
    function Copier {
        param([string]$Relatif, [switch]$Miroir)
        $de = Join-Path $source $Relatif; $vers = Join-Path $dossier $Relatif
        $opt = @("/E", "/NFL", "/NDL", "/NJH", "/NJS", "/NP")
        if ($Miroir) { $opt[0] = "/MIR" }
        & robocopy $de $vers @opt | Out-Null
        if ($LASTEXITCODE -ge 8) { throw "Echec de la copie de $Relatif (code $LASTEXITCODE)" }
    }
    Copier "Scripts"
    Copier "Interface\app" -Miroir
    Copier "Campagnes\_Modele campagne" -Miroir
    Get-ChildItem $source -File | ForEach-Object { Copy-Item $_.FullName (Join-Path $dossier $_.Name) -Force }
    New-Item -ItemType Directory -Force (Join-Path $dossier "Campagnes") | Out-Null
    # Installeur de mise a jour : la derniere version (celle de l'archive), pas forcement ce fichier-ci
    $majSource = Join-Path $racineDepot "Installer.bat"
    if (-not (Test-Path $majSource)) { $majSource = $env:INSTALLEUR }
    $majCible = Join-Path $dossier "Installer ou mettre a jour.bat"
    if (-not (Test-Path $majCible) -or (Get-FileHash $majSource).Hash -ne (Get-FileHash $majCible).Hash) {
        Copy-Item $majSource $majCible -Force -ErrorAction SilentlyContinue
    }
    if ($version) { Set-Content (Join-Path $dossier "version.txt") "$version $(Get-Date -Format 'dd/MM/yyyy HH:mm')" -Encoding ASCII }
    # Memorise le dossier pour les prochaines mises a jour (fichier personnel, aucun droit requis)
    if ($env:PROSPECTION_SANS_MEMOIRE -ne "1") {
        New-Item -ItemType Directory -Force (Split-Path $memoire) | Out-Null
        [IO.File]::WriteAllText($memoire, $dossier, (New-Object Text.UTF8Encoding $false))
    }
    # Fichiers telecharges : on retire la marque "provenant d'Internet" (sinon avertissements Windows)
    Get-ChildItem $dossier -Recurse -File -Include *.bat, *.ps1 | Unblock-File -ErrorAction SilentlyContinue
    Ok "Outil installe dans $dossier"
    $nbCampagnes = @(Get-ChildItem (Join-Path $dossier "Campagnes") -Directory | Where-Object { $_.Name -notlike "_*" }).Count
    if ($nbCampagnes) { Ok "$nbCampagnes campagne(s) existante(s) conservee(s)" }

    # ---------- 5. Raccourcis ----------
    if ($env:PROSPECTION_SANS_RACCOURCI -ne "1") {
        Etape "Raccourcis"
        $shell = New-Object -ComObject WScript.Shell
        $menu = Join-Path ([Environment]::GetFolderPath("Programs")) "Prospection Outlook.lnk"
        $bureau = Join-Path ([Environment]::GetFolderPath("Desktop")) "Prospection Outlook.lnk"
        foreach ($lnk in @($bureau, $menu)) {
            $r = $shell.CreateShortcut($lnk)
            $r.TargetPath = Join-Path $dossier "Interface.bat"
            $r.WorkingDirectory = $dossier
            $r.IconLocation = "$env:SystemRoot\System32\shell32.dll,156"
            $r.Description = "Interface de prospection Outlook"
            $r.Save()
        }
        Ok "Raccourci 'Prospection Outlook' sur le Bureau et dans le menu Demarrer"
    }

    # ---------- 6. Outils de developpement (optionnel) ----------
    if ($dev) {
        Etape "Outils de developpement (portables)"
        $programmes = if ($env:PROSPECTION_PROGRAMMES) { $env:PROSPECTION_PROGRAMMES } else { Join-Path $env:LOCALAPPDATA "Programs" }
        New-Item -ItemType Directory -Force $programmes | Out-Null

        # Node.js : derniere version LTS, zip portable, empreinte SHA-256 verifiee
        $lts = (Invoke-RestMethod "https://nodejs.org/dist/index.json" -TimeoutSec 30) | Where-Object { $_.lts } | Select-Object -First 1
        $nomNode = "node-$($lts.version)-win-x64"
        $dossierNode = Join-Path $programmes $nomNode
        if (Test-Path (Join-Path $dossierNode "node.exe")) {
            Ok "Node.js $($lts.version) deja present"
        } else {
            Info "Telechargement de Node.js $($lts.version) (environ 40 Mo)..."
            $zipNode = Get-Fichier -Url "https://nodejs.org/dist/$($lts.version)/$nomNode.zip" -Dossier $tmp
            $sommes = (Invoke-WebRequest "https://nodejs.org/dist/$($lts.version)/SHASUMS256.txt" -UseBasicParsing).Content
            if ($sommes -is [byte[]]) { $sommes = [Text.Encoding]::UTF8.GetString($sommes) }
            $attendu = (($sommes -split "`n") | Where-Object { $_ -match " $nomNode\.zip\s*$" }) -replace '\s.*', ''
            if (-not $attendu -or (Get-FileHash $zipNode -Algorithm SHA256).Hash -ne $attendu.ToUpper()) {
                throw "Empreinte de Node.js invalide : telechargement refuse."
            }
            Expand-Archive $zipNode -DestinationPath $programmes -Force
            Ok "Node.js $($lts.version) installe dans $dossierNode"
        }

        # Code source : depot git si git est disponible, sinon copie de l'archive
        $dossierSource = if ($env:PROSPECTION_SOURCE) { $env:PROSPECTION_SOURCE } else { Join-Path $env:LOCALAPPDATA "prospection-outlook" }
        if (Test-Path (Join-Path $dossierSource "interface\package.json")) {
            Ok "Code source deja present : $dossierSource (non modifie)"
        } else {
            if (Get-Command git -ErrorAction SilentlyContinue) {
                & git clone --quiet "https://github.com/$depot.git" $dossierSource
                if ($LASTEXITCODE -ne 0) { throw "Echec du clonage du depot." }
                Ok "Depot clone dans $dossierSource"
            } else {
                Copy-Item $racineDepot $dossierSource -Recurse
                Ok "Code source copie dans $dossierSource (git absent : pas d'historique)"
            }
        }

        # Dependances de l'interface + raccourci "Developpement.cmd" (Node dans le PATH)
        $env:Path = "$dossierNode;$env:Path"
        if (-not (Test-Path (Join-Path $dossierSource "interface\node_modules"))) {
            Info "Installation des dependances de l'interface (npm install, quelques minutes)..."
            Push-Location (Join-Path $dossierSource "interface")
            try { & npm.cmd install --no-fund --no-audit 2>&1 | Out-Null; if ($LASTEXITCODE -ne 0) { throw "npm install a echoue." } }
            finally { Pop-Location }
            Ok "Dependances installees"
        }
        $cmd = "@echo off`r`nset ""PATH=$dossierNode;%PATH%""`r`ncd /d ""%~dp0interface""`r`n" +
               "echo Environnement de developpement : Node.js $($lts.version) portable.`r`n" +
               "echo   npm run dev    interface en mode developpement`r`n" +
               "echo   npm run build  compile dans ..\outil\Interface\app`r`ncmd /k`r`n"
        Set-Content (Join-Path $dossierSource "Developpement.cmd") $cmd -Encoding ASCII
        Ok "Ouvre $dossierSource\Developpement.cmd pour travailler sur l'interface"
    }

    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

    Write-Host ""
    Write-Host "Installation terminee." -ForegroundColor Green
    Write-Host "Pour demarrer : ouvre Outlook classique, puis double-clique 'Prospection Outlook' sur le Bureau"
    Write-Host "(ou Interface.bat dans $dossier). Le guide d'utilisation est dans l'interface."
    Write-Host "Pour mettre a jour plus tard : 'Installer ou mettre a jour.bat' dans ce meme dossier."
} catch {
    Write-Host ""
    Write-Host "ERREUR : $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Rien n'a ete supprime. Verifie ta connexion Internet puis relance l'installation."
    if ($tmp) { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
    exit 1
}

# Petit serveur web LOCAL pour l'interface de prospection (Interface\app, compilee depuis le dossier
# interface\ du depot : React + shadcn/ui).
#
# Il relaie les scripts existants, qui restent le moteur, et lit/ecrit les fichiers des campagnes :
#   GET  /api/suivi     -> Suivi-Campagnes.ps1 -JsonPath ...   (lecture seule)
#   POST /api/generer   -> Build-Mail1.ps1 / Build-Relance.ps1 (cree des BROUILLONS, n'envoie rien)
#   POST /api/fichiers  -> contenu de contacts.csv et des textes Mail1..4 d'une campagne
#   PUT  /api/contacts  -> enregistre contacts.csv (UTF-8 avec BOM, separateur ;)
#   PUT  /api/texte     -> enregistre Textes\MailN.txt
#   PUT  /api/parametres -> enregistre les reglages de la campagne (delai avant relance)
#   POST /api/ouvrir    -> ouvre le dossier de la campagne dans l'Explorateur
#   POST /api/campagnes -> cree une campagne a partir de "_Modele campagne"
#
# Securite : ecoute uniquement sur localhost, et chaque appel /api doit porter l'en-tete
# X-Prospection (un site web externe ne peut pas l'ajouter sans autorisation CORS, qu'on ne donne pas).
#
# Usage : double-cliquer "Interface.bat" a la racine du dossier Prospection. Fermer la fenetre
# noire arrete le serveur.

param(
    [int]$Port = 8765,
    [switch]$SansNavigateur   # ne pas ouvrir le navigateur au demarrage
)

$ErrorActionPreference = "Stop"

$racine     = Split-Path -Parent $PSScriptRoot
$scripts    = $PSScriptRoot
$campagnes  = Join-Path $racine "Campagnes"
$appDir     = Join-Path $racine "Interface\app"
$utf8       = New-Object System.Text.UTF8Encoding $false

if (-not (Test-Path (Join-Path $appDir "index.html"))) {
    throw "Interface introuvable ($appDir\index.html). Retelecharge l'outil complet, ou compile-la depuis le dossier interface\ du depot avec : npm run build"
}

function Invoke-ScriptEnfant {
    # Lance un script dans un PowerShell separe (Outlook COM isole du serveur) et renvoie
    # son journal (sortie console) et son code de sortie.
    param([string]$Commande)
    $wrapper = "[Console]::OutputEncoding = [Text.Encoding]::UTF8; `$ProgressPreference = 'SilentlyContinue'; " +
               "try { $Commande; exit 0 } catch { Write-Output ('ERREUR : ' + `$_.Exception.Message); exit 1 }"
    $encode = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($wrapper))

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "powershell.exe"
    $psi.Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand $encode"
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.StandardOutputEncoding = [Text.Encoding]::UTF8
    $psi.StandardErrorEncoding = [Text.Encoding]::UTF8

    $p = [System.Diagnostics.Process]::Start($psi)
    $out = $p.StandardOutput.ReadToEndAsync()
    $err = $p.StandardError.ReadToEndAsync()
    $p.WaitForExit()
    $journal = ($out.Result + $err.Result).Trim()
    return [pscustomobject]@{ Code = $p.ExitCode; Journal = $journal }
}

function Q { param([string]$s) "'" + ($s -replace "'", "''") + "'" }   # chaine PowerShell entre quotes

function Get-DossierCampagne {
    # Verifie que le nom designe bien un sous-dossier direct de Campagnes\ (pas de ..\ etc.)
    param([string]$Nom)
    if ([string]::IsNullOrWhiteSpace($Nom) -or $Nom -match '[\\/]' -or $Nom -like '..*') { return $null }
    $d = Join-Path $campagnes $Nom
    if ((Test-Path $d -PathType Container) -and (Test-Path (Join-Path $d "contacts.csv"))) { return $d }
    return $null
}

$colonnesStandard = @("Civilite", "Prenom", "Nom", "Entreprise", "Telephone", "Email", "Sujet1", "Sujet2", "Sujet3", "Sujet4")
$utf8Bom = New-Object System.Text.UTF8Encoding $true   # BOM : Excel affiche correctement les accents

function Read-Corps { param($Req) (New-Object IO.StreamReader($Req.InputStream, $utf8)).ReadToEnd() | ConvertFrom-Json }

function Write-FichierCampagne {
    # Un fichier verrouille (ouvert dans Excel) fait echouer l'OUVERTURE, avant toute ecriture : le
    # fichier reste intact et l'utilisateur recoit un message clair.
    param([string]$Chemin, [string]$Contenu)
    try {
        [IO.File]::WriteAllText($Chemin, $Contenu, $utf8Bom)
    } catch [System.IO.IOException] {
        throw "Impossible d'enregistrer $(Split-Path $Chemin -Leaf) : le fichier est ouvert dans Excel ou un autre programme. Ferme-le puis reessaie."
    }
}

function ConvertTo-ChampCsv {
    param([string]$Valeur)
    $v = ([string]$Valeur) -replace "[\r\n]+", " "
    if ($v -match '[;"]') { return '"' + ($v -replace '"', '""') + '"' }
    return $v
}

function Send-Reponse {
    param($Ctx, [int]$Statut, [byte[]]$Corps, [string]$Type)
    $r = $Ctx.Response
    $r.StatusCode = $Statut
    $r.ContentType = $Type
    $r.Headers["Cache-Control"] = "no-store"
    $r.ContentLength64 = $Corps.Length
    $r.OutputStream.Write($Corps, 0, $Corps.Length)
    $r.OutputStream.Close()
}

function Send-Json {
    param($Ctx, [int]$Statut, $Objet, [switch]$Brut)
    $json = if ($Brut) { [string]$Objet } else { $Objet | ConvertTo-Json -Depth 6 }
    Send-Reponse -Ctx $Ctx -Statut $Statut -Corps $utf8.GetBytes($json) -Type "application/json; charset=utf-8"
}

$types = @{ ".html" = "text/html; charset=utf-8"; ".js" = "text/javascript; charset=utf-8"; ".css" = "text/css; charset=utf-8";
            ".svg" = "image/svg+xml"; ".png" = "image/png"; ".ico" = "image/x-icon"; ".woff2" = "font/woff2"; ".json" = "application/json" }

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() } catch {
    throw "Impossible d'ouvrir le port $Port (l'interface est peut-etre deja ouverte dans une autre fenetre)."
}
$url = "http://localhost:$Port/"
Write-Host "Interface de prospection disponible sur $url"
Write-Host "Laisse cette fenetre ouverte pendant l'utilisation. La fermer arrete l'interface."
if (-not $SansNavigateur) { Start-Process $url }

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $chemin = $req.Url.AbsolutePath
        try {
            if ($chemin.StartsWith("/api/")) {
                if (-not $req.Headers["X-Prospection"]) { Send-Json $ctx 403 @{ erreur = "Requete refusee." }; continue }

                if ($chemin -eq "/api/suivi" -and $req.HttpMethod -eq "GET") {
                    Write-Host "$(Get-Date -Format HH:mm:ss) Lecture du suivi..."
                    $tmp = [IO.Path]::Combine($env:TEMP, "prospection-suivi-$([guid]::NewGuid().ToString('N')).json")
                    $res = Invoke-ScriptEnfant "& $(Q (Join-Path $scripts 'Suivi-Campagnes.ps1')) -SansRapport -JsonPath $(Q $tmp)"
                    if ($res.Code -eq 0 -and (Test-Path $tmp)) {
                        Send-Json $ctx 200 ([IO.File]::ReadAllText($tmp, $utf8)) -Brut
                    } else {
                        Send-Json $ctx 500 @{ erreur = "Le suivi a echoue."; journal = $res.Journal }
                    }
                    Remove-Item $tmp -ErrorAction SilentlyContinue
                    continue
                }

                if ($chemin -eq "/api/generer" -and $req.HttpMethod -eq "POST") {
                    $lecteur = New-Object IO.StreamReader($req.InputStream, $utf8)
                    $corps = $lecteur.ReadToEnd() | ConvertFrom-Json
                    $dossier = Get-DossierCampagne $corps.campagne
                    $etape = [int]$corps.etape
                    if (-not $dossier -or $etape -notin 1..4) { Send-Json $ctx 400 @{ erreur = "Campagne ou etape invalide." }; continue }

                    Write-Host "$(Get-Date -Format HH:mm:ss) Generation Mail$etape - $($corps.campagne)..."
                    $cmd = if ($etape -eq 1) { "& $(Q (Join-Path $scripts 'Build-Mail1.ps1')) -Campagne $(Q $dossier)" }
                           else { "& $(Q (Join-Path $scripts 'Build-Relance.ps1')) -Campagne $(Q $dossier) -Etape $etape" }
                    $res = Invoke-ScriptEnfant $cmd
                    Write-Host $res.Journal
                    Send-Json $ctx 200 @{ ok = ($res.Code -eq 0); journal = $res.Journal }
                    continue
                }

                if ($chemin -eq "/api/fichiers" -and $req.HttpMethod -eq "POST") {
                    $corps = Read-Corps $req
                    $dossier = Get-DossierCampagne $corps.campagne
                    if (-not $dossier) { Send-Json $ctx 400 @{ erreur = "Campagne invalide." }; continue }
                    $csv = Join-Path $dossier "contacts.csv"
                    $entete = @((Get-Content $csv -Encoding UTF8 -TotalCount 1) -split ';' | ForEach-Object { $_.Trim('"') } | Where-Object { $_ })
                    $colonnes = @($colonnesStandard) + @($entete | Where-Object { $_ -notin $colonnesStandard })
                    $contacts = @(Import-Csv -Path $csv -Delimiter ';' -Encoding UTF8 | ForEach-Object {
                        $ligne = [ordered]@{}
                        foreach ($c in $colonnes) { $ligne[$c] = [string]$_.$c }
                        [pscustomobject]$ligne
                    })
                    $textes = @(foreach ($n in 1..4) {
                        $f = Join-Path $dossier "Textes\Mail$n.txt"
                        $contenu = if (Test-Path $f) { (Get-Content $f -Raw -Encoding UTF8) -replace "`r`n", "`n" } else { "" }
                        [pscustomobject]@{ etape = $n; contenu = [string]$contenu }
                    })
                    Send-Json $ctx 200 @{ colonnes = $colonnes; contacts = $contacts; textes = $textes }
                    continue
                }

                if ($chemin -eq "/api/contacts" -and $req.HttpMethod -eq "PUT") {
                    $corps = Read-Corps $req
                    $dossier = Get-DossierCampagne $corps.campagne
                    if (-not $dossier) { Send-Json $ctx 400 @{ erreur = "Campagne invalide." }; continue }
                    $colonnes = @($corps.colonnes | ForEach-Object { [string]$_ } | Where-Object { $_ })
                    foreach ($c in $colonnesStandard) { if ($c -notin $colonnes) { $colonnes += $c } }
                    $lignes = New-Object System.Collections.Generic.List[string]
                    $lignes.Add(($colonnes | ForEach-Object { ConvertTo-ChampCsv $_ }) -join ';')
                    foreach ($contact in @($corps.contacts)) {
                        $valeurs = foreach ($c in $colonnes) { ConvertTo-ChampCsv ([string]$contact.$c).Trim() }
                        if (($valeurs -join '').Trim()) { $lignes.Add($valeurs -join ';') }   # lignes entierement vides ignorees
                    }
                    Write-FichierCampagne -Chemin (Join-Path $dossier "contacts.csv") -Contenu (($lignes -join "`r`n") + "`r`n")
                    Write-Host "$(Get-Date -Format HH:mm:ss) Contacts enregistres - $($corps.campagne) ($($lignes.Count - 1) ligne(s))"
                    Send-Json $ctx 200 @{ ok = $true; nb = $lignes.Count - 1 }
                    continue
                }

                if ($chemin -eq "/api/texte" -and $req.HttpMethod -eq "PUT") {
                    $corps = Read-Corps $req
                    $dossier = Get-DossierCampagne $corps.campagne
                    $etape = [int]$corps.etape
                    if (-not $dossier -or $etape -notin 1..4) { Send-Json $ctx 400 @{ erreur = "Campagne ou etape invalide." }; continue }
                    $f = Join-Path $dossier "Textes\Mail$etape.txt"
                    New-Item -ItemType Directory -Force (Split-Path $f) | Out-Null
                    $contenu = (([string]$corps.contenu) -replace "`r`n", "`n") -replace "`n", "`r`n"
                    Write-FichierCampagne -Chemin $f -Contenu $contenu
                    Write-Host "$(Get-Date -Format HH:mm:ss) Texte Mail$etape enregistre - $($corps.campagne)"
                    Send-Json $ctx 200 @{ ok = $true }
                    continue
                }

                if ($chemin -eq "/api/parametres" -and $req.HttpMethod -eq "PUT") {
                    # Reglages propres a une campagne (parametres.json) : delai avant relance
                    $corps = Read-Corps $req
                    $dossier = Get-DossierCampagne $corps.campagne
                    $delai = $corps.delaiRelanceJours -as [int]
                    if (-not $dossier -or $null -eq $delai -or $delai -lt 0 -or $delai -gt 90) {
                        Send-Json $ctx 400 @{ erreur = "Delai invalide (entre 0 et 90 jours)." }; continue
                    }
                    $json = [pscustomobject]@{ DelaiRelanceJours = $delai } | ConvertTo-Json
                    Write-FichierCampagne -Chemin (Join-Path $dossier "parametres.json") -Contenu $json
                    Write-Host "$(Get-Date -Format HH:mm:ss) Delai avant relance : $delai jour(s) - $($corps.campagne)"
                    Send-Json $ctx 200 @{ ok = $true }
                    continue
                }

                if ($chemin -eq "/api/ouvrir" -and $req.HttpMethod -eq "POST") {
                    # Ouvre le dossier de la campagne dans l'Explorateur
                    $corps = Read-Corps $req
                    $dossier = Get-DossierCampagne $corps.campagne
                    if (-not $dossier) { Send-Json $ctx 400 @{ erreur = "Campagne invalide." }; continue }
                    Invoke-Item $dossier
                    Send-Json $ctx 200 @{ ok = $true }
                    continue
                }

                if ($chemin -eq "/api/campagnes" -and $req.HttpMethod -eq "POST") {
                    # Nouvelle campagne = copie de "_Modele campagne", avec un contacts.csv vide (en-tetes seules)
                    $corps = (New-Object IO.StreamReader($req.InputStream, $utf8)).ReadToEnd() | ConvertFrom-Json
                    $nom = ([string]$corps.nom).Trim()
                    if (-not $nom -or $nom.StartsWith("_") -or $nom -match '[\\/:*?"<>|]' -or $nom -like '.*') {
                        Send-Json $ctx 400 @{ erreur = "Nom invalide (caracteres interdits : \ / : * ? `" < > |)." }; continue
                    }
                    $dest = Join-Path $campagnes $nom
                    if (Test-Path $dest) { Send-Json $ctx 409 @{ erreur = "Une campagne porte deja ce nom." }; continue }
                    Copy-Item (Join-Path $campagnes "_Modele campagne") $dest -Recurse
                    $csv = Join-Path $dest "contacts.csv"
                    $entete = (Get-Content $csv -Encoding UTF8 -TotalCount 1)
                    [IO.File]::WriteAllText($csv, "$entete`r`n", (New-Object System.Text.UTF8Encoding $true))
                    Write-Host "$(Get-Date -Format HH:mm:ss) Nouvelle campagne creee : $nom"
                    Send-Json $ctx 200 @{ ok = $true; nom = $nom }
                    continue
                }

                Send-Json $ctx 404 @{ erreur = "Route inconnue." }
                continue
            }

            # Fichiers de l'interface (avec repli sur index.html)
            $relatif = [Uri]::UnescapeDataString($chemin.TrimStart('/')) -replace '/', '\'
            $fichier = if ($relatif) { [IO.Path]::GetFullPath((Join-Path $appDir $relatif)) } else { $null }
            if (-not $fichier -or -not $fichier.StartsWith($appDir, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $fichier -PathType Leaf)) {
                $fichier = Join-Path $appDir "index.html"
            }
            $ext = [IO.Path]::GetExtension($fichier).ToLower()
            $type = if ($types.ContainsKey($ext)) { $types[$ext] } else { "application/octet-stream" }
            Send-Reponse -Ctx $ctx -Statut 200 -Corps ([IO.File]::ReadAllBytes($fichier)) -Type $type
        } catch {
            Write-Host "Erreur : $($_.Exception.Message)" -ForegroundColor Red
            try { Send-Json $ctx 500 @{ erreur = $_.Exception.Message } } catch {}
        }
    }
} finally {
    $listener.Stop()
}

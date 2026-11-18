# Tableau de bord de suivi des campagnes : pour chaque contact de chaque campagne, date d'envoi de
# Mail1 a Mail4, brouillons en attente, reponses recues, et prochaine action a faire.
#
# LECTURE SEULE : le script ne cree, ne modifie et n'envoie rien dans Outlook.
#
# Les dates sont retrouvees dans Outlook (comme Build-Relance.ps1) :
#   - envoi    = mail du dossier Elements envoyes dont l'objet commence par la colonne SujetN
#                (variables resolues) et adresse au contact
#   - brouillon = idem dans le dossier Brouillons
#   - reponse  = mail recu (Boite de reception ou un de ses sous-dossiers) de l'adresse du contact,
#                APRES le 1er envoi ; les reponses automatiques (absence...) ne comptent pas
#
# Usage : double-cliquer "Suivi des campagnes.bat" a la racine du dossier Prospection.
#   .\Suivi-Campagnes.ps1                         # toutes les campagnes (sauf _Modele campagne)
#   .\Suivi-Campagnes.ps1 -Campagne "<dossier>"   # une seule campagne
#   .\Suivi-Campagnes.ps1 -JoursHistorique 730    # chercher les reponses plus loin

param(
    [string]$Campagne,

    # delai minimal avant relance : -1 = celui de chaque campagne (parametres.json, 3 jours par
    # defaut) ; une valeur >= 0 l'impose a toutes les campagnes
    [int]$MinJours = -1,

    # profondeur de recherche des REPONSES (les envois et brouillons sont lus sans limite de date :
    # le filtre par objet suffit a aller vite)
    [int]$JoursHistorique = 365,

    # ne pas ouvrir le rapport HTML a la fin
    [switch]$SansRapport,

    # utilise par l'interface (Serveur-Interface.ps1) : ecrit les resultats en JSON dans ce fichier,
    # sans affichage console ni rapport HTML
    [string]$JsonPath
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Commun.ps1")

$racine = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # <dossier Prospection>\Programme\Scripts -> <dossier Prospection>
if ($Campagne) {
    if (-not (Test-Path $Campagne)) { throw "Dossier de campagne introuvable : $Campagne" }
    $dossiers = @(Get-Item $Campagne)
} else {
    $dossiers = @(Get-ChildItem -Path (Join-Path $racine "Campagnes") -Directory |
        Where-Object { $_.Name -notlike "_*" -and (Test-Path (Join-Path $_.FullName "contacts.csv")) } |
        Sort-Object Name)
}
if ($dossiers.Count -eq 0) {
    # pas encore de campagne : ce n'est pas une erreur. L'interface affiche son ecran d'accueil
    # ("Lance ta premiere campagne") ; inutile de se connecter a Outlook.
    if ($JsonPath) {
        $vide = [pscustomobject]@{ GenereLe = (Get-Date).ToString("dd/MM/yyyy HH:mm"); Campagnes = @() }
        [System.IO.File]::WriteAllText($JsonPath, ($vide | ConvertTo-Json -Depth 3), (New-Object System.Text.UTF8Encoding $false))
    } else {
        Write-Host "Pas encore de campagne a suivre. Cree ta premiere campagne depuis l'interface (Prospection Outlook)."
    }
    return
}

function Get-IndexParAdresse {
    # Range des mails Outlook par adresse destinataire (ou expediteur si -ParExpediteur), pour retrouver
    # ensuite ceux d'un contact sans reparcourir les dossiers. Les mails sont deja filtres par Outlook
    # (objet ou expediteur, cf. Commun.ps1), ce qui evite de lire tout le dossier.
    param($Items, [string]$ChampDate, [switch]$ParExpediteur)
    $index = @{}
    foreach ($item in $Items) {
        if ($item.Class -ne 43) { continue }
        $date = $item.$ChampDate
        # adresses SMTP, y compris pour les personnes de la meme organisation (cf. Commun.ps1)
        if ($ParExpediteur) {
            $adresses = @(Get-AdresseExpediteur $item)
        } else {
            $adresses = Get-AdressesDestinataires $item
        }
        $entree = [pscustomobject]@{ Sujet = [string]$item.Subject; Date = $date }
        foreach ($a in ($adresses | Where-Object { $_ } | ForEach-Object { $_.ToLower() } | Select-Object -Unique)) {
            if (-not $index.ContainsKey($a)) { $index[$a] = New-Object System.Collections.Generic.List[object] }
            $index[$a].Add($entree)
        }
    }
    return $index
}

function Format-Date { param($d) if ($d) { $d.ToString("dd/MM/yyyy") } else { "" } }

Write-Host "Connexion a Outlook..."
try {
    $outlook = [System.Runtime.InteropServices.Marshal]::GetActiveObject("Outlook.Application")
} catch {
    throw "Outlook (classique) ne semble pas ouvert. Ouvre Outlook - PAS le 'nouveau Outlook' - puis relance ce script."
}
$ns = $outlook.GetNamespace("MAPI")
$limite = (Get-Date).AddDays(-$JoursHistorique)

# tous les objets (SujetN, variables resolues) de toutes les campagnes : seuls ces mails sont lus
$prefixes = @(foreach ($dossier in $dossiers) {
    foreach ($contact in @(Import-Csv -Path (Join-Path $dossier.FullName "contacts.csv") -Delimiter ';' -Encoding UTF8)) {
        foreach ($n in 1..4) { Resolve-Variables -Texte $contact."Sujet$n" -Contact $contact }
    }
}) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique

Write-Host "Lecture des Elements envoyes..."
$envoyes = if ($prefixes) { Get-IndexParAdresse -Items (Get-ItemsParObjet -Folder $ns.GetDefaultFolder(5) -Prefixes $prefixes) -ChampDate "SentOn" } else { @{} }
Write-Host "Lecture des Brouillons..."
$brouillons = if ($prefixes) { Get-IndexParAdresse -Items (Get-ItemsParObjet -Folder $ns.GetDefaultFolder(16) -Prefixes $prefixes) -ChampDate "LastModificationTime" } else { @{} }
Write-Host "Lecture des reponses (Boite de reception et sous-dossiers, $JoursHistorique derniers jours)..."
$adresses = @(foreach ($dossier in $dossiers) {
    Import-Csv -Path (Join-Path $dossier.FullName "contacts.csv") -Delimiter ';' -Encoding UTF8 | ForEach-Object { $_.Email }
})
$recus = if ($adresses) { Get-IndexParAdresse -Items (Get-ReponsesRecues -Namespace $ns -Adresses $adresses -Depuis $limite) -ChampDate "ReceivedTime" -ParExpediteur } else { @{} }

$aujourdhui = (Get-Date).Date
$resultats = New-Object System.Collections.Generic.List[object]

$mesAdresses = Get-MesAdresses -Namespace $ns
$delais = @{}
foreach ($dossier in $dossiers) {
    $delai = if ($MinJours -ge 0) { $MinJours } else { Get-DelaiRelance $dossier.FullName }
    $delais[$dossier.Name] = $delai
    $issues = Get-Issues $dossier.FullName
    $perso = try { Get-TextesPersonnalises $dossier.FullName } catch { @{} }   # fichier abime : le suivi reste lisible
    $contacts = @(Import-Csv -Path (Join-Path $dossier.FullName "contacts.csv") -Delimiter ';' -Encoding UTF8)
    foreach ($contact in $contacts) {
        # lignes vides du CSV (ex. lignes ajoutees par Excel en fin de fichier)
        if ([string]::IsNullOrWhiteSpace($contact.Nom) -and [string]::IsNullOrWhiteSpace($contact.Email)) { continue }
        $email = ([string]$contact.Email).Trim().ToLower()
        $sujets = Get-SujetsEtapes $contact
        $nbEtapes = @(1..4 | Where-Object { -not [string]::IsNullOrWhiteSpace($sujets[$_]) }).Count

        # date du 1er envoi de chaque etape (si le mail a ete renvoye, on garde le premier)
        $dates = @{}
        if ($email -and $envoyes.ContainsKey($email)) {
            foreach ($m in $envoyes[$email]) {
                $n = Get-EtapeDuSujet -Sujet $m.Sujet -SujetsEtapes $sujets
                if ($n -gt 0 -and (-not $dates[$n] -or $m.Date -lt $dates[$n])) { $dates[$n] = $m.Date }
            }
        }
        $etapesBrouillon = @()
        if ($email -and $brouillons.ContainsKey($email)) {
            foreach ($m in $brouillons[$email]) {
                $n = Get-EtapeDuSujet -Sujet $m.Sujet -SujetsEtapes $sujets
                if ($n -gt 0 -and -not $dates[$n]) { $etapesBrouillon += $n }
            }
        }

        $derniere = 0
        for ($n = 1; $n -le 4; $n++) { if ($dates[$n]) { $derniere = $n } }

        # reponse = mail recu de ce contact apres le 1er envoi de la campagne. Si le contact est l'utilisateur
        # lui-meme (test envoye a sa propre adresse), les mails "recus" sont les copies de ses envois : pas
        # de detection de reponse dans ce cas.
        $reponse = $null
        $premierEnvoi = ($dates.Values | Sort-Object | Select-Object -First 1)
        if ($premierEnvoi -and $recus.ContainsKey($email) -and $mesAdresses -notcontains $email) {
            $reponse = $recus[$email] | Where-Object { $_.Date -gt $premierEnvoi } |
                Sort-Object Date | Select-Object -First 1
        }

        $suivante = $derniere + 1
        $code = ""
        # donnees structurees pour l'interface (qui redige les messages elle-meme, en francais accentue)
        $ilYA = if ($derniere -gt 0) { ($aujourdhui - $dates[$derniere].Date).Days } else { $null }
        $relanceLe = if ($derniere -gt 0) { Format-Date $dates[$derniere].Date.AddDays($delai) } else { "" }
        $issue = if ($email) { $issues[$email] } else { $null }
        if ($issue) {
            # issue renseignee par le commercial (RDV, pas interesse...) : contact clos, plus de relance
            $action = "Clos : $($issue.Issue)"; $code = "clos"
        } elseif ($reponse) {
            $action = "A repondu le $(Format-Date $reponse.Date) - a reprendre a la main"; $code = "repondu"
        } elseif ($etapesBrouillon -contains $suivante) {
            $action = "Brouillon Mail$suivante pret dans Outlook - a relire et envoyer"; $code = "brouillon"
        } elseif ($derniere -eq 0) {
            $action = "Mail1 pas encore cree (lancer 1 - Mail1.bat)"; $code = "afaire"
        } elseif ($suivante -gt $nbEtapes) {
            $action = if ($nbEtapes -lt 4) { "Sequence terminee apres Mail$nbEtapes (pas d'objet pour Mail$($nbEtapes + 1)), pas de reponse" } else { "Sequence terminee, pas de reponse" }; $code = "termine"
        } else {
            if ($ilYA -ge $delai) {
                $action = "Relance Mail$suivante possible (dernier envoi il y a $ilYA j)"; $code = "relance"
            } else {
                $action = "Relance Mail$suivante possible le $(Format-Date $dates[$derniere].Date.AddDays($delai)) (dernier envoi il y a $ilYA j)"; $code = "attente"
            }
        }

        $resultats.Add([pscustomobject]@{
            Campagne   = $dossier.Name
            Civilite   = $contact.Civilite
            Prenom     = $contact.Prenom
            Nom        = $contact.Nom
            Entreprise = $contact.Entreprise
            Email      = $contact.Email
            Mail1      = Format-Date $dates[1]
            Mail2      = Format-Date $dates[2]
            Mail3      = Format-Date $dates[3]
            Mail4      = Format-Date $dates[4]
            NbEtapes   = $nbEtapes
            Action     = $action
            Code       = $code
            DateReponse      = if ($reponse) { Format-Date $reponse.Date } else { "" }
            Issue            = if ($issue) { [string]$issue.Issue } else { "" }
            IssueNote        = if ($issue) { [string]$issue.Note } else { "" }
            IssueLe          = if ($issue) { [string]$issue.Le } else { "" }
            RelancePossibleLe = $relanceLe
            JoursDepuisEnvoi = $ilYA
            # etapes pour lesquelles ce contact a un texte personnalise (affiche dans l'interface)
            TextesPerso      = @(if ($email -and $perso.ContainsKey($email)) { @($perso[$email].Keys | Sort-Object) })
        })
    }
}

# ---------- Sortie JSON (interface) ----------
if ($JsonPath) {
    $campagnesJson = foreach ($dossier in $dossiers) {
        # etat des textes : absent, a completer, ou pret
        $textes = foreach ($n in 1..4) {
            $f = Join-Path $dossier.FullName "Textes\Mail$n.txt"
            $etat = if (-not (Test-Path $f)) { "absent" }
                    elseif ((Get-Content $f -Raw -Encoding UTF8) -match '\[A COMPLETER\]') { "a_completer" }
                    else { "pret" }
            [pscustomobject]@{ Etape = $n; Etat = $etat }
        }
        [pscustomobject]@{
            Nom      = $dossier.Name
            DelaiRelance = $delais[$dossier.Name]
            Textes   = @($textes)
            Contacts = @($resultats | Where-Object Campagne -eq $dossier.Name | Select-Object * -ExcludeProperty Campagne)
        }
    }
    $sortie = [pscustomobject]@{
        GenereLe  = (Get-Date).ToString("dd/MM/yyyy HH:mm")
        Campagnes = @($campagnesJson)
    }
    [System.IO.File]::WriteAllText($JsonPath, ($sortie | ConvertTo-Json -Depth 6), (New-Object System.Text.UTF8Encoding $false))
    return
}

# ---------- Affichage console ----------
$couleurs = @{ repondu = "Green"; brouillon = "Cyan"; relance = "Yellow"; afaire = "Yellow"; attente = "Gray"; termine = "DarkGray" }
foreach ($groupe in ($resultats | Group-Object Campagne)) {
    Write-Host ""
    Write-Host "=== $($groupe.Name) ===" -ForegroundColor White
    Write-Host ("{0,-20} {1,-16} {2,-10} {3,-10} {4,-10} {5,-10} {6}" -f "Nom", "Entreprise", "Mail1", "Mail2", "Mail3", "Mail4", "Prochaine action")
    foreach ($r in $groupe.Group) {
        $ligne = "{0,-20} {1,-16} {2,-10} {3,-10} {4,-10} {5,-10} {6}" -f `
            ($r.Nom.PadRight(20).Substring(0, 20)), ($r.Entreprise.PadRight(16).Substring(0, 16)),
            $r.Mail1, $r.Mail2, $r.Mail3, $r.Mail4, $r.Action
        Write-Host $ligne -ForegroundColor $couleurs[$r.Code]
    }
}

Write-Host ""
Write-Host "Resume :"
foreach ($c in @("relance", "brouillon", "afaire", "repondu", "attente", "termine")) {
    $nb = @($resultats | Where-Object Code -eq $c).Count
    if ($nb -gt 0) {
        $libelle = @{ relance = "relance(s) possible(s)"; brouillon = "brouillon(s) a envoyer"; afaire = "Mail1 a creer";
                      repondu = "reponse(s) recue(s)"; attente = "en attente du delai"; termine = "sequence(s) terminee(s)" }[$c]
        Write-Host ("  {0,3} {1}" -f $nb, $libelle) -ForegroundColor $couleurs[$c]
    }
}

# ---------- Rapport HTML ----------
if (-not $SansRapport) {
    Add-Type -AssemblyName System.Web
    function H { param($t) [System.Web.HttpUtility]::HtmlEncode([string]$t) }

    $sections = foreach ($groupe in ($resultats | Group-Object Campagne)) {
        $lignes = foreach ($r in $groupe.Group) {
            $cellules = foreach ($n in 1..4) {
                $d = $r."Mail$n"
                if ($n -gt $r.NbEtapes) { "<td class='na'>&ndash;</td>" } else { "<td>$(H $d)</td>" }
            }
            "<tr class='$($r.Code)'><td><b>$(H $r.Nom)</b><br><small>$(H $r.Email)</small></td><td>$(H $r.Entreprise)</td>$($cellules -join '')<td class='action'>$(H $r.Action)</td></tr>"
        }
        "<h2>$(H $groupe.Name) <small>&middot; relance possible &agrave; J+$($delais[$groupe.Name])</small></h2><table><tr><th>Contact</th><th>Entreprise</th><th>Mail1</th><th>Mail2</th><th>Mail3</th><th>Mail4</th><th>Prochaine action</th></tr>$($lignes -join "`n")</table>"
    }

    $html = @"
<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Suivi prospection</title>
<style>
 body { font-family: Aptos, Calibri, Segoe UI, sans-serif; margin: 24px; color: #222; }
 h1 { font-size: 20px; margin-bottom: 0; } .date { color: #777; margin-top: 4px; }
 h2 { font-size: 16px; margin-top: 28px; }
 table { border-collapse: collapse; width: 100%; font-size: 13px; }
 th, td { border-bottom: 1px solid #e3e3e3; padding: 6px 8px; text-align: left; vertical-align: top; }
 th { background: #f4f4f4; } small { color: #888; } td.na { color: #ccc; }
 tr.repondu .action { color: #1a7f37; font-weight: 600; }
 tr.relance .action, tr.afaire .action { color: #b35900; font-weight: 600; }
 tr.brouillon .action { color: #0969da; font-weight: 600; }
 tr.attente .action, tr.termine .action { color: #888; }
</style></head><body>
<h1>Suivi des campagnes de prospection</h1>
<p class="date">G&eacute;n&eacute;r&eacute; le $(Get-Date -Format "dd/MM/yyyy HH:mm")</p>
$($sections -join "`n")
</body></html>
"@
    $rapport = Join-Path $env:TEMP "Suivi-prospection.html"
    [System.IO.File]::WriteAllText($rapport, $html, (New-Object System.Text.UTF8Encoding $true))
    Start-Process $rapport
    Write-Host ""
    Write-Host "Rapport detaille ouvert dans le navigateur : $rapport"
}

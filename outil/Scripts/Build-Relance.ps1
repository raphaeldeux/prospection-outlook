# Genere une VRAIE relance Outlook (via le bouton "Repondre" natif, pilote en COM) pour chaque
# contact de Contacts\contacts.csv, en repondant au DERNIER mail reellement envoye dans le fil
# (Mail1, ou la relance precedente si elle a deja ete envoyee).
#
# Process en 4 etapes : Mail1 (invitation, cf. Build-Mail1.ps1), puis Mail2/Mail3/Mail4 (relances),
# chacune repondant a la precedente. Ce script gere les etapes 2, 3 et 4. Chaque etape a son propre
# objet (colonnes Sujet1/Sujet2/Sujet3/Sujet4 dans contacts.csv) : l'objet de la reponse Outlook est
# force sur le Sujet de l'etape en cours (au lieu du "RE: ..." automatique).
#
# Un contact est automatiquement SAUTE si :
#   - aucun mail n'a encore ete envoye pour lui dans ce fil (etape precedente introuvable)
#   - le dernier mail envoye date de moins que le delai avant relance de la campagne
#     (parametres.json, reglable dans l'interface ; 3 jours par defaut ; -MinJours pour forcer)
#   - il a deja repondu manuellement (un mail de sa part est arrive dans la Boite de reception
#     APRES le dernier mail envoye) -> dans ce cas la relance automatique s'arrete pour lui,
#     un humain doit reprendre la main.
#   - un Mail de cette etape (meme sujet = colonne SujetN, meme destinataire) existe deja en
#     brouillon ou a deja ete envoye (evite les doublons si le script est relance plusieurs fois)
#
# Usage : double-cliquer "2 - Mail2 (relance 1).bat" DANS le dossier de la campagne concernee
# (Campagnes\<nom de la campagne>\). Le .bat transmet son propre dossier via -Campagne.
#   .\Build-Relance.ps1 -Campagne "<dossier>" -Etape 2               # delai de la campagne
#   .\Build-Relance.ps1 -Campagne "<dossier>" -Etape 3 -MinJours 0   # sans attendre, pour cette fois

param(
    [Parameter(Mandatory = $true)]
    [string]$Campagne,

    [Parameter(Mandatory = $true)]
    [ValidateSet(2, 3, 4)]
    [int]$Etape,

    # -1 = delai defini pour la campagne (parametres.json)
    [int]$MinJours = -1
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Commun.ps1")

if (-not (Test-Path $Campagne)) { throw "Dossier de campagne introuvable : $Campagne" }
if ($MinJours -lt 0) { $MinJours = Get-DelaiRelance $Campagne }
Write-Host "Delai minimal depuis le dernier envoi : $MinJours jour(s)."
$csvPath   = Join-Path $Campagne "contacts.csv"
$bodyPath  = Join-Path $Campagne "Textes\Mail$Etape.txt"
if (-not (Test-Path $csvPath)) { throw "Fichier introuvable : $csvPath" }

function Convert-MarkdownLiteToHtml {
    param([string[]]$lines)
    $html = New-Object System.Collections.Generic.List[string]
    $inList = $false
    foreach ($rawLine in $lines) {
        $line = $rawLine.TrimEnd()
        if ($line.Trim() -eq "") {
            if ($inList) { $html.Add('</ul>'); $inList = $false }
            $html.Add("<br>")
            continue
        }
        $escaped = $line -replace '&', '&amp;'
        $escaped = [regex]::Replace($escaped, '\[([^\]]+)\]\(([^)]+)\)', '<a href="$2">$1</a>')
        $escaped = [regex]::Replace($escaped, '\*\*(.+?)\*\*', '<strong>$1</strong>')
        if ($escaped.TrimStart().StartsWith("- ")) {
            if (-not $inList) { $html.Add('<ul style="margin:0 0 0 20px; padding:0;">'); $inList = $true }
            $html.Add("<li>$($escaped.TrimStart().Substring(2))</li>")
        } else {
            if ($inList) { $html.Add('</ul>'); $inList = $false }
            $html.Add("$escaped<br>")
        }
    }
    if ($inList) { $html.Add('</ul>') }
    return ($html -join "`r`n")
}

function Set-CorpsAvantSignature {
    # Insere $BodyHtml a la place des lignes vides qu'Outlook place avant la signature/citation
    # (evite l'espace en trop qu'on aurait en collant le texte devant tout le HTMLBody).
    param($MailItem, [string]$BodyHtml)
    $wrapped = "<div style=`"font-family:Aptos,Calibri,Helvetica,sans-serif; font-size:11pt; color:rgb(0,0,0);`">$BodyHtml</div>"
    $html = $MailItem.HTMLBody
    $pattern = '<div class=WordSection1>(\s*<p class=MsoNormal>.*?</p>)*'
    $rx = [System.Text.RegularExpressions.Regex]::new($pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
    $m = $rx.Match($html)
    if ($m.Success) {
        $before = $html.Substring(0, $m.Index)
        $after = $html.Substring($m.Index + $m.Length)
        $MailItem.HTMLBody = $before + '<div class=WordSection1>' + $wrapped + $after
    } else {
        $MailItem.HTMLBody = "<html><body>$wrapped</body></html>" + $html
    }
}

function Resolve-Variables {
    # Remplace les variables {{CIVILITE}}, {{PRENOM}}, {{NOM}}, {{ENTREPRISE}} par les valeurs du contact.
    # Utilisable aussi bien sur le corps du mail que sur l'objet (colonnes SujetN).
    param([string]$Texte, $Contact)
    return $Texte `
        -replace '\{\{CIVILITE\}\}', $Contact.Civilite `
        -replace '\{\{PRENOM\}\}', $Contact.Prenom `
        -replace '\{\{NOM\}\}', $Contact.Nom `
        -replace '\{\{ENTREPRISE\}\}', $Contact.Entreprise
}

function Test-ExisteDeja {
    # Comparaison "commence par" (et non egalite stricte) : compatible avec les mails crees avant
    # l'ajout du suffixe invisible (qui n'en ont pas) et ceux crees depuis (qui en ont un).
    param($folderItems, $subjectPropre, $email)
    foreach ($item in $folderItems) {
        if ($item.Class -ne 43) { continue }
        if (-not $item.Subject.StartsWith($subjectPropre, [StringComparison]::Ordinal)) { continue }
        if (Test-EnvoyeA -Item $item -Email $email) { return $true }   # adresse SMTP, meme en interne
    }
    return $false
}

function Get-SujetAvecSuffixeInvisible {
    # Meme principe que dans Build-Mail1.ps1 : rend l'objet techniquement unique par contact
    # (caracteres invisibles) pour qu'Outlook/Salesforce ne fusionnent pas tous les mails d'une
    # meme vague dans un seul fil de conversation. L'indice doit rester stable d'une etape a
    # l'autre : ne pas reordonner les lignes de contacts.csv en cours de campagne.
    param([string]$Sujet, [int]$Index)
    $zwsp = [char]0x200B
    return $Sujet + ($zwsp.ToString() * ($Index + 1))
}

if (-not (Test-Path $bodyPath)) { throw "Fichier introuvable : $bodyPath" }
$bodyTemplate = Get-Content -Path $bodyPath -Raw -Encoding UTF8
if ($bodyTemplate -match '\[A COMPLETER\]') {
    throw "Le texte $bodyPath contient encore le marqueur [A COMPLETER] : redige le contenu du mail avant de lancer la generation."
}
$contacts = @(Import-Csv -Path $csvPath -Delimiter ';' -Encoding UTF8)  # @() force un tableau meme avec 1 seule ligne

# objets valides pour l'etape precedente (celle qu'on doit trouver envoyee pour pouvoir repondre)
$colonnesPrecedentes = 1..($Etape - 1) | ForEach-Object { "Sujet$_" }

Write-Host "Connexion a Outlook..."
try {
    $outlook = [System.Runtime.InteropServices.Marshal]::GetActiveObject("Outlook.Application")
} catch {
    throw "Outlook (classique) ne semble pas ouvert. Ouvre Outlook - PAS le 'nouveau Outlook' - puis relance ce script."
}
$ns = $outlook.GetNamespace("MAPI")

# Seuls les mails dont l'objet commence par un Sujet1..SujetN de la campagne sont lus (filtre fait par
# Outlook : bien plus rapide que de parcourir tout le dossier Elements envoyes pour chaque contact)
$prefixes = @(foreach ($c in $contacts) { foreach ($n in 1..$Etape) { Resolve-Variables -Texte $c."Sujet$n" -Contact $c } })
$sentItems = @(Get-ItemsParObjet -Folder $ns.GetDefaultFolder(5) -Prefixes $prefixes |
    Sort-Object -Property SentOn -Descending)   # olFolderSentMail, plus recent en premier

$draftItems = Get-ItemsParObjet -Folder $ns.GetDefaultFolder(16) -Prefixes $prefixes  # olFolderDrafts

# Boite de reception : seuls les mails venant des contacts de la campagne (filtre Outlook) sont lus,
# au lieu de reparcourir toute la boite pour chaque contact.
$inboxItems = @(Get-ItemsParExpediteur -Folder $ns.GetDefaultFolder(6) -Adresses @($contacts | ForEach-Object { $_.Email }) -Depuis (Get-Date).AddYears(-1) |
    Sort-Object -Property ReceivedTime -Descending)   # olFolderInbox

$seuilDate = (Get-Date).AddDays(-$MinJours)
$mesAdresses = Get-MesAdresses -Namespace $ns
$issues = Get-Issues $Campagne   # contacts clos par le commercial (RDV, pas interesse...) : plus de relance

for ($i = 0; $i -lt $contacts.Count; $i++) {
    $contact = $contacts[$i]
    $sujetPropre = Resolve-Variables -Texte $contact."Sujet$Etape" -Contact $contact

    $cle = ([string]$contact.Email).Trim().ToLower()
    if ($cle -and $issues.ContainsKey($cle)) {
        Write-Host "[$($contact.Nom)] contact clos ($($issues[$cle].Issue)) - ignore."
        continue
    }

    # Garde-fou : un sujet vide ferait matcher N'IMPORTE QUEL mail (StartsWith("") = vrai),
    # avec le risque de repondre a un echange sans rapport.
    if ([string]::IsNullOrWhiteSpace($sujetPropre)) {
        Write-Host "[$($contact.Nom)] colonne Sujet$Etape vide dans contacts.csv - ignore (rien n'est cree)."
        continue
    }

    $sujetSuffixe = Get-SujetAvecSuffixeInvisible -Sujet $sujetPropre -Index $i

    # Les sujets vides sont ecartes ici aussi : ils matcheraient tous les mails du dossier Envoyes.
    $sujetsPrecedentsPropres = @($colonnesPrecedentes |
        ForEach-Object { Resolve-Variables -Texte $contact.$_ -Contact $contact } |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($sujetsPrecedentsPropres.Count -eq 0) {
        Write-Host "[$($contact.Nom)] aucun sujet d'etape precedente renseigne dans contacts.csv - ignore."
        continue
    }

    if (Test-ExisteDeja -folderItems $sentItems -subjectPropre $sujetPropre -email $contact.Email) {
        Write-Host "[$($contact.Nom)] Mail$Etape deja envoye - ignore."
        continue
    }
    if (Test-ExisteDeja -folderItems $draftItems -subjectPropre $sujetPropre -email $contact.Email) {
        Write-Host "[$($contact.Nom)] brouillon Mail$Etape deja existant - ignore."
        continue
    }

    # 1) dernier mail envoye a ce contact dans ce fil (etape precedente)
    $dernierEnvoye = $null
    foreach ($item in $sentItems) {
        if ($item.Class -ne 43) { continue }
        $matchSujet = $false
        foreach ($sp in $sujetsPrecedentsPropres) { if ($item.Subject.StartsWith($sp, [StringComparison]::Ordinal)) { $matchSujet = $true; break } }
        if (-not $matchSujet) { continue }
        if (-not (Test-EnvoyeA -Item $item -Email $contact.Email)) { continue }
        $dernierEnvoye = $item
        break
    }

    if (-not $dernierEnvoye) {
        Write-Host "[$($contact.Nom)] aucun mail de l'etape precedente envoye - ignore."
        continue
    }

    if ($dernierEnvoye.SentOn -gt $seuilDate) {
        Write-Host "[$($contact.Nom)] dernier envoi le $($dernierEnvoye.SentOn) - trop recent (< $MinJours jour(s)), ignore."
        continue
    }

    # 2) reponse manuelle recue depuis ? -> si oui, on arrete la relance automatique pour ce contact
    $reponseManuelle = $null
    foreach ($item in $inboxItems) {
        if ($item.Class -ne 43) { continue }
        if ($item.ReceivedTime -le $dernierEnvoye.SentOn) { continue }
        # contact = soi-meme (test) : les mails "recus" sont les copies de nos envois, pas des reponses
        if ($mesAdresses -contains $contact.Email.Trim().ToLower()) { break }
        $senderAddr = Get-AdresseExpediteur $item
        if ($senderAddr -and $senderAddr -ieq $contact.Email.Trim()) { $reponseManuelle = $item; break }
    }

    if ($reponseManuelle) {
        Write-Host "[$($contact.Nom)] a deja repondu manuellement le $($reponseManuelle.ReceivedTime) - relance automatique STOPPEE (reprise humaine attendue)."
        continue
    }

    # 3) creation de la relance = vraie reponse Outlook au dernier mail envoye, avec l'objet de l'etape
    $bodyForContact = Resolve-Variables -Texte $bodyTemplate -Contact $contact
    $relanceHtml = Convert-MarkdownLiteToHtml -lines ($bodyForContact -split "`r?`n")

    $reply = $dernierEnvoye.Reply()

    # .Reply() adresse toujours la reponse a l'EXPEDITEUR du mail source. Ici le mail source vient
    # des Elements envoyes : son expediteur, c'est nous. Sans cette correction, la relance part
    # vers soi-meme au lieu du prospect. On vide donc les destinataires et on remet le contact.
    while ($reply.Recipients.Count -gt 0) { $reply.Recipients.Remove(1) }
    $reply.To = $contact.Email
    [void]$reply.Recipients.ResolveAll()

    $reply.Subject = $sujetSuffixe
    Set-CorpsAvantSignature -MailItem $reply -BodyHtml $relanceHtml
    $reply.Save()

    Write-Host "[$($contact.Nom)] Mail$Etape cree (brouillon) - objet : $sujetPropre - repond a l'envoi du $($dernierEnvoye.SentOn)."
}

Write-Host "Termine. Verifie le dossier Brouillons d'Outlook."

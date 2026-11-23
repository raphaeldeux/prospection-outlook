# Genere une VRAIE relance Outlook (via le bouton "Repondre" natif, pilote en COM) pour chaque
# contact de Contacts\contacts.csv, en repondant au DERNIER mail reellement envoye dans le fil
# (Mail1, ou la relance precedente si elle a deja ete envoyee).
#
# Process en 4 etapes : Mail1 (invitation, cf. Build-Mail1.ps1), puis Mail2/Mail3/Mail4 (relances),
# chacune repondant a la precedente. Ce script gere les etapes 2, 3 et 4. Chaque etape a son propre
# objet (colonnes Sujet1/Sujet2/Sujet3/Sujet4 dans contacts.csv) : l'objet de la reponse Outlook est
# force sur le Sujet de l'etape en cours (au lieu du "RE: ..." automatique).
# Le texte est celui de l'etape (Textes\MailN.txt), ou le texte personnalise du contact s'il en a un
# (Textes\personnalises.json, cf. Get-TextesPersonnalises dans Commun.ps1).
#
# Un contact est automatiquement SAUTE si :
#   - aucun mail n'a encore ete envoye pour lui dans ce fil (etape precedente introuvable)
#   - le dernier mail envoye date de moins que le delai avant relance de la campagne
#     (parametres.json, reglable dans l'interface ; 3 jours par defaut ; -MinJours pour forcer)
#   - il a deja repondu manuellement (un mail de sa part est arrive dans la Boite de reception ou
#     un de ses sous-dossiers APRES le dernier mail envoye ; les reponses automatiques, comme
#     "absent du bureau", ne comptent pas) -> dans ce cas la relance automatique s'arrete pour lui,
#     un humain doit reprendre la main.
#   - l'objet de cette etape est identique a celui d'une autre etape (etapes indiscernables)
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

# Texte commun (peut manquer si tous les contacts ont un texte personnalise) et textes personnalises :
# le texte de chaque contact est verifie dans la boucle ([A COMPLETER], absent)
$bodyTemplate = if (Test-Path $bodyPath) { Get-Content -Path $bodyPath -Raw -Encoding UTF8 } else { "" }
$textesPerso = Get-TextesPersonnalises $Campagne
[void](Complete-ObjetsVides $Campagne)   # contacts saisis dans le CSV sans objet : objets communs
$contacts = @(Import-Csv -Path $csvPath -Delimiter ';' -Encoding UTF8)  # @() force un tableau meme avec 1 seule ligne

Write-Host "Connexion a Outlook..."
try {
    $outlook = [System.Runtime.InteropServices.Marshal]::GetActiveObject("Outlook.Application")
} catch {
    throw "Outlook (classique) ne semble pas ouvert. Ouvre Outlook - PAS le 'nouveau Outlook' - puis relance ce script."
}
$ns = $outlook.GetNamespace("MAPI")

# Seuls les mails dont l'objet commence par un Sujet1..Sujet4 de la campagne sont lus (filtre fait par
# Outlook : bien plus rapide que de parcourir tout le dossier Elements envoyes pour chaque contact).
# Les 4 etapes sont lues pour attribuer chaque mail a la bonne etape (prefixe le plus long).
$prefixes = @(foreach ($c in $contacts) { foreach ($n in 1..4) { Resolve-Variables -Texte $c."Sujet$n" -Contact $c } })
$sentItems = @(Get-ItemsParObjet -Folder $ns.GetDefaultFolder(5) -Prefixes $prefixes |
    Sort-Object -Property SentOn -Descending)   # olFolderSentMail, plus recent en premier

$draftItems = Get-ItemsParObjet -Folder $ns.GetDefaultFolder(16) -Prefixes $prefixes  # olFolderDrafts

# Reponses : mails venant des contacts de la campagne (filtre Outlook), dans la Boite de reception ET ses
# sous-dossiers (une regle peut y ranger une reponse), reponses automatiques (absence...) exclues.
$inboxItems = @(Get-ReponsesRecues -Namespace $ns -Adresses @($contacts | ForEach-Object { $_.Email }) -Depuis (Get-Date).AddYears(-1) |
    Sort-Object -Property ReceivedTime -Descending)

$seuilDate = (Get-Date).AddDays(-$MinJours)
$mesAdresses = Get-MesAdresses -Namespace $ns
$ccCampagne = Get-CcCampagne $Campagne   # adresses en copie de tous les mails (parametres.json)
$issues = Get-Issues $Campagne   # contacts clos par le commercial (RDV, pas interesse...) : plus de relance

for ($i = 0; $i -lt $contacts.Count; $i++) {
    $contact = $contacts[$i]
    $sujets = Get-SujetsEtapes $contact
    $sujetPropre = $sujets[$Etape]

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

    # Deux etapes de meme objet : impossible de savoir laquelle a ete envoyee
    $ambigu = Test-SujetsAmbigus -SujetsEtapes $sujets -Etape $Etape
    if ($ambigu) {
        Write-Host "[$($contact.Nom)] Mail$Etape : $ambigu - ignore." -ForegroundColor Yellow
        continue
    }
    if (-not @(1..($Etape - 1) | Where-Object { -not [string]::IsNullOrWhiteSpace($sujets[$_]) })) {
        Write-Host "[$($contact.Nom)] aucun sujet d'etape precedente renseigne dans contacts.csv - ignore."
        continue
    }

    if (Test-ExisteDeja -Items $sentItems -SujetsEtapes $sujets -Etape $Etape -Email $contact.Email) {
        Write-Host "[$($contact.Nom)] Mail$Etape deja envoye - ignore."
        continue
    }
    if (Test-ExisteDeja -Items $draftItems -SujetsEtapes $sujets -Etape $Etape -Email $contact.Email) {
        Write-Host "[$($contact.Nom)] brouillon Mail$Etape deja existant - ignore."
        continue
    }

    # 1) dernier mail envoye a ce contact dans ce fil (une etape precedente, reconnue a son objet)
    $dernierEnvoye = $null
    foreach ($item in $sentItems) {
        if ($item.Class -ne 43) { continue }
        $n = Get-EtapeDuSujet -Sujet $item.Subject -SujetsEtapes $sujets
        if ($n -lt 1 -or $n -ge $Etape) { continue }
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
    $modele = Get-TexteDuContact -Commun $bodyTemplate -Personnalises $textesPerso -Email $contact.Email -Etape $Etape
    if ($modele.Probleme) {
        Write-Host "[$($contact.Nom)] $($modele.Probleme) - ignore (redige le texte dans l'onglet Textes)." -ForegroundColor Yellow
        continue
    }
    $bodyForContact = Resolve-Variables -Texte $modele.Texte -Contact $contact
    $relanceHtml = Convert-MarkdownLiteToHtml -lines ($bodyForContact -split "`r?`n")

    $reply = $dernierEnvoye.Reply()

    # .Reply() adresse toujours la reponse a l'EXPEDITEUR du mail source. Ici le mail source vient
    # des Elements envoyes : son expediteur, c'est nous. Sans cette correction, la relance part
    # vers soi-meme au lieu du prospect. On vide donc les destinataires et on remet le contact.
    # Recipients.Add + Resolve() (comme Build-Mail1.ps1) plutot que $reply.To = ... : l'adresse est
    # validee comme si on la tapait a la main, et on previent si Outlook ne la reconnait pas.
    while ($reply.Recipients.Count -gt 0) { $reply.Recipients.Remove(1) }
    $email = ([string]$contact.Email).Trim()
    $recip = $reply.Recipients.Add($email)
    $recip.Type = 1  # olTo
    if (-not $recip.Resolve()) {
        Write-Host "[$($contact.Nom)] ATTENTION : Outlook n'a pas pu valider l'adresse '$email' - verifie-la dans le brouillon." -ForegroundColor Yellow
    }

    $nbCc = Add-DestinatairesCc -Mail $reply -Contact $contact -CcCampagne $ccCampagne
    $reply.Subject = $sujetSuffixe
    Set-CorpsAvantSignature -MailItem $reply -BodyHtml $relanceHtml
    $reply.Save()

    Write-Host "[$($contact.Nom)] Mail$Etape cree (brouillon, $($modele.Source)) - objet : $sujetPropre$(if ($nbCc) { " - $nbCc en copie" }) - repond a l'envoi du $($dernierEnvoye.SentOn)."
}

Write-Host "Termine. Verifie le dossier Brouillons d'Outlook."

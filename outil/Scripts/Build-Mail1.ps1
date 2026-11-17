# Cree les brouillons Mail1 (invitation initiale) DIRECTEMENT dans Outlook (comme Build-Relance.ps1
# pour Mail2/3/4), a partir de Contacts\contacts.csv + Textes\Mail1.txt.
#
# Contrairement a Build-ProspectionEml.ps1 (qui genere des .eml a importer a la main), ce script pilote
# Outlook en COM : il cree un vrai brouillon, avec la signature par defaut incluse. Rien n'est envoye.
#
# La signature est lue directement depuis le fichier sur le disque (images deja en base64, donc pas
# de piece jointe a gerer) plutot que "capturee" via GetInspector : ouvrir une fenetre Outlook par
# contact rend Outlook instable sur de grandes listes (RPC server unavailable observe en pratique),
# et reutiliser le HTML d'un mail GetInspector sur d'autres mails casse les images (cid: orphelins).
#
# Un contact est saute si un Mail1 (meme sujet = colonne Sujet1, meme destinataire) existe deja en
# brouillon ou a deja ete envoye, pour eviter les doublons si le script est relance plusieurs fois.
#
# Usage : double-cliquer "1 - Mail1.bat" DANS le dossier de la campagne concernee
# (Campagnes\<nom de la campagne>\). Le .bat transmet son propre dossier via -Campagne.

param(
    [Parameter(Mandatory = $true)]
    [string]$Campagne
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Commun.ps1")

if (-not (Test-Path $Campagne)) { throw "Dossier de campagne introuvable : $Campagne" }
$csvPath   = Join-Path $Campagne "contacts.csv"
$bodyPath  = Join-Path $Campagne "Textes\Mail1.txt"
if (-not (Test-Path $csvPath))  { throw "Fichier introuvable : $csvPath" }
if (-not (Test-Path $bodyPath)) { throw "Fichier introuvable : $bodyPath" }

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
    # Insere $BodyHtml a la place des lignes vides qu'Outlook place avant la signature
    # (evite l'espace en trop qu'on aurait en collant le texte devant tout le HTMLBody).
    param($HtmlSignature, [string]$BodyHtml)
    $wrapped = "<div style=`"font-family:Aptos,Calibri,Helvetica,sans-serif; font-size:11pt; color:rgb(0,0,0);`">$BodyHtml</div>"
    $pattern = '<div class=WordSection1>(\s*<p class=MsoNormal>.*?</p>)*'
    $rx = [System.Text.RegularExpressions.Regex]::new($pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
    $m = $rx.Match($HtmlSignature)
    if ($m.Success) {
        $before = $HtmlSignature.Substring(0, $m.Index)
        $after = $HtmlSignature.Substring($m.Index + $m.Length)
        return $before + '<div class=WordSection1>' + $wrapped + $after
    } else {
        return "<html><body>$wrapped</body></html>" + $HtmlSignature
    }
}

function Get-SignatureDepuisDisque {
    # Lit directement le fichier de signature Outlook sur le disque : les images y sont deja
    # encodees en base64 (data:image/...) dans le HTML, donc aucune piece jointe n'est necessaire -
    # contrairement a la signature "capturee" via GetInspector, dont les images (referencees en
    # cid:...) dependent d'une piece jointe qui n'existe que sur le mail d'origine et se perd des
    # qu'on reutilise le HTML tel quel sur un autre mail (d'ou des images cassees).
    # Le fichier de signature Outlook est un simple FRAGMENT html (pas de <html>/<body>), utilisable tel quel.
    #
    # Signature choisie = celle definie "par defaut pour les nouveaux messages" dans Outlook (lue dans
    # le registre, profil par profil). A defaut, la seule signature presente. S'il y en a plusieurs
    # et aucune par defaut, on s'arrete plutot que d'en prendre une au hasard.
    param($Outlook)
    $dossierSig = "$env:APPDATA\Microsoft\Signatures"
    $toutes = @(Get-ChildItem -Path $dossierSig -Filter "*.htm" -ErrorAction SilentlyContinue)
    if ($toutes.Count -eq 0) { throw "Aucune signature Outlook trouvee dans $dossierSig. Configure une signature par defaut dans Outlook (Fichier > Options > Courrier > Signatures)." }

    $compteDefaut = $null
    try { $compteDefaut = $Outlook.Session.Accounts.Item(1).SmtpAddress } catch {}
    $nomsParDefaut = @()
    foreach ($profil in @(Get-ChildItem "HKCU:\Software\Microsoft\Office\16.0\Outlook\Profiles" -ErrorAction SilentlyContinue)) {
        foreach ($cle in @(Get-ChildItem (Join-Path $profil.PSPath "9375CFF0413111d3B88A00104B2A6676") -ErrorAction SilentlyContinue)) {
            $p = Get-ItemProperty $cle.PSPath
            $nom = $p.'New Signature'; if ($nom -is [byte[]]) { $nom = [Text.Encoding]::Unicode.GetString($nom).TrimEnd([char]0) }
            if (-not $nom) { continue }
            $compte = $p.'Account Name'; if ($compte -is [byte[]]) { $compte = [Text.Encoding]::Unicode.GetString($compte).TrimEnd([char]0) }
            if ($compteDefaut -and $compte -ieq $compteDefaut) { $nomsParDefaut = @($nom) + $nomsParDefaut } else { $nomsParDefaut += $nom }
        }
    }
    $sigFile = $null
    foreach ($n in $nomsParDefaut) {
        $sigFile = $toutes | Where-Object { $_.BaseName -eq $n } | Select-Object -First 1
        if ($sigFile) { break }
    }
    if (-not $sigFile) {
        if ($toutes.Count -gt 1) {
            throw "Plusieurs signatures Outlook existent mais aucune n'est definie par defaut pour les nouveaux messages. Dans Outlook : Fichier > Options > Courrier > Signatures > 'Nouveaux messages'."
        }
        $sigFile = $toutes[0]
    }
    Write-Host "Signature utilisee : $($sigFile.BaseName)"
    $html = Get-Content -Path $sigFile.FullName -Raw -Encoding UTF8

    # Certaines signatures referencent leurs images dans un dossier "<nom>_files\" a cote du .htm :
    # on les integre en base64, sinon elles seraient cassees dans le mail.
    $html = [regex]::Replace($html, '(src=")([^":]+\.(png|jpe?g|gif))(")', {
        param($m)
        $chemin = Join-Path $dossierSig ([Uri]::UnescapeDataString($m.Groups[2].Value) -replace '/', '\')
        if (-not (Test-Path $chemin)) { return $m.Value }
        $ext = $m.Groups[3].Value.ToLower(); if ($ext -eq 'jpg') { $ext = 'jpeg' }
        return $m.Groups[1].Value + "data:image/$ext;base64," + [Convert]::ToBase64String([IO.File]::ReadAllBytes($chemin)) + $m.Groups[4].Value
    }, [Text.RegularExpressions.RegexOptions]::IgnoreCase)
    return $html
}

function Get-SujetAvecSuffixeInvisible {
    # Ajoute des caracteres invisibles (zero-width space) en nombre unique par contact, pour que
    # chaque mail d'une meme vague ait un objet TECHNIQUEMENT different (invisible a la lecture).
    # Sans ca, Outlook (et les outils qui s'appuient sur son regroupement de conversation, ex.
    # Salesforce) fusionnent tous les mails de meme objet en un seul fil, meme envoyes a des
    # destinataires differents - ce qui empeche de les consigner un par un.
    # IMPORTANT : ne pas reordonner les lignes de contacts.csv en cours de campagne, l'indice de
    # chaque contact doit rester stable d'une etape a l'autre pour retrouver le meme objet.
    param([string]$Sujet, [int]$Index)
    $zwsp = [char]0x200B
    return $Sujet + ($zwsp.ToString() * ($Index + 1))
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
    # Comparaison "commence par" (et non egalite stricte) : les mails deja crees avant l'ajout du
    # suffixe invisible n'en ont pas, ceux crees a partir de maintenant en ont un - les deux doivent
    # matcher sur l'objet propre (sans suffixe).
    param($folderItems, $subjectPropre, $email)
    foreach ($item in $folderItems) {
        if ($item.Class -ne 43) { continue }
        if (-not $item.Subject.StartsWith($subjectPropre, [StringComparison]::Ordinal)) { continue }
        if (Test-EnvoyeA -Item $item -Email $email) { return $true }   # adresse SMTP, meme en interne
    }
    return $false
}

$bodyTemplate = Get-Content -Path $bodyPath -Raw -Encoding UTF8
if ($bodyTemplate -match '\[A COMPLETER\]') {
    throw "Le texte $bodyPath contient encore le marqueur [A COMPLETER] : redige le contenu du mail avant de lancer la generation."
}
$contacts = @(Import-Csv -Path $csvPath -Delimiter ';' -Encoding UTF8)  # @() force un tableau meme avec 1 seule ligne

Write-Host "Connexion a Outlook..."
try {
    $outlook = [System.Runtime.InteropServices.Marshal]::GetActiveObject("Outlook.Application")
} catch {
    throw "Outlook (classique) ne semble pas ouvert. Ouvre Outlook - PAS le 'nouveau Outlook' - puis relance ce script."
}
$ns = $outlook.GetNamespace("MAPI")
# Seuls les mails dont l'objet commence par un Sujet1 de la campagne sont lus (filtre Outlook, rapide)
$prefixes = @($contacts | ForEach-Object { Resolve-Variables -Texte $_.Sujet1 -Contact $_ })
$sentItems = Get-ItemsParObjet -Folder $ns.GetDefaultFolder(5) -Prefixes $prefixes    # olFolderSentMail
$draftItems = Get-ItemsParObjet -Folder $ns.GetDefaultFolder(16) -Prefixes $prefixes   # olFolderDrafts

Write-Host "Lecture de la signature Outlook sur le disque..."
$signatureHtml = Get-SignatureDepuisDisque -Outlook $outlook

$issues = Get-Issues $Campagne   # contacts clos par le commercial (RDV, pas interesse...) : rien a preparer

for ($i = 0; $i -lt $contacts.Count; $i++) {
    $contact = $contacts[$i]
    $email = ([string]$contact.Email).Trim()
    $sujetPropre = Resolve-Variables -Texte $contact.Sujet1 -Contact $contact
    $sujetSuffixe = Get-SujetAvecSuffixeInvisible -Sujet $sujetPropre -Index $i

    # Garde-fous : une ligne sans e-mail creerait un brouillon sans destinataire (a chaque lancement),
    # et un objet vide ferait matcher n'importe quel mail (StartsWith("") = vrai).
    if ([string]::IsNullOrWhiteSpace($email)) {
        if (-not [string]::IsNullOrWhiteSpace($contact.Nom)) { Write-Host "[$($contact.Nom)] colonne Email vide - ignore." }
        continue
    }
    if ($issues.ContainsKey($email.ToLower())) {
        Write-Host "[$($contact.Nom)] contact clos ($($issues[$email.ToLower()].Issue)) - ignore."
        continue
    }
    if ([string]::IsNullOrWhiteSpace($sujetPropre)) {
        Write-Host "[$($contact.Nom)] colonne Sujet1 vide dans contacts.csv - ignore (rien n'est cree)."
        continue
    }

    if (Test-ExisteDeja -folderItems $sentItems -subjectPropre $sujetPropre -email $email) {
        Write-Host "[$($contact.Nom)] deja envoye - ignore."
        continue
    }
    if (Test-ExisteDeja -folderItems $draftItems -subjectPropre $sujetPropre -email $email) {
        Write-Host "[$($contact.Nom)] brouillon deja existant - ignore."
        continue
    }

    $bodyForContact = Resolve-Variables -Texte $bodyTemplate -Contact $contact
    $bodyHtml = Convert-MarkdownLiteToHtml -lines ($bodyForContact -split "`r?`n")

    $mail = $outlook.CreateItem(0)  # olMailItem, pas de GetInspector ici : pas de fenetre ouverte
    # Ne PAS utiliser $mail.To = ... : le destinataire serait enregistre sans adresse reelle
    # (affichee mais vide en interne), et le mail ne part pas tant qu'on ne recolle pas l'adresse.
    # Recipients.Add + Resolve() fait la meme validation qu'Outlook quand on tape l'adresse a la main.
    $recip = $mail.Recipients.Add($email)
    $recip.Type = 1  # olTo
    if (-not $recip.Resolve()) {
        Write-Host "[$($contact.Nom)] ATTENTION : Outlook n'a pas pu valider l'adresse '$email' - verifie-la dans le brouillon." -ForegroundColor Yellow
    }
    $mail.Subject = $sujetSuffixe
    $mail.HTMLBody = Set-CorpsAvantSignature -HtmlSignature $signatureHtml -BodyHtml $bodyHtml
    $mail.Save()

    Write-Host "[$($contact.Nom)] Mail1 cree (brouillon) - objet : $sujetPropre"
}

Write-Host "Termine. Verifie le dossier Brouillons d'Outlook."

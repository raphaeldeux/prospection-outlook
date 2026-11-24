# Fonctions partagees par les scripts (charge par ". $PSScriptRoot\Commun.ps1").

# Delai minimal (en jours) entre deux mails d'une sequence, si la campagne n'en definit pas.
$DelaiRelanceParDefaut = 3

function Get-DelaiRelance {
    # Delai avant relance propre a la campagne : fichier parametres.json du dossier de campagne
    # (modifiable dans l'interface). 0 = relance possible des le jour du dernier envoi.
    param([string]$Dossier)
    $f = Join-Path $Dossier "parametres.json"
    if (Test-Path $f) {
        try {
            $p = Get-Content $f -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($null -ne $p.DelaiRelanceJours -and [int]$p.DelaiRelanceJours -ge 0) { return [int]$p.DelaiRelanceJours }
        } catch {}
    }
    return $DelaiRelanceParDefaut
}

function Split-Adresses {
    # "a@x.fr; b@y.fr, c@z.fr" -> @("a@x.fr", "b@y.fr", "c@z.fr") (separateurs ; , espace, retour a la ligne)
    param([string]$Texte)
    return @(([string]$Texte) -split '[;,\s]+' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

function Get-CcCampagne {
    # Adresses mises en copie de TOUS les mails de la campagne (parametres.json, champ Cc ; reglable dans l'interface)
    param([string]$Dossier)
    $f = Join-Path $Dossier "parametres.json"
    if (Test-Path $f) {
        try { return (Split-Adresses ([string](Get-Content $f -Raw -Encoding UTF8 | ConvertFrom-Json).Cc)) } catch {}
    }
    return @()
}

function Add-DestinatairesCc {
    # Met en copie (CC) d'un brouillon les adresses de la campagne + celles de la colonne CC du contact.
    # Recipients.Add + Resolve() comme pour le destinataire principal (adresse validee par Outlook).
    # L'adresse du contact lui-meme et les doublons sont ignores. Renvoie le nombre d'adresses ajoutees.
    param($Mail, $Contact, [string[]]$CcCampagne)
    $principal = ([string]$Contact.Email).Trim().ToLower()
    $deja = @{}
    foreach ($a in @($CcCampagne) + @(Split-Adresses $Contact.CC)) {
        if (-not $a) { continue }
        $cle = $a.ToLower()
        if ($cle -eq $principal -or $deja.ContainsKey($cle)) { continue }
        $deja[$cle] = $true
        $r = $Mail.Recipients.Add($a)
        $r.Type = 2  # olCC
        if (-not $r.Resolve()) {
            Write-Host "[$($Contact.Nom)] ATTENTION : Outlook n'a pas pu valider l'adresse en copie '$a' - verifie-la dans le brouillon." -ForegroundColor Yellow
        }
    }
    return $deja.Count
}

function Get-Issues {
    # Issue renseignee par le commercial pour chaque contact (RDV obtenu, pas interesse...), fichier
    # issues.json du dossier de campagne : { "adresse@x.fr": { "Issue": "rdv", "Note": "...", "Le": "jj/mm/aaaa" } }.
    # Un contact avec une issue est "clos" : plus aucun mail ne lui est prepare.
    param([string]$Dossier)
    $resultat = @{}
    $f = Join-Path $Dossier "issues.json"
    if (Test-Path $f) {
        try {
            $j = Get-Content $f -Raw -Encoding UTF8 | ConvertFrom-Json
            foreach ($p in $j.PSObject.Properties) {
                if ($p.Value.Issue) { $resultat[$p.Name.Trim().ToLower()] = $p.Value }
            }
        } catch {}
    }
    return $resultat
}

function Get-TextesPersonnalises {
    # Textes propres a un contact, qui REMPLACENT le texte commun de l'etape pour lui seul : fichier
    # Textes\personnalises.json du dossier de campagne (modifiable dans l'interface, onglet Textes) :
    #   { "adresse@x.fr": { "1": "texte du Mail1", "3": "texte du Mail3" } }
    # Renvoie @{ adresse (minuscules) = @{ etape (int) = texte } }.
    param([string]$Dossier)
    $resultat = @{}
    $f = Join-Path $Dossier "Textes\personnalises.json"
    if (Test-Path $f) {
        $j = Get-Content $f -Raw -Encoding UTF8 | ConvertFrom-Json   # fichier illisible : erreur explicite, pas de texte commun a la place
        foreach ($p in $j.PSObject.Properties) {
            $etapes = @{}
            foreach ($e in $p.Value.PSObject.Properties) {
                if (-not [string]::IsNullOrWhiteSpace([string]$e.Value)) { $etapes[[int]$e.Name] = [string]$e.Value }
            }
            if ($etapes.Count) { $resultat[$p.Name.Trim().ToLower()] = $etapes }
        }
    }
    return $resultat
}

function Get-TexteDuContact {
    # Texte a utiliser pour ce contact a cette etape : son texte personnalise s'il en a un, sinon le
    # texte commun. Renvoie aussi d'ou il vient (pour le journal) et pourquoi il n'est pas utilisable.
    param([string]$Commun, [hashtable]$Personnalises, [string]$Email, [int]$Etape)
    $cle = ([string]$Email).Trim().ToLower()
    if ($cle -and $Personnalises.ContainsKey($cle) -and $Personnalises[$cle].ContainsKey($Etape)) {
        $texte = $Personnalises[$cle][$Etape]; $source = "texte personnalise"
    } else {
        $texte = $Commun; $source = "texte commun"
    }
    $probleme = $null
    if ([string]::IsNullOrWhiteSpace($texte)) { $probleme = "$source absent" }
    elseif ($texte -match '\[A COMPLETER\]') { $probleme = "$source encore marque [A COMPLETER]" }
    return [pscustomobject]@{ Texte = $texte; Source = $source; Probleme = $probleme }
}

function Resolve-Variables {
    # Remplace {{CIVILITE}}, {{PRENOM}}, {{NOM}}, {{ENTREPRISE}} par les valeurs du contact (corps et objets).
    # .Replace (texte litteral) et non -replace : avec -replace, un "$" dans une valeur ("$_", "$1"...)
    # serait interprete comme une reference de remplacement.
    param([string]$Texte, $Contact)
    return $Texte.Replace('{{CIVILITE}}', [string]$Contact.Civilite).
        Replace('{{PRENOM}}', [string]$Contact.Prenom).
        Replace('{{NOM}}', [string]$Contact.Nom).
        Replace('{{ENTREPRISE}}', [string]$Contact.Entreprise)
}

function Complete-ObjetsVides {
    # Contacts ajoutes a la main dans contacts.csv (Excel...) : leurs colonnes Sujet1..Sujet4 sont toutes vides,
    # alors qu'un contact ajoute depuis l'interface recoit les objets communs. Sans objet, le contact etait
    # ignore (aucun brouillon) et affiche comme "personnalise". On lui donne donc les objets communs, comme
    # l'interface. Seules les lignes dont les 4 objets sont vides sont completees : un objet vide sur une ligne
    # qui en a d'autres est voulu (il arrete la sequence a cette etape) et n'est pas touche.
    # Objet commun = celui memorise pour la campagne (parametres.json, Objets), sinon le plus frequent.
    # Renvoie le nombre de contacts completes (0 = fichier inchange) ; fichier verrouille : avertissement, -1.
    param([string]$Dossier)
    $csv = Join-Path $Dossier "contacts.csv"
    if (-not (Test-Path $csv)) { return 0 }
    try { $contacts = @(Import-Csv -Path $csv -Delimiter ';' -Encoding UTF8) } catch { return -1 }   # illisible : rien a faire ici
    $aCompleter = @($contacts | Where-Object {
        $c = $_
        ([string]$c.Email).Trim() -and -not (@(1..4 | Where-Object { ([string]$c."Sujet$_").Trim() }))
    })
    if ($aCompleter.Count -eq 0) { return 0 }

    $memorises = $null
    $f = Join-Path $Dossier "parametres.json"
    if (Test-Path $f) { try { $memorises = (Get-Content $f -Raw -Encoding UTF8 | ConvertFrom-Json).Objets } catch {} }
    $communs = @($null) + @(foreach ($n in 1..4) {
        $m = if ($memorises -and @($memorises).Count -ge $n) { @($memorises)[$n - 1] } else { $null }
        if ($m -is [string]) { $m.Trim() }
        else {
            $plusFrequent = $contacts | ForEach-Object { ([string]$_."Sujet$n").Trim() } | Where-Object { $_ } |
                Group-Object -NoElement | Sort-Object Count -Descending | Select-Object -First 1
            if ($plusFrequent) { $plusFrequent.Name } else { "" }
        }
    })
    if (-not $communs[1]) { return 0 }   # pas d'objet commun pour Mail1 : rien a donner

    foreach ($c in $aCompleter) {
        foreach ($n in 1..4) { $c | Add-Member -NotePropertyName "Sujet$n" -NotePropertyValue $communs[$n] -Force }
    }
    # Reecriture au meme format que l'interface (Serveur-Interface.ps1) : ; separateur, UTF-8 avec BOM, ordre des colonnes garde
    $entete = @((Get-Content $csv -Encoding UTF8 -TotalCount 1) -split ';' | ForEach-Object { $_.Trim('"') } | Where-Object { $_ })
    $colonnes = @($entete) + @(1..4 | ForEach-Object { "Sujet$_" } | Where-Object { $_ -notin $entete })
    $champ = { param($v) $v = ([string]$v) -replace "[\r\n]+", " "; if ($v -match '[;"]') { '"' + ($v -replace '"', '""') + '"' } else { $v } }
    $lignes = @((($colonnes | ForEach-Object { & $champ $_ }) -join ';'))
    foreach ($c in $contacts) { $lignes += (($colonnes | ForEach-Object { & $champ $c.$_ }) -join ';') }
    try {
        [IO.File]::WriteAllText($csv, (($lignes -join "`r`n") + "`r`n"), (New-Object System.Text.UTF8Encoding $true))
    } catch [System.IO.IOException] {
        Write-Warning "contacts.csv est ouvert dans Excel : impossible d'y ajouter les objets communs des $($aCompleter.Count) contact(s) sans objet. Ferme-le puis relance."
        return -1
    }
    Write-Host "Objets communs ajoutes a $($aCompleter.Count) contact(s) saisi(s) sans objet dans contacts.csv."
    return $aCompleter.Count
}

function Get-SujetsEtapes {
    # Objets des 4 etapes pour un contact, variables resolues : tableau indexe 1..4 (indice 0 inutilise)
    param($Contact)
    return @($null) + @(1..4 | ForEach-Object { Resolve-Variables -Texte $Contact."Sujet$_" -Contact $Contact })
}

function Get-EtapeDuSujet {
    # Renvoie l'etape (1-4) dont l'objet correspond le mieux a l'objet d'un mail (prefixe le plus long), 0 sinon.
    # Le "plus long" evite qu'un Sujet1 qui serait le debut d'un Sujet2 (ou l'inverse) capte les mails
    # de l'autre etape. Comparaison "commence par" : l'objet reel porte un suffixe invisible.
    # Insensible a la casse : une majuscule changee a la main dans Outlook avant l'envoi ("Sante" -> "sante")
    # ne doit pas faire perdre le mail (le filtre Outlook, LIKE, l'est deja).
    param([string]$Sujet, [string[]]$SujetsEtapes)
    $meilleure = 0; $longueur = -1
    for ($n = 1; $n -le 4; $n++) {
        $s = $SujetsEtapes[$n]
        if ([string]::IsNullOrWhiteSpace($s)) { continue }
        if ($Sujet.StartsWith($s, [StringComparison]::OrdinalIgnoreCase) -and $s.Length -gt $longueur) { $meilleure = $n; $longueur = $s.Length }
    }
    return $meilleure
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
    return $Sujet + ([string][char]0x200B * ($Index + 1))
}

function Convert-MarkdownLiteToHtml {
    # Mise en forme des textes : **gras**, lignes "- " en puces, [texte](lien), ligne vide = saut de ligne.
    # Meme rendu que l'apercu de l'interface (texteVersHtml, interface/src/lib/apercu.ts) : & < > " sont
    # echappes (sinon "delai <30 jours" disparaitrait du mail), et seuls les liens http(s) et mailto sont
    # gardes comme liens.
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
        $escaped = $line.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;').Replace('"', '&quot;')
        $escaped = [regex]::Replace($escaped, '\[([^\]]+)\]\(([^)]+)\)', {
            param($m)
            if ($m.Groups[2].Value -match '^(https?:|mailto:)') { '<a href="' + $m.Groups[2].Value + '">' + $m.Groups[1].Value + '</a>' }
            else { $m.Groups[1].Value }
        })
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

function Test-ExisteDeja {
    # Vrai si un mail de l'etape $Etape (objet reconnu par Get-EtapeDuSujet) a ete adresse a ce contact
    # dans ces elements (Envoyes ou Brouillons).
    param($Items, [string[]]$SujetsEtapes, [int]$Etape, [string]$Email)
    foreach ($item in $Items) {
        if ($item.Class -ne 43) { continue }
        if ((Get-EtapeDuSujet -Sujet $item.Subject -SujetsEtapes $SujetsEtapes) -ne $Etape) { continue }
        if (Test-EnvoyeA -Item $item -Email $Email) { return $true }   # adresse SMTP, meme en interne
    }
    return $false
}

function Test-SujetsAmbigus {
    # Message d'erreur si l'objet de l'etape $Etape est identique a celui d'une autre etape (variables
    # resolues) : les mails des deux etapes seraient indiscernables. $null si tout va bien.
    param([string[]]$SujetsEtapes, [int]$Etape)
    for ($n = 1; $n -le 4; $n++) {
        if ($n -ne $Etape -and -not [string]::IsNullOrWhiteSpace($SujetsEtapes[$n]) -and $SujetsEtapes[$n] -eq $SujetsEtapes[$Etape]) {
            return "objet identique a celui du Mail$n (donne un objet different a chaque etape)"
        }
    }
    return $null
}

function Test-ReponseAutomatique {
    # Vrai pour un message automatique (absence du bureau, accuse de reception...) : ce n'est pas une
    # vraie reponse du contact, il ne doit pas arreter les relances.
    param($Item)
    try {
        $classe = [string]$Item.MessageClass
        if ($classe -like "IPM.Note.Rules.*" -or $classe -like "REPORT.*") { return $true }   # OOF Exchange, NDR...
    } catch {}
    try {
        $entetes = [string]$Item.PropertyAccessor.GetProperty("http://schemas.microsoft.com/mapi/proptag/0x007D001F")  # PR_TRANSPORT_MESSAGE_HEADERS
        if ($entetes -match '(?im)^Auto-Submitted:\s*auto-(replied|generated)' -or
            $entetes -match '(?im)^X-Autoreply:\s*yes' -or
            $entetes -match '(?im)^X-Autorespond:' -or
            $entetes -match '(?im)^Precedence:\s*auto_reply') { return $true }
    } catch {}
    $objet = [string]$Item.Subject
    # (\xE9 = e accent aigu, \xE1 = a accent aigu : ce fichier doit rester en ASCII pour Windows PowerShell 5.1)
    return $objet -match '^\s*(R[\xE9e]ponse automatique|Automatic reply|Auto(matic)?[- ]?reply|Absent du bureau|Absence du bureau|Out of (the )?office|Abwesend|Respuesta autom[\xE1a]tica)\b'
}

function Get-DossiersReception {
    # Boite de reception et tous ses sous-dossiers (recursif) : une regle Outlook peut y ranger la
    # reponse d'un prospect, qu'il ne faut pas manquer.
    param($Namespace)
    $liste = New-Object System.Collections.Generic.List[object]
    $aParcourir = New-Object System.Collections.Generic.Queue[object]
    $aParcourir.Enqueue($Namespace.GetDefaultFolder(6))   # olFolderInbox
    while ($aParcourir.Count -gt 0) {
        $f = $aParcourir.Dequeue()
        $liste.Add($f)
        try { foreach ($s in $f.Folders) { if ($s.DefaultItemType -eq 0) { $aParcourir.Enqueue($s) } } } catch {}   # dossiers de mails seulement
    }
    return , $liste
}

function Get-ReponsesRecues {
    # Mails envoyes par ces adresses, recus apres $Depuis, dans la Boite de reception et ses sous-dossiers,
    # reponses automatiques exclues.
    param($Namespace, [string[]]$Adresses, [datetime]$Depuis)
    $vus = @{}
    foreach ($dossier in (Get-DossiersReception $Namespace)) {
        foreach ($item in (Get-ItemsParExpediteur -Folder $dossier -Adresses $Adresses -Depuis $Depuis)) {
            $id = $item.EntryID
            if ($vus.ContainsKey($id)) { continue }
            $vus[$id] = $true
            if (Test-ReponseAutomatique $item) { continue }
            $item
        }
    }
}

function Get-ItemsParObjet {
    # Renvoie les elements d'un dossier Outlook dont l'objet COMMENCE par l'un des prefixes donnes.
    # Le filtre est execute par Outlook lui-meme (Restrict + requete DASL), ce qui evite de parcourir
    # tout le dossier en PowerShell : sur ~1 600 mails envoyes, on passe d'une minute a une seconde.
    # Les prefixes sont traites par paquets pour garder des requetes de taille raisonnable.
    param($Folder, [string[]]$Prefixes)
    $resultat = New-Object System.Collections.Generic.List[object]
    $vus = @{}
    $uniques = @($Prefixes | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)
    for ($i = 0; $i -lt $uniques.Count; $i += 30) {
        $paquet = $uniques[$i..([Math]::Min($i + 29, $uniques.Count - 1))]
        $conditions = foreach ($p in $paquet) {
            "`"urn:schemas:httpmail:subject`" LIKE '" + ($p -replace "'", "''") + "%'"
        }
        foreach ($item in $Folder.Items.Restrict("@SQL=" + ($conditions -join " OR "))) {
            if ($item.Class -ne 43) { continue }
            $id = $item.EntryID
            if ($vus.ContainsKey($id)) { continue }
            $vus[$id] = $true
            $resultat.Add($item)
        }
    }
    # renvoyes un par un : "return , $liste" passerait la liste comme UN seul objet dans le pipeline
    # (un "| Sort-Object" ne trierait rien et une boucle verrait tous les mails a la fois)
    $resultat
}

function Get-ItemsParExpediteur {
    # Renvoie les mails d'un dossier (Boite de reception) envoyes par l'une des adresses donnees, recus
    # apres $Depuis. Meme principe que Get-ItemsParObjet : filtre execute par Outlook.
    # LIKE (insensible a la casse) puis comparaison exacte ici, l'adresse du CSV pouvant differer en casse.
    param($Folder, [string[]]$Adresses, [datetime]$Depuis)
    $resultat = New-Object System.Collections.Generic.List[object]
    $uniques = @($Adresses | Where-Object { $_ -and $_.Contains("@") } | ForEach-Object { $_.Trim().ToLower() } | Select-Object -Unique)
    # Deux proprietes : l'adresse "brute" (SMTP pour un externe) et l'adresse SMTP de l'expediteur, seule
    # utilisable pour un expediteur interne a l'organisation (la brute est alors un identifiant /o=Exchange...).
    $proprietes = @("http://schemas.microsoft.com/mapi/proptag/0x0C1F001F",   # PR_SENDER_EMAIL_ADDRESS
                    "http://schemas.microsoft.com/mapi/proptag/0x5D01001F")   # PR_SENDER_SMTP_ADDRESS
    for ($i = 0; $i -lt $uniques.Count; $i += 20) {
        $paquet = $uniques[$i..([Math]::Min($i + 19, $uniques.Count - 1))]
        $conditions = foreach ($a in $paquet) { foreach ($p in $proprietes) { "`"$p`" LIKE '" + ($a -replace "'", "''") + "%'" } }
        foreach ($item in $Folder.Items.Restrict("@SQL=(" + ($conditions -join " OR ") + ")")) {
            if ($item.Class -ne 43) { continue }
            if ($item.ReceivedTime -lt $Depuis) { continue }
            $exp = Get-AdresseExpediteur $item
            if ($exp -and $uniques -contains $exp) { $resultat.Add($item) }
        }
    }
    # renvoyes un par un : "return , $liste" passerait la liste comme UN seul objet dans le pipeline
    # (un "| Sort-Object" ne trierait rien et une boucle verrait tous les mails a la fois)
    $resultat
}

# ----- Adresses e-mail des destinataires et expediteurs -----
# Pour une personne de la meme organisation (ex. un collegue, ou soi-meme), Outlook ne donne pas son
# adresse SMTP dans Recipient.Address / SenderEmailAddress mais un identifiant Exchange
# ("/o=ExchangeLabs/.../cn=Recipients/..."). Il faut alors lire la propriete SMTP dediee.

function Get-AdresseSmtp {
    # Adresse SMTP (en minuscules) d'un destinataire Outlook
    param($Recipient)
    try {
        $a = [string]$Recipient.PropertyAccessor.GetProperty("http://schemas.microsoft.com/mapi/proptag/0x39FE001F")  # PR_SMTP_ADDRESS
        if ($a -and $a.Contains("@")) { return $a.Trim().ToLower() }
    } catch {}
    try {
        if ($Recipient.AddressEntry.Type -eq "EX") {
            $u = $Recipient.AddressEntry.GetExchangeUser()
            if ($u -and $u.PrimarySmtpAddress) { return ([string]$u.PrimarySmtpAddress).Trim().ToLower() }
        }
    } catch {}
    return ([string]$Recipient.Address).Trim().ToLower()
}

function Get-AdressesDestinataires {
    # Toutes les formes connues des destinataires d'un mail (adresse SMTP, adresse brute, nom affiche)
    param($Item)
    $liste = foreach ($r in $Item.Recipients) { Get-AdresseSmtp $r; ([string]$r.Address).ToLower(); ([string]$r.Name).ToLower() }
    return @($liste | Where-Object { $_ } | Select-Object -Unique)
}

function Test-EnvoyeA {
    # Vrai si le mail a ete envoye a cette adresse (comparaison insensible a la casse)
    param($Item, [string]$Email)
    if (-not $Email) { return $false }
    return (Get-AdressesDestinataires $Item) -contains $Email.Trim().ToLower()
}

function Get-MesAdresses {
    # Adresses SMTP (minuscules) des comptes configures dans Outlook : celles de l'utilisateur lui-meme
    param($Namespace)
    $liste = @()
    try { foreach ($c in $Namespace.Accounts) { $liste += ([string]$c.SmtpAddress).ToLower() } } catch {}
    try { $u = $Namespace.CurrentUser.AddressEntry.GetExchangeUser(); if ($u) { $liste += ([string]$u.PrimarySmtpAddress).ToLower() } } catch {}
    return @($liste | Where-Object { $_ -and $_.Contains("@") } | Select-Object -Unique)
}

function Get-AdresseExpediteur {
    # Adresse SMTP (en minuscules) de l'expediteur d'un mail recu
    param($Item)
    $brute = $null
    try { $brute = [string]$Item.SenderEmailAddress } catch {}
    if ($brute -and $brute.Contains("@")) { return $brute.Trim().ToLower() }
    try {
        $a = [string]$Item.PropertyAccessor.GetProperty("http://schemas.microsoft.com/mapi/proptag/0x5D01001F")  # PR_SENDER_SMTP_ADDRESS
        if ($a -and $a.Contains("@")) { return $a.Trim().ToLower() }
    } catch {}
    try {
        $u = $Item.Sender.GetExchangeUser()
        if ($u -and $u.PrimarySmtpAddress) { return ([string]$u.PrimarySmtpAddress).Trim().ToLower() }
    } catch {}
    if ($brute) { return $brute.Trim().ToLower() }
    return $null
}

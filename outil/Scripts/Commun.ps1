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

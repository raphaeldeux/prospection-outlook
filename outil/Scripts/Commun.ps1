# Fonctions partagees par les scripts (charge par ". $PSScriptRoot\Commun.ps1").

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
    return , $resultat
}

function Get-ItemsParExpediteur {
    # Renvoie les mails d'un dossier (Boite de reception) envoyes par l'une des adresses donnees, recus
    # apres $Depuis. Meme principe que Get-ItemsParObjet : filtre execute par Outlook.
    # LIKE (insensible a la casse) puis comparaison exacte ici, l'adresse du CSV pouvant differer en casse.
    param($Folder, [string[]]$Adresses, [datetime]$Depuis)
    $resultat = New-Object System.Collections.Generic.List[object]
    $uniques = @($Adresses | Where-Object { $_ -and $_.Contains("@") } | ForEach-Object { $_.Trim().ToLower() } | Select-Object -Unique)
    $propriete = "http://schemas.microsoft.com/mapi/proptag/0x0C1F001F"   # PR_SENDER_EMAIL_ADDRESS
    for ($i = 0; $i -lt $uniques.Count; $i += 30) {
        $paquet = $uniques[$i..([Math]::Min($i + 29, $uniques.Count - 1))]
        $conditions = foreach ($a in $paquet) { "`"$propriete`" LIKE '" + ($a -replace "'", "''") + "%'" }
        foreach ($item in $Folder.Items.Restrict("@SQL=(" + ($conditions -join " OR ") + ")")) {
            if ($item.Class -ne 43) { continue }
            if ($item.ReceivedTime -lt $Depuis) { continue }
            $exp = $null
            try { $exp = ([string]$item.SenderEmailAddress).ToLower() } catch {}
            if ($exp -and $uniques -contains $exp) { $resultat.Add($item) }
        }
    }
    return , $resultat
}

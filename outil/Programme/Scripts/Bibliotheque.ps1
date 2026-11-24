# Bibliotheque de mails type : pour chaque campagne et chaque etape (Mail1 a Mail4), un exemple de mail
# REELLEMENT ENVOYE, lu dans les Elements envoyes d'Outlook (lecture seule, rien n'est modifie).
#
# L'exemple choisi est le plus recent, de preference un contact sans texte personnalise (plus representatif).
# Son texte est nettoye pour pouvoir etre reutilise :
#   - signature et message cite (relances envoyees en reponse) retires ;
#   - nom, prenom, civilite et entreprise du destinataire remis sous forme de variables ({{NOM}}...) ;
#   - puces Outlook remises en "- " (format des textes de l'outil).
# L'objet renvoye est celui de la campagne (avec ses variables), plus l'objet reellement envoye pour info.
#
# Utilise par l'interface (Serveur-Interface.ps1, GET /api/bibliotheque) : resultat en JSON dans -JsonPath.

param([Parameter(Mandatory = $true)][string]$JsonPath)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Commun.ps1")
# caracteres construits par leur code : le fichier reste en ASCII (PowerShell 5.1 lit un .ps1 sans BOM en ANSI)
$puces = '^\s*[*' + [char]0x2022 + [char]0x00B7 + [char]0x25AA + [char]0x2013 + ']\s+'
$invisibles = '[' + [char]0x200B + [char]0x200C + [char]0x200D + [char]0xFEFF + ']'

$racine = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$dossiers = @(Get-ChildItem -Path (Join-Path $racine "Campagnes") -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notlike "_*" -and (Test-Path (Join-Path $_.FullName "contacts.csv")) })

function Get-TexteNettoye {
    # Corps texte d'un mail envoye -> texte reutilisable (voir en-tete)
    param([string]$Corps, $Contact)
    $lignes = @(($Corps -replace "`r`n", "`n" -replace "`r", "`n") -split "`n")
    # message cite (relance envoyee en reponse au mail precedent) : tout ce qui suit "De :" / "From:" / "-----Original"
    $fin = $lignes.Count
    for ($i = 0; $i -lt $lignes.Count; $i++) {
        if ($lignes[$i] -match '^\s*(De|From)\s*:\s' -or $lignes[$i] -match '^\s*-{3,}.*(Original|origine)' -or $lignes[$i] -match '^\s*_{8,}\s*$') { $fin = $i; break }
    }
    $lignes = @($lignes[0..([Math]::Max(0, $fin - 1))])
    # signature : on garde jusqu'a la derniere formule de politesse
    $politesse = '^\s*((bien|tr.s)\s+)?(cordialement|sinc.rement|amicalement|. (tr.s )?bient.t|bonne (journ.e|soir.e|semaine)|belle journ.e)\b'   # . = lettre accentuee
    for ($i = $lignes.Count - 1; $i -ge 0; $i--) {
        if ($lignes[$i] -match $politesse) { $lignes = @($lignes[0..$i]); break }
    }
    $texte = ($lignes | ForEach-Object {
        $l = $_.TrimEnd()
        # puces Outlook (etoile, point, point median, carre, tiret long ; "o<tab>") -> "- "
        $l -replace $puces, '- ' -replace '^\s*o\t', '- '
    }) -join "`n"
    $texte = ($texte -replace [string][char]0x00A0, ' ' -replace "\n{3,}", "`n`n").Trim()
    # Outlook separe chaque puce par une ligne vide : liste resserree, comme dans les textes de l'outil
    $texte = $texte -replace '(?m)^(- .*)\n\n(?=- )', "`$1`n"
    # valeurs du destinataire -> variables (les plus longues d'abord : "Jean-Pierre Martin" avant "Martin")
    $vars = @(
        @{ v = ([string]$Contact.Entreprise).Trim(); n = '{{ENTREPRISE}}' }
        @{ v = ([string]$Contact.Nom).Trim(); n = '{{NOM}}' }
        @{ v = ([string]$Contact.Prenom).Trim(); n = '{{PRENOM}}' }
        @{ v = ([string]$Contact.Civilite).Trim(); n = '{{CIVILITE}}' }
    ) | Where-Object { $_.v.Length -ge 2 } | Sort-Object { $_.v.Length } -Descending
    foreach ($x in $vars) { $texte = $texte.Replace($x.v, $x.n) }
    return $texte
}

$sortie = New-Object System.Collections.Generic.List[object]
if ($dossiers.Count) {
    $outlook = try { [Runtime.InteropServices.Marshal]::GetActiveObject("Outlook.Application") } catch {
        throw "Outlook (classique) ne semble pas ouvert. Ouvre Outlook puis reessaie."
    }
    $ns = $outlook.GetNamespace("MAPI")

    # contacts de toutes les campagnes, par adresse
    $parAdresse = @{}
    $prefixes = New-Object System.Collections.Generic.List[string]
    foreach ($d in $dossiers) {
        $perso = try { Get-TextesPersonnalises $d.FullName } catch { @{} }
        foreach ($c in @(Import-Csv -Path (Join-Path $d.FullName "contacts.csv") -Delimiter ';' -Encoding UTF8)) {
            $email = ([string]$c.Email).Trim().ToLower()
            if (-not $email) { continue }
            $sujets = Get-SujetsEtapes $c
            foreach ($n in 1..4) { if ($sujets[$n]) { $prefixes.Add($sujets[$n]) } }
            if (-not $parAdresse.ContainsKey($email)) { $parAdresse[$email] = New-Object System.Collections.Generic.List[object] }
            $parAdresse[$email].Add([pscustomobject]@{
                Campagne = $d.Name; Contact = $c; Sujets = $sujets
                Perso = @(if ($perso.ContainsKey($email)) { @($perso[$email].Keys | ForEach-Object { [int]$_ }) })
            })
        }
    }

    # mails envoyes correspondant a un objet de campagne -> candidats par (campagne, etape)
    $candidats = @{}
    foreach ($item in (Get-ItemsParObjet -Folder $ns.GetDefaultFolder(5) -Prefixes $prefixes)) {
        foreach ($a in (Get-AdressesDestinataires $item)) {
            if (-not $parAdresse.ContainsKey($a)) { continue }
            foreach ($e in $parAdresse[$a]) {
                $n = Get-EtapeDuSujet -Sujet ([string]$item.Subject) -SujetsEtapes $e.Sujets
                if ($n -eq 0) { continue }
                $k = "$($e.Campagne)|$n"
                if (-not $candidats.ContainsKey($k)) { $candidats[$k] = New-Object System.Collections.Generic.List[object] }
                $candidats[$k].Add([pscustomobject]@{ Item = $item; Entree = $e; Etape = $n; Perso = $e.Perso -contains $n; Date = $item.SentOn })
            }
        }
    }

    foreach ($k in $candidats.Keys) {
        $liste = $candidats[$k]
        $choisi = $liste | Sort-Object @{ Expression = { $_.Perso } }, @{ Expression = { $_.Date }; Descending = $true } | Select-Object -First 1
        $c = $choisi.Entree.Contact
        $sortie.Add([pscustomobject]@{
            Campagne     = $choisi.Entree.Campagne
            Etape        = $choisi.Etape
            Objet        = [string]$c."Sujet$($choisi.Etape)"
            ObjetEnvoye  = (([string]$choisi.Item.Subject) -replace $invisibles, '')
            Texte        = Get-TexteNettoye -Corps ([string]$choisi.Item.Body) -Contact $c
            EnvoyeLe     = $choisi.Date.ToString("dd/MM/yyyy")
            Destinataire = (@($c.Prenom, $c.Nom) | Where-Object { $_ }) -join " "
            NbEnvois     = @($liste | ForEach-Object { $_.Item.EntryID } | Select-Object -Unique).Count
            Personnalise = [bool]$choisi.Perso
        })
    }
}

$resultat = [pscustomobject]@{
    GenereLe = (Get-Date).ToString("dd/MM/yyyy HH:mm")
    Mails    = @($sortie | Sort-Object @{ Expression = { $_.Campagne }; Descending = $true }, Etape)
}
[IO.File]::WriteAllText($JsonPath, ($resultat | ConvertTo-Json -Depth 4), (New-Object System.Text.UTF8Encoding $false))

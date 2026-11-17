// Import de contacts en masse : texte collé depuis Excel, Outlook ou une simple liste d'adresses.
//
// Formats reconnus :
//  - tableau Excel (tabulations) ou CSV (; ou ,), avec ou sans ligne d'en-tête, colonnes dans n'importe quel ordre
//  - destinataires copiés depuis Outlook : "Jean Dupont <jean.dupont@acme.fr>; Claire Martin <...>"
//  - une adresse par ligne (ou séparées par des espaces / virgules)
// Sans en-tête, chaque colonne est devinée d'après son contenu (adresse, civilité, téléphone, texte).
// Prénom, nom et entreprise manquants sont déduits de l'adresse quand c'est possible (prenom.nom@entreprise.fr).

import type { LigneContact } from "@/lib/api"
import { estEmailValide } from "@/lib/apercu"

export type ChampImport = "Civilite" | "Prenom" | "Nom" | "Entreprise" | "Telephone" | "Email" | "ignorer"

export const libellesChamps: Record<ChampImport, string> = {
  Civilite: "Civilité",
  Prenom: "Prénom",
  Nom: "Nom",
  Entreprise: "Entreprise",
  Telephone: "Téléphone",
  Email: "E-mail",
  ignorer: "(ignorer)",
}

const sansAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()

/** Noms de colonnes courants (Excel, CRM, Salesforce, LinkedIn...) */
const synonymes: Record<Exclude<ChampImport, "ignorer">, string[]> = {
  Civilite: ["civilite", "titre", "salutation", "genre", "mr/mme", "m/mme"],
  Prenom: ["prenom", "first name", "firstname", "given name", "prenom du contact"],
  Nom: ["nom", "last name", "lastname", "surname", "nom de famille", "nom du contact"],
  Entreprise: ["entreprise", "societe", "company", "organisation", "organization", "compte", "account", "account name", "client", "raison sociale"],
  Telephone: ["telephone", "tel", "tel.", "phone", "mobile", "portable", "telephone mobile", "numero"],
  Email: ["email", "e-mail", "mail", "courriel", "adresse e-mail", "adresse email", "adresse mail", "email address"],
}

export function champDepuisEntete(entete: string): ChampImport | null {
  const e = sansAccents(entete)
  for (const [champ, mots] of Object.entries(synonymes)) if (mots.includes(e)) return champ as ChampImport
  return null
}

const regexEmail = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/

export function normaliserCivilite(v: string): string {
  const c = sansAccents(v).replace(/\./g, "")
  if (["m", "mr", "monsieur", "mon", "h", "homme"].includes(c)) return "Monsieur"
  if (["mme", "madame", "mlle", "mademoiselle", "f", "femme", "mrs", "ms"].includes(c)) return "Madame"
  return v.trim()
}
const estCivilite = (v: string) => ["Monsieur", "Madame"].includes(normaliserCivilite(v)) && v.trim().length <= 12
const estTelephone = (v: string) => /^[+()\d][\d\s.()+-]{7,}$/.test(v.trim())

/** Domaines de messagerie grand public : pas d'entreprise à en déduire */
const domainesPublics = new Set([
  "gmail", "googlemail", "outlook", "hotmail", "live", "msn", "yahoo", "icloud", "me", "orange", "wanadoo",
  "free", "sfr", "laposte", "bbox", "neuf", "aol", "proton", "protonmail", "gmx",
])

const majuscule = (s: string) =>
  s.toLowerCase().replace(/(^|[\s-])([a-zà-ÿ])/g, (_, sep: string, l: string) => sep + l.toUpperCase())

/** prenom.nom@entreprise.fr → { Prenom: "Prenom", Nom: "Nom", Entreprise: "Entreprise" } (ce qui est déductible) */
export function deduireDepuisEmail(email: string): Partial<LigneContact> {
  const m = email.toLowerCase().match(/^([^@]+)@([^@]+)$/)
  if (!m) return {}
  const r: Partial<LigneContact> = {}
  const morceaux = m[1].split(/[._]/).filter((x) => x && !/\d/.test(x))
  if (morceaux.length === 2) {
    r.Prenom = majuscule(morceaux[0])
    r.Nom = majuscule(morceaux[1].replace(/-/g, " ")).replace(/ /g, "-")
  }
  const labels = m[2].split(".")
  const base = labels.length >= 2 ? labels[labels.length - 2] : labels[0]
  if (base && !domainesPublics.has(base)) r.Entreprise = majuscule(base.replace(/-/g, " "))
  return r
}

export type ResultatAnalyse = {
  /** Champ attribué à chaque colonne détectée */
  colonnes: ChampImport[]
  /** Valeurs brutes, une ligne par contact */
  lignes: string[][]
  aEntete: boolean
  format: "tableau" | "outlook" | "adresses"
}

function decouperLigne(l: string, sep: string): string[] {
  if (sep !== ";" && sep !== ",") return l.split(sep).map((v) => v.trim())
  // CSV simple avec guillemets
  const cellules: string[] = []
  let cur = ""
  let guillemets = false
  for (let i = 0; i < l.length; i++) {
    const ch = l[i]
    if (ch === '"') {
      if (guillemets && l[i + 1] === '"') { cur += '"'; i++ } else guillemets = !guillemets
    } else if (ch === sep && !guillemets) { cellules.push(cur.trim()); cur = "" }
    else cur += ch
  }
  cellules.push(cur.trim())
  return cellules
}

/** Devine le champ d'une colonne sans en-tête d'après ses valeurs */
function devinerColonnes(lignes: string[][]): ChampImport[] {
  const nb = Math.max(...lignes.map((l) => l.length))
  const champs: ChampImport[] = []
  const pris = new Set<ChampImport>()
  const part = (i: number, test: (v: string) => boolean) => {
    const vals = lignes.map((l) => l[i] ?? "").filter((v) => v)
    return vals.length ? vals.filter(test).length / vals.length : 0
  }
  for (let i = 0; i < nb; i++) {
    let c: ChampImport = "ignorer"
    if (!pris.has("Email") && part(i, (v) => regexEmail.test(v)) >= 0.6) c = "Email"
    else if (!pris.has("Civilite") && part(i, estCivilite) >= 0.6) c = "Civilite"
    else if (!pris.has("Telephone") && part(i, estTelephone) >= 0.6) c = "Telephone"
    champs.push(c)
    if (c !== "ignorer") pris.add(c)
  }
  // colonnes de texte restantes, dans l'ordre : Prénom, Nom, Entreprise
  const ordre: ChampImport[] = ["Prenom", "Nom", "Entreprise"].filter((c) => !pris.has(c as ChampImport)) as ChampImport[]
  return champs.map((c, i) => (c === "ignorer" && part(i, (v) => v.length > 0) > 0 && ordre.length ? ordre.shift()! : c))
}

export function analyser(texte: string): ResultatAnalyse | null {
  const brut = texte.replace(/\r/g, "").trim()
  if (!brut) return null
  const lignesTexte = brut.split("\n").filter((l) => l.trim())

  // Destinataires Outlook : "Nom <adresse>; Nom <adresse>"
  if (!brut.includes("\t") && /<[^<>@\s]+@[^<>\s]+>/.test(brut)) {
    const entrees = brut.split(/[;\n]/).map((e) => e.trim()).filter(Boolean)
    const lignes = entrees.map((e) => {
      const m = e.match(/^"?([^"<]*)"?\s*<([^>]+)>$/)
      const nom = (m ? m[1] : "").trim()
      const email = (m ? m[2] : (e.match(regexEmail)?.[0] ?? "")).trim()
      // "Dupont Jean" ou "Jean Dupont" : on garde le nom complet, découpé si 2 mots (Outlook FR : NOM Prénom)
      const mots = nom.split(/\s+/).filter(Boolean)
      if (mots.length === 2) {
        const [a, b] = mots
        const nomEnMajuscules = a === a.toUpperCase() && a !== b
        return nomEnMajuscules ? [b, majuscule(a), email] : [a, b, email]
      }
      return ["", nom, email]
    })
    return { colonnes: ["Prenom", "Nom", "Email"], lignes, aEntete: false, format: "outlook" }
  }

  // Simple liste d'adresses
  const toutesAdresses = lignesTexte.every((l) =>
    l.split(/[\s,;]+/).filter(Boolean).every((m) => regexEmail.test(m) && m.match(regexEmail)![0].length >= m.length - 2),
  )
  if (toutesAdresses) {
    const adresses = brut.split(/[\s,;]+/).filter(Boolean).map((m) => m.match(regexEmail)![0])
    return { colonnes: ["Email"], lignes: adresses.map((a) => [a]), aEntete: false, format: "adresses" }
  }

  // Tableau : tabulations (Excel), sinon ; ou ,
  const sep = brut.includes("\t") ? "\t" : lignesTexte[0].includes(";") ? ";" : ","
  let lignes = lignesTexte.map((l) => decouperLigne(l, sep))
  const entete = lignes[0].map(champDepuisEntete)
  const aEntete = entete.filter(Boolean).length >= 2 || (entete.filter(Boolean).length === 1 && lignes[0].length === 1)
  let colonnes: ChampImport[]
  if (aEntete) {
    colonnes = entete.map((c) => c ?? "ignorer")
    lignes = lignes.slice(1)
  } else {
    colonnes = devinerColonnes(lignes)
  }
  return { colonnes, lignes, aEntete, format: "tableau" }
}

export type ContactImporte = { ligne: LigneContact; deduits: Set<string>; statut: "nouveau" | "doublon" | "invalide" }

/** Construit les contacts à partir de l'analyse (et du choix des colonnes) */
export function construire(
  analyse: ResultatAnalyse,
  colonnes: ChampImport[],
  colonnesFichier: string[],
  objets: string[],
  emailsExistants: Set<string>,
  deduire: boolean,
): ContactImporte[] {
  const vus = new Set(emailsExistants)
  return analyse.lignes
    .filter((v) => v.some((x) => x.trim()))
    .map((valeurs) => {
      const ligne: LigneContact = Object.fromEntries(colonnesFichier.map((c) => [c, ""]))
      colonnes.forEach((champ, i) => {
        if (champ === "ignorer") return
        let v = (valeurs[i] ?? "").trim()
        if (champ === "Email") v = (v.match(regexEmail)?.[0] ?? v).toLowerCase()
        if (champ === "Civilite") v = normaliserCivilite(v)
        if (v) ligne[champ] = v
      })
      const deduits = new Set<string>()
      if (deduire && ligne.Email) {
        const d = deduireDepuisEmail(ligne.Email)
        for (const [k, v] of Object.entries(d)) {
          if (v && !ligne[k]) { ligne[k] = v; deduits.add(k) }
        }
      }
      ;[1, 2, 3, 4].forEach((n) => !ligne[`Sujet${n}`] && (ligne[`Sujet${n}`] = objets[n - 1] ?? ""))
      const cle = (ligne.Email ?? "").trim().toLowerCase()
      let statut: ContactImporte["statut"] = "nouveau"
      if (!estEmailValide(cle)) statut = "invalide"
      else if (vus.has(cle)) statut = "doublon"
      else vus.add(cle)
      return { ligne, deduits, statut }
    })
}

export type Code = "repondu" | "brouillon" | "afaire" | "relance" | "attente" | "termine"

export type Contact = {
  Civilite: string
  Nom: string
  Entreprise: string
  Email: string
  Mail1: string
  Mail2: string
  Mail3: string
  Mail4: string
  NbEtapes: number
  Action: string
  Code: Code
}

export type EtatTexte = "pret" | "a_completer" | "absent"

export type Campagne = {
  Nom: string
  /** Délai minimal (jours) entre deux mails, réglable par campagne */
  DelaiRelance: number
  Textes: { Etape: number; Etat: EtatTexte }[]
  Contacts: Contact[]
}

export type Suivi = { GenereLe: string; Campagnes: Campagne[] }

// L'en-tete X-Prospection est exige par le serveur local (protection contre les appels d'autres sites)
const entetes = { "X-Prospection": "1", "Content-Type": "application/json" }

async function lire<T>(r: Response): Promise<T> {
  const data = await r.json().catch(() => ({}))
  if (!r.ok) {
    const e = new Error(data.erreur ?? `Erreur ${r.status}`) as Error & { journal?: string }
    e.journal = data.journal
    throw e
  }
  return data as T
}

const tableau = <T,>(v: T[] | T | null | undefined): T[] => (Array.isArray(v) ? v : v ? [v] : [])

export async function chargerSuivi(): Promise<Suivi> {
  const s = await lire<Suivi>(await fetch("/api/suivi", { headers: entetes }))
  return {
    ...s,
    Campagnes: tableau(s.Campagnes).map((c) => ({ ...c, Textes: tableau(c.Textes), Contacts: tableau(c.Contacts) })),
  }
}

export async function genererBrouillons(campagne: string, etape: number) {
  return lire<{ ok: boolean; journal: string }>(
    await fetch("/api/generer", { method: "POST", headers: entetes, body: JSON.stringify({ campagne, etape }) }),
  )
}

/** Etape du prochain mail pour ce contact (1 a 4), d'apres les dates d'envoi */
export function etapeSuivante(c: Contact): number {
  let derniere = 0
  ;[c.Mail1, c.Mail2, c.Mail3, c.Mail4].forEach((d, i) => d && (derniere = i + 1))
  return derniere + 1
}

export async function ouvrirDossier(campagne: string) {
  return lire<{ ok: boolean }>(
    await fetch("/api/ouvrir", { method: "POST", headers: entetes, body: JSON.stringify({ campagne }) }),
  )
}

export type LigneContact = Record<string, string>
export type Fichiers = { colonnes: string[]; contacts: LigneContact[]; textes: { etape: number; contenu: string }[] }

export async function chargerFichiers(campagne: string): Promise<Fichiers> {
  const f = await lire<Fichiers>(
    await fetch("/api/fichiers", { method: "POST", headers: entetes, body: JSON.stringify({ campagne }) }),
  )
  return { colonnes: tableau(f.colonnes), contacts: tableau(f.contacts), textes: tableau(f.textes) }
}

export async function enregistrerContacts(campagne: string, colonnes: string[], contacts: LigneContact[]) {
  return lire<{ ok: boolean; nb: number }>(
    await fetch("/api/contacts", { method: "PUT", headers: entetes, body: JSON.stringify({ campagne, colonnes, contacts }) }),
  )
}

export async function enregistrerTexte(campagne: string, etape: number, contenu: string) {
  return lire<{ ok: boolean }>(
    await fetch("/api/texte", { method: "PUT", headers: entetes, body: JSON.stringify({ campagne, etape, contenu }) }),
  )
}

export async function creerCampagne(nom: string) {
  return lire<{ ok: boolean; nom: string }>(
    await fetch("/api/campagnes", { method: "POST", headers: entetes, body: JSON.stringify({ nom }) }),
  )
}


export async function enregistrerDelai(campagne: string, delaiRelanceJours: number) {
  return lire<{ ok: boolean }>(
    await fetch("/api/parametres", { method: "PUT", headers: entetes, body: JSON.stringify({ campagne, delaiRelanceJours }) }),
  )
}

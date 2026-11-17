export type Code = "repondu" | "brouillon" | "afaire" | "relance" | "attente" | "termine" | "clos"

export type Contact = {
  Civilite: string
  Prenom?: string
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
  /** Date de la réponse (jj/mm/aaaa) si le contact a répondu */
  DateReponse?: string
  /** Date à partir de laquelle la relance suivante est possible */
  RelancePossibleLe?: string
  /** Jours écoulés depuis le dernier envoi */
  JoursDepuisEnvoi?: number | null
  /** Issue renseignée par le commercial (contact clos) : rdv, pas_interesse... */
  Issue?: string
  IssueNote?: string
  IssueLe?: string
  /** Étapes pour lesquelles ce contact a un texte personnalisé */
  TextesPerso?: number[]
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

/** Après une mise à jour, le serveur redémarre : on attend qu'il réponde puis on recharge la page */
let rechargementPrevu = false
function rechargerApresRedemarrage() {
  if (rechargementPrevu) return
  rechargementPrevu = true
  const essayer = async () => {
    try {
      const r = await fetch("/api/version?local=1", { headers: entetes })
      if (r.ok) return window.location.reload()
    } catch {
      /* serveur pas encore prêt */
    }
    setTimeout(essayer, 2000)
  }
  setTimeout(essayer, 3000)
}

async function lire<T>(r: Response): Promise<T> {
  const data = await r.json().catch(() => ({}))
  if (!r.ok) {
    let message: string = data.erreur ?? `Erreur ${r.status}`
    if (data.redemarrage) {
      // le serveur a détecté une nouvelle version de ses scripts et redémarre
      message = "L'outil vient d'être mis à jour : l'interface redémarre, la page va se recharger…"
      rechargerApresRedemarrage()
    } else if (r.status === 404 && data.erreur === "Route inconnue.") {
      // ancien serveur (sans redémarrage automatique) face à une page plus récente
      message = "L'interface a été mise à jour mais tourne encore avec l'ancienne version : ferme la fenêtre noire et relance Interface.bat."
    }
    const e = new Error(message) as Error & { journal?: string }
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
/** Texte propre à un contact pour une étape : remplace le texte commun pour lui seul */
export type TextePersonnalise = { email: string; etape: number; contenu: string }
export type Fichiers = {
  colonnes: string[]
  contacts: LigneContact[]
  textes: { etape: number; contenu: string }[]
  personnalises: TextePersonnalise[]
  /** Objets communs des 4 étapes (parametres.json) ; absents pour une ancienne campagne */
  objets?: (string | null)[] | null
}

export async function chargerFichiers(campagne: string): Promise<Fichiers> {
  const f = await lire<Fichiers>(
    await fetch("/api/fichiers", { method: "POST", headers: entetes, body: JSON.stringify({ campagne }) }),
  )
  return { colonnes: tableau(f.colonnes), contacts: tableau(f.contacts), textes: tableau(f.textes), personnalises: tableau(f.personnalises), objets: f.objets ? tableau(f.objets) : null }
}

export async function enregistrerContacts(campagne: string, colonnes: string[], contacts: LigneContact[]) {
  return lire<{ ok: boolean; nb: number }>(
    await fetch("/api/contacts", { method: "PUT", headers: entetes, body: JSON.stringify({ campagne, colonnes, contacts }) }),
  )
}

/** Enregistre le texte commun d'une étape, ou (email) le texte personnalisé d'un contact ; texte personnalisé vide = retour au texte commun */
export async function enregistrerTexte(campagne: string, etape: number, contenu: string, email?: string) {
  return lire<{ ok: boolean }>(
    await fetch("/api/texte", { method: "PUT", headers: entetes, body: JSON.stringify({ campagne, etape, contenu, email }) }),
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

/** Affiche le dossier Brouillons dans Outlook */
export async function ouvrirBrouillonsOutlook() {
  return lire<{ ok: boolean }>(await fetch("/api/outlook-brouillons", { method: "POST", headers: entetes }))
}

/** Renseigne (ou efface, issue vide) l'issue d'un contact */
export async function enregistrerIssue(campagne: string, email: string, issue: string, note = "") {
  return lire<{ ok: boolean }>(
    await fetch("/api/issue", { method: "PUT", headers: entetes, body: JSON.stringify({ campagne, email, issue, note }) }),
  )
}

/** Ouvre dans Outlook le dernier mail reçu de ce contact */
export async function ouvrirReponseOutlook(email: string) {
  return lire<{ ok: boolean }>(await fetch("/api/outlook-reponse", { method: "POST", headers: entetes, body: JSON.stringify({ email }) }))
}

export type InfosVersion = {
  installee: { version: string; date: string } | null
  publiee: { version: string; date: string } | null
  aJour: boolean | null
  release: { nom: string; notes: string; url: string; date: string } | null
  dossier: string
  /** Identifiant du démarrage du serveur : change quand le serveur redémarre */
  instance?: string
}

/** Version installée et dernière version publiée (null si GitHub injoignable). locale : sans interroger GitHub */
export async function chargerVersion(locale = false): Promise<InfosVersion> {
  return lire<InfosVersion>(await fetch(locale ? "/api/version?local=1" : "/api/version", { headers: entetes }))
}

/** Lance la mise à jour : le serveur s'arrête, l'installeur tourne, puis l'interface redémarre */
export async function lancerMiseAJour() {
  return lire<{ ok: boolean }>(await fetch("/api/mettre-a-jour", { method: "POST", headers: entetes }))
}

/**
 * Objet d'une étape pour les contacts donnés (colonne SujetN de leurs lignes dans contacts.csv).
 * commun : c'est aussi le nouvel objet commun de l'étape (mémorisé dans parametres.json).
 */
export async function enregistrerObjet(campagne: string, emails: string[], etape: number, objet: string, commun = false) {
  return lire<{ ok: boolean; nb: number }>(
    await fetch("/api/objet", { method: "PUT", headers: entetes, body: JSON.stringify({ campagne, emails, etape, objet, commun }) }),
  )
}

/** Signe de vie : tant que la page est ouverte, le serveur ne s'arrête pas tout seul (mode application) */
export async function ping() {
  return lire<{ ok: boolean }>(await fetch("/api/ping", { headers: entetes }))
}

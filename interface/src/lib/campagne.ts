// Nom des campagnes : le dossier s'appelle "AAAA-MM Titre" (ex. "2026-11 Relance DDSI"), ce qui les
// garde triées chronologiquement dans l'Explorateur. L'interface affiche le titre et la date en français.

export const moisFr = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]

export type NomCampagne = { titre: string; annee?: number; mois?: number; date: string }

/** "2026-11 Relance DDSI" → { titre: "Relance DDSI", annee: 2026, mois: 11, date: "Novembre 2026" } */
export function lireNomCampagne(nom: string): NomCampagne {
  const m = nom.match(/^(\d{4})-(\d{2})\s+(.+)$/)
  if (!m) return { titre: nom, date: "" }
  const annee = Number(m[1])
  const mois = Number(m[2])
  if (mois < 1 || mois > 12) return { titre: nom, date: "" }
  const libelle = moisFr[mois - 1]
  return { titre: m[3].trim(), annee, mois, date: `${libelle[0].toUpperCase()}${libelle.slice(1)} ${annee}` }
}

/** Date courte pour la liste : "nov. 2026" */
export function dateCourte(n: NomCampagne) {
  if (!n.mois || !n.annee) return ""
  const l = moisFr[n.mois - 1]
  return `${l.length > 4 ? l.slice(0, l.startsWith("juil") ? 4 : 3) + "." : l} ${n.annee}`
}

/** { annee: 2026, mois: 11, titre: "Relance DDSI" } → "2026-11 Relance DDSI" */
export function construireNomCampagne(annee: number, mois: number, titre: string) {
  return `${annee}-${String(mois).padStart(2, "0")} ${titre.trim()}`
}

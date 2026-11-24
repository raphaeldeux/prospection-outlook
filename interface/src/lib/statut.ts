// Libellés lisibles pour un commercial, calculés à partir des données du suivi
import { etapeSuivante, type Contact } from "@/lib/api"
import { deduireDepuisEmail } from "@/lib/import"
import { libelleIssue } from "@/lib/issues"

/**
 * "Claire Martin". Prénom vide : déduit de l'adresse (claire.martin@… → Claire), sinon la civilité ("Madame Martin").
 * Ni prénom ni nom : l'adresse.
 */
export function nomAffiche(c: Pick<Contact, "Civilite" | "Nom" | "Email"> & { Prenom?: string }) {
  if (!c.Prenom && !c.Nom) return c.Email ?? ""
  const prenom = c.Prenom || deduireDepuisEmail(c.Email ?? "").Prenom || c.Civilite
  return [prenom, c.Nom].filter(Boolean).join(" ")
}

const jjmm = (d?: string) => (d ? d.slice(0, 5) : "")
const depuis = (n?: number | null) => (n === 0 ? "aujourd'hui" : n === 1 ? "hier" : n != null ? `il y a ${n} jours` : "")

/** Détail affiché sous le statut, dans le tableau de suivi */
export function detailStatut(c: Contact): string {
  const n = etapeSuivante(c)
  switch (c.Code) {
    case "clos":
      return [c.IssueLe && `Clos le ${jjmm(c.IssueLe)}`, c.IssueNote].filter(Boolean).join(" · ") || libelleIssue(c.Issue)
    case "repondu":
      return c.DateReponse ? `Réponse reçue le ${jjmm(c.DateReponse)} : à toi de jouer` : "Réponse reçue : à toi de jouer"
    case "brouillon":
      return `Brouillon Mail${n} prêt dans Outlook : relis-le et envoie-le`
    case "afaire":
      return "Pas encore dans Outlook : « Créer les brouillons »"
    case "relance":
      return `Mail${n - 1} envoyé ${depuis(c.JoursDepuisEnvoi)} : Mail${n} possible`
    case "attente":
      return `Mail${n} possible à partir du ${jjmm(c.RelancePossibleLe)}`
    case "termine":
      return c.NbEtapes < 4 ? `Pas de réponse après Mail${c.NbEtapes} (dernière étape prévue)` : "Pas de réponse après les 4 mails"
    default:
      return ""
  }
}

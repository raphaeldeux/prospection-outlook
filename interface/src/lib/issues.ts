// Issues possibles d'un contact, renseignées par le commercial. Un contact avec une issue est « clos » :
// plus aucun mail ne lui est préparé (Mail1 comme relances).
export const issues = {
  rdv: { libelle: "RDV obtenu", classe: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" },
  interesse: { libelle: "Intéressé, à suivre", classe: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200" },
  plus_tard: { libelle: "À recontacter plus tard", classe: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200" },
  pas_interesse: { libelle: "Pas intéressé", classe: "bg-muted text-muted-foreground" },
  mauvais_contact: { libelle: "Mauvais interlocuteur", classe: "bg-muted text-muted-foreground" },
  traite: { libelle: "Traité", classe: "bg-muted text-muted-foreground" },
} as const

export type Issue = keyof typeof issues

export const libelleIssue = (i?: string) => (i && i in issues ? issues[i as Issue].libelle : i || "")

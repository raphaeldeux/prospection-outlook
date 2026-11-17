import { Badge } from "@/components/ui/badge"
import type { Code } from "@/lib/api"
import { issues, type Issue } from "@/lib/issues"
import { cn } from "@/lib/utils"

export const statuts: Record<Code, { libelle: string; classe: string }> = {
  relance: { libelle: "Relance possible", classe: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  afaire: { libelle: "Mail1 à créer", classe: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  brouillon: { libelle: "Brouillon à envoyer", classe: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200" },
  attente: { libelle: "En attente", classe: "bg-muted text-muted-foreground" },
  repondu: { libelle: "Réponse à traiter", classe: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" },
  termine: { libelle: "Séquence terminée", classe: "bg-muted text-muted-foreground" },
  clos: { libelle: "Clos", classe: "bg-muted text-muted-foreground" },
}

/** Badge de statut ; pour un contact clos, affiche son issue (RDV obtenu, Pas intéressé…) */
export function StatutBadge({ code, issue, className }: { code: Code; issue?: string; className?: string }) {
  if (code === "clos" && issue && issue in issues) {
    const i = issues[issue as Issue]
    return <Badge className={cn(i.classe, className)}>{i.libelle}</Badge>
  }
  const s = statuts[code] ?? statuts.attente
  return <Badge className={cn(s.classe, className)}>{s.libelle}</Badge>
}

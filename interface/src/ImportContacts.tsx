import { useMemo, useState } from "react"
import { SparklesIcon } from "lucide-react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { LigneContact } from "@/lib/api"
import { analyser, construire, libellesChamps, type ChampImport } from "@/lib/import"
import { cn } from "@/lib/utils"
import { accord, pl } from "@/lib/texte"

const champsAffiches: ChampImport[] = ["Civilite", "Prenom", "Nom", "Entreprise", "Telephone", "Email"]
const formats: Record<string, string> = {
  tableau: "Tableau",
  outlook: "Destinataires Outlook",
  adresses: "Liste d'adresses",
}

/** Fenêtre « Ajouter en masse » : coller, vérifier l'aperçu, ajouter */
export function ImportContacts(props: {
  ouvert: boolean
  onFermer: () => void
  colonnesFichier: string[]
  objets: string[]
  emailsExistants: Set<string>
  onAjouter: (lignes: LigneContact[]) => void
}) {
  const [texte, setTexte] = useState("")
  const [choix, setChoix] = useState<ChampImport[] | null>(null)
  const [deduire, setDeduire] = useState(true)

  const analyse = useMemo(() => analyser(texte), [texte])
  const colonnes = choix && analyse && choix.length === analyse.colonnes.length ? choix : (analyse?.colonnes ?? [])
  const resultat = useMemo(
    () => (analyse ? construire(analyse, colonnes, props.colonnesFichier, props.objets, props.emailsExistants, deduire) : []),
    [analyse, colonnes, props.colonnesFichier, props.objets, props.emailsExistants, deduire],
  )
  const nouveaux = resultat.filter((r) => r.statut === "nouveau")
  const nbDoublons = resultat.filter((r) => r.statut === "doublon").length
  const nbInvalides = resultat.filter((r) => r.statut === "invalide").length

  function fermer() {
    setTexte("")
    setChoix(null)
    props.onFermer()
  }

  return (
    <AlertDialog open={props.ouvert} onOpenChange={(o) => !o && fermer()}>
      <AlertDialogContent className="data-[size=default]:max-w-5xl data-[size=default]:sm:max-w-5xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Ajouter des contacts en masse</AlertDialogTitle>
          <AlertDialogDescription>
            Colle ici des lignes copiées depuis Excel (avec ou sans en-têtes, colonnes dans n'importe quel ordre), des
            destinataires copiés depuis Outlook, ou simplement une liste d'adresses e-mail. Vérifie l'aperçu puis ajoute.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Textarea
          autoFocus
          value={texte}
          onChange={(e) => {
            setTexte(e.target.value)
            setChoix(null)
          }}
          className="max-h-40 min-h-28 font-mono text-xs"
          placeholder={
            "Exemples acceptés :\nPrénom\tNom\tEntreprise\tE-mail     (copié depuis Excel)\nDUPONT Jean <jean.dupont@acme.fr>; Claire Martin <claire.martin@beta.fr>\njean.dupont@acme.fr, claire.martin@beta.fr"
          }
        />

        {analyse && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                Format reconnu : <strong className="text-foreground">{formats[analyse.format]}</strong>
                {analyse.aEntete && " avec ligne d'en-tête"}
              </span>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={deduire} onChange={(e) => setDeduire(e.target.checked)} />
                <SparklesIcon className="size-3.5" /> Compléter prénom, nom et entreprise depuis l'adresse (prenom.nom@entreprise.fr)
              </label>
            </div>

            <div className="max-h-72 overflow-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    {colonnes.map((c, i) => (
                      <th key={i} className="px-2 py-1.5 text-left font-medium">
                        <select
                          className="rounded border bg-background px-1 py-0.5"
                          value={c}
                          onChange={(e) => setChoix(colonnes.map((x, k) => (k === i ? (e.target.value as ChampImport) : x)))}
                          title="Champ de cette colonne"
                        >
                          {[...champsAffiches, "ignorer" as ChampImport].map((ch) => (
                            <option key={ch} value={ch}>{libellesChamps[ch]}</option>
                          ))}
                        </select>
                      </th>
                    ))}
                    <th className="px-2 py-1.5 text-left font-medium">Contact obtenu</th>
                  </tr>
                </thead>
                <tbody>
                  {resultat.slice(0, 200).map((r, i) => (
                    <tr key={i} className={cn("border-t", r.statut !== "nouveau" && "text-muted-foreground")}>
                      {colonnes.map((_, k) => (
                        <td key={k} className="max-w-48 truncate px-2 py-1">{analyse.lignes.filter((v) => v.some((x) => x.trim()))[i]?.[k]}</td>
                      ))}
                      <td className="px-2 py-1">
                        {r.statut === "invalide" ? (
                          <span className="text-destructive">Adresse invalide ou absente : ignoré</span>
                        ) : r.statut === "doublon" ? (
                          <span>Déjà dans la liste : ignoré</span>
                        ) : (
                          <span>
                            {[r.ligne.Civilite, r.ligne.Prenom, r.ligne.Nom].filter(Boolean).map((v, k) => (
                              <span key={k}>{k > 0 && " "}{v}</span>
                            ))}
                            {r.ligne.Entreprise && <span className="text-muted-foreground"> · {r.ligne.Entreprise}</span>}
                            {r.deduits.size > 0 && (
                              <span className="ml-1 text-violet-600 dark:text-violet-400" title="Valeurs déduites de l'adresse e-mail">
                                <SparklesIcon className="inline size-3" />
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">{pl(nouveaux.length, "contact à ajouter", "contacts à ajouter")}</strong>
              {nbDoublons > 0 && ` · ${pl(nbDoublons, "déjà présent, ignoré", "déjà présents, ignorés")}`}
              {nbInvalides > 0 && ` · ${nbInvalides} sans adresse valide, ${accord(nbInvalides, "ignoré", "ignorés")}`}
              {resultat.length > 200 && " · aperçu limité aux 200 premières lignes"}. Les objets des mails définis plus haut leur
              sont appliqués. Corrige un champ mal reconnu avec les listes en tête de colonne.
            </p>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <Button
            disabled={nouveaux.length === 0}
            onClick={() => {
              props.onAjouter(nouveaux.map((r) => r.ligne))
              fermer()
            }}
          >
            Ajouter {nouveaux.length ? pl(nouveaux.length, "contact", "contacts") : "les contacts"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

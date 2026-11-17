import { useState } from "react"
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
import { Input } from "@/components/ui/input"
import { construireNomCampagne, lireNomCampagne, moisFr } from "@/lib/campagne"

const interdits = /[\\/:*?"<>|]/

/** Création d'une campagne : mois, année et titre (dossier "AAAA-MM Titre") */
export function NouvelleCampagne(props: { ouvert: boolean; onFermer: () => void; onCreer: (nom: string) => void }) {
  const maintenant = new Date()
  const [mois, setMois] = useState(maintenant.getMonth() + 1)
  const [annee, setAnnee] = useState(String(maintenant.getFullYear()))
  const [titre, setTitre] = useState("")

  const anneeOk = /^\d{4}$/.test(annee) && Number(annee) >= 2000 && Number(annee) <= 2100
  const erreurTitre = interdits.test(titre) ? 'Caractères interdits : \\ / : * ? " < > |' : ""
  const valide = anneeOk && titre.trim() && !erreurTitre
  const nom = valide ? construireNomCampagne(Number(annee), mois, titre) : ""

  function fermer() {
    setTitre("")
    props.onFermer()
  }

  return (
    <AlertDialog open={props.ouvert} onOpenChange={(o) => !o && fermer()}>
      <AlertDialogContent>
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault()
            if (valide) {
              props.onCreer(nom)
              setTitre("")
            }
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Nouvelle campagne</AlertDialogTitle>
            <AlertDialogDescription>
              Choisis le mois de lancement et donne un titre. La campagne démarre avec le modèle et une liste de contacts vide.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Titre</span>
              <Input autoFocus placeholder="Souveraineté du cloud" value={titre} onChange={(e) => setTitre(e.target.value)} aria-invalid={!!erreurTitre || undefined} />
              {erreurTitre && <span className="text-xs text-destructive">{erreurTitre}</span>}
            </label>
            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Mois</span>
                <select
                  className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                  value={mois}
                  onChange={(e) => setMois(Number(e.target.value))}
                >
                  {moisFr.map((m, i) => (
                    <option key={m} value={i + 1}>{m[0].toUpperCase() + m.slice(1)}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Année</span>
                <Input type="number" min={2000} max={2100} value={annee} onChange={(e) => setAnnee(e.target.value)} aria-invalid={!anneeOk || undefined} />
              </label>
            </div>
            {valide && (
              <p className="text-xs text-muted-foreground">
                Elle apparaîtra comme « {titre.trim()} · {lireNomCampagne(nom).date} ».
              </p>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <Button type="submit" disabled={!valide}>Créer la campagne</Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}

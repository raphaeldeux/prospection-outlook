import { useEffect, useState } from "react"
import { Loader2Icon, SaveIcon } from "lucide-react"
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
import type { LigneContact } from "@/lib/api"
import { ccInvalide, decouperAdresses, estColonneObjet, estEmailValide } from "@/lib/apercu"
import { cn } from "@/lib/utils"

const libelles: Record<string, string> = {
  Civilite: "Civilité",
  Prenom: "Prénom",
  Nom: "Nom",
  Entreprise: "Entreprise",
  Telephone: "Téléphone",
  Email: "E-mail",
  CC: "Copie (CC) pour ce contact uniquement",
}
/** Champs sur toute la largeur du formulaire (les autres vont par deux) */
const pleineLargeur = new Set(["Email", "CC"])

/** Fenêtre « Ajouter un contact » : un petit formulaire, puis Enregistrer */
export function NouveauContact(props: {
  ouvert: boolean
  onFermer: () => void
  colonnes: string[]
  /** Ligne de départ (objets communs déjà remplis) */
  ligneDeDepart: () => LigneContact
  emailsExistants: Set<string>
  /** Adresses en copie de toute la campagne, rappelées sous le champ CC */
  ccCampagne: string
  /** Vrai si d'autres modifications du tableau ne sont pas encore enregistrées */
  autresModifs: boolean
  /** Ajoute le contact ; renvoie faux si l'enregistrement a échoué (la fenêtre reste ouverte) */
  onAjouter: (contact: LigneContact) => Promise<boolean>
}) {
  const champs = props.colonnes.filter((c) => !estColonneObjet(c))
  const [ligne, setLigne] = useState<LigneContact>({})
  const [essai, setEssai] = useState(false)
  const [sauvegarde, setSauvegarde] = useState(false)

  useEffect(() => {
    if (props.ouvert) {
      setLigne(props.ligneDeDepart())
      setEssai(false)
    }
  }, [props.ouvert]) // eslint-disable-line react-hooks/exhaustive-deps

  const email = (ligne.Email ?? "").trim().toLowerCase()
  const erreurEmail = !email
    ? "L'adresse e-mail est obligatoire."
    : !estEmailValide(email)
      ? "Adresse e-mail invalide."
      : props.emailsExistants.has(email)
        ? "Ce contact est déjà dans la liste."
        : ""
  const erreurCc = ccInvalide(ligne.CC ?? "") ? "Adresse invalide (sépare plusieurs adresses par ;)." : ""
  const ccCampagne = decouperAdresses(props.ccCampagne)

  async function valider(e: React.FormEvent) {
    e.preventDefault()
    setEssai(true)
    if (erreurEmail || erreurCc) return
    const propre: LigneContact = Object.fromEntries(Object.entries(ligne).map(([k, v]) => [k, (v ?? "").trim()]))
    propre.Email = email
    if (propre.CC) propre.CC = decouperAdresses(propre.CC).join("; ")
    setSauvegarde(true)
    try {
      if (await props.onAjouter(propre)) props.onFermer()
    } finally {
      setSauvegarde(false)
    }
  }

  const changer = (c: string, v: string) => setLigne((l) => ({ ...l, [c]: v }))

  return (
    <AlertDialog open={props.ouvert} onOpenChange={(o) => !o && !sauvegarde && props.onFermer()}>
      <AlertDialogContent className="data-[size=default]:max-w-lg data-[size=default]:sm:max-w-lg">
        <form onSubmit={valider} className="grid gap-4" noValidate>
          <AlertDialogHeader>
            <AlertDialogTitle>Ajouter un contact</AlertDialogTitle>
            <AlertDialogDescription>
              Il est ajouté en fin de liste et reçoit les objets communs de la campagne.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            {champs.map((c, k) => {
              const erreur = essai ? (c === "Email" ? erreurEmail : c === "CC" ? erreurCc : "") : ""
              const id = `nouveau-${c}`
              return (
                <div key={c} className={cn("grid gap-1", pleineLargeur.has(c) && "col-span-2")}>
                  <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
                    {libelles[c] ?? c}
                    {c === "Email" && <span className="text-destructive"> *</span>}
                  </label>
                  {c === "Civilite" ? (
                    <select
                      id={id}
                      value={ligne[c] ?? ""}
                      onChange={(e) => changer(c, e.target.value)}
                      className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                    >
                      <option value="" />
                      <option>Madame</option>
                      <option>Monsieur</option>
                    </select>
                  ) : (
                    <Input
                      id={id}
                      autoFocus={k === 0 || (champs[0] === "Civilite" && k === 1)}
                      type={c === "Email" ? "email" : c === "Telephone" ? "tel" : "text"}
                      value={ligne[c] ?? ""}
                      onChange={(e) => changer(c, e.target.value)}
                      aria-invalid={!!erreur || undefined}
                      placeholder={c === "CC" ? "adresse ; adresse… (facultatif)" : undefined}
                    />
                  )}
                  {erreur && <p className="text-xs text-destructive">{erreur}</p>}
                  {c === "CC" && !erreur && (
                    <p className="text-xs text-muted-foreground">
                      {ccCampagne.length
                        ? `S'ajoute à la copie de toute la campagne (${ccCampagne.join(", ")}), réglée sous le nom de la campagne.`
                        : "Mises en copie des mails de ce contact seulement. Pour mettre quelqu'un en copie de tous les mails, utilise le réglage sous le nom de la campagne."}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {props.autresModifs && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Le tableau a d'autres modifications non enregistrées : le contact y sera ajouté, puis clique sur « Enregistrer »
              en bas de l'écran.
            </p>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={sauvegarde}>Annuler</AlertDialogCancel>
            <Button type="submit" disabled={sauvegarde}>
              {sauvegarde ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
              {props.autresModifs ? "Ajouter au tableau" : "Enregistrer"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}

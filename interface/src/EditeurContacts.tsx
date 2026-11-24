import { useEffect, useMemo, useState } from "react"
import { ClipboardPasteIcon, Loader2Icon, PlusIcon, SaveIcon, Trash2Icon, TriangleAlertIcon, Undo2Icon } from "lucide-react"
import { toast } from "sonner"
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
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ImportContacts } from "@/ImportContacts"
import { NouveauContact } from "@/NouveauContact"
import { enregistrerContacts, type LigneContact } from "@/lib/api"
import { estColonneObjet, estEmailValide, objetDeCampagne } from "@/lib/apercu"
import { normaliserCivilite } from "@/lib/import"
import { cn } from "@/lib/utils"

const libelleColonne: Record<string, string> = {
  Civilite: "Civilité",
  Prenom: "Prénom",
  Nom: "Nom",
  Entreprise: "Entreprise",
  Telephone: "Téléphone",
  Email: "E-mail",
  Sujet1: "Objet Mail1",
  Sujet2: "Objet Mail2",
  Sujet3: "Objet Mail3",
  Sujet4: "Objet Mail4",
}
const largeur: Record<string, string> = {
  Civilite: "w-28",
  Prenom: "w-32",
  Nom: "w-40",
  Entreprise: "w-44",
  Telephone: "w-32",
  Email: "min-w-80",
}


const ligneVide = (colonnes: string[]): LigneContact => Object.fromEntries(colonnes.map((c) => [c, ""]))

export function EditeurContacts(props: {
  campagne: string
  colonnes: string[]
  contacts: LigneContact[]
  /** Objets communs mémorisés pour la campagne (parametres.json), donnés aux contacts ajoutés */
  objets?: (string | null)[] | null
  campagneDemarree: boolean
  /** Étapes déjà envoyées, par adresse e-mail (en minuscules), d'après le suivi Outlook */
  envois: Record<string, number[]>
  onEnregistre: () => void
  onModifie: (modifie: boolean) => void
}) {
  const { colonnes, campagneDemarree } = props
  // Les objets (Sujet1..4) ne sont pas affichés dans le tableau : objet commun dans le bloc ci-dessous, objet
  // propre à un contact dans l'onglet Textes. Ils restent dans chaque ligne et sont enregistrés tels quels.
  // La colonne CC (copie propre à un contact) n'est pas affichée non plus : la copie se règle pour toute la campagne,
  // sous son nom. Une valeur saisie dans le CSV reste enregistrée et appliquée par les scripts.
  const colonnesAffichees = colonnes.filter((c) => !estColonneObjet(c) && c !== "CC")
  const [confirmerRisques, setConfirmerRisques] = useState(false)
  const [lignes, setLignes] = useState<LigneContact[]>(props.contacts)
  const [reference, setReference] = useState(JSON.stringify(props.contacts))
  const [sauvegarde, setSauvegarde] = useState(false)
  const [aSupprimer, setASupprimer] = useState<number | null>(null)
  const [importOuvert, setImportOuvert] = useState(false)
  const [ajoutOuvert, setAjoutOuvert] = useState(false)
  // Objets communs (les plus fréquents parmi les contacts enregistrés) : donnés aux contacts ajoutés ici. Ils se
  // modifient dans l'onglet Textes des mails.
  const objets = useMemo(() => [1, 2, 3, 4].map((n) => objetDeCampagne(props.objets, props.contacts, n)), [props.objets, props.contacts])

  const modifie = JSON.stringify(lignes) !== reference
  useEffect(() => props.onModifie(modifie), [modifie]) // eslint-disable-line react-hooks/exhaustive-deps

  // Contacts modifiés ailleurs (objet d'un contact changé dans l'onglet Textes) : on reprend la version
  // enregistrée, sauf si des modifications sont en cours ici (l'onglet Textes bloque alors ses objets).
  const recu = JSON.stringify(props.contacts)
  useEffect(() => {
    if (modifie || recu === reference) return
    setLignes(props.contacts)
    setReference(recu)
  }, [recu]) // eslint-disable-line react-hooks/exhaustive-deps

  const erreurs = useMemo(
    () => lignes.map((l) => (l.Nom || l.Email || l.Sujet1 ? !estEmailValide(l.Email ?? "") : false)),
    [lignes],
  )
  const nbErreurs = erreurs.filter(Boolean).length
  const doublons = useMemo(() => {
    const vus = new Map<string, number>()
    lignes.forEach((l) => l.Email && vus.set(l.Email.trim().toLowerCase(), (vus.get(l.Email.trim().toLowerCase()) ?? 0) + 1))
    return new Set([...vus.entries()].filter(([, n]) => n > 1).map(([e]) => e))
  }, [lignes])

  /**
   * Modifications qui empêcheraient le suivi de retrouver des mails déjà envoyés : le suivi reconnaît un
   * mail par l'adresse du destinataire et par son objet (SujetN avec les variables remplacées). Changer
   * l'adresse, l'objet d'une étape envoyée, ou une valeur utilisée dans cet objet ({{NOM}}...) « perd » le mail.
   */
  const risques = useMemo(() => {
    const originales: LigneContact[] = JSON.parse(reference)
    const parLigne = new Map<number, { cols: Set<string>; etapes: number[] }>()
    lignes.forEach((l, i) => {
      const o = originales[i]
      if (!o) return // contact ajouté depuis le dernier enregistrement
      const etapes = props.envois[(o.Email ?? "").trim().toLowerCase()] ?? []
      if (etapes.length === 0) return
      const sensibles = new Set<string>(["Email"])
      for (const n of etapes) {
        sensibles.add(`Sujet${n}`)
        const objet = o[`Sujet${n}`] ?? ""
        ;(["Civilite", "Prenom", "Nom", "Entreprise"] as const).forEach((v) => objet.includes(`{{${v.toUpperCase()}}}`) && sensibles.add(v))
      }
      const cols = new Set([...sensibles].filter((c) => (l[c] ?? "").trim() !== (o[c] ?? "").trim()))
      if (cols.size) parLigne.set(i, { cols, etapes })
    })
    return parLigne
  }, [lignes, reference, props.envois])

  const modifier = (i: number, col: string, v: string) =>
    setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, [col]: v } : l)))

  function annuler() {
    setLignes(JSON.parse(reference))
  }

  const ligneAvecObjets = (): LigneContact => ({
    ...ligneVide(colonnes),
    ...Object.fromEntries(objets.map((o, k) => [`Sujet${k + 1}`, o])),
  })

  function ajouterEnMasse(nouvelles: LigneContact[]) {
    setLignes((ls) => [...ls, ...nouvelles])
    toast.success(`${nouvelles.length} contact(s) ajouté(s) en fin de liste. Enregistre pour les garder.`)
  }

  const emailsExistants = useMemo(
    () => new Set(lignes.map((l) => (l.Email ?? "").trim().toLowerCase()).filter(Boolean)),
    [lignes],
  )

  /**
   * Collage direct dans le tableau, comme dans Excel : un bloc de plusieurs cellules (lignes / colonnes
   * séparées par des retours et des tabulations) remplit le tableau à partir de la case choisie.
   */
  function collerDansTableau(e: React.ClipboardEvent, i: number, col: string) {
    const texte = e.clipboardData.getData("text/plain").replace(/\r/g, "").replace(/\n$/, "")
    if (!texte.includes("\t") && !texte.includes("\n")) return // simple valeur : collage normal
    e.preventDefault()
    const blocs = texte.split("\n").map((l) => l.split("\t"))
    const depart = colonnesAffichees.indexOf(col)
    setLignes((ls) => {
      const r = [...ls]
      blocs.forEach((valeurs, k) => {
        while (r.length <= i + k) r.push(ligneAvecObjets())
        const ligne = { ...r[i + k] }
        valeurs.forEach((v, j) => {
          const c = colonnesAffichees[depart + j]
          if (!c) return
          let val = v.trim()
          if (c === "Civilite") val = normaliserCivilite(val)
          if (c === "Email") val = val.toLowerCase()
          ligne[c] = val
        })
        r[i + k] = ligne
      })
      return r
    })
    toast.success(`${blocs.length} ligne(s) collée(s) à partir de la ligne ${i + 1}`)
  }

  /** Entrée : passe à la même case de la ligne suivante (en créant une ligne au besoin) */
  function toucheCase(e: React.KeyboardEvent, i: number, col: string) {
    if (e.key !== "Enter") return
    e.preventDefault()
    const suivante = i + 1
    if (suivante >= lignes.length) setLignes((ls) => [...ls, ligneAvecObjets()])
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-case="${suivante}-${col}"]`)
      el?.focus()
      if (el instanceof HTMLInputElement) el.select()
    }, 0)
  }

  async function enregistrer(forcer = false, liste = lignes): Promise<boolean> {
    if (risques.size > 0 && !forcer) {
      setConfirmerRisques(true)
      return false
    }
    setConfirmerRisques(false)
    setSauvegarde(true)
    try {
      const r = await enregistrerContacts(props.campagne, colonnes, liste)
      const propres = liste.filter((l) => Object.values(l).some((v) => v.trim()))
      setLignes(propres)
      setReference(JSON.stringify(propres))
      toast.success(`${r.nb} contact(s) enregistré(s)`)
      props.onEnregistre()
      return true
    } catch (e) {
      toast.error((e as Error).message)
      return false
    } finally {
      setSauvegarde(false)
    }
  }

  /**
   * Formulaire « Ajouter un contact » : enregistré tout de suite si le tableau n'a pas d'autre modification en
   * cours ; sinon ajouté au tableau, enregistré avec le reste.
   */
  async function ajouterUnContact(contact: LigneContact) {
    const nouveau = { ...ligneAvecObjets(), ...contact }
    if (!modifie) return enregistrer(true, [...lignes, nouveau])
    setLignes((ls) => [...ls, nouveau])
    toast.success("Contact ajouté en fin de liste. Enregistre pour le garder.")
    return true
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground">
          Astuce : colle un bloc copié depuis Excel directement dans une case du tableau. <kbd>Entrée</kbd> passe à la ligne
          suivante.
        </p>
        <div className="flex-1" />
        <Button onClick={() => setImportOuvert(true)}><ClipboardPasteIcon /> Ajouter en masse</Button>
        <Button variant="outline" onClick={() => setAjoutOuvert(true)}>
          <PlusIcon /> Ajouter un contact
        </Button>
      </div>

      {(nbErreurs > 0 || doublons.size > 0) && (
        <p className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-300">
          <TriangleAlertIcon className="size-4" />
          {nbErreurs > 0 && `${nbErreurs} adresse(s) e-mail invalide(s) ou manquante(s), en rouge. `}
          {doublons.size > 0 && `${doublons.size} adresse(s) en double. `}
        </p>
      )}

      {risques.size > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="flex items-center gap-1.5 font-medium">
            <TriangleAlertIcon className="size-4" /> Attention : ces contacts ont déjà reçu des mails
          </p>
          <p className="mt-1">
            Le suivi retrouve un mail grâce à l'adresse et à l'objet. En les modifiant (cases orange), les mails déjà envoyés ne
            seront plus reconnus : le contact repassera en « Mail1 à créer » et pourrait recevoir le même mail deux fois.
          </p>
          <ul className="mt-1 list-disc pl-5">
            {[...risques.entries()].map(([i, r]) => (
              <li key={i}>
                {lignes[i].Nom || lignes[i].Email} : Mail{r.etapes.join(", Mail")} déjà envoyé(s), modifié :{" "}
                {[...r.cols].map((c) => libelleColonne[c] ?? c).join(", ")}
              </li>
            ))}
          </ul>
          <p className="mt-1">
            Pour écrire à une autre personne, ajoute plutôt un nouveau contact en fin de liste. Sinon, clique sur « Annuler » dans la barre
            du bas.
          </p>
        </div>
      )}

      <Card className="py-0">
        <div className="overflow-x-auto">
          <table className="w-max min-w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="w-10 px-2 py-2 font-medium">#</th>
                {colonnesAffichees.map((c) => (
                  <th key={c} className={cn("px-1 py-2 font-medium", largeur[c] ?? "w-72")}>{libelleColonne[c] ?? c}</th>
                ))}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lignes.length === 0 && (
                <tr>
                  <td colSpan={colonnesAffichees.length + 2} className="py-10 pl-4 text-left text-muted-foreground">
                    Aucun contact. Clique sur « Ajouter en masse » pour coller une liste depuis Excel ou Outlook.
                  </td>
                </tr>
              )}
              {lignes.map((l, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-2 text-xs text-muted-foreground tabular-nums">{i + 1}</td>
                  {colonnesAffichees.map((c) => {
                    const invalide = c === "Email" && (erreurs[i] || doublons.has((l.Email ?? "").trim().toLowerCase()))
                    const risque = risques.get(i)?.cols.has(c)
                    return (
                      <td
                        key={c}
                        className={cn("px-1 py-1", risque && "bg-amber-100 dark:bg-amber-950")}
                        title={risque ? "Modifié alors que des mails sont déjà partis : le suivi ne les retrouvera plus" : undefined}
                      >
                        {c === "Civilite" ? (
                          <select
                            data-case={`${i}-${c}`}
                            onKeyDown={(e) => toucheCase(e, i, c)}
                            onPaste={(e) => collerDansTableau(e, i, c)}
                            className="h-7 w-full rounded-md border border-transparent bg-transparent px-1 text-sm hover:border-input focus:border-ring"
                            value={l[c] ?? ""}
                            onChange={(e) => modifier(i, c, e.target.value)}
                          >
                            <option value="" />
                            <option>Madame</option>
                            <option>Monsieur</option>
                            {l[c] && !["Madame", "Monsieur"].includes(l[c]) && <option>{l[c]}</option>}
                          </select>
                        ) : (
                          <Input
                            data-case={`${i}-${c}`}
                            onKeyDown={(e) => toucheCase(e, i, c)}
                            onPaste={(e) => collerDansTableau(e, i, c)}
                            value={l[c] ?? ""}
                            onChange={(e) => modifier(i, c, e.target.value)}
                            aria-invalid={invalide || undefined}
                            className="h-7 border-transparent bg-transparent px-1.5 shadow-none hover:border-input"
                          />
                        )}
                      </td>
                    )
                  })}
                  <td className="px-1">
                    <Button size="icon-xs" variant="ghost" onClick={() => setASupprimer(i)} title="Supprimer ce contact">
                      <Trash2Icon />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-muted-foreground">
        Ajoute les nouveaux contacts en fin de liste et ne réordonne pas les lignes d'une campagne lancée : l'objet de chaque mail
        dépend de la position du contact.
      </p>
      {/* Barre d'enregistrement, à droite sous le tableau, sans cadre : reste visible en bas de l'écran tant qu'il y a des modifications */}
      {/* Barre d'enregistrement flottante, alignée sur la page : reste visible en bas de l'écran tant qu'il y a des modifications */}
      {modifie && (
        <div className="sticky bottom-4 z-10 ml-auto flex w-fit flex-wrap items-center justify-end gap-3 rounded-lg bg-background/95 py-1 pl-3 backdrop-blur">
          <span className="flex items-center gap-2 text-sm font-medium">
            <span className="size-2 rounded-full bg-amber-500" /> Modifications non enregistrées
          </span>
          <Button variant="ghost" onClick={annuler} disabled={sauvegarde}>
            <Undo2Icon /> Annuler
          </Button>
          <Button onClick={() => enregistrer()} disabled={sauvegarde}>
            {sauvegarde ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Enregistrer
          </Button>
        </div>
      )}

      <AlertDialog open={aSupprimer !== null} onOpenChange={(o) => !o && setASupprimer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer {aSupprimer !== null && (lignes[aSupprimer]?.Nom || "ce contact")} ?</AlertDialogTitle>
            <AlertDialogDescription>
              {campagneDemarree
                ? "La campagne est lancée : supprimer une ligne décale les contacts suivants. Pour arrêter les relances d'un contact, vide plutôt ses objets Mail2 à Mail4."
                : "Le contact sera retiré de la liste à l'enregistrement."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => {
                setLignes((ls) => ls.filter((_, j) => j !== aSupprimer))
                setASupprimer(null)
              }}
            >
              Supprimer
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmerRisques} onOpenChange={(o) => !o && setConfirmerRisques(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enregistrer quand même ?</AlertDialogTitle>
            <AlertDialogDescription>
              {risques.size} contact(s) déjà contacté(s) ont une adresse ou un objet modifié. Les mails déjà envoyés ne seront
              plus reconnus par le suivi, et une nouvelle création de brouillons pourrait leur renvoyer le même mail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Revenir aux contacts</AlertDialogCancel>
            <Button variant="destructive" onClick={() => enregistrer(true)}>Enregistrer quand même</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <NouveauContact
        ouvert={ajoutOuvert}
        onFermer={() => setAjoutOuvert(false)}
        colonnes={colonnes}
        ligneDeDepart={ligneAvecObjets}
        emailsExistants={emailsExistants}
        autresModifs={modifie}
        onAjouter={ajouterUnContact}
      />

      <ImportContacts
        ouvert={importOuvert}
        onFermer={() => setImportOuvert(false)}
        colonnesFichier={colonnes}
        objets={objets}
        emailsExistants={emailsExistants}
        onAjouter={ajouterEnMasse}
      />
    </div>
  )
}

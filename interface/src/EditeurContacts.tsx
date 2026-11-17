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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { enregistrerContacts, type LigneContact } from "@/lib/api"
import { estEmailValide } from "@/lib/apercu"
import { cn } from "@/lib/utils"

const ordreCollage = ["Civilite", "Nom", "Entreprise", "Telephone", "Email", "Sujet1", "Sujet2", "Sujet3", "Sujet4"]
const libelleColonne: Record<string, string> = {
  Civilite: "Civilité",
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
  Nom: "w-40",
  Entreprise: "w-44",
  Telephone: "w-32",
  Email: "w-64",
}

const ligneVide = (colonnes: string[]): LigneContact => Object.fromEntries(colonnes.map((c) => [c, ""]))
const plusFrequent = (valeurs: string[]) => {
  const n = new Map<string, number>()
  valeurs.filter(Boolean).forEach((v) => n.set(v, (n.get(v) ?? 0) + 1))
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ""
}

export function EditeurContacts(props: {
  campagne: string
  colonnes: string[]
  contacts: LigneContact[]
  campagneDemarree: boolean
  /** Étapes déjà envoyées, par adresse e-mail (en minuscules), d'après le suivi Outlook */
  envois: Record<string, number[]>
  onEnregistre: () => void
  onModifie: (modifie: boolean) => void
}) {
  const { colonnes, campagneDemarree } = props
  const [confirmerRisques, setConfirmerRisques] = useState(false)
  const [lignes, setLignes] = useState<LigneContact[]>(props.contacts)
  const [reference, setReference] = useState(JSON.stringify(props.contacts))
  const [sauvegarde, setSauvegarde] = useState(false)
  const [aSupprimer, setASupprimer] = useState<number | null>(null)
  const [collage, setCollage] = useState<string | null>(null)
  const [objets, setObjets] = useState<string[]>(() =>
    [1, 2, 3, 4].map((n) => plusFrequent(props.contacts.map((c) => c[`Sujet${n}`] ?? ""))),
  )

  const modifie = JSON.stringify(lignes) !== reference
  useEffect(() => props.onModifie(modifie), [modifie]) // eslint-disable-line react-hooks/exhaustive-deps

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
        ;(["Civilite", "Nom", "Entreprise"] as const).forEach((v) => objet.includes(`{{${v.toUpperCase()}}}`) && sensibles.add(v))
      }
      const cols = new Set([...sensibles].filter((c) => (l[c] ?? "").trim() !== (o[c] ?? "").trim()))
      if (cols.size) parLigne.set(i, { cols, etapes })
    })
    return parLigne
  }, [lignes, reference, props.envois])

  const modifier = (i: number, col: string, v: string) =>
    setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, [col]: v } : l)))

  /** Objet commun d'une étape : appliqué tout de suite aux contacts qui avaient l'objet commun ou aucun objet */
  function changerObjet(n: number, valeur: string) {
    const col = `Sujet${n}`
    const ancien = objets[n - 1]
    setObjets((o) => o.map((x, k) => (k === n - 1 ? valeur : x)))
    setLignes((ls) => ls.map((l) => ((l[col] ?? "") === ancien || !(l[col] ?? "") ? { ...l, [col]: valeur } : l)))
  }

  /** Force l'objet commun aussi sur les contacts qui avaient un objet personnalisé */
  function appliquerObjet(n: number) {
    setLignes((ls) => ls.map((l) => ({ ...l, [`Sujet${n}`]: objets[n - 1] })))
  }

  const personnalises = (n: number) => lignes.filter((l) => (l[`Sujet${n}`] ?? "") !== objets[n - 1]).length

  function annuler() {
    const ref: LigneContact[] = JSON.parse(reference)
    setLignes(ref)
    setObjets([1, 2, 3, 4].map((n) => plusFrequent(ref.map((c) => c[`Sujet${n}`] ?? ""))))
  }

  function coller(texte: string) {
    const nouvelles = texte
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => l.split(l.includes("\t") ? "\t" : ";").map((v) => v.trim()))
      .filter((v) => !(v[0]?.toLowerCase().startsWith("civilit") && v[1]?.toLowerCase() === "nom")) // en-tête ignorée
      .map((v) => {
        const l = ligneVide(colonnes)
        ordreCollage.forEach((c, k) => (l[c] = v[k] ?? ""))
        // objets vides : on reprend les objets communs
        ;[1, 2, 3, 4].forEach((n) => !l[`Sujet${n}`] && (l[`Sujet${n}`] = objets[n - 1]))
        return l
      })
    setLignes((ls) => [...ls, ...nouvelles])
    setCollage(null)
    toast.success(`${nouvelles.length} contact(s) ajouté(s) en fin de liste. Pense à enregistrer.`)
  }

  async function enregistrer(forcer = false) {
    if (risques.size > 0 && !forcer) {
      setConfirmerRisques(true)
      return
    }
    setConfirmerRisques(false)
    setSauvegarde(true)
    try {
      const r = await enregistrerContacts(props.campagne, colonnes, lignes)
      const propres = lignes.filter((l) => Object.values(l).some((v) => v.trim()))
      setLignes(propres)
      setReference(JSON.stringify(propres))
      toast.success(`${r.nb} contact(s) enregistré(s)`)
      props.onEnregistre()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSauvegarde(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm">Objets des mails</CardTitle>
          <CardDescription>
            L'objet saisi ici s'applique directement à tous les contacts. Les variables {"{{CIVILITE}}"}, {"{{NOM}}"} et{" "}
            {"{{ENTREPRISE}}"} sont remplacées pour chaque contact. Un objet vide arrête la séquence à cette étape.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {campagneDemarree && (
            <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
              <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
              Des mails sont déjà partis : ne modifie pas l'objet d'une étape déjà envoyée, le suivi ne retrouverait plus ces mails.
            </p>
          )}
          {[1, 2, 3, 4].map((n) => {
            const autres = personnalises(n)
            // Le suivi reconnait une etape a l'objet du mail : un objet identique a celui d'une etape
            // precedente (ou qui en est le debut) rendrait les deux mails indiscernables.
            const objet = objets[n - 1].trim()
            const conflit = objet
              ? [1, 2, 3, 4].find((m) => m < n && objets[m - 1].trim() && objets[m - 1].trim().startsWith(objet))
              : undefined
            return (
              <div key={n} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="w-24 shrink-0 text-xs text-muted-foreground">Mail{n}</span>
                <Input
                  className="min-w-0 flex-1"
                  value={objets[n - 1]}
                  onChange={(e) => changerObjet(n, e.target.value)}
                  aria-invalid={conflit ? true : undefined}
                  placeholder={n === 1 ? "[{{ENTREPRISE}} / Wavestone] Échangeons sur vos priorités" : "Laisser vide pour ne pas faire cette relance"}
                />
                {conflit && (
                  <span className="w-full pl-26 text-xs text-destructive">
                    {objets[conflit - 1].trim() === objet ? "Identique à" : "Correspond au début de"} l'objet Mail{conflit} : l'outil
                    ne pourrait pas distinguer les deux mails (le Mail{n} serait considéré comme déjà envoyé). Donne-lui un objet
                    différent, par exemple en ajoutant « Re: » devant.
                  </span>
                )}
                {autres > 0 && lignes.length > 0 && (
                  <span className="w-full pl-26 text-xs text-muted-foreground">
                    {autres} contact(s) ont un autre objet pour Mail{n}.{" "}
                    <button className="underline underline-offset-2 hover:text-foreground" onClick={() => appliquerObjet(n)}>
                      Leur appliquer celui-ci
                    </button>
                  </span>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1" />
        <Button variant="outline" onClick={() => setCollage("")}><ClipboardPasteIcon /> Coller depuis Excel</Button>
        <Button variant="outline" onClick={() => setLignes((ls) => [...ls, { ...ligneVide(colonnes), ...Object.fromEntries(objets.map((o, k) => [`Sujet${k + 1}`, o])) }])}>
          <PlusIcon /> Ajouter un contact
        </Button>
      </div>

      {(nbErreurs > 0 || doublons.size > 0) && (
        <p className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-300">
          <TriangleAlertIcon className="size-4" />
          {nbErreurs > 0 && `${nbErreurs} adresse(s) e-mail invalide(s) ou manquante(s), en rouge. `}
          {doublons.size > 0 && `${doublons.size} adresse(s) en double.`}
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
                {colonnes.map((c) => (
                  <th key={c} className={cn("px-1 py-2 font-medium", largeur[c] ?? "w-72")}>{libelleColonne[c] ?? c}</th>
                ))}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lignes.length === 0 && (
                <tr>
                  <td colSpan={colonnes.length + 2} className="py-10 pl-4 text-left text-muted-foreground">
                    Aucun contact. Ajoute-les un par un, ou colle-les depuis Excel.
                  </td>
                </tr>
              )}
              {lignes.map((l, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-2 text-xs text-muted-foreground tabular-nums">{i + 1}</td>
                  {colonnes.map((c) => {
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

      {/* Barre d'enregistrement : reste visible en bas de l'écran tant qu'il y a des modifications */}
      {modifie && (
        <div className="sticky bottom-0 z-10 -mx-6 -mb-6 flex flex-wrap items-center gap-3 border-t bg-background/95 px-6 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur">
          <span className="flex items-center gap-2 text-sm font-medium">
            <span className="size-2 rounded-full bg-amber-500" /> Modifications non enregistrées
          </span>
          <div className="flex-1" />
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

      <AlertDialog open={collage !== null} onOpenChange={(o) => !o && setCollage(null)}>
        <AlertDialogContent className="data-[size=default]:max-w-2xl data-[size=default]:sm:max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Coller des contacts depuis Excel</AlertDialogTitle>
            <AlertDialogDescription>
              Copie les lignes dans Excel puis colle-les ici. Ordre des colonnes : Civilité, Nom, Entreprise, Téléphone, E-mail (puis
              éventuellement les 4 objets). Sans objets, ceux définis plus haut sont utilisés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            autoFocus
            value={collage ?? ""}
            onChange={(e) => setCollage(e.target.value)}
            className="min-h-48 font-mono text-xs"
            placeholder={"Madame\tMartin\tACME\t\tclaire.martin@acme.fr"}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <Button disabled={!collage?.trim()} onClick={() => collage && coller(collage)}>Ajouter à la liste</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
